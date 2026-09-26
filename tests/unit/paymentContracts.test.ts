import { describe, it, expect } from 'vitest';
import {
  PAYMENT_STATUSES,
  CANCELLATION_STATUSES,
  REFUND_SETTLEMENT_STATUSES,
  DOCUMENT_TYPES,
  PAYMENT_PROVIDERS,
  ErrorCodes,
} from '../../shared/src/index.js';
import {
  paymentStatusSchema,
  paymentProviderSchema,
  cancellationStatusSchema,
  refundSettlementStatusSchema,
  documentTypeSchema,
  initiatePaymentRequestSchema,
  initiatePaymentResponseSchema,
  paymentStatusResponseSchema,
  normalizedWebhookEventSchema,
  taxInvoiceSchema,
  ticketVoucherSchema,
  documentDownloadResponseSchema,
  cancellationRequestSchema,
  authorizeCancellationRequestSchema,
  refundSettlementSchema,
} from '../../shared/src/schemas/payment.schema.js';

describe('Phase 6 Step 2 — Shared Payment, Webhook, Invoice & Refund Contracts', () => {
  // ============================================================
  // 1. Primitive Enums & Types
  // ============================================================
  describe('1. Controlled Enums & Taxonomies', () => {
    it('should validate payment statuses correctly', () => {
      PAYMENT_STATUSES.forEach((status) => {
        expect(paymentStatusSchema.parse(status)).toBe(status);
      });

      expect(() => paymentStatusSchema.parse('CANCELLED')).toThrow();
      expect(() => paymentStatusSchema.parse('EXPIRED')).toThrow();
      expect(() => paymentStatusSchema.parse('PROCESSING')).toThrow();
      expect(() => paymentStatusSchema.parse('INVALID')).toThrow();
    });

    it('should validate cancellation statuses correctly', () => {
      CANCELLATION_STATUSES.forEach((status) => {
        expect(cancellationStatusSchema.parse(status)).toBe(status);
      });

      expect(() => cancellationStatusSchema.parse('PENDING')).toThrow();
      expect(() => cancellationStatusSchema.parse('REFUNDED')).toThrow();
    });

    it('should validate refund settlement statuses correctly', () => {
      REFUND_SETTLEMENT_STATUSES.forEach((status) => {
        expect(refundSettlementStatusSchema.parse(status)).toBe(status);
      });

      expect(() => refundSettlementStatusSchema.parse('SUCCESS')).toThrow();
      expect(() => refundSettlementStatusSchema.parse('COMPLETED')).toThrow();
    });

    it('should validate document types correctly', () => {
      DOCUMENT_TYPES.forEach((type) => {
        expect(documentTypeSchema.parse(type)).toBe(type);
      });

      expect(() => documentTypeSchema.parse('RECEIPT')).toThrow();
    });

    it('should validate payment providers extensibly', () => {
      PAYMENT_PROVIDERS.forEach((provider) => {
        expect(paymentProviderSchema.parse(provider)).toBe(provider);
      });

      expect(paymentProviderSchema.parse('CUSTOM_GATEWAY')).toBe('CUSTOM_GATEWAY');
      expect(() => paymentProviderSchema.parse('a')).toThrow(); // min 2 chars
      expect(() => paymentProviderSchema.parse('   ')).toThrow();
    });
  });

  // ============================================================
  // 2. Client Payment Initiation API Schemas
  // ============================================================
  describe('2. Payment Initiation Contracts (Strict DTO Boundaries)', () => {
    it('should parse valid initiatePaymentRequest payload', () => {
      const valid = {
        bookingReference: 'BK-20281001-ABCD',
        provider: 'RAZORPAY',
      };
      const parsed = initiatePaymentRequestSchema.parse(valid);
      expect(parsed.bookingReference).toBe('BK-20281001-ABCD');
      expect(parsed.provider).toBe('RAZORPAY');
    });

    it('should accept initiatePaymentRequest without provider (server default)', () => {
      const valid = { bookingReference: 'BK-20281001-ABCD' };
      const parsed = initiatePaymentRequestSchema.parse(valid);
      expect(parsed.bookingReference).toBe('BK-20281001-ABCD');
      expect(parsed.provider).toBeUndefined();
    });

    it('should strictly reject client-supplied amount, currency, or customerId (anti-tampering)', () => {
      const tampered = {
        bookingReference: 'BK-20281001-ABCD',
        amount: 100, // Client attempting to dictate price
        currency: 'INR',
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'SUCCESS',
      };

      expect(() => initiatePaymentRequestSchema.parse(tampered)).toThrow();
    });

    it('should validate initiatePaymentResponse format', () => {
      const validResponse = {
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        bookingReference: 'BK-20281001-ABCD',
        provider: 'RAZORPAY',
        gatewayOrderId: 'order_NYG12345',
        amount: 4500000, // 45,000 INR in paise
        currency: 'INR',
        status: 'INITIATED',
        clientPayload: {
          keyId: 'rzp_test_123',
          orderId: 'order_NYG12345',
        },
        createdAt: new Date().toISOString(),
      };

      const parsed = initiatePaymentResponseSchema.parse(validResponse);
      expect(parsed.amount).toBe(4500000);
      expect(parsed.status).toBe('INITIATED');
    });

    it('should reject initiatePaymentResponse with negative amount or float', () => {
      const invalidNegative = {
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        bookingReference: 'BK-20281001-ABCD',
        provider: 'RAZORPAY',
        gatewayOrderId: null,
        amount: -100,
        currency: 'INR',
        status: 'INITIATED',
        clientPayload: {},
        createdAt: new Date().toISOString(),
      };
      expect(() => initiatePaymentResponseSchema.parse(invalidNegative)).toThrow();

      const invalidFloat = { ...invalidNegative, amount: 450.5 };
      expect(() => initiatePaymentResponseSchema.parse(invalidFloat)).toThrow();
    });
  });

  // ============================================================
  // 3. Payment Status Query Contracts
  // ============================================================
  describe('3. Payment Status Query Contracts', () => {
    it('should validate read-only customer status query payload', () => {
      const valid = {
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        bookingReference: 'BK-20281001-ABCD',
        provider: 'RAZORPAY',
        gatewayOrderId: 'order_123',
        gatewayPaymentId: 'pay_456',
        amount: 5000000,
        currency: 'INR',
        status: 'SUCCESS',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = paymentStatusResponseSchema.parse(valid);
      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.gatewayPaymentId).toBe('pay_456');
    });

    it('should reject payment status with invalid UUID or currency', () => {
      const invalid = {
        paymentId: 'not-a-uuid',
        bookingReference: 'BK-123',
        provider: 'RAZORPAY',
        gatewayOrderId: null,
        gatewayPaymentId: null,
        amount: 1000,
        currency: 'EUR', // Unsupported currency
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => paymentStatusResponseSchema.parse(invalid)).toThrow();
    });
  });

  // ============================================================
  // 4. Webhook Event Contracts
  // ============================================================
  describe('4. Webhook Event Contracts', () => {
    it('should validate normalized webhook event payload', () => {
      const validEvent = {
        provider: 'RAZORPAY',
        eventId: 'evt_1234567890',
        eventType: 'payment.captured',
        gatewayOrderId: 'order_123',
        gatewayPaymentId: 'pay_123',
        amount: 2500000,
        currency: 'INR',
        status: 'SUCCESS',
        payload: {
          id: 'pay_123',
          entity: 'payment',
          amount: 2500000,
        },
        processedAt: new Date().toISOString(),
      };

      const parsed = normalizedWebhookEventSchema.parse(validEvent);
      expect(parsed.provider).toBe('RAZORPAY');
      expect(parsed.eventId).toBe('evt_1234567890');
      expect(parsed.status).toBe('SUCCESS');
    });

    it('should reject webhook event with missing provider or eventId', () => {
      const invalid = {
        provider: '',
        eventId: '',
        eventType: 'payment.captured',
        gatewayOrderId: null,
        gatewayPaymentId: null,
        amount: 1000,
        currency: 'INR',
        status: 'SUCCESS',
        payload: {},
        processedAt: new Date().toISOString(),
      };

      expect(() => normalizedWebhookEventSchema.parse(invalid)).toThrow();
    });
  });

  // ============================================================
  // 5. Tax Invoice & E-Ticket Voucher Contracts
  // ============================================================
  describe('5. Tax Invoice & E-Ticket Voucher Contracts', () => {
    it('should validate TaxInvoiceDTO with proper invoice number format and minor units', () => {
      const validInvoice = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        invoiceNumber: 'INV-202611-A8F2',
        bookingId: '123e4567-e89b-12d3-a456-426614174001',
        customerId: '123e4567-e89b-12d3-a456-426614174002',
        gstinNumber: '27AAAAA0000A1Z5',
        taxableAmount: 4000000, // 40,000 INR
        gstAmount: 720000, // 7,200 INR (18% GST)
        totalAmount: 4720000, // 47,200 INR
        currency: 'INR',
        pdfStorageKey: 'invoices/BK-20281001-ABCD_hash.pdf',
        createdAt: new Date().toISOString(),
      };

      const parsed = taxInvoiceSchema.parse(validInvoice);
      expect(parsed.invoiceNumber).toBe('INV-202611-A8F2');
      expect(parsed.totalAmount).toBe(4720000);
    });

    it('should reject TaxInvoiceDTO with invalid invoice number format', () => {
      const invalid = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        invoiceNumber: 'INVALID_INVOICE_123',
        bookingId: '123e4567-e89b-12d3-a456-426614174001',
        customerId: '123e4567-e89b-12d3-a456-426614174002',
        gstinNumber: null,
        taxableAmount: 100000,
        gstAmount: 18000,
        totalAmount: 118000,
        currency: 'INR',
        pdfStorageKey: null,
        createdAt: new Date().toISOString(),
      };

      expect(() => taxInvoiceSchema.parse(invalid)).toThrow();
    });

    it('should validate TicketVoucherDTO with proper voucher code format', () => {
      const validVoucher = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        voucherCode: 'VCH-20261115-B9E1',
        bookingId: '123e4567-e89b-12d3-a456-426614174001',
        pdfStorageKey: 'vouchers/BK-20281001-ABCD_hash.pdf',
        createdAt: new Date().toISOString(),
      };

      const parsed = ticketVoucherSchema.parse(validVoucher);
      expect(parsed.voucherCode).toBe('VCH-20261115-B9E1');
    });

    it('should validate DocumentDownloadResponse with valid download URL', () => {
      const valid = {
        documentType: 'INVOICE',
        bookingReference: 'BK-20281001-ABCD',
        downloadUrl: 'https://storage.youngtoursandtravels.com/invoices/BK-123.pdf?signed=123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const parsed = documentDownloadResponseSchema.parse(valid);
      expect(parsed.documentType).toBe('INVOICE');
      expect(parsed.downloadUrl).toContain('https://');
    });
  });

  // ============================================================
  // 6. Cancellation & Refund Contracts
  // ============================================================
  describe('6. Cancellation & Refund Contracts', () => {
    it('should validate CancellationRequestDTO and minor unit amounts', () => {
      const valid = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        bookingId: '123e4567-e89b-12d3-a456-426614174001',
        requestedBy: '123e4567-e89b-12d3-a456-426614174002',
        cancellationReason: 'Medical emergency in family',
        calculatedRefundAmount: 3500000,
        calculatedPenaltyAmount: 500000,
        status: 'PENDING_APPROVAL',
        adminNotes: null,
        authorizedBy: null,
        authorizedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = cancellationRequestSchema.parse(valid);
      expect(parsed.status).toBe('PENDING_APPROVAL');
      expect(parsed.calculatedRefundAmount).toBe(3500000);
    });

    it('should validate AuthorizeCancellationRequest with optional admin notes and override', () => {
      const valid = {
        adminNotes: 'Approved per policy under medical waiver',
        overrideRefundAmount: 4000000,
      };

      const parsed = authorizeCancellationRequestSchema.parse(valid);
      expect(parsed.overrideRefundAmount).toBe(4000000);

      // Rejects unknown extra fields (.strict())
      expect(() =>
        authorizeCancellationRequestSchema.parse({ ...valid, extraField: 'hack' }),
      ).toThrow();
    });

    it('should validate RefundSettlementDTO with minor unit refundAmount', () => {
      const valid = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        cancellationRequestId: '123e4567-e89b-12d3-a456-426614174001',
        paymentTransactionId: '123e4567-e89b-12d3-a456-426614174002',
        gatewayRefundId: 'rfnd_12345678',
        refundAmount: 3500000,
        currency: 'INR',
        settlementStatus: 'SETTLED',
        errorMessage: null,
        processedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const parsed = refundSettlementSchema.parse(valid);
      expect(parsed.settlementStatus).toBe('SETTLED');
      expect(parsed.refundAmount).toBe(3500000);
    });
  });

  // ============================================================
  // 7. Canonical Error Codes Registry
  // ============================================================
  describe('7. Canonical Error Codes Registry', () => {
    it('should contain all required Phase 6 payment and document error codes', () => {
      expect(ErrorCodes.PAYMENT_NOT_FOUND).toBe('PAYMENT_NOT_FOUND');
      expect(ErrorCodes.PAYMENT_INVALID_STATE).toBe('PAYMENT_INVALID_STATE');
      expect(ErrorCodes.PAYMENT_ALREADY_PROCESSED).toBe('PAYMENT_ALREADY_PROCESSED');
      expect(ErrorCodes.PAYMENT_AMOUNT_MISMATCH).toBe('PAYMENT_AMOUNT_MISMATCH');
      expect(ErrorCodes.PAYMENT_CURRENCY_MISMATCH).toBe('PAYMENT_CURRENCY_MISMATCH');
      expect(ErrorCodes.PAYMENT_PROVIDER_ERROR).toBe('PAYMENT_PROVIDER_ERROR');
      expect(ErrorCodes.PAYMENT_VERIFICATION_FAILED).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(ErrorCodes.PAYMENT_GATEWAY_REJECTED).toBe('PAYMENT_GATEWAY_REJECTED');
      expect(ErrorCodes.PAYMENT_WEBHOOK_SIGNATURE_INVALID).toBe(
        'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
      );
      expect(ErrorCodes.WEBHOOK_EVENT_DUPLICATE).toBe('WEBHOOK_EVENT_DUPLICATE');
      expect(ErrorCodes.REFUND_FAILED).toBe('REFUND_FAILED');
      expect(ErrorCodes.REFUND_INVALID_STATE).toBe('REFUND_INVALID_STATE');
      expect(ErrorCodes.DOCUMENT_NOT_FOUND).toBe('DOCUMENT_NOT_FOUND');
      expect(ErrorCodes.DOCUMENT_ACCESS_DENIED).toBe('DOCUMENT_ACCESS_DENIED');
      expect(ErrorCodes.CANCELLATION_REQUEST_NOT_FOUND).toBe('CANCELLATION_REQUEST_NOT_FOUND');
    });
  });
});
