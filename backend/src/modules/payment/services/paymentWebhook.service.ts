import crypto from 'node:crypto';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { PaymentTransactionRepository } from '../repositories/paymentTransaction.repository.js';
import { PaymentEventRepository } from '../repositories/paymentEvent.repository.js';
import { EnvConfig } from '../../../config/env.js';
import {
  AppError,
  ErrorCodes,
  NormalizedWebhookEvent,
  PaymentProvider,
  SupportedCurrency,
} from '../../../../../shared/src/index.js';

export interface ProcessWebhookCommand {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  queryProvider?: string;
  paramProvider?: string;
  parsedBody?: Record<string, unknown>;
}

export interface WebhookProcessingResult {
  success: boolean;
  duplicate: boolean;
  matched: boolean;
  eventId: string;
  eventType: string;
  provider: PaymentProvider;
  transactionId?: string;
  status?: string;
  message?: string;
}

export class PaymentWebhookService {
  constructor(
    private readonly db: DatabaseService,
    private readonly paymentTxRepo: PaymentTransactionRepository,
    private readonly paymentEventRepo: PaymentEventRepository,
    private readonly config: EnvConfig,
  ) {}

  /**
   * Processes inbound payment gateway webhook.
   *
   * Lifecycle & Security Controls:
   * 1. Detect provider from query, route param, header, or signature headers.
   * 2. Perform cryptographic HMAC-SHA256 verification using exact raw body and timing-safe comparison.
   * 3. Normalize provider-specific payload into canonical `NormalizedWebhookEvent`.
   * 4. Enforce event idempotency via `payment_events(provider, event_id)` uniqueness.
   * 5. Look up matching local `payment_transactions` record using gateway identifiers.
   * 6. Enforce strict integer minor unit amount and currency equality.
   * 7. Transition local payment transaction status with concurrency guards.
   * 8. Persist audit record in `payment_events`.
   * 9. HARD BOUNDARY: Never mutates booking status or inventory in Step 6.
   */
  async processWebhook(command: ProcessWebhookCommand): Promise<WebhookProcessingResult> {
    const { rawBody, headers, queryProvider, paramProvider, parsedBody } = command;

    if (!rawBody || typeof rawBody !== 'string') {
      throw AppError.badRequest(
        'Missing raw request body for webhook signature verification',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // 1. Identify provider
    const provider = this.detectProvider(queryProvider, paramProvider, headers, parsedBody);

    // 2. Cryptographic signature verification using exact raw bytes
    this.verifySignature(provider, rawBody, headers);

    // 3. Normalize provider payload
    const normalized = this.normalizeWebhookEvent(provider, rawBody, parsedBody, headers);

    // 4. Event Idempotency Check
    const existingEvent = await this.paymentEventRepo.findByProviderAndEventId(
      normalized.provider,
      normalized.eventId,
    );

    if (existingEvent) {
      return {
        success: true,
        duplicate: true,
        matched: true,
        eventId: normalized.eventId,
        eventType: normalized.eventType,
        provider: normalized.provider as PaymentProvider,
        message: 'Event already processed (idempotent replay)',
      };
    }

    // 5. Payment Transaction Matching
    let paymentTx = null;
    if (normalized.gatewayOrderId) {
      paymentTx = await this.paymentTxRepo.findByProviderOrderId(
        normalized.provider,
        normalized.gatewayOrderId,
      );
    }

    if (!paymentTx && normalized.gatewayPaymentId) {
      paymentTx = await this.paymentTxRepo.findByProviderPaymentId(
        normalized.provider,
        normalized.gatewayPaymentId,
      );
    }

    // If no matching transaction found, throw PAYMENT_NOT_FOUND so provider retries when transaction is available
    if (!paymentTx) {
      throw AppError.notFound(
        `No matching payment transaction found for provider ${normalized.provider} (orderId: ${normalized.gatewayOrderId ?? 'none'}, paymentId: ${normalized.gatewayPaymentId ?? 'none'})`,
        ErrorCodes.PAYMENT_NOT_FOUND,
      );
    }

    // 6. Financial Integrity Validation (Integer minor units, no floats, no x100 multiplication)
    if (normalized.amount > 0 && normalized.amount !== paymentTx.amount) {
      throw AppError.badRequest(
        `Payment amount mismatch: webhook contains ${normalized.amount} minor units, local transaction expected ${paymentTx.amount} minor units`,
        [
          {
            field: 'amount',
            issue: `Amount mismatch: expected ${paymentTx.amount}, received ${normalized.amount}`,
          },
        ],
        ErrorCodes.PAYMENT_AMOUNT_MISMATCH,
      );
    }

    if (normalized.currency && normalized.currency !== paymentTx.currency) {
      throw AppError.badRequest(
        `Payment currency mismatch: webhook contains ${normalized.currency}, local transaction expected ${paymentTx.currency}`,
        [
          {
            field: 'currency',
            issue: `Currency mismatch: expected ${paymentTx.currency}, received ${normalized.currency}`,
          },
        ],
        ErrorCodes.PAYMENT_CURRENCY_MISMATCH,
      );
    }

    // 7. Atomic DB Transaction for guarded state transition & event persistence
    try {
      await this.db.withTransaction(async (client) => {
        // Update gateway identifiers if new payment ID is received
        if (normalized.gatewayPaymentId && !paymentTx.gatewayPaymentId) {
          await this.paymentTxRepo.updateGatewayIdentifiers(
            paymentTx.id,
            { gatewayPaymentId: normalized.gatewayPaymentId },
            client,
          );
        }

        // Guarded payment status transitions
        if (normalized.status === 'SUCCESS') {
          if (paymentTx.status === 'INITIATED' || paymentTx.status === 'PENDING') {
            await this.paymentTxRepo.updateStatusGuarded(
              paymentTx.id,
              ['INITIATED', 'PENDING'],
              'SUCCESS',
              client,
            );
          }
        } else if (normalized.status === 'FAILED') {
          if (paymentTx.status === 'INITIATED' || paymentTx.status === 'PENDING') {
            await this.paymentTxRepo.updateStatusGuarded(
              paymentTx.id,
              ['INITIATED', 'PENDING'],
              'FAILED',
              client,
            );
          }
        } else if (normalized.status === 'REFUNDED') {
          if (
            paymentTx.status === 'SUCCESS' ||
            paymentTx.status === 'PENDING' ||
            paymentTx.status === 'INITIATED'
          ) {
            await this.paymentTxRepo.updateStatusGuarded(
              paymentTx.id,
              ['SUCCESS', 'PENDING', 'INITIATED'],
              'REFUNDED',
              client,
            );
          }
        }

        // Persist event in payment_events table
        await this.paymentEventRepo.create(
          {
            provider: normalized.provider,
            eventId: normalized.eventId,
            eventType: normalized.eventType,
            payload: normalized.payload,
            processedAt: new Date(),
          },
          client,
        );
      });
    } catch (err: unknown) {
      // Check for concurrent duplicate race condition (PostgreSQL error 23505 unique_violation)
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        return {
          success: true,
          duplicate: true,
          matched: true,
          eventId: normalized.eventId,
          eventType: normalized.eventType,
          provider: normalized.provider as PaymentProvider,
          transactionId: paymentTx.id,
          message: 'Concurrent duplicate event handled safely',
        };
      }

      throw err;
    }

    return {
      success: true,
      duplicate: false,
      matched: true,
      eventId: normalized.eventId,
      eventType: normalized.eventType,
      provider: normalized.provider as PaymentProvider,
      transactionId: paymentTx.id,
      status: normalized.status,
    };
  }

  /**
   * Identifies the payment provider.
   */
  private detectProvider(
    queryProvider?: string,
    paramProvider?: string,
    headers: Record<string, string | string[] | undefined> = {},
    parsedBody?: Record<string, unknown>,
  ): PaymentProvider {
    const candidate =
      paramProvider ||
      queryProvider ||
      (headers['x-payment-provider'] as string) ||
      (parsedBody?.provider as string);

    if (candidate) {
      const upper = candidate.toUpperCase();
      if (upper === 'RAZORPAY' || upper === 'STRIPE' || upper === 'MOCK') {
        return upper as PaymentProvider;
      }
    }

    // Auto-detection by signature header
    if (headers['x-razorpay-signature'] || headers['x-razorpay-event-id']) {
      return 'RAZORPAY';
    }
    if (headers['stripe-signature']) {
      return 'STRIPE';
    }
    if (headers['x-mock-signature'] || headers['x-webhook-signature']) {
      return 'MOCK';
    }

    return (this.config.DEFAULT_PAYMENT_PROVIDER as PaymentProvider) ?? 'MOCK';
  }

  /**
   * Cryptographically verifies HMAC-SHA256 webhook signatures using constant-time comparison.
   */
  private verifySignature(
    provider: PaymentProvider,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    if (provider === 'RAZORPAY') {
      const signature = headers['x-razorpay-signature'] as string | undefined;
      if (!signature) {
        throw new AppError(
          'Missing Razorpay webhook signature header (x-razorpay-signature)',
          400,
          ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        );
      }

      const secret =
        this.config.PAYMENT_WEBHOOK_SECRET || this.config.RAZORPAY_KEY_SECRET || 'dev_secret';
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      if (!this.timingSafeEqual(expected, signature)) {
        throw new AppError(
          'Invalid Razorpay webhook signature',
          400,
          ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        );
      }
    } else if (provider === 'STRIPE') {
      const signatureHeader = headers['stripe-signature'] as string | undefined;
      if (!signatureHeader) {
        throw new AppError(
          'Missing Stripe webhook signature header (stripe-signature)',
          400,
          ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        );
      }

      const secret = this.config.PAYMENT_WEBHOOK_SECRET || 'whsec_test';

      // Parse Stripe header: t=timestamp,v1=signature
      if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
        const parts = signatureHeader.split(',');
        let timestamp = '';
        const signatures: string[] = [];

        for (const part of parts) {
          const [key, value] = part.trim().split('=');
          if (key === 't' && value) {
            timestamp = value;
          } else if (key === 'v1' && value) {
            signatures.push(value);
          }
        }

        if (!timestamp || signatures.length === 0) {
          throw new AppError(
            'Malformed Stripe signature header',
            400,
            ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
          );
        }

        const signedPayload = `${timestamp}.${rawBody}`;
        const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

        const matches = signatures.some((sig) => this.timingSafeEqual(expected, sig));
        if (!matches) {
          throw new AppError(
            'Invalid Stripe webhook signature',
            400,
            ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
          );
        }
      } else {
        // Direct HMAC verification fallback
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        if (!this.timingSafeEqual(expected, signatureHeader)) {
          throw new AppError(
            'Invalid Stripe webhook signature',
            400,
            ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
          );
        }
      }
    } else if (provider === 'MOCK') {
      const signature = (headers['x-mock-signature'] ||
        headers['x-webhook-signature'] ||
        headers['signature']) as string | undefined;

      if (!signature) {
        throw new AppError(
          'Missing Mock webhook signature header (x-mock-signature)',
          400,
          ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        );
      }

      const secret = this.config.PAYMENT_WEBHOOK_SECRET || 'dev_mock_webhook_secret';
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      if (!this.timingSafeEqual(expected, signature)) {
        throw new AppError(
          'Invalid Mock webhook signature',
          400,
          ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        );
      }
    }
  }

