import crypto from 'crypto';
import { IStorageService } from '../../../infrastructure/storage/index.js';
import { BookingRepository, PassengerRepository } from '../../booking/repositories/index.js';
import { PaymentTransactionRepository } from '../../payment/repositories/index.js';
import { TaxInvoiceRepository, TaxInvoiceEntity } from '../repositories/taxInvoice.repository.js';
import {
  TicketVoucherRepository,
  TicketVoucherEntity,
} from '../repositories/ticketVoucher.repository.js';
import { PdfGeneratorService } from './pdfGenerator.service.js';
import { calculateGstBreakdown } from './gstCalculator.js';
import { renderInvoiceHtml } from '../templates/invoice.template.js';
import { renderVoucherHtml } from '../templates/voucher.template.js';
import {
  AppError,
  ErrorCodes,
  DocumentDownloadResponse,
  TokenPayload,
} from '../../../../../shared/src/index.js';
import { NotificationProducerService } from '../../notification/services/notificationProducer.service.js';

export interface GeneratedDocumentsResult {
  invoice: TaxInvoiceEntity;
  voucher: TicketVoucherEntity;
}

export class DocumentService {
  constructor(
    private readonly bookingRepo: BookingRepository,
    private readonly passengerRepo: PassengerRepository,
    private readonly paymentRepo: PaymentTransactionRepository,
    private readonly taxInvoiceRepo: TaxInvoiceRepository,
    private readonly ticketVoucherRepo: TicketVoucherRepository,
    private readonly storageService: IStorageService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly privateBucket: string = 'travel-documents-private',
    private readonly notificationProducer?: NotificationProducerService,
  ) {}

  /**
   * Generates both statutory GST Tax Invoice and E-Ticket Voucher for a confirmed & paid booking.
   * Fully idempotent: returns existing documents if already generated.
   */
  async generateBookingDocuments(bookingId: string): Promise<GeneratedDocumentsResult> {
    const invoice = await this.generateInvoice(bookingId, { skipNotification: true });
    const voucher = await this.generateVoucher(bookingId, { skipNotification: true });

    if (this.notificationProducer) {
      const booking = await this.bookingRepo.findById(bookingId);
      if (booking?.primaryContact?.email) {
        try {
          await this.notificationProducer.enqueueDocumentReady({
            type: 'DOCUMENT_READY',
            bookingReference: booking.bookingReference,
            recipientEmail: booking.primaryContact.email,
            recipientPhone: booking.primaryContact.phone,
            documentType: 'ALL',
            portalDocumentUrl: `/portal/bookings/${booking.bookingReference}/documents`,
          });
        } catch {
          // Notification enqueue failure must never rollback or fail document generation
        }
      }
    }

    return { invoice, voucher };
  }

  /**
   * Generates or retrieves statutory GST Tax Invoice for a confirmed & paid booking.
   */
  async generateInvoice(
    bookingId: string,
    options?: { skipNotification?: boolean },
  ): Promise<TaxInvoiceEntity> {
    // 1. Check idempotency: Return existing completed invoice if already persisted with PDF key
    const existingInvoices = await this.taxInvoiceRepo.findByBookingId(bookingId);
    const existingCompleted = existingInvoices.find((inv) => inv.pdfStorageKey !== null);
    if (existingCompleted) {
      return existingCompleted;
    }

    // 2. Fetch authoritative booking record
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new Error(`DOCUMENT_ELIGIBILITY_FAILED: Booking with ID '${bookingId}' not found.`);
    }

    // 3. Validate booking eligibility: must be CONFIRMED
    if (booking.status !== 'CONFIRMED') {
      throw new Error(
        `DOCUMENT_ELIGIBILITY_FAILED: Booking '${booking.bookingReference}' is in status '${booking.status}'. Documents can only be generated for CONFIRMED bookings.`,
      );
    }

    // 4. Validate payment eligibility: must have a SUCCESS payment transaction
    const payments = await this.paymentRepo.findByBookingId(bookingId);
    const successfulPayment = payments.find((p) => p.status === 'SUCCESS');
    if (!successfulPayment) {
      throw new Error(
        `DOCUMENT_ELIGIBILITY_FAILED: Booking '${booking.bookingReference}' does not have a verified SUCCESS payment transaction.`,
      );
    }

    // 5. Calculate GST amounts using pure BigInt arbitrary-precision integer arithmetic
    const gstBreakdown = calculateGstBreakdown(booking.totalPrice);
    const { taxableAmount, gstAmount, totalAmount } = gstBreakdown;

    // 6. Generate deterministic/safe unique invoice number (INV-YYYYMM-XXXX)
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const invoiceNumber = `INV-${yearMonth}-${randomSuffix}`;

