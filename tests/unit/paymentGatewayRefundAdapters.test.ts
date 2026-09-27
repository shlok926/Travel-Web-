import { describe, it, expect } from 'vitest';
import { MockPaymentGatewayAdapter } from '../../backend/src/modules/payment/adapters/mock.adapter.js';
import { RazorpayPaymentGatewayAdapter } from '../../backend/src/modules/payment/adapters/razorpay.adapter.js';
import { StripePaymentGatewayAdapter } from '../../backend/src/modules/payment/adapters/stripe.adapter.js';

describe('Phase 6 Step 10 — Payment Gateway Refund Adapters (Unit)', () => {
  describe('Mock Payment Gateway Refund', () => {
    const adapter = new MockPaymentGatewayAdapter();

    it('should process a successful mock refund', async () => {
      const result = await adapter.refundPayment({
        gatewayPaymentId: 'pay_mock_12345',
        amount: 50000,
        currency: 'INR',
        reason: 'Customer requested cancellation',
        receipt: 'rfnd_12345678',
      });

      expect(result.provider).toBe('MOCK');
      expect(result.gatewayRefundId).toBe('rfnd_mock_12345678');
      expect(result.gatewayPaymentId).toBe('pay_mock_12345');
      expect(result.amount).toBe(50000);
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('SETTLED');
    });

    it('should simulate refund failure when identifier contains FAIL_REFUND', async () => {
      await expect(
        adapter.refundPayment({
          gatewayPaymentId: 'pay_mock_FAIL_REFUND_999',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Mock payment gateway simulated refund failure');
    });

    it('should simulate refund failure when notes forceFail is true', async () => {
      await expect(
        adapter.refundPayment({
          gatewayPaymentId: 'pay_mock_test',
          amount: 50000,
          currency: 'INR',
          notes: { forceFail: 'true' },
        }),
      ).rejects.toThrow('Mock payment gateway simulated refund failure');
    });

    it('should reject negative refund amounts', async () => {
      await expect(
        adapter.refundPayment({
          gatewayPaymentId: 'pay_mock_test',
          amount: -100,
          currency: 'INR',
        }),
      ).rejects.toThrow('Refund amount cannot be negative');
    });

    it('should simulate ambiguous timeout when identifier contains TIMEOUT', async () => {
      await expect(
        adapter.refundPayment({
          gatewayPaymentId: 'pay_mock_TIMEOUT_999',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow(
        'Payment gateway temporarily unreachable / timeout during refund processing',
      );
    });

    it('should simulate internal provider error when identifier contains FAIL_PROVIDER', async () => {
      await expect(
        adapter.refundPayment({
          gatewayPaymentId: 'pay_mock_FAIL_PROVIDER_999',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Payment gateway internal provider failure');
    });

    it('should return PROCESSING status when identifier contains PROCESSING', async () => {
      const result = await adapter.refundPayment({
        gatewayPaymentId: 'pay_mock_PROCESSING_999',
        amount: 50000,
        currency: 'INR',
        receipt: 'rfnd_async_123',
      });

      expect(result.status).toBe('PROCESSING');
      expect(result.gatewayRefundId).toBe('rfnd_mock_async_123');
    });

    it('should produce deterministic gatewayRefundId when identical receipt is provided (Idempotency)', async () => {
      const res1 = await adapter.refundPayment({
        gatewayPaymentId: 'pay_mock_12345',
        amount: 50000,
        currency: 'INR',
        receipt: 'rfnd_stable_idempotency_1',
      });

      const res2 = await adapter.refundPayment({
        gatewayPaymentId: 'pay_mock_12345',
        amount: 50000,
        currency: 'INR',
        receipt: 'rfnd_stable_idempotency_1',
      });

      expect(res1.gatewayRefundId).toBe(res2.gatewayRefundId);
    });
  });

  describe('Razorpay Payment Gateway Refund', () => {
    it('should throw error when credentials are not configured', async () => {
      const unconfiguredAdapter = new RazorpayPaymentGatewayAdapter({});
      await expect(
        unconfiguredAdapter.refundPayment({
          gatewayPaymentId: 'pay_rzp_12345',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Razorpay payment gateway credentials are not configured');
    });

    it('should validate missing gatewayPaymentId', async () => {
      const configuredAdapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
      });

      await expect(
        configuredAdapter.refundPayment({
          gatewayPaymentId: '',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Razorpay payment ID is required for refund processing');
    });

    it('should validate refund amount greater than zero', async () => {
      const configuredAdapter = new RazorpayPaymentGatewayAdapter({
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
      });

      await expect(
        configuredAdapter.refundPayment({
          gatewayPaymentId: 'pay_rzp_123',
          amount: 0,
          currency: 'INR',
        }),
      ).rejects.toThrow('Refund amount must be greater than zero');
    });
  });

  describe('Stripe Payment Gateway Refund', () => {
    it('should throw error when credentials are not configured', async () => {
      const unconfiguredAdapter = new StripePaymentGatewayAdapter({});
      await expect(
        unconfiguredAdapter.refundPayment({
          gatewayOrderId: 'pi_test_12345',
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Stripe payment gateway credentials are not configured');
    });

    it('should validate missing payment intent and charge ID', async () => {
      const configuredAdapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_12345',
        publishableKey: 'pk_test_12345',
      });

      await expect(
        configuredAdapter.refundPayment({
          amount: 50000,
          currency: 'INR',
        }),
      ).rejects.toThrow('Stripe PaymentIntent ID or Charge ID is required for refund processing');
    });

    it('should validate refund amount greater than zero', async () => {
      const configuredAdapter = new StripePaymentGatewayAdapter({
        secretKey: 'sk_test_12345',
        publishableKey: 'pk_test_12345',
      });

      await expect(
        configuredAdapter.refundPayment({
          gatewayOrderId: 'pi_test_123',
          amount: 0,
          currency: 'INR',
        }),
      ).rejects.toThrow('Refund amount must be greater than zero');
    });
  });
});
