import { z } from 'zod';
import {
  PAYMENT_STATUSES,
  CANCELLATION_STATUSES,
  REFUND_SETTLEMENT_STATUSES,
  DOCUMENT_TYPES,
} from '../types/payment.js';

// ============================================================
// 1. Primitive & Enum Schemas
// ============================================================

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const cancellationStatusSchema = z.enum(CANCELLATION_STATUSES);
export const refundSettlementStatusSchema = z.enum(REFUND_SETTLEMENT_STATUSES);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const paymentCurrencySchema = z.enum(['INR', 'USD']);

export const paymentProviderSchema = z
  .string({ required_error: 'Payment provider is required' })
  .trim()
  .min(2, 'Provider must be at least 2 characters')
  .max(32, 'Provider must not exceed 32 characters');

// Formatted Identifiers
const INVOICE_NUMBER_REGEX = /^INV-\d{6}-[A-Z0-9]+$/i;
const VOUCHER_CODE_REGEX = /^VCH-\d{8}-[A-Z0-9]+$/i;

// ============================================================
// 2. Client Payment API Schemas (Strict Boundaries)
// ============================================================

/**
 * initiatePaymentRequestSchema: Validates client payload for POST /api/v1/payments/initiate.
 * Strict object rejection of client-controlled amounts, currency, customerId, or payment status.
 */
export const initiatePaymentRequestSchema = z
  .object({
    bookingReference: z
      .string({ required_error: 'Booking reference is required' })
      .trim()
      .min(3, 'Booking reference must be at least 3 characters')
      .max(64, 'Booking reference must not exceed 64 characters'),
    provider: paymentProviderSchema.optional(),
  })
  .strict();

/**
 * initiatePaymentResponseSchema: Server-authoritative response returned to frontend checkout wizard.
 */
export const initiatePaymentResponseSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID format'),
  bookingReference: z.string(),
  provider: z.string(),
  gatewayOrderId: z.string().nullable(),
  amount: z.number().int().nonnegative('Amount must be a non-negative integer in minor units'),
  currency: paymentCurrencySchema,
  status: paymentStatusSchema,
  clientPayload: z.record(z.unknown()),
  createdAt: z.string(),
});

/**
 * paymentStatusResponseSchema: Read-only status query response for GET /api/v1/payments/:bookingReference/status.
 */
export const paymentStatusResponseSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID format'),
  bookingReference: z.string(),
  provider: z.string(),
  gatewayOrderId: z.string().nullable(),
  gatewayPaymentId: z.string().nullable(),
  amount: z.number().int().nonnegative('Amount must be a non-negative integer in minor units'),
  currency: paymentCurrencySchema,
  status: paymentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================
// 3. Webhook & Gateway Adapter Schemas
// ============================================================

/**
 * normalizedWebhookEventSchema: Validates internal normalized webhook representation.
 */
export const normalizedWebhookEventSchema = z.object({
  provider: z.string().trim().min(1, 'Provider is required'),
  eventId: z.string().trim().min(1, 'Event ID is required'),
  eventType: z.string().trim().min(1, 'Event type is required'),
  gatewayOrderId: z.string().nullable(),
  gatewayPaymentId: z.string().nullable(),
  amount: z.number().int().nonnegative('Amount must be a non-negative integer in minor units'),
  currency: paymentCurrencySchema,
  status: paymentStatusSchema,
  payload: z.record(z.unknown()),
  processedAt: z.string(),
});

// ============================================================
// 4. Tax Invoice & E-Ticket Voucher Schemas
// ============================================================

/**
 * taxInvoiceSchema: Validates Tax Invoice DTO and statutory monetary fields.
 */
export const taxInvoiceSchema = z.object({
  id: z.string().uuid('Invalid invoice ID format'),
  invoiceNumber: z
    .string()
    .regex(INVOICE_NUMBER_REGEX, 'Invoice number must match format INV-YYYYMM-XXXX'),
  bookingId: z.string().uuid('Invalid booking ID format'),
  bookingReference: z.string().optional(),
  customerId: z.string().uuid('Invalid customer ID format'),
  gstinNumber: z.string().nullable(),
  taxableAmount: z.number().int().nonnegative('Taxable amount must be in integer minor units'),
  gstAmount: z.number().int().nonnegative('GST amount must be in integer minor units'),
  totalAmount: z.number().int().nonnegative('Total amount must be in integer minor units'),
  currency: paymentCurrencySchema,
  pdfStorageKey: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * ticketVoucherSchema: Validates E-Ticket / Travel Voucher DTO.
 */
export const ticketVoucherSchema = z.object({
  id: z.string().uuid('Invalid voucher ID format'),
  voucherCode: z
    .string()
    .regex(VOUCHER_CODE_REGEX, 'Voucher code must match format VCH-YYYYMMDD-XXXX'),
  bookingId: z.string().uuid('Invalid booking ID format'),
  bookingReference: z.string().optional(),
  pdfStorageKey: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * documentDownloadResponseSchema: Validates pre-signed URL download responses.
 */
export const documentDownloadResponseSchema = z.object({
  documentType: documentTypeSchema,
  bookingReference: z.string(),
  downloadUrl: z.string().url('Download URL must be a valid URL'),
  expiresAt: z.string(),
});

// ============================================================
// 5. Cancellation & Refund Schemas
// ============================================================

/**
 * cancellationRequestSchema: Validates operational cancellation audit record.
 */
export const cancellationRequestSchema = z.object({
  id: z.string().uuid('Invalid cancellation request ID format'),
  bookingId: z.string().uuid('Invalid booking ID format'),
  bookingReference: z.string().optional(),
  requestedBy: z.string().uuid('Invalid user ID format'),
  cancellationReason: z.string().min(3, 'Reason must be at least 3 characters'),
  calculatedRefundAmount: z.number().int().nonnegative(),
  calculatedPenaltyAmount: z.number().int().nonnegative(),
  status: cancellationStatusSchema,
  adminNotes: z.string().nullable(),
  authorizedBy: z.string().uuid().nullable(),
  authorizedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * authorizeCancellationRequestSchema: Validates admin action payload for cancellation authorization.
 */
export const authorizeCancellationRequestSchema = z
  .object({
    adminNotes: z.string().trim().max(1000).optional(),
    overrideRefundAmount: z.number().int().nonnegative().optional(),
  })
  .strict();

/**
 * refundSettlementSchema: Validates financial refund settlement audit DTO.
 */
export const refundSettlementSchema = z.object({
  id: z.string().uuid('Invalid settlement ID format'),
  cancellationRequestId: z.string().uuid().nullable(),
  paymentTransactionId: z.string().uuid('Invalid payment transaction ID format'),
  gatewayRefundId: z.string().nullable(),
  refundAmount: z.number().int().nonnegative('Refund amount must be in integer minor units'),
  currency: paymentCurrencySchema,
  settlementStatus: refundSettlementStatusSchema,
  errorMessage: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
});
