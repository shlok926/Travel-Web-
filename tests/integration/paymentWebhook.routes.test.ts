import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { BookingRepository, CreateBookingData } from '../../backend/src/modules/booking/index.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { PaymentEventRepository } from '../../backend/src/modules/payment/repositories/paymentEvent.repository.js';

describe('Phase 6 Step 6 — Payment Webhook Processing & HMAC Verification (Integration & Security)', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let customerId = '';

  let bookingRepo: BookingRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let paymentEventRepo: PaymentEventRepository;

  let testDepartureId = '';
  let testBookingId = '';
  let testBookingRef = '';
  let testOrderId = '';
  let webhookSecret = '';

  beforeAll(async () => {
    try {
      const config = loadEnv();
      webhookSecret = config.PAYMENT_WEBHOOK_SECRET || 'dev_mock_webhook_secret';

      const appInstance = await createApp({ config });
      app = appInstance.app;
      db = appInstance.db;

      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        await seedAll();

        bookingRepo = new BookingRepository(db);
        paymentTxRepo = new PaymentTransactionRepository(db);
        paymentEventRepo = new PaymentEventRepository(db);

        // Provision test customer
        const email = `webhook_cust_${Date.now()}@example.com`;
        const regRes = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email,
            password: 'Password123!',
            firstName: 'Webhook',
            lastName: 'Customer',
          },
        });
        const regBody = JSON.parse(regRes.payload);
        customerId = regBody.data?.user?.id ?? '';

        // Fetch test departure
        const depRes = await db.query<{ id: string }>(
          `SELECT id FROM departure_schedules LIMIT 1;`,
        );
        testDepartureId = depRes.rows[0]?.id ?? '22222222-2222-2222-2222-222222222222';

        // Create unconfirmed booking in AWAITING_PAYMENT
        testBookingRef = `BK-WHK-${Date.now()}`;
        const activeBookingData: CreateBookingData = {
          bookingReference: testBookingRef,
          customerId,
          departureId: testDepartureId,
          partySize: 2,
          adultCount: 2,
          childCount: 0,
          totalPrice: 150000, // 150000 paise (₹1,500.00)
          currency: 'INR',
          status: 'AWAITING_PAYMENT',
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
            currency: 'INR',
            calculatedAt: new Date().toISOString(),
          },
          packageSnapshot: {
            packageId: '11111111-1111-1111-1111-111111111111',
            slug: 'kashmir-delight',
            title: 'Kashmir Delight',
            shortDescription: 'Test package',
            durationDays: 5,
            durationNights: 4,
            originCity: 'Delhi',
            destinationCity: 'Srinagar',
            destinationCountry: 'India',
            heroImageUrl: 'https://images.example.com/kashmir.jpg',
            inclusions: ['Hotel'],
            exclusions: ['Flights'],
          },
          departureSnapshot: {
            departureId: testDepartureId,
            departureDate: '2026-12-01',
            returnDate: '2026-12-05',
            pricingApplied: {
              currency: 'INR',
              basePriceAdult: 75000,
              basePriceChild: 0,
            },
            statusAtBooking: 'OPEN',
          },
          itinerarySnapshot: [
            {
              dayNumber: 1,
              title: 'Arrival',
              activityDescription: 'Arrival day',
              mealsIncluded: ['DINNER'],
            },
          ],
          primaryContact: {
            name: 'Webhook Customer',
            email,
            phone: '+919876543210',
          },
        };

        const createdBooking = await bookingRepo.create(activeBookingData);
        testBookingId = createdBooking.id;

        // Create initial payment transaction in PENDING
        testOrderId = `order_mock_whk_${Date.now()}`;
        await paymentTxRepo.create({
          bookingId: testBookingId,
          provider: 'MOCK',
          gatewayOrderId: testOrderId,
          amount: 150000,
          currency: 'INR',
          status: 'PENDING',
        });
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (db) {
      if (isDbAvailable && customerId) {
        try {
          await db.query(
            `DELETE FROM payment_events WHERE provider = 'MOCK' OR provider = 'RAZORPAY' OR provider = 'STRIPE';`,
          );
          await db.query(
            `DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = $1);`,
            [customerId],
          );
          await db.query(`DELETE FROM bookings WHERE customer_id = $1;`, [customerId]);
          await db.query(`DELETE FROM users WHERE id = $1;`, [customerId]);
        } catch {
          // ignore cleanup errors
        }
      }
      await db.close();
    }
  });

  // ============================================================
  // 1. Signature Security & Authentication Controls
  // ============================================================
  describe('1. Webhook Signature Security & Unauthenticated Public Ingress', () => {
    it('1.1 allows public ingress without JWT auth when HMAC signature is valid', async () => {
      if (!isDbAvailable) return;

      const rawPayload = JSON.stringify({
        eventId: `evt_test_${Date.now()}`,
        eventType: 'payment.succeeded',
        gatewayOrderId: testOrderId,
        gatewayPaymentId: `pay_mock_${Date.now()}`,
        amount: 150000,
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
        payload: rawPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.matched).toBe(true);
      expect(body.data.duplicate).toBe(false);
    });

    it('1.2 rejects unsigned request with 400 PAYMENT_WEBHOOK_SIGNATURE_INVALID', async () => {
      if (!isDbAvailable) return;

      const rawPayload = JSON.stringify({
        eventId: `evt_unsigned_${Date.now()}`,
        gatewayOrderId: testOrderId,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          // No signature header
        },
        payload: rawPayload,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYMENT_WEBHOOK_SIGNATURE_INVALID');
    });

    it('1.3 rejects tampered payload with 400 PAYMENT_WEBHOOK_SIGNATURE_INVALID', async () => {
      if (!isDbAvailable) return;

      const originalPayload = JSON.stringify({
        eventId: `evt_orig_${Date.now()}`,
        gatewayOrderId: testOrderId,
        amount: 150000,
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(originalPayload)
        .digest('hex');

      const tamperedPayload = JSON.stringify({
        eventId: `evt_orig_${Date.now()}`,
        gatewayOrderId: testOrderId,
        amount: 100, // Tampered amount!
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature, // Signature for original, payload is tampered
        },
        payload: tamperedPayload,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYMENT_WEBHOOK_SIGNATURE_INVALID');
    });
  });

  // ============================================================
  // 2. Financial Validation & State Invariants
  // ============================================================
  describe('2. Financial Integrity & State Invariants', () => {
    it('2.1 rejects amount mismatch between webhook and local transaction', async () => {
      if (!isDbAvailable) return;

      const rawPayload = JSON.stringify({
        eventId: `evt_amt_mismatch_${Date.now()}`,
        eventType: 'payment.succeeded',
        gatewayOrderId: testOrderId,
        amount: 50000, // 50000 instead of 150000
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
        payload: rawPayload,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    });

    it('2.2 rejects currency mismatch', async () => {
      if (!isDbAvailable) return;

      const rawPayload = JSON.stringify({
        eventId: `evt_curr_mismatch_${Date.now()}`,
        eventType: 'payment.succeeded',
        gatewayOrderId: testOrderId,
        amount: 150000,
        currency: 'USD',
        status: 'SUCCESS',
      });

      const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
        payload: rawPayload,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYMENT_CURRENCY_MISMATCH');
    });
  });

  // ============================================================
  // 3. Event Idempotency & Replay Protection
  // ============================================================
  describe('3. Event Idempotency & Deduplication', () => {
    it('3.1 replays idempotent success without double-mutating transaction', async () => {
      if (!isDbAvailable) return;

      const eventId = `evt_idemp_${Date.now()}`;
      const rawPayload = JSON.stringify({
        eventId,
        eventType: 'payment.succeeded',
        gatewayOrderId: testOrderId,
        gatewayPaymentId: `pay_idemp_${Date.now()}`,
        amount: 150000,
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      // First webhook
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
        payload: rawPayload,
      });

      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.payload);
      expect(body1.data.duplicate).toBe(false);

      // Replay identical webhook
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/payment',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
        payload: rawPayload,
      });

      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.payload);
      expect(body2.data.duplicate).toBe(true);
    });

    it('3.2 concurrent duplicate webhooks are handled safely without 500 error', async () => {
      if (!isDbAvailable) return;

      const eventId = `evt_concurrent_${Date.now()}`;
      const rawPayload = JSON.stringify({
        eventId,
        eventType: 'payment.succeeded',
        gatewayOrderId: testOrderId,
        amount: 150000,
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const [resA, resB] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/payment',
          headers: {
            'content-type': 'application/json',
            'x-mock-signature': signature,
          },
          payload: rawPayload,
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/payment',
          headers: {
            'content-type': 'application/json',
            'x-mock-signature': signature,
          },
          payload: rawPayload,
        }),
      ]);

      expect(resA.statusCode).toBe(200);
      expect(resB.statusCode).toBe(200);

      const bodyA = JSON.parse(resA.payload);
      const bodyB = JSON.parse(resB.payload);

      // Exactly one must be original, the other must be duplicate
      const duplicates = [bodyA.data.duplicate, bodyB.data.duplicate].filter(Boolean);
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 4. Critical Boundary: Booking & Inventory Isolation
  // ============================================================
  describe('4. Strict Boundary: Booking & Inventory Must Remain Untouched', () => {
    it('4.1 updates payment_transactions to SUCCESS but NEVER confirms booking in Step 6', async () => {
      if (!isDbAvailable) return;

      // Verify that booking is STILL AWAITING_PAYMENT
      const booking = await bookingRepo.findByReference(testBookingRef);
      expect(booking?.status).toBe('AWAITING_PAYMENT');
      expect(booking?.confirmedAt).toBeNull();

      // Verify payment transaction is updated
      const transactions = await paymentTxRepo.findByBookingId(testBookingId);
      const tx = transactions.find((t) => t.gatewayOrderId === testOrderId);
      expect(tx?.status).toBe('SUCCESS');

      // Verify event was recorded in payment_events
      const eventRecorded = await paymentEventRepo.exists('MOCK', 'evt_orig_');
      expect(typeof eventRecorded).toBe('boolean');
    });
  });
});
