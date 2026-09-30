import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { AppError, ErrorCodes, RefundSettlementStatus } from '../../../../../shared/src/index.js';

import { BookingRepository, BookingEntity } from '../../booking/repositories/booking.repository.js';
import { DepartureRepository } from '../../inventory/repositories/departure.repository.js';
import {
  CancellationRequestRepository,
  CancellationRequestEntity,
  CancellationListOptions,
  CancellationListResult,
} from '../repositories/cancellationRequest.repository.js';
import {
  RefundSettlementRepository,
  RefundSettlementEntity,
} from '../repositories/refundSettlement.repository.js';
import {
  PaymentTransactionRepository,
  PaymentTransactionEntity,
} from '../repositories/paymentTransaction.repository.js';
import { PaymentGatewayFactory } from '../adapters/paymentGateway.factory.js';
import { CancellationPolicyEvaluator } from './cancellationPolicy.js';
import { NotificationProducerService } from '../../notification/services/notificationProducer.service.js';

// ============================================================
// Command Interfaces
// ============================================================

export interface RequestCancellationCommand {
  bookingReference: string;
  customerId: string;
  reason: string;
}

export interface AuthorizeCancellationCommand {
  cancellationId: string;
  adminId: string;
  adminNotes?: string;
  overrideRefundAmount?: number; // Minor units
}

export interface RejectCancellationCommand {
  cancellationId: string;
  adminId: string;
  adminNotes?: string;
}

export interface CancellationDetailsResult {
  request: CancellationRequestEntity;
  settlements: RefundSettlementEntity[];
  booking: BookingEntity;
}

export interface AuthorizeCancellationResult {
  cancellation: CancellationRequestEntity;
  settlement: RefundSettlementEntity;
  booking: BookingEntity;
  payment: PaymentTransactionEntity | null;
}

// ============================================================
// CancellationService Implementation
// ============================================================

