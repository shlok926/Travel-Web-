import crypto from 'node:crypto';
import { z } from 'zod';
import {
  AdminNotificationListQueryDto,
  adminNotificationListQuerySchema,
  adminNotificationIdParamSchema,
  notificationIdempotencyKeySchema,
  NotificationDeliveryDto,
  AppError,
  ErrorCodes,
  BookingConfirmedNotificationPayload,
  DocumentReadyNotificationPayload,
  RefundSettledNotificationPayload,
  BookingCancelledNotificationPayload,
  NotificationEventPayload,
} from '../../../../../shared/src/index.js';
import {
  NotificationDeliveryRepository,
  NotificationDeliveryEntity,
} from '../../notification/repositories/notificationDelivery.repository.js';
import { NotificationProducerService } from '../../notification/services/notificationProducer.service.js';
import { NotificationTemplateRegistry } from '../../notification/templates/templateRegistry.js';
import { AdminAuditLogService } from './adminAuditLog.service.js';
import { BookingRepository } from '../../booking/repositories/booking.repository.js';

// ============================================================
// Phase 8 Step 7 — Admin Notification Operations & Service
// ============================================================

export interface PaginatedAdminNotificationsResult {
  items: NotificationDeliveryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResendNotificationResult {
  success: boolean;
  notification: NotificationDeliveryDto;
  jobId?: string;
}

export function toNotificationDeliveryDto(
  entity: NotificationDeliveryEntity,
): NotificationDeliveryDto {
  return {
    id: entity.id,
    idempotencyKey: entity.idempotencyKey,
    recipientEmail: entity.recipientEmail,
    recipientPhone: entity.recipientPhone ?? null,
    channel: entity.channel,
    notificationType: entity.notificationType,
    referenceId: entity.referenceId,
    subject: entity.subject,
    status: entity.status,
    providerName: entity.providerName,
    providerMessageId: entity.providerMessageId ?? null,
    retryCount: entity.retryCount,
    errorDetails: entity.errorDetails ?? null,
    sentAt: entity.sentAt
      ? entity.sentAt instanceof Date
        ? entity.sentAt.toISOString()
        : new Date(entity.sentAt).toISOString()
      : null,
    createdAt:
      entity.createdAt instanceof Date
        ? entity.createdAt.toISOString()
        : new Date(entity.createdAt).toISOString(),
    updatedAt:
      entity.updatedAt instanceof Date
        ? entity.updatedAt.toISOString()
        : new Date(entity.updatedAt).toISOString(),
  };
}

export class AdminNotificationService {
  constructor(
    private readonly notificationRepo: NotificationDeliveryRepository,
    private readonly notificationProducer?: NotificationProducerService,
    private readonly auditLogService?: AdminAuditLogService,
    private readonly bookingRepo?: BookingRepository,
  ) {}

