import type pg from 'pg';
import { z } from 'zod';
import {
  AdminAuditLogDto,
  AdminAuditLogListQueryDto,
  AppError,
  ErrorCodes,
  adminAuditLogListQuerySchema,
  auditActionSchema,
  auditEntityTypeSchema,
} from '../../../../../shared/src/index.js';
import {
  AdminAuditLogRepository,
  toAdminAuditLogDto,
} from '../repositories/adminAuditLog.repository.js';

export interface CreateAuditLogParams {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface PaginatedAdminAuditLogsResult {
  items: AdminAuditLogDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AdminAuditLogService {
  constructor(private readonly auditRepo: AdminAuditLogRepository) {}

  /**
   * Records an append-only audit event.
   * Admin identity and context MUST come from trusted server-side authentication context.
   */
  async logAction(params: CreateAuditLogParams, client?: pg.PoolClient): Promise<AdminAuditLogDto> {
    z.string().uuid('Admin ID must be a valid UUID').parse(params.adminId);
    auditActionSchema.parse(params.action);
    auditEntityTypeSchema.parse(params.entityType);

    const entity = await this.auditRepo.create(
      {
        adminId: params.adminId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details,
        ipAddress: params.ipAddress,
      },
      client,
    );

    return toAdminAuditLogDto(entity);
  }

  /**
   * Find an audit log by ID.
   */
  async getLogById(id: string): Promise<AdminAuditLogDto> {
    z.string().uuid('Invalid audit log ID format').parse(id);

    const entity = await this.auditRepo.findById(id);
    if (!entity) {
      throw AppError.notFound(
        `Audit log record with ID '${id}' was not found.`,
        ErrorCodes.AUDIT_LOG_NOT_FOUND,
      );
    }

    return toAdminAuditLogDto(entity);
  }

  /**
   * List audit logs with pagination and dimensional filters.
   */
  async listLogs(query: AdminAuditLogListQueryDto = {}): Promise<PaginatedAdminAuditLogsResult> {
    const validated = adminAuditLogListQuerySchema.parse(query);
    const page = validated.page ?? 1;
    const limit = validated.limit ?? 20;

    const { items, total } = await this.auditRepo.findAll({
      page,
      limit,
      adminId: validated.adminId,
      action: validated.action,
      entityType: validated.entityType,
      entityId: validated.entityId,
      dateFrom: validated.dateFrom,
      dateTo: validated.dateTo,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map(toAdminAuditLogDto),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
