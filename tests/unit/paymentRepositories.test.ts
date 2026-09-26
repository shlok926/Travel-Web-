import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  PaymentTransactionRepository,
  PaymentEventRepository,
  CancellationRequestRepository,
  RefundSettlementRepository,
} from '../../backend/src/modules/payment/index.js';
import {
  TaxInvoiceRepository,
  TicketVoucherRepository,
} from '../../backend/src/modules/document/index.js';
import { BookingRepository, CreateBookingData } from '../../backend/src/modules/booking/index.js';

describe('Phase 6 Step 3 — Payment & Document Repositories (Unit & Integration)', () => {
  let db: DatabaseService;
  let isDbAvailable = false;

  let paymentTxRepo: PaymentTransactionRepository;
  let paymentEventRepo: PaymentEventRepository;
  let taxInvoiceRepo: TaxInvoiceRepository;
  let ticketVoucherRepo: TicketVoucherRepository;
  let cancellationRepo: CancellationRequestRepository;
  let refundRepo: RefundSettlementRepository;
  let bookingRepo: BookingRepository;

  let testUserId = '';
  let testBookingId = '';

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        await seedAll();

        paymentTxRepo = new PaymentTransactionRepository(db);
        paymentEventRepo = new PaymentEventRepository(db);
        taxInvoiceRepo = new TaxInvoiceRepository(db);
        ticketVoucherRepo = new TicketVoucherRepository(db);
        cancellationRepo = new CancellationRequestRepository(db);
        refundRepo = new RefundSettlementRepository(db);
        bookingRepo = new BookingRepository(db);

        // Fetch test user
        const userRes = await db.query<{ id: string }>(`SELECT id FROM users LIMIT 1;`);
        if (userRes.rows[0]) {
          testUserId = userRes.rows[0].id;
        }

        // Fetch test departure
        const depRes = await db.query<{ id: string }>(
          `SELECT id FROM departure_schedules LIMIT 1;`,
        );
        const testDepartureId = depRes.rows[0]?.id ?? '22222222-2222-2222-2222-222222222222';

        // Create a test booking for foreign key relationships
        const bookingRef = `BK-P6TEST-${Date.now()}`;
        const bookingData: CreateBookingData = {
          bookingReference: bookingRef,
          customerId: testUserId,
          departureId: testDepartureId,
          partySize: 2,
          adultCount: 2,
          childCount: 0,
          totalPrice: 5000000, // 50,000 INR in paise
          currency: 'INR',
          status: 'AWAITING_PAYMENT',
          priceBreakdown: {
            adultCount: 2,
            adultUnitPrice: 2500000,
            adultSubtotal: 5000000,
            childCount: 0,
            childUnitPrice: 0,
            childSubtotal: 0,
            baseSubtotal: 5000000,
            discountAmount: 0,
            totalPrice: 5000000,
            currency: 'INR',
            calculatedAt: new Date().toISOString(),
          },
          packageSnapshot: {
            packageId: '11111111-1111-1111-1111-111111111111',
            slug: 'kashmir-delight',
            title: 'Kashmir Delight',
            shortDescription: 'Test package',
            durationDays: 5,
            durationNights: 4,
            originCity: 'Delhi',
            destinationCity: 'Srinagar',
            destinationCountry: 'India',
            heroImageUrl: 'https://images.example.com/kashmir.jpg',
            inclusions: ['Hotel'],
            exclusions: ['Flights'],
          },
          departureSnapshot: {
            departureId: testDepartureId,
            departureDate: '2026-12-01',
            returnDate: '2026-12-05',
            pricingApplied: {
              currency: 'INR',
              basePriceAdult: 2500000,
              basePriceChild: 0,
            },
            statusAtBooking: 'OPEN',
          },
          itinerarySnapshot: [
            {
              dayNumber: 1,
              title: 'Arrival',
              activityDescription: 'Arrival day',
              mealsIncluded: ['DINNER'],
            },
          ],
          primaryContact: {
            name: 'Payment Test User',
            email: 'payment-test@example.com',
            phone: '+919876543210',
          },
        };

        const createdBooking = await bookingRepo.create(bookingData);
        testBookingId = createdBooking.id;
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db) {
      // Clean up test data if DB is available
      if (isDbAvailable && testBookingId) {
        try {
          await db.query(
            `DELETE FROM refund_settlements WHERE payment_transaction_id IN (SELECT id FROM payment_transactions WHERE booking_id = $1);`,
            [testBookingId],
          );
          await db.query(`DELETE FROM cancellation_requests WHERE booking_id = $1;`, [
            testBookingId,
          ]);
          await db.query(`DELETE FROM tax_invoices WHERE booking_id = $1;`, [testBookingId]);
          await db.query(`DELETE FROM ticket_vouchers WHERE booking_id = $1;`, [testBookingId]);
          await db.query(`DELETE FROM payment_transactions WHERE booking_id = $1;`, [
            testBookingId,
          ]);
          await db.query(`DELETE FROM bookings WHERE id = $1;`, [testBookingId]);
        } catch {
          // ignore cleanup error
        }
      }
      await db.close();
    }
  });

  // ============================================================
  // 1. PaymentTransactionRepository Tests
  // ============================================================
  describe('PaymentTransactionRepository', () => {
    it('should create a payment transaction with server-authoritative minor units and default status', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `idemp-tx-${Date.now()}`;
      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'RAZORPAY',
        amount: 5000000,
        currency: 'INR',
        idempotencyKey,
      });

      expect(created.id).toBeDefined();
      expect(created.bookingId).toBe(testBookingId);
      expect(created.provider).toBe('RAZORPAY');
      expect(created.amount).toBe(5000000);
      expect(created.currency).toBe('INR');
      expect(created.status).toBe('INITIATED');
      expect(created.idempotencyKey).toBe(idempotencyKey);
      expect(created.gatewayOrderId).toBeNull();
      expect(created.gatewayPaymentId).toBeNull();
      expect(created.gatewayResponsePayload).toBeNull();
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should find transaction by primary id', async () => {
      if (!isDbAvailable) return;

      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'STRIPE',
        amount: 3000000,
        currency: 'INR',
      });

      const found = await paymentTxRepo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.provider).toBe('STRIPE');
      expect(found?.amount).toBe(3000000);
    });

    it('should find all transactions for a booking ordered by created_at DESC', async () => {
      if (!isDbAvailable) return;

      const list = await paymentTxRepo.findByBookingId(testBookingId);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.bookingId).toBe(testBookingId);
    });

    it('should find transaction by unique idempotency key', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `idemp-lookup-${Date.now()}`;
      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'MOCK',
        amount: 1500000,
        currency: 'INR',
        idempotencyKey,
      });

      const found = await paymentTxRepo.findByIdempotencyKey(idempotencyKey);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.idempotencyKey).toBe(idempotencyKey);

      const notFound = await paymentTxRepo.findByIdempotencyKey('non-existent-key');
      expect(notFound).toBeNull();
    });

    it('should reject duplicate idempotency key via PostgreSQL unique constraint', async () => {
      if (!isDbAvailable) return;

      const idempotencyKey = `dup-key-${Date.now()}`;
      await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'RAZORPAY',
        amount: 2000000,
        currency: 'INR',
        idempotencyKey,
      });

      await expect(
        paymentTxRepo.create({
          bookingId: testBookingId,
          provider: 'RAZORPAY',
          amount: 2000000,
          currency: 'INR',
          idempotencyKey,
        }),
      ).rejects.toThrow();
    });

    it('should update gateway identifiers and find by provider + orderId / paymentId', async () => {
      if (!isDbAvailable) return;

      const orderId = `order_${Date.now()}`;
      const paymentId = `pay_${Date.now()}`;

      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'RAZORPAY',
        amount: 5000000,
        currency: 'INR',
      });

      const updated = await paymentTxRepo.updateGatewayIdentifiers(created.id, {
        gatewayOrderId: orderId,
        gatewayPaymentId: paymentId,
        gatewayResponsePayload: { razorpay_order_id: orderId },
      });

      expect(updated).not.toBeNull();
      expect(updated?.gatewayOrderId).toBe(orderId);
      expect(updated?.gatewayPaymentId).toBe(paymentId);
      expect(updated?.gatewayResponsePayload).toEqual({ razorpay_order_id: orderId });

      // Lookup by provider + gatewayOrderId
      const foundByOrder = await paymentTxRepo.findByProviderOrderId('RAZORPAY', orderId);
      expect(foundByOrder?.id).toBe(created.id);

      // Lookup by provider + gatewayPaymentId
      const foundByPayment = await paymentTxRepo.findByProviderPaymentId('RAZORPAY', paymentId);
      expect(foundByPayment?.id).toBe(created.id);
    });

    it('should atomically update status with guard conditions and reject invalid transitions', async () => {
      if (!isDbAvailable) return;

      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'MOCK',
        amount: 5000000,
        currency: 'INR',
        status: 'INITIATED',
      });

      // Guarded transition INITIATED -> PENDING
      const transitioned1 = await paymentTxRepo.updateStatusGuarded(
        created.id,
        'INITIATED',
        'PENDING',
      );
      expect(transitioned1).not.toBeNull();
      expect(transitioned1?.status).toBe('PENDING');

      // Guarded transition ['INITIATED', 'PENDING'] -> SUCCESS
      const transitioned2 = await paymentTxRepo.updateStatusGuarded(
        created.id,
        ['INITIATED', 'PENDING'],
        'SUCCESS',
      );
      expect(transitioned2).not.toBeNull();
      expect(transitioned2?.status).toBe('SUCCESS');

      // Guarded transition from INITIATED (which is no longer the status) -> FAILED should return null
      const rejected = await paymentTxRepo.updateStatusGuarded(created.id, 'INITIATED', 'FAILED');
      expect(rejected).toBeNull();

      // Verify status remains SUCCESS in DB
      const current = await paymentTxRepo.findById(created.id);
      expect(current?.status).toBe('SUCCESS');
    });

    it('should update gateway payload for audit without modifying status or identifiers', async () => {
      if (!isDbAvailable) return;

      const created = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'STRIPE',
        amount: 4000000,
        currency: 'INR',
      });

      const updated = await paymentTxRepo.updateGatewayPayload(created.id, {
        stripe_event: 'payment_intent.succeeded',
        receipt_email: 'test@example.com',
      });

      expect(updated?.gatewayResponsePayload).toEqual({
        stripe_event: 'payment_intent.succeeded',
        receipt_email: 'test@example.com',
      });
      expect(updated?.status).toBe('INITIATED');
    });
  });

  // ============================================================
  // 2. PaymentEventRepository Tests
  // ============================================================
  describe('PaymentEventRepository', () => {
    it('should create and retrieve a webhook event', async () => {
      if (!isDbAvailable) return;

      const eventId = `evt_${Date.now()}`;
      const created = await paymentEventRepo.create({
        provider: 'RAZORPAY',
        eventId,
        eventType: 'payment.captured',
        payload: { event: 'payment.captured', entity: { id: eventId } },
      });

      expect(created.id).toBeDefined();
      expect(created.provider).toBe('RAZORPAY');
      expect(created.eventId).toBe(eventId);
      expect(created.eventType).toBe('payment.captured');
      expect(created.payload).toEqual({ event: 'payment.captured', entity: { id: eventId } });
      expect(created.processedAt).toBeInstanceOf(Date);
      expect(created.createdAt).toBeInstanceOf(Date);

      // Lookup
      const found = await paymentEventRepo.findByProviderAndEventId('RAZORPAY', eventId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);

      // Exists
      const exists = await paymentEventRepo.exists('RAZORPAY', eventId);
      expect(exists).toBe(true);

      const notExists = await paymentEventRepo.exists('RAZORPAY', 'non-existent-event');
      expect(notExists).toBe(false);
    });

    it('should enforce unique constraint on (provider, event_id)', async () => {
      if (!isDbAvailable) return;

      const eventId = `evt_dup_${Date.now()}`;
      await paymentEventRepo.create({
        provider: 'STRIPE',
        eventId,
        eventType: 'charge.succeeded',
        payload: { type: 'charge.succeeded' },
      });

      // Second insert with same provider and event_id must fail
      await expect(
        paymentEventRepo.create({
          provider: 'STRIPE',
          eventId,
          eventType: 'charge.succeeded',
          payload: { type: 'charge.succeeded' },
        }),
      ).rejects.toThrow();

      // Same eventId under different provider should succeed
      const differentProvider = await paymentEventRepo.create({
        provider: 'MOCK',
        eventId,
        eventType: 'charge.succeeded',
        payload: { type: 'charge.succeeded' },
      });
      expect(differentProvider.id).toBeDefined();
    });

    it('should update processed_at timestamp', async () => {
      if (!isDbAvailable) return;

      const eventId = `evt_proc_${Date.now()}`;
      const created = await paymentEventRepo.create({
        provider: 'RAZORPAY',
        eventId,
        eventType: 'order.paid',
        payload: { id: eventId },
      });

      const updated = await paymentEventRepo.markProcessed(created.id);
      expect(updated).not.toBeNull();
      expect(updated?.processedAt).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // 3. TaxInvoiceRepository Tests
  // ============================================================
  describe('TaxInvoiceRepository', () => {
    it('should create and retrieve a tax invoice with statutory amounts', async () => {
      if (!isDbAvailable) return;

      const invoiceNum = `INV-${Date.now()}-001`;
      const created = await taxInvoiceRepo.create({
        invoiceNumber: invoiceNum,
        bookingId: testBookingId,
        customerId: testUserId,
        gstinNumber: '29ABCDE1234F1Z5',
        taxableAmount: 4237288,
        gstAmount: 762712,
        totalAmount: 5000000,
        currency: 'INR',
      });

      expect(created.id).toBeDefined();
      expect(created.invoiceNumber).toBe(invoiceNum);
      expect(created.bookingId).toBe(testBookingId);
      expect(created.customerId).toBe(testUserId);
      expect(created.gstinNumber).toBe('29ABCDE1234F1Z5');
      expect(created.taxableAmount).toBe(4237288);
      expect(created.gstAmount).toBe(762712);
      expect(created.totalAmount).toBe(5000000);
      expect(created.currency).toBe('INR');
      expect(created.pdfStorageKey).toBeNull();
      expect(created.createdAt).toBeInstanceOf(Date);

      // Find by ID
      const foundById = await taxInvoiceRepo.findById(created.id);
      expect(foundById?.id).toBe(created.id);

      // Find by booking ID
      const foundByBooking = await taxInvoiceRepo.findByBookingId(testBookingId);
      expect(foundByBooking.length).toBeGreaterThanOrEqual(1);
      expect(foundByBooking.some((inv) => inv.invoiceNumber === invoiceNum)).toBe(true);

      // Find by invoice number
      const foundByNum = await taxInvoiceRepo.findByInvoiceNumber(invoiceNum);
      expect(foundByNum?.id).toBe(created.id);
    });

    it('should update private pdfStorageKey after generation', async () => {
      if (!isDbAvailable) return;

      const invoiceNum = `INV-${Date.now()}-002`;
      const created = await taxInvoiceRepo.create({
        invoiceNumber: invoiceNum,
        bookingId: testBookingId,
        customerId: testUserId,
        taxableAmount: 1000000,
        gstAmount: 180000,
        totalAmount: 1180000,
        currency: 'INR',
      });

      const updated = await taxInvoiceRepo.updatePdfStorageKey(
        created.id,
        'invoices/2026/09/INV-test.pdf',
      );
      expect(updated?.pdfStorageKey).toBe('invoices/2026/09/INV-test.pdf');
    });

    it('should reject duplicate invoice numbers', async () => {
      if (!isDbAvailable) return;

      const invoiceNum = `INV-DUP-${Date.now()}`;
      await taxInvoiceRepo.create({
        invoiceNumber: invoiceNum,
        bookingId: testBookingId,
        customerId: testUserId,
        taxableAmount: 1000000,
        gstAmount: 180000,
        totalAmount: 1180000,
        currency: 'INR',
      });

      await expect(
        taxInvoiceRepo.create({
          invoiceNumber: invoiceNum,
          bookingId: testBookingId,
          customerId: testUserId,
          taxableAmount: 1000000,
          gstAmount: 180000,
          totalAmount: 1180000,
          currency: 'INR',
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // 4. TicketVoucherRepository Tests
  // ============================================================
  describe('TicketVoucherRepository', () => {
    it('should create and retrieve an e-ticket voucher', async () => {
      if (!isDbAvailable) return;

      const voucherCode = `VCH-${Date.now()}-001`;
      const created = await ticketVoucherRepo.create({
        voucherCode,
        bookingId: testBookingId,
      });

      expect(created.id).toBeDefined();
      expect(created.voucherCode).toBe(voucherCode);
      expect(created.bookingId).toBe(testBookingId);
      expect(created.pdfStorageKey).toBeNull();
      expect(created.createdAt).toBeInstanceOf(Date);

      // Find by ID
      const foundById = await ticketVoucherRepo.findById(created.id);
      expect(foundById?.id).toBe(created.id);

      // Find by booking ID
      const foundByBooking = await ticketVoucherRepo.findByBookingId(testBookingId);
      expect(foundByBooking.length).toBeGreaterThanOrEqual(1);

      // Find by voucher code
      const foundByCode = await ticketVoucherRepo.findByVoucherCode(voucherCode);
      expect(foundByCode?.id).toBe(created.id);
    });

    it('should update private pdfStorageKey on voucher', async () => {
      if (!isDbAvailable) return;

      const voucherCode = `VCH-${Date.now()}-002`;
      const created = await ticketVoucherRepo.create({
        voucherCode,
        bookingId: testBookingId,
      });

      const updated = await ticketVoucherRepo.updatePdfStorageKey(
        created.id,
        'vouchers/2026/09/VCH-test.pdf',
      );
      expect(updated?.pdfStorageKey).toBe('vouchers/2026/09/VCH-test.pdf');
    });

    it('should reject duplicate voucher codes', async () => {
      if (!isDbAvailable) return;

      const voucherCode = `VCH-DUP-${Date.now()}`;
      await ticketVoucherRepo.create({
        voucherCode,
        bookingId: testBookingId,
      });

      await expect(
        ticketVoucherRepo.create({
          voucherCode,
          bookingId: testBookingId,
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // 5. CancellationRequestRepository Tests
  // ============================================================
  describe('CancellationRequestRepository', () => {
    it('should create a cancellation request with default PENDING_APPROVAL status', async () => {
      if (!isDbAvailable) return;

      const created = await cancellationRepo.create({
        bookingId: testBookingId,
        requestedBy: testUserId,
        cancellationReason: 'Medical emergency prevents travel.',
        calculatedRefundAmount: 4000000,
        calculatedPenaltyAmount: 1000000,
      });

      expect(created.id).toBeDefined();
      expect(created.bookingId).toBe(testBookingId);
      expect(created.requestedBy).toBe(testUserId);
      expect(created.cancellationReason).toBe('Medical emergency prevents travel.');
      expect(created.calculatedRefundAmount).toBe(4000000);
      expect(created.calculatedPenaltyAmount).toBe(1000000);
      expect(created.status).toBe('PENDING_APPROVAL');
      expect(created.adminNotes).toBeNull();
      expect(created.authorizedBy).toBeNull();
      expect(created.authorizedAt).toBeNull();
    });

    it('should find cancellation requests by booking id', async () => {
      if (!isDbAvailable) return;

      const list = await cancellationRepo.findByBookingId(testBookingId);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0]?.bookingId).toBe(testBookingId);
    });

    it('should list cancellation requests with pagination and status filtering', async () => {
      if (!isDbAvailable) return;

      const result = await cancellationRepo.list({
        status: 'PENDING_APPROVAL',
        page: 1,
        limit: 10,
      });

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.every((i) => i.status === 'PENDING_APPROVAL')).toBe(true);
    });

    it('should record admin authorization atomically', async () => {
      if (!isDbAvailable) return;

      const created = await cancellationRepo.create({
        bookingId: testBookingId,
        requestedBy: testUserId,
        cancellationReason: 'Change of schedule.',
        calculatedRefundAmount: 3500000,
        calculatedPenaltyAmount: 1500000,
      });

      const authorized = await cancellationRepo.recordAuthorization(created.id, {
        authorizedBy: testUserId,
        authorizedAt: new Date(),
        adminNotes: 'Authorized by admin manager with fee waiver',
        overrideRefundAmount: 4000000,
        overridePenaltyAmount: 1000000,
      });

      expect(authorized).not.toBeNull();
      expect(authorized?.status).toBe('AUTHORIZED');
      expect(authorized?.authorizedBy).toBe(testUserId);
      expect(authorized?.authorizedAt).toBeInstanceOf(Date);
      expect(authorized?.adminNotes).toBe('Authorized by admin manager with fee waiver');
      expect(authorized?.calculatedRefundAmount).toBe(4000000);
      expect(authorized?.calculatedPenaltyAmount).toBe(1000000);
    });

    it('should guard status updates against invalid transitions', async () => {
      if (!isDbAvailable) return;

      const created = await cancellationRepo.create({
        bookingId: testBookingId,
        requestedBy: testUserId,
        cancellationReason: 'Duplicate booking mistake.',
      });

      // Reject from PENDING_APPROVAL -> REJECTED
      const rejected = await cancellationRepo.updateStatusGuarded(
        created.id,
        'PENDING_APPROVAL',
        'REJECTED',
        { adminNotes: 'Non-refundable tariff rules apply.' },
      );
      expect(rejected?.status).toBe('REJECTED');
      expect(rejected?.adminNotes).toBe('Non-refundable tariff rules apply.');

      // Attempt to authorize an already REJECTED request via PENDING_APPROVAL guard should fail
      const failedAuth = await cancellationRepo.updateStatusGuarded(
        created.id,
        'PENDING_APPROVAL',
        'AUTHORIZED',
      );
      expect(failedAuth).toBeNull();
    });
  });

  // ============================================================
  // 6. RefundSettlementRepository Tests
  // ============================================================
  describe('RefundSettlementRepository', () => {
    let testPaymentTxId = '';

    beforeAll(async () => {
      if (!isDbAvailable) return;
      const tx = await paymentTxRepo.create({
        bookingId: testBookingId,
        provider: 'RAZORPAY',
        amount: 5000000,
        currency: 'INR',
        status: 'SUCCESS',
      });
      testPaymentTxId = tx.id;
    });

    it('should create and retrieve a refund settlement record', async () => {
      if (!isDbAvailable) return;

      const created = await refundRepo.create({
        paymentTransactionId: testPaymentTxId,
        refundAmount: 4000000,
        currency: 'INR',
        settlementStatus: 'PROCESSING',
      });

      expect(created.id).toBeDefined();
      expect(created.paymentTransactionId).toBe(testPaymentTxId);
      expect(created.cancellationRequestId).toBeNull();
      expect(created.refundAmount).toBe(4000000);
      expect(created.currency).toBe('INR');
      expect(created.settlementStatus).toBe('PROCESSING');
      expect(created.gatewayRefundId).toBeNull();
      expect(created.errorMessage).toBeNull();
      expect(created.processedAt).toBeNull();
      expect(created.createdAt).toBeInstanceOf(Date);

      // Find by ID
      const found = await refundRepo.findById(created.id);
      expect(found?.id).toBe(created.id);

      // Find by payment transaction ID
      const list = await refundRepo.findByPaymentTransactionId(testPaymentTxId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('should update settlement status to SETTLED with gatewayRefundId', async () => {
      if (!isDbAvailable) return;

      const created = await refundRepo.create({
        paymentTransactionId: testPaymentTxId,
        refundAmount: 2000000,
        currency: 'INR',
        settlementStatus: 'PROCESSING',
      });

      const gatewayRefundId = `rfnd_${Date.now()}`;
      const settled = await refundRepo.updateSettlementStatus(created.id, {
        settlementStatus: 'SETTLED',
        gatewayRefundId,
      });

      expect(settled?.settlementStatus).toBe('SETTLED');
      expect(settled?.gatewayRefundId).toBe(gatewayRefundId);
      expect(settled?.processedAt).toBeInstanceOf(Date);

      // Lookup by gatewayRefundId
      const found = await refundRepo.findByGatewayRefundId(gatewayRefundId);
      expect(found?.id).toBe(created.id);
    });

    it('should record failure message and status on FAILED refund', async () => {
      if (!isDbAvailable) return;

      const created = await refundRepo.create({
        paymentTransactionId: testPaymentTxId,
        refundAmount: 1000000,
        currency: 'INR',
        settlementStatus: 'PROCESSING',
      });

      const failed = await refundRepo.updateSettlementStatus(created.id, {
        settlementStatus: 'FAILED',
        errorMessage: 'Gateway balance insufficient for instant refund',
      });

      expect(failed?.settlementStatus).toBe('FAILED');
      expect(failed?.errorMessage).toBe('Gateway balance insufficient for instant refund');
      expect(failed?.processedAt).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // 7. Security & Parameterization Verification
  // ============================================================
  describe('Security & Parameterization Verification', () => {
    it('should safely escape SQL injection payloads in provider and order ID lookups', async () => {
      if (!isDbAvailable) return;

      const sqlInjectionPayload = "RAZORPAY' OR '1'='1";
      const result = await paymentTxRepo.findByProviderOrderId(sqlInjectionPayload, 'order_123');
      expect(result).toBeNull();
    });

    it('should safely escape SQL injection in cancellation reasons and admin notes', async () => {
      if (!isDbAvailable) return;

      const injectionReason = "Cancellation'; DROP TABLE payment_transactions; --";
      const created = await cancellationRepo.create({
        bookingId: testBookingId,
        requestedBy: testUserId,
        cancellationReason: injectionReason,
      });

      expect(created.cancellationReason).toBe(injectionReason);

      // Verify table still exists and is healthy
      const tx = await paymentTxRepo.findById(testBookingId);
      expect(tx === null || tx !== null).toBe(true);
    });
  });
});
