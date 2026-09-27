import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { TaxInvoiceRepository } from '../../backend/src/modules/document/repositories/taxInvoice.repository.js';
import { TicketVoucherRepository } from '../../backend/src/modules/document/repositories/ticketVoucher.repository.js';
import { documentDownloadResponseSchema } from '../../shared/src/index.js';

describe('Phase 6 Step 9 — Document Download Authorization & Presigned URLs (Routes & Security)', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let customer1Token = '';
  let customer1Id = '';
  let customer2Token = '';
  let customer2Id = '';
  let adminToken = '';

  let taxInvoiceRepo: TaxInvoiceRepository;
  let ticketVoucherRepo: TicketVoucherRepository;

  let confirmedBookingRef1 = '';
  let confirmedBookingId1 = '';
  let pendingBookingRef = '';
  let pendingBookingId = '';

  beforeAll(async () => {
    try {
      const config = loadEnv();
      const appInstance = await createApp({ config });
      app = appInstance.app;
      db = appInstance.db;

      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        await seedAll();

        taxInvoiceRepo = new TaxInvoiceRepository(db);
        ticketVoucherRepo = new TicketVoucherRepository(db);

        customer1Id = '33333333-3333-3333-3333-333333333333';
        const customer1Email = `doc_cust1_${Date.now()}@example.com`;
        customer2Id = '44444444-4444-4444-4444-444444444444';
        const customer2Email = `doc_cust2_${Date.now()}@example.com`;
        const adminId = '55555555-5555-5555-5555-555555555555';
        const adminEmail = `doc_admin_${Date.now()}@example.com`;

        // Provision users in DB
        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES
             ($1, $2, '$argon2id$mockhash', 'Carol Owner', 'CUSTOMER', true),
             ($3, $4, '$argon2id$mockhash', 'Dave Attacker', 'CUSTOMER', true),
             ($5, $6, '$argon2id$mockhash', 'Admin User', 'ADMIN', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;`,
          [customer1Id, customer1Email, customer2Id, customer2Email, adminId, adminEmail],
        );

        const { JwtSecurity } = await import('../../shared/src/security/jwt.js');
        customer1Token = JwtSecurity.sign(
          { userId: customer1Id, email: customer1Email, role: 'CUSTOMER', sessionId: 's1' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );
        customer2Token = JwtSecurity.sign(
          { userId: customer2Id, email: customer2Email, role: 'CUSTOMER', sessionId: 's2' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );
        adminToken = JwtSecurity.sign(
          { userId: adminId, email: adminEmail, role: 'ADMIN', sessionId: 's3' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );

        // 4. Provision a confirmed & paid booking with generated documents for Customer 1
        const departureRepo = new DepartureRepository(db);
        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = true LIMIT 1;`,
        );
        const pkgId = pkgRes.rows[0]!.id;
        let depId = '';
        const depRes = await db.query<{ id: string }>(
          `SELECT id FROM departure_schedules WHERE package_id = $1 LIMIT 1;`,
          [pkgId],
        );
        if (depRes.rows.length > 0 && depRes.rows[0]) {
          depId = depRes.rows[0].id;
        } else {
          const newDep = await departureRepo.create({
            packageId: pkgId,
            departureDate: '2027-11-20',
            returnDate: '2027-11-25',
            totalSeatCapacity: 30,
            status: 'OPEN',
          });
          depId = newDep.id;
        }

        const ref1 = `BK-DOC-${Date.now().toString().slice(-6)}-1`;
        const booking1Res = await db.query<{ id: string; booking_reference: string }>(
          `INSERT INTO bookings (
            booking_reference, customer_id, departure_id, party_size, adult_count, child_count,
            total_price, currency, status, price_breakdown, package_snapshot, departure_snapshot,
            itinerary_snapshot, primary_contact_name, primary_contact_email, primary_contact_phone, confirmed_at
          ) VALUES (
            $1, $2, $3, 2, 2, 0, 200000, 'INR', 'CONFIRMED',
            '{"basePrice": 200000, "adultPrice": 100000, "childPrice": 0}',
            '{"title": "Goa Experience", "destinationCity": "Goa"}',
            '{"departureDate": "2027-11-20", "returnDate": "2027-11-25"}',
            '{"days": []}',
            'Carol Owner', $4, '+919876543210', NOW()
          ) RETURNING id, booking_reference;`,
          [ref1, customer1Id, depId, customer1Email],
        );
        confirmedBookingRef1 = booking1Res.rows[0]!.booking_reference;
        confirmedBookingId1 = booking1Res.rows[0]!.id;

        // Generate documents for Customer 1's booking
        await taxInvoiceRepo.create({
          invoiceNumber: `INV-202611-${Date.now().toString().slice(-4)}`,
          bookingId: confirmedBookingId1,
          customerId: customer1Id,
          taxableAmount: 190476,
          gstAmount: 9524,
          totalAmount: 200000,
          currency: 'INR',
          pdfStorageKey: `documents/invoices/${confirmedBookingId1}/invoice.pdf`,
        });

        await ticketVoucherRepo.create({
          voucherCode: `VCH-20261115-${Date.now().toString().slice(-4)}`,
          bookingId: confirmedBookingId1,
          pdfStorageKey: `documents/vouchers/${confirmedBookingId1}/voucher.pdf`,
        });
        const storage = appInstance.storage;
        await storage.upload(Buffer.from('%PDF-1.4 Mock Invoice Content'), {
          bucket: 'travel-documents-private',
          key: `documents/invoices/${confirmedBookingId1}/invoice.pdf`,
          contentType: 'application/pdf',
        });
        await storage.upload(Buffer.from('%PDF-1.4 Mock Voucher Content'), {
          bucket: 'travel-documents-private',
          key: `documents/vouchers/${confirmedBookingId1}/voucher.pdf`,
          contentType: 'application/pdf',
        });

        // 5. Provision a pending booking for Customer 1 without documents
        const ref2 = `BK-DOC-${Date.now().toString().slice(-6)}-2`;
        const booking2Res = await db.query<{ id: string; booking_reference: string }>(
          `INSERT INTO bookings (
            booking_reference, customer_id, departure_id, party_size, adult_count, child_count,
            total_price, currency, status, price_breakdown, package_snapshot, departure_snapshot,
            itinerary_snapshot, primary_contact_name, primary_contact_email, primary_contact_phone
          ) VALUES (
            $1, $2, $3, 1, 1, 0, 100000, 'INR', 'AWAITING_PAYMENT',
            '{"basePrice": 100000, "adultPrice": 100000, "childPrice": 0}',
            '{"title": "Goa Experience", "destinationCity": "Goa"}',
            '{"departureDate": "2027-11-20", "returnDate": "2027-11-25"}',
            '{"days": []}',
            'Carol Owner', $4, '+919876543210'
          ) RETURNING id, booking_reference;`,
          [ref2, customer1Id, depId, customer1Email],
        );
        pendingBookingRef = booking2Res.rows[0]!.booking_reference;
        pendingBookingId = booking2Res.rows[0]!.id;
      }
    } catch (err) {
      console.warn('DB not reachable for document download routes integration tests', err);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      try {
        if (confirmedBookingId1) {
          await db.query(
            `DELETE FROM refund_settlements WHERE cancellation_request_id IN (SELECT id FROM cancellation_requests WHERE booking_id = $1)`,
            [confirmedBookingId1],
          );
          await db.query(`DELETE FROM cancellation_requests WHERE booking_id = $1`, [
            confirmedBookingId1,
          ]);
          await db.query(`DELETE FROM tax_invoices WHERE booking_id = $1`, [confirmedBookingId1]);
          await db.query(`DELETE FROM ticket_vouchers WHERE booking_id = $1`, [
            confirmedBookingId1,
          ]);
          await db.query(`DELETE FROM bookings WHERE id = $1`, [confirmedBookingId1]);
        }
        if (pendingBookingId) {
          await db.query(`DELETE FROM cancellation_requests WHERE booking_id = $1`, [
            pendingBookingId,
          ]);
          await db.query(`DELETE FROM bookings WHERE id = $1`, [pendingBookingId]);
        }
        if (customer1Id) {
          await db.query(`DELETE FROM users WHERE id = $1`, [customer1Id]);
        }
        if (customer2Id) {
          await db.query(`DELETE FROM users WHERE id = $1`, [customer2Id]);
        }
      } catch (err) {
        console.warn('Cleanup error', err);
      }
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Invoice Download Endpoint (/api/v1/documents/invoice/:bookingReference/download)', () => {
    it('should return 200 and valid DocumentDownloadResponse for authenticated owner', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      const parsed = documentDownloadResponseSchema.safeParse(body.data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.documentType).toBe('INVOICE');
        expect(parsed.data.bookingReference).toBe(confirmedBookingRef1);
        expect(parsed.data.downloadUrl).toContain('/api/v1/storage/');
        expect(new Date(parsed.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should enforce IDOR protection: return 404 BOOKING_NOT_FOUND when non-owner requests invoice', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer2Token}`, // Attacker/other customer
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should allow ADMIN to download invoice for any customer booking', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.documentType).toBe('INVOICE');
      expect(body.data.bookingReference).toBe(confirmedBookingRef1);
    });

    it('should return 401 UNAUTHORIZED when unauthenticated request attempts download', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 DOCUMENT_NOT_FOUND when booking exists but invoice is not yet generated', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${pendingBookingRef}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('should return 400 VALIDATION_ERROR on malformed booking reference', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/%20%20/download`, // whitespace
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. Voucher Download Endpoint (/api/v1/documents/voucher/:bookingReference/download)', () => {
    it('should return 200 and valid DocumentDownloadResponse for authenticated owner', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/voucher/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      const parsed = documentDownloadResponseSchema.safeParse(body.data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.documentType).toBe('VOUCHER');
        expect(parsed.data.bookingReference).toBe(confirmedBookingRef1);
        expect(parsed.data.downloadUrl).toContain('/api/v1/storage/');
        expect(new Date(parsed.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should enforce IDOR protection: return 404 BOOKING_NOT_FOUND when non-owner requests voucher', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/voucher/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer2Token}`, // Attacker/other customer
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should allow ADMIN to download voucher for any customer booking', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/voucher/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.documentType).toBe('VOUCHER');
      expect(body.data.bookingReference).toBe(confirmedBookingRef1);
    });

    it('should return 401 UNAUTHORIZED when unauthenticated request attempts voucher download', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/voucher/${confirmedBookingRef1}/download`,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 DOCUMENT_NOT_FOUND when booking exists but voucher is not yet generated', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/voucher/${pendingBookingRef}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('DOCUMENT_NOT_FOUND');
    });
  });

  describe('3. Repeated Downloads & Anti-Tampering Security', () => {
    it('should allow repeated downloads without side effects', async () => {
      if (!isDbAvailable) return;

      const res1 = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
    });

    it('should ignore client-supplied query parameters attempting to inject customerId or storageKey', async () => {
      if (!isDbAvailable) return;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download?customerId=${customer2Id}&storageKey=evil/path.pdf`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.bookingReference).toBe(confirmedBookingRef1);
      expect(body.data.downloadUrl).not.toContain('evil/path.pdf');
    });
  });

  describe('4. Local Storage Signed URL Serving & Expiration Enforcement', () => {
    it('A. should successfully serve the document file using a valid, active signed URL', async () => {
      if (!isDbAvailable) return;

      // 1. Obtain signed URL as customer 1
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/invoice/${confirmedBookingRef1}/download`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const downloadUrl = body.data.downloadUrl;
      expect(downloadUrl).toContain('/api/v1/storage/');

      const parsedUrl = new URL(downloadUrl);
      const storagePath = `${parsedUrl.pathname}${parsedUrl.search}`;

      // 2. Fetch the file using the signed storage path
      const fileRes = await app.inject({
        method: 'GET',
        url: storagePath,
      });

      expect(fileRes.statusCode).toBe(200);
      expect(fileRes.headers['content-type']).toContain('application/pdf');
      expect(fileRes.payload).toContain('%PDF-1.4 Mock Invoice Content');
    });

    it('B. should reject access with 403 when download URL has expired', async () => {
      if (!isDbAvailable) return;

      const pastTimestamp = Math.floor(Date.now() / 1000) - 100;
      const invalidExpiredPath = `/api/v1/storage/travel-documents-private/documents/invoices/${confirmedBookingId1}/invoice.pdf?expires=${pastTimestamp}&signature=mocksignature`;

      const res = await app.inject({
        method: 'GET',
        url: invalidExpiredPath,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('ACCESS_FORBIDDEN');
    });

    it('C. should reject access with 403 when signature is tampered or invalid', async () => {
      if (!isDbAvailable) return;

      const futureTimestamp = Math.floor(Date.now() / 1000) + 900;
      const tamperedPath = `/api/v1/storage/travel-documents-private/documents/invoices/${confirmedBookingId1}/invoice.pdf?expires=${futureTimestamp}&signature=deadbeef_forged_signature`;

      const res = await app.inject({
        method: 'GET',
        url: tamperedPath,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('ACCESS_FORBIDDEN');
    });

    it('D. should reject access with 403 when expires or signature parameters are missing', async () => {
      if (!isDbAvailable) return;

      const unsignedPath = `/api/v1/storage/travel-documents-private/documents/invoices/${confirmedBookingId1}/invoice.pdf`;

      const res = await app.inject({
        method: 'GET',
        url: unsignedPath,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('ACCESS_FORBIDDEN');
    });

    it('E. should reject path traversal attempts through storage endpoint', async () => {
      if (!isDbAvailable) return;

      const traversalPath = `/api/v1/storage/travel-documents-private/..%2F..%2Fetc%2Fpasswd?expires=9999999999&signature=invalidsig`;

      const res = await app.inject({
        method: 'GET',
        url: traversalPath,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
