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

describe('Phase 6 Step 5 — Payment Initiation & Payment Status APIs (Integration & Security)', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let customer1Token = '';
  let customer1Id = '';
  let customer2Token = '';
  let customer2Id = '';

  let bookingRepo: BookingRepository;
  let testDepartureId = '';

  let activeBookingRef = '';
  let confirmedBookingRef = '';
  let expiredHoldBookingRef = '';

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

        bookingRepo = new BookingRepository(db);

        // Provision Customer 1
        const email1 = `cust1_${Date.now()}@example.com`;
        const res1 = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: email1,
            password: 'Password123!',
            firstName: 'Alice',
            lastName: 'Customer',
          },
        });
        const body1 = JSON.parse(res1.payload);
        customer1Token = body1.data?.tokens?.accessToken ?? '';
        customer1Id = body1.data?.user?.id ?? '';

        // Provision Customer 2
        const email2 = `cust2_${Date.now()}@example.com`;
        const res2 = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: email2,
            password: 'Password123!',
            firstName: 'Bob',
            lastName: 'Customer',
          },
        });
        const body2 = JSON.parse(res2.payload);
        customer2Token = body2.data?.tokens?.accessToken ?? '';
        customer2Id = body2.data?.user?.id ?? '';

        // Fetch test departure
        const depRes = await db.query<{ id: string }>(
          `SELECT id FROM departure_schedules LIMIT 1;`,
        );
        testDepartureId = depRes.rows[0]?.id ?? '22222222-2222-2222-2222-222222222222';

        // 1. Create active unconfirmed booking for Customer 1
        activeBookingRef = `BK-INIT-${Date.now()}`;
        const activeBookingData: CreateBookingData = {
          bookingReference: activeBookingRef,
          customerId: customer1Id,
          departureId: testDepartureId,
          partySize: 2,
          adultCount: 2,
          childCount: 0,
          totalPrice: 4500000, // 45,000 INR
          currency: 'INR',
          status: 'AWAITING_PAYMENT',
          priceBreakdown: {
            adultCount: 2,
            adultUnitPrice: 2250000,
            adultSubtotal: 4500000,
            childCount: 0,
            childUnitPrice: 0,
            childSubtotal: 0,
            baseSubtotal: 4500000,
            discountAmount: 0,
            totalPrice: 4500000,
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
              basePriceAdult: 2250000,
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
            name: 'Alice Customer',
            email: email1,
            phone: '+919876543210',
          },
        };
        await bookingRepo.create(activeBookingData);

        // 2. Create CONFIRMED booking for Customer 1
        confirmedBookingRef = `BK-CONF-${Date.now()}`;
        await bookingRepo.create({
          ...activeBookingData,
          bookingReference: confirmedBookingRef,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        });

        // 3. Create booking with EXPIRED hold for Customer 1
        expiredHoldBookingRef = `BK-EXPHOLD-${Date.now()}`;
        // Create an expired hold in DB
        const holdRes = await db.query<{ id: string }>(
          `INSERT INTO inventory_holds (departure_id, user_id, party_size, status, expires_at)
           VALUES ($1, $2, 2, 'ACTIVE', NOW() - INTERVAL '10 minutes')
           RETURNING id;`,
          [testDepartureId, customer1Id],
        );
        const holdId = holdRes.rows[0]?.id;

        await bookingRepo.create({
          ...activeBookingData,
          bookingReference: expiredHoldBookingRef,
          holdId,
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
      if (isDbAvailable && customer1Id) {
        try {
          await db.query(
            `DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = $1);`,
            [customer1Id],
          );
          await db.query(`DELETE FROM bookings WHERE customer_id = $1 OR customer_id = $2;`, [
            customer1Id,
            customer2Id,
          ]);
          await db.query(`DELETE FROM users WHERE id = $1 OR id = $2;`, [customer1Id, customer2Id]);
        } catch {
          // ignore cleanup errors
        }
      }
      await db.close();
    }
  });

  // ============================================================
  // 1. Authentication & Ownership Security
  // ============================================================
  describe('1. Authentication & Ownership Isolation', () => {
    it('1.1 rejects unauthenticated payment initiation with 401 UNAUTHORIZED', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          bookingReference: activeBookingRef,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('1.2 prevents IDOR: returns 404 when customer attempts payment for another customer booking', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer2Token}`, // Customer 2 trying to pay for Customer 1's booking
        },
        payload: {
          bookingReference: activeBookingRef,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('1.3 returns 404 for non-existent booking reference', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: 'BK-NONEXISTENT-9999',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  // ============================================================
  // 2. Client Payload Tampering & Validation Boundaries
  // ============================================================
  describe('2. Client Payload Tampering & Validation Boundaries', () => {
    it('2.1 rejects client payload attempting to specify amount (strict schema)', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: activeBookingRef,
          amount: 100, // Attacker trying to set price to 100 paise!
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.2 rejects client payload attempting to specify currency', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: activeBookingRef,
          currency: 'USD',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.3 rejects client payload attempting to specify customerId', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: activeBookingRef,
          customerId: customer2Id,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.4 rejects unsupported payment provider', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: activeBookingRef,
          provider: 'CRYPTO_UNSUPPORTED',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // 3. Booking State & Hold Expiration Invariants
  // ============================================================
  describe('3. Booking State & Hold Expiration Invariants', () => {
    it('3.1 rejects payment initiation for already CONFIRMED booking with PAYMENT_ALREADY_PROCESSED', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: confirmedBookingRef,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
    });

    it('3.2 rejects payment initiation for booking with EXPIRED inventory hold', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
        payload: {
          bookingReference: expiredHoldBookingRef,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVENTORY_HOLD_EXPIRED');
    });
  });

  // ============================================================
  // 4. Successful Payment Initiation & Server-Authoritative Pricing
  // ============================================================
  describe('4. Successful Payment Initiation & Server-Authoritative Pricing', () => {
    it('4.1 successfully initiates payment session and returns server-authoritative amount and clientPayload', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `idemp-init-${Date.now()}`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: {
          bookingReference: activeBookingRef,
          provider: 'MOCK',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      const data = body.data;
      expect(data.paymentId).toBeDefined();
      expect(data.bookingReference).toBe(activeBookingRef);
      expect(data.provider).toBe('MOCK');
      expect(data.gatewayOrderId).toBeDefined();
      expect(data.amount).toBe(4500000); // 45,000 INR from booking snapshot
      expect(data.currency).toBe('INR');
      expect(data.status).toBe('INITIATED');
      expect(data.clientPayload).toBeDefined();
      expect(data.clientPayload.mockKey).toBeDefined();

      // Verify that booking status is STILL AWAITING_PAYMENT (NEVER auto-confirmed!)
      const booking = await bookingRepo.findByReference(activeBookingRef);
      expect(booking?.status).toBe('AWAITING_PAYMENT');
      expect(booking?.confirmedAt).toBeNull();
    });

    it('4.2 replays existing transaction when identical request is sent with same Idempotency-Key', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `idemp-replay-${Date.now()}`;

      // First request
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: {
          bookingReference: activeBookingRef,
          provider: 'MOCK',
        },
      });

      expect(res1.statusCode).toBe(201);
      const body1 = JSON.parse(res1.payload);

      // Replay request
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: {
          bookingReference: activeBookingRef,
          provider: 'MOCK',
        },
      });

      expect(res2.statusCode).toBe(201);
      const body2 = JSON.parse(res2.payload);

      expect(body2.data.paymentId).toBe(body1.data.paymentId);
      expect(body2.data.gatewayOrderId).toBe(body1.data.gatewayOrderId);
    });

    it('4.3 rejects conflicting request with same Idempotency-Key with 409 IDEMPOTENCY_CONFLICT', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `idemp-conflict-${Date.now()}`;

      // First request with activeBookingRef
      await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: {
          bookingReference: activeBookingRef,
          provider: 'MOCK',
        },
      });

      // Second request with same idempotency key for another booking
      const resConflict = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        headers: {
          authorization: `Bearer ${customer1Token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: {
          bookingReference: confirmedBookingRef, // different booking
          provider: 'MOCK',
        },
      });

      expect(resConflict.statusCode).toBe(409);
      const body = JSON.parse(resConflict.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  // ============================================================
  // 5. Payment Status Endpoint
  // ============================================================
  describe('5. Payment Status Endpoint (GET /api/v1/payments/:bookingReference/status)', () => {
    it('5.1 rejects unauthenticated status lookup with 401 UNAUTHORIZED', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${activeBookingRef}/status`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('5.2 prevents IDOR on status lookup: Customer 2 cannot access Customer 1 booking payment status', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${activeBookingRef}/status`,
        headers: {
          authorization: `Bearer ${customer2Token}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('5.3 returns payment status for authenticated booking owner', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/${activeBookingRef}/status`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      const data = body.data;
      expect(data.paymentId).toBeDefined();
      expect(data.bookingReference).toBe(activeBookingRef);
      expect(data.amount).toBe(4500000);
      expect(data.currency).toBe('INR');
      expect(data.status).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });
  });
});
