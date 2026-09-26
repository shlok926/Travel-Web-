import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import {
  MockPaymentGatewayAdapter,
  RazorpayPaymentGatewayAdapter,
  StripePaymentGatewayAdapter,
  PaymentGatewayFactory,
} from '../../backend/src/modules/payment/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { AppError, ErrorCodes } from '../../shared/src/index.js';

describe('Phase 6 Step 4 — Payment Gateway Adapters (Unit & Mocking)', () => {
  const sampleOrderRequest = {
    bookingReference: 'BK-20261115-A1B2',
    amount: 5000000, // 50,000 INR in paise (minor units)
    currency: 'INR' as const,
    receipt: 'rcpt_tx_12345678',
    customer: {
      name: 'John Traveler',
      email: 'john@example.com',
      phone: '+919876543210',
    },
    notes: {
      packageSlug: 'kashmir-delight',
    },
  };

  // ============================================================
  // 1. MockPaymentGatewayAdapter Tests
  // ============================================================
  describe('1. MockPaymentGatewayAdapter', () => {
    const mockAdapter = new MockPaymentGatewayAdapter();

    it('1.1 should have provider identifier as MOCK', () => {
      expect(mockAdapter.provider).toBe('MOCK');
    });

    it('1.2 should create a deterministic order with correct minor units and client payload', async () => {
      const result = await mockAdapter.createPaymentOrder(sampleOrderRequest);

      expect(result.provider).toBe('MOCK');
      expect(result.gatewayOrderId).toBe('order_mock_12345678');
      expect(result.amount).toBe(5000000);
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('INITIATED');
      expect(result.clientPayload.mockKey).toBeDefined();
      expect(result.rawPayload.mock_id).toBe('order_mock_12345678');
    });

    it('1.3 should reject non-positive amounts with VALIDATION_ERROR', async () => {
      await expect(
        mockAdapter.createPaymentOrder({
          ...sampleOrderRequest,
          amount: 0,
        }),
      ).rejects.toThrow('Payment amount must be greater than zero');
    });

    it('1.4 should simulate controlled order failure when requested', async () => {
      await expect(
        mockAdapter.createPaymentOrder({
          ...sampleOrderRequest,
          bookingReference: 'FAIL_ORDER_123',
        }),
      ).rejects.toThrow('Mock gateway simulated order rejection');
    });

    it('1.5 should verify mock payment successfully', async () => {
      const verified = await mockAdapter.verifyPayment({
        gatewayOrderId: 'order_mock_12345678',
        gatewayPaymentId: 'pay_mock_9999',
        amount: 5000000,
        currency: 'INR',
      });

      expect(verified.provider).toBe('MOCK');
      expect(verified.status).toBe('SUCCESS');
      expect(verified.gatewayOrderId).toBe('order_mock_12345678');
      expect(verified.gatewayPaymentId).toBe('pay_mock_9999');
    });

    it('1.6 should fail verification for invalid mock signature', async () => {
      await expect(
        mockAdapter.verifyPayment({
          gatewayOrderId: 'order_mock_12345678',
          gatewayPaymentId: 'pay_mock_9999',
          gatewaySignature: 'INVALID_SIGNATURE',
          amount: 5000000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Mock payment signature verification failed');
    });

    it('1.7 should get mock payment status', async () => {
      const statusSuccess = await mockAdapter.getPaymentStatus({
        gatewayOrderId: 'order_mock_12345678',
      });
      expect(statusSuccess.status).toBe('SUCCESS');

      const statusFailed = await mockAdapter.getPaymentStatus({
        gatewayOrderId: 'order_mock_FAIL_12345678',
      });
      expect(statusFailed.status).toBe('FAILED');
    });
  });

  // ============================================================
  // 2. RazorpayPaymentGatewayAdapter Tests
  // ============================================================
  describe('2. RazorpayPaymentGatewayAdapter', () => {
    it('2.1 should throw configuration error when credentials are not provided', async () => {
      const unconfigured = new RazorpayPaymentGatewayAdapter({});
      await expect(unconfigured.createPaymentOrder(sampleOrderRequest)).rejects.toThrow(
        'Razorpay payment gateway credentials are not configured',
      );
    });

    it('2.2 should create order and return client payload with server credentials keyId', async () => {
      const adapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_KEY12345',
        keySecret: 'secret_test_SECRET12345',
      });

      // Stub Razorpay orders.create internally
      const mockOrder = {
        id: 'order_rzp_abc123',
        entity: 'order',
        amount: 5000000,
        amount_paid: 0,
        amount_due: 5000000,
        currency: 'INR',
        receipt: 'rcpt_tx_12345678',
        status: 'created',
        attempts: 0,
        notes: { bookingReference: sampleOrderRequest.bookingReference },
        created_at: 1727376000,
      };

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.orders, 'create').mockResolvedValueOnce(mockOrder);

      const result = await adapter.createPaymentOrder(sampleOrderRequest);

      expect(result.provider).toBe('RAZORPAY');
      expect(result.gatewayOrderId).toBe('order_rzp_abc123');
      expect(result.amount).toBe(5000000);
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('INITIATED');
      expect(result.clientPayload.keyId).toBe('rzp_test_KEY12345');
      expect(result.clientPayload.orderId).toBe('order_rzp_abc123');
      expect(result.clientPayload.amount).toBe(5000000);
    });

    it('2.3 should cryptographically verify valid HMAC SHA-256 signature', async () => {
      const keySecret = 'secret_test_SECRET12345';
      const adapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_KEY12345',
        keySecret,
      });

      const orderId = 'order_rzp_abc123';
      const paymentId = 'pay_rzp_xyz789';
      const validSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const verified = await adapter.verifyPayment({
        gatewayOrderId: orderId,
        gatewayPaymentId: paymentId,
        gatewaySignature: validSignature,
        amount: 5000000,
        currency: 'INR',
      });

      expect(verified.provider).toBe('RAZORPAY');
      expect(verified.status).toBe('SUCCESS');
      expect(verified.gatewayOrderId).toBe(orderId);
      expect(verified.gatewayPaymentId).toBe(paymentId);
    });

    it('2.4 should reject invalid HMAC SHA-256 signature', async () => {
      const adapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_KEY12345',
        keySecret: 'secret_test_SECRET12345',
      });

      await expect(
        adapter.verifyPayment({
          gatewayOrderId: 'order_rzp_abc123',
          gatewayPaymentId: 'pay_rzp_xyz789',
          gatewaySignature: 'tampered_signature_hex_digest_9999',
          amount: 5000000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Razorpay payment signature verification failed');
    });

    it('2.5 should fetch payment status and map captured -> SUCCESS', async () => {
      const adapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_KEY12345',
        keySecret: 'secret_test_SECRET12345',
      });

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.payments, 'fetch').mockResolvedValueOnce({
        id: 'pay_rzp_xyz789',
        order_id: 'order_rzp_abc123',
        amount: 5000000,
        currency: 'INR',
        status: 'captured',
      });

      const status = await adapter.getPaymentStatus({
        gatewayPaymentId: 'pay_rzp_xyz789',
      });

      expect(status.status).toBe('SUCCESS');
      expect(status.gatewayPaymentId).toBe('pay_rzp_xyz789');
      expect(status.gatewayOrderId).toBe('order_rzp_abc123');
      expect(status.amount).toBe(5000000);
    });

    it('2.6 should normalize network/connection error to 503 SERVICE_UNAVAILABLE', async () => {
      const adapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_KEY12345',
        keySecret: 'secret_test_SECRET12345',
      });

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.orders, 'create').mockRejectedValueOnce(
        new Error('ENOTFOUND api.razorpay.com - connection timeout'),
      );

      try {
        await adapter.createPaymentOrder(sampleOrderRequest);
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(503);
        expect((err as AppError).code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
      }
    });
  });

  // ============================================================
  // 3. StripePaymentGatewayAdapter Tests
  // ============================================================
  describe('3. StripePaymentGatewayAdapter', () => {
    it('3.1 should throw configuration error when secretKey is not provided', async () => {
      const unconfigured = new StripePaymentGatewayAdapter({});
      await expect(unconfigured.createPaymentOrder(sampleOrderRequest)).rejects.toThrow(
        'Stripe payment gateway credentials are not configured',
      );
    });

    it('3.2 should create PaymentIntent and return clientPayload with clientSecret', async () => {
      const adapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_SECRET12345',
        publishableKey: 'pk_test_PUB12345',
      });

      const mockPaymentIntent = {
        id: 'pi_stripe_12345',
        object: 'payment_intent',
        amount: 5000000,
        currency: 'inr',
        status: 'requires_payment_method',
        client_secret: 'pi_stripe_12345_secret_abcde',
        metadata: { bookingReference: sampleOrderRequest.bookingReference },
      };

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.paymentIntents, 'create').mockResolvedValueOnce(
        mockPaymentIntent as never,
      );

      const result = await adapter.createPaymentOrder(sampleOrderRequest);

      expect(result.provider).toBe('STRIPE');
      expect(result.gatewayOrderId).toBe('pi_stripe_12345');
      expect(result.amount).toBe(5000000);
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('PENDING');
      expect(result.clientPayload.clientSecret).toBe('pi_stripe_12345_secret_abcde');
      expect(result.clientPayload.publishableKey).toBe('pk_test_PUB12345');
    });

    it('3.3 should verify PaymentIntent status when succeeded', async () => {
      const adapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_SECRET12345',
        publishableKey: 'pk_test_PUB12345',
      });

      const mockPaymentIntent = {
        id: 'pi_stripe_12345',
        amount: 5000000,
        currency: 'inr',
        status: 'succeeded',
        latest_charge: 'ch_stripe_charge123',
      };

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.paymentIntents, 'retrieve').mockResolvedValueOnce(
        mockPaymentIntent as never,
      );

      const verified = await adapter.verifyPayment({
        gatewayOrderId: 'pi_stripe_12345',
        amount: 5000000,
        currency: 'INR',
      });

      expect(verified.provider).toBe('STRIPE');
      expect(verified.status).toBe('SUCCESS');
      expect(verified.gatewayOrderId).toBe('pi_stripe_12345');
      expect(verified.gatewayPaymentId).toBe('ch_stripe_charge123');
      expect(verified.amount).toBe(5000000);
    });

    it('3.4 should reject verification if PaymentIntent is not succeeded', async () => {
      const adapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_SECRET12345',
      });

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.paymentIntents, 'retrieve').mockResolvedValueOnce({
        id: 'pi_stripe_12345',
        status: 'requires_action',
      } as never);

      await expect(
        adapter.verifyPayment({
          gatewayOrderId: 'pi_stripe_12345',
          amount: 5000000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Stripe payment has not succeeded');
    });

    it('3.5 should normalize card decline error to 400 PAYMENT_GATEWAY_REJECTED', async () => {
      const adapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_SECRET12345',
      });

      // @ts-expect-error accessing private client for stubbing
      vi.spyOn(adapter.client.paymentIntents, 'create').mockRejectedValueOnce(
        new Error('Your card was declined. Insufficient funds.'),
      );

      try {
        await adapter.createPaymentOrder(sampleOrderRequest);
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_GATEWAY_REJECTED);
      }
    });
  });

  // ============================================================
  // 4. PaymentGatewayFactory Tests
  // ============================================================
  describe('4. PaymentGatewayFactory', () => {
    const config = loadEnv();
    const factory = new PaymentGatewayFactory(config);

    it('4.1 should resolve MOCK adapter', () => {
      const adapter = factory.getAdapter('MOCK');
      expect(adapter).toBeInstanceOf(MockPaymentGatewayAdapter);
      expect(adapter.provider).toBe('MOCK');
    });

    it('4.2 should resolve RAZORPAY adapter', () => {
      const adapter = factory.getAdapter('RAZORPAY');
      expect(adapter).toBeInstanceOf(RazorpayPaymentGatewayAdapter);
      expect(adapter.provider).toBe('RAZORPAY');
    });

    it('4.3 should resolve STRIPE adapter', () => {
      const adapter = factory.getAdapter('STRIPE');
      expect(adapter).toBeInstanceOf(StripePaymentGatewayAdapter);
      expect(adapter.provider).toBe('STRIPE');
    });

    it('4.4 should resolve default configured provider when called without argument', () => {
      const adapter = factory.getAdapter();
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe(config.DEFAULT_PAYMENT_PROVIDER);
    });

    it('4.5 should throw 400 VALIDATION_ERROR for unsupported provider', () => {
      try {
        factory.getAdapter('BITCOIN');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe(ErrorCodes.VALIDATION_ERROR);
        expect((err as AppError).message).toContain('Unsupported payment provider');
      }
    });

    it('4.6 should list all registered providers', () => {
      const providers = factory.getRegisteredProviders();
      expect(providers).toContain('MOCK');
      expect(providers).toContain('RAZORPAY');
      expect(providers).toContain('STRIPE');
    });
  });
});
