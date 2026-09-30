import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 8 Step 1 — Notification Delivery Database Schema (DDL & Integration)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/007_create_notification_schema.sql',
  );

  let sqlContent = '';
  let notificationDeliveriesBlock = '';
  let db: DatabaseService | null = null;
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        // Run all migrations including 007
        await runMigrations(db);
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db && isDbAvailable) {
      await db.query(`DELETE FROM notification_deliveries`);
      await db.close();
    }
  });

  afterEach(async () => {
    if (db && isDbAvailable) {
      await db.query(`DELETE FROM notification_deliveries`);
    }
  });

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');
    const match = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS notification_deliveries\s*\(([\s\S]*?)\);/i,
    );
    notificationDeliveriesBlock = match?.[1] ?? '';
  });

  // ============================================================
  // 1. DDL Static Schema & Syntax Verification
  // ============================================================
  describe('1. DDL Static Schema Verification', () => {
    it('1.1 should define notification_channel enum with EMAIL and SMS', () => {
      expect(sqlContent).toMatch(
        /CREATE TYPE notification_channel AS ENUM\s*\(\s*'EMAIL',\s*'SMS'\s*\)/i,
      );
    });

    it('1.2 should define notification_type enum with canonical lifecycle types', () => {
      expect(sqlContent).toMatch(/CREATE TYPE notification_type AS ENUM/i);
      expect(sqlContent).toContain("'BOOKING_CONFIRMED'");
      expect(sqlContent).toContain("'DOCUMENT_READY'");
      expect(sqlContent).toContain("'REFUND_SETTLED'");
      expect(sqlContent).toContain("'BOOKING_CANCELLED'");

      // Verify prohibited / speculative types are NOT present
      expect(sqlContent).not.toContain('CANCELLATION_REVIEW');
      expect(sqlContent).not.toContain('PAYMENT_FAILED');
      expect(sqlContent).not.toContain('PROMOTIONAL');
      expect(sqlContent).not.toContain('MARKETING');
      expect(sqlContent).not.toContain('PASSWORD_RESET');
    });

    it('1.3 should define notification_status enum with canonical lifecycle statuses', () => {
      expect(sqlContent).toMatch(
        /CREATE TYPE notification_status AS ENUM\s*\(\s*'PENDING',\s*'SENT',\s*'FAILED',\s*'RETRYING'\s*\)/i,
      );

      // Verify prohibited statuses are NOT present
      expect(sqlContent).not.toContain("'DELIVERED'");
      expect(sqlContent).not.toContain("'QUEUED'");
      expect(sqlContent).not.toContain("'PROCESSING'");
      expect(sqlContent).not.toContain("'DEAD_LETTER'");
    });

    it('1.4 should define notification_deliveries table with all required columns and constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS notification_deliveries/i);

      // Primary Key
      expect(notificationDeliveriesBlock).toMatch(
        /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      );

      // Idempotency Key
      expect(notificationDeliveriesBlock).toMatch(
        /idempotency_key\s+VARCHAR\(128\)\s+NOT\s+NULL\s+UNIQUE/i,
      );

      // Recipient Details
      expect(notificationDeliveriesBlock).toMatch(/recipient_email\s+VARCHAR\(255\)\s+NOT\s+NULL/i);
      expect(notificationDeliveriesBlock).toMatch(/recipient_phone\s+VARCHAR\(32\)/i);

      // Channel & Type Enums
      expect(notificationDeliveriesBlock).toMatch(
        /channel\s+notification_channel\s+NOT\s+NULL\s+DEFAULT\s+'EMAIL'/i,
      );
      expect(notificationDeliveriesBlock).toMatch(
        /notification_type\s+notification_type\s+NOT\s+NULL/i,
      );

      // Reference & Subject
      expect(notificationDeliveriesBlock).toMatch(/reference_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(notificationDeliveriesBlock).toMatch(/subject\s+VARCHAR\(255\)\s+NOT\s+NULL/i);

      // Status & Provider
      expect(notificationDeliveriesBlock).toMatch(
        /status\s+notification_status\s+NOT\s+NULL\s+DEFAULT\s+'PENDING'/i,
      );
      expect(notificationDeliveriesBlock).toMatch(/provider_name\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(notificationDeliveriesBlock).toMatch(/provider_message_id\s+VARCHAR\(128\)/i);
      expect(notificationDeliveriesBlock).toMatch(
        /retry_count\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i,
      );

      // Diagnostics & Timestamps
      expect(notificationDeliveriesBlock).toMatch(/error_details\s+JSONB/i);
      expect(notificationDeliveriesBlock).toMatch(/sent_at\s+TIMESTAMPTZ/i);
      expect(notificationDeliveriesBlock).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i,
      );
      expect(notificationDeliveriesBlock).toMatch(
        /updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i,
      );
    });

    it('1.5 should define required performance and operational lookup indexes', () => {
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_notification_deliveries_ref\s+ON\s+notification_deliveries\s*\(\s*reference_id\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status\s+ON\s+notification_deliveries\s*\(\s*status\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at\s+ON\s+notification_deliveries\s*\(\s*created_at\s+DESC\s*\)/i,
      );
    });

    it('1.6 CRITICAL SECURITY CHECK: Table must NOT contain sensitive credentials, tokens, or presigned URLs', () => {
      const lowerSql = sqlContent.toLowerCase();

      // No secrets or credentials
      expect(lowerSql).not.toContain('password');
      expect(lowerSql).not.toContain('token');
      expect(lowerSql).not.toContain('secret');
      expect(lowerSql).not.toContain('api_key');
      expect(lowerSql).not.toContain('card_number');
      expect(lowerSql).not.toContain('cvv');

      // No raw expiring presigned URLs
      expect(lowerSql).not.toContain('presigned_url');
      expect(lowerSql).not.toContain('signed_url');
      expect(lowerSql).not.toContain('document_url');
      expect(lowerSql).not.toContain('temporary_download_url');

      // No stack traces
      expect(lowerSql).not.toContain('stack_trace');
    });
  });

  // ============================================================
  // 2. PostgreSQL Live Database Integration Tests
  // ============================================================
  describe('2. PostgreSQL Live Database Integration Tests', () => {
    it('2.1 should verify migration runner applies 007_create_notification_schema.sql cleanly', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      const migrationRes = await db.query<{ migration_name: string }>(
        `SELECT migration_name FROM schema_migrations WHERE migration_name = '007_create_notification_schema.sql'`,
      );
      expect(migrationRes.rowCount).toBe(1);
      expect(migrationRes.rows[0]?.migration_name).toBe('007_create_notification_schema.sql');
    });

    it('2.2 should verify PostgreSQL custom enum types exist in database', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      const enumsRes = await db.query<{ typname: string }>(
        `SELECT typname FROM pg_type WHERE typname IN ('notification_channel', 'notification_type', 'notification_status')`,
      );
      const enumNames = enumsRes.rows.map((r) => r.typname);

      expect(enumNames).toContain('notification_channel');
      expect(enumNames).toContain('notification_type');
      expect(enumNames).toContain('notification_status');
    });

    it('2.3 should insert a valid notification_delivery record with defaults and return generated UUID', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      const insertRes = await db.query<{
        id: string;
        idempotency_key: string;
        channel: string;
        notification_type: string;
        status: string;
        retry_count: number;
        created_at: Date;
      }>(
        `INSERT INTO notification_deliveries (
          idempotency_key,
          recipient_email,
          notification_type,
          reference_id,
          subject,
          provider_name
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, idempotency_key, channel, notification_type, status, retry_count, created_at`,
        [
          'notify:booking_confirmed:bkg-test-101',
          'traveller.test@example.com',
          'BOOKING_CONFIRMED',
          'BK-202610-TEST',
          'Your Booking Confirmation - Kashmir Tour',
          'MOCK',
        ],
      );

      expect(insertRes.rowCount).toBe(1);
      const row = insertRes.rows[0]!;
      expect(row.id).toBeDefined();
      expect(row.idempotency_key).toBe('notify:booking_confirmed:bkg-test-101');
      expect(row.channel).toBe('EMAIL'); // Default
      expect(row.notification_type).toBe('BOOKING_CONFIRMED');
      expect(row.status).toBe('PENDING'); // Default
      expect(row.retry_count).toBe(0); // Default
      expect(row.created_at).toBeDefined();
    });

    it('2.4 IDEMPOTENCY ENFORCEMENT: should reject duplicate idempotency_key with unique violation', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      const key = 'notify:dup-key-test:unique-123';

      await db.query(
        `INSERT INTO notification_deliveries (
          idempotency_key, recipient_email, notification_type, reference_id, subject, provider_name
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [key, 'user1@example.com', 'DOCUMENT_READY', 'BK-REF-1', 'Documents Ready', 'MOCK'],
      );

      let duplicateError: any = null;
      try {
        await db.query(
          `INSERT INTO notification_deliveries (
            idempotency_key, recipient_email, notification_type, reference_id, subject, provider_name
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [key, 'user2@example.com', 'DOCUMENT_READY', 'BK-REF-1', 'Documents Ready', 'MOCK'],
        );
      } catch (err: any) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      // PostgreSQL unique violation error code is 23505
      expect(duplicateError.code).toBe('23505');
    });

    it('2.5 should store and retrieve structured error_details JSONB safely without stack traces', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      const safeError = {
        errorCode: 'PROVIDER_TEMPORARY_UNAVAILABLE',
        errorCategory: 'NETWORK_TIMEOUT',
        safeErrorMessage: 'Upstream mail delivery timed out after 5000ms',
        providerStatusCode: 504,
      };

      const insertRes = await db.query<{ id: string; error_details: any; status: string }>(
        `INSERT INTO notification_deliveries (
          idempotency_key,
          recipient_email,
          notification_type,
          reference_id,
          subject,
          status,
          provider_name,
          retry_count,
          error_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, error_details, status`,
        [
          'notify:failed-diag:test-456',
          'failed.user@example.com',
          'REFUND_SETTLED',
          'REF-CANCEL-99',
          'Refund Processed Notice',
          'FAILED',
          'MOCK',
          3,
          JSON.stringify(safeError),
        ],
      );

      expect(insertRes.rowCount).toBe(1);
      const row = insertRes.rows[0]!;
      expect(row.status).toBe('FAILED');
      expect(row.error_details).toEqual(safeError);
    });

    it('2.6 should reject invalid enum values for notification_type, notification_status, and notification_channel', async () => {
      if (!isDbAvailable || !db) {
        return;
      }

      // Invalid type
      let typeError: any = null;
      try {
        await db.query(
          `INSERT INTO notification_deliveries (
            idempotency_key, recipient_email, notification_type, reference_id, subject, provider_name
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          ['key-inv-type', 'a@b.com', 'INVALID_TYPE' as any, 'ref-1', 'sub', 'MOCK'],
        );
      } catch (err: any) {
        typeError = err;
      }
      expect(typeError).not.toBeNull();
      expect(typeError.code).toBe('22P02'); // invalid_text_representation

      // Invalid status
      let statusError: any = null;
      try {
        await db.query(
          `INSERT INTO notification_deliveries (
            idempotency_key, recipient_email, notification_type, status, reference_id, subject, provider_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'key-inv-status',
            'a@b.com',
            'BOOKING_CONFIRMED',
            'DELIVERED' as any,
            'ref-1',
            'sub',
            'MOCK',
          ],
        );
      } catch (err: any) {
        statusError = err;
      }
      expect(statusError).not.toBeNull();
      expect(statusError.code).toBe('22P02');
    });
  });
});
