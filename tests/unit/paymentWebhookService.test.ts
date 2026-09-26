import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentWebhookService } from '../../backend/src/modules/payment/services/paymentWebhook.service.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { PaymentEventRepository } from '../../backend/src/modules/payment/repositories/paymentEvent.repository.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { EnvConfig } from '../../backend/src/config/env.js';
import { AppError, ErrorCodes } from '../../shared/src/index.js';

describe('Phase 6 Step 6 — Payment Webhook Service (Unit & Security Invariants)', () => {
  let db: DatabaseService;
  let paymentTxRepo: PaymentTransactionRepository;
  let paymentEventRepo: PaymentEventRepository;
  let webhookService: PaymentWebhookService;

  const mockConfig: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    CORS_ORIGIN: '*',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    DATABASE_POOL_MIN: 2,
    DATABASE_POOL_MAX: 10,
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
    COOKIE_SECRET: 'test_cookie_secret_32_characters_long_123',
    JWT_ACCESS_EXPIRES_IN: 900,
    JWT_REFRESH_EXPIRES_IN: 604800,
    JWT_PRIVATE_KEY: 'test',
    JWT_PUBLIC_KEY: 'test',
    ARGON2_MEMORY_COST: 65536,
    ARGON2_TIME_COST: 3,
    ARGON2_PARALLELISM: 4,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_PATH: './uploads',
    S3_REGION: 'us-east-1',
    S3_BUCKET_PRIVATE: 'private',
    S3_BUCKET_PUBLIC: 'public',
    S3_FORCE_PATH_STYLE: true,
    DEFAULT_CURRENCY: 'INR',
    HOLD_DURATION_MINUTES: 15,
    DEFAULT_PAYMENT_PROVIDER: 'MOCK',
    PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_key_1234567890',
    RAZORPAY_KEY_SECRET: 'test_razorpay_secret_key',
  };

  const sampleTx = {
    id: '11111111-1111-1111-1111-111111111111',
    bookingId: '22222222-2222-2222-2222-222222222222',
    provider: 'MOCK' as const,
    gatewayOrderId: 'order_mock_12345',
    gatewayPaymentId: null,
    amount: 150000, // 150000 minor units (₹1,500.00)
    currency: 'INR' as const,
    status: 'PENDING' as const,
    idempotencyKey: 'idemp-123',
    gatewayResponsePayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    db = {
      withTransaction: vi.fn().mockImplementation(async (cb) => cb({})),
      query: vi.fn(),
    } as unknown as DatabaseService;

    paymentTxRepo = {
      findByProviderOrderId: vi.fn().mockResolvedValue(sampleTx),
      findByProviderPaymentId: vi.fn().mockResolvedValue(sampleTx),
      updateStatusGuarded: vi.fn().mockResolvedValue({ ...sampleTx, status: 'SUCCESS' }),
      updateGatewayIdentifiers: vi.fn().mockResolvedValue(sampleTx),
    } as unknown as PaymentTransactionRepository;

    paymentEventRepo = {
      findByProviderAndEventId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'evt-db-123',
        provider: 'MOCK',
        eventId: 'evt_mock_123',
        eventType: 'payment.succeeded',
        payload: {},
        processedAt: new Date(),
        createdAt: new Date(),
      }),
    } as unknown as PaymentEventRepository;

    webhookService = new PaymentWebhookService(db, paymentTxRepo, paymentEventRepo, mockConfig);
  });

  // ============================================================
  // 1. Signature Verification Tests
  // ============================================================
  describe('1. Cryptographic HMAC Signature Verification', () => {
    it('1.1 accepts valid HMAC-SHA256 signature for Mock provider', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_001',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_mock_12345',
        gatewayPaymentId: 'pay_mock_999',
        amount: 150000,
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      const result = await webhookService.processWebhook({
        rawBody: rawPayload,
        headers: { 'x-mock-signature': signature },
        paramProvider: 'MOCK',
      });

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.matched).toBe(true);
      expect(result.eventId).toBe('evt_mock_001');
    });

    it('1.2 rejects tampered body / invalid HMAC signature with PAYMENT_WEBHOOK_SIGNATURE_INVALID', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_002',
        gatewayOrderId: 'order_mock_12345',
        amount: 150000,
      });

      try {
        await webhookService.processWebhook({
          rawBody: rawPayload,
          headers: { 'x-mock-signature': 'invalid_tampered_signature_hex' },
          paramProvider: 'MOCK',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID);
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    it('1.3 rejects missing signature header with PAYMENT_WEBHOOK_SIGNATURE_INVALID', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_003',
        gatewayOrderId: 'order_mock_12345',
      });

      try {
        await webhookService.processWebhook({
          rawBody: rawPayload,
          headers: {}, // No signature header
          paramProvider: 'MOCK',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID);
      }
    });

    it('1.4 accepts valid Razorpay HMAC signature', async () => {
      const rzpSecret = mockConfig.PAYMENT_WEBHOOK_SECRET!;
      const rzpBody = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_123',
              order_id: 'order_mock_12345',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const signature = crypto.createHmac('sha256', rzpSecret).update(rzpBody).digest('hex');

      const result = await webhookService.processWebhook({
        rawBody: rzpBody,
        headers: {
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': 'evt_rzp_001',
        },
        paramProvider: 'RAZORPAY',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('RAZORPAY');
      expect(result.eventId).toBe('evt_rzp_001');
    });

    it('1.5 accepts valid Stripe timestamped HMAC signature', async () => {
      const stripeSecret = mockConfig.PAYMENT_WEBHOOK_SECRET!;
      const stripeBody = JSON.stringify({
        id: 'evt_stripe_001',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'order_mock_12345',
            amount: 150000,
            currency: 'inr',
            status: 'succeeded',
            latest_charge: 'ch_stripe_999',
          },
        },
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${stripeBody}`;
      const sigHex = crypto.createHmac('sha256', stripeSecret).update(signedPayload).digest('hex');
      const stripeHeader = `t=${timestamp},v1=${sigHex}`;

      const result = await webhookService.processWebhook({
        rawBody: stripeBody,
        headers: { 'stripe-signature': stripeHeader },
        paramProvider: 'STRIPE',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('STRIPE');
      expect(result.eventId).toBe('evt_stripe_001');
    });
  });

  // ============================================================
  // 2. Event Deduplication & Idempotency Tests
  // ============================================================
  describe('2. Event Deduplication & Idempotency', () => {
    it('2.1 returns safe idempotent response when event was already processed', async () => {
      vi.spyOn(paymentEventRepo, 'findByProviderAndEventId').mockResolvedValueOnce({
        id: 'evt-already-seen',
        provider: 'MOCK',
        eventId: 'evt_mock_duplicate',
        eventType: 'payment.succeeded',
        payload: {},
        processedAt: new Date(),
        createdAt: new Date(),
      });

      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_duplicate',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_mock_12345',
        amount: 150000,
        currency: 'INR',
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      const result = await webhookService.processWebhook({
        rawBody: rawPayload,
        headers: { 'x-mock-signature': signature },
        paramProvider: 'MOCK',
      });

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(paymentTxRepo.updateStatusGuarded).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 3. Financial Validation Tests
  // ============================================================
  describe('3. Financial Integrity & Minor Unit Validation', () => {
    it('3.1 rejects amount mismatch between webhook and local transaction (PAYMENT_AMOUNT_MISMATCH)', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_amount_mismatch',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_mock_12345',
        amount: 15000, // Attacker or gateway sent 15000 instead of expected 150000
        currency: 'INR',
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      try {
        await webhookService.processWebhook({
          rawBody: rawPayload,
          headers: { 'x-mock-signature': signature },
          paramProvider: 'MOCK',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_AMOUNT_MISMATCH);
        expect(paymentTxRepo.updateStatusGuarded).not.toHaveBeenCalled();
      }
    });

    it('3.2 rejects currency mismatch (PAYMENT_CURRENCY_MISMATCH)', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_curr_mismatch',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_mock_12345',
        amount: 150000,
        currency: 'USD', // Local transaction expects INR
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      try {
        await webhookService.processWebhook({
          rawBody: rawPayload,
          headers: { 'x-mock-signature': signature },
          paramProvider: 'MOCK',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_CURRENCY_MISMATCH);
        expect(paymentTxRepo.updateStatusGuarded).not.toHaveBeenCalled();
      }
    });
  });

  // ============================================================
  // 4. State Transitions & Booking Isolation
  // ============================================================
  describe('4. Guarded Payment State Transitions & Booking Isolation', () => {
    it('4.1 transitions local payment transaction to SUCCESS upon verified payment event', async () => {
      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_success',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_mock_12345',
        gatewayPaymentId: 'pay_mock_captured_999',
        amount: 150000,
        currency: 'INR',
        status: 'SUCCESS',
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      const result = await webhookService.processWebhook({
        rawBody: rawPayload,
        headers: { 'x-mock-signature': signature },
        paramProvider: 'MOCK',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(paymentTxRepo.updateStatusGuarded).toHaveBeenCalledWith(
        sampleTx.id,
        ['INITIATED', 'PENDING'],
        'SUCCESS',
        expect.anything(),
      );
    });

    it('4.2 records unmatched webhook event without crashing or modifying random state', async () => {
      vi.spyOn(paymentTxRepo, 'findByProviderOrderId').mockResolvedValueOnce(null);
      vi.spyOn(paymentTxRepo, 'findByProviderPaymentId').mockResolvedValueOnce(null);

      const rawPayload = JSON.stringify({
        eventId: 'evt_mock_unmatched',
        eventType: 'payment.succeeded',
        gatewayOrderId: 'order_unknown_99999',
        amount: 150000,
        currency: 'INR',
      });

      const signature = crypto
        .createHmac('sha256', mockConfig.PAYMENT_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      const result = await webhookService.processWebhook({
        rawBody: rawPayload,
        headers: { 'x-mock-signature': signature },
        paramProvider: 'MOCK',
      });

      expect(result.success).toBe(true);
      expect(result.matched).toBe(false);
      expect(paymentEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_mock_unmatched',
          provider: 'MOCK',
        }),
      );
    });
  });
});
