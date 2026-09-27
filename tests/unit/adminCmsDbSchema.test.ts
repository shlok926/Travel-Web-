import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 7 Step 1 — Admin, CMS & Audit Database Schema (DDL & Integration)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/006_create_admin_and_cms_schema.sql',
  );

  let sqlContent = '';
  let heroSlidersBlock = '';
  let cmsPagesBlock = '';
  let adminAuditLogsBlock = '';
  let db: DatabaseService | null = null;
  let isDbAvailable = false;
  let testAdminUserId = '';

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);

        // Fetch or create a test admin user for foreign key testing
        const userRes = await db.query<{ id: string }>(
          `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`,
        );
        if (userRes.rows.length > 0 && userRes.rows[0]) {
          testAdminUserId = userRes.rows[0].id;
        } else {
          const insertRes = await db.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO UPDATE SET role = 'ADMIN'
             RETURNING id`,
            [
              'admin.schema.test@youngtravels.com',
              'argon2id_hash_placeholder',
              'Admin Schema Tester',
              'ADMIN',
            ],
          );
          testAdminUserId = insertRes.rows[0]!.id;
        }
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db && isDbAvailable) {
      await db.query(`
        DELETE FROM admin_audit_logs;
        DELETE FROM cms_pages;
        DELETE FROM hero_sliders;
      `);
      await db.close();
    }
  });

  afterEach(async () => {
    if (db && isDbAvailable) {
      await db.query(`
        DELETE FROM admin_audit_logs;
        DELETE FROM cms_pages;
        DELETE FROM hero_sliders;
      `);
    }
  });

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');
    heroSlidersBlock =
      sqlContent.match(/CREATE TABLE IF NOT EXISTS hero_sliders\s*\(([\s\S]*?)\);/i)?.[1] ?? '';
    cmsPagesBlock =
      sqlContent.match(/CREATE TABLE IF NOT EXISTS cms_pages\s*\(([\s\S]*?)\);/i)?.[1] ?? '';
    adminAuditLogsBlock =
      sqlContent.match(/CREATE TABLE IF NOT EXISTS admin_audit_logs\s*\(([\s\S]*?)\);/i)?.[1] ?? '';
  });

  // ============================================================
  // 1. DDL Static Schema Verification
  // ============================================================
  describe('1. DDL Static Schema Verification', () => {
    it('should define hero_sliders table with correct columns, defaults, and constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS hero_sliders/i);

      // Primary Key
      expect(heroSlidersBlock).toMatch(
        /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      );

      // Required fields
      expect(heroSlidersBlock).toMatch(/title\s+VARCHAR\(128\)\s+NOT\s+NULL/i);
      expect(heroSlidersBlock).toMatch(/image_url\s+VARCHAR\(512\)\s+NOT\s+NULL/i);

      // Optional fields
      expect(heroSlidersBlock).toMatch(/subtitle\s+VARCHAR\(256\)/i);
      expect(heroSlidersBlock).toMatch(/cta_label\s+VARCHAR\(64\)/i);
      expect(heroSlidersBlock).toMatch(/cta_url\s+VARCHAR\(256\)/i);

      // Defaults
      expect(heroSlidersBlock).toMatch(/sort_order\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i);
      expect(heroSlidersBlock).toMatch(/is_active\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/i);

      // Timestamps
      expect(heroSlidersBlock).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
      expect(heroSlidersBlock).toMatch(
        /updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });

    it('should define cms_pages table with slug uniqueness and required fields', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS cms_pages/i);

      // Primary Key
      expect(cmsPagesBlock).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Unique Slug constraint
      expect(cmsPagesBlock).toMatch(/slug\s+VARCHAR\(64\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Required content fields
      expect(cmsPagesBlock).toMatch(/title\s+VARCHAR\(128\)\s+NOT\s+NULL/i);
      expect(cmsPagesBlock).toMatch(/content_html\s+TEXT\s+NOT\s+NULL/i);

      // Optional SEO snippet
      expect(cmsPagesBlock).toMatch(/meta_description\s+VARCHAR\(256\)/i);

      // Publication default
      expect(cmsPagesBlock).toMatch(/is_published\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/i);

      // Timestamps
      expect(cmsPagesBlock).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
      expect(cmsPagesBlock).toMatch(
        /updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });

    it('should define admin_audit_logs table with users FK and ON DELETE RESTRICT', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS admin_audit_logs/i);

      // Primary Key
      expect(adminAuditLogsBlock).toMatch(
        /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      );

      // Admin ID foreign key with ON DELETE RESTRICT to preserve audit history
      expect(adminAuditLogsBlock).toMatch(
        /admin_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i,
      );

      // Required audit action descriptors
      expect(adminAuditLogsBlock).toMatch(/action\s+VARCHAR\(64\)\s+NOT\s+NULL/i);
      expect(adminAuditLogsBlock).toMatch(/entity_type\s+VARCHAR\(32\)\s+NOT\s+NULL/i);
      expect(adminAuditLogsBlock).toMatch(/entity_id\s+VARCHAR\(64\)\s+NOT\s+NULL/i);

      // Structured context & metadata
      expect(adminAuditLogsBlock).toMatch(/details\s+JSONB/i);
      expect(adminAuditLogsBlock).toMatch(/ip_address\s+VARCHAR\(45\)/i);

      // Creation timestamp
      expect(adminAuditLogsBlock).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });

    it('should define all required performance and search indexes', () => {
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_hero_sliders_sort ON hero_sliders\s*\(\s*sort_order\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_hero_sliders_active ON hero_sliders\s*\(\s*is_active\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_cms_pages_is_published ON cms_pages\s*\(\s*is_published\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs\s*\(\s*admin_id\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs\s*\(\s*entity_type,\s*entity_id\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs\s*\(\s*created_at\s*\)/i,
      );
    });
  });

  // ============================================================
  // 2. PostgreSQL Live Database Integration Tests
  // ============================================================
  describe('2. PostgreSQL Live Database Integration Tests', () => {
    it('hero_sliders: should insert valid row with defaults and enforce constraints', async () => {
      if (!isDbAvailable || !db) return;

      // 1. Insert with minimal required fields
      const insertRes = await db.query<{
        id: string;
        title: string;
        sort_order: number;
        is_active: boolean;
        created_at: Date;
      }>(
        `INSERT INTO hero_sliders (title, image_url)
         VALUES ($1, $2)
         RETURNING id, title, sort_order, is_active, created_at`,
        ['Discover Himalayas', 'https://cdn.youngtravels.com/sliders/himalayas.webp'],
      );

      expect(insertRes.rows).toHaveLength(1);
      const row = insertRes.rows[0]!;
      expect(row.id).toBeDefined();
      expect(row.title).toBe('Discover Himalayas');
      expect(row.sort_order).toBe(0);
      expect(row.is_active).toBe(true);
      expect(row.created_at).toBeInstanceOf(Date);

      // 2. Reject insert with missing title (NOT NULL)
      await expect(
        db.query(`INSERT INTO hero_sliders (image_url) VALUES ($1)`, [
          'https://cdn.youngtravels.com/sliders/no-title.webp',
        ]),
      ).rejects.toThrow(/null value in column "title"/i);

      // 3. Reject insert with missing image_url (NOT NULL)
      await expect(
        db.query(`INSERT INTO hero_sliders (title) VALUES ($1)`, ['Missing Image Slider']),
      ).rejects.toThrow(/null value in column "image_url"/i);
    });

    it('cms_pages: should insert valid static page, enforce unique slug and NOT NULL constraints', async () => {
      if (!isDbAvailable || !db) return;

      // 1. Insert valid static page
      const pageRes = await db.query<{
        id: string;
        slug: string;
        title: string;
        is_published: boolean;
      }>(
        `INSERT INTO cms_pages (slug, title, content_html, meta_description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, title, is_published`,
        [
          'about-us-test',
          'About Young Tours & Travels',
          '<h1>Our Heritage</h1><p>Crafting bespoke travel experiences since 2010.</p>',
          'Learn about our journey and heritage.',
        ],
      );

      expect(pageRes.rows).toHaveLength(1);
      expect(pageRes.rows[0]!.slug).toBe('about-us-test');
      expect(pageRes.rows[0]!.is_published).toBe(true);

      // 2. Reject duplicate slug (UNIQUE constraint)
      await expect(
        db.query(
          `INSERT INTO cms_pages (slug, title, content_html)
           VALUES ($1, $2, $3)`,
          ['about-us-test', 'Duplicate About Us', '<p>Duplicate content</p>'],
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint/i);

      // 3. Reject missing content_html (NOT NULL constraint)
      await expect(
        db.query(
          `INSERT INTO cms_pages (slug, title)
           VALUES ($1, $2)`,
          ['terms-no-content', 'Terms & Conditions'],
        ),
      ).rejects.toThrow(/null value in column "content_html"/i);
    });

    it('admin_audit_logs: should insert structured audit entry with JSONB and enforce FK RESTRICT', async () => {
      if (!isDbAvailable || !db || !testAdminUserId) return;

      // 1. Insert valid audit record with JSONB context
      const auditRes = await db.query<{
        id: string;
        admin_id: string;
        action: string;
        entity_type: string;
        entity_id: string;
        details: Record<string, unknown>;
        created_at: Date;
      }>(
        `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, admin_id, action, entity_type, entity_id, details, created_at`,
        [
          testAdminUserId,
          'PACKAGE_PUBLISH',
          'PACKAGE',
          'pkg_test_123456',
          JSON.stringify({
            previousStatus: 'DRAFT',
            newStatus: 'PUBLISHED',
            validationRulesPassed: 8,
          }),
          '192.168.1.100',
        ],
      );

      expect(auditRes.rows).toHaveLength(1);
      const entry = auditRes.rows[0]!;
      expect(entry.admin_id).toBe(testAdminUserId);
      expect(entry.action).toBe('PACKAGE_PUBLISH');
      expect(entry.entity_type).toBe('PACKAGE');
      expect(entry.details).toEqual({
        previousStatus: 'DRAFT',
        newStatus: 'PUBLISHED',
        validationRulesPassed: 8,
      });

      // 2. Reject invalid foreign key referencing non-existent admin user
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      await expect(
        db.query(
          `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id)
           VALUES ($1, $2, $3, $4)`,
          [fakeUuid, 'PRICE_UPDATE', 'PACKAGE', 'pkg_test_999'],
        ),
      ).rejects.toThrow(/violates.*foreign key constraint/i);

      // 3. Deleting an admin user referenced by audit log must fail (ON DELETE RESTRICT preservation)
      await expect(db.query(`DELETE FROM users WHERE id = $1`, [testAdminUserId])).rejects.toThrow(
        /violates.*foreign key constraint/i,
      );
    });

    it('indexes: should confirm all 6 indexes exist in PostgreSQL catalog', async () => {
      if (!isDbAvailable || !db) return;

      const res = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename IN ('hero_sliders', 'cms_pages', 'admin_audit_logs')`,
      );
      const indexNames = res.rows.map((r) => r.indexname);

      expect(indexNames).toContain('idx_hero_sliders_sort');
      expect(indexNames).toContain('idx_hero_sliders_active');
      expect(indexNames).toContain('idx_cms_pages_is_published');
      expect(indexNames).toContain('idx_admin_audit_logs_admin_id');
      expect(indexNames).toContain('idx_admin_audit_logs_entity');
      expect(indexNames).toContain('idx_admin_audit_logs_created_at');
    });
  });
});