    const tempInvoice: TaxInvoiceEntity = {
      id: '',
      invoiceNumber,
      bookingId: booking.id,
      customerId: booking.customerId,
      gstinNumber: null,
      taxableAmount,
      gstAmount,
      totalAmount,
      currency: booking.currency,
      pdfStorageKey: null,
      createdAt: now,
    };

    // 7. Render Invoice HTML
    const html = renderInvoiceHtml({
      invoice: tempInvoice,
      booking,
    });

    // 8. Generate PDF Buffer via Puppeteer
    const pdfBuffer = await this.pdfGenerator.generatePdf(html);

    // 9. Upload PDF to private storage
    const storageKey = `documents/invoices/${booking.id}/${invoiceNumber}.pdf`;
    await this.storageService.upload(pdfBuffer, {
      bucket: this.privateBucket,
      key: storageKey,
      contentType: 'application/pdf',
      isPublic: false,
      metadata: {
        bookingId: booking.id,
        invoiceNumber,
        customerId: booking.customerId,
        retentionYears: '7',
      },
    });

    // 10. Persist invoice record in PostgreSQL
    const invoice = await this.taxInvoiceRepo.create({
      invoiceNumber,
      bookingId: booking.id,
      customerId: booking.customerId,
      gstinNumber: null,
      taxableAmount,
      gstAmount,
      totalAmount,
      currency: booking.currency,
      pdfStorageKey: storageKey,
    });

    // Asynchronous Transactional Notification (Phase 8 Step 6)
    if (this.notificationProducer && !options?.skipNotification && booking.primaryContact?.email) {
      try {
        await this.notificationProducer.enqueueDocumentReady({
          type: 'DOCUMENT_READY',
          bookingReference: booking.bookingReference,
          recipientEmail: booking.primaryContact.email,
          recipientPhone: booking.primaryContact.phone,
          documentType: 'INVOICE',
          portalDocumentUrl: `/portal/bookings/${booking.bookingReference}/documents?type=INVOICE`,
        });
      } catch {
        // Notification enqueue failure must never rollback or fail document generation
      }
    }