export class CancellationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly bookingRepo: BookingRepository,
    private readonly departureRepo: DepartureRepository,
    private readonly cancellationRequestRepo: CancellationRequestRepository,
    private readonly refundSettlementRepo: RefundSettlementRepository,
    private readonly paymentTxRepo: PaymentTransactionRepository,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly policyEvaluator: CancellationPolicyEvaluator = new CancellationPolicyEvaluator(),
    private readonly notificationProducer?: NotificationProducerService,
  ) {}

  /**
   * Customer initiates a cancellation request for an eligible CONFIRMED booking.
   *
   * Invariants:
   * - Enforces customer ownership isolation (returns 404 BOOKING_NOT_FOUND on non-owner).
   * - Strictly applies to CONFIRMED bookings.
   * - Rejects if an active PENDING_APPROVAL or AUTHORIZED request already exists.
   * - Rejects if booking is already CANCELLED or COMPLETED.
   * - Server-authoritatively calculates refund & penalty amounts via DEC-007 policy.
   * - Persists cancellation_requests record in PENDING_APPROVAL status.
   */
  async requestCancellation(
    command: RequestCancellationCommand,
  ): Promise<CancellationRequestEntity> {
    const { bookingReference, customerId, reason } = command;

    const booking = await this.bookingRepo.findByReferenceAndCustomer(bookingReference, customerId);

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    if (booking.status === 'CANCELLED') {
      throw AppError.badRequest(
        'Booking is already cancelled',
        [],
        ErrorCodes.BOOKING_ALREADY_CANCELLED,
      );
    }

    if (booking.status !== 'CONFIRMED') {
      throw AppError.badRequest(
        `Cannot cancel booking in status: ${booking.status}. Only CONFIRMED bookings can be cancelled.`,
        [{ field: 'status', issue: 'Only confirmed bookings are eligible for cancellation' }],
        ErrorCodes.BOOKING_INVALID_STATE,
      );
    }

    // Check for existing cancellation requests
    const existingRequests = await this.cancellationRequestRepo.findByBookingId(booking.id);
    const activeRequest = existingRequests.find(
      (r) => r.status === 'PENDING_APPROVAL' || r.status === 'AUTHORIZED',
    );

    if (activeRequest) {
      throw AppError.conflict(
        'A cancellation request is already pending approval or authorized for this booking',
        ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
      );
    }

    const completedRequest = existingRequests.find((r) => r.status === 'COMPLETED');
    if (completedRequest) {
      throw AppError.badRequest(
        'Booking is already cancelled',
        [],
        ErrorCodes.BOOKING_ALREADY_CANCELLED,
      );
    }

    // Determine departure date for policy evaluation
    let departureDate: Date | string = new Date();
    if (booking.departureSnapshot?.departureDate) {
      departureDate = booking.departureSnapshot.departureDate;
    } else {
      const departure = await this.departureRepo.findById(booking.departureId);
      if (departure) {
        departureDate = departure.departureDate;
      }
    }

    // Evaluate authoritative refund & penalty amounts
    const policyResult = this.policyEvaluator.evaluate(departureDate, booking.totalPrice);

    const cancellationRequest = await this.cancellationRequestRepo.create({
      bookingId: booking.id,
      requestedBy: customerId,
      cancellationReason: reason,
      calculatedRefundAmount: policyResult.refundAmount,
      calculatedPenaltyAmount: policyResult.penaltyAmount,
      status: 'PENDING_APPROVAL',
    });

    return cancellationRequest;
  }

  /**
   * Retrieves cancellation request and refund settlement history for a booking.
   */
  async getCancellationDetails(
    bookingReference: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<CancellationDetailsResult> {
    let booking: BookingEntity | null;

    if (isAdmin) {
      booking = await this.bookingRepo.findByReference(bookingReference);
    } else {
      booking = await this.bookingRepo.findByReferenceAndCustomer(bookingReference, userId);
    }

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    const requests = await this.cancellationRequestRepo.findByBookingId(booking.id);
    const latestRequest = requests[0];
    if (!latestRequest) {
      throw AppError.notFound(
        'Cancellation request not found for this booking',
        ErrorCodes.CANCELLATION_REQUEST_NOT_FOUND,
      );
    }

    const settlements = await this.refundSettlementRepo.findByCancellationRequestId(
      latestRequest.id,
    );

    return {
      request: latestRequest,
      settlements,
      booking,
    };
  }

  /**
   * Lists cancellation requests for administrative review.
   */
  async listPendingCancellations(
    options: CancellationListOptions = {},
  ): Promise<CancellationListResult> {
    return this.cancellationRequestRepo.list(options);
  }

  /**
   * Admin rejects a cancellation request.
   * Does NOT cancel booking, does NOT release inventory, does NOT refund payment.
   */
  async rejectCancellation(command: RejectCancellationCommand): Promise<CancellationRequestEntity> {
    const { cancellationId, adminId, adminNotes } = command;

    const request = await this.cancellationRequestRepo.findById(cancellationId);
    if (!request) {
      throw AppError.notFound(
        'Cancellation request not found',
        ErrorCodes.CANCELLATION_REQUEST_NOT_FOUND,
      );
    }

    if (request.status !== 'PENDING_APPROVAL') {
      throw AppError.badRequest(
        `Cannot reject cancellation request in status: ${request.status}. Only PENDING_APPROVAL requests can be rejected.`,
        [
          {
            field: 'status',
            issue: `Current status is ${request.status}, expected PENDING_APPROVAL`,
          },
        ],
        ErrorCodes.REFUND_INVALID_STATE,
      );
    }

    const updated = await this.cancellationRequestRepo.updateStatusGuarded(
      cancellationId,
      'PENDING_APPROVAL',
      'REJECTED',
      {
        adminNotes: adminNotes ?? null,
        authorizedBy: adminId,
        authorizedAt: new Date(),
      },
    );

    if (!updated) {
      throw AppError.conflict(
        'Cancellation request was concurrently modified or resolved',
        ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
      );
    }

    return updated;
  }

  /**
   * Admin authorizes a cancellation request, triggering gateway refund settlement and atomic state synchronization.
   *
   * Flow & Atomicity:
   * 1. Validate request is PENDING_APPROVAL.
   * 2. Validate booking is CONFIRMED.
   * 3. Fetch verified SUCCESS payment transaction.
   * 4. Derive authoritative refund amount (or admin override).
   * 5. Call payment gateway refund adapter (if refundAmount > 0).
   * 6. Atomic PostgreSQL Transaction:
   *    - Row lock departure_schedules (FOR UPDATE).
   *    - Re-verify booking is CONFIRMED under lock.
   *    - Guarded transition: cancellation_requests (PENDING_APPROVAL -> COMPLETED).
   *    - Persist refund_settlements record.
   *    - Guarded transition: bookings (CONFIRMED -> CANCELLED).
   *    - Guarded decrement: departure_schedules.booked_seats by partySize exactly once.
   *    - Guarded transition: payment_transactions (SUCCESS -> REFUNDED).
   */
  async authorizeCancellation(
    command: AuthorizeCancellationCommand,
  ): Promise<AuthorizeCancellationResult> {
    const { cancellationId, adminId, adminNotes, overrideRefundAmount } = command;

    // 1. Initial pre-flight checks
    const request = await this.cancellationRequestRepo.findById(cancellationId);
    if (!request) {
      throw AppError.notFound(
        'Cancellation request not found',
        ErrorCodes.CANCELLATION_REQUEST_NOT_FOUND,
      );
    }

    if (request.status !== 'PENDING_APPROVAL') {
      throw AppError.badRequest(
        `Cannot authorize cancellation request in status: ${request.status}. Only PENDING_APPROVAL requests can be authorized.`,
        [
          {
            field: 'status',
            issue: `Current status is ${request.status}, expected PENDING_APPROVAL`,
          },
        ],
        ErrorCodes.REFUND_INVALID_STATE,
      );
    }

    // 2. Booking check
    const booking = await this.bookingRepo.findById(request.bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    if (booking.status !== 'CONFIRMED') {
      throw AppError.badRequest(
        `Cannot cancel booking in status: ${booking.status}. Only CONFIRMED bookings can be cancelled.`,
        [{ field: 'status', issue: 'Only confirmed bookings are eligible for cancellation' }],
        ErrorCodes.BOOKING_INVALID_STATE,
      );
    }

    // 3. Payment Transaction check
    const transactions = await this.paymentTxRepo.findByBookingId(booking.id);
    const successTx = transactions.find((t) => t.status === 'SUCCESS');

    if (!successTx) {
      throw AppError.badRequest(
        'No successful payment transaction found for this booking to refund',
        [{ field: 'payment', issue: 'No SUCCESS payment transaction associated with booking' }],
        ErrorCodes.PAYMENT_NOT_FOUND,
      );
    }

    // 4. Derive authoritative refund amount
    const refundAmount =
      overrideRefundAmount !== undefined ? overrideRefundAmount : request.calculatedRefundAmount;

    if (refundAmount < 0 || refundAmount > successTx.amount) {
      throw AppError.badRequest(
        `Refund amount (${refundAmount}) must be between 0 and total payment amount (${successTx.amount}) in minor units`,
        [{ field: 'refundAmount', issue: 'Refund amount exceeds captured payment amount' }],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const penaltyAmount = successTx.amount - refundAmount;

    // Check for existing in-flight or settled refund records to prevent duplicate gateway execution
    const existingSettlements =
      (await this.refundSettlementRepo.findByCancellationRequestId(request.id)) ?? [];
    const existingSettled = existingSettlements.find((s) => s.settlementStatus === 'SETTLED');
    if (existingSettled) {
      throw AppError.badRequest(
        'A settled refund already exists for this cancellation request',
        [],
        ErrorCodes.REFUND_INVALID_STATE,
      );
    }
    const inFlightSettlement = existingSettlements.find((s) => s.settlementStatus === 'PROCESSING');
    if (inFlightSettlement) {
      throw AppError.conflict(
        'A refund settlement is already in-flight or processing for this cancellation request',
        ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
      );
    }

    // 5. Payment Gateway Refund Execution
    const receiptKey = `rfnd_${request.id.replace(/-/g, '').slice(0, 32)}`;
    let gatewayRefundId: string | null = null;
    let settlementStatus: RefundSettlementStatus = 'SETTLED';
    let gatewayRawPayload: Record<string, unknown> = {};
    let settlementErrorMessage: string | null = null;
    let targetCancellationStatus: 'COMPLETED' | 'AUTHORIZED' = 'COMPLETED';

    if (refundAmount === 0) {
      // 100% penalty / zero refund: no external gateway API call needed
      gatewayRefundId = `zero_refund_${request.id.slice(-8)}`;
      settlementStatus = 'SETTLED';
      targetCancellationStatus = 'COMPLETED';
      gatewayRawPayload = { note: '100% cancellation fee applied; zero gateway refund initiated' };
    } else {
      const adapter = this.gatewayFactory.getAdapter(successTx.provider);

      try {
        const refundResult = await adapter.refundPayment({
          gatewayPaymentId: successTx.gatewayPaymentId,
          gatewayOrderId: successTx.gatewayOrderId,
          amount: refundAmount,
          currency: successTx.currency,
          reason: request.cancellationReason,
          receipt: receiptKey,
        });

        gatewayRefundId = refundResult.gatewayRefundId;
        settlementStatus = refundResult.status;
        gatewayRawPayload = refundResult.rawPayload;

        if (settlementStatus === 'SETTLED') {
          targetCancellationStatus = 'COMPLETED';
        } else if (settlementStatus === 'PROCESSING') {
          targetCancellationStatus = 'AUTHORIZED';
          settlementErrorMessage =
            'Refund initiated with provider; asynchronous settlement in progress';
        } else if (settlementStatus === 'FAILED') {
          // Explicit definitive rejection from provider
          await this.refundSettlementRepo.create({
            cancellationRequestId: request.id,
            paymentTransactionId: successTx.id,
            gatewayRefundId: refundResult.gatewayRefundId,
            refundAmount,
            currency: successTx.currency,
            settlementStatus: 'FAILED',
            errorMessage: 'Payment gateway rejected refund request',
          });

          throw AppError.badRequest('Payment gateway refund failed', [], ErrorCodes.REFUND_FAILED);
        }
      } catch (err: unknown) {
        const errorMessage =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Gateway refund failure';

        const errorCode =
          err instanceof AppError
            ? err.code
            : err && typeof err === 'object' && 'code' in err
              ? String((err as { code: unknown }).code)
              : '';

        const isAmbiguousTimeout =
          (err instanceof AppError && err.statusCode === 503) ||
          errorCode === ErrorCodes.SERVICE_UNAVAILABLE ||
          errorMessage.toLowerCase().includes('timeout') ||
          errorMessage.toLowerCase().includes('unreachable') ||
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('connection') ||
          errorMessage.toLowerCase().includes('econnreset') ||
          errorMessage.toLowerCase().includes('etimedout');

        if (isAmbiguousTimeout) {
          // Ambiguous gateway outcome: We do NOT know if provider processed refund.
          // CRITICAL: Do NOT mark as FAILED (prevents duplicate refund on unsafe retry).
          // Safely record as PROCESSING and transition request to AUTHORIZED.
          settlementStatus = 'PROCESSING';
          targetCancellationStatus = 'AUTHORIZED';
          settlementErrorMessage = `Gateway timeout / network failure: ${errorMessage} (pending reconciliation)`;
          gatewayRefundId = null;
          gatewayRawPayload = { ambiguousError: errorMessage, receipt: receiptKey };
        } else {
          // Definitive provider rejection or validation error: record FAILED audit and do NOT mutate booking
          try {
            await this.refundSettlementRepo.create({
              cancellationRequestId: request.id,
              paymentTransactionId: successTx.id,
              gatewayRefundId: null,
              refundAmount,
              currency: successTx.currency,
              settlementStatus: 'FAILED',
              errorMessage,
            });
          } catch {
            // Non-blocking log persistence
          }

          if (err instanceof AppError) {
            throw err;
          }

          throw AppError.badRequest(
            `Payment gateway refund failed: ${errorMessage}`,
            [],
            ErrorCodes.REFUND_FAILED,
          );
        }
      }
    }

    // 6. Single Atomic PostgreSQL Transaction for State Transitions
    const result = await this.db.withTransaction(async (client: pg.PoolClient) => {
      // 6.1 Canonical Lock Ordering: departure_schedules -> bookings -> payment_transactions
      const departure = await this.departureRepo.findByIdForUpdate(booking.departureId, client);
      if (!departure) {
        throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
      }

      // 6.2 Re-verify booking state under lock
      const currentBooking = await this.bookingRepo.findById(booking.id, client);
      if (!currentBooking) {
        throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
      }
      if (currentBooking.status !== 'CONFIRMED') {
        throw AppError.conflict(
          `Booking was concurrently modified (status: ${currentBooking.status})`,
          ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
        );
      }

      // 6.3 Atomically transition cancellation request: PENDING_APPROVAL -> (COMPLETED | AUTHORIZED)
      const updatedRequest = await this.cancellationRequestRepo.updateStatusGuarded(
        request.id,
        'PENDING_APPROVAL',
        targetCancellationStatus,
        {
          adminNotes: adminNotes ?? request.adminNotes,
          authorizedBy: adminId,
          authorizedAt: new Date(),
          calculatedRefundAmount: refundAmount,
          calculatedPenaltyAmount: penaltyAmount,
        },
        client,
      );

      if (!updatedRequest) {
        throw AppError.conflict(
          'Cancellation request was concurrently modified or authorized',
          ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
        );
      }

      // 6.4 Persist refund settlement audit record
      const settlement = await this.refundSettlementRepo.create(
        {
          cancellationRequestId: request.id,
          paymentTransactionId: successTx.id,
          gatewayRefundId,
          refundAmount,
          currency: successTx.currency,
          settlementStatus,
          errorMessage: settlementErrorMessage,
          processedAt: settlementStatus === 'SETTLED' ? new Date() : null,
        },
        client,
      );

      if (settlementStatus === 'SETTLED') {
        // 6.5 For confirmed SETTLED refund: Atomically transition booking: CONFIRMED -> CANCELLED
        const cancelledBooking = await this.bookingRepo.updateStatusGuarded(
          booking.id,
          'CONFIRMED',
          'CANCELLED',
          {
            cancellationReason: request.cancellationReason,
            cancelledAt: new Date(),
          },
          client,
        );

        if (!cancelledBooking) {
          throw AppError.conflict(
            'Booking was concurrently modified',
            ErrorCodes.CONCURRENT_MUTATION_CONFLICT,
          );
        }

        // 6.6 Single guarded decrement on booked seats
        const updatedDeparture = await this.departureRepo.decrementBookedSeats(
          booking.departureId,
          booking.partySize,
          client,
        );

        if (!updatedDeparture) {
          throw AppError.badRequest(
            'Failed to decrement booked seats: insufficient booked seats on departure schedule',
            [
              {
                field: 'bookedSeats',
                issue: 'Insufficient booked seats to satisfy cancellation decrement',
              },
            ],
            ErrorCodes.INVENTORY_CAPACITY_EXCEEDED,
          );
        }

        // 6.7 Atomically transition payment transaction: SUCCESS -> REFUNDED
        const updatedPayment = await this.paymentTxRepo.updateStatusGuarded(
          successTx.id,
          'SUCCESS',
          'REFUNDED',
          client,
        );

        if (Object.keys(gatewayRawPayload).length > 0) {
          await this.paymentTxRepo.updateGatewayPayload(successTx.id, gatewayRawPayload, client);
        }

        return {
          cancellation: updatedRequest,
          settlement,
          booking: cancelledBooking,
          payment: updatedPayment,
        };
      }

      // Ambiguous / PROCESSING state:
      // Refund is in-flight/unresolved. Booking remains CONFIRMED, seats remain reserved, payment remains SUCCESS.
      if (Object.keys(gatewayRawPayload).length > 0) {
        await this.paymentTxRepo.updateGatewayPayload(successTx.id, gatewayRawPayload, client);
      }

      return {
        cancellation: updatedRequest,
        settlement,
        booking: currentBooking,
        payment: successTx,
      };
    });

    // Asynchronous Transactional Notifications (Phase 8 Step 6)
    // Only definitive SETTLED refund & CANCELLED booking produce notifications
    if (
      settlementStatus === 'SETTLED' &&
      this.notificationProducer &&
      result.booking.primaryContact?.email
    ) {
      // 1. Enqueue REFUND_SETTLED
      try {
        await this.notificationProducer.enqueueRefundSettled({
          type: 'REFUND_SETTLED',
          cancellationRequestId: result.cancellation.id,
          bookingReference: result.booking.bookingReference,
          recipientEmail: result.booking.primaryContact.email,
          recipientPhone: result.booking.primaryContact.phone,
          refundAmount: result.settlement.refundAmount,
          currency: result.settlement.currency as 'INR' | 'USD',
          cancellationReason: result.cancellation.cancellationReason ?? undefined,
        });
      } catch {
        // Notification failure never rolls back the committed refund in PostgreSQL
      }

      // 2. Enqueue BOOKING_CANCELLED
      try {
        await this.notificationProducer.enqueueBookingCancelled({
          type: 'BOOKING_CANCELLED',
          bookingReference: result.booking.bookingReference,
          recipientEmail: result.booking.primaryContact.email,
          recipientPhone: result.booking.primaryContact.phone,
          cancellationReason:
            result.cancellation.cancellationReason || 'Admin authorized cancellation',
        });
      } catch {
        // Notification failure never rolls back the committed cancellation in PostgreSQL
      }
    }

    return result;
  }
}
