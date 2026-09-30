import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AdminNotificationService,
  toNotificationDeliveryDto,
} from '../../backend/src/modules/admin/services/adminNotification.service.js';
import {
  NotificationDeliveryRepository,
  NotificationDeliveryEntity,
} from '../../backend/src/modules/notification/repositories/notificationDelivery.repository.js';
import { NotificationProducerService } from '../../backend/src/modules/notification/services/notificationProducer.service.js';
import { AdminAuditLogService } from '../../backend/src/modules/admin/services/adminAuditLog.service.js';
import {
  BookingRepository,
  BookingEntity,
} from '../../backend/src/modules/booking/repositories/booking.repository.js';

describe('Phase 8 Step 7 — Admin Notification Service Unit Tests', () => {
  let service: AdminNotificationService;
  let mockNotificationRepo: NotificationDeliveryRepository;
  let mockProducer: NotificationProducerService;
  let mockAuditLogService: AdminAuditLogService;
  let mockBookingRepo: BookingRepository;

  const sampleAdminId = '99999999-9999-4999-8999-999999999999';

  const sampleDelivery: NotificationDeliveryEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'notif-confirmed-BK-20261001-TEST',
    recipientEmail: 'traveler@example.com',
    recipientPhone: '+919876543210',
    channel: 'EMAIL',
    notificationType: 'BOOKING_CONFIRMED',
    referenceId: 'BK-20261001-TEST',
    subject: 'Booking Confirmation - BK-20261001-TEST',
    status: 'SENT',
    providerName: 'SMTP',
    providerMessageId: 'smtp-msg-12345',
    retryCount: 0,
    errorDetails: null,
    sentAt: new Date('2026-10-01T10:00:00.000Z'),
    createdAt: new Date('2026-10-01T09:59:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  const sampleFailedDelivery: NotificationDeliveryEntity = {
    id: '22222222-2222-4222-8222-222222222222',
    idempotencyKey: 'notif-doc-BK-20261001-DOCS',
    recipientEmail: 'client@example.com',
    recipientPhone: null,
    channel: 'EMAIL',
    notificationType: 'DOCUMENT_READY',
    referenceId: 'BK-20261001-DOCS',
    subject: 'Travel Documents Ready - BK-20261001-DOCS',
    status: 'FAILED',
    providerName: 'SMTP',
    providerMessageId: null,
    retryCount: 5,
    errorDetails: {
      errorCode: 'PROVIDER_TIMEOUT',
      errorCategory: 'TIMEOUT',
      safeErrorMessage: 'SMTP gateway timed out after 10000ms',
      providerStatusCode: 504,
    },
    sentAt: null,
    createdAt: new Date('2026-10-01T11:00:00.000Z'),
    updatedAt: new Date('2026-10-01T11:05:00.000Z'),
  };

  const sampleInFlightDelivery: NotificationDeliveryEntity = {
    id: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'notif-refund-BK-20261001-REFUND',
    recipientEmail: 'refundee@example.com',
    recipientPhone: null,
    channel: 'EMAIL',
    notificationType: 'REFUND_SETTLED',
    referenceId: 'BK-20261001-REFUND',
    subject: 'Refund Settled - BK-20261001-REFUND',
    status: 'RETRYING',
    providerName: 'SMTP',
    providerMessageId: null,
    retryCount: 2,
    errorDetails: {
      errorCode: 'RATE_LIMITED',
      errorCategory: 'RATE_LIMITED',
      safeErrorMessage: 'Too many requests to SMTP host',
      providerStatusCode: 429,
    },
    sentAt: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:02:00.000Z'),
  };

  const sampleBooking: BookingEntity = {
    id: '44444444-4444-4444-8444-444444444444',
    bookingReference: 'BK-20261001-TEST',
    customerId: '55555555-5555-4555-8555-555555555555',
    departureId: '66666666-6666-4666-8666-666666666666',
    holdId: '77777777-7777-4777-8777-777777777777',
    partySize: 2,
    adultCount: 2,
    childCount: 0,
    totalPrice: 5000000,
    currency: 'INR',
    status: 'CONFIRMED',
    primaryContact: {
      name: 'Priya Sharma',
      email: 'traveler@example.com',
      phone: '+919876543210',
    },
    packageSnapshot: {
      title: 'Majestic Kerala Explorer',
    } as any,
    departureSnapshot: {
      departureDate: '2026-11-15',
    } as any,
    itinerarySnapshot: [],
    priceBreakdown: {} as any,
    confirmedAt: new Date(),
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockNotificationRepo = {
      list: vi.fn(async () => ({ items: [sampleDelivery], total: 1 })),
      findById: vi.fn(async (id: string) => {
        if (id === sampleDelivery.id) return sampleDelivery;
        if (id === sampleFailedDelivery.id) return sampleFailedDelivery;
        if (id === sampleInFlightDelivery.id) return sampleInFlightDelivery;
        return null;
      }),
      create: vi.fn(),
      updateStatus: vi.fn(),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    } as unknown as NotificationDeliveryRepository;

    mockProducer = {
      enqueueNotification: vi.fn(async () => ({ enqueued: true, jobId: 'bullmq-job-999' })),
    } as unknown as NotificationProducerService;

    mockAuditLogService = {
      logAction: vi.fn(async () => ({}) as any),
    } as unknown as AdminAuditLogService;

    mockBookingRepo = {
      findByReference: vi.fn(async (ref: string) => {
        if (ref === sampleBooking.bookingReference) return sampleBooking;
        return null;
      }),
    } as unknown as BookingRepository;

    service = new AdminNotificationService(
      mockNotificationRepo,
      mockProducer,
      mockAuditLogService,
      mockBookingRepo,
    );
  });

  // ============================================================
  // 1. DTO Transformation & Sanitization
  // ============================================================

  describe('toNotificationDeliveryDto', () => {
    it('serializes notification dates to ISO strings and preserves safe fields', () => {
      const dto = toNotificationDeliveryDto(sampleDelivery);

      expect(dto.id).toBe(sampleDelivery.id);
      expect(dto.idempotencyKey).toBe(sampleDelivery.idempotencyKey);
      expect(dto.recipientEmail).toBe('traveler@example.com');
      expect(dto.channel).toBe('EMAIL');
      expect(dto.notificationType).toBe('BOOKING_CONFIRMED');
      expect(dto.status).toBe('SENT');
      expect(dto.sentAt).toBe('2026-10-01T10:00:00.000Z');
      expect(dto.createdAt).toBe('2026-10-01T09:59:00.000Z');
      expect(dto.updatedAt).toBe('2026-10-01T10:00:00.000Z');
      expect((dto as any).password).toBeUndefined();
      expect((dto as any).smtpPassword).toBeUndefined();
    });

    it('safely handles null sentAt and errorDetails for failed records', () => {
      const dto = toNotificationDeliveryDto(sampleFailedDelivery);

      expect(dto.status).toBe('FAILED');
      expect(dto.sentAt).toBeNull();
      expect(dto.errorDetails).toEqual({
        errorCode: 'PROVIDER_TIMEOUT',
        errorCategory: 'TIMEOUT',
        safeErrorMessage: 'SMTP gateway timed out after 10000ms',
        providerStatusCode: 504,
      });
      expect((dto.errorDetails as any)?.stack).toBeUndefined();
    });
  });

  // ============================================================
  // 2. List & Query Operations
  // ============================================================

  describe('listNotifications', () => {
    it('delegates to repository with parsed defaults and returns paginated result', async () => {
      const result = await service.listNotifications({});

      expect(mockNotificationRepo.list).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        notificationType: undefined,
        channel: undefined,
        referenceId: undefined,
        recipientEmail: undefined,
      });

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('passes dimensional filters to repository correctly', async () => {
      await service.listNotifications({
        page: 2,
        limit: 10,
        status: 'FAILED',
        notificationType: 'DOCUMENT_READY',
        channel: 'EMAIL',
        referenceId: 'BK-20261001-DOCS',
        recipientEmail: 'client@example.com',
      });

      expect(mockNotificationRepo.list).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: 'FAILED',
        notificationType: 'DOCUMENT_READY',
        channel: 'EMAIL',
        referenceId: 'BK-20261001-DOCS',
        recipientEmail: 'client@example.com',
      });
    });
  });

  // ============================================================
  // 3. Detail by ID
  // ============================================================

  describe('getNotificationById', () => {
    it('returns DTO when notification delivery exists', async () => {
      const result = await service.getNotificationById(sampleDelivery.id);

      expect(result.id).toBe(sampleDelivery.id);
      expect(result.subject).toBe(sampleDelivery.subject);
      expect(mockNotificationRepo.findById).toHaveBeenCalledWith(sampleDelivery.id);
    });

    it('throws NOTIFICATION_NOT_FOUND (404) when notification does not exist', async () => {
      await expect(
        service.getNotificationById('00000000-0000-4000-8000-000000000000'),
      ).rejects.toThrowError();
    });

    it('throws VALIDATION_ERROR (400) on malformed UUID', async () => {
      await expect(service.getNotificationById('invalid-uuid')).rejects.toThrowError();
    });
  });

  // ============================================================
  // 4. Manual Resend Operations & Security
  // ============================================================

  describe('resendNotification', () => {
    it('successfully resends a SENT notification by reconstructing authoritative payload', async () => {
      const result = await service.resendNotification(
        sampleDelivery.id,
        sampleAdminId,
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('bullmq-job-999');
      expect(result.notification.id).toBe(sampleDelivery.id);

      // Verify producer was invoked with deterministic resend idempotency key and authoritative booking context
      expect(mockProducer.enqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'traveler@example.com',
          channel: 'EMAIL',
          notificationType: 'BOOKING_CONFIRMED',
          referenceId: 'BK-20261001-TEST',
          payload: expect.objectContaining({
            type: 'BOOKING_CONFIRMED',
            bookingReference: 'BK-20261001-TEST',
            customerName: 'Priya Sharma',
            totalAmount: 5000000,
            currency: 'INR',
          }),
        }),
      );

      // Verify audit logging
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith({
        adminId: sampleAdminId,
        action: 'NOTIFICATION_RESEND',
        entityType: 'NOTIFICATION',
        entityId: sampleDelivery.id,
        details: expect.objectContaining({
          notificationType: 'BOOKING_CONFIRMED',
          recipientEmail: 'traveler@example.com',
          referenceId: 'BK-20261001-TEST',
          previousStatus: 'SENT',
          jobId: 'bullmq-job-999',
        }),
        ipAddress: '127.0.0.1',
      });
    });

    it('successfully resends a FAILED notification', async () => {
      const result = await service.resendNotification(sampleFailedDelivery.id, sampleAdminId);

      expect(result.success).toBe(true);
      expect(mockProducer.enqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'client@example.com',
          notificationType: 'DOCUMENT_READY',
          referenceId: 'BK-20261001-DOCS',
        }),
      );
    });

    it('rejects resend for in-flight notifications (RETRYING / PENDING) with 409 CONFLICT', async () => {
      await expect(
        service.resendNotification(sampleInFlightDelivery.id, sampleAdminId),
      ).rejects.toThrowError(/cannot be manually resent until terminal state is reached/);

      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('throws NOTIFICATION_NOT_FOUND (404) when resending non-existent notification', async () => {
      await expect(
        service.resendNotification('00000000-0000-4000-8000-000000000000', sampleAdminId),
      ).rejects.toThrowError();

      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });
  });
});
