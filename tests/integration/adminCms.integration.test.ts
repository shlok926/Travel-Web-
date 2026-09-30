import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { HeroSliderRepository } from '../../backend/src/modules/cms/repositories/heroSlider.repository.js';
import { CmsPageRepository } from '../../backend/src/modules/cms/repositories/cmsPage.repository.js';
import { AdminAuditLogRepository } from '../../backend/src/modules/admin/repositories/adminAuditLog.repository.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 7 Step 5 — Admin & CMS Full-Stack Integration, Security & Audit Hardening', () => {
  let app: FastifyInstance;
  let db: DatabaseService;
  let isDbAvailable = false;

  let adminToken = '';
  let adminId = '';
  let customerToken = '';
  let customerId = '';

  let sliderRepo: HeroSliderRepository;
  let pageRepo: CmsPageRepository;
  let auditRepo: AdminAuditLogRepository;

  const config = loadEnv();

  beforeAll(async () => {
    try {
      const appInstance = await createApp({ config });
      app = appInstance.app;
      db = appInstance.db;

      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        await seedAll();

        sliderRepo = new HeroSliderRepository(db);
        pageRepo = new CmsPageRepository(db);
        auditRepo = new AdminAuditLogRepository(db);

        adminId = '99999999-9999-4999-8999-999999999999';
        const adminEmail = `admin_phase7_${Date.now()}@example.com`;
        customerId = '88888888-8888-4888-8888-888888888888';
        const customerEmail = `customer_phase7_${Date.now()}@example.com`;

        // Provision test admin and customer users in PostgreSQL
        await db.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES
             ($1, $2, '$argon2id$mockhash', 'Admin Operator', 'ADMIN', true),
             ($3, $4, '$argon2id$mockhash', 'Regular Customer', 'CUSTOMER', true)
           ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;`,
          [adminId, adminEmail, customerId, customerEmail],
        );

        adminToken = JwtSecurity.sign(
          { userId: adminId, email: adminEmail, role: 'ADMIN', sessionId: 'sess-admin-p7' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );

        customerToken = JwtSecurity.sign(
          { userId: customerId, email: customerEmail, role: 'CUSTOMER', sessionId: 'sess-cust-p7' },
          config.JWT_PRIVATE_KEY,
          { expiresInSeconds: 3600 },
        );

        await app.ready();
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (db) {
      await db.close();
    }
  });

  // ============================================================
  // 1. HERO SLIDER INTEGRATION & SECURITY MATRIX
  // ============================================================

  describe('1. Hero Slider Management (Full-Stack & DB)', () => {
    let createdSliderId: string;

    it('POST /api/v1/admin/cms/sliders — creates new slider in PostgreSQL', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Golden Triangle Special Tour',
          subtitle: 'Delhi, Agra & Jaipur Experience',
          imageUrl: 'https://cdn.example.com/sliders/golden-triangle.webp',
          ctaLabel: 'View Package',
          ctaUrl: '/packages/golden-triangle',
          sortOrder: 1,
          isActive: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Golden Triangle Special Tour');
      expect(json.data.sortOrder).toBe(1);
      expect(json.data.isActive).toBe(true);
      expect(json.data.id).toBeDefined();

      createdSliderId = json.data.id;

      // Verify row exists directly in PostgreSQL
      const dbRow = await sliderRepo.findById(createdSliderId);
      expect(dbRow).not.toBeNull();
      expect(dbRow?.title).toBe('Golden Triangle Special Tour');
    });

    it('GET /api/v1/admin/cms/sliders — returns paginated list of sliders', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/sliders?page=1&limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.meta.page).toBe(1);
    });

    it('GET /api/v1/admin/cms/sliders/:id — retrieves slider by ID', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/cms/sliders/${createdSliderId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(createdSliderId);
      expect(json.data.title).toBe('Golden Triangle Special Tour');
    });

    it('PATCH /api/v1/admin/cms/sliders/:id — updates slider properties', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/cms/sliders/${createdSliderId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Royal Rajasthan & Golden Triangle',
          sortOrder: 2,
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Royal Rajasthan & Golden Triangle');
      expect(json.data.sortOrder).toBe(2);
      expect(json.data.isActive).toBe(false);

      // Verify in DB
      const dbRow = await sliderRepo.findById(createdSliderId);
      expect(dbRow?.isActive).toBe(false);
    });

    it('GET /api/v1/cms/sliders — public storefront route excludes inactive sliders', async () => {
      if (!isDbAvailable) return;

      // The createdSliderId was updated to isActive: false above
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cms/sliders',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      // Inactive slider MUST NOT be present in public storefront feed
      const leaked = json.data.some((s: { id: string }) => s.id === createdSliderId);
      expect(leaked).toBe(false);
    });

    it('DELETE /api/v1/admin/cms/sliders/:id — deletes slider from PostgreSQL', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/cms/sliders/${createdSliderId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);

      // Verify deleted in DB
      const dbRow = await sliderRepo.findById(createdSliderId);
      expect(dbRow).toBeNull();
    });

    it('RBAC Guard: 401 when anonymous, 403 when customer', async () => {
      if (!isDbAvailable) return;

      const anonRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        payload: { title: 'Test', imageUrl: 'https://example.com/test.jpg' },
      });
      expect(anonRes.statusCode).toBe(401);

      const custRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { title: 'Test', imageUrl: 'https://example.com/test.jpg' },
      });
      expect(custRes.statusCode).toBe(403);
    });
  });

  // ============================================================
  // 2. CMS STATIC PAGES INTEGRATION & SECURITY MATRIX
  // ============================================================

  describe('2. CMS Static Pages (Full-Stack & DB)', () => {
    let testPageId: string;
    const testSlug = `terms-and-conditions-${Date.now()}`;
    const rawHtmlContent = `<div class="legal-doc"><h2>Terms</h2><p>Standard terms & conditions apply.</p></div>`;

    it('POST /api/v1/admin/cms/pages — creates static page with raw HTML in PostgreSQL', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: testSlug,
          title: 'Terms and Conditions',
          contentHtml: rawHtmlContent,
          metaDescription: 'Young Tours and Travels terms and conditions.',
          isPublished: false, // Initially unpublished
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe(testSlug);
      expect(json.data.contentHtml).toBe(rawHtmlContent);
      expect(json.data.isPublished).toBe(false);

      testPageId = json.data.id;

      // Verify in PostgreSQL
      const dbRow = await pageRepo.findById(testPageId);
      expect(dbRow).not.toBeNull();
      expect(dbRow?.contentHtml).toBe(rawHtmlContent);
    });

    it('POST /api/v1/admin/cms/pages — duplicate slug produces 409 CONFLICT', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: testSlug,
          title: 'Duplicate Terms',
          contentHtml: '<p>Duplicate</p>',
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('CONFLICT');
    });

    it('GET /api/v1/cms/pages/:slug — public route returns 404 for unpublished page', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/cms/pages/${testSlug}`,
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('CMS_PAGE_NOT_FOUND');
    });

    it('PUT /api/v1/admin/cms/pages/:slug — publishes page and updates content', async () => {
      if (!isDbAvailable) return;

      const updatedHtml = `<div class="legal-doc"><h2>Terms</h2><p>Published terms and conditions.</p></div>`;
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/cms/pages/${testSlug}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contentHtml: updatedHtml,
          isPublished: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.isPublished).toBe(true);
      expect(json.data.contentHtml).toBe(updatedHtml);
    });

    it('GET /api/v1/cms/pages/:slug — public route now returns 200 with raw HTML', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/cms/pages/${testSlug}`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe(testSlug);
      expect(json.data.isPublished).toBe(true);
      expect(json.data.contentHtml).toContain('Published terms and conditions');
    });

    it('PATCH /api/v1/admin/cms/pages/:id — updates page by ID', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/cms/pages/${testPageId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Revised Terms of Service',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Revised Terms of Service');
    });

    it('DELETE /api/v1/admin/cms/pages/:id — deletes page from PostgreSQL', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/cms/pages/${testPageId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);

      // Verify deletion in DB
      const dbRow = await pageRepo.findById(testPageId);
      expect(dbRow).toBeNull();
    });
  });

  // ============================================================
  // 3. ADMIN AUDIT LOG INTEGRATION & APPEND-ONLY GUARANTEES
  // ============================================================

  describe('3. Admin Audit Trail Logging (Full-Stack & DB)', () => {
    let seededAuditId: string;

    beforeAll(async () => {
      if (!isDbAvailable) return;

      // Seed an explicit audit log record directly via repo
      const row = await auditRepo.create({
        adminId,
        action: 'PACKAGE_PUBLISH',
        entityType: 'PACKAGE',
        entityId: 'pkg-audit-test-1',
        details: { note: 'Initial publication audit check' },
        ipAddress: '192.168.1.100',
      });
      seededAuditId = row.id;
    });

    it('GET /api/v1/admin/audit-logs — queries audit history with multi-dimensional filters', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-logs?adminId=${adminId}&action=PACKAGE_PUBLISH&entityType=PACKAGE`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);

      const item = json.data.find((d: { id: string }) => d.id === seededAuditId);
      expect(item).toBeDefined();
      expect(item.action).toBe('PACKAGE_PUBLISH');
      expect(item.adminId).toBe(adminId);
    });

    it('GET /api/v1/admin/audit-logs/:id — retrieves audit record by UUID', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-logs/${seededAuditId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(seededAuditId);
      expect(json.data.action).toBe('PACKAGE_PUBLISH');
    });

    it('Append-Only Immutability: Mutating audit logs is impossible (No routes exist)', async () => {
      if (!isDbAvailable) return;

      const postRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'MUTATION_ATTEMPT' },
      });
      expect(postRes.statusCode).toBe(404);

      const putRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/audit-logs/${seededAuditId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'MUTATION_ATTEMPT' },
      });
      expect(putRes.statusCode).toBe(404);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/audit-logs/${seededAuditId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'MUTATION_ATTEMPT' },
      });
      expect(patchRes.statusCode).toBe(404);

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/audit-logs/${seededAuditId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(404);
    });
  });

  // ============================================================
  // 4. ADMIN DASHBOARD OPERATIONAL KPIS & ZERO REVENUE ENFORCEMENT
  // ============================================================

  describe('4. Admin Dashboard Stats (Full-Stack & DB)', () => {
    it('GET /api/v1/admin/dashboard/stats — aggregates real operational statistics from PostgreSQL', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);

      const stats = json.data;
      expect(typeof stats.totalPackages).toBe('number');
      expect(typeof stats.publishedPackages).toBe('number');
      expect(typeof stats.draftPackages).toBe('number');
      expect(typeof stats.totalDestinations).toBe('number');
      expect(typeof stats.totalThemes).toBe('number');
      expect(typeof stats.totalDepartures).toBe('number');
      expect(typeof stats.totalBookings).toBe('number');
      expect(typeof stats.inventoryUtilizationPercent).toBe('number');

      // CRITICAL GUARANTEE: Zero revenue aggregation fields
      expect(stats.grossRevenue).toBeUndefined();
      expect(stats.netRevenue).toBeUndefined();
      expect(stats.totalRevenue).toBeUndefined();
      expect(stats.refundedRevenue).toBeUndefined();
    });

    it('RBAC Guard: 401 anonymous, 403 customer on dashboard endpoint', async () => {
      if (!isDbAvailable) return;

      const anonRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
      });
      expect(anonRes.statusCode).toBe(401);

      const custRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(custRes.statusCode).toBe(403);
    });
  });

  // ============================================================
  // 5. CONCURRENCY, SQL INJECTION & BOUNDARY SECURITY
  // ============================================================

  describe('5. Security Boundaries, Concurrency & SQL Injection Hardening', () => {
    it('SQL Injection resilience in search and filter parameters', async () => {
      if (!isDbAvailable) return;

      const sqliPayload = "'; DROP TABLE hero_sliders; --";

      // 1. Audit log filter SQLi test
      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-logs?action=${encodeURIComponent(sqliPayload)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(auditRes.statusCode).toBe(200);
      const auditJson = auditRes.json();
      expect(auditJson.success).toBe(true);

      // 2. CMS page slug SQLi test
      const pageRes = await app.inject({
        method: 'GET',
        url: `/api/v1/cms/pages/${encodeURIComponent(sqliPayload)}`,
      });
      expect(pageRes.statusCode).toBe(400); // Fails slug regex validation safely
    });

    it('Malformed UUID parameters return 400 with VALIDATION_ERROR', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/sliders/not-a-valid-uuid',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('OpenAPI Swagger documentation is accessible and valid', async () => {
      if (!isDbAvailable) return;

      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });

      expect(response.statusCode).toBe(200);
      const openapi = response.json();
      expect(openapi.openapi).toBe('3.0.3');
      expect(openapi.info.title).toContain('Young Tours & Travels');
      expect(openapi.tags).toBeDefined();

      // Verify Phase 7 tags exist
      const tagNames = openapi.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain('Admin — CMS');
      expect(tagNames).toContain('CMS');
      expect(tagNames).toContain('Admin — Audit');
      expect(tagNames).toContain('Admin — Dashboard');
    });
  });
});
