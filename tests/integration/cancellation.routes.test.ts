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
import { RefundSettlementRepository } from '../../backend/src/modules/payment/repositories/refundSettlement.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';

import { cancellationRequestSchema, refundSettlementSchema } from '../../shared/src/index.js';

describe('Phase 6 Step 10 — Cancellation & Refund REST APIs (Integration & Security)', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let customer1Token = '';
  let customer1Id = '';
  let customer2Token = '';
  let customer2Id = '';
  let adminToken = '';
  let adminId = '';

  let departureRepo: DepartureRepository;
  let bookingRepo: BookingRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let refundSettlementRepo: RefundSettlementRepository;

  let depId40Days: string;
  let depId20Days: string;
  let depId5Days: string;

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
        refundSettlementRepo = new RefundSettlementRepository(db);

        customer1Id = '66666666-6666-6666-6666-666666666666';
        const customer1Email = `cancel_cust1_${Date.now()}@example.com`;
        customer2Id = '77777777-7777-7777-7777-777777777777';
        const customer2Email = `cancel_cust2_${Date.now()}@example.com`;
        adminId = '88888888-8888-8888-8888-888888888888';
        const adminEmail = `cancel_admin_${Date.now()}@example.com`;

        // Provision users in DB
        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES
             ($1, $2, '$argon2id$mockhash', 'Alice Cancel Owner', 'CUSTOMER', true),
             ($3, $4, '$argon2id$mockhash', 'Bob Attacker', 'CUSTOMER', true),
             ($5, $6, '$argon2id$mockhash', 'Admin Super', 'ADMIN', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;`,
          [customer1Id, customer1Email, customer2Id, customer2Email, adminId, adminEmail],
        );

        const { JwtSecurity } = await import('../../shared/src/security/jwt.js');
        customer1Token = JwtSecurity.sign(
          { userId: customer1Id, email: customer1Email, role: 'CUSTOMER', sessionId: 's1' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );
        customer2Token = JwtSecurity.sign(
          { userId: customer2Id, email: customer2Email, role: 'CUSTOMER', sessionId: 's2' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );
        adminToken = JwtSecurity.sign(
          { userId: adminId, email: adminEmail, role: 'ADMIN', sessionId: 's3' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );

        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        const pkgId = pkgRes.rows[0]!.id;

        // Provision departures at 40 days, 20 days, and 5 days ahead
        const date40Str = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const return40Str = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const dep40 = await departureRepo.create({
          packageId: pkgId,
          departureDate: date40Str,
          returnDate: return40Str,
          totalSeatCapacity: 100,
        });
        depId40Days = dep40.id;

        const date20Str = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const return20Str = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const dep20 = await departureRepo.create({
          packageId: pkgId,
          departureDate: date20Str,
          returnDate: return20Str,
          totalSeatCapacity: 100,
        });
        depId20Days = dep20.id;

        const date5Str = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const return5Str = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]!;
        const dep5 = await departureRepo.create({
          packageId: pkgId,
          departureDate: date5Str,
          returnDate: return5Str,
          totalSeatCapacity: 100,
        });
        depId5Days = dep5.id;
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
    customGatewayPaymentId?: string,
  ) {
    const bookingRef = `BK-CNCL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const dep = await departureRepo.findById(departureId);

    const bookingRes = await db.query<{ id: string }>(
      `INSERT INTO bookings (
        booking_reference, customer_id, departure_id, status, party_size, adult_count, child_count,
        total_price, currency, price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
        primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
      ) VALUES (
        $1, $2, $3, 'CONFIRMED', $4, $4, 0,
        $5, 'INR', '{"basePrice": 100000}', '{"title": "Goa Tour"}', $6, '{"days": []}',
        'Alice Cancel Owner', 'alice@example.com', '+919876543210', NOW()
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
    const gatewayPaymentId = customGatewayPaymentId ?? `pay_mock_${bookingRef}`;

    const payment = await paymentTxRepo.create({
      bookingId,
      provider: 'MOCK',
      gatewayOrderId: `order_mock_${bookingRef}`,
      gatewayPaymentId,
      amount,
      currency: 'INR',
      status: 'SUCCESS',
      idempotencyKey: `idem_pay_${bookingRef}`,
    });

    return { bookingId, bookingRef, paymentId: payment.id };
  }

  describe('Customer Cancellation Request (POST /api/v1/bookings/:bookingReference/cancellation)', () => {
    it('should reject unauthenticated request with 401', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings/BK-NONEXISTENT/cancellation',
        payload: { reason: 'Want to cancel' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject when booking belongs to another customer with 404 (IDOR protection)', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      // Customer 2 attempts to cancel Customer 1's booking
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer2Token}` },
        payload: { reason: 'Unauthorized cancellation attempt' },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should create cancellation request for owned booking with 90% refund (> 30 days)', async () => {
      if (!isDbAvailable) return;

      const { bookingRef, bookingId } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000, // ₹1,000.00
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Schedule conflict with work' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.bookingId).toBe(bookingId);
      expect(body.data.status).toBe('PENDING_APPROVAL');
      expect(body.data.calculatedRefundAmount).toBe(90000); // 90% of 100000
      expect(body.data.calculatedPenaltyAmount).toBe(10000); // 10% fee
      expect(body.data.cancellationReason).toBe('Schedule conflict with work');

      cancellationRequestSchema.parse(body.data);
    });

    it('should create cancellation request with 50% refund (15-30 days)', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId20Days,
        80000, // ₹800.00
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Medical emergency' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.status).toBe('PENDING_APPROVAL');
      expect(body.data.calculatedRefundAmount).toBe(40000); // 50%
      expect(body.data.calculatedPenaltyAmount).toBe(40000); // 50%
    });

    it('should create cancellation request with 0% refund (< 7 days)', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId5Days,
        50000,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Last minute cancellation' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.status).toBe('PENDING_APPROVAL');
      expect(body.data.calculatedRefundAmount).toBe(0); // 0%
      expect(body.data.calculatedPenaltyAmount).toBe(50000); // 100%
    });

    it('should reject duplicate cancellation request on the same booking with 409 CONFLICT', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      // First request
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Initial request' },
      });
      expect(res1.statusCode).toBe(201);

      // Second duplicate request
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Duplicate attempt' },
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json().error.code).toBe('CONCURRENT_MUTATION_CONFLICT');
    });

    it('should reject client-forged financial fields in request body with 400', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: {
          reason: 'Forged fields attempt',
          calculatedRefundAmount: 99999999,
          status: 'COMPLETED',
          authorizedBy: customer1Id,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Cancellation Query (GET /api/v1/bookings/:bookingReference/cancellation)', () => {
    it('should allow customer to view their cancellation status and settlements', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Need to review details' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.request.status).toBe('PENDING_APPROVAL');
      expect(Array.isArray(body.data.settlements)).toBe(true);
    });

    it('should reject non-owner customer query with 404 (IDOR protection)', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Owner cancellation' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer2Token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Admin Cancellation Review & Queue (GET /api/v1/admin/cancellations)', () => {
    it('should reject non-admin users with 403', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cancellations',
        headers: { authorization: `Bearer ${customer1Token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return paginated cancellation requests for admin', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cancellations?page=1&limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
    });
  });

  describe('Admin Rejection (POST /api/v1/admin/cancellations/:cancellationId/reject)', () => {
    it('should reject non-admin access with 403', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cancellations/00000000-0000-0000-0000-000000000000/reject',
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { adminNotes: 'Hacker note' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject cancellation request, keep booking CONFIRMED, and not release seats', async () => {
      if (!isDbAvailable) return;

      const { bookingRef, bookingId } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
        2,
      );

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Test rejection' },
      });
      const cancellationId = reqRes.json().data.id;

      const depBefore = await departureRepo.findById(depId40Days);
      const bookedSeatsBefore = depBefore!.bookedSeats;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Special non-refundable fare condition' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('REJECTED');
      expect(body.data.adminNotes).toBe('Special non-refundable fare condition');

      // Verify booking remains CONFIRMED
      const booking = await bookingRepo.findById(bookingId);
      expect(booking!.status).toBe('CONFIRMED');

      // Verify seats were NOT decremented
      const depAfter = await departureRepo.findById(depId40Days);
      expect(depAfter!.bookedSeats).toBe(bookedSeatsBefore);
    });
  });

  describe('Admin Authorization & Gateway Refund Settlement (POST /api/v1/admin/cancellations/:cancellationId/authorize)', () => {
    it('should authorize cancellation, execute refund, cancel booking, release seats, and transition payment to REFUNDED', async () => {
      if (!isDbAvailable) return;

      const { bookingRef, bookingId, paymentId } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
        2,
      );

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Authorized workflow test' },
      });
      const cancellationId = reqRes.json().data.id;

      const depBefore = await departureRepo.findById(depId40Days);
      const bookedSeatsBefore = depBefore!.bookedSeats;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Full authorization approved' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.cancellation.status).toBe('COMPLETED');
      expect(body.data.bookingStatus).toBe('CANCELLED');
      expect(body.data.settlement.settlementStatus).toBe('SETTLED');
      expect(body.data.settlement.refundAmount).toBe(90000);

      // Verify booking state in DB
      const booking = await bookingRepo.findById(bookingId);
      expect(booking!.status).toBe('CANCELLED');
      expect(booking!.cancelledAt).toBeTruthy();

      // Verify departure booked seats were decremented exactly once
      const depAfter = await departureRepo.findById(depId40Days);
      expect(depAfter!.bookedSeats).toBe(bookedSeatsBefore - 2);

      // Verify payment transaction in DB is REFUNDED
      const payment = await paymentTxRepo.findById(paymentId);
      expect(payment!.status).toBe('REFUNDED');

      // Verify refund settlement record
      const settlements = await refundSettlementRepo.findByCancellationRequestId(cancellationId);
      expect(settlements.length).toBe(1);
      expect(settlements[0]!.settlementStatus).toBe('SETTLED');
      expect(settlements[0]!.refundAmount).toBe(90000);
      refundSettlementSchema.parse({
        ...settlements[0],
        createdAt: settlements[0]!.createdAt.toISOString(),
        processedAt: settlements[0]!.processedAt?.toISOString() ?? null,
      });
    });

    it('should reject re-authorizing an already COMPLETED cancellation request with 400', async () => {
      if (!isDbAvailable) return;

      const { bookingRef } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId40Days,
        100000,
      );

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Double authorization test' },
      });
      const cancellationId = reqRes.json().data.id;

      // Authorize once
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res1.statusCode).toBe(200);

      // Attempt second authorization
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error.code).toBe('REFUND_INVALID_STATE');
    });

    it('should handle zero-refund cancellations (100% penalty) without gateway failure', async () => {
      if (!isDbAvailable) return;

      const { bookingRef, bookingId, paymentId } = await createConfirmedBookingWithPayment(
        customer1Id,
        depId5Days, // < 7 days -> 0% refund
        50000,
        1,
      );

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Late cancellation 0% refund' },
      });
      const cancellationId = reqRes.json().data.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.cancellation.status).toBe('COMPLETED');
      expect(body.data.settlement.refundAmount).toBe(0);
      expect(body.data.settlement.settlementStatus).toBe('SETTLED');

      const booking = await bookingRepo.findById(bookingId);
      expect(booking!.status).toBe('CANCELLED');

      const payment = await paymentTxRepo.findById(paymentId);
      expect(payment!.status).toBe('REFUNDED');
    });

    it('should safely handle ambiguous gateway timeout: record PROCESSING, transition to AUTHORIZED, release seats once, and prevent double refund on retry', async () => {
      if (!isDbAvailable) return;

      const bookingRef = `BK-TIMEOUT-${Date.now()}`;
      const dep = await departureRepo.findById(depId40Days);
      const bookedSeatsBefore = dep!.bookedSeats;

      const bookingRes = await db.query<{ id: string }>(
        `INSERT INTO bookings (
          booking_reference, customer_id, departure_id, status, party_size, adult_count, child_count,
          total_price, currency, price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
          primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
        ) VALUES (
          $1, $2, $3, 'CONFIRMED', 2, 2, 0,
          100000, 'INR', '{"basePrice": 100000}', '{"title": "Goa Tour"}', $4, '{"days": []}',
          'Alice Cancel Owner', 'alice@example.com', '+919876543210', NOW()
        ) RETURNING id;`,
        [
          bookingRef,
          customer1Id,
          depId40Days,
          JSON.stringify({ departureDate: dep!.departureDate, returnDate: dep!.returnDate }),
        ],
      );
      const bookingId = bookingRes.rows[0]!.id;

      await db.query(
        `UPDATE departure_schedules SET booked_seats = booked_seats + 2 WHERE id = $1;`,
        [depId40Days],
      );

      // Payment with TIMEOUT simulator in payment ID
      const payment = await paymentTxRepo.create({
        bookingId,
        provider: 'MOCK',
        gatewayOrderId: `order_mock_${bookingRef}`,
        gatewayPaymentId: `pay_mock_TIMEOUT_${bookingRef}`,
        amount: 100000,
        currency: 'INR',
        status: 'SUCCESS',
        idempotencyKey: `idem_pay_timeout_${bookingRef}`,
      });

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Ambiguous timeout test' },
      });
      const cancellationId = reqRes.json().data.id;

      // Authorize during gateway timeout
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { adminNotes: 'Authorize during timeout' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.cancellation.status).toBe('AUTHORIZED');
      expect(body.data.settlement.settlementStatus).toBe('PROCESSING');
      expect(body.data.bookingStatus).toBe('CANCELLED');

      // Verify DB states: Booking CANCELLED, Payment REFUNDED, Seats released once
      const booking = await bookingRepo.findById(bookingId);
      expect(booking!.status).toBe('CANCELLED');

      const paymentInDb = await paymentTxRepo.findById(payment.id);
      expect(paymentInDb!.status).toBe('REFUNDED');

      const depAfter = await departureRepo.findById(depId40Days);
      expect(depAfter!.bookedSeats).toBe(bookedSeatsBefore); // incremented by 2, then decremented by 2

      // Verify settlement recorded PROCESSING
      const settlements = await refundSettlementRepo.findByCancellationRequestId(cancellationId);
      expect(settlements.length).toBe(1);
      expect(settlements[0]!.settlementStatus).toBe('PROCESSING');

      // Critical Check: Repeated authorization while PROCESSING must be rejected with 400 (NO duplicate refund)
      const retryRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(retryRes.statusCode).toBe(400);
      expect(retryRes.json().error.code).toBe('REFUND_INVALID_STATE');
    });

    it('should handle explicit gateway rejection: record FAILED audit, keep booking CONFIRMED, and preserve seats', async () => {
      if (!isDbAvailable) return;

      const bookingRef = `BK-REJECT-${Date.now()}`;
      const dep = await departureRepo.findById(depId40Days);
      const bookedSeatsBefore = dep!.bookedSeats;

      const bookingRes = await db.query<{ id: string }>(
        `INSERT INTO bookings (
          booking_reference, customer_id, departure_id, status, party_size, adult_count, child_count,
          total_price, currency, price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
          primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
        ) VALUES (
          $1, $2, $3, 'CONFIRMED', 2, 2, 0,
          100000, 'INR', '{"basePrice": 100000}', '{"title": "Goa Tour"}', $4, '{"days": []}',
          'Alice Cancel Owner', 'alice@example.com', '+919876543210', NOW()
        ) RETURNING id;`,
        [
          bookingRef,
          customer1Id,
          depId40Days,
          JSON.stringify({ departureDate: dep!.departureDate, returnDate: dep!.returnDate }),
        ],
      );
      const bookingId = bookingRes.rows[0]!.id;

      await db.query(
        `UPDATE departure_schedules SET booked_seats = booked_seats + 2 WHERE id = $1;`,
        [depId40Days],
      );

      // Payment with FAIL_REFUND simulator
      const payment = await paymentTxRepo.create({
        bookingId,
        provider: 'MOCK',
        gatewayOrderId: `order_mock_${bookingRef}`,
        gatewayPaymentId: `pay_mock_FAIL_REFUND_${bookingRef}`,
        amount: 100000,
        currency: 'INR',
        status: 'SUCCESS',
        idempotencyKey: `idem_pay_fail_${bookingRef}`,
      });

      const reqRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingRef}/cancellation`,
        headers: { authorization: `Bearer ${customer1Token}` },
        payload: { reason: 'Rejection test' },
      });
      const cancellationId = reqRes.json().data.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cancellations/${cancellationId}/authorize`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('REFUND_FAILED');

      // Verify DB: Booking remains CONFIRMED, Seats NOT decremented, Payment remains SUCCESS
      const booking = await bookingRepo.findById(bookingId);
      expect(booking!.status).toBe('CONFIRMED');

      const paymentInDb = await paymentTxRepo.findById(payment.id);
      expect(paymentInDb!.status).toBe('SUCCESS');

      const depAfter = await departureRepo.findById(depId40Days);
      expect(depAfter!.bookedSeats).toBe(bookedSeatsBefore + 2);

      // Verify FAILED settlement audit was recorded
      const settlements = await refundSettlementRepo.findByCancellationRequestId(cancellationId);
      expect(settlements.length).toBe(1);
      expect(settlements[0]!.settlementStatus).toBe('FAILED');
    });
  });
});
