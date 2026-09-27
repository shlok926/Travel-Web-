import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeHtml,
  formatMinorUnits,
} from '../../backend/src/modules/document/templates/escapeHtml.js';
import { renderInvoiceHtml } from '../../backend/src/modules/document/templates/invoice.template.js';
import { renderVoucherHtml } from '../../backend/src/modules/document/templates/voucher.template.js';
import { DocumentService } from '../../backend/src/modules/document/services/document.service.js';
import { calculateGstBreakdown } from '../../backend/src/modules/document/services/gstCalculator.js';

describe('Document Generation Domain & Services (Phase 6 Step 8)', () => {
  describe('1. HTML Escaping & Security Sanitization', () => {
    it('should safely escape HTML entities to prevent script injection', () => {
      const malicious = '<script>alert("xss")</script>';
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });

    it('should escape double quotes and ampersands in user data', () => {
      const input = 'Tom & "Jerry" <Special>';
      expect(escapeHtml(input)).toBe('Tom &amp; &quot;Jerry&quot; &lt;Special&gt;');
    });

    it('should format minor units correctly into decimal presentation string', () => {
      expect(formatMinorUnits(150000)).toBe('1,500.00');
      expect(formatMinorUnits(12345678)).toBe('1,23,456.78');
      expect(formatMinorUnits(0)).toBe('0.00');
      expect(formatMinorUnits(50)).toBe('0.50');
    });
  });

  describe('2. GST Statutory Tax Invoice Calculation & Formatting', () => {
    it('should enforce exact BigInt integer arithmetic for 5% inclusive GST (SAC 998555)', () => {
      const breakdown = calculateGstBreakdown(150000, 5, '998555');

      expect(breakdown.taxableAmount + breakdown.gstAmount).toBe(150000);
      expect(breakdown.taxableAmount).toBe(142857);
      expect(breakdown.gstAmount).toBe(7143);
      expect(breakdown.cgstAmount).toBe(3571);
      expect(breakdown.sgstAmount).toBe(3572);
      expect(breakdown.cgstAmount + breakdown.sgstAmount).toBe(breakdown.gstAmount);
      expect(breakdown.sacCode).toBe('998555');
      expect(breakdown.gstRatePercent).toBe(5);
    });

    it('should maintain exact integer precision on multi-million large minor-unit amounts without floating point drift', () => {
      // ₹10,00,00,000.00 = 1,000,000,000 paise
      const largeTotal = 1000000000;
      const breakdown = calculateGstBreakdown(largeTotal, 5);

      expect(breakdown.taxableAmount + breakdown.gstAmount).toBe(largeTotal);
      expect(breakdown.cgstAmount + breakdown.sgstAmount).toBe(breakdown.gstAmount);
      expect(breakdown.taxableAmount).toBe(952380952);
      expect(breakdown.gstAmount).toBe(47619048);
      expect(breakdown.cgstAmount).toBe(23809524);
      expect(breakdown.sgstAmount).toBe(23809524);
    });

    it('should support configurable GST rate and zero tax exemption', () => {
      const zeroTax = calculateGstBreakdown(50000, 0);
      expect(zeroTax.taxableAmount).toBe(50000);
      expect(zeroTax.gstAmount).toBe(0);
      expect(zeroTax.cgstAmount).toBe(0);
      expect(zeroTax.sgstAmount).toBe(0);

      const twelvePercent = calculateGstBreakdown(112000, 12);
      expect(twelvePercent.taxableAmount).toBe(100000);
      expect(twelvePercent.gstAmount).toBe(12000);
      expect(twelvePercent.taxableAmount + twelvePercent.gstAmount).toBe(112000);
    });

    it('should render statutory invoice HTML with required legal and financial details', () => {
      const mockBooking: any = {
        bookingReference: 'BK-20260926-TEST',
        primaryContact: {
          fullName: 'Shlok <Developer>',
          email: 'shlok@example.com',
          phone: '+91 9876543210',
        },
        packageSnapshot: {
          title: 'Golden Triangle Heritage Tour',
          originCity: 'Delhi',
          destinationCity: 'Jaipur',
        },
        departureSnapshot: {
          departureDate: '2026-10-15',
          returnDate: '2026-10-20',
          destinationCity: 'Jaipur',
          destinationCountry: 'India',
        },
        partySize: 2,
        adultCount: 2,
        childCount: 0,
      };

      const mockInvoice: any = {
        invoiceNumber: 'INV-202609-AB12',
        createdAt: new Date('2026-09-26T10:00:00Z'),
        taxableAmount: 142857,
        gstAmount: 7143,
        totalAmount: 150000,
        currency: 'INR',
      };

      const invoiceHtml = renderInvoiceHtml({
        invoice: mockInvoice,
        booking: mockBooking,
      });

      expect(invoiceHtml).toContain('TAX INVOICE');
      expect(invoiceHtml).toContain('INV-202609-AB12');
      expect(invoiceHtml).toContain('BK-20260926-TEST');
      expect(invoiceHtml).toContain('Shlok &lt;Developer&gt;');
      expect(invoiceHtml).toContain('998555'); // SAC Code
      expect(invoiceHtml).toContain('1,428.57');
      expect(invoiceHtml).toContain('71.43');
      expect(invoiceHtml).toContain('1,500.00');
      expect(invoiceHtml).toContain('7-Year Accounting & Tax Audit');
      expect(invoiceHtml).not.toContain('<script>');
    });
  });

  describe('3. E-Ticket Voucher Rendering & Content', () => {
    it('should render e-ticket voucher HTML with passenger roster and itinerary snapshot', () => {
      const mockBooking: any = {
        bookingReference: 'BK-20260926-TEST',
        primaryContact: {
          fullName: 'Rahul Sharma',
          email: 'rahul@example.com',
          phone: '+91 9876543210',
        },
        packageSnapshot: {
          title: 'Himalayan Retreat',
          originCity: 'Delhi',
          destinationCity: 'Manali',
          durationDays: 6,
          durationNights: 5,
          inclusions: ['Breakfast', 'Transfers'],
          exclusions: ['Flights'],
        },
        departureSnapshot: {
          departureDate: '2026-11-01',
          returnDate: '2026-11-06',
          destinationCity: 'Manali',
          destinationCountry: 'India',
        },
        partySize: 2,
      };

      const mockVoucher: any = {
        voucherCode: 'VCH-20260926-XY89',
        createdAt: new Date('2026-09-26T10:00:00Z'),
      };

      const voucherHtml = renderVoucherHtml({
        voucher: mockVoucher,
        booking: mockBooking,
        passengers: [
          {
            fullName: 'Rahul Sharma',
            passengerType: 'ADULT',
            gender: 'MALE',
            ageAtBooking: 28,
            isPrimaryContact: true,
            specialRequests: 'Vegetarian meal',
          },
          {
            fullName: 'Priya Sharma',
            passengerType: 'ADULT',
            gender: 'FEMALE',
            ageAtBooking: 26,
            isPrimaryContact: false,
            specialRequests: null,
          },
        ],
      });

      expect(voucherHtml).toContain('E-TICKET / TRAVEL VOUCHER');
      expect(voucherHtml).toContain('VCH-20260926-XY89');
      expect(voucherHtml).toContain('BK-20260926-TEST');
      expect(voucherHtml).toContain('Rahul Sharma');
      expect(voucherHtml).toContain('Priya Sharma');
      expect(voucherHtml).toContain('Vegetarian meal');
    });
  });

  describe('4. DocumentService Eligibility & Idempotency Rules', () => {
    let mockBookingRepo: any;
    let mockPassengerRepo: any;
    let mockPaymentRepo: any;
    let mockTaxInvoiceRepo: any;
    let mockTicketVoucherRepo: any;
    let mockStorageService: any;
    let mockPdfGenerator: any;
    let documentService: DocumentService;

    const sampleBooking = {
      id: 'b1111111-1111-1111-1111-111111111111',
      bookingReference: 'BK-20260926-TEST',
      customerId: 'u1111111-1111-1111-1111-111111111111',
      departureId: 'd1111111-1111-1111-1111-111111111111',
      partySize: 2,
      adultCount: 2,
      childCount: 0,
      totalPrice: 150000,
      currency: 'INR',
      status: 'CONFIRMED',
      primaryContact: {
        fullName: 'Shlok Patel',
        email: 'shlok@example.com',
        phone: '+91 9999988888',
      },
      packageSnapshot: {
        title: 'Goa Coastal Cruise',
        durationDays: 4,
        durationNights: 3,
      },
      departureSnapshot: {
        departureDate: '2026-10-10',
        returnDate: '2026-10-14',
        destinationCity: 'Goa',
        destinationCountry: 'India',
      },
      itinerarySnapshot: {
        days: [{ dayNumber: 1, title: 'Beach Welcome', activity: 'Relaxation' }],
      },
    };

    const samplePayment = {
      id: 'p1111111-1111-1111-1111-111111111111',
      bookingId: sampleBooking.id,
      provider: 'RAZORPAY',
      amount: 150000,
      currency: 'INR',
      status: 'SUCCESS',
      gatewayPaymentId: 'pay_test_mock_123',
    };

    beforeEach(() => {
      mockBookingRepo = {
        findById: vi.fn().mockResolvedValue(sampleBooking),
      };
      mockPassengerRepo = {
        findByBookingId: vi.fn().mockResolvedValue([
          {
            id: 'pass-1',
            bookingId: sampleBooking.id,
            fullName: 'Shlok Patel',
            passengerType: 'ADULT',
            gender: 'MALE',
            ageAtBooking: 25,
            isPrimaryContact: true,
            specialRequests: null,
          },
        ]),
      };
      mockPaymentRepo = {
        findByBookingId: vi.fn().mockResolvedValue([samplePayment]),
      };
      mockTaxInvoiceRepo = {
        findByBookingId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'inv-123', ...data })),
      };
      mockTicketVoucherRepo = {
        findByBookingId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'vch-123', ...data })),
      };
      mockStorageService = {
        upload: vi.fn().mockResolvedValue('documents/invoices/key.pdf'),
      };
      mockPdfGenerator = {
        generatePdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock content')),
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

    it('A. should generate invoice and voucher for eligible CONFIRMED & paid booking', async () => {
      const result = await documentService.generateBookingDocuments(sampleBooking.id);

      expect(result.invoice).toBeDefined();
      expect(result.voucher).toBeDefined();
      expect(result.invoice.invoiceNumber).toMatch(/^INV-\d{6}-[A-Z0-9]+$/);
      expect(result.voucher.voucherCode).toMatch(/^VCH-\d{8}-[A-Z0-9]+$/);

      // Verify PDF generator called with HTML
      expect(mockPdfGenerator.generatePdf).toHaveBeenCalledTimes(2);

      // Verify Storage upload called with private bucket and metadata
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          bucket: 'travel-documents-private',
          isPublic: false,
          contentType: 'application/pdf',
          metadata: expect.objectContaining({
            retentionYears: '7',
          }),
        }),
      );
    });

    it('B. should reject document generation for AWAITING_PAYMENT booking', async () => {
      mockBookingRepo.findById.mockResolvedValueOnce({
        ...sampleBooking,
        status: 'AWAITING_PAYMENT',
      });

      await expect(documentService.generateInvoice(sampleBooking.id)).rejects.toThrow(
        /Documents can only be generated for CONFIRMED bookings/,
      );
    });

    it('C. should reject document generation for EXPIRED booking', async () => {
      mockBookingRepo.findById.mockResolvedValueOnce({
        ...sampleBooking,
        status: 'EXPIRED',
      });

      await expect(documentService.generateInvoice(sampleBooking.id)).rejects.toThrow(
        /Documents can only be generated for CONFIRMED bookings/,
      );
    });

    it('D. should reject document generation for CANCELLED booking', async () => {
      mockBookingRepo.findById.mockResolvedValueOnce({
        ...sampleBooking,
        status: 'CANCELLED',
      });

      await expect(documentService.generateInvoice(sampleBooking.id)).rejects.toThrow(
        /Documents can only be generated for CONFIRMED bookings/,
      );
    });

    it('E. should reject document generation if payment status is not SUCCESS (e.g. PENDING / FAILED)', async () => {
      mockPaymentRepo.findByBookingId.mockResolvedValueOnce([
        { ...samplePayment, status: 'PENDING' },
      ]);

      await expect(documentService.generateInvoice(sampleBooking.id)).rejects.toThrow(
        /does not have a verified SUCCESS payment transaction/,
      );
    });

    it('F. should return existing invoice idempotently without re-rendering or creating duplicate records', async () => {
      const existingInvoice = {
        id: 'inv-existing-1',
        invoiceNumber: 'INV-202609-EXISTING',
        bookingId: sampleBooking.id,
        customerId: sampleBooking.customerId,
        gstinNumber: null,
        taxableAmount: 142857,
        gstAmount: 7143,
        totalAmount: 150000,
        currency: 'INR',
        pdfStorageKey: 'documents/invoices/b1/INV-202609-EXISTING.pdf',
        createdAt: new Date(),
      };

      mockTaxInvoiceRepo.findByBookingId.mockResolvedValueOnce([existingInvoice]);

      const invoice = await documentService.generateInvoice(sampleBooking.id);

      expect(invoice.id).toBe('inv-existing-1');
      expect(invoice.invoiceNumber).toBe('INV-202609-EXISTING');
      expect(mockPdfGenerator.generatePdf).not.toHaveBeenCalled();
      expect(mockTaxInvoiceRepo.create).not.toHaveBeenCalled();
    });

    it('G. should return existing voucher idempotently without re-rendering or creating duplicate records', async () => {
      const existingVoucher = {
        id: 'vch-existing-1',
        voucherCode: 'VCH-20260926-EXISTING',
        bookingId: sampleBooking.id,
        pdfStorageKey: 'documents/vouchers/b1/VCH-20260926-EXISTING.pdf',
        createdAt: new Date(),
      };

      mockTicketVoucherRepo.findByBookingId.mockResolvedValueOnce([existingVoucher]);

      const voucher = await documentService.generateVoucher(sampleBooking.id);

      expect(voucher.id).toBe('vch-existing-1');
      expect(voucher.voucherCode).toBe('VCH-20260926-EXISTING');
      expect(mockPdfGenerator.generatePdf).not.toHaveBeenCalled();
      expect(mockTicketVoucherRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('5. Booking Confirmation to Document Generation Trigger Hook', () => {
    it('should invoke onBookingConfirmed hook after successful booking confirmation', async () => {
      const onBookingConfirmedMock = vi.fn().mockResolvedValue(undefined);

      const mockDb: any = {
        withTransaction: vi.fn().mockImplementation(async (cb) => cb({})),
      };
      const mockBookingRepo: any = {
        findById: vi.fn().mockResolvedValue({
          id: 'booking-trigger-1',
          departureId: 'dep-1',
          holdId: 'hold-1',
          status: 'AWAITING_PAYMENT',
          partySize: 2,
          totalPrice: 150000,
          currency: 'INR',
        }),
        updateStatusGuarded: vi.fn().mockResolvedValue({
          id: 'booking-trigger-1',
          status: 'CONFIRMED',
        }),
      };
      const mockHoldRepo: any = {
        findById: vi.fn().mockResolvedValue({
          id: 'hold-1',
          departureId: 'dep-1',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60000),
          heldSeats: 2,
        }),
        updateStatusGuarded: vi.fn().mockResolvedValue({
          id: 'hold-1',
          status: 'COMMITTED',
        }),
      };
      const mockDepartureRepo: any = {
        findByIdForUpdate: vi.fn().mockResolvedValue({
          id: 'dep-1',
          bookedSeats: 0,
          totalSeatCapacity: 10,
        }),
        incrementBookedSeats: vi.fn().mockResolvedValue(undefined),
      };
      const mockPaymentTxRepo: any = {
        findByBookingId: vi.fn().mockResolvedValue([
          {
            id: 'pay-tx-1',
            bookingId: 'booking-trigger-1',
            status: 'SUCCESS',
            amount: 150000,
            currency: 'INR',
          },
        ]),
      };

      const { BookingService } =
        await import('../../backend/src/modules/booking/services/booking.service.js');
      const bookingService = new BookingService(
        mockDb,
        mockBookingRepo,
        {} as any,
        {} as any,
        mockDepartureRepo,
        mockHoldRepo,
        {} as any,
        {} as any,
        {} as any,
        mockPaymentTxRepo,
        onBookingConfirmedMock,
      );

      const result = await bookingService.confirmBooking({
        bookingId: 'booking-trigger-1',
        paymentVerified: true,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(onBookingConfirmedMock).toHaveBeenCalledTimes(1);
      expect(onBookingConfirmedMock).toHaveBeenCalledWith('booking-trigger-1');
    });
  });
});
