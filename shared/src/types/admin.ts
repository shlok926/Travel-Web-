// ============================================================
// Phase 7 Step 2 — Shared Admin, Operations & Audit Contracts & DTOs
// ============================================================

/**
 * Controlled Audit Action Constants: Standardized operational actions for audit logging.
 */
export const AUDIT_ACTIONS = [
  'PACKAGE_CREATE',
  'PACKAGE_UPDATE',
  'PACKAGE_PUBLISH',
  'PACKAGE_UNPUBLISH',
  'ITINERARY_UPDATE',
  'DEPARTURE_CREATE',
  'DEPARTURE_UPDATE',
  'DEPARTURE_DELETE',
  'CANCELLATION_AUTHORIZE',
  'CANCELLATION_REJECT',
  'CMS_SLIDER_CREATE',
  'CMS_SLIDER_UPDATE',
  'CMS_SLIDER_DELETE',
  'CMS_PAGE_CREATE',
  'CMS_PAGE_UPDATE',
  'CMS_PAGE_DELETE',
  'DESTINATION_CREATE',
  'DESTINATION_UPDATE',
  'DESTINATION_PUBLISH',
  'DESTINATION_UNPUBLISH',
  'THEME_CREATE',
  'THEME_UPDATE',
  'THEME_DELETE',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {});

/**
 * Controlled Audit Entity Types: Target domain resources for administrative actions.
 */
export const AUDIT_ENTITY_TYPES = [
  'PACKAGE',
  'DEPARTURE',
  'BOOKING',
  'CANCELLATION',
  'CMS_SLIDER',
  'CMS_PAGE',
  'DESTINATION',
  'THEME',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number] | (string & {});

/**
 * AdminAuditLogDto: Represents an append-only audit log record.
 */
export interface AdminAuditLogDto {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * AdminAuditLogListQueryDto: Query parameters for filtering and paginating audit logs.
 */
export interface AdminAuditLogListQueryDto {
  page?: number;
  limit?: number;
  adminId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * AdminDashboardStatsDto: Operational KPI summary counts and utilization metrics.
 * Note: Revenue aggregation semantics remain [UNKNOWN] and are intentionally excluded
 * to preserve Phase 6 financial authority without premature assumptions.
 */
export interface AdminDashboardStatsDto {
  totalPackages: number;
  publishedPackages: number;
  draftPackages: number;
  totalDestinations: number;
  totalThemes: number;
  totalDepartures: number;
  openDepartures: number;
  upcomingDeparturesCount: number;
  totalBookings: number;
  confirmedBookings: number;
  awaitingPaymentBookings: number;
  cancelledBookings: number;
  pendingCancellations: number;
  inventoryUtilizationPercent: number;
}
