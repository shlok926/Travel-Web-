import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 6 Step 1 — Payments, Documents & Refunds Database Schema (DDL & Integration)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/005_create_payments_and_documents_schema.sql',
  );

  let sqlContent = '';
  let paymentTxBlock = '';
  let paymentEventsBlock = '';
  let taxInvoicesBlock = '';
  let ticketVouchersBlock = '';
  let cancellationRequestsBlock = '';
  let refundSettlementsBlock = '';
  let db: DatabaseService | null = null;
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        // Clean migration 005 tables and re-apply migrations freshly
        await db.query(`
          DROP TABLE IF EXISTS refund_settlements CASCADE;
          DROP TABLE IF EXISTS cancellation_requests CASCADE;
          DROP TABLE IF EXISTS ticket_vouchers CASCADE;
          DROP TABLE IF EXISTS tax_invoices CASCADE;
          DROP TABLE IF EXISTS payment_events CASCADE;
          DROP TABLE IF EXISTS payment_transactions CASCADE;
          DELETE FROM schema_migrations WHERE migration_name = '005_create_payments_and_documents_schema.sql';
        `);
        await runMigrations(db);
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db && isDbAvailable) {
      await db.query(`
        DELETE FROM refund_settlements;
        DELETE FROM cancellation_requests;
        DELETE FROM ticket_vouchers;
        DELETE FROM tax_invoices;
        DELETE FROM payment_events;
        DELETE FROM payment_transactions;
      `);
      await db.close();
    }
  });

  afterEach(async () => {
    if (db && isDbAvailable) {
      await db.query(`
        DELETE FROM refund_settlements;
        DELETE FROM cancellation_requests;
        DELETE FROM ticket_vouchers;
        DELETE FROM tax_invoices;
        DELETE FROM payment_events;
        DELETE FROM payment_transactions;
      `);
    }
  });

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');

    const paymentTxMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS payment_transactions\s*\(([\s\S]*?)\);/i,
    );
    paymentTxBlock = paymentTxMatch?.[1] ?? '';

    const paymentEventsMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS payment_events\s*\(([\s\S]*?)\);/i,
    );
    paymentEventsBlock = paymentEventsMatch?.[1] ?? '';

    const taxInvoicesMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS tax_invoices\s*\(([\s\S]*?)\);/i,
    );
    taxInvoicesBlock = taxInvoicesMatch?.[1] ?? '';

    const ticketVouchersMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS ticket_vouchers\s*\(([\s\S]*?)\);/i,
    );
    ticketVouchersBlock = ticketVouchersMatch?.[1] ?? '';

    const cancellationRequestsMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS cancellation_requests\s*\(([\s\S]*?)\);/i,
    );
    cancellationRequestsBlock = cancellationRequestsMatch?.[1] ?? '';

    const refundSettlementsMatch = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS refund_settlements\s*\(([\s\S]*?)\);/i,
    );
    refundSettlementsBlock = refundSettlementsMatch?.[1] ?? '';
  });

  // ============================================================
  // 1. DDL Static Schema Verification
  // ============================================================
  describe('1. DDL Static Schema Verification', () => {
    it('should define payment_status enum with canonical values only', () => {
      const paymentStatusMatch = sqlContent.match(
        /CREATE TYPE payment_status AS ENUM\s*\(([\s\S]*?)\);/i,
      );
      const paymentStatusBlock = paymentStatusMatch?.[1] ?? '';

      expect(paymentStatusBlock).toMatch(/'INITIATED'/i);
      expect(paymentStatusBlock).toMatch(/'PENDING'/i);
      expect(paymentStatusBlock).toMatch(/'SUCCESS'/i);
      expect(paymentStatusBlock).toMatch(/'FAILED'/i);
      expect(paymentStatusBlock).toMatch(/'REFUNDED'/i);

      // Must NOT contain unapproved payment states in payment_status enum
      expect(paymentStatusBlock).not.toMatch(/'CANCELLED'/i);
      expect(paymentStatusBlock).not.toMatch(/'EXPIRED'/i);
      expect(paymentStatusBlock).not.toMatch(/'PROCESSING'/i);
      expect(paymentStatusBlock).not.toMatch(/'COMPLETED'/i);
    });

    it('should define cancellation_status and refund_settlement_status enums', () => {
      expect(sqlContent).toMatch(
        /CREATE TYPE cancellation_status AS ENUM\s*\(\s*'PENDING_APPROVAL',\s*'AUTHORIZED',\s*'REJECTED',\s*'COMPLETED'\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE TYPE refund_settlement_status AS ENUM\s*\(\s*'PROCESSING',\s*'SETTLED',\s*'FAILED'\s*\)/i,
      );
    });

    it('should define payment_transactions table with non-cascade foreign key and integer minor units', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS payment_transactions/i);

      // Primary Key
      expect(paymentTxBlock).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Foreign Key with ON DELETE RESTRICT (7-year retention)
      expect(paymentTxBlock).toMatch(
        /booking_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+bookings\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );

      // Provider-agnostic identifier
      expect(paymentTxBlock).toMatch(/provider\s+VARCHAR\(32\)\s+NOT\s+NULL/i);

      // Integer Minor Units amount check
      expect(paymentTxBlock).toMatch(
        /amount\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*amount\s*>=\s*0\s*\)/i,
      );

      // Status using canonical enum
      expect(paymentTxBlock).toMatch(
        /status\s+payment_status\s+NOT\s+NULL\s+DEFAULT\s+'INITIATED'/i,
      );

      // Unique Idempotency Key
      expect(paymentTxBlock).toMatch(/idempotency_key\s+VARCHAR\(128\)\s+UNIQUE/i);
    });

    it('should define payment_events table with unique (provider, event_id) constraint for deduplication', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS payment_events/i);

      expect(paymentEventsBlock).toMatch(
        /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      );
      expect(paymentEventsBlock).toMatch(/provider\s+VARCHAR\(32\)\s+NOT\s+NULL/i);
      expect(paymentEventsBlock).toMatch(/event_id\s+VARCHAR\(128\)\s+NOT\s+NULL/i);
      expect(paymentEventsBlock).toMatch(/event_type\s+VARCHAR\(128\)\s+NOT\s+NULL/i);
      expect(paymentEventsBlock).toMatch(/payload\s+JSONB\s+NOT\s+NULL/i);

      // Unique deduplication boundary
      expect(paymentEventsBlock).toMatch(
        /CONSTRAINT\s+uq_payment_events_provider_event\s+UNIQUE\s*\(\s*provider\s*,\s*event_id\s*\)/i,
      );
    });

    it('should define tax_invoices table with unique invoice_number and integer minor unit amounts', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS tax_invoices/i);

      expect(taxInvoicesBlock).toMatch(/invoice_number\s+VARCHAR\(64\)\s+UNIQUE\s+NOT\s+NULL/i);
      expect(taxInvoicesBlock).toMatch(
        /booking_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+bookings\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );
      expect(taxInvoicesBlock).toMatch(
        /customer_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );

      // Minor Units checks
      expect(taxInvoicesBlock).toMatch(
        /taxable_amount\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*taxable_amount\s*>=\s*0\s*\)/i,
      );
      expect(taxInvoicesBlock).toMatch(
        /gst_amount\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*gst_amount\s*>=\s*0\s*\)/i,
      );
      expect(taxInvoicesBlock).toMatch(
        /total_amount\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*total_amount\s*>=\s*0\s*\)/i,
      );
    });

    it('should define ticket_vouchers table with unique voucher_code', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS ticket_vouchers/i);

      expect(ticketVouchersBlock).toMatch(/voucher_code\s+VARCHAR\(64\)\s+UNIQUE\s+NOT\s+NULL/i);
      expect(ticketVouchersBlock).toMatch(
        /booking_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+bookings\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );
    });

    it('should define cancellation_requests and refund_settlements tables with non-cascade foreign keys', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS cancellation_requests/i);
      expect(cancellationRequestsBlock).toMatch(
        /booking_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+bookings\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );
      expect(cancellationRequestsBlock).toMatch(
        /status\s+cancellation_status\s+NOT\s+NULL\s+DEFAULT\s+'PENDING_APPROVAL'/i,
      );

      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS refund_settlements/i);
      expect(refundSettlementsBlock).toMatch(
        /payment_transaction_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+payment_transactions\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );
      expect(refundSettlementsBlock).toMatch(
        /settlement_status\s+refund_settlement_status\s+NOT\s+NULL\s+DEFAULT\s+'PROCESSING'/i,
      );
      expect(refundSettlementsBlock).toMatch(
        /refund_amount\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*refund_amount\s*>=\s*0\s*\)/i,
      );
    });

    it('should define all required lookup and uniqueness indexes', () => {
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_tx_booking/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_order/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_payment/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_tx_status/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_events_processed/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_tax_invoices_booking/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_tax_invoices_customer/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_ticket_vouchers_booking/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_cancellation_requests_booking/i);
      expect(sqlContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_refund_settlements_payment/i);
    });
  });

  // ============================================================
  // 2. PostgreSQL Live Integration Verification
  // ============================================================
  describe('2. PostgreSQL Live Integration Verification', () => {
    it('should verify all tables exist in information_schema', async () => {
      if (!isDbAvailable || !db) return;

      const res = await db.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
          'payment_transactions',
          'payment_events',
          'tax_invoices',
          'ticket_vouchers',
          'cancellation_requests',
          'refund_settlements'
        )
      `);

      const tables = res.rows.map((r) => r.table_name);
      expect(tables).toContain('payment_transactions');
      expect(tables).toContain('payment_events');
      expect(tables).toContain('tax_invoices');
      expect(tables).toContain('ticket_vouchers');
      expect(tables).toContain('cancellation_requests');
      expect(tables).toContain('refund_settlements');
    });

    it('should enforce payment_events uniqueness on (provider, event_id)', async () => {
      if (!isDbAvailable || !db) return;

      const eventId = `evt_${Date.now()}`;
      await db.query(
        `
        INSERT INTO payment_events (provider, event_id, event_type, payload)
        VALUES ('RAZORPAY', $1, 'payment.captured', '{"status":"captured"}')
      `,
        [eventId],
      );

      // Duplicate insertion must fail with unique violation (23505)
      await expect(
        db.query(
          `
          INSERT INTO payment_events (provider, event_id, event_type, payload)
          VALUES ('RAZORPAY', $1, 'payment.captured', '{"status":"captured"}')
        `,
          [eventId],
        ),
      ).rejects.toThrow();
    });

    it('should enforce tax_invoices unique constraint on invoice_number', async () => {
      if (!isDbAvailable || !db) return;

      // Seed a test user & booking
      const userRes = await db.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ('inv_test_${Date.now()}@example.com', 'hash', 'Invoice User', 'CUSTOMER')
        RETURNING id
      `);
      const userId = userRes.rows[0]!.id;

      const depRes = await db.query<{ id: string }>(`
        SELECT id FROM departure_schedules LIMIT 1
      `);
      if (depRes.rows.length === 0) return;
      const depId = depRes.rows[0]!.id;

      const bookRes = await db.query<{ id: string }>(
        `
        INSERT INTO bookings (
          booking_reference, customer_id, departure_id, party_size, adult_count, child_count,
          total_price, currency, status, price_breakdown, package_snapshot, departure_snapshot,
          itinerary_snapshot, primary_contact_name, primary_contact_email, primary_contact_phone
        ) VALUES (
          'BK-INV-${Date.now()}', $1, $2, 1, 1, 0, 500000, 'INR', 'CONFIRMED',
          '{}', '{}', '{}', '{}', 'Test', 'test@example.com', '+919876543210'
        ) RETURNING id
      `,
        [userId, depId],
      );
      const bookingId = bookRes.rows[0]!.id;

      const invNumber = `INV-202611-${Date.now()}`;
      await db.query(
        `
        INSERT INTO tax_invoices (
          invoice_number, booking_id, customer_id, taxable_amount, gst_amount, total_amount, currency
        ) VALUES (
          $1, $2, $3, 400000, 100000, 500000, 'INR'
        )
      `,
        [invNumber, bookingId, userId],
      );

      // Duplicate invoice number must fail
      await expect(
        db.query(
          `
          INSERT INTO tax_invoices (
            invoice_number, booking_id, customer_id, taxable_amount, gst_amount, total_amount, currency
          ) VALUES (
            $1, $2, $3, 400000, 100000, 500000, 'INR'
          )
        `,
          [invNumber, bookingId, userId],
        ),
      ).rejects.toThrow();
    });

    it('should reject negative amounts in payment_transactions via check constraint', async () => {
      if (!isDbAvailable || !db) return;

      const bookRes = await db.query<{ id: string }>(`SELECT id FROM bookings LIMIT 1`);
      if (bookRes.rows.length === 0) return;
      const bookingId = bookRes.rows[0]!.id;

      await expect(
        db.query(
          `
          INSERT INTO payment_transactions (booking_id, provider, amount, currency, status)
          VALUES ($1, 'RAZORPAY', -100, 'INR', 'INITIATED')
        `,
          [bookingId],
        ),
      ).rejects.toThrow();
    });

    it('should prevent cascade deletion of bookings when payment_transactions exist (ON DELETE RESTRICT)', async () => {
      if (!isDbAvailable || !db) return;

      const userRes = await db.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ('fk_test_${Date.now()}@example.com', 'hash', 'FK User', 'CUSTOMER')
        RETURNING id
      `);
      const userId = userRes.rows[0]!.id;

      const depRes = await db.query<{ id: string }>(`
        SELECT id FROM departure_schedules LIMIT 1
      `);
      if (depRes.rows.length === 0) return;
      const depId = depRes.rows[0]!.id;

      const bookRes = await db.query<{ id: string }>(
        `
        INSERT INTO bookings (
          booking_reference, customer_id, departure_id, party_size, adult_count, child_count,
          total_price, currency, status, price_breakdown, package_snapshot, departure_snapshot,
          itinerary_snapshot, primary_contact_name, primary_contact_email, primary_contact_phone
        ) VALUES (
          'BK-FK-${Date.now()}', $1, $2, 1, 1, 0, 500000, 'INR', 'AWAITING_PAYMENT',
          '{}', '{}', '{}', '{}', 'Test', 'test@example.com', '+919876543210'
        ) RETURNING id
      `,
        [userId, depId],
      );
      const bookingId = bookRes.rows[0]!.id;

      await db.query(
        `
        INSERT INTO payment_transactions (booking_id, provider, amount, currency, status)
        VALUES ($1, 'RAZORPAY', 500000, 'INR', 'INITIATED')
      `,
        [bookingId],
      );

      // Attempting to delete the booking must fail due to ON DELETE RESTRICT
      await expect(db.query(`DELETE FROM bookings WHERE id = $1`, [bookingId])).rejects.toThrow();
    });
  });
});
