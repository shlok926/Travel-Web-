import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { AdminAuditLogDto } from '../../../../../shared/src/index.js';

export interface AdminAuditLogEntity {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AdminAuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: Date | string;
}

export interface CreateAdminAuditLogData {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface AdminAuditLogListOptions {
  page?: number;
  limit?: number;
  adminId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function mapAdminAuditLogRowToEntity(row: AdminAuditLogRow): AdminAuditLogEntity {
  return {
    id: row.id,
    adminId: row.admin_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: new Date(row.created_at),
  };
}

export function toAdminAuditLogDto(entity: AdminAuditLogEntity): AdminAuditLogDto {
  return {
    id: entity.id,
    adminId: entity.adminId,
    action: entity.action,
    entityType: entity.entityType,
    entityId: entity.entityId ?? '',
    details: entity.details,
    ipAddress: entity.ipAddress,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class AdminAuditLogRepository {
  constructor(private readonly db: DatabaseService) {}

  private getExecutor(client?: pg.PoolClient): {
    query: <R extends pg.QueryResultRow = pg.QueryResultRow>(
      text: string,
      params?: unknown[],
    ) => Promise<pg.QueryResult<R>>;
  } {
    return client ?? this.db;
  }

  /**
   * Append-only create method for recording audit entries.
   */
  async create(
    data: CreateAdminAuditLogData,
    client?: pg.PoolClient,
  ): Promise<AdminAuditLogEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<AdminAuditLogRow>(
      `INSERT INTO admin_audit_logs (
        admin_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address,
        created_at;`,
      [
        data.adminId,
        data.action,
        data.entityType,
        data.entityId ?? null,
        data.details ? JSON.stringify(data.details) : null,
        data.ipAddress ?? null,
      ],
    );

    return mapAdminAuditLogRowToEntity(result.rows[0]!);
  }

  /**
   * Find an audit log entry by ID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<AdminAuditLogEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<AdminAuditLogRow>(
      `SELECT
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address,
        created_at
      FROM admin_audit_logs
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapAdminAuditLogRowToEntity(row) : null;
  }

  /**
   * List audit log entries with multi-dimensional filtering and pagination.
   */
  async findAll(
    options: AdminAuditLogListOptions = {},
    client?: pg.PoolClient,
  ): Promise<{ items: AdminAuditLogEntity[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      adminId,
      action,
      entityType,
      entityId,
      dateFrom,
      dateTo,
    } = options;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (adminId) {
      conditions.push(`admin_id = $${paramIndex++}`);
      params.push(adminId);
    }
    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(action);
    }
    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(entityType);
    }
    if (entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(entityId);
    }
    if (dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int as total FROM admin_audit_logs ${whereClause};`;
    const executor = this.getExecutor(client);
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    const querySql = `
      SELECT
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address,
        created_at
      FROM admin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const listResult = await executor.query<AdminAuditLogRow>(querySql, [...params, limit, offset]);
    const items = listResult.rows.map(mapAdminAuditLogRowToEntity);

    return { items, total };
  }
}
