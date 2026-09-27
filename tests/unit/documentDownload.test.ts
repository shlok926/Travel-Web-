import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentService } from '../../backend/src/modules/document/services/document.service.js';
import { AppError, ErrorCodes, TokenPayload } from '../../shared/src/index.js';

describe('Document Download & Authorization (Phase 6 Step 9 — Unit)', () => {
  let mockBookingRepo: any;
  let mockPassengerRepo: any;
  let mockPaymentRepo: any;
  let mockTaxInvoiceRepo: any;
  let mockTicketVoucherRepo: any;
  let mockStorageService: any;
  let mockPdfGenerator: any;
  let documentService: DocumentService;

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const otherCustomerId = '22222222-2222-2222-2222-222222222222';
  const sampleAdminId = '99999999-9999-9999-9999-999999999999';

  const customerUser: TokenPayload = {
    userId: sampleCustomerId,
    email: 'customer@example.com',
    role: 'CUSTOMER',
  };

  const otherCustomerUser: TokenPayload = {
    userId: otherCustomerId,
    email: 'other@example.com',
    role: 'CUSTOMER',
  };

  const adminUser: TokenPayload = {
    userId: sampleAdminId,
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const sampleBooking = {
    id: 'booking-uuid-101',
    bookingReference: 'BK-20261115-ABCD',
    customerId: sampleCustomerId,
    status: 'CONFIRMED',
    totalPrice: 150000,
    currency: 'INR',
  };

  const sampleInvoice = {
    id: 'inv-uuid-201',
    invoiceNumber: 'INV-202611-ABCD',
    bookingId: sampleBooking.id,
    customerId: sampleCustomerId,
    taxableAmount: 142857,
    gstAmount: 7143,
    totalAmount: 150000,
    currency: 'INR',
    pdfStorageKey: 'documents/invoices/booking-uuid-101/INV-202611-ABCD.pdf',
    createdAt: new Date(),
  };

  const sampleVoucher = {
    id: 'vch-uuid-301',
    voucherCode: 'VCH-20261115-ABCD',
    bookingId: sampleBooking.id,
    pdfStorageKey: 'documents/vouchers/booking-uuid-101/VCH-20261115-ABCD.pdf',
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockBookingRepo = {
      findById: vi.fn(),
      findByReference: vi.fn(),
      findByReferenceAndCustomer: vi.fn(),
    };
    mockPassengerRepo = {
      findByBookingId: vi.fn(),
    };
    mockPaymentRepo = {
      findByBookingId: vi.fn(),
    };
    mockTaxInvoiceRepo = {
      findByBookingId: vi.fn(),
    };
    mockTicketVoucherRepo = {
      findByBookingId: vi.fn(),
    };
    mockStorageService = {
      upload: vi.fn(),
      download: vi.fn(),
      getDownloadUrl: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
    };
    mockPdfGenerator = {
      generatePdf: vi.fn(),
    };

    documentService = new DocumentService(
      mockBookingRepo,
      mockPassengerRepo,
      mockPaymentRepo,
      mockTaxInvoiceRepo,
      mockTicketVoucherRepo,
      mockStorageService,
      mockPdfGenerator,
      'travel-documents-private',
    );
  });

  describe('1. GST Invoice Download Authorization & Presigned URL', () => {
    it('should generate short-lived presigned download URL for authenticated booking owner', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTaxInvoiceRepo.findByBookingId.mockResolvedValue([sampleInvoice]);
      mockStorageService.getDownloadUrl.mockResolvedValue(
        'https://travel-documents-private.s3.amazonaws.com/documents/invoices/booking-uuid-101/INV-202611-ABCD.pdf?signed=true',
      );

      const result = await documentService.getInvoiceDownloadUrl(
        'BK-20261115-ABCD',
        customerUser,
        900,
      );

      expect(mockBookingRepo.findByReferenceAndCustomer).toHaveBeenCalledWith(
        'BK-20261115-ABCD',
        sampleCustomerId,
      );
      expect(mockTaxInvoiceRepo.findByBookingId).toHaveBeenCalledWith(sampleBooking.id);
      expect(mockStorageService.getDownloadUrl).toHaveBeenCalledWith(
        'travel-documents-private',
        sampleInvoice.pdfStorageKey,
        900,
      );

      expect(result.documentType).toBe('INVOICE');
      expect(result.bookingReference).toBe('BK-20261115-ABCD');
      expect(result.downloadUrl).toContain('signed=true');
      expect(typeof result.expiresAt).toBe('string');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should allow ADMIN to generate download URL for any customer booking', async () => {
      mockBookingRepo.findByReference.mockResolvedValue(sampleBooking);
      mockTaxInvoiceRepo.findByBookingId.mockResolvedValue([sampleInvoice]);
      mockStorageService.getDownloadUrl.mockResolvedValue('https://s3.example.com/invoice.pdf');

      const result = await documentService.getInvoiceDownloadUrl(
        'BK-20261115-ABCD',
        adminUser,
        900,
      );

      expect(mockBookingRepo.findByReference).toHaveBeenCalledWith('BK-20261115-ABCD');
      expect(mockBookingRepo.findByReferenceAndCustomer).not.toHaveBeenCalled();
      expect(result.downloadUrl).toBe('https://s3.example.com/invoice.pdf');
    });

    it('should enforce IDOR protection by returning 404 BOOKING_NOT_FOUND when non-owner requests invoice', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(null);

      await expect(
        documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', otherCustomerUser),
      ).rejects.toThrowError(AppError);

      try {
        await documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', otherCustomerUser);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe(ErrorCodes.BOOKING_NOT_FOUND);
      }

      expect(mockTaxInvoiceRepo.findByBookingId).not.toHaveBeenCalled();
      expect(mockStorageService.getDownloadUrl).not.toHaveBeenCalled();
    });

    it('should throw 404 DOCUMENT_NOT_FOUND when invoice record has not yet been generated', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTaxInvoiceRepo.findByBookingId.mockResolvedValue([]);

      await expect(
        documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', customerUser),
      ).rejects.toThrowError(AppError);

      try {
        await documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', customerUser);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe(ErrorCodes.DOCUMENT_NOT_FOUND);
      }

      expect(mockStorageService.getDownloadUrl).not.toHaveBeenCalled();
    });

    it('should throw 404 DOCUMENT_NOT_FOUND when invoice exists but pdfStorageKey is null', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTaxInvoiceRepo.findByBookingId.mockResolvedValue([
        { ...sampleInvoice, pdfStorageKey: null },
      ]);

      await expect(
        documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', customerUser),
      ).rejects.toThrowError(AppError);

      try {
        await documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', customerUser);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe(ErrorCodes.DOCUMENT_NOT_FOUND);
      }

      expect(mockStorageService.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('2. E-Ticket Voucher Download Authorization & Presigned URL', () => {
    it('should generate short-lived presigned download URL for authenticated booking owner', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTicketVoucherRepo.findByBookingId.mockResolvedValue([sampleVoucher]);
      mockStorageService.getDownloadUrl.mockResolvedValue(
        'https://travel-documents-private.s3.amazonaws.com/documents/vouchers/booking-uuid-101/VCH-20261115-ABCD.pdf?signed=true',
      );

      const result = await documentService.getVoucherDownloadUrl(
        'BK-20261115-ABCD',
        customerUser,
        900,
      );

      expect(mockBookingRepo.findByReferenceAndCustomer).toHaveBeenCalledWith(
        'BK-20261115-ABCD',
        sampleCustomerId,
      );
      expect(mockTicketVoucherRepo.findByBookingId).toHaveBeenCalledWith(sampleBooking.id);
      expect(mockStorageService.getDownloadUrl).toHaveBeenCalledWith(
        'travel-documents-private',
        sampleVoucher.pdfStorageKey,
        900,
      );

      expect(result.documentType).toBe('VOUCHER');
      expect(result.bookingReference).toBe('BK-20261115-ABCD');
      expect(result.downloadUrl).toContain('signed=true');
      expect(typeof result.expiresAt).toBe('string');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should allow ADMIN to generate voucher download URL for any booking', async () => {
      mockBookingRepo.findByReference.mockResolvedValue(sampleBooking);
      mockTicketVoucherRepo.findByBookingId.mockResolvedValue([sampleVoucher]);
      mockStorageService.getDownloadUrl.mockResolvedValue('https://s3.example.com/voucher.pdf');

      const result = await documentService.getVoucherDownloadUrl(
        'BK-20261115-ABCD',
        adminUser,
        1800,
      );

      expect(mockBookingRepo.findByReference).toHaveBeenCalledWith('BK-20261115-ABCD');
      expect(mockStorageService.getDownloadUrl).toHaveBeenCalledWith(
        'travel-documents-private',
        sampleVoucher.pdfStorageKey,
        1800,
      );
      expect(result.downloadUrl).toBe('https://s3.example.com/voucher.pdf');
    });

    it('should enforce IDOR protection by returning 404 BOOKING_NOT_FOUND when non-owner requests voucher', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(null);

      await expect(
        documentService.getVoucherDownloadUrl('BK-20261115-ABCD', otherCustomerUser),
      ).rejects.toThrowError(AppError);

      try {
        await documentService.getVoucherDownloadUrl('BK-20261115-ABCD', otherCustomerUser);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe(ErrorCodes.BOOKING_NOT_FOUND);
      }

      expect(mockTicketVoucherRepo.findByBookingId).not.toHaveBeenCalled();
      expect(mockStorageService.getDownloadUrl).not.toHaveBeenCalled();
    });

    it('should throw 404 DOCUMENT_NOT_FOUND when voucher record has not yet been generated', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTicketVoucherRepo.findByBookingId.mockResolvedValue([]);

      await expect(
        documentService.getVoucherDownloadUrl('BK-20261115-ABCD', customerUser),
      ).rejects.toThrowError(AppError);

      try {
        await documentService.getVoucherDownloadUrl('BK-20261115-ABCD', customerUser);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe(ErrorCodes.DOCUMENT_NOT_FOUND);
      }

      expect(mockStorageService.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('3. Storage Error Normalization & Security', () => {
    it('should normalize storage provider errors without exposing raw storage credentials', async () => {
      mockBookingRepo.findByReferenceAndCustomer.mockResolvedValue(sampleBooking);
      mockTaxInvoiceRepo.findByBookingId.mockResolvedValue([sampleInvoice]);
      mockStorageService.getDownloadUrl.mockRejectedValue(
        new Error('S3 Error: InvalidCredentialsAWSSecretKey=SECRET123'),
      );

      await expect(
        documentService.getInvoiceDownloadUrl('BK-20261115-ABCD', customerUser),
      ).rejects.toThrowError('S3 Error');
    });
  });
});
