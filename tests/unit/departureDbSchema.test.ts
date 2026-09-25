import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 4 Step 1 — Departure Schedules & Inventory Holds Database Schema (DDL & Integration)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/003_create_departures_and_inventory_schema.sql',
  );

  let sqlContent = '';
  let departureTableBlock = '';
  let db: DatabaseService | null = null;
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        // Clean migration 003 tables and re-apply migration 003 freshly
        await db.query(`
          DROP TABLE IF EXISTS inventory_holds CASCADE;
          DROP TABLE IF EXISTS departure_schedules CASCADE;
          DELETE FROM schema_migrations WHERE migration_name = '003_create_departures_and_inventory_schema.sql';
        `);
        await runMigrations(db);
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');
    const match = sqlContent.match(
      /CREATE TABLE IF NOT EXISTS departure_schedules\s*\(([\s\S]*?)\);/i,
    );
    departureTableBlock = match?.[1] ?? '';
  });

  describe('1. DDL Static Schema Verification', () => {
    it('should define departure_status and inventory_hold_status enums with canonical values', () => {
      expect(sqlContent).toMatch(
        /CREATE TYPE departure_status AS ENUM\s*\(\s*'OPEN',\s*'CLOSED',\s*'CANCELLED',\s*'COMPLETED'\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE TYPE inventory_hold_status AS ENUM\s*\(\s*'ACTIVE',\s*'COMMITTED',\s*'EXPIRED',\s*'RELEASED'\s*\)/i,
      );

      // Must not contain invalid pseudo-statuses
      expect(sqlContent).not.toMatch(/'DRAFT'/i);
      expect(sqlContent).not.toMatch(/'AVAILABLE'/i);
      expect(sqlContent).not.toMatch(/'FEW_SEATS_LEFT'/i);
      expect(sqlContent).not.toMatch(/'SOLD_OUT'/i);
    });

    it('should define departure_schedules table with required columns, constraints, and defaults', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS departure_schedules/i);

      // Primary Key & Foreign Key
      expect(departureTableBlock).toMatch(
        /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      );
      expect(departureTableBlock).toMatch(
        /package_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+tour_packages\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
      );

      // Dates as SQL DATE
      expect(departureTableBlock).toMatch(/departure_date\s+DATE\s+NOT\s+NULL/i);
      expect(departureTableBlock).toMatch(/return_date\s+DATE\s+NOT\s+NULL/i);

      // Capacity & Booked seats
      expect(departureTableBlock).toMatch(
        /total_seat_capacity\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*total_seat_capacity\s*>\s*0\s*\)/i,
      );
      expect(departureTableBlock).toMatch(
        /booked_seats\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*booked_seats\s*>=\s*0\s*\)/i,
      );

      // Optional Price Overrides & Currency (DEC-4-008)
      expect(departureTableBlock).toMatch(
        /price_override_adult\s+BIGINT\s+CHECK\s*\(\s*price_override_adult\s+IS\s+NULL\s+OR\s+price_override_adult\s*>=\s*0\s*\)/i,
      );
      expect(departureTableBlock).toMatch(
        /price_override_child\s+BIGINT\s+CHECK\s*\(\s*price_override_child\s+IS\s+NULL\s+OR\s+price_override_child\s*>=\s*0\s*\)/i,
      );
      expect(departureTableBlock).toMatch(/currency\s+VARCHAR\(3\)/i);

      // Status
      expect(departureTableBlock).toMatch(
        /status\s+departure_status\s+NOT\s+NULL\s+DEFAULT\s+['"]OPEN['"]/i,
      );

      // Invariants
      expect(departureTableBlock).toMatch(
        /CONSTRAINT\s+chk_departure_return_dates\s+CHECK\s*\(\s*return_date\s*>=\s*departure_date\s*\)/i,
      );
      expect(departureTableBlock).toMatch(
        /CONSTRAINT\s+chk_departure_capacity_bounds\s+CHECK\s*\(\s*booked_seats\s*<=\s*total_seat_capacity\s*\)/i,
      );
      expect(departureTableBlock).toMatch(/UNIQUE\s*\(\s*package_id\s*,\s*departure_date\s*\)/i);
    });

    it('should strictly NOT include held_seats or available_seats on departure_schedules (Anti-Drift Invariant)', () => {
      // departure_schedules must NEVER persist held_seats or available_seats
      expect(departureTableBlock).not.toMatch(/held_seats/i);
      expect(departureTableBlock).not.toMatch(/available_seats/i);
    });

    it('should define inventory_holds table with required columns and constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS inventory_holds/i);

      // Primary Key & Foreign Keys
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
      expect(sqlContent).toMatch(
        /departure_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+departure_schedules\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
      );
      expect(sqlContent).toMatch(
        /user_id\s+UUID\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );

      // Checkout Session Token (Unique)
      expect(sqlContent).toMatch(/checkout_session_token\s+VARCHAR\(100\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Held Seats with positive check
      expect(sqlContent).toMatch(
        /held_seats\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*held_seats\s*>\s*0\s*\)/i,
      );

      // Status & Expiration
      expect(sqlContent).toMatch(
        /status\s+inventory_hold_status\s+NOT\s+NULL\s+DEFAULT\s+['"]ACTIVE['"]/i,
      );
      expect(sqlContent).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    });

    it('should create operational, lookup, and pg_trgm search indexes', () => {
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_departures_pkg_date ON departure_schedules\s*\(\s*package_id\s*,\s*departure_date\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_departures_status_date ON departure_schedules\s*\(\s*status\s*,\s*departure_date\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_inventory_holds_active ON inventory_holds\s*\(\s*departure_id\s*,\s*status\s*,\s*expires_at\s*\)/i,
      );

      // Trigram indexes for search
      expect(sqlContent).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_tour_packages_title_trgm ON tour_packages USING gin\s*\(\s*title gin_trgm_ops\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_destinations_city_trgm ON destinations USING gin\s*\(\s*city_name gin_trgm_ops\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_destinations_country_trgm ON destinations USING gin\s*\(\s*country gin_trgm_ops\s*\)/i,
      );
    });
  });

  describe('2. Live Database Invariant & Constraint Verification', () => {
    it('should verify departure_status enum exists in database', async () => {
      if (!isDbAvailable || !db) return;

      const result = await db.query<{ enumlabel: string }>(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'departure_status'
         ORDER BY e.enumsortorder ASC;`,
      );

      const labels = result.rows.map((r) => r.enumlabel);
      expect(labels).toEqual(['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED']);
    });

    it('should verify inventory_hold_status enum exists in database', async () => {
      if (!isDbAvailable || !db) return;

      const result = await db.query<{ enumlabel: string }>(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'inventory_hold_status'
         ORDER BY e.enumsortorder ASC;`,
      );

      const labels = result.rows.map((r) => r.enumlabel);
      expect(labels).toEqual(['ACTIVE', 'COMMITTED', 'EXPIRED', 'RELEASED']);
    });

    it('should verify departure_schedules table columns in database', async () => {
      if (!isDbAvailable || !db) return;

      const result = await db.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'departure_schedules'
         ORDER BY ordinal_position ASC;`,
      );

      const columnNames = result.rows.map((r) => r.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('package_id');
      expect(columnNames).toContain('departure_date');
      expect(columnNames).toContain('return_date');
      expect(columnNames).toContain('total_seat_capacity');
      expect(columnNames).toContain('booked_seats');
      expect(columnNames).toContain('price_override_adult');
      expect(columnNames).toContain('price_override_child');
      expect(columnNames).toContain('currency');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Optional price overrides and currency must be nullable
      const currencyCol = result.rows.find((r) => r.column_name === 'currency');
      expect(currencyCol?.is_nullable).toBe('YES');

      const adultOverrideCol = result.rows.find((r) => r.column_name === 'price_override_adult');
      expect(adultOverrideCol?.is_nullable).toBe('YES');

      const childOverrideCol = result.rows.find((r) => r.column_name === 'price_override_child');
      expect(childOverrideCol?.is_nullable).toBe('YES');

      // Crucial: Must NOT contain held_seats or available_seats
      expect(columnNames).not.toContain('held_seats');
      expect(columnNames).not.toContain('available_seats');
    });

    it('should verify inventory_holds table columns in database', async () => {
      if (!isDbAvailable || !db) return;

      const result = await db.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'inventory_holds'
         ORDER BY ordinal_position ASC;`,
      );

      const columnNames = result.rows.map((r) => r.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('departure_id');
      expect(columnNames).toContain('checkout_session_token');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('held_seats');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('created_at');
    });

    it('should verify dynamic availability calculation query in SQL', async () => {
      if (!isDbAvailable || !db) return;

      // 1. Fetch a real package from seed
      const pkgResult = await db.query<{ id: string }>(`SELECT id FROM tour_packages LIMIT 1;`);
      if (pkgResult.rowCount === 0 || !pkgResult.rows[0]) return;
      const packageId = pkgResult.rows[0].id;

      // 2. Insert test departure in a transaction with rollback
      await db
        .withTransaction(async (client) => {
          const depResult = await client.query<{ id: string }>(
            `INSERT INTO departure_schedules (
            package_id, departure_date, return_date, total_seat_capacity, booked_seats, status
          ) VALUES (
            $1, '2029-01-10', '2029-01-15', 30, 10, 'OPEN'
          ) RETURNING id;`,
            [packageId],
          );
          const departureId = depResult.rows[0]?.id;
          if (!departureId) throw new Error('Failed to insert departure');

          // 3. Insert diverse hold records
          // A) Active unexpired hold (5 seats) -> MUST be counted
          await client.query(
            `INSERT INTO inventory_holds (
            departure_id, checkout_session_token, held_seats, status, expires_at
          ) VALUES ($1, 'test-session-active-unexpired', 5, 'ACTIVE', NOW() + INTERVAL '15 minutes');`,
            [departureId],
          );

          // B) Active EXPIRED hold (4 seats) -> MUST NOT be counted
          await client.query(
            `INSERT INTO inventory_holds (
            departure_id, checkout_session_token, held_seats, status, expires_at
          ) VALUES ($1, 'test-session-active-expired', 4, 'ACTIVE', NOW() - INTERVAL '5 minutes');`,
            [departureId],
          );

          // C) COMMITTED hold (3 seats) -> MUST NOT be counted as active hold
          await client.query(
            `INSERT INTO inventory_holds (
            departure_id, checkout_session_token, held_seats, status, expires_at
          ) VALUES ($1, 'test-session-committed', 3, 'COMMITTED', NOW() + INTERVAL '15 minutes');`,
            [departureId],
          );

          // D) RELEASED hold (2 seats) -> MUST NOT be counted as active hold
          await client.query(
            `INSERT INTO inventory_holds (
            departure_id, checkout_session_token, held_seats, status, expires_at
          ) VALUES ($1, 'test-session-released', 2, 'RELEASED', NOW() + INTERVAL '15 minutes');`,
            [departureId],
          );

          // 4. Query active unexpired holds
          const holdSumResult = await client.query<{ active_holds: string }>(
            `SELECT COALESCE(SUM(held_seats), 0)::text AS active_holds
           FROM inventory_holds
           WHERE departure_id = $1
             AND status = 'ACTIVE'
             AND expires_at > NOW();`,
            [departureId],
          );
          const activeHeldSeats = parseInt(holdSumResult.rows[0]?.active_holds ?? '0', 10);
          expect(activeHeldSeats).toBe(5); // Only (A) is counted

          // 5. Query departure availability
          const availResult = await client.query<{
            total_seat_capacity: number;
            booked_seats: number;
            available_seats: number;
          }>(
            `SELECT
             ds.total_seat_capacity,
             ds.booked_seats,
             GREATEST(0, ds.total_seat_capacity - ds.booked_seats - COALESCE(h.active_holds, 0))::integer AS available_seats
           FROM departure_schedules ds
           LEFT JOIN (
             SELECT departure_id, SUM(held_seats) AS active_holds
             FROM inventory_holds
             WHERE status = 'ACTIVE' AND expires_at > NOW()
             GROUP BY departure_id
           ) h ON h.departure_id = ds.id
           WHERE ds.id = $1;`,
            [departureId],
          );

          const row = availResult.rows[0];
          expect(row).toBeDefined();
          if (row) {
            expect(row.total_seat_capacity).toBe(30);
            expect(row.booked_seats).toBe(10);
            expect(row.available_seats).toBe(15); // 30 - 10 - 5 = 15
          }

          // Rollback test data
          throw new Error('ROLLBACK_TEST_TRANSACTION');
        })
        .catch((err) => {
          if (err.message !== 'ROLLBACK_TEST_TRANSACTION') {
            throw err;
          }
        });
    });

    it('should enforce CHECK (booked_seats <= total_seat_capacity) constraint', async () => {
      if (!isDbAvailable || !db) return;

      const pkgResult = await db.query<{ id: string }>(`SELECT id FROM tour_packages LIMIT 1;`);
      if (pkgResult.rowCount === 0 || !pkgResult.rows[0]) return;
      const packageId = pkgResult.rows[0].id;

      await expect(
        db.query(
          `INSERT INTO departure_schedules (
            package_id, departure_date, return_date, total_seat_capacity, booked_seats, status
          ) VALUES ($1, '2029-02-01', '2029-02-05', 20, 25, 'OPEN');`,
          [packageId],
        ),
      ).rejects.toThrow(/chk_departure_capacity_bounds/i);
    });

    it('should enforce CHECK (return_date >= departure_date) constraint', async () => {
      if (!isDbAvailable || !db) return;

      const pkgResult = await db.query<{ id: string }>(`SELECT id FROM tour_packages LIMIT 1;`);
      if (pkgResult.rowCount === 0 || !pkgResult.rows[0]) return;
      const packageId = pkgResult.rows[0].id;

      await expect(
        db.query(
          `INSERT INTO departure_schedules (
            package_id, departure_date, return_date, total_seat_capacity, booked_seats, status
          ) VALUES ($1, '2029-03-10', '2029-03-05', 20, 0, 'OPEN');`,
          [packageId],
        ),
      ).rejects.toThrow(/chk_departure_return_dates/i);
    });

    it('should enforce UNIQUE (package_id, departure_date) constraint', async () => {
      if (!isDbAvailable || !db) return;

      const pkgResult = await db.query<{ id: string }>(`SELECT id FROM tour_packages LIMIT 1;`);
      if (pkgResult.rowCount === 0 || !pkgResult.rows[0]) return;
      const packageId = pkgResult.rows[0].id;

      await db
        .withTransaction(async (client) => {
          await client.query(
            `INSERT INTO departure_schedules (
            package_id, departure_date, return_date, total_seat_capacity, booked_seats, status
          ) VALUES ($1, '2029-04-01', '2029-04-05', 20, 0, 'OPEN');`,
            [packageId],
          );

          // Duplicate insert must fail
          await expect(
            client.query(
              `INSERT INTO departure_schedules (
              package_id, departure_date, return_date, total_seat_capacity, booked_seats, status
            ) VALUES ($1, '2029-04-01', '2029-04-05', 25, 0, 'OPEN');`,
              [packageId],
            ),
          ).rejects.toThrow(/duplicate key value/i);

          throw new Error('ROLLBACK_TEST_TRANSACTION');
        })
        .catch((err) => {
          if (err.message !== 'ROLLBACK_TEST_TRANSACTION') {
            throw err;
          }
        });
    });
  });
});
