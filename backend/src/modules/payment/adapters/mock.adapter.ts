import {
  PaymentGatewayAdapter,
  CreateGatewayOrderRequest,
  GatewayOrderResult,
  VerifyPaymentRequest,
  GetPaymentStatusRequest,
  RefundGatewayPaymentRequest,
  RefundGatewayResult,
} from './paymentGateway.adapter.js';
import {
  PaymentProvider,
  NormalizedPaymentResult,
  AppError,
  ErrorCodes,
} from '../../../../../shared/src/index.js';

export class MockPaymentGatewayAdapter implements PaymentGatewayAdapter {
  public readonly provider: PaymentProvider = 'MOCK';

  /**
   * Creates a deterministic mock order.
   */
  async createPaymentOrder(request: CreateGatewayOrderRequest): Promise<GatewayOrderResult> {
    if (request.amount <= 0) {
      throw AppError.badRequest(
        'Payment amount must be greater than zero',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Controlled failure simulation
    if (request.bookingReference.includes('FAIL_ORDER') || request.notes?.forceFail === 'true') {
      throw new AppError(
        'Mock gateway simulated order rejection',
        400,
        ErrorCodes.PAYMENT_GATEWAY_REJECTED,
      );
    }

    const orderSuffix = request.receipt ? request.receipt.slice(-8) : request.bookingReference;
    const gatewayOrderId = `order_mock_${orderSuffix}`;

    return {
      provider: this.provider,
      gatewayOrderId,
      amount: request.amount,
      currency: request.currency,
      status: 'INITIATED',
      clientPayload: {
        provider: 'MOCK',
        orderId: gatewayOrderId,
        amount: request.amount,
        currency: request.currency,
        mockKey: 'mock_key_test_12345',
      },
      rawPayload: {
        mock_id: gatewayOrderId,
        status: 'created',
        amount: request.amount,
        currency: request.currency,
        created_at: Math.floor(Date.now() / 1000),
      },
    };
  }

  /**
   * Verifies mock payment.
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<NormalizedPaymentResult> {
    const paymentId = request.gatewayPaymentId ?? `pay_mock_${Date.now()}`;

    // Controlled failure simulation
    if (
      request.gatewaySignature === 'INVALID_SIGNATURE' ||
      request.gatewayOrderId?.includes('FAIL')
    ) {
      throw new AppError(
        'Mock payment signature verification failed',
        400,
        ErrorCodes.PAYMENT_VERIFICATION_FAILED,
      );
    }

    return {
      provider: this.provider,
      gatewayOrderId: request.gatewayOrderId ?? null,
      gatewayPaymentId: paymentId,
      status: 'SUCCESS',
      amount: request.amount,
      currency: request.currency,
      rawPayload: {
        id: paymentId,
        order_id: request.gatewayOrderId,
        status: 'captured',
        amount: request.amount,
        currency: request.currency,
      },
    };
  }

  /**
   * Gets mock payment status.
   */
  async getPaymentStatus(request: GetPaymentStatusRequest): Promise<NormalizedPaymentResult> {
    const identifier = request.gatewayPaymentId ?? request.gatewayOrderId;
    if (!identifier) {
      throw AppError.badRequest(
        'Gateway order ID or payment ID is required',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const isFailed = identifier.includes('FAIL');

    return {
      provider: this.provider,
      gatewayOrderId: request.gatewayOrderId ?? null,
      gatewayPaymentId: request.gatewayPaymentId ?? `pay_mock_status`,
      status: isFailed ? 'FAILED' : 'SUCCESS',
      amount: 0,
      currency: 'INR',
      rawPayload: {
        identifier,
        status: isFailed ? 'failed' : 'captured',
      },
    };
  }

  /**
   * Processes a deterministic mock refund.
   */
  async refundPayment(request: RefundGatewayPaymentRequest): Promise<RefundGatewayResult> {
    if (request.amount < 0) {
      throw AppError.badRequest(
        'Refund amount cannot be negative',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Controlled failure simulation
    const identifier = request.gatewayPaymentId ?? request.gatewayOrderId ?? '';
    if (identifier.includes('FAIL_REFUND') || request.notes?.forceFail === 'true') {
      throw new AppError(
        'Mock payment gateway simulated refund failure',
        400,
        ErrorCodes.REFUND_FAILED,
      );
    }

    const refundSuffix = request.receipt
      ? request.receipt.slice(-8)
      : Math.random().toString(36).slice(2, 8).toUpperCase();
    const gatewayRefundId = `rfnd_mock_${refundSuffix}`;

    return {
      provider: this.provider,
      gatewayRefundId,
      gatewayPaymentId: request.gatewayPaymentId ?? null,
      amount: request.amount,
      currency: request.currency,
      status: 'SETTLED',
      rawPayload: {
        id: gatewayRefundId,
        payment_id: request.gatewayPaymentId,
        amount: request.amount,
        currency: request.currency,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      },
    };
  }
}
