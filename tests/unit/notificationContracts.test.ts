import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_ERROR_CATEGORIES,
  ErrorCodes,
} from '../../shared/src/index.js';
import {
  notificationChannelSchema,
  notificationTypeSchema,
  notificationStatusSchema,
  notificationErrorCategorySchema,
  notificationCurrencySchema,
  notificationIdempotencyKeySchema,
  recipientEmailSchema,
  recipientPhoneSchema,
  notificationReferenceIdSchema,
  notificationSubjectSchema,
  notificationProviderNameSchema,
  notificationProviderMessageIdSchema,
  stablePortalUrlSchema,
  safeNotificationErrorSchema,
  bookingConfirmedNotificationPayloadSchema,
  documentReadyNotificationPayloadSchema,
  refundSettledNotificationPayloadSchema,
  bookingCancelledNotificationPayloadSchema,
  notificationEventPayloadSchema,
  enqueueNotificationJobRequestSchema,
  notificationProviderResultSchema,
  notificationDeliveryDtoSchema,
  adminNotificationListQuerySchema,
  adminNotificationIdParamSchema,
  adminNotificationResendRequestSchema,
} from '../../shared/src/schemas/notification.schema.js';

describe('Phase 8 Step 2 — Shared Notification Contracts & Zod Validation Schemas', () => {
  // ============================================================
  // 1. Controlled Enums & Taxonomies (Migration 007 Alignment)
  // ============================================================
  describe('1. Controlled Enums & Taxonomies', () => {
    it('should validate notification channels matching migration 007', () => {
      NOTIFICATION_CHANNELS.forEach((channel) => {
        expect(notificationChannelSchema.parse(channel)).toBe(channel);
      });

      expect(() => notificationChannelSchema.parse('WHATSAPP')).toThrow();
      expect(() => notificationChannelSchema.parse('PUSH')).toThrow();
      expect(() => notificationChannelSchema.parse('SLACK')).toThrow();
      expect(() => notificationChannelSchema.parse('INVALID')).toThrow();
    });

    it('should validate notification types matching migration 007 and Step 0 baseline', () => {
      NOTIFICATION_TYPES.forEach((type) => {
        expect(notificationTypeSchema.parse(type)).toBe(type);
      });

      expect(() => notificationTypeSchema.parse('PAYMENT_FAILED')).toThrow();
      expect(() => notificationTypeSchema.parse('BOOKING_CREATED')).toThrow();
      expect(() => notificationTypeSchema.parse('PROMOTIONAL')).toThrow();
      expect(() => notificationTypeSchema.parse('MARKETING')).toThrow();
      expect(() => notificationTypeSchema.parse('PASSWORD_RESET')).toThrow();
    });

    it('should validate notification statuses matching migration 007', () => {
      NOTIFICATION_STATUSES.forEach((status) => {
        expect(notificationStatusSchema.parse(status)).toBe(status);
      });

      expect(() => notificationStatusSchema.parse('DELIVERED')).toThrow();
      expect(() => notificationStatusSchema.parse('QUEUED')).toThrow();
      expect(() => notificationStatusSchema.parse('PROCESSING')).toThrow();
      expect(() => notificationStatusSchema.parse('DEAD_LETTER')).toThrow();
    });

    it('should validate notification currency schema', () => {
      expect(notificationCurrencySchema.parse('INR')).toBe('INR');
      expect(notificationCurrencySchema.parse('USD')).toBe('USD');
      expect(() => notificationCurrencySchema.parse('EUR')).toThrow();
      expect(() => notificationCurrencySchema.parse('GBP')).toThrow();
    });

    it('should validate error categories', () => {
      NOTIFICATION_ERROR_CATEGORIES.forEach((category) => {
        expect(notificationErrorCategorySchema.parse(category)).toBe(category);
      });

      expect(() => notificationErrorCategorySchema.parse('UNKNOWN_CATEGORY')).toThrow();
    });

    it('should expose Phase 8 error codes in ErrorCodes registry', () => {
      expect(ErrorCodes.NOTIFICATION_NOT_FOUND).toBe('NOTIFICATION_NOT_FOUND');
      expect(ErrorCodes.NOTIFICATION_DELIVERY_FAILED).toBe('NOTIFICATION_DELIVERY_FAILED');
    });
  });

  // ============================================================
  // 2. Safe Error & Diagnostic Schemas
  // ============================================================
  describe('2. Safe Error & Diagnostic Schemas', () => {
    it('should parse valid safe diagnostic errors', () => {
      const validError = {
        errorCode: 'SMTP_CONNECTION_TIMEOUT',
        errorCategory: 'TIMEOUT',
        safeErrorMessage: 'Connection to outbound mail server timed out after 10000ms',
        providerStatusCode: 504,
      };

      const parsed = safeNotificationErrorSchema.parse(validError);
      expect(parsed.errorCode).toBe('SMTP_CONNECTION_TIMEOUT');
      expect(parsed.providerStatusCode).toBe(504);
    });

    it('should allow safe diagnostic errors without providerStatusCode', () => {
      const validError = {
        errorCode: 'INVALID_RECIPIENT_DOMAIN',
        errorCategory: 'INVALID_RECIPIENT',
        safeErrorMessage: 'Recipient domain has no valid MX records',
      };

      const parsed = safeNotificationErrorSchema.parse(validError);
      expect(parsed.errorCode).toBe('INVALID_RECIPIENT_DOMAIN');
      expect(parsed.providerStatusCode).toBeUndefined();
    });

    it('should reject invalid errorCode formatting or empty values', () => {
      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'invalid-lowercase-code',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Error message',
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: '',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Error message',
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'A'.repeat(65),
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Error message',
        }),
      ).toThrow();
    });

    it('should reject CRLF injection in safeErrorMessage', () => {
      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'ERR_TEST',
          errorCategory: 'NETWORK_ERROR',
          safeErrorMessage: 'Line 1\r\nLine 2',
        }),
      ).toThrow(/newline/i);

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'ERR_TEST',
          errorCategory: 'NETWORK_ERROR',
          safeErrorMessage: 'Line 1\nLine 2',
        }),
      ).toThrow(/newline/i);
    });

    it('should reject invalid provider HTTP status codes', () => {
      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'ERR_TEST',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Status too low',
          providerStatusCode: 99,
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'ERR_TEST',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Status too high',
          providerStatusCode: 600,
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'ERR_TEST',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Status decimal',
          providerStatusCode: 500.5,
        }),
      ).toThrow();
    });

    it('should strictly reject stack traces, secrets, tokens, or arbitrary sensitive fields', () => {
      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'PROVIDER_ERROR',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Failed to deliver',
          stack: 'Error at /backend/worker.ts:45',
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'PROVIDER_ERROR',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Failed to deliver',
          apiKey: 'secret-smtp-key-123',
        }),
      ).toThrow();

      expect(() =>
        safeNotificationErrorSchema.parse({
          errorCode: 'PROVIDER_ERROR',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Failed to deliver',
          password: 'supersecretpassword',
        }),
      ).toThrow();
    });
  });

  // ============================================================
  // 3. Subject, Email & Identifier Boundaries
  // ============================================================
  describe('3. Subject, Email & Identifier Boundaries', () => {
    it('should accept valid subject strings and reject CRLF injection', () => {
      expect(
        notificationSubjectSchema.parse(
          'Booking Confirmed — Your Young Tours & Travels Trip (YTT-202609-ABCD)',
        ),
      ).toBe('Booking Confirmed — Your Young Tours & Travels Trip (YTT-202609-ABCD)');

      expect(() =>
        notificationSubjectSchema.parse('Booking Confirmed\r\nBcc: attacker@example.com'),
      ).toThrow(/CRLF/i);

      expect(() =>
        notificationSubjectSchema.parse('Booking Confirmed\nSubject: Overridden'),
      ).toThrow(/CRLF/i);

      expect(() => notificationSubjectSchema.parse('')).toThrow();
      expect(() => notificationSubjectSchema.parse('A'.repeat(256))).toThrow();
    });

    it('should validate recipient email addresses and normalize to lowercase', () => {
      expect(recipientEmailSchema.parse('Customer@Example.Com ')).toBe('customer@example.com');
      expect(recipientEmailSchema.parse('user.name+tag@domain.co.in')).toBe(
        'user.name+tag@domain.co.in',
      );

      expect(() => recipientEmailSchema.parse('invalid-email')).toThrow();
      expect(() => recipientEmailSchema.parse('@missinguser.com')).toThrow();
      expect(() => recipientEmailSchema.parse('missingdomain@')).toThrow();
      expect(() => recipientEmailSchema.parse(`${'a'.repeat(250)}@test.com`)).toThrow();
    });

    it('should validate recipient phone numbers within limits', () => {
      expect(recipientPhoneSchema.parse('+919876543210')).toBe('+919876543210');
      expect(recipientPhoneSchema.parse('022-12345678')).toBe('022-12345678');
      expect(() => recipientPhoneSchema.parse('1'.repeat(33))).toThrow();
      expect(() => recipientPhoneSchema.parse('')).toThrow();
    });

    it('should validate idempotency keys within 1 to 128 characters', () => {
      expect(notificationIdempotencyKeySchema.parse('notif-booking-confirmed-YTT-12345')).toBe(
        'notif-booking-confirmed-YTT-12345',
      );
      expect(() => notificationIdempotencyKeySchema.parse('')).toThrow();
      expect(() => notificationIdempotencyKeySchema.parse('k'.repeat(129))).toThrow();
    });

    it('should validate reference IDs within 1 to 64 characters', () => {
      expect(notificationReferenceIdSchema.parse('YTT-202609-98765')).toBe('YTT-202609-98765');
      expect(() => notificationReferenceIdSchema.parse('')).toThrow();
      expect(() => notificationReferenceIdSchema.parse('r'.repeat(65))).toThrow();
    });

    it('should validate provider names and message IDs', () => {
      expect(notificationProviderNameSchema.parse('NODEMAILER_MOCK')).toBe('NODEMAILER_MOCK');
      expect(() => notificationProviderNameSchema.parse('')).toThrow();
      expect(() => notificationProviderNameSchema.parse('p'.repeat(65))).toThrow();

      expect(notificationProviderMessageIdSchema.parse('<msg-12345@smtp.youngtours.com>')).toBe(
        '<msg-12345@smtp.youngtours.com>',
      );
      expect(() => notificationProviderMessageIdSchema.parse('m'.repeat(129))).toThrow();
    });
  });

  // ============================================================
  // 4. Stable Document Route Security (No Expiring Presigned URLs)
  // ============================================================
  describe('4. Stable Document Route Security', () => {
    it('should accept stable application and portal URLs', () => {
      expect(stablePortalUrlSchema.parse('/my-bookings/YTT-202609-1234')).toBe(
        '/my-bookings/YTT-202609-1234',
      );
      expect(
        stablePortalUrlSchema.parse('https://youngtoursandtravels.com/portal/documents/invoice'),
      ).toBe('https://youngtoursandtravels.com/portal/documents/invoice');
    });

    it('should strictly reject raw AWS S3 presigned URLs with signatures or credentials', () => {
      expect(() =>
        stablePortalUrlSchema.parse(
          'https://mybucket.s3.ap-south-1.amazonaws.com/invoices/inv-1.pdf?X-Amz-Signature=abcdef123456&X-Amz-Credential=AKIA...&Expires=1700000000',
        ),
      ).toThrow(/presigned/i);
    });

    it('should strictly reject Azure Blob and GCP storage signed query URLs', () => {
      expect(() =>
        stablePortalUrlSchema.parse(
          'https://storage.googleapis.com/travel-docs/invoice.pdf?Signature=abc123&Expires=1700000000',
        ),
      ).toThrow(/presigned/i);

      expect(() =>
        stablePortalUrlSchema.parse(
          'https://travelaccount.blob.core.windows.net/docs/invoice.pdf?sv=2020-08-04&se=2026-09-30T20%3A00%3A00Z&sig=secretToken123',
        ),
      ).toThrow(/presigned/i);
    });
  });

  // ============================================================
  // 5. Domain Event Notification Payloads
  // ============================================================
  describe('5. Domain Event Notification Payloads', () => {
    it('should validate BOOKING_CONFIRMED payload', () => {
      const payload = {
        type: 'BOOKING_CONFIRMED' as const,
        bookingReference: 'YTT-202609-1001',
        customerName: 'Rahul Sharma',
        recipientEmail: 'rahul.sharma@example.com',
        recipientPhone: '+919876543210',
        channel: 'EMAIL' as const,
        portalUrl: '/bookings/YTT-202609-1001',
        packageTitle: 'Majestic Kerala Backwaters 5D4N',
        departureDate: '2026-10-15',
        totalAmount: 4500000,
        currency: 'INR' as const,
      };

      const parsed = bookingConfirmedNotificationPayloadSchema.parse(payload);
      expect(parsed.type).toBe('BOOKING_CONFIRMED');
      expect(parsed.bookingReference).toBe('YTT-202609-1001');
      expect(parsed.totalAmount).toBe(4500000);
    });

    it('should reject decimal monetary amounts in BOOKING_CONFIRMED', () => {
      expect(() =>
        bookingConfirmedNotificationPayloadSchema.parse({
          type: 'BOOKING_CONFIRMED',
          bookingReference: 'YTT-202609-1001',
          customerName: 'Rahul Sharma',
          recipientEmail: 'rahul.sharma@example.com',
          portalUrl: '/bookings/YTT-202609-1001',
          totalAmount: 45000.5,
        }),
      ).toThrow(/integer/i);
    });

    it('should strictly reject presigned URLs inside BOOKING_CONFIRMED portalUrl', () => {
      expect(() =>
        bookingConfirmedNotificationPayloadSchema.parse({
          type: 'BOOKING_CONFIRMED',
          bookingReference: 'YTT-202609-1001',
          customerName: 'Rahul Sharma',
          recipientEmail: 'rahul.sharma@example.com',
          portalUrl: 'https://s3.amazonaws.com/tickets/t1.pdf?X-Amz-Signature=12345',
        }),
      ).toThrow(/presigned/i);
    });

    it('should validate DOCUMENT_READY payload', () => {
      const payload = {
        type: 'DOCUMENT_READY' as const,
        bookingReference: 'YTT-202609-1001',
        recipientEmail: 'rahul.sharma@example.com',
        channel: 'EMAIL' as const,
        documentType: 'INVOICE' as const,
        portalDocumentUrl: '/portal/bookings/YTT-202609-1001/documents/invoice',
      };

      const parsed = documentReadyNotificationPayloadSchema.parse(payload);
      expect(parsed.type).toBe('DOCUMENT_READY');
      expect(parsed.documentType).toBe('INVOICE');
    });

    it('should validate REFUND_SETTLED payload', () => {
      const payload = {
        type: 'REFUND_SETTLED' as const,
        cancellationRequestId: '123e4567-e89b-12d3-a456-426614174000',
        bookingReference: 'YTT-202609-1001',
        recipientEmail: 'rahul.sharma@example.com',
        channel: 'EMAIL' as const,
        refundAmount: 3825000,
        currency: 'INR' as const,
        cancellationReason: 'Medical emergency',
      };

      const parsed = refundSettledNotificationPayloadSchema.parse(payload);
      expect(parsed.type).toBe('REFUND_SETTLED');
      expect(parsed.refundAmount).toBe(3825000);
      expect(parsed.currency).toBe('INR');
    });

    it('should reject negative or floating-point refund amounts in REFUND_SETTLED', () => {
      expect(() =>
        refundSettledNotificationPayloadSchema.parse({
          type: 'REFUND_SETTLED',
          bookingReference: 'YTT-202609-1001',
          recipientEmail: 'rahul.sharma@example.com',
          refundAmount: -5000,
          currency: 'INR',
        }),
      ).toThrow(/non-negative/i);

      expect(() =>
        refundSettledNotificationPayloadSchema.parse({
          type: 'REFUND_SETTLED',
          bookingReference: 'YTT-202609-1001',
          recipientEmail: 'rahul.sharma@example.com',
          refundAmount: 38250.75,
          currency: 'INR',
        }),
      ).toThrow(/integer/i);
    });

    it('should validate BOOKING_CANCELLED payload', () => {
      const payload = {
        type: 'BOOKING_CANCELLED' as const,
        bookingReference: 'YTT-202609-1001',
        recipientEmail: 'rahul.sharma@example.com',
        channel: 'EMAIL' as const,
        cancellationReason: 'Customer requested cancellation due to schedule conflict',
      };

      const parsed = bookingCancelledNotificationPayloadSchema.parse(payload);
      expect(parsed.type).toBe('BOOKING_CANCELLED');
      expect(parsed.cancellationReason).toContain('schedule conflict');
    });

    it('should validate discriminated union across all 4 event payloads', () => {
      const event1 = notificationEventPayloadSchema.parse({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-1001',
        customerName: 'Aarav Patel',
        recipientEmail: 'aarav@example.com',
        portalUrl: '/bookings/YTT-1001',
      });
      expect(event1.type).toBe('BOOKING_CONFIRMED');

      const event2 = notificationEventPayloadSchema.parse({
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-1001',
        recipientEmail: 'aarav@example.com',
        documentType: 'VOUCHER',
        portalDocumentUrl: '/documents/voucher',
      });
      expect(event2.type).toBe('DOCUMENT_READY');

      const event3 = notificationEventPayloadSchema.parse({
        type: 'REFUND_SETTLED',
        bookingReference: 'YTT-1001',
        recipientEmail: 'aarav@example.com',
        refundAmount: 100000,
        currency: 'INR',
      });
      expect(event3.type).toBe('REFUND_SETTLED');

      const event4 = notificationEventPayloadSchema.parse({
        type: 'BOOKING_CANCELLED',
        bookingReference: 'YTT-1001',
        recipientEmail: 'aarav@example.com',
        cancellationReason: 'Cancelled by customer',
      });
      expect(event4.type).toBe('BOOKING_CANCELLED');

      expect(() =>
        notificationEventPayloadSchema.parse({
          type: 'UNSUPPORTED_EVENT_TYPE',
          bookingReference: 'YTT-1001',
        }),
      ).toThrow();
    });
  });

  // ============================================================
  // 6. Enqueue Notification Job Contract
  // ============================================================
  describe('6. Enqueue Notification Job Contract', () => {
    it('should parse valid enqueue job requests', () => {
      const request = {
        idempotencyKey: 'job-notif-confirm-YTT-1001',
        recipientEmail: 'customer@example.com',
        recipientPhone: '+919999988888',
        channel: 'EMAIL' as const,
        notificationType: 'BOOKING_CONFIRMED' as const,
        referenceId: 'YTT-1001',
        subject: 'Booking Confirmed — Young Tours & Travels',
        payload: {
          type: 'BOOKING_CONFIRMED' as const,
          bookingReference: 'YTT-1001',
          customerName: 'Customer Name',
          recipientEmail: 'customer@example.com',
          portalUrl: '/bookings/YTT-1001',
        },
      };

      const parsed = enqueueNotificationJobRequestSchema.parse(request);
      expect(parsed.idempotencyKey).toBe('job-notif-confirm-YTT-1001');
      expect(parsed.notificationType).toBe('BOOKING_CONFIRMED');
      expect(parsed.channel).toBe('EMAIL');
    });

    it('should default channel to EMAIL when omitted in enqueue request', () => {
      const request = {
        idempotencyKey: 'job-notif-confirm-YTT-1002',
        recipientEmail: 'customer@example.com',
        notificationType: 'DOCUMENT_READY' as const,
        referenceId: 'YTT-1002',
        subject: 'Travel Documents Ready',
        payload: {
          type: 'DOCUMENT_READY' as const,
          bookingReference: 'YTT-1002',
          recipientEmail: 'customer@example.com',
          documentType: 'INVOICE' as const,
          portalDocumentUrl: '/documents/invoice',
        },
      };

      const parsed = enqueueNotificationJobRequestSchema.parse(request);
      expect(parsed.channel).toBe('EMAIL');
    });
  });

  // ============================================================
  // 7. Provider Result Contract
  // ============================================================
  describe('7. Provider Result Contract', () => {
    it('should validate successful provider response', () => {
      const successResult = {
        success: true,
        providerName: 'MOCK_EMAIL_PROVIDER',
        providerMessageId: '<mock-msg-001@travelweb.local>',
        statusCode: 250,
      };

      const parsed = notificationProviderResultSchema.parse(successResult);
      expect(parsed.success).toBe(true);
      expect(parsed.providerName).toBe('MOCK_EMAIL_PROVIDER');
      expect(parsed.providerMessageId).toBe('<mock-msg-001@travelweb.local>');
    });

    it('should validate failed provider response with safe diagnostics', () => {
      const failureResult = {
        success: false,
        providerName: 'SMTP_PROVIDER',
        statusCode: 550,
        error: {
          errorCode: 'SMTP_550_MAILBOX_UNAVAILABLE',
          errorCategory: 'INVALID_RECIPIENT',
          safeErrorMessage: 'Requested action not taken: mailbox unavailable',
          providerStatusCode: 550,
        },
      };

      const parsed = notificationProviderResultSchema.parse(failureResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.errorCode).toBe('SMTP_550_MAILBOX_UNAVAILABLE');
    });

    it('should strictly reject provider credentials or stack traces in provider results', () => {
      expect(() =>
        notificationProviderResultSchema.parse({
          success: true,
          providerName: 'SMTP_PROVIDER',
          apiKey: 'secret-smtp-password',
        }),
      ).toThrow();
    });
  });

  // ============================================================
  // 8. Notification Delivery DTO Contract (Migration 007 Parity)
  // ============================================================
  describe('8. Notification Delivery DTO Contract', () => {
    it('should validate full notification delivery record', () => {
      const deliveryRecord = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        idempotencyKey: 'notif-bc-YTT-1001-sent',
        recipientEmail: 'priya.sharma@example.com',
        recipientPhone: '+919876500000',
        channel: 'EMAIL' as const,
        notificationType: 'BOOKING_CONFIRMED' as const,
        referenceId: 'YTT-1001',
        subject: 'Booking Confirmed — Young Tours & Travels',
        status: 'SENT' as const,
        providerName: 'NODEMAILER',
        providerMessageId: '<msg-12345@youngtours.com>',
        retryCount: 0,
        errorDetails: null,
        sentAt: '2026-09-30T14:00:00.000Z',
        createdAt: '2026-09-30T13:59:58.000Z',
        updatedAt: '2026-09-30T14:00:00.000Z',
      };

      const parsed = notificationDeliveryDtoSchema.parse(deliveryRecord);
      expect(parsed.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(parsed.status).toBe('SENT');
      expect(parsed.retryCount).toBe(0);
      expect(parsed.errorDetails).toBeNull();
    });

    it('should validate failed delivery record with structured safe diagnostic error', () => {
      const failedRecord = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        idempotencyKey: 'notif-bc-YTT-1002-fail',
        recipientEmail: 'nonexistent@invalid-domain-xyz.com',
        recipientPhone: null,
        channel: 'EMAIL' as const,
        notificationType: 'DOCUMENT_READY' as const,
        referenceId: 'YTT-1002',
        subject: 'Travel Voucher Ready',
        status: 'FAILED' as const,
        providerName: 'NODEMAILER',
        providerMessageId: null,
        retryCount: 3,
        errorDetails: {
          errorCode: 'SMTP_DNS_RESOLUTION_FAILED',
          errorCategory: 'NETWORK_ERROR',
          safeErrorMessage: 'Unable to resolve destination mail exchanger host',
          providerStatusCode: 503,
        },
        sentAt: null,
        createdAt: '2026-09-30T13:59:58.000Z',
        updatedAt: '2026-09-30T14:05:00.000Z',
      };

      const parsed = notificationDeliveryDtoSchema.parse(failedRecord);
      expect(parsed.status).toBe('FAILED');
      expect(parsed.retryCount).toBe(3);
      expect(parsed.errorDetails?.errorCode).toBe('SMTP_DNS_RESOLUTION_FAILED');
    });
  });

  // ============================================================
  // 9. Admin Notification Management Contracts
  // ============================================================
  describe('9. Admin Notification Management Contracts', () => {
    it('should validate admin list query parameters with defaults', () => {
      const parsed = adminNotificationListQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.status).toBeUndefined();
      expect(parsed.notificationType).toBeUndefined();
    });

    it('should validate admin list query with explicit filters and coerce numbers', () => {
      const parsed = adminNotificationListQuerySchema.parse({
        page: '2',
        limit: '50',
        status: 'FAILED',
        notificationType: 'REFUND_SETTLED',
        channel: 'EMAIL',
        referenceId: 'YTT-1001',
      });

      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.status).toBe('FAILED');
      expect(parsed.notificationType).toBe('REFUND_SETTLED');
      expect(parsed.channel).toBe('EMAIL');
      expect(parsed.referenceId).toBe('YTT-1001');
    });

    it('should reject invalid status or limit in admin list query', () => {
      expect(() =>
        adminNotificationListQuerySchema.parse({
          status: 'DELIVERED',
        }),
      ).toThrow();

      expect(() =>
        adminNotificationListQuerySchema.parse({
          limit: '150',
        }),
      ).toThrow();

      expect(() =>
        adminNotificationListQuerySchema.parse({
          page: '0',
        }),
      ).toThrow();
    });

    it('should validate admin notification :id param schema', () => {
      expect(
        adminNotificationIdParamSchema.parse({
          id: '123e4567-e89b-12d3-a456-426614174000',
        }),
      ).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(() =>
        adminNotificationIdParamSchema.parse({
          id: 'invalid-not-a-uuid',
        }),
      ).toThrow();
    });

    it('should enforce strictly empty body for admin resend request', () => {
      expect(adminNotificationResendRequestSchema.parse({})).toEqual({});

      expect(() =>
        adminNotificationResendRequestSchema.parse({
          overrideRecipient: 'hacker@example.com',
        }),
      ).toThrow();
    });
  });
});
