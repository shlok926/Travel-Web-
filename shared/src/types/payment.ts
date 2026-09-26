import { SupportedCurrency } from '../utils/money.js';

// ============================================================
// 1. Controlled Enums & Taxonomies
// ============================================================

/**
 * PaymentStatus: Stored in PostgreSQL enum `payment_status`.
 * Lifecycle: ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED').
 */
export const PAYMENT_STATUSES = ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * PaymentProvider: Extensible provider identifier (ADR-007).
 */
export const PAYMENT_PROVIDERS = ['RAZORPAY', 'STRIPE', 'MOCK'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number] | (string & {});

/**
 * CancellationStatus: Stored in PostgreSQL enum `cancellation_status`.
 */
export const CANCELLATION_STATUSES = [
  'PENDING_APPROVAL',
  'AUTHORIZED',
  'REJECTED',
  'COMPLETED',
] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];

/**
 * RefundSettlementStatus: Stored in PostgreSQL enum `refund_settlement_status`.
 */
export const REFUND_SETTLEMENT_STATUSES = ['PROCESSING', 'SETTLED', 'FAILED'] as const;
export type RefundSettlementStatus = (typeof REFUND_SETTLEMENT_STATUSES)[number];

/**
 * DocumentType: Supported PDF fulfillment document types.
 */
export const DOCUMENT_TYPES = ['INVOICE', 'VOUCHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ============================================================
// 2. Client API Payloads (Strict DTO Boundaries)
// ============================================================

/**
 * InitiatePaymentRequest: Client payload to initialize payment session.
 * Strictly excludes client-controlled amounts, currency, customerId, or payment status.
 */
export interface InitiatePaymentRequest {
  bookingReference: string;
  provider?: PaymentProvider;
}

/**
 * InitiatePaymentResponse: Server-authoritative response returned to frontend checkout wizard.
 */
export interface InitiatePaymentResponse {
  paymentId: string;
  bookingReference: string;
  provider: string;
  gatewayOrderId: string | null;
  amount: number; // Minor units (e.g. paise / cents)
  currency: SupportedCurrency;
  status: PaymentStatus;
  clientPayload: Record<string, unknown>; // Safe provider-specific client initialization parameters (e.g. keyId, orderId)
  createdAt: string; // ISO timestamp
}

/**
 * PaymentStatusResponse: Safe read-only payment status polling response.
 */
export interface PaymentStatusResponse {
  paymentId: string;
  bookingReference: string;
  provider: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  amount: number; // Minor units
  currency: SupportedCurrency;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 3. Webhook & Normalized Gateway Results
// ============================================================

/**
 * NormalizedWebhookEvent: Canonical internal representation of an inbound gateway webhook.
 */
export interface NormalizedWebhookEvent {
  provider: string;
  eventId: string;
  eventType: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  amount: number; // Minor units
  currency: SupportedCurrency;
  status: PaymentStatus;
  payload: Record<string, unknown>; // Non-sensitive raw provider payload
  processedAt: string;
}

/**
 * NormalizedPaymentResult: Generic adapter output translating gateway responses into domain format.
 */
export interface NormalizedPaymentResult {
  provider: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  status: PaymentStatus;
  amount: number; // Minor units
  currency: SupportedCurrency;
  rawPayload: Record<string, unknown>;
}

// ============================================================
// 4. Tax Invoice & E-Ticket Voucher Contracts
// ============================================================

/**
 * TaxInvoiceDTO: Statutory GST Tax Invoice record.
 */
export interface TaxInvoiceDTO {
  id: string;
  invoiceNumber: string; // INV-YYYYMM-XXXX
  bookingId: string;
  bookingReference?: string;
  customerId: string;
  gstinNumber: string | null;
  taxableAmount: number; // Minor units
  gstAmount: number; // Minor units
  totalAmount: number; // Minor units
  currency: SupportedCurrency;
  pdfStorageKey: string | null;
  createdAt: string;
}

/**
 * TicketVoucherDTO: E-Ticket / Tour Travel Voucher record.
 */
export interface TicketVoucherDTO {
  id: string;
  voucherCode: string; // VCH-YYYYMMDD-XXXX
  bookingId: string;
  bookingReference?: string;
  pdfStorageKey: string | null;
  createdAt: string;
}

/**
 * DocumentDownloadResponse: Time-limited pre-signed download URL response.
 */
export interface DocumentDownloadResponse {
  documentType: DocumentType;
  bookingReference: string;
  downloadUrl: string;
  expiresAt: string; // ISO timestamp (15 minutes expiry)
}

// ============================================================
// 5. Cancellation & Refund Settlement Contracts
// ============================================================

/**
 * CancellationRequestDTO: Financial/operational cancellation audit record.
 */
export interface CancellationRequestDTO {
  id: string;
  bookingId: string;
  bookingReference?: string;
  requestedBy: string;
  cancellationReason: string;
  calculatedRefundAmount: number; // Minor units
  calculatedPenaltyAmount: number; // Minor units
  status: CancellationStatus;
  adminNotes: string | null;
  authorizedBy: string | null;
  authorizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * AuthorizeCancellationRequest: Admin RBAC action payload to authorize refund settlement.
 */
export interface AuthorizeCancellationRequest {
  adminNotes?: string;
  overrideRefundAmount?: number; // Minor units (optional admin override)
}

/**
 * RefundSettlementDTO: Financial refund settlement audit record.
 */
export interface RefundSettlementDTO {
  id: string;
  cancellationRequestId: string | null;
  paymentTransactionId: string;
  gatewayRefundId: string | null;
  refundAmount: number; // Minor units
  currency: SupportedCurrency;
  settlementStatus: RefundSettlementStatus;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}