  /**
   * Constant-time string equality check against timing attacks.
   */
  private timingSafeEqual(expected: string, received: string): boolean {
    const bufExpected = Buffer.from(expected, 'utf-8');
    const bufReceived = Buffer.from(received, 'utf-8');

    if (bufExpected.length !== bufReceived.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufExpected, bufReceived);
  }

  /**
   * Normalizes provider-specific webhook into canonical `NormalizedWebhookEvent`.
   */
  private normalizeWebhookEvent(
    provider: PaymentProvider,
    rawBody: string,
    parsedBody?: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined> = {},
  ): NormalizedWebhookEvent {
    let json: Record<string, any>;
    try {
      json = parsedBody ?? JSON.parse(rawBody);
    } catch {
      throw AppError.badRequest('Invalid JSON webhook payload', [], ErrorCodes.VALIDATION_ERROR);
    }

    const processedAt = new Date().toISOString();

    if (provider === 'RAZORPAY') {
      const eventType = json.event || 'payment.captured';
      const paymentEntity = json.payload?.payment?.entity ?? {};
      const orderEntity = json.payload?.order?.entity ?? {};

      const eventId =
        (headers['x-razorpay-event-id'] as string) ||
        json.event_id ||
        (paymentEntity.id ? `evt_${eventType}_${paymentEntity.id}` : `evt_rzp_${Date.now()}`);

      const gatewayOrderId = paymentEntity.order_id || orderEntity.id || null;
      const gatewayPaymentId = paymentEntity.id || null;
      const amount = Number(paymentEntity.amount || orderEntity.amount || 0); // integer paise
      const currency = (
        paymentEntity.currency ||
        orderEntity.currency ||
        'INR'
      ).toUpperCase() as SupportedCurrency;

      let status = 'PENDING';
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        status = 'SUCCESS';
      } else if (eventType === 'payment.failed') {
        status = 'FAILED';
      } else if (eventType === 'refund.processed' || eventType === 'payment.refunded') {
        status = 'REFUNDED';
      }

      return {
        provider: 'RAZORPAY',
        eventId,
        eventType,
        gatewayOrderId,
        gatewayPaymentId,
        amount,
        currency,
        status: status as any,
        payload: json,
        processedAt,
      };
    }

