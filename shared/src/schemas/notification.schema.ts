import { z } from 'zod';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_ERROR_CATEGORIES,
} from '../types/notification.js';

// ============================================================
// Phase 8 Step 2 — Shared Notification Zod Validation Schemas
// ============================================================

// ============================================================
// 1. Primitive & Enum Schemas
// ============================================================

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export const notificationErrorCategorySchema = z.enum(NOTIFICATION_ERROR_CATEGORIES);
export const notificationCurrencySchema = z.enum(['INR', 'USD']);

/**
 * Idempotency key: 1 to 128 characters alphanumeric/dash/underscore.
 */
export const notificationIdempotencyKeySchema = z
  .string({ required_error: 'Idempotency key is required' })
  .trim()
  .min(1, 'Idempotency key cannot be empty')
  .max(128, 'Idempotency key must not exceed 128 characters');

/**
 * Recipient email: Canonical trimmed, lowercase email, max 255 characters.
 */
export const recipientEmailSchema = z
  .string({ required_error: 'Recipient email is required' })
  .trim()
  .toLowerCase()
  .email('Invalid recipient email address format')
  .max(255, 'Recipient email must not exceed 255 characters');

/**
 * Recipient phone: Optional phone string, max 32 characters.
 */
export const recipientPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Recipient phone cannot be empty if provided')
  .max(32, 'Recipient phone must not exceed 32 characters');

/**
 * Reference ID: Generic domain object identifier (booking ref, cancellation ID, etc.), max 64 characters.
 */
export const notificationReferenceIdSchema = z
  .string({ required_error: 'Reference ID is required' })
  .trim()
  .min(1, 'Reference ID cannot be empty')
  .max(64, 'Reference ID must not exceed 64 characters');

/**
 * Subject: Max 255 characters, strictly rejecting CRLF injection characters (\r, \n).
 */
export const notificationSubjectSchema = z
  .string({ required_error: 'Subject is required' })
  .trim()
  .min(1, 'Subject cannot be empty')
  .max(255, 'Subject must not exceed 255 characters')
  .refine((val) => !/[\r\n]/.test(val), {
    message: 'Subject must not contain CRLF or newline characters',
  });

/**
 * Provider name: Provider adapter identifier (e.g. 'NODEMAILER', 'SES', 'MOCK'), max 64 characters.
 */
export const notificationProviderNameSchema = z
  .string({ required_error: 'Provider name is required' })
  .trim()
  .min(1, 'Provider name cannot be empty')
  .max(64, 'Provider name must not exceed 64 characters');

/**
 * Provider message ID: External tracking ID from provider response, max 128 characters.
 */
export const notificationProviderMessageIdSchema = z
  .string()
  .trim()
  .min(1, 'Provider message ID cannot be empty if provided')
  .max(128, 'Provider message ID must not exceed 128 characters');

// ============================================================
// 2. Safe URL & Diagnostic Schemas
// ============================================================

const FORBIDDEN_PRESIGNED_QUERY_PATTERNS =
  /(?:X-Amz-Signature|X-Amz-Credential|Signature=|Expires=|sig=|se=|sv=|token=)/i;
const FORBIDDEN_PRESIGNED_HOST_PATTERNS =
  /(?:s3[.-]|amazonaws\.com|blob\.core\.windows\.net|storage\.googleapis\.com)/i;

/**
 * Stable Portal URL Schema: Rejects raw expiring presigned URLs and cloud storage signatures.
 */
export const stablePortalUrlSchema = z
  .string({ required_error: 'Portal URL is required' })
  .trim()
  .min(1, 'Portal URL cannot be empty')
  .max(500, 'Portal URL must not exceed 500 characters')
  .refine(
    (url) =>
      !FORBIDDEN_PRESIGNED_QUERY_PATTERNS.test(url) && !FORBIDDEN_PRESIGNED_HOST_PATTERNS.test(url),
    {
      message:
        'Stable portal route must not contain raw expiring presigned URLs or storage signatures',
    },
  );

/**
 * Safe Notification Error Schema: Bounded structured diagnostic metadata for notification_deliveries.error_details.
 * Strictly excludes stack traces, secrets, credentials, tokens, or raw payment details.
 */
