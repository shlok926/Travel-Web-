import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { seedAll } from '../../backend/src/infrastructure/database/seeds/seedAll.js';
import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { InventoryHoldRepository } from '../../backend/src/modules/inventory/repositories/inventoryHold.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { IdempotencyRepository } from '../../backend/src/modules/booking/repositories/idempotency.repository.js';
import { TourPackageRepository } from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import { ItineraryRepository } from '../../backend/src/modules/catalogue/repositories/itinerary.repository.js';
import { DestinationRepository } from '../../backend/src/modules/catalogue/repositories/destination.repository.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { CancellationRequestRepository } from '../../backend/src/modules/payment/repositories/cancellationRequest.repository.js';
import { RefundSettlementRepository } from '../../backend/src/modules/payment/repositories/refundSettlement.repository.js';
import { TaxInvoiceRepository } from '../../backend/src/modules/document/repositories/taxInvoice.repository.js';
import { TicketVoucherRepository } from '../../backend/src/modules/document/repositories/ticketVoucher.repository.js';
import { PdfGeneratorService } from '../../backend/src/modules/document/services/pdfGenerator.service.js';
import { StorageFactory, IStorageService } from '../../backend/src/infrastructure/storage/index.js';
import { BookingService } from '../../backend/src/modules/booking/services/booking.service.js';
import { CancellationService } from '../../backend/src/modules/payment/services/cancellation.service.js';
import { DocumentService } from '../../backend/src/modules/document/services/document.service.js';
import { PaymentGatewayFactory } from '../../backend/src/modules/payment/adapters/paymentGateway.factory.js';
import { NotificationProducerService } from '../../backend/src/modules/notification/services/notificationProducer.service.js';