  /**
   * List and filter notification delivery records with deterministic pagination.
   */
  async listNotifications(
    query: AdminNotificationListQueryDto = {},
  ): Promise<PaginatedAdminNotificationsResult> {
    const validated = adminNotificationListQuerySchema.parse(query);
    const page = validated.page ?? 1;
    const limit = validated.limit ?? 20;

    const { items, total } = await this.notificationRepo.list({
      page,
      limit,
      status: validated.status,
      notificationType: validated.notificationType,
      channel: validated.channel,
      referenceId: validated.referenceId,
      recipientEmail: validated.recipientEmail,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map(toNotificationDeliveryDto),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieve an individual notification delivery record by primary UUID.
   */
  async getNotificationById(id: string): Promise<NotificationDeliveryDto> {
    const parsed = adminNotificationIdParamSchema.safeParse({ id });
    if (!parsed.success) {
      throw AppError.badRequest('Invalid notification ID format', [
        { field: 'id', issue: parsed.error.issues[0]?.message || 'Invalid UUID' },
      ]);
    }

    const delivery = await this.notificationRepo.findById(parsed.data.id);
    if (!delivery) {
      throw AppError.notFound(
        `Notification delivery record with ID '${id}' was not found.`,
        ErrorCodes.NOTIFICATION_NOT_FOUND,
      );
    }

    return toNotificationDeliveryDto(delivery);
  }

  /**
   * Manually resend an existing notification record.
   *
   * Business Rules:
   * 1. Requires valid UUID, ADMIN actor identity, and client-supplied Idempotency-Key.
   * 2. Authoritative stored data (recipient, type, reference) is strictly reused; no admin overrides permitted.
   * 3. In-flight records (PENDING / RETRYING) are rejected to prevent duplicate active BullMQ jobs.
   * 4. Deliberate resend receives a deterministic collision-resistant operation identity derived from delivery ID and client key:
   *    `resend-${delivery.id}-${SHA256(clientKey)}` (108 chars <= 128 max length).
   * 5. Enqueues job through `NotificationProducerService`.
   * 6. Appends immutable audit trail entry in `admin_audit_logs`.
   */
  async resendNotification(
    id: string,
    adminId: string,
    idempotencyKey: string,
    ipAddress?: string | null,
  ): Promise<ResendNotificationResult> {
    const parsed = adminNotificationIdParamSchema.safeParse({ id });
    if (!parsed.success) {
      throw AppError.badRequest('Invalid notification ID format', [
        { field: 'id', issue: parsed.error.issues[0]?.message || 'Invalid UUID' },
      ]);
    }

    z.string().uuid('Admin ID must be a valid UUID').parse(adminId);
    const validatedKey = notificationIdempotencyKeySchema.parse(idempotencyKey);

    const delivery = await this.notificationRepo.findById(parsed.data.id);
    if (!delivery) {
      throw AppError.notFound(
        `Notification delivery record with ID '${id}' was not found.`,
        ErrorCodes.NOTIFICATION_NOT_FOUND,
      );
    }

    // In-flight guard: prevent duplicate manual resend while existing job is actively pending/retrying
    if (delivery.status === 'PENDING' || delivery.status === 'RETRYING') {
      throw AppError.conflict(
        `Notification delivery is currently in '${delivery.status}' state and cannot be manually resent until terminal state is reached.`,
        ErrorCodes.CONFLICT,
      );
    }

    // Reconstruct canonical domain payload strictly from authoritative database state
    let payload: NotificationEventPayload;

    switch (delivery.notificationType) {
      case 'BOOKING_CONFIRMED': {
        let customerName = 'Valued Traveler';
        let portalUrl = `/portal/bookings/${delivery.referenceId}`;
        let packageTitle: string | undefined;
        let departureDate: string | undefined;
        let totalAmount: number | undefined;
        let currency: 'INR' | 'USD' | undefined;

        if (this.bookingRepo) {
          const booking = await this.bookingRepo.findByReference(delivery.referenceId);
          if (booking) {
            customerName = booking.primaryContact?.name || customerName;
            portalUrl = `/portal/bookings/${booking.bookingReference}`;
            packageTitle = booking.packageSnapshot?.title;
            departureDate = booking.departureSnapshot?.departureDate;
            totalAmount = booking.totalPrice;
            currency = booking.currency as 'INR' | 'USD';
          }
        }

        const confirmedPayload: BookingConfirmedNotificationPayload = {
          type: 'BOOKING_CONFIRMED',
          bookingReference: delivery.referenceId,
          customerName,
          recipientEmail: delivery.recipientEmail,
          recipientPhone: delivery.recipientPhone ?? undefined,
          channel: delivery.channel,
          portalUrl,
          packageTitle,
          departureDate,
          totalAmount,
          currency,
        };
        payload = confirmedPayload;
        break;
      }

      case 'DOCUMENT_READY': {
        const docPayload: DocumentReadyNotificationPayload = {
          type: 'DOCUMENT_READY',
          bookingReference: delivery.referenceId,
          recipientEmail: delivery.recipientEmail,
          recipientPhone: delivery.recipientPhone ?? undefined,
          channel: delivery.channel,
          documentType: 'ALL',
          portalDocumentUrl: `/portal/bookings/${delivery.referenceId}/documents`,
        };
        payload = docPayload;
        break;
      }

      case 'REFUND_SETTLED': {
        let refundAmount = 0;
        let currency: 'INR' | 'USD' = 'INR';
        let cancellationReason: string | undefined;

        if (this.bookingRepo) {
          const booking = await this.bookingRepo.findByReference(delivery.referenceId);
          if (booking) {
            refundAmount = booking.totalPrice;
            currency = (booking.currency || 'INR') as 'INR' | 'USD';
            cancellationReason = booking.cancellationReason ?? undefined;
          }
        }

        const refundPayload: RefundSettledNotificationPayload = {
          type: 'REFUND_SETTLED',
          bookingReference: delivery.referenceId,
          recipientEmail: delivery.recipientEmail,
          recipientPhone: delivery.recipientPhone ?? undefined,
          channel: delivery.channel,
          refundAmount,
          currency,
          cancellationReason,
        };
        payload = refundPayload;
        break;
      }

      case 'BOOKING_CANCELLED': {
        let cancellationReason = 'Booking cancelled';
        if (this.bookingRepo) {
          const booking = await this.bookingRepo.findByReference(delivery.referenceId);
          if (booking?.cancellationReason) {
            cancellationReason = booking.cancellationReason;
          }
        }

        const cancelPayload: BookingCancelledNotificationPayload = {
          type: 'BOOKING_CANCELLED',
          bookingReference: delivery.referenceId,
          recipientEmail: delivery.recipientEmail,
          recipientPhone: delivery.recipientPhone ?? undefined,
          channel: delivery.channel,
          cancellationReason,
        };
        payload = cancelPayload;
        break;
      }

      default:
        throw AppError.badRequest(
          `Unsupported notification type '${delivery.notificationType}' for manual resend.`,
          [{ field: 'notificationType', issue: 'Unsupported notification type' }],
          ErrorCodes.VALIDATION_ERROR,
        );
    }

    // Deterministic, collision-resistant bounded operation key within VARCHAR(128)
    const clientKeyHash = crypto.createHash('sha256').update(validatedKey).digest('hex');
    const resendKey = `resend-${delivery.id}-${clientKeyHash}`;

    const rendered = NotificationTemplateRegistry.render(delivery.notificationType, payload);

    let jobId: string | undefined;
    if (this.notificationProducer) {
      const enqueueResult = await this.notificationProducer.enqueueNotification({
        idempotencyKey: resendKey,
        recipientEmail: delivery.recipientEmail,
        recipientPhone: delivery.recipientPhone ?? undefined,
        channel: delivery.channel,
        notificationType: delivery.notificationType,
        referenceId: delivery.referenceId,
        subject: rendered.subject,
        payload,
      });
      jobId = enqueueResult.jobId;
    }

    // Append-only audit logging for administrative operational action
    if (this.auditLogService) {
      await this.auditLogService.logAction({
        adminId,
        action: 'NOTIFICATION_RESEND',
        entityType: 'NOTIFICATION',
        entityId: delivery.id,
        details: {
          notificationType: delivery.notificationType,
          recipientEmail: delivery.recipientEmail,
          referenceId: delivery.referenceId,
          channel: delivery.channel,
          previousStatus: delivery.status,
          clientKey: validatedKey,
          resendKey,
          jobId,
        },
        ipAddress,
      });
    }

    return {
      success: true,
      notification: toNotificationDeliveryDto(delivery),
      jobId,
    };
  }
}