export const safeNotificationErrorSchema = z
  .object({
    errorCode: z
      .string({ required_error: 'errorCode is required' })
      .trim()
      .min(1, 'errorCode cannot be empty')
      .max(64, 'errorCode must not exceed 64 characters')
      .regex(/^[A-Z0-9_]+$/, 'errorCode must be uppercase alphanumeric with underscores'),
    errorCategory: z
      .string({ required_error: 'errorCategory is required' })
      .trim()
      .min(1, 'errorCategory cannot be empty')
      .max(32, 'errorCategory must not exceed 32 characters'),
    safeErrorMessage: z
      .string({ required_error: 'safeErrorMessage is required' })
      .trim()
      .min(1, 'safeErrorMessage cannot be empty')
      .max(500, 'safeErrorMessage must not exceed 500 characters')
      .refine((val) => !/[\r\n]/.test(val), {
        message: 'safeErrorMessage must not contain newline characters',
      }),
    providerStatusCode: z
      .number()
      .int('providerStatusCode must be an integer')
      .min(100, 'providerStatusCode must be a valid HTTP/provider code (>= 100)')
      .max(599, 'providerStatusCode must be a valid HTTP/provider code (<= 599)')
      .optional(),
  })
  .strict();

export type SafeNotificationErrorInput = z.infer<typeof safeNotificationErrorSchema>;

// ============================================================
// 3. Domain Event Notification Payload Schemas
// ============================================================

/**
 * Booking Confirmed Payload: Requires booking reference, customer name, recipient email, portal link.
 */
export const bookingConfirmedNotificationPayloadSchema = z
  .object({
    type: z.literal('BOOKING_CONFIRMED'),
    bookingReference: notificationReferenceIdSchema,
    customerName: z.string().trim().min(1, 'Customer name cannot be empty').max(255),
    recipientEmail: recipientEmailSchema,
    recipientPhone: recipientPhoneSchema.optional(),
    channel: notificationChannelSchema.optional().default('EMAIL'),
    portalUrl: stablePortalUrlSchema,
    packageTitle: z.string().trim().min(1).max(255).optional(),
    departureDate: z.string().trim().optional(),
    totalAmount: z
      .number()
      .int('Total amount must be an integer in minor units')
      .nonnegative('Total amount must be non-negative')
      .optional(),
    currency: notificationCurrencySchema.optional(),
  })
  .strict();

export type BookingConfirmedNotificationPayloadInput = z.infer<
  typeof bookingConfirmedNotificationPayloadSchema
>;

/**
 * Document Ready Payload: Requires booking reference, recipient email, document type, authenticated download route.
 */
export const documentReadyNotificationPayloadSchema = z
  .object({
    type: z.literal('DOCUMENT_READY'),
    bookingReference: notificationReferenceIdSchema,
    recipientEmail: recipientEmailSchema,
    recipientPhone: recipientPhoneSchema.optional(),
    channel: notificationChannelSchema.optional().default('EMAIL'),
    documentType: z.enum(['INVOICE', 'VOUCHER', 'ALL']),
    portalDocumentUrl: stablePortalUrlSchema,
  })
  .strict();

export type DocumentReadyNotificationPayloadInput = z.infer<
  typeof documentReadyNotificationPayloadSchema
>;

/**
 * Refund Settled Payload: Requires settled refund amount in minor units, currency, booking reference.
 */
export const refundSettledNotificationPayloadSchema = z
  .object({
    type: z.literal('REFUND_SETTLED'),
    cancellationRequestId: z.string().uuid('Invalid cancellation request ID format').optional(),
    bookingReference: notificationReferenceIdSchema,
    recipientEmail: recipientEmailSchema,
    recipientPhone: recipientPhoneSchema.optional(),
    channel: notificationChannelSchema.optional().default('EMAIL'),
    refundAmount: z
      .number()
      .int('Refund amount must be an integer in minor units')
      .nonnegative('Refund amount must be non-negative'),
    currency: notificationCurrencySchema,
    cancellationReason: z.string().trim().max(1000).optional(),
  })
  .strict();

export type RefundSettledNotificationPayloadInput = z.infer<
  typeof refundSettledNotificationPayloadSchema
>;

/**
 * Booking Cancelled Payload: Requires booking reference, recipient email, cancellation reason.
 */
export const bookingCancelledNotificationPayloadSchema = z
  .object({
    type: z.literal('BOOKING_CANCELLED'),
    bookingReference: notificationReferenceIdSchema,
    recipientEmail: recipientEmailSchema,
    recipientPhone: recipientPhoneSchema.optional(),
    channel: notificationChannelSchema.optional().default('EMAIL'),
    cancellationReason: z
      .string({ required_error: 'Cancellation reason is required' })
      .trim()
      .min(1, 'Cancellation reason cannot be empty')
      .max(1000, 'Cancellation reason must not exceed 1000 characters'),
  })
  .strict();