    return invoice;
  }

  /**
   * Generates or retrieves E-Ticket Voucher for a confirmed & paid booking.
   */
  async generateVoucher(
    bookingId: string,
    options?: { skipNotification?: boolean },
  ): Promise<TicketVoucherEntity> {
    // 1. Check idempotency: Return existing completed voucher if already persisted with PDF key
    const existingVouchers = await this.ticketVoucherRepo.findByBookingId(bookingId);
    const existingCompleted = existingVouchers.find((vch) => vch.pdfStorageKey !== null);
    if (existingCompleted) {
      return existingCompleted;
    }

    // 2. Fetch authoritative booking record
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new Error(`DOCUMENT_ELIGIBILITY_FAILED: Booking with ID '${bookingId}' not found.`);
    }

    // 3. Validate booking eligibility: must be CONFIRMED
    if (booking.status !== 'CONFIRMED') {
      throw new Error(
        `DOCUMENT_ELIGIBILITY_FAILED: Booking '${booking.bookingReference}' is in status '${booking.status}'. Documents can only be generated for CONFIRMED bookings.`,
      );
    }

    // 4. Validate payment eligibility: must have a SUCCESS payment transaction
    const payments = await this.paymentRepo.findByBookingId(bookingId);
    const successfulPayment = payments.find((p) => p.status === 'SUCCESS');
    if (!successfulPayment) {
      throw new Error(
        `DOCUMENT_ELIGIBILITY_FAILED: Booking '${booking.bookingReference}' does not have a verified SUCCESS payment transaction.`,
      );
    }

    // 5. Fetch passengers roster
    const passengers = await this.passengerRepo.findByBookingId(bookingId);

    // 6. Generate unique voucher code (VCH-YYYYMMDD-XXXX)
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const voucherCode = `VCH-${dateStr}-${randomSuffix}`;

    const tempVoucher: TicketVoucherEntity = {
      id: '',
      voucherCode,
      bookingId: booking.id,
      pdfStorageKey: null,
      createdAt: now,
    };

    // 7. Render Voucher HTML
    const html = renderVoucherHtml({
      voucher: tempVoucher,
      booking,
      passengers: passengers.map((p) => ({
        fullName: p.fullName,
        passengerType: p.passengerType,
        gender: p.gender,
        ageAtBooking: p.ageAtBooking,
        isPrimaryContact: p.isPrimaryContact,
        specialRequests: p.specialRequests,
      })),
    });

    // 8. Generate PDF Buffer via Puppeteer
    const pdfBuffer = await this.pdfGenerator.generatePdf(html);

    // 9. Upload PDF to private storage
    const storageKey = `documents/vouchers/${booking.id}/${voucherCode}.pdf`;
    await this.storageService.upload(pdfBuffer, {
      bucket: this.privateBucket,
      key: storageKey,
      contentType: 'application/pdf',
      isPublic: false,
      metadata: {
        bookingId: booking.id,
        voucherCode,
        customerId: booking.customerId,
        retentionYears: '7',
      },
    });

    // 10. Persist voucher record in PostgreSQL
    const voucher = await this.ticketVoucherRepo.create({
      voucherCode,
      bookingId: booking.id,
      pdfStorageKey: storageKey,
    });

    // Asynchronous Transactional Notification (Phase 8 Step 6)
    if (this.notificationProducer && !options?.skipNotification && booking.primaryContact?.email) {
      try {
        await this.notificationProducer.enqueueDocumentReady({
          type: 'DOCUMENT_READY',
          bookingReference: booking.bookingReference,
          recipientEmail: booking.primaryContact.email,
          recipientPhone: booking.primaryContact.phone,
          documentType: 'VOUCHER',
          portalDocumentUrl: `/portal/bookings/${booking.bookingReference}/documents?type=VOUCHER`,
        });
      } catch {
        // Notification enqueue failure must never rollback or fail document generation
      }
    }

    return voucher;
  }

  /**
   * Generates a secure, time-limited presigned download URL for a booking's GST Tax Invoice.
   * Enforces customer ownership isolation or admin authorization prior to URL creation.
   */
  async getInvoiceDownloadUrl(
    bookingReference: string,
    user: TokenPayload,
    expiresInSeconds: number = 900,
  ): Promise<DocumentDownloadResponse> {
    if (!user || !user.userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    // 1. Fetch booking enforcing ownership or admin RBAC
    const booking =
      user.role === 'ADMIN'
        ? await this.bookingRepo.findByReference(bookingReference)
        : await this.bookingRepo.findByReferenceAndCustomer(bookingReference, user.userId);

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    // 2. Fetch completed invoice record
    const invoices = await this.taxInvoiceRepo.findByBookingId(booking.id);
    const completedInvoice = invoices.find((inv) => inv.pdfStorageKey !== null);

    if (!completedInvoice || !completedInvoice.pdfStorageKey) {
      throw AppError.notFound(
        `Tax invoice document not found for booking '${bookingReference}'.`,
        ErrorCodes.DOCUMENT_NOT_FOUND,
      );
    }

    // 3. Generate short-lived presigned download URL via storage abstraction
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const downloadUrl = await this.storageService.getDownloadUrl(
      this.privateBucket,
      completedInvoice.pdfStorageKey,
      expiresInSeconds,
    );

    return {
      documentType: 'INVOICE',
      bookingReference: booking.bookingReference,
      downloadUrl,
      expiresAt,
    };
  }

  /**
   * Generates a secure, time-limited presigned download URL for a booking's E-Ticket Voucher.
   * Enforces customer ownership isolation or admin authorization prior to URL creation.
   */
  async getVoucherDownloadUrl(
    bookingReference: string,
    user: TokenPayload,
    expiresInSeconds: number = 900,
  ): Promise<DocumentDownloadResponse> {
    if (!user || !user.userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    // 1. Fetch booking enforcing ownership or admin RBAC
    const booking =
      user.role === 'ADMIN'
        ? await this.bookingRepo.findByReference(bookingReference)
        : await this.bookingRepo.findByReferenceAndCustomer(bookingReference, user.userId);

    if (!booking) {
      throw AppError.notFound('Booking not found', ErrorCodes.BOOKING_NOT_FOUND);
    }

    // 2. Fetch completed voucher record
    const vouchers = await this.ticketVoucherRepo.findByBookingId(booking.id);
    const completedVoucher = vouchers.find((vch) => vch.pdfStorageKey !== null);

    if (!completedVoucher || !completedVoucher.pdfStorageKey) {
      throw AppError.notFound(
        `E-Ticket voucher document not found for booking '${bookingReference}'.`,
        ErrorCodes.DOCUMENT_NOT_FOUND,
      );
    }

    // 3. Generate short-lived presigned download URL via storage abstraction
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const downloadUrl = await this.storageService.getDownloadUrl(
      this.privateBucket,
      completedVoucher.pdfStorageKey,
      expiresInSeconds,
    );

    return {
      documentType: 'VOUCHER',
      bookingReference: booking.bookingReference,
      downloadUrl,
      expiresAt,
    };
  }
}
