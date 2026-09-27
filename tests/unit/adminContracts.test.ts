import { describe, it, expect } from 'vitest';
import {
  adminAuditLogDtoSchema,
  adminAuditLogListQuerySchema,
  adminDashboardStatsSchema,
  auditActionSchema,
  auditEntityTypeSchema,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ErrorCodes,
} from '../../shared/src/index.js';

describe('Admin & Operations Shared Contracts', () => {
  describe('Audit Actions & Entity Types', () => {
    it('should validate known audit action strings', () => {
      for (const action of AUDIT_ACTIONS) {
        expect(auditActionSchema.safeParse(action).success).toBe(true);
      }
    });

    it('should reject empty audit actions', () => {
      expect(auditActionSchema.safeParse('').success).toBe(false);
      expect(auditActionSchema.safeParse('   ').success).toBe(false);
    });

    it('should validate known audit entity type strings', () => {
      for (const entityType of AUDIT_ENTITY_TYPES) {
        expect(auditEntityTypeSchema.safeParse(entityType).success).toBe(true);
      }
    });

    it('should reject empty audit entity types', () => {
      expect(auditEntityTypeSchema.safeParse('').success).toBe(false);
      expect(auditEntityTypeSchema.safeParse('   ').success).toBe(false);
    });
  });

  describe('AdminAuditLogDto Schema', () => {
    const validLog = {
      id: 'a0000000-0000-0000-0000-000000000001',
      adminId: 'b0000000-0000-0000-0000-000000000002',
      action: 'PACKAGE_UPDATE',
      entityType: 'PACKAGE',
      entityId: 'c0000000-0000-0000-0000-000000000003',
      details: { field: 'price', old: 1000, new: 1200 },
      ipAddress: '192.168.1.1',
      createdAt: '2026-09-28T00:00:00.000Z',
    };

    it('should accept valid audit log dto', () => {
      const parsed = adminAuditLogDtoSchema.safeParse(validLog);
      expect(parsed.success).toBe(true);
    });

    it('should accept nullable details and ipAddress', () => {
      const minimalLog = {
        id: 'a0000000-0000-0000-0000-000000000001',
        adminId: 'b0000000-0000-0000-0000-000000000002',
        action: 'PACKAGE_DELETE',
        entityType: 'CMS_SLIDER',
        entityId: 'slider-123',
        details: null,
        ipAddress: null,
        createdAt: '2026-09-28T00:00:00.000Z',
      };
      const parsed = adminAuditLogDtoSchema.safeParse(minimalLog);
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid UUIDs for id and adminId', () => {
      expect(adminAuditLogDtoSchema.safeParse({ ...validLog, id: 'invalid-id' }).success).toBe(
        false,
      );
      expect(
        adminAuditLogDtoSchema.safeParse({ ...validLog, adminId: 'invalid-uuid' }).success,
      ).toBe(false);
    });

    it('should reject empty entityId or action', () => {
      expect(adminAuditLogDtoSchema.safeParse({ ...validLog, entityId: '' }).success).toBe(false);
      expect(adminAuditLogDtoSchema.safeParse({ ...validLog, action: '' }).success).toBe(false);
    });
  });

  describe('AdminAuditLogListQuery Schema', () => {
    it('should apply default pagination', () => {
      const parsed = adminAuditLogListQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
      }
    });

    it('should coerce string numbers for page and limit', () => {
      const parsed = adminAuditLogListQuerySchema.safeParse({ page: '2', limit: '50' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.limit).toBe(50);
      }
    });

    it('should reject page < 1 and limit > 100', () => {
      expect(adminAuditLogListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
      expect(adminAuditLogListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it('should validate filter parameters with dateFrom and dateTo', () => {
      const parsed = adminAuditLogListQuerySchema.safeParse({
        adminId: 'b0000000-0000-0000-0000-000000000002',
        action: 'BOOKING_UPDATE',
        entityType: 'BOOKING',
        entityId: 'c0000000-0000-0000-0000-000000000003',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-28T23:59:59.999Z',
      });
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid date strings', () => {
      expect(adminAuditLogListQuerySchema.safeParse({ dateFrom: 'invalid-date' }).success).toBe(
        false,
      );
      expect(adminAuditLogListQuerySchema.safeParse({ dateTo: 'not-a-date' }).success).toBe(false);
    });
  });

  describe('AdminDashboardStats Schema (Revenue Invariant Enforcement)', () => {
    const validStats = {
      totalPackages: 15,
      publishedPackages: 12,
      draftPackages: 3,
      totalDestinations: 10,
      totalThemes: 7,
      totalDepartures: 45,
      openDepartures: 20,
      upcomingDeparturesCount: 18,
      totalBookings: 120,
      confirmedBookings: 95,
      awaitingPaymentBookings: 10,
      cancelledBookings: 10,
      pendingCancellations: 4,
      inventoryUtilizationPercent: 73.33,
    };

    it('should accept valid non-revenue operational counts', () => {
      const parsed = adminDashboardStatsSchema.safeParse(validStats);
      expect(parsed.success).toBe(true);
    });

    it('should reject negative counts', () => {
      const invalidStats = {
        ...validStats,
        totalPackages: -1,
      };
      expect(adminDashboardStatsSchema.safeParse(invalidStats).success).toBe(false);
    });

    it('should reject utilization percent outside 0-100', () => {
      expect(
        adminDashboardStatsSchema.safeParse({ ...validStats, inventoryUtilizationPercent: -1 })
          .success,
      ).toBe(false);
      expect(
        adminDashboardStatsSchema.safeParse({ ...validStats, inventoryUtilizationPercent: 101 })
          .success,
      ).toBe(false);
    });

    it('should verify schema strictly avoids revenue formulas', () => {
      const schemaShape = adminDashboardStatsSchema.shape;
      expect('grossRevenue' in schemaShape).toBe(false);
      expect('netRevenue' in schemaShape).toBe(false);
      expect('revenue' in schemaShape).toBe(false);
    });
  });

  describe('Canonical Error Codes', () => {
    it('should have Phase 7 resource not found error codes defined', () => {
      expect(ErrorCodes.HERO_SLIDER_NOT_FOUND).toBe('HERO_SLIDER_NOT_FOUND');
      expect(ErrorCodes.CMS_PAGE_NOT_FOUND).toBe('CMS_PAGE_NOT_FOUND');
      expect(ErrorCodes.AUDIT_LOG_NOT_FOUND).toBe('AUDIT_LOG_NOT_FOUND');
    });
  });
});