export type BookingCancelledNotificationPayloadInput = z.infer<
  typeof bookingCancelledNotificationPayloadSchema
>;

/**
 * Discriminated Union of all supported Notification Event Payloads.
 */
export const notificationEventPayloadSchema = z.discriminatedUnion('type', [
  bookingConfirmedNotificationPayloadSchema,
  documentReadyNotificationPayloadSchema,
  refundSettledNotificationPayloadSchema,
  bookingCancelledNotificationPayloadSchema,
]);

export type NotificationEventPayloadInput = z.infer<typeof notificationEventPayloadSchema>;

// ============================================================
// 4. Enqueue Notification Job Contract Schema
// ============================================================

export const enqueueNotificationJobRequestSchema = z
  .object({
    idempotencyKey: notificationIdempotencyKeySchema,
    recipientEmail: recipientEmailSchema,
    recipientPhone: recipientPhoneSchema.optional(),
    channel: notificationChannelSchema.default('EMAIL'),
    notificationType: notificationTypeSchema,
    referenceId: notificationReferenceIdSchema,
    subject: notificationSubjectSchema,
    payload: notificationEventPayloadSchema,
  })
  .strict();

export type EnqueueNotificationJobRequestInput = z.infer<
  typeof enqueueNotificationJobRequestSchema
>;

// ============================================================
// 5. Provider Result Schema
// ============================================================

export const notificationProviderResultSchema = z
  .object({
    success: z.boolean(),
    providerName: notificationProviderNameSchema,
    providerMessageId: notificationProviderMessageIdSchema.nullable().optional(),
    statusCode: z.number().int('Status code must be an integer').min(100).max(599).optional(),
    error: safeNotificationErrorSchema.nullable().optional(),
  })
  .strict();

export type NotificationProviderResultInput = z.infer<typeof notificationProviderResultSchema>;

// ============================================================
// 6. Notification Delivery DTO Schema (Database & REST Read Model)
// ============================================================

export const notificationDeliveryDtoSchema = z
  .object({
    id: z.string().uuid('Invalid delivery ID format'),
    idempotencyKey: notificationIdempotencyKeySchema,
    recipientEmail: recipientEmailSchema,
    recipientPhone: z.string().max(32).nullable(),
    channel: notificationChannelSchema,
    notificationType: notificationTypeSchema,
    referenceId: notificationReferenceIdSchema,
    subject: notificationSubjectSchema,
    status: notificationStatusSchema,
    providerName: notificationProviderNameSchema,
    providerMessageId: z.string().max(128).nullable(),
    retryCount: z.number().int().nonnegative('Retry count must be non-negative'),
    errorDetails: safeNotificationErrorSchema.nullable(),
    sentAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type NotificationDeliveryDtoInput = z.infer<typeof notificationDeliveryDtoSchema>;

// ============================================================
// 7. Admin Notification Queries & Route Param Schemas
// ============================================================

/**
 * Admin Notification List Query Schema: Validates query parameters for GET /api/v1/admin/notifications.
 */
export const adminNotificationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must not exceed 100')
      .optional()
      .default(20),
    status: notificationStatusSchema.optional(),
    notificationType: notificationTypeSchema.optional(),
    channel: notificationChannelSchema.optional(),
    referenceId: z.string().trim().max(64).optional(),
    recipientEmail: z.string().trim().max(255).optional(),
  })
  .strict();

export type AdminNotificationListQueryInput = z.infer<typeof adminNotificationListQuerySchema>;

/**
 * Admin Notification ID Param Schema: Validates :id UUID route parameter for GET/POST admin notification routes.
 */
export const adminNotificationIdParamSchema = z
  .object({
    id: z
      .string({ required_error: 'Notification ID is required' })
      .uuid('Invalid notification ID format'),
  })
  .strict();

export type AdminNotificationIdParamInput = z.infer<typeof adminNotificationIdParamSchema>;

/**
 * Admin Notification Resend Request Schema: Validates request body for POST /api/v1/admin/notifications/:id/resend.
 * Strictly empty to prevent client-controlled overrides of recipient, subject, or message context.
 */
export const adminNotificationResendRequestSchema = z.object({}).strict();

export type AdminNotificationResendRequestInput = z.infer<
  typeof adminNotificationResendRequestSchema
>;