    if (provider === 'STRIPE') {
      const eventType = json.type || 'payment_intent.succeeded';
      const eventId = json.id || `evt_stripe_${Date.now()}`;
      const dataObj = json.data?.object ?? {};

      const gatewayOrderId = dataObj.id || null;
      const gatewayPaymentId =
        typeof dataObj.latest_charge === 'string'
          ? dataObj.latest_charge
          : (dataObj.latest_charge?.id ?? null);

      const amount = Number(dataObj.amount || 0);
      const currency = (dataObj.currency || 'INR').toUpperCase() as SupportedCurrency;

      let status = 'PENDING';
      if (eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded') {
        status = 'SUCCESS';
      } else if (
        eventType === 'payment_intent.payment_failed' ||
        eventType === 'charge.failed' ||
        eventType === 'payment_intent.canceled'
      ) {
        status = 'FAILED';
      } else if (eventType === 'charge.refunded') {
        status = 'REFUNDED';
      }

      return {
        provider: 'STRIPE',
        eventId,
        eventType,
        gatewayOrderId,
        gatewayPaymentId,
        amount,
        currency,
        status: status as any,
        payload: json,
        processedAt,
      };
    }

    // MOCK Provider
    const eventId = json.eventId || json.event_id || json.id || `evt_mock_${Date.now()}`;
    const eventType = json.eventType || json.event_type || json.event || 'payment.succeeded';
    const gatewayOrderId = json.gatewayOrderId || json.orderId || json.order_id || null;
    const gatewayPaymentId = json.gatewayPaymentId || json.paymentId || json.payment_id || null;
    const amount = Number(json.amount || 0);
    const currency = (json.currency || 'INR').toUpperCase() as SupportedCurrency;

    let status = json.status || 'SUCCESS';
    if (eventType.includes('failed') || eventType.includes('canceled')) {
      status = 'FAILED';
    } else if (eventType.includes('refund')) {
      status = 'REFUNDED';
    }

    return {
      provider: 'MOCK',
      eventId,
      eventType,
      gatewayOrderId,
      gatewayPaymentId,
      amount,
      currency,
      status: status as any,
      payload: json,
      processedAt,
    };
  }
}