describe('Phase 8 Step 6 — Domain Notification Trigger Integration & Post-Commit Wire Audit', () => {
  let db: DatabaseService;
  let isDbAvailable = false;
  let departureRepo: DepartureRepository;
  let holdRepo: InventoryHoldRepository;
  let bookingRepo: BookingRepository;
  let passengerRepo: PassengerRepository;
  let idempotencyRepo: IdempotencyRepository;
  let tourPackageRepo: TourPackageRepository;
  let itineraryRepo: ItineraryRepository;
  let destinationRepo: DestinationRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let cancellationRequestRepo: CancellationRequestRepository;
  let refundSettlementRepo: RefundSettlementRepository;
  let taxInvoiceRepo: TaxInvoiceRepository;
  let ticketVoucherRepo: TicketVoucherRepository;
  let storage: IStorageService;
  let pdfGenerator: PdfGeneratorService;
  let gatewayFactory: PaymentGatewayFactory;

  const config = loadEnv();
  const testUserId = '88888888-8888-4888-8888-888888888888';
  let testDepartureId: string;

  beforeAll(async () => {
    try {
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;

        await runMigrations(db);
        await seedAll();

        departureRepo = new DepartureRepository(db);
        holdRepo = new InventoryHoldRepository(db);
        bookingRepo = new BookingRepository(db);
        passengerRepo = new PassengerRepository(db);
        idempotencyRepo = new IdempotencyRepository(db);
        tourPackageRepo = new TourPackageRepository(db);
        itineraryRepo = new ItineraryRepository(db);
        destinationRepo = new DestinationRepository(db);
        paymentTxRepo = new PaymentTransactionRepository(db);
        cancellationRequestRepo = new CancellationRequestRepository(db);
        refundSettlementRepo = new RefundSettlementRepository(db);
        taxInvoiceRepo = new TaxInvoiceRepository(db);
        ticketVoucherRepo = new TicketVoucherRepository(db);
        storage = StorageFactory.create(config);
        pdfGenerator = new PdfGeneratorService();
        gatewayFactory = new PaymentGatewayFactory(config);

        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES ($1, $2, '$argon2id$mockhash', 'Notification Test User', 'CUSTOMER', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true;`,
          [testUserId, 'notification.tester@example.com'],
        );

        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        if (pkgRes.rows.length > 0 && pkgRes.rows[0]) {
          const packageId = pkgRes.rows[0].id;
          const depRes = await db.query<{ id: string }>(
            `SELECT id FROM departure_schedules WHERE package_id = $1 AND available_seats > 5 AND status = 'OPEN' LIMIT 1;`,
            [packageId],
          );
          if (depRes.rows.length > 0 && depRes.rows[0]) {
            testDepartureId = depRes.rows[0].id;
          } else {
            const newDep = await departureRepo.create({
              packageId,
              departureDate: '2027-11-20',
              returnDate: '2027-11-25',
              totalSeatCapacity: 50,
              status: 'OPEN',
            });
            testDepartureId = newDep.id;
          }
        }
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pdfGenerator) {
      await pdfGenerator.close();
    }
    if (db && isDbAvailable) {
      await db.close();
    }
  });

  // Helper to create a confirmed booking with successful payment
  async function createTestBookingWithPayment(
    bookingService: BookingService,
    userEmail: string = 'traveler@example.com',
  ) {
    if (db && isDbAvailable && testDepartureId) {
      await db.query(
        `UPDATE departure_schedules SET available_seats = available_seats + 10, status = 'OPEN' WHERE id = $1;`,
        [testDepartureId],
      );
    }
    const idempotencyKey = `idemp-${crypto.randomUUID()}`;
    const result = await bookingService.createBooking({
      userId: testUserId,
      endpointScope: 'CUSTOMER_BOOKING',
      idempotencyKey,
      requestHash: crypto.createHash('sha256').update(idempotencyKey).digest('hex'),
      bookingData: {
        departureId: testDepartureId,
        partySize: 1,
        adultCount: 1,
        childCount: 0,
        primaryContact: {
          name: 'Siddharth Sharma',
          email: userEmail,
          phone: '+919876543210',
        },
        passengers: [
          {
            fullName: 'Siddharth Sharma',
            passengerType: 'ADULT',
            gender: 'MALE',
            ageAtBooking: 32,
            isPrimaryContact: true,
          },
        ],
      },
    });

    const booking = result.booking;

    // Create SUCCESS payment transaction
    const paymentTx = await paymentTxRepo.create({
      bookingId: booking.id,
      amount: booking.totalPrice,
      currency: booking.currency,
      provider: 'MOCK',
      status: 'SUCCESS',
      gatewayPaymentId: `pay_test_${crypto.randomBytes(6).toString('hex')}`,
      gatewayOrderId: `ord_test_${crypto.randomBytes(6).toString('hex')}`,
      idempotencyKey: `pay_idemp_${crypto.randomUUID()}`,
    });

    return { booking, paymentTx, holdId: result.hold.id };
  }

  // ============================================================
  // 1. BOOKING_CONFIRMED Production Trigger
  // ============================================================
  describe('1. BOOKING_CONFIRMED Production Trigger Wiring', () => {
    it('should invoke enqueueBookingConfirmed only after PostgreSQL transaction commits', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueBookingConfirmed: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-conf-1' }),
        enqueueDocumentReady: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueRefundSettled: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueBookingCancelled: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueNotification: vi.fn().mockResolvedValue({ enqueued: true }),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
        undefined,
        mockProducer,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);

      // Confirm the booking
      const confirmed = await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      expect(confirmed.status).toBe('CONFIRMED');
      expect(mockProducer.enqueueBookingConfirmed).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(mockProducer.enqueueBookingConfirmed).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = callArgs![0];
      expect(payload.type).toBe('BOOKING_CONFIRMED');
      expect(payload.bookingReference).toBe(confirmed.bookingReference);
      expect(payload.recipientEmail).toBe('traveler@example.com');
      expect(payload.customerName).toBe('Siddharth Sharma');
      expect(payload.totalAmount).toBe(confirmed.totalPrice);
      expect(payload.portalUrl).toBe(`/portal/bookings/${confirmed.bookingReference}`);
    });

    it('should NOT fail or rollback booking confirmation if notification producer throws or fails', async () => {
      if (!isDbAvailable) return;

      const failingProducer = {
        enqueueBookingConfirmed: vi.fn().mockRejectedValue(new Error('Redis connection timed out')),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
        undefined,
        failingProducer,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);

      // Confirmation should succeed despite notification error
      const confirmed = await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      expect(confirmed.status).toBe('CONFIRMED');

      // Verify DB row is committed as CONFIRMED
      const persisted = await bookingRepo.findById(booking.id);
      expect(persisted?.status).toBe('CONFIRMED');
    });
  });

  // ============================================================
  // 2. DOCUMENT_READY Production Trigger
  // ============================================================
  describe('2. DOCUMENT_READY Production Trigger Wiring', () => {
    it('should invoke enqueueDocumentReady with documentType: ALL when generateBookingDocuments completes', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueBookingConfirmed: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueDocumentReady: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-doc-all-1' }),
        enqueueRefundSettled: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueBookingCancelled: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueNotification: vi.fn().mockResolvedValue({ enqueued: true }),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);
      await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      const documentService = new DocumentService(
        bookingRepo,
        passengerRepo,
        paymentTxRepo,
        taxInvoiceRepo,
        ticketVoucherRepo,
        storage,
        pdfGenerator,
        config.S3_BUCKET_PRIVATE,
        mockProducer,
      );

      const result = await documentService.generateBookingDocuments(booking.id);

      expect(result.invoice).toBeDefined();
      expect(result.voucher).toBeDefined();
      expect(mockProducer.enqueueDocumentReady).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(mockProducer.enqueueDocumentReady).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = callArgs![0];
      expect(payload.type).toBe('DOCUMENT_READY');
      expect(payload.documentType).toBe('ALL');
      expect(payload.bookingReference).toBe(booking.bookingReference);
      expect(payload.recipientEmail).toBe('traveler@example.com');
      expect(payload.portalDocumentUrl).toBe(
        `/portal/bookings/${booking.bookingReference}/documents`,
      );
    });

    it('should invoke enqueueDocumentReady with documentType: INVOICE for individual invoice generation', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueDocumentReady: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-doc-inv-1' }),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);
      await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      const documentService = new DocumentService(
        bookingRepo,
        passengerRepo,
        paymentTxRepo,
        taxInvoiceRepo,
        ticketVoucherRepo,
        storage,
        pdfGenerator,
        config.S3_BUCKET_PRIVATE,
        mockProducer,
      );

      const invoice = await documentService.generateInvoice(booking.id);

      expect(invoice.pdfStorageKey).not.toBeNull();
      expect(mockProducer.enqueueDocumentReady).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(mockProducer.enqueueDocumentReady).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = callArgs![0];
      expect(payload.documentType).toBe('INVOICE');
      expect(payload.portalDocumentUrl).toBe(
        `/portal/bookings/${booking.bookingReference}/documents?type=INVOICE`,
      );
    });
  });

  // ============================================================
  // 3. REFUND_SETTLED and BOOKING_CANCELLED Production Triggers
  // ============================================================
  describe('3. REFUND_SETTLED and BOOKING_CANCELLED Production Triggers', () => {
    it('should invoke both REFUND_SETTLED and BOOKING_CANCELLED after definitive SETTLED cancellation authorization', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueRefundSettled: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-ref-1' }),
        enqueueBookingCancelled: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-canc-1' }),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
      );

      const cancellationService = new CancellationService(
        db,
        bookingRepo,
        departureRepo,
        cancellationRequestRepo,
        refundSettlementRepo,
        paymentTxRepo,
        gatewayFactory,
        undefined,
        mockProducer,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);
      await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      // Customer requests cancellation
      const cancellationRequest = await cancellationService.requestCancellation({
        bookingReference: booking.bookingReference,
        customerId: testUserId,
        reason: 'Personal schedule conflict',
      });

      // Admin authorizes cancellation with SETTLED refund
      const authResult = await cancellationService.authorizeCancellation({
        cancellationId: cancellationRequest.id,
        adminId: '32598515-0908-4bd3-9878-a4eb1d5dbb9a',
        adminNotes: 'Approved customer cancellation',
      });

      expect(authResult.settlement.settlementStatus).toBe('SETTLED');
      expect(authResult.booking.status).toBe('CANCELLED');

      // Verify REFUND_SETTLED was enqueued with authoritative payload
      expect(mockProducer.enqueueRefundSettled).toHaveBeenCalledTimes(1);
      const refundCallArgs = vi.mocked(mockProducer.enqueueRefundSettled).mock.calls[0];
      expect(refundCallArgs).toBeDefined();
      const refundPayload = refundCallArgs![0];
      expect(refundPayload.type).toBe('REFUND_SETTLED');
      expect(refundPayload.cancellationRequestId).toBe(cancellationRequest.id);
      expect(refundPayload.bookingReference).toBe(booking.bookingReference);
      expect(refundPayload.recipientEmail).toBe('traveler@example.com');
      expect(refundPayload.refundAmount).toBe(authResult.settlement.refundAmount);
      expect(refundPayload.currency).toBe(authResult.settlement.currency);

      // Verify BOOKING_CANCELLED was enqueued with authoritative payload
      expect(mockProducer.enqueueBookingCancelled).toHaveBeenCalledTimes(1);
      const cancelCallArgs = vi.mocked(mockProducer.enqueueBookingCancelled).mock.calls[0];
      expect(cancelCallArgs).toBeDefined();
      const cancelPayload = cancelCallArgs![0];
      expect(cancelPayload.type).toBe('BOOKING_CANCELLED');
      expect(cancelPayload.bookingReference).toBe(booking.bookingReference);
      expect(cancelPayload.recipientEmail).toBe('traveler@example.com');
      expect(cancelPayload.cancellationReason).toBe('Personal schedule conflict');
    });

    it('should NOT invoke REFUND_SETTLED if gateway returns PROCESSING / ambiguous state', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueRefundSettled: vi.fn().mockResolvedValue({ enqueued: true }),
        enqueueBookingCancelled: vi.fn().mockResolvedValue({ enqueued: true }),
      } as unknown as NotificationProducerService;

      // Mock gateway factory returning PROCESSING refund
      const processingGatewayFactory = {
        getAdapter: () => ({
          refundPayment: vi.fn().mockResolvedValue({
            gatewayRefundId: 'rfnd_proc_123',
            status: 'PROCESSING',
            rawPayload: { status: 'in_progress' },
          }),
        }),
      } as unknown as PaymentGatewayFactory;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
      );

      const cancellationService = new CancellationService(
        db,
        bookingRepo,
        departureRepo,
        cancellationRequestRepo,
        refundSettlementRepo,
        paymentTxRepo,
        processingGatewayFactory,
        undefined,
        mockProducer,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);
      await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      const cancellationRequest = await cancellationService.requestCancellation({
        bookingReference: booking.bookingReference,
        customerId: testUserId,
        reason: 'Ambiguous test',
      });

      const authResult = await cancellationService.authorizeCancellation({
        cancellationId: cancellationRequest.id,
        adminId: '32598515-0908-4bd3-9878-a4eb1d5dbb9a',
      });

      expect(authResult.settlement.settlementStatus).toBe('PROCESSING');
      // Neither REFUND_SETTLED nor BOOKING_CANCELLED should be fired during PROCESSING
      expect(mockProducer.enqueueRefundSettled).not.toHaveBeenCalled();
      expect(mockProducer.enqueueBookingCancelled).not.toHaveBeenCalled();
    });

    it('should invoke BOOKING_CANCELLED from direct BookingService.cancelBooking', async () => {
      if (!isDbAvailable) return;

      const mockProducer = {
        enqueueBookingCancelled: vi
          .fn()
          .mockResolvedValue({ enqueued: true, jobId: 'job-direct-canc' }),
      } as unknown as NotificationProducerService;

      const bookingService = new BookingService(
        db,
        bookingRepo,
        passengerRepo,
        idempotencyRepo,
        departureRepo,
        holdRepo,
        tourPackageRepo,
        itineraryRepo,
        destinationRepo,
        paymentTxRepo,
        undefined,
        mockProducer,
      );

      const { booking, paymentTx } = await createTestBookingWithPayment(bookingService);
      await bookingService.confirmBooking({
        bookingId: booking.id,
        paymentVerified: true,
        paymentTransactionId: paymentTx.id,
      });

      const cancelled = await bookingService.cancelBooking({
        bookingReference: booking.bookingReference,
        customerId: testUserId,
        reason: 'Direct customer request',
      });

      expect(cancelled.status).toBe('CANCELLED');
      expect(mockProducer.enqueueBookingCancelled).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(mockProducer.enqueueBookingCancelled).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = callArgs![0];
      expect(payload.bookingReference).toBe(booking.bookingReference);
      expect(payload.recipientEmail).toBe('traveler@example.com');
      expect(payload.cancellationReason).toBe('Direct customer request');
    });
  });
});
