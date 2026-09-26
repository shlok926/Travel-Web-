import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { seedAll } from '../../backend/src/infrastructure/database/seeds/seedAll.js';
import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { InventoryHoldRepository } from '../../backend/src/modules/inventory/repositories/inventoryHold.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { IdempotencyRepository } from '../../backend/src/modules/booking/repositories/idempotency.repository.js';
import { TourPackageRepository } from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import { ItineraryRepository } from '../../backend/src/modules/catalogue/repositories/itinerary.repository.js';
import { DestinationRepository } from '../../backend/src/modules/catalogue/repositories/destination.repository.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { PaymentEventRepository } from '../../backend/src/modules/payment/repositories/paymentEvent.repository.js';
import { BookingService } from '../../backend/src/modules/booking/services/booking.service.js';
import { PaymentWebhookService } from '../../backend/src/modules/payment/services/paymentWebhook.service.js';
import { PaymentGatewayFactory } from '../../backend/src/modules/payment/adapters/paymentGateway.factory.js';
import { PaymentService } from '../../backend/src/modules/payment/services/payment.service.js';
import { createApp } from '../../backend/src/app.js';
import { FastifyInstance } from 'fastify';

describe('Phase 6 Step 7 — Verified Payment to Booking Confirmation (PostgreSQL Integration & Concurrency)', () => {
  let db: DatabaseService;
  let isDbAvailable = false;
  let departureRepo: DepartureRepository;
  let holdRepo: InventoryHoldRepository;
  let bookingRepo: BookingRepository;
  let passengerRepo: PassengerRepository;
  let idempotencyRepo: IdempotencyRepository;
  let tourPackageRepo: TourPackageRepository;
  let itineraryRepo: ItineraryRepository;
  let destinationRepo: DestinationRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let paymentEventRepo: PaymentEventRepository;
  let bookingService: BookingService;
  let paymentWebhookService: PaymentWebhookService;
  let paymentService: PaymentService;
  let fastifyApp: FastifyInstance;

  const config = loadEnv();
  const testUserId = '77777777-7777-4777-8777-777777777777';
  const testUserEmail = 'step7.integration@example.com';
  let testPackageId: string;

  beforeAll(async () => {
    try {
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;

        await runMigrations(db);
        await seedAll();

        departureRepo = new DepartureRepository(db);
        holdRepo = new InventoryHoldRepository(db);
        bookingRepo = new BookingRepository(db);
        passengerRepo = new PassengerRepository(db);
        idempotencyRepo = new IdempotencyRepository(db);
        tourPackageRepo = new TourPackageRepository(db);
        itineraryRepo = new ItineraryRepository(db);
        destinationRepo = new DestinationRepository(db);
        paymentTxRepo = new PaymentTransactionRepository(db);
        paymentEventRepo = new PaymentEventRepository(db);

        bookingService = new BookingService(
          db,
          bookingRepo,
          passengerRepo,
          idempotencyRepo,
          departureRepo,
          holdRepo,
          tourPackageRepo,
          itineraryRepo,
          destinationRepo,
          paymentTxRepo,
        );

        const gatewayFactory = new PaymentGatewayFactory(config);
        paymentService = new PaymentService(paymentTxRepo, gatewayFactory, bookingService);
        paymentWebhookService = new PaymentWebhookService(
          db,
          paymentTxRepo,
          paymentEventRepo,
          config,
          bookingService,
        );

        const { app } = await createApp({
          config,
          db,
          bookingRepo,
          passengerRepo,
          idempotencyRepo,
          departureRepo,
          holdRepo,
          tourPackageRepo,
          itineraryRepo,
          destinationRepo,
          bookingService,
          paymentTxRepo,
          paymentEventRepo,
          paymentService,
          paymentWebhookService,
        });
        fastifyApp = app;
        await fastifyApp.ready();

        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES ($1, $2, '$argon2id$mockhash', 'Step 7 User', 'CUSTOMER', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true;`,
          [testUserId, testUserEmail],
        );

        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        testPackageId = pkgRes.rows[0]!.id;
      }
    } catch {
      isDbAvailable = false;
    }
  });

  let departureOffsetCounter = 700;
  const createTestDeparture = async (capacity = 20, bookedSeats = 0) => {
    departureOffsetCounter++;
    const depDate = new Date(Date.UTC(2029, 5, departureOffsetCounter));
    const retDate = new Date(Date.UTC(2029, 5, departureOffsetCounter + 4));
    const depDateStr = depDate.toISOString().split('T')[0]!;
    const retDateStr = retDate.toISOString().split('T')[0]!;
    const dep = await departureRepo.create({
      packageId: testPackageId,
      departureDate: depDateStr,
      returnDate: retDateStr,
      totalSeatCapacity: capacity,
      currency: 'INR',
      status: 'OPEN',
    });

    if (bookedSeats > 0) {
      await db.query(`UPDATE departure_schedules SET booked_seats = $1 WHERE id = $2;`, [
        bookedSeats,
        dep.id,
      ]);
      dep.bookedSeats = bookedSeats;
    }
    return dep;
  };

  const sampleSnapshots = {
    priceBreakdown: {
      adultCount: 2,
      adultUnitPrice: 75000,
      adultSubtotal: 150000,
      childCount: 0,
      childUnitPrice: 0,
      childSubtotal: 0,
      baseSubtotal: 150000,
      discountAmount: 0,
      totalPrice: 150000,
      currency: 'INR' as const,
      calculatedAt: new Date().toISOString(),
    },
    packageSnapshot: {
      packageId: '11111111-1111-4111-8111-111111111111',
      slug: 'golden-triangle-step7',
      title: 'Golden Triangle Step 7',
      shortDescription: 'Delhi Agra Jaipur',
      durationDays: 5,
      durationNights: 4,
      originCity: 'New Delhi',
      destinationCity: 'Jaipur',
      destinationCountry: 'India',
      heroImageUrl: 'https://images.unsplash.com/photo-1548013146-72479768bada',
      inclusions: ['Hotels'],
      exclusions: ['Flights'],
    },
    departureSnapshot: {
      departureId: '22222222-2222-4222-8222-222222222222',
      departureDate: '2029-06-01',
      returnDate: '2029-06-05',
      pricingApplied: {
        basePriceAdult: 75000,
        basePriceChild: 45000,
        currency: 'INR' as const,
      },
      statusAtBooking: 'OPEN',
    },
    itinerarySnapshot: [
      {
        dayNumber: 1,
        title: 'Arrival',
        activityDescription: 'Airport greeting',
        mealsIncluded: ['Dinner'],
      },
    ],
  };

  afterAll(async () => {
    if (fastifyApp) {
      await fastifyApp.close();
    }
    if (db && isDbAvailable) {
      await db.query(`DELETE FROM payment_events;`);
      await db.query(`DELETE FROM payment_transactions;`);
      await db.query(`DELETE FROM booking_passengers;`);
      await db.query(`DELETE FROM bookings WHERE customer_id = $1;`, [testUserId]);
      await db.query(`DELETE FROM inventory_holds WHERE user_id = $1;`, [testUserId]);
      await db.query(`DELETE FROM departure_schedules WHERE departure_date >= '2029-01-01';`);
      await db.query(`DELETE FROM users WHERE id = $1;`, [testUserId]);
      await db.close();
    }
  });

  // ============================================================
  // TEST 1 — End-to-End Webhook: Verified Payment confirms booking & commits inventory
  // ============================================================
  it('TEST 1 — End-to-End: Verified webhook payment transitions booking to CONFIRMED, hold to COMMITTED, and increments seats', async () => {
    if (!isDbAvailable) return;

    const departure = await createTestDeparture(20, 0);
    const hold = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-e2e-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const booking = await bookingRepo.create({
      bookingReference: `BK-E2E-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000, // 150000 minor units
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'E2E User', email: 'e2e@example.com', phone: '+919988776655' },
    });

    const paymentTx = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      gatewayOrderId: `ord_e2e_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'PENDING',
    });

    const webhookPayload = JSON.stringify({
      eventId: `evt_e2e_${Date.now()}`,
      eventType: 'payment.succeeded',
      gatewayOrderId: paymentTx.gatewayOrderId,
      gatewayPaymentId: `pay_e2e_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    const secret = config.PAYMENT_WEBHOOK_SECRET || 'dev_mock_webhook_secret';
    const signature = crypto.createHmac('sha256', secret).update(webhookPayload).digest('hex');

    const result = await paymentWebhookService.processWebhook({
      rawBody: webhookPayload,
      headers: { 'x-mock-signature': signature, 'x-payment-provider': 'MOCK' },
    });

    expect(result.success).toBe(true);
    expect(result.matched).toBe(true);

    // Database assertions: all 3 records agree
    const updatedTx = await paymentTxRepo.findById(paymentTx.id);
    const updatedBooking = await bookingRepo.findById(booking.id);
    const updatedHold = await holdRepo.findById(hold.id);
    const updatedDeparture = await departureRepo.findById(departure.id);

    expect(updatedTx?.status).toBe('SUCCESS');
    expect(updatedBooking?.status).toBe('CONFIRMED');
    expect(updatedBooking?.confirmedAt).not.toBeNull();
    expect(updatedHold?.status).toBe('COMMITTED');
    expect(updatedDeparture?.bookedSeats).toBe(2);
  });

  // ============================================================
  // TEST 2 (Concurrency Matrix A) — Two simultaneous confirmations
  // ============================================================
  it('TEST 2 — Concurrency: Two simultaneous confirmations result in exactly 1 seat increment', async () => {
    if (!isDbAvailable) return;

    const departure = await createTestDeparture(15, 0);
    const hold = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-two-conf-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const booking = await bookingRepo.create({
      bookingReference: `BK-TWOCONF-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Two Conf', email: 'two@example.com', phone: '+919988776655' },
    });

    const paymentTx = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      gatewayOrderId: `ord_two_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    // Execute 2 concurrent confirmations
    const [res1, res2] = await Promise.all([
      bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      }),
      bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      }),
    ]);

    expect(res1.status).toBe('CONFIRMED');
    expect(res2.status).toBe('CONFIRMED');

    const updatedDep = await departureRepo.findById(departure.id);
    expect(updatedDep?.bookedSeats).toBe(2); // Exactly 1 increment (+2), never +4!
  });

  // ============================================================
  // TEST 3 (Concurrency Matrix B) — Confirmation vs Hold Expiry Race
  // ============================================================
  it('TEST 3 — Concurrency: Confirmation races with Hold Expiry: strict atomic outcome (either CONFIRMED+COMMITTED or EXPIRED+EXPIRED)', async () => {
    if (!isDbAvailable) return;

    const departure = await createTestDeparture(10, 0);
    const hold = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-race-exp-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 300), // Barely alive
    });

    const booking = await bookingRepo.create({
      bookingReference: `BK-RACEEXP-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Race Exp', email: 'race@example.com', phone: '+919988776655' },
    });

    const paymentTx = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      gatewayOrderId: `ord_race_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    await Promise.allSettled([
      bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      }),
      bookingService.expireHoldAndBooking(hold.id, booking.id),
    ]);

    const finalBooking = await bookingRepo.findById(booking.id);
    const finalHold = await holdRepo.findById(hold.id);
    const finalDep = await departureRepo.findById(departure.id);

    if (finalBooking?.status === 'CONFIRMED') {
      expect(finalHold?.status).toBe('COMMITTED');
      expect(finalDep?.bookedSeats).toBe(2);
    } else {
      expect(finalBooking?.status).toBe('EXPIRED');
      expect(finalHold?.status).toBe('EXPIRED');
      expect(finalDep?.bookedSeats).toBe(0);
    }
  });

  // ============================================================
  // TEST 4 (Concurrency Matrix C) — Final Seat Contention
  // ============================================================
  it('TEST 4 — Concurrency: Multiple bookings competing for final remaining seats cannot exceed capacity', async () => {
    if (!isDbAvailable) return;

    // Capacity 10, already 8 booked -> exactly 2 remaining seats
    const departure = await createTestDeparture(10, 8);

    // Booking 1: 2 seats
    const hold1 = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-cont-1-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const booking1 = await bookingRepo.create({
      bookingReference: `BK-CONT-1-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold1.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Cont 1', email: 'cont1@example.com', phone: '+919988776655' },
    });
    const paymentTx1 = await paymentTxRepo.create({
      bookingId: booking1.id,
      provider: 'MOCK',
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    // Booking 2: 2 seats
    const hold2 = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-cont-2-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const booking2 = await bookingRepo.create({
      bookingReference: `BK-CONT-2-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold2.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Cont 2', email: 'cont2@example.com', phone: '+919988776655' },
    });
    const paymentTx2 = await paymentTxRepo.create({
      bookingId: booking2.id,
      provider: 'MOCK',
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    // Confirm both simultaneously
    const results = await Promise.allSettled([
      bookingService.confirmBooking({
        bookingId: booking1.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx1.id,
      }),
      bookingService.confirmBooking({
        bookingId: booking2.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx2.id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const finalDep = await departureRepo.findById(departure.id);
    expect(finalDep?.bookedSeats).toBe(10); // Exactly 10, never 12!
  });

  // ============================================================
  // TEST 5 (Late Payment Step 15 & 16) — Payment after Hold Expiry
  // ============================================================
  it('TEST 5 — Late payment after hold expiry: payment is SUCCESS, booking remains EXPIRED, hold remains EXPIRED, seats remain 0', async () => {
    if (!isDbAvailable) return;

    const departure = await createTestDeparture(10, 0);
    const hold = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-late-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 5000), // Already expired
    });

    const booking = await bookingRepo.create({
      bookingReference: `BK-LATE-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Late User', email: 'late@example.com', phone: '+919988776655' },
    });

    // Worker marks hold and booking as EXPIRED
    await bookingService.expireHoldAndBooking(hold.id, booking.id);

    const expiredBooking = await bookingRepo.findById(booking.id);
    expect(expiredBooking?.status).toBe('EXPIRED');

    // Create payment transaction
    const paymentTx = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      gatewayOrderId: `ord_late_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'PENDING',
    });

    // Webhook delivers SUCCESS late
    const webhookPayload = JSON.stringify({
      eventId: `evt_late_${Date.now()}`,
      eventType: 'payment.succeeded',
      gatewayOrderId: paymentTx.gatewayOrderId,
      gatewayPaymentId: `pay_late_${Date.now()}`,
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
    });

    const secret = config.PAYMENT_WEBHOOK_SECRET || 'dev_mock_webhook_secret';
    const signature = crypto.createHmac('sha256', secret).update(webhookPayload).digest('hex');

    const result = await paymentWebhookService.processWebhook({
      rawBody: webhookPayload,
      headers: { 'x-mock-signature': signature, 'x-payment-provider': 'MOCK' },
    });

    expect(result.success).toBe(true);

    // Database assertions:
    const checkedTx = await paymentTxRepo.findById(paymentTx.id);
    const checkedBooking = await bookingRepo.findById(booking.id);
    const checkedHold = await holdRepo.findById(hold.id);
    const checkedDep = await departureRepo.findById(departure.id);

    // Payment transaction is recorded as SUCCESS (preserved for Step 10 refund workflow)
    expect(checkedTx?.status).toBe('SUCCESS');
    // Booking remains EXPIRED (never confirmed!)
    expect(checkedBooking?.status).toBe('EXPIRED');
    // Hold remains EXPIRED
    expect(checkedHold?.status).toBe('EXPIRED');
    // Booked seats remain untouched
    expect(checkedDep?.bookedSeats).toBe(0);
  });

  // ============================================================
  // TEST 6 — Payment Amount / Currency / Booking Mismatches
  // ============================================================
  it('TEST 6 — Rejects confirmation when payment parameters do not match booking', async () => {
    if (!isDbAvailable) return;

    const departure = await createTestDeparture(10, 0);
    const hold = await holdRepo.create({
      departureId: departure.id,
      checkoutSessionToken: `tok-mismatch-${Date.now()}`,
      userId: testUserId,
      heldSeats: 2,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const booking = await bookingRepo.create({
      bookingReference: `BK-MISMATCH-${Date.now()}`,
      customerId: testUserId,
      departureId: departure.id,
      holdId: hold.id,
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'AWAITING_PAYMENT',
      ...sampleSnapshots,
      primaryContact: { name: 'Mismatch', email: 'mis@example.com', phone: '+919988776655' },
    });

    // 1. Amount mismatch
    const txWrongAmount = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      amount: 99999, // Mismatch
      currency: 'INR',
      status: 'SUCCESS',
    });

    await expect(
      bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: txWrongAmount.id,
      }),
    ).rejects.toThrow();

    // 2. Currency mismatch
    const txWrongCurrency = await paymentTxRepo.create({
      bookingId: booking.id,
      provider: 'MOCK',
      amount: 150000,
      currency: 'USD', // Mismatch
      status: 'SUCCESS',
    });

    await expect(
      bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: txWrongCurrency.id,
      }),
    ).rejects.toThrow();
  });
});
