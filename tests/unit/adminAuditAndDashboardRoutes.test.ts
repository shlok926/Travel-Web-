import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  UserRepository,
  UserEntity,
} from '../../backend/src/modules/auth/repositories/user.repository.js';
import {
  AdminAuditLogRepository,
  AdminAuditLogEntity,
} from '../../backend/src/modules/admin/repositories/adminAuditLog.repository.js';
import { AdminDashboardRepository } from '../../backend/src/modules/admin/repositories/adminDashboard.repository.js';
import { AdminAuditLogService } from '../../backend/src/modules/admin/services/adminAuditLog.service.js';
import { AdminDashboardService } from '../../backend/src/modules/admin/services/adminDashboard.service.js';
import { AdminDashboardStatsDto } from '../../shared/src/index.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 7 Step 4 — Admin Audit Log & Dashboard REST APIs & RBAC Guardrails', () => {
  let app: FastifyInstance;
  let mockUserRepo: UserRepository;
  let mockAuditRepo: AdminAuditLogRepository;
  let mockDashboardRepo: AdminDashboardRepository;
  let adminAuditLogService: AdminAuditLogService;
  let adminDashboardService: AdminDashboardService;

  const config = loadEnv();

  const sampleAdmin: UserEntity = {
    id: '99999999-9999-4999-8999-999999999999',
    email: 'admin.audit@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Admin User',
    mobileContact: '+919999999999',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleCustomer: UserEntity = {
    id: '88888888-8888-4888-8888-888888888888',
    email: 'customer.audit@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Regular Customer',
    mobileContact: '+918888888888',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleAuditLog: AdminAuditLogEntity = {
    id: '33333333-3333-4333-8333-333333333333',
    adminId: sampleAdmin.id,
    action: 'PACKAGE_PUBLISH',
    entityType: 'PACKAGE',
    entityId: 'pkg-1234-uuid',
    details: { isPublished: true },
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
  };

  const sampleOperationalStats: AdminDashboardStatsDto = {
    totalPackages: 12,
    publishedPackages: 10,
    draftPackages: 2,
    totalDestinations: 8,
    totalThemes: 5,
    totalDepartures: 24,
    openDepartures: 20,
    upcomingDeparturesCount: 18,
    totalBookings: 150,
    confirmedBookings: 120,
    awaitingPaymentBookings: 10,
    cancelledBookings: 20,
    pendingCancellations: 3,
    inventoryUtilizationPercent: 78.5,
  };

  function createToken(user: UserEntity): string {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      config.JWT_PRIVATE_KEY,
      { expiresInSeconds: 3600 },
    );
  }

  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    adminToken = createToken(sampleAdmin);
    customerToken = createToken(sampleCustomer);

    mockUserRepo = {
      findById: vi.fn(async (id: string) => {
        if (id === sampleAdmin.id) return sampleAdmin;
        if (id === sampleCustomer.id) return sampleCustomer;
        return null;
      }),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    mockAuditRepo = {
      create: vi.fn(),
      findById: vi.fn(async (id: string) => (id === sampleAuditLog.id ? sampleAuditLog : null)),
      findAll: vi.fn(async () => ({ items: [sampleAuditLog], total: 1 })),
    } as unknown as AdminAuditLogRepository;

    mockDashboardRepo = {
      getOperationalStats: vi.fn(async () => sampleOperationalStats),
    } as unknown as AdminDashboardRepository;

    adminAuditLogService = new AdminAuditLogService(mockAuditRepo);
    adminDashboardService = new AdminDashboardService(mockDashboardRepo);

    const created = await createApp({
      config,
      userRepo: mockUserRepo,
      adminAuditLogRepo: mockAuditRepo,
      adminAuditLogService,
      adminDashboardRepo: mockDashboardRepo,
      adminDashboardService,
    });

    app = created.app;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ============================================================
  // 1. AUDIT LOG REST APIs
  // ============================================================

  describe('Admin Audit Log REST APIs', () => {
    it('GET /api/v1/admin/audit-logs — returns paginated list for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs?page=1&limit=10&action=PACKAGE_PUBLISH',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].action).toBe('PACKAGE_PUBLISH');
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.totalItems).toBe(1);
    });

    it('GET /api/v1/admin/audit-logs — returns 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/v1/admin/audit-logs — returns 403 when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('GET /api/v1/admin/audit-logs/:id — returns audit log by ID for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-logs/${sampleAuditLog.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleAuditLog.id);
      expect(json.data.action).toBe(sampleAuditLog.action);
    });

    it('GET /api/v1/admin/audit-logs/:id — returns 404 when audit log not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs/00000000-0000-4000-8000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('AUDIT_LOG_NOT_FOUND');
    });

    it('GET /api/v1/admin/audit-logs/:id — returns 400 on malformed UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs/not-a-valid-uuid',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('Append-Only Guard: POST /api/v1/admin/audit-logs returns 404 (no creation endpoint)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'FORGED_ACTION' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('Append-Only Guard: DELETE /api/v1/admin/audit-logs/:id returns 404 (no deletion endpoint)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/audit-logs/${sampleAuditLog.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================================
  // 2. DASHBOARD REST APIs
  // ============================================================

  describe('Admin Dashboard REST APIs', () => {
    it('GET /api/v1/admin/dashboard/stats — returns operational statistics for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.totalPackages).toBe(12);
      expect(json.data.publishedPackages).toBe(10);
      expect(json.data.totalBookings).toBe(150);
      expect(json.data.confirmedBookings).toBe(120);
      expect(json.data.inventoryUtilizationPercent).toBe(78.5);

      // Explicitly verify that ZERO revenue fields exist
      expect(json.data.grossRevenue).toBeUndefined();
      expect(json.data.netRevenue).toBeUndefined();
      expect(json.data.totalRevenue).toBeUndefined();
      expect(json.data.refundedRevenue).toBeUndefined();
    });

    it('GET /api/v1/admin/dashboard/stats — returns 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/v1/admin/dashboard/stats — returns 403 when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard/stats',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
