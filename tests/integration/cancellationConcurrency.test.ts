import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { CancellationRequestRepository } from '../../backend/src/modules/payment/repositories/cancellationRequest.repository.js';
import { RefundSettlementRepository } from '../../backend/src/modules/payment/repositories/refundSettlement.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';

describe('Phase 6 Step 10 — Cancellation & Refund Concurrency & Idempotency Engine (PostgreSQL Integration)', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let customer1Token = '';
  let customer1Id = '';
  let adminToken = '';
  let adminId = '';

  let departureRepo: DepartureRepository;
  let bookingRepo: BookingRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let cancellationRequestRepo: CancellationRequestRepository;
  let refundSettlementRepo: RefundSettlementRepository;
  let depId: string;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      const appInstance = await createApp({ config });
      app = appInstance.app;
      db = appInstance.db;

      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        await seedAll();

        departureRepo = new DepartureRepository(db);
        bookingRepo = new BookingRepository(db);
        paymentTxRepo = new PaymentTransactionRepository(db);
        cancellationRequestRepo = new CancellationRequestRepository(db);
        refundSettlementRepo = new RefundSettlementRepository(db);

        customer1Id = '99999999-9999-9999-9999-999999999999';
        const customer1Email = `conc_cust1_${Date.now()}@example.com`;
        adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const adminEmail = `conc_admin_${Date.now()}@example.com`;

        // Provision users in DB
        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES
             ($1, $2, '$argon2id$mockhash', 'Conc Cust', 'CUSTOMER', true),
             ($3, $4, '$argon2id$mockhash', 'Conc Admin', 'ADMIN', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;`,
          [customer1Id, customer1Email, adminId, adminEmail],
        );

        const { JwtSecurity } = await import('../../shared/src/security/jwt.js');
        customer1Token = JwtSecurity.sign(
          { userId: customer1Id, email: customer1Email, role: 'CUSTOMER', sessionId: 's1' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );
        adminToken = JwtSecurity.sign(
          { userId: adminId, email: adminEmail, role: 'ADMIN', sessionId: 's2' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );

        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        const pkgId = pkgRes.rows[0]!.id;

        const date40Str = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const return40Str = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const dep = await departureRepo.create({
          packageId: pkgId,
          departureDate: date40Str,
          returnDate: return40Str,
          totalSeatCapacity: 50,
        });
        depId = dep.id;
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.close();
  });

  async function createConfirmedBookingWithPayment(
    customerId: string,
    departureId: string,
    amount: number = 100000,
    partySize: number = 2,
  ) {
    const bookingRef = `BK-CONC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const dep = await departureRepo.findById(departureId);

    const bookingRes = await db.query<{ id: string }>(
      `INSERT INTO bookings (
        booking_reference, customer_id, departure_id, status, party_size, adult_count, child_count,
        total_price, currency, price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
        primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
      ) VALUES (
        $1, $2, $3, 'CONFIRMED', $4, $4, 0,
        $5, 'INR', '{"basePrice": 100000}', '{"title": "Goa Tour"}', $6, '{"days": []}',
        'Conc Owner', 'conc@example.com', '+919876543210', NOW()
      ) RETURNING id;`,
      [
        bookingRef,
        customerId,
        departureId,
        partySize,
        amount,
        JSON.stringify({ departureDate: dep!.departureDate, returnDate: dep!.returnDate }),
      ],
    );
    const bookingId = bookingRes.rows[0]!.id;

    // Increment booked seats to simulate confirmation
    await db.query(
      `UPDATE departure_schedules SET booked_seats = booked_seats + $2, updated_at = NOW() WHERE id = $1;`,
      [departureId, partySize],
    );

    // Create successful payment transaction

    const payment = await paymentTxRepo.create({
      bookingId,
      provider: 'MOCK',
      gatewayOrderId: `order_mock_${bookingRef}`,
      gatewayPaymentId: `pay_mock_${bookingRef}`,
      amount,
      currency: 'INR',
      status: 'SUCCESS',
      idempotencyKey: `idem_pay_${bookingRef}`,
    });

    return { bookingId, bookingRef, paymentId: payment.id };
  }

  it('Matrix A: Two simultaneous customer cancellation requests on the same booking -> exactly 1 succeeds, 1 gets conflict', async () => {
    if (!isDbAvailable) return;

    const { bookingRef } = await createConfirmedBookingWithPayment(customer1Id, depId, 100000, 2);

    const [res1, res2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Concurrent request A' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Concurrent request B' },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    // Verify exactly 1 cancellation request was created
    const booking = await bookingRepo.findByReference(bookingRef);
    const requests = await cancellationRequestRepo.findByBookingId(booking!.id);
    expect(requests.length).toBe(1);
    expect(requests[0]!.status).toBe('PENDING_APPROVAL');
  });

  it('Matrix B: Two simultaneous admin authorizations on the same cancellation request -> exactly 1 succeeds, 1 fails safely', async () => {
    if (!isDbAvailable) return;

    const { bookingRef, bookingId, paymentId } = await createConfirmedBookingWithPayment(
      customer1Id,
      depId,
      100000,
      3,
    );

    const reqRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bookingRef}/cancellation`,
      headers: { authorization: `Bearer ${customer1Token}` },
      payload: { reason: 'Admin concurrency test' },
    });
    const cancellationId = reqRes.json().data.id;

    const depBefore = await departureRepo.findById(depId);
    const bookedSeatsBefore = depBefore!.bookedSeats;

    const [authRes1, authRes2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Admin 1 Auth' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Admin 2 Auth' },
      }),
    ]);

    const statuses = [authRes1.statusCode, authRes2.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);

    // Verify booking is CANCELLED exactly once
    const updatedBooking = await bookingRepo.findById(bookingId);
    expect(updatedBooking!.status).toBe('CANCELLED');

    // Verify departure seats were decremented exactly once (3 seats)
    const depAfter = await departureRepo.findById(depId);
    expect(depAfter!.bookedSeats).toBe(bookedSeatsBefore - 3);

    // Verify payment transaction is REFUNDED exactly once
    const payment = await paymentTxRepo.findById(paymentId);
    expect(payment!.status).toBe('REFUNDED');

    // Verify refund settlement record created exactly once
    const settlements = await refundSettlementRepo.findByCancellationRequestId(cancellationId);
    expect(settlements.length).toBe(1);
    expect(settlements[0]!.settlementStatus).toBe('SETTLED');
  });

  it('Matrix C: Authorization vs Rejection race on the same cancellation request -> exactly 1 wins', async () => {
    if (!isDbAvailable) return;

    const { bookingRef, bookingId } = await createConfirmedBookingWithPayment(
      customer1Id,
      depId,
      100000,
      2,
    );

    const reqRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bookingRef}/cancellation`,
      headers: { authorization: `Bearer ${customer1Token}` },
      payload: { reason: 'Race authorization vs rejection' },
    });
    const cancellationId = reqRes.json().data.id;

    const [resAuth, resReject] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Authorize race' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Reject race' },
      }),
    ]);

    const statuses = [resAuth.statusCode, resReject.statusCode];
    const successCount = statuses.filter((s) => s === 200).length;
    expect(successCount).toBe(1); // Exactly one operation wins

    const finalReq = await cancellationRequestRepo.findById(cancellationId);
    expect(['COMPLETED', 'REJECTED']).toContain(finalReq!.status);

    const finalBooking = await bookingRepo.findById(bookingId);
    if (finalReq!.status === 'COMPLETED') {
      expect(finalBooking!.status).toBe('CANCELLED');
    } else {
      expect(finalBooking!.status).toBe('CONFIRMED');
    }
  });
});
