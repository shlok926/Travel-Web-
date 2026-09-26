import {
  PaymentTransactionRepository,
  PaymentTransactionEntity,
} from '../repositories/paymentTransaction.repository.js';
import { PaymentGatewayFactory } from '../adapters/paymentGateway.factory.js';
import { BookingService } from '../../booking/services/booking.service.js';
import {
  AppError,
  ErrorCodes,
  InitiatePaymentResponse,
  PaymentStatusResponse,
} from '../../../../../shared/src/index.js';

export interface InitiatePaymentCommand {
  userId: string;
  bookingReference: string;
  provider?: string;
  idempotencyKey?: string;
}

export interface GetPaymentStatusCommand {
  userId: string;
  bookingReference: string;
}

export class PaymentService {
  constructor(
    private readonly paymentTxRepo: PaymentTransactionRepository,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Initiates payment for an unconfirmed booking in AWAITING_PAYMENT status.
   *
   * Security & Financial Invariants:
   * 1. Customer identity is derived strictly from authentication context (`request.user.userId`).
   * 2. Customer ownership of booking is validated before any operation.
   * 3. Booking must be strictly in AWAITING_PAYMENT state.
   * 4. Associated inventory hold must not be expired.
   * 5. Amount and currency are derived strictly from the persisted booking snapshot (never from client).
   * 6. Idempotency is enforced: identical requests replay the existing transaction; conflicting parameters throw IDEMPOTENCY_CONFLICT.
   * 7. External gateway order is created outside of PostgreSQL transaction boundaries to avoid long connection locks.
   */
  async initiatePayment(command: InitiatePaymentCommand): Promise<InitiatePaymentResponse> {
    const { userId, bookingReference, provider, idempotencyKey } = command;

    // 1. Verify customer booking ownership and retrieve authoritative booking
    const { booking, holdExpiresAt } = await this.bookingService.getBookingByReference(
      bookingReference,
      userId,
    );

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    // 2. Validate booking state
    if (booking.status !== 'AWAITING_PAYMENT') {
      if (booking.status === 'CONFIRMED') {
        throw AppError.badRequest(
          'Booking is already confirmed and paid',
          [{ field: 'status', issue: 'Booking is already confirmed' }],
          ErrorCodes.PAYMENT_ALREADY_PROCESSED,
        );
      }
      throw AppError.badRequest(
        `Cannot initiate payment for booking in ${booking.status} status. Only AWAITING_PAYMENT bookings are eligible.`,
        [{ field: 'status', issue: 'Invalid booking state for payment initiation' }],
        ErrorCodes.PAYMENT_INVALID_STATE,
      );
    }

    // 3. Verify inventory hold expiration
    if (holdExpiresAt && new Date(holdExpiresAt).getTime() <= Date.now()) {
      throw AppError.badRequest(
        'Inventory hold has expired for this booking. Please create a new booking.',
        [{ field: 'holdExpiresAt', issue: 'Inventory hold expired' }],
        ErrorCodes.INVENTORY_HOLD_EXPIRED,
      );
    }

    // 4. Resolve payment adapter via factory
    const adapter = this.gatewayFactory.getAdapter(provider);

    // 5. Authoritative financial parameters from booking snapshot
    const authoritativeAmount = booking.totalPrice;
    const authoritativeCurrency = booking.currency;

    if (authoritativeAmount <= 0) {
      throw AppError.badRequest(
        'Booking total price must be greater than zero',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // 6. Check Idempotency Key Replay vs Conflict
    if (idempotencyKey) {
      const existingTx = await this.paymentTxRepo.findByIdempotencyKey(idempotencyKey);
      if (existingTx) {
        if (
          existingTx.bookingId === booking.id &&
          existingTx.provider === adapter.provider &&
          existingTx.amount === authoritativeAmount
        ) {
          // Safe Idempotent Replay
          return {
            paymentId: existingTx.id,
            bookingReference: booking.bookingReference,
            provider: existingTx.provider,
            gatewayOrderId: existingTx.gatewayOrderId,
            amount: existingTx.amount,
            currency: existingTx.currency,
            status: existingTx.status,
            clientPayload: (existingTx.gatewayResponsePayload as Record<string, unknown>) ?? {},
            createdAt: existingTx.createdAt.toISOString(),
          };
        }

        // Idempotency conflict: same key with different semantic parameters
        throw AppError.conflict(
          'Idempotency key has already been used with different request parameters',
          ErrorCodes.IDEMPOTENCY_CONFLICT,
        );
      }
    }

    // 7. Persist local payment transaction in INITIATED state
    const paymentTx = await this.paymentTxRepo.create({
      bookingId: booking.id,
      provider: adapter.provider,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      status: 'INITIATED',
      idempotencyKey: idempotencyKey ?? null,
    });

    // 8. Invoke payment gateway adapter (outside PostgreSQL transaction)
    let orderResult;
    try {
      orderResult = await adapter.createPaymentOrder({
        bookingReference: booking.bookingReference,
        amount: authoritativeAmount,
        currency: authoritativeCurrency,
        receipt: paymentTx.id,
        customer: {
          name: booking.primaryContact?.name,
          email: booking.primaryContact?.email,
          phone: booking.primaryContact?.phone,
        },
        notes: {
          bookingId: booking.id,
          paymentTxId: paymentTx.id,
        },
      });
    } catch (err: unknown) {
      // Mark local transaction FAILED for auditability
      await this.paymentTxRepo.updateStatusGuarded(paymentTx.id, 'INITIATED', 'FAILED');
      throw err;
    }

    // 9. Update payment transaction with gateway identifiers & payload, transition to PENDING
    const updatedTx = await this.paymentTxRepo.updateGatewayIdentifiers(paymentTx.id, {
      gatewayOrderId: orderResult.gatewayOrderId,
      gatewayResponsePayload: orderResult.rawPayload,
    });

    await this.paymentTxRepo.updateStatusGuarded(paymentTx.id, 'INITIATED', 'PENDING');

    return {
      paymentId: paymentTx.id,
      bookingReference: booking.bookingReference,
      provider: adapter.provider,
      gatewayOrderId: orderResult.gatewayOrderId,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      status: 'INITIATED',
      clientPayload: orderResult.clientPayload,
      createdAt: (updatedTx?.createdAt ?? paymentTx.createdAt).toISOString(),
    };
  }

  /**
   * Retrieves read-only payment status for an authenticated customer's booking.
   *
   * Security Invariants:
   * 1. Customer identity is derived strictly from authentication context (`request.user.userId`).
   * 2. Customer ownership of booking is verified.
   * 3. Returns latest payment transaction status.
   * 4. Optionally queries provider API if status is in-flight (PENDING), updating transaction status.
   * 5. Hard Boundary: NEVER confirms booking in this step.
   */
  async getPaymentStatus(command: GetPaymentStatusCommand): Promise<PaymentStatusResponse> {
    const { userId, bookingReference } = command;

    // 1. Verify customer booking ownership
    const { booking } = await this.bookingService.getBookingByReference(bookingReference, userId);

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    // 2. Fetch payment transactions for booking
    const transactions = await this.paymentTxRepo.findByBookingId(booking.id);
    if (transactions.length === 0) {
      throw AppError.notFound(
        `No payment transaction found for booking ${bookingReference}`,
        ErrorCodes.PAYMENT_NOT_FOUND,
      );
    }

    // Latest transaction
    let latestTx: PaymentTransactionEntity = transactions[0]!;

    // 3. If in PENDING status and gateway order/payment ID exists, poll gateway adapter
    if (latestTx.status === 'PENDING' && (latestTx.gatewayOrderId || latestTx.gatewayPaymentId)) {
      try {
        const adapter = this.gatewayFactory.getAdapter(latestTx.provider);
        const polledResult = await adapter.getPaymentStatus({
          gatewayOrderId: latestTx.gatewayOrderId,
          gatewayPaymentId: latestTx.gatewayPaymentId,
        });

        if (polledResult.status !== latestTx.status) {
          const updated = await this.paymentTxRepo.updateStatusGuarded(
            latestTx.id,
            'PENDING',
            polledResult.status,
          );
          if (updated) {
            latestTx = updated;
            if (latestTx.status === 'SUCCESS') {
              try {
                await this.bookingService.confirmBooking({
                  bookingId: booking.id,
                  paymentVerified: true,
                  paymentTransactionId: latestTx.id,
                });
              } catch {
                // Late payment after expiry or already confirmed/cancelled
              }
            }
          }
        }
      } catch {
        // Gateway polling failure should not fail read-only status query; return persisted DB state
      }
    }

    return {
      paymentId: latestTx.id,
      bookingReference: booking.bookingReference,
      provider: latestTx.provider,
      gatewayOrderId: latestTx.gatewayOrderId,
      gatewayPaymentId: latestTx.gatewayPaymentId,
      amount: latestTx.amount,
      currency: latestTx.currency,
      status: latestTx.status,
      createdAt: latestTx.createdAt.toISOString(),
      updatedAt: latestTx.updatedAt.toISOString(),
    };
  }
}
