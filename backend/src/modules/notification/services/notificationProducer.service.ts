import { Queue } from 'bullmq';
import {
  BookingCancelledNotificationPayload,
  BookingConfirmedNotificationPayload,
  DocumentReadyNotificationPayload,
  EnqueueNotificationJobRequest,
  enqueueNotificationJobRequestSchema,
  RefundSettledNotificationPayload,
} from '../../../../../shared/src/index.js';
import { NotificationTemplateRegistry } from '../templates/templateRegistry.js';
import {
  enqueueNotificationJob,
  NotificationJobData,
  NotificationJobResult,
} from '../../../../../worker/src/queues/notificationQueue.js';


// ============================================================
// Phase 8 Step 5 — Notification Job Producer Service
// ============================================================

export interface EnqueueResult {
  enqueued: boolean;
  jobId?: string;
  reason?: string;
}

export class NotificationProducerService {
  constructor(
    private readonly queue: Queue<NotificationJobData, NotificationJobResult> | null,
    private readonly templateRegistry: typeof NotificationTemplateRegistry = NotificationTemplateRegistry,
  ) {}

  /**
   * Validates and enqueues a generic notification delivery request into BullMQ.
   * Fails safe: If Redis is unavailable or queue is not initialized, logs warning and returns { enqueued: false }
   * to ensure core business operations (bookings, payments, cancellations) are never aborted by queue outages.
   */
  async enqueueNotification(request: EnqueueNotificationJobRequest): Promise<EnqueueResult> {
    if (!this.queue) {
      return {
        enqueued: false,
        reason: 'QUEUE_NOT_CONFIGURED',
      };
    }

    try {
      const validated = enqueueNotificationJobRequestSchema.parse(request);
      const job = await enqueueNotificationJob(this.queue, validated);

      return {
        enqueued: true,
        jobId: job.id ?? undefined,
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Unknown enqueue failure';
      return {
        enqueued: false,
        reason,
      };
    }
  }

  /**
   * Produces a BOOKING_CONFIRMED notification job following authoritative booking confirmation.
   */
  async enqueueBookingConfirmed(
    payload: BookingConfirmedNotificationPayload,
    idempotencyKey?: string,
  ): Promise<EnqueueResult> {
    const rendered = this.templateRegistry.render('BOOKING_CONFIRMED', payload);
    const key = idempotencyKey || `notif-confirmed-${payload.bookingReference}`;

    return this.enqueueNotification({
      idempotencyKey: key,
      recipientEmail: payload.recipientEmail,
      recipientPhone: payload.recipientPhone,
      channel: payload.channel ?? 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: payload.bookingReference,
      subject: rendered.subject,
      payload,
    });
  }

  /**
   * Produces a DOCUMENT_READY notification job following statutory document generation.
   */
  async enqueueDocumentReady(
    payload: DocumentReadyNotificationPayload,
    idempotencyKey?: string,
  ): Promise<EnqueueResult> {
    const rendered = this.templateRegistry.render('DOCUMENT_READY', payload);
    const key = idempotencyKey || `notif-doc-${payload.bookingReference}-${payload.documentType}`;

    return this.enqueueNotification({
      idempotencyKey: key,
      recipientEmail: payload.recipientEmail,
      recipientPhone: payload.recipientPhone,
      channel: payload.channel ?? 'EMAIL',
      notificationType: 'DOCUMENT_READY',
      referenceId: payload.bookingReference,
      subject: rendered.subject,
      payload,
    });
  }

  /**
   * Produces a REFUND_SETTLED notification job following definitive gateway refund settlement.
   */
  async enqueueRefundSettled(
    payload: RefundSettledNotificationPayload,
    idempotencyKey?: string,
  ): Promise<EnqueueResult> {
    const rendered = this.templateRegistry.render('REFUND_SETTLED', payload);
    const key =
      idempotencyKey ||
      (payload.cancellationRequestId
        ? `notif-refund-${payload.cancellationRequestId}`
        : `notif-refund-${payload.bookingReference}`);

    return this.enqueueNotification({
      idempotencyKey: key,
      recipientEmail: payload.recipientEmail,
      recipientPhone: payload.recipientPhone,
      channel: payload.channel ?? 'EMAIL',
      notificationType: 'REFUND_SETTLED',
      referenceId: payload.bookingReference,
      subject: rendered.subject,
      payload,
    });
  }

  /**
   * Produces a BOOKING_CANCELLED notification job following definitive booking cancellation.
   */
  async enqueueBookingCancelled(
    payload: BookingCancelledNotificationPayload,
    idempotencyKey?: string,
  ): Promise<EnqueueResult> {
    const rendered = this.templateRegistry.render('BOOKING_CANCELLED', payload);
    const key = idempotencyKey || `notif-cancelled-${payload.bookingReference}`;

    return this.enqueueNotification({
      idempotencyKey: key,
      recipientEmail: payload.recipientEmail,
      recipientPhone: payload.recipientPhone,
      channel: payload.channel ?? 'EMAIL',
      notificationType: 'BOOKING_CANCELLED',
      referenceId: payload.bookingReference,
      subject: rendered.subject,
      payload,
    });
  }
}
