import { SupportedCurrency } from '../utils/money.js';

// ============================================================
// Phase 8 Step 2 — Shared Notification Contracts & DTOs
// ============================================================

// ============================================================
// 1. Controlled Enums & Taxonomies (Migration 007 Alignment)
// ============================================================

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'BOOKING_CONFIRMED',
  'DOCUMENT_READY',
  'REFUND_SETTLED',
  'BOOKING_CANCELLED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'RETRYING'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_ERROR_CATEGORIES = [
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
  'RATE_LIMITED',
  'INVALID_RECIPIENT',
  'TIMEOUT',
  'INTERNAL_ERROR',
] as const;
export type NotificationErrorCategory = (typeof NOTIFICATION_ERROR_CATEGORIES)[number];

// ============================================================
// 2. Safe Error & Diagnostic Representation
// ============================================================

export interface SafeNotificationError {
  errorCode: string;
  errorCategory: NotificationErrorCategory | string;
  safeErrorMessage: string;
  providerStatusCode?: number;
}

// ============================================================
// 3. Domain Event Notification Payloads
// ============================================================

export interface BookingConfirmedNotificationPayload {
  type: 'BOOKING_CONFIRMED';
  bookingReference: string;
  customerName: string;
  recipientEmail: string;
  recipientPhone?: string;
  channel?: NotificationChannel;
  portalUrl: string; // Stable authenticated portal route (never a raw presigned URL)
  packageTitle?: string;
  departureDate?: string;
  totalAmount?: number; // Integer minor units (e.g. paise / cents)
  currency?: SupportedCurrency;
}

export interface DocumentReadyNotificationPayload {
  type: 'DOCUMENT_READY';
  bookingReference: string;
  recipientEmail: string;
  recipientPhone?: string;
  channel?: NotificationChannel;
  documentType: 'INVOICE' | 'VOUCHER' | 'ALL';
  portalDocumentUrl: string; // Stable authenticated route (never a raw presigned URL)
}

export interface RefundSettledNotificationPayload {
  type: 'REFUND_SETTLED';
  cancellationRequestId?: string;
  bookingReference: string;
  recipientEmail: string;
  recipientPhone?: string;
  channel?: NotificationChannel;
  refundAmount: number; // Integer minor units (e.g. paise / cents)
  currency: SupportedCurrency;
  cancellationReason?: string;
}

export interface BookingCancelledNotificationPayload {
  type: 'BOOKING_CANCELLED';
  bookingReference: string;
  recipientEmail: string;
  recipientPhone?: string;
  channel?: NotificationChannel;
  cancellationReason: string;
}

export type NotificationEventPayload =
  | BookingConfirmedNotificationPayload
  | DocumentReadyNotificationPayload
  | RefundSettledNotificationPayload
  | BookingCancelledNotificationPayload;

// ============================================================
// 4. Notification Job Enqueue Contract
// ============================================================

export interface EnqueueNotificationJobRequest {
  idempotencyKey: string;
  recipientEmail: string;
  recipientPhone?: string;
  channel?: NotificationChannel;
  notificationType: NotificationType;
  referenceId: string;
  subject: string;
  payload: NotificationEventPayload;
}

// ============================================================
// 5. Provider Result Contract
// ============================================================

export interface NotificationProviderResult {
  success: boolean;
  providerName: string;
  providerMessageId?: string | null;
  statusCode?: number;
  error?: SafeNotificationError | null;
}

// ============================================================
// 6. Notification Delivery DTO (Database & Admin Entity)
// ============================================================

export interface NotificationDeliveryDto {
  id: string;
  idempotencyKey: string;
  recipientEmail: string;
  recipientPhone: string | null;
  channel: NotificationChannel;
  notificationType: NotificationType;
  referenceId: string;
  subject: string;
  status: NotificationStatus;
  providerName: string;
  providerMessageId: string | null;
  retryCount: number;
  errorDetails: SafeNotificationError | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 7. Admin Notification Management Contracts
// ============================================================

export interface AdminNotificationListQueryDto {
  page?: number;
  limit?: number;
  status?: NotificationStatus;
  notificationType?: NotificationType;
  channel?: NotificationChannel;
  referenceId?: string;
  recipientEmail?: string;
}

export type AdminNotificationDetailDto = NotificationDeliveryDto;

export interface AdminNotificationResendParamDto {
  id: string;
}
