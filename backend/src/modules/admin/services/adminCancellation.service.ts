import {
  AppError,
  AuthorizeCancellationRequest,
  ErrorCodes,
  RejectCancellationRequest,
} from '../../../../../shared/src/index.js';
import { CancellationService } from '../../payment/services/cancellation.service.js';
import {
  CancellationListOptions,
  CancellationRequestRepository,
} from '../../payment/repositories/cancellationRequest.repository.js';
import { BookingRepository } from '../../booking/repositories/booking.repository.js';
import { AdminAuditLogService } from './adminAuditLog.service.js';

export class AdminCancellationService {
  constructor(
    private readonly cancellationService: CancellationService,
    private readonly cancellationRepo: CancellationRequestRepository,
    private readonly bookingRepo: BookingRepository,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  /**
   * Admin authorizes a cancellation request, triggering gateway refund processing.
   */
  async authorizeCancellation(
    adminId: string,
    cancellationId: string,
    input: AuthorizeCancellationRequest,
    ipAddress?: string | null,
  ) {
    const result = await this.cancellationService.authorizeCancellation({
      cancellationId,
      adminId,
      adminNotes: input.adminNotes,
      overrideRefundAmount: input.overrideRefundAmount,
    });

    await this.auditLogService.logAction({
      adminId,
      action: 'CANCELLATION_AUTHORIZE',
      entityType: 'CANCELLATION',
      entityId: cancellationId,
      details: {
        bookingId: result.booking.id,
        refundAmount: result.settlement.refundAmount,
        settlementStatus: result.settlement.settlementStatus,
      },
      ipAddress,
    });

    return result;
  }

  /**
   * Admin rejects a cancellation request.
   */
  async rejectCancellation(
    adminId: string,
    cancellationId: string,
    input: RejectCancellationRequest,
    ipAddress?: string | null,
  ) {
    const result = await this.cancellationService.rejectCancellation({
      cancellationId,
      adminId,
      adminNotes: input.adminNotes,
    });

    await this.auditLogService.logAction({
      adminId,
      action: 'CANCELLATION_REJECT',
      entityType: 'CANCELLATION',
      entityId: cancellationId,
      details: {
        bookingId: result.bookingId,
        reason: input.adminNotes,
      },
      ipAddress,
    });

    return result;
  }

  /**
   * List cancellation requests for administrative review.
   */
  async listCancellations(options: CancellationListOptions = {}) {
    return this.cancellationRepo.list(options);
  }

  /**
   * Get detailed cancellation request information.
   */
  async getCancellationDetails(cancellationId: string) {
    const request = await this.cancellationRepo.findById(cancellationId);
    if (!request) {
      throw AppError.notFound(
        `Cancellation request with ID '${cancellationId}' was not found.`,
        ErrorCodes.CANCELLATION_REQUEST_NOT_FOUND,
      );
    }

    const booking = await this.bookingRepo.findById(request.bookingId);
    return { request, booking };
  }
}
