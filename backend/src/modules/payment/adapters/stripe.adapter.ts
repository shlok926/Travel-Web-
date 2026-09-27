import Stripe from 'stripe';
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

export interface StripeAdapterConfig {
  secretKey?: string;
  publishableKey?: string;
}

export class StripePaymentGatewayAdapter implements PaymentGatewayAdapter {
  public readonly provider: PaymentProvider = 'STRIPE';
  private readonly secretKey: string;
  private readonly publishableKey: string;
  private readonly client: Stripe | null = null;

  constructor(config: StripeAdapterConfig = {}) {
    this.secretKey = config.secretKey ?? '';
    this.publishableKey = config.publishableKey ?? '';

    if (this.secretKey) {
      this.client = new Stripe(this.secretKey);
    }
  }

  private ensureConfigured(): Stripe {
    if (!this.client || !this.secretKey) {
      throw new AppError(
        'Stripe payment gateway credentials are not configured',
        500,
        ErrorCodes.PAYMENT_PROVIDER_ERROR,
      );
    }
    return this.client;
  }

  /**
   * Creates a Stripe PaymentIntent using server-authoritative amount in minor units.
   */
  async createPaymentOrder(request: CreateGatewayOrderRequest): Promise<GatewayOrderResult> {
    const stripe = this.ensureConfigured();

    if (request.amount <= 0) {
      throw AppError.badRequest(
        'Payment amount must be greater than zero',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: request.amount, // minor units (cents / paise)
        currency: request.currency.toLowerCase(),
        description: `Booking ${request.bookingReference}`,
        receipt_email: request.customer?.email,
        metadata: {
          bookingReference: request.bookingReference,
          receipt: request.receipt ?? '',
          ...(request.notes ?? {}),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        provider: this.provider,
        gatewayOrderId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as SupportedCurrency,
        status: this.mapStripeStatus(paymentIntent.status),
        clientPayload: {
          provider: 'STRIPE',
          publishableKey: this.publishableKey,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency.toUpperCase(),
        },
        rawPayload: paymentIntent as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to create Stripe payment intent');
    }
  }

  /**
   * Verifies Stripe PaymentIntent status on server side.
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<NormalizedPaymentResult> {
    const stripe = this.ensureConfigured();

    const paymentIntentId = request.gatewayOrderId ?? request.gatewayPaymentId;
    if (!paymentIntentId) {
      throw new AppError(
        'Missing PaymentIntent ID for Stripe payment verification',
        400,
        ErrorCodes.PAYMENT_VERIFICATION_FAILED,
      );
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const status = this.mapStripeStatus(paymentIntent.status);

      if (status !== 'SUCCESS') {
        throw new AppError(
          `Stripe payment has not succeeded. Current status: ${paymentIntent.status}`,
          400,
          ErrorCodes.PAYMENT_VERIFICATION_FAILED,
        );
      }

      const latestCharge =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : (paymentIntent.latest_charge?.id ?? null);

      return {
        provider: this.provider,
        gatewayOrderId: paymentIntent.id,
        gatewayPaymentId: latestCharge,
        status: 'SUCCESS',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as SupportedCurrency,
        rawPayload: paymentIntent as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to verify Stripe payment');
    }
  }

  /**
   * Fetches latest status of PaymentIntent from Stripe.
   */
  async getPaymentStatus(request: GetPaymentStatusRequest): Promise<NormalizedPaymentResult> {
    const stripe = this.ensureConfigured();

    const paymentIntentId = request.gatewayOrderId ?? request.gatewayPaymentId;
    if (!paymentIntentId) {
      throw AppError.badRequest(
        'Stripe PaymentIntent ID is required',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const status = this.mapStripeStatus(paymentIntent.status);

      const latestCharge =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : (paymentIntent.latest_charge?.id ?? null);

      return {
        provider: this.provider,
        gatewayOrderId: paymentIntent.id,
        gatewayPaymentId: latestCharge,
        status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as SupportedCurrency,
        rawPayload: paymentIntent as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to fetch Stripe payment status');
    }
  }

  /**
   * Initiates a refund through Stripe API for an eligible payment.
   */
  async refundPayment(request: RefundGatewayPaymentRequest): Promise<RefundGatewayResult> {
    const stripe = this.ensureConfigured();

    if (!request.gatewayOrderId && !request.gatewayPaymentId) {
      throw AppError.badRequest(
        'Stripe PaymentIntent ID or Charge ID is required for refund processing',
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
      const refundParams: Stripe.RefundCreateParams = {
        amount: request.amount, // minor units (cents / paise)
        metadata: {
          reason: request.reason ?? 'Customer cancellation',
          receipt: request.receipt ?? '',
          ...(request.notes ?? {}),
        },
      };

      if (request.gatewayOrderId) {
        refundParams.payment_intent = request.gatewayOrderId;
      } else if (request.gatewayPaymentId) {
        refundParams.charge = request.gatewayPaymentId;
      }

      const idempotencyKey = request.receipt
        ? `rfnd_stripe_${request.receipt}`
        : `rfnd_stripe_${request.gatewayOrderId ?? request.gatewayPaymentId}`;

      const refund = await stripe.refunds.create(refundParams, { idempotencyKey });
      const status = this.mapStripeRefundStatus(refund.status);

      const chargeId =
        typeof refund.charge === 'string' ? refund.charge : (refund.charge?.id ?? null);

      return {
        provider: this.provider,
        gatewayRefundId: refund.id,
        gatewayPaymentId: chargeId ?? request.gatewayPaymentId ?? null,
        amount: refund.amount,
        currency: refund.currency.toUpperCase() as SupportedCurrency,
        status,
        rawPayload: refund as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      this.normalizeAndThrowError(err, 'Failed to process Stripe refund');
    }
  }

  private mapStripeStatus(status: string): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return 'SUCCESS';
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
      case 'processing':
        return 'PENDING';
      case 'canceled':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private mapStripeRefundStatus(status: string | null | undefined): RefundSettlementStatus {
    switch (status) {
      case 'succeeded':
        return 'SETTLED';
      case 'pending':
        return 'PROCESSING';
      case 'failed':
      case 'canceled':
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

    // Network / timeout
    if (
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('connection') ||
      errorMessage.toLowerCase().includes('timeout')
    ) {
      throw new AppError(
        'Payment gateway temporarily unreachable. Please try again.',
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
      );
    }

    // Card decline / invalid request
    if (
      errorMessage.toLowerCase().includes('card') ||
      errorMessage.toLowerCase().includes('declined') ||
      errorMessage.toLowerCase().includes('invalid') ||
      errorMessage.toLowerCase().includes('authentication')
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
