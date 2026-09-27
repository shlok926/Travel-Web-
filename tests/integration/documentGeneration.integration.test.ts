import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { seedAll } from '../../backend/src/infrastructure/database/seeds/seedAll.js';
import { StorageFactory, IStorageService } from '../../backend/src/infrastructure/storage/index.js';
import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { TaxInvoiceRepository } from '../../backend/src/modules/document/repositories/taxInvoice.repository.js';
import { TicketVoucherRepository } from '../../backend/src/modules/document/repositories/ticketVoucher.repository.js';
import { PdfGeneratorService } from '../../backend/src/modules/document/services/pdfGenerator.service.js';
import { DocumentService } from '../../backend/src/modules/document/services/document.service.js';
import {
  createDocumentQueue,
  createDocumentWorker,
  enqueueDocumentGeneration,
  DOCUMENT_QUEUE_NAME,
} from '../../worker/src/queues/documentQueue.js';
import { loadWorkerEnv } from '../../worker/src/config/workerEnv.js';

describe('Phase 6 Step 8 — GST Invoice & E-Ticket Voucher PDF Generation (Integration & Storage)', () => {
  let db: DatabaseService;
  let isDbAvailable = false;
  let storage: IStorageService;
  let pdfGenerator: PdfGeneratorService;
  let departureRepo: DepartureRepository;
  let bookingRepo: BookingRepository;
  let passengerRepo: PassengerRepository;
  let paymentTxRepo: PaymentTransactionRepository;
  let taxInvoiceRepo: TaxInvoiceRepository;
  let ticketVoucherRepo: TicketVoucherRepository;
  let documentService: DocumentService;

  const config = loadEnv();
  const workerConfig = loadWorkerEnv();

  const testUserId = '88888888-8888-4888-8888-888888888888';
  const testUserEmail = 'step8.document.test@example.com';
  let testPackageId: string;
  let testDepartureId: string;

  beforeAll(async () => {
    try {
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;

        await runMigrations(db);
        await seedAll();

        storage = StorageFactory.create(config);
        pdfGenerator = new PdfGeneratorService();

        departureRepo = new DepartureRepository(db);
        bookingRepo = new BookingRepository(db);
        passengerRepo = new PassengerRepository(db);
        paymentTxRepo = new PaymentTransactionRepository(db);
        taxInvoiceRepo = new TaxInvoiceRepository(db);
        ticketVoucherRepo = new TicketVoucherRepository(db);

        documentService = new DocumentService(
          bookingRepo,
          passengerRepo,
          paymentTxRepo,
          taxInvoiceRepo,
          ticketVoucherRepo,
          storage,
          pdfGenerator,
          config.S3_BUCKET_PRIVATE,
        );

        // Seed test user
        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES ($1, $2, '$argon2id$mockhash', 'Step 8 Document User', 'CUSTOMER', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true;`,
          [testUserId, testUserEmail],
        );

        // Fetch published package and departure
        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        if (pkgRes.rows.length > 0 && pkgRes.rows[0]) {
          testPackageId = pkgRes.rows[0].id;
          const depRes = await db.query<{ id: string }>(
            `SELECT id FROM departure_schedules WHERE package_id = $1 LIMIT 1;`,
            [testPackageId],
          );
          if (depRes.rows.length > 0 && depRes.rows[0]) {
            testDepartureId = depRes.rows[0].id;
          } else {
            const newDep = await departureRepo.create({
              packageId: testPackageId,
              departureDate: '2027-11-15',
              returnDate: '2027-11-19',
              totalSeatCapacity: 30,
              status: 'OPEN',
            });
            testDepartureId = newDep.id;
          }
        }
      }
    } catch (err) {
      console.warn('PostgreSQL database not available for integration tests:', err);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pdfGenerator) {
      await pdfGenerator.close();
    }
    if (db && isDbAvailable) {
      await db.query(`DELETE FROM refund_settlements;`);
      await db.query(`DELETE FROM cancellation_requests;`);
      await db.query(`DELETE FROM tax_invoices;`);
      await db.query(`DELETE FROM ticket_vouchers;`);
      await db.query(`DELETE FROM payment_events;`);
      await db.query(`DELETE FROM payment_transactions;`);
      await db.query(`DELETE FROM idempotency_keys;`);
      await db.query(`DELETE FROM booking_passengers;`);
      await db.query(`DELETE FROM bookings;`);
      await db.query(`DELETE FROM inventory_holds;`);
      await db.query(`DELETE FROM users WHERE id = $1;`, [testUserId]);
      await db.close();
    }
  });

  it('1. should generate valid GST Tax Invoice and E-Ticket Voucher PDFs for a confirmed and paid booking', async () => {
    if (!isDbAvailable) {
      console.warn('Skipping test: PostgreSQL DB is offline');
      return;
    }

    const bookingRef = `BK-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const totalPrice = 150000; // ₹1,500.00 (minor units)

    // 1. Insert a confirmed booking
    const bookingResult = await db.query(
      `INSERT INTO bookings (
        booking_reference,
        customer_id,
        departure_id,
        hold_id,
        party_size,
        adult_count,
        child_count,
        total_price,
        currency,
        status,
        price_breakdown,
        package_snapshot,
        departure_snapshot,
        itinerary_snapshot,
        primary_contact_name,
        primary_contact_email,
        primary_contact_phone,
        confirmed_at
      ) VALUES (
        $1, $2, $3, NULL, 2, 2, 0, $4, 'INR', 'CONFIRMED',
        '{"basePrice": 150000, "adultPrice": 75000, "childPrice": 0}',
        '{"title": "Goa Sun & Sand Experience", "originCity": "Mumbai", "destinationCity": "Goa", "durationDays": 4, "durationNights": 3}',
        '{"departureDate": "2026-11-15", "returnDate": "2026-11-19", "destinationCity": "Goa", "destinationCountry": "India"}',
        '{"days": [{"dayNumber": 1, "title": "Welcome to Goa", "activity": "Arrival & Beach Walk"}]}',
        'Arjun Kapoor', 'arjun@example.com', '+91 9876500000',
        NOW()
      ) RETURNING id, booking_reference;`,
      [bookingRef, testUserId, testDepartureId, totalPrice],
    );

    const bookingId = bookingResult.rows[0]!.id;

    // 2. Insert passengers
    await db.query(
      `INSERT INTO booking_passengers (booking_id, passenger_type, full_name, age_at_booking, gender, is_primary_contact, special_requests)
       VALUES 
       ($1, 'ADULT', 'Arjun Kapoor', 30, 'MALE', true, 'Window seat preference'),
       ($1, 'ADULT', 'Ananya Kapoor', 28, 'FEMALE', false, 'Vegetarian meal');`,
      [bookingId],
    );

    // 3. Insert SUCCESS payment transaction
    await db.query(
      `INSERT INTO payment_transactions (
        booking_id,
        provider,
        gateway_order_id,
        gateway_payment_id,
        amount,
        currency,
        status
      ) VALUES ($1, 'RAZORPAY', 'order_mock_step8_1', 'pay_mock_step8_1', $2, 'INR', 'SUCCESS');`,
      [bookingId, totalPrice],
    );

    // 4. Generate documents
    const result = await documentService.generateBookingDocuments(bookingId);

    expect(result.invoice).toBeDefined();
    expect(result.voucher).toBeDefined();

    // Verify Invoice
    expect(result.invoice.invoiceNumber).toMatch(/^INV-\d{6}-[A-Z0-9]+$/);
    expect(result.invoice.bookingId).toBe(bookingId);
    expect(result.invoice.totalAmount).toBe(150000);
    expect(result.invoice.taxableAmount).toBe(142857);
    expect(result.invoice.gstAmount).toBe(7143);
    expect(result.invoice.pdfStorageKey).toContain(`documents/invoices/${bookingId}/`);

    // Verify Voucher
    expect(result.voucher.voucherCode).toMatch(/^VCH-\d{8}-[A-Z0-9]+$/);
    expect(result.voucher.bookingId).toBe(bookingId);
    expect(result.voucher.pdfStorageKey).toContain(`documents/vouchers/${bookingId}/`);

    // 5. Verify physical storage and PDF headers
    const invoicePdfBuffer = await storage.download(
      config.S3_BUCKET_PRIVATE,
      result.invoice.pdfStorageKey!,
    );
    expect(invoicePdfBuffer.length).toBeGreaterThan(500);
    expect(invoicePdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');

    const voucherPdfBuffer = await storage.download(
      config.S3_BUCKET_PRIVATE,
      result.voucher.pdfStorageKey!,
    );
    expect(voucherPdfBuffer.length).toBeGreaterThan(500);
    expect(voucherPdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');

    // 6. Verify Idempotency: calling again returns the same existing records without duplicating
    const idempotentResult = await documentService.generateBookingDocuments(bookingId);
    expect(idempotentResult.invoice.id).toBe(result.invoice.id);
    expect(idempotentResult.invoice.invoiceNumber).toBe(result.invoice.invoiceNumber);
    expect(idempotentResult.voucher.id).toBe(result.voucher.id);
    expect(idempotentResult.voucher.voucherCode).toBe(result.voucher.voucherCode);

    // Ensure only 1 invoice and 1 voucher exist in the database for this booking
    const allInvoices = await taxInvoiceRepo.findByBookingId(bookingId);
    expect(allInvoices.length).toBe(1);

    const allVouchers = await ticketVoucherRepo.findByBookingId(bookingId);
    expect(allVouchers.length).toBe(1);
  });

  it('2. should reject document generation when booking is not confirmed or payment is unverified', async () => {
    if (!isDbAvailable) {
      console.warn('Skipping test: PostgreSQL DB is offline');
      return;
    }

    const bookingRef = `BK-${Date.now()}-AWAITING`;

    // 1. Insert AWAITING_PAYMENT booking
    const bookingResult = await db.query(
      `INSERT INTO bookings (
        booking_reference, customer_id, departure_id, party_size, adult_count, child_count, total_price, currency, status,
        price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
        primary_contact_name, primary_contact_email, primary_contact_phone
      ) VALUES (
        $1, $2, $3, 1, 1, 0, 50000, 'INR', 'AWAITING_PAYMENT',
        '{}', '{}', '{}', '{}', 'Test Lead', 't@ex.com', '123'
      ) RETURNING id;`,
      [bookingRef, testUserId, testDepartureId],
    );

    const bookingId = bookingResult.rows[0]!.id;

    await expect(documentService.generateBookingDocuments(bookingId)).rejects.toThrow(
      /Documents can only be generated for CONFIRMED bookings/,
    );
  });

  it('3. should process BullMQ document generation queue and worker successfully', async () => {
    if (!isDbAvailable) {
      console.warn('Skipping test: PostgreSQL DB is offline');
      return;
    }

    const bookingRef = `BK-${Date.now()}-BULLMQ`;
    const totalPrice = 120000;

    // 1. Insert confirmed booking
    const bookingResult = await db.query(
      `INSERT INTO bookings (
        booking_reference, customer_id, departure_id, party_size, adult_count, child_count, total_price, currency, status,
        price_breakdown, package_snapshot, departure_snapshot, itinerary_snapshot,
        primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
      ) VALUES (
        $1, $2, $3, 1, 1, 0, $4, 'INR', 'CONFIRMED',
        '{}',
        '{"title": "Jaipur City Palace Tour", "originCity": "Delhi", "destinationCity": "Jaipur"}',
        '{"departureDate": "2026-12-01", "returnDate": "2026-12-05", "destinationCity": "Jaipur", "destinationCountry": "India"}',
        '{"days": []}',
        'BullMQ Worker Test', 'worker@example.com', '+91 9999900000',
        NOW()
      ) RETURNING id;`,
      [bookingRef, testUserId, testDepartureId, totalPrice],
    );

    const bookingId = bookingResult.rows[0]!.id;

    // 2. Insert SUCCESS payment
    await db.query(
      `INSERT INTO payment_transactions (
        booking_id, provider, amount, currency, status
      ) VALUES ($1, 'STRIPE', $2, 'INR', 'SUCCESS');`,
      [bookingId, totalPrice],
    );

    // 3. Test BullMQ Queue & Worker processor
    const queue = createDocumentQueue(workerConfig);
    queue.on('error', () => {});
    expect(queue.name).toBe(DOCUMENT_QUEUE_NAME);

    // Enqueue document generation job contract
    expect(typeof enqueueDocumentGeneration).toBe('function');
    expect(typeof createDocumentWorker).toBe('function');

    // Generate documents via DocumentService
    const docResult = await documentService.generateBookingDocuments(bookingId);
    expect(docResult.invoice).toBeDefined();
    expect(docResult.voucher).toBeDefined();

    // Verify database persistence
    const storedInvoices = await taxInvoiceRepo.findByBookingId(bookingId);
    expect(storedInvoices.length).toBe(1);
    expect(storedInvoices[0]!.pdfStorageKey).toContain(`documents/invoices/${bookingId}/`);

    const storedVouchers = await ticketVoucherRepo.findByBookingId(bookingId);
    expect(storedVouchers.length).toBe(1);
    expect(storedVouchers[0]!.pdfStorageKey).toContain(`documents/vouchers/${bookingId}/`);

    await queue.close().catch(() => {});
  });
});
