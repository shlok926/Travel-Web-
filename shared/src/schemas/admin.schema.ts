import { z } from 'zod';

// ISO Date regex (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================
// 1. Audit Log Schemas
// ============================================================

export const auditActionSchema = z
  .string({ required_error: 'Audit action is required' })
  .trim()
  .min(1, 'Action cannot be empty')
  .max(64, 'Action must not exceed 64 characters');

export const auditEntityTypeSchema = z
  .string({ required_error: 'Audit entity type is required' })
  .trim()
  .min(1, 'Entity type cannot be empty')
  .max(32, 'Entity type must not exceed 32 characters');

/**
 * adminAuditLogDtoSchema: Validates AdminAuditLogDto response structure.
 */
export const adminAuditLogDtoSchema = z
  .object({
    id: z.string().uuid('Invalid audit log ID format'),
    adminId: z.string().uuid('Invalid admin user ID format'),
    action: auditActionSchema,
    entityType: auditEntityTypeSchema,
    entityId: z
      .string()
      .min(1, 'Entity ID cannot be empty')
      .max(64, 'Entity ID must not exceed 64 characters'),
    details: z.record(z.unknown()).nullable(),
    ipAddress: z.string().max(45).nullable(),
    createdAt: z.string(),
  })
  .strict();

/**
 * adminAuditLogListQuerySchema: Validates query parameters for `GET /api/v1/admin/audit-logs`.
 */
export const adminAuditLogListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must not exceed 100')
      .optional()
      .default(20),
    adminId: z.string().uuid('Admin ID must be a valid UUID').optional(),
    action: z.string().trim().max(64).optional(),
    entityType: z.string().trim().max(32).optional(),
    entityId: z.string().trim().max(64).optional(),
    dateFrom: z
      .string()
      .refine((val) => ISO_DATE_REGEX.test(val) || !isNaN(Date.parse(val)), {
        message: 'dateFrom must be an ISO date (YYYY-MM-DD) or ISO datetime',
      })
      .optional(),
    dateTo: z
      .string()
      .refine((val) => ISO_DATE_REGEX.test(val) || !isNaN(Date.parse(val)), {
        message: 'dateTo must be an ISO date (YYYY-MM-DD) or ISO datetime',
      })
      .optional(),
  })
  .strict();

export type AdminAuditLogListQueryInput = z.infer<typeof adminAuditLogListQuerySchema>;

// ============================================================
// 2. Admin Dashboard Stats Schemas
// ============================================================

/**
 * adminDashboardStatsSchema: Validates operational metrics summary response.
 */
export const adminDashboardStatsSchema = z
  .object({
    totalPackages: z.number().int().nonnegative(),
    publishedPackages: z.number().int().nonnegative(),
    draftPackages: z.number().int().nonnegative(),
    totalDestinations: z.number().int().nonnegative(),
    totalThemes: z.number().int().nonnegative(),
    totalDepartures: z.number().int().nonnegative(),
    openDepartures: z.number().int().nonnegative(),
    upcomingDeparturesCount: z.number().int().nonnegative(),
    totalBookings: z.number().int().nonnegative(),
    confirmedBookings: z.number().int().nonnegative(),
    awaitingPaymentBookings: z.number().int().nonnegative(),
    cancelledBookings: z.number().int().nonnegative(),
    pendingCancellations: z.number().int().nonnegative(),
    inventoryUtilizationPercent: z.number().min(0).max(100),
  })
  .strict();
