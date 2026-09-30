import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  AdminAuditLogRepository,
  AdminDashboardRepository,
} from '../../backend/src/modules/admin/repositories/index.js';
import {
  AdminAuditLogService,
  AdminDashboardService,
} from '../../backend/src/modules/admin/services/index.js';
import { AppError } from '../../shared/src/index.js';

describe('Phase 7 Step 3 — Admin Audit & Dashboard Repositories & Services Unit Tests', () => {
  let mockDb: any;
  let auditRepo: AdminAuditLogRepository;
  let dashboardRepo: AdminDashboardRepository;
  let auditService: AdminAuditLogService;
  let dashboardService: AdminDashboardService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    auditRepo = new AdminAuditLogRepository(mockDb as unknown as DatabaseService);
    dashboardRepo = new AdminDashboardRepository(mockDb as unknown as DatabaseService);
    auditService = new AdminAuditLogService(auditRepo);
    dashboardService = new AdminDashboardService(dashboardRepo);
  });

  // ============================================================
  // 1. Admin Audit Log Repository & Service
  // ============================================================
  describe('AdminAuditLogRepository & AdminAuditLogService', () => {
    const sampleAuditRow = {
      id: 'd0000000-0000-0000-0000-000000000001',
      admin_id: 'e0000000-0000-0000-0000-000000000001',
      action: 'PACKAGE_PUBLISH',
      entity_type: 'PACKAGE',
      entity_id: 'f0000000-0000-0000-0000-000000000001',
      details: { isPublished: true },
      ip_address: '192.168.1.1',
      created_at: new Date('2026-09-28T00:00:00.000Z'),
    };

    it('should record an append-only audit log entry with trusted server context', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleAuditRow], rowCount: 1 });

      const result = await auditService.logAction({
        adminId: 'e0000000-0000-0000-0000-000000000001',
        action: 'PACKAGE_PUBLISH',
        entityType: 'PACKAGE',
        entityId: 'f0000000-0000-0000-0000-000000000001',
        details: { isPublished: true },
        ipAddress: '192.168.1.1',
      });

      expect(result.id).toBe(sampleAuditRow.id);
      expect(result.adminId).toBe(sampleAuditRow.admin_id);
      expect(result.action).toBe('PACKAGE_PUBLISH');
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should retrieve audit log by ID', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleAuditRow], rowCount: 1 });

      const result = await auditService.getLogById(sampleAuditRow.id);
      expect(result.id).toBe(sampleAuditRow.id);
      expect(result.action).toBe('PACKAGE_PUBLISH');
    });

    it('should throw NOT_FOUND (AUDIT_LOG_NOT_FOUND) when log does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(auditService.getLogById('d0000000-0000-0000-0000-000000000099')).rejects.toThrow(
        AppError,
      );
    });

    it('should list audit logs with multi-dimensional filtering and pagination', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 }) // count query
        .mockResolvedValueOnce({ rows: [sampleAuditRow], rowCount: 1 }); // list query

      const result = await auditService.listLogs({
        page: 1,
        limit: 10,
        action: 'PACKAGE_PUBLISH',
        entityType: 'PACKAGE',
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]?.action).toBe('PACKAGE_PUBLISH');
    });

    it('should verify audit repository does not expose update or delete methods', () => {
      expect((auditRepo as any).update).toBeUndefined();
      expect((auditRepo as any).delete).toBeUndefined();
    });
  });

  // ============================================================
  // 2. Admin Dashboard Repository & Service
  // ============================================================
  describe('AdminDashboardRepository & AdminDashboardService (Revenue Invariant Enforcement)', () => {
    const sampleStatsRow = {
      total_packages: 12,
      published_packages: 10,
      draft_packages: 2,
      total_destinations: 8,
      total_themes: 5,
      total_departures: 30,
      open_departures: 15,
      upcoming_departures: 12,
      total_bookings: 85,
      confirmed_bookings: 70,
      awaiting_payment_bookings: 5,
      cancelled_bookings: 10,
      pending_cancellations: 3,
      inventory_utilization_percent: 68.5,
    };

    it('should compute operational statistics and validate output structure', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleStatsRow], rowCount: 1 });

      const stats = await dashboardService.getDashboardStats();

      expect(stats.totalPackages).toBe(12);
      expect(stats.publishedPackages).toBe(10);
      expect(stats.draftPackages).toBe(2);
      expect(stats.totalDestinations).toBe(8);
      expect(stats.totalThemes).toBe(5);
      expect(stats.totalDepartures).toBe(30);
      expect(stats.openDepartures).toBe(15);
      expect(stats.upcomingDeparturesCount).toBe(12);
      expect(stats.totalBookings).toBe(85);
      expect(stats.confirmedBookings).toBe(70);
      expect(stats.pendingCancellations).toBe(3);
      expect(stats.inventoryUtilizationPercent).toBe(68.5);
    });

    it('should verify NO revenue aggregation fields exist in dashboard stats output', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleStatsRow], rowCount: 1 });

      const stats = await dashboardService.getDashboardStats();

      expect((stats as any).grossRevenue).toBeUndefined();
      expect((stats as any).netRevenue).toBeUndefined();
      expect((stats as any).totalRevenue).toBeUndefined();
      expect((stats as any).refundedRevenue).toBeUndefined();
      expect((stats as any).revenue).toBeUndefined();
    });
  });
});
