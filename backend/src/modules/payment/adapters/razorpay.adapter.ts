import crypto from 'crypto';
import Razorpay from 'razorpay';
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
  PaymentStatus,
  RefundSettlementStatus,
  SupportedCurrency,
  NormalizedPaymentResult,
  AppError,
  ErrorCodes,
} from '../../../../../shared/src/index.js';

export interface RazorpayAdapterConfig {
  keyId?: string;
  keySecret?: string;
}

export class RazorpayPaymentGatewayAdapter implements PaymentGatewayAdapter {
  public readonly provider: PaymentProvider = 'RAZORPAY';
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly client: Razorpay | null = null;

  constructor(config: RazorpayAdapterConfig = {}) {
    this.keyId = config.keyId ?? '';
    this.keySecret = config.keySecret ?? '';

    if (this.keyId && this.keySecret) {
      this.client = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    }
  }

  private ensureConfigured(): Razorpay {
    if (!this.client || !this.keyId || !this.keySecret) {
      throw new AppError(
        'Razorpay payment gateway credentials are not configured',
        500,
        ErrorCodes.PAYMENT_PROVIDER_ERROR,
      );
    }
    return this.client;
  }

  /**
   * Creates an order with Razorpay using server-authoritative amount in paise (minor units).
   */
  async createPaymentOrder(request: CreateGatewayOrderRequest): Promise<GatewayOrderResult> {
    const razorpay = this.ensureConfigured();

    if (request.amount <= 0) {
      throw AppError.badRequest(
        'Payment amount must be greater than zero',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      // Razorpay receipt limit is 40 chars
      const receipt = request.receipt
        ? request.receipt.slice(0, 40)
        : request.bookingReference.slice(0, 40);

      const options = {
        amount: request.amount, // Minor units (e.g. paise)
        currency: request.currency,
        receipt,
        notes: {
          bookingReference: request.bookingReference,
          ...(request.customer?.email ? { customerEmail: request.customer.email } : {}),
          ...(request.notes ?? {}),
        },
      };

      const order = await razorpay.orders.create(options);

      return {
        provider: this.provider,
        gatewayOrderId: order.id,
        amount: Number(order.amount),
        currency: order.currency as SupportedCurrency,
        status: 'INITIATED',
        clientPayload: {
          provider: 'RAZORPAY',
          keyId: this.keyId,
          orderId: order.id,
          amount: Number(order.amount),
          currency: order.currency,
          name: 'Young Tours & Travels',
          description: `Booking ${request.bookingReference}`,
          prefill: {
            name: request.customer?.name ?? '',
            email: request.customer?.email ?? '',
            contact: request.customer?.phone ?? '',
          },
        },
        rawPayload: order as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to create Razorpay order');
    }
  }

  /**
   * Cryptographically verifies Razorpay payment signature (HMAC SHA-256).
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<NormalizedPaymentResult> {
    this.ensureConfigured();

    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = request;

    if (!gatewayOrderId || !gatewayPaymentId || !gatewaySignature) {
      throw new AppError(
        'Missing required parameters for Razorpay payment verification',
        400,
        ErrorCodes.PAYMENT_VERIFICATION_FAILED,
      );
    }

    const payload = `${gatewayOrderId}|${gatewayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const actualBuf = Buffer.from(gatewaySignature, 'utf-8');

    const isValid =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!isValid) {
      throw new AppError(
        'Razorpay payment signature verification failed',
        400,
        ErrorCodes.PAYMENT_VERIFICATION_FAILED,
      );
    }

    return {
      provider: this.provider,
      gatewayOrderId,
      gatewayPaymentId,
      status: 'SUCCESS',
      amount: request.amount,
      currency: request.currency,
      rawPayload: {
        order_id: gatewayOrderId,
        payment_id: gatewayPaymentId,
        signature: gatewaySignature,
        verified: true,
      },
    };
  }

  /**
   * Fetches latest payment details directly from Razorpay API.
   */
  async getPaymentStatus(request: GetPaymentStatusRequest): Promise<NormalizedPaymentResult> {
    const razorpay = this.ensureConfigured();

    if (!request.gatewayPaymentId && !request.gatewayOrderId) {
      throw AppError.badRequest(
        'Razorpay payment ID or order ID is required',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      if (request.gatewayPaymentId) {
        const payment = await razorpay.payments.fetch(request.gatewayPaymentId);
        const status = this.mapRazorpayStatus(payment.status);

        return {
          provider: this.provider,
          gatewayOrderId: payment.order_id ?? request.gatewayOrderId ?? null,
          gatewayPaymentId: payment.id,
          status,
          amount: Number(payment.amount),
          currency: payment.currency as SupportedCurrency,
          rawPayload: payment as unknown as Record<string, unknown>,
        };
      }

      // If only orderId is provided, fetch order payments
      const order = await razorpay.orders.fetch(request.gatewayOrderId!);
      return {
        provider: this.provider,
        gatewayOrderId: order.id,
        gatewayPaymentId: null,
        status: order.status === 'paid' ? 'SUCCESS' : 'PENDING',
        amount: Number(order.amount),
        currency: order.currency as SupportedCurrency,
        rawPayload: order as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to fetch Razorpay payment status');
    }
  }

  /**
   * Initiates a refund through Razorpay API for an eligible captured payment.
   */
  async refundPayment(request: RefundGatewayPaymentRequest): Promise<RefundGatewayResult> {
    const razorpay = this.ensureConfigured();

    if (!request.gatewayPaymentId) {
      throw AppError.badRequest(
        'Razorpay payment ID is required for refund processing',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    if (request.amount <= 0) {
      throw AppError.badRequest(
        'Refund amount must be greater than zero',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      const options: Record<string, unknown> = {
        amount: request.amount, // minor units (paise)
        notes: {
          reason: request.reason ?? 'Customer cancellation',
          ...(request.notes ?? {}),
        },
      };

      if (request.receipt) {
        options.receipt = request.receipt.slice(0, 40);
      }

      const refund = await razorpay.payments.refund(request.gatewayPaymentId, options);

      const status = this.mapRazorpayRefundStatus(refund.status);

      return {
        provider: this.provider,
        gatewayRefundId: refund.id,
        gatewayPaymentId: refund.payment_id ?? request.gatewayPaymentId,
        amount: Number(refund.amount),
        currency: (refund.currency ?? request.currency).toUpperCase() as SupportedCurrency,
        status,
        rawPayload: refund as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to process Razorpay refund');
    }
  }

  private mapRazorpayStatus(status: string): PaymentStatus {
    switch (status) {
      case 'captured':
        return 'SUCCESS';
      case 'authorized':
      case 'created':
        return 'PENDING';
      case 'failed':
        return 'FAILED';
      case 'refunded':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  private mapRazorpayRefundStatus(status: string): RefundSettlementStatus {
    switch (status) {
      case 'processed':
        return 'SETTLED';
      case 'pending':
        return 'PROCESSING';
      case 'failed':
        return 'FAILED';
      default:
        return 'PROCESSING';
    }
  }

  private normalizeAndThrowError(err: unknown, defaultMessage: string): never {
    if (err instanceof AppError) {
      throw err;
    }

    const errorMessage =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : defaultMessage;

    // Check for network or connection issues
    if (
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('enotfound') ||
      errorMessage.toLowerCase().includes('econnrefused') ||
      errorMessage.toLowerCase().includes('timeout')
    ) {
      throw new AppError(
        'Payment gateway temporarily unreachable. Please try again.',
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
      );
    }

    // Check for authentication / bad key / bad request
    if (
      errorMessage.toLowerCase().includes('authentication') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('bad request')
    ) {
      throw new AppError(
        `Payment gateway rejected request: ${errorMessage}`,
        400,
        ErrorCodes.PAYMENT_GATEWAY_REJECTED,
      );
    }

    throw new AppError(
      `${defaultMessage}: ${errorMessage}`,
      500,
      ErrorCodes.PAYMENT_PROVIDER_ERROR,
    );
  }
}
