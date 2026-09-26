import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { CancellationStatus } from '../../../../../shared/src/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface CancellationRequestEntity {
  id: string;
  bookingId: string;
  requestedBy: string;
  cancellationReason: string;
  calculatedRefundAmount: number; // Minor units
  calculatedPenaltyAmount: number; // Minor units
  status: CancellationStatus;
  adminNotes: string | null;
  authorizedBy: string | null;
  authorizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CancellationRequestRow {
  id: string;
  booking_id: string;
  requested_by: string;
  cancellation_reason: string;
  calculated_refund_amount: string | number;
  calculated_penalty_amount: string | number;
  status: string;
  admin_notes: string | null;
  authorized_by: string | null;
  authorized_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string | number;
}

export interface CreateCancellationRequestData {
  id?: string;
  bookingId: string;
  requestedBy: string;
  cancellationReason: string;
  calculatedRefundAmount?: number;
  calculatedPenaltyAmount?: number;
  status?: CancellationStatus;
  adminNotes?: string | null;
  authorizedBy?: string | null;
  authorizedAt?: Date | string | null;
}

export interface CancellationListOptions {
  status?: CancellationStatus;
  page?: number;
  limit?: number;
}

export interface CancellationListResult {
  items: CancellationRequestEntity[];
  total: number;
}

export interface UpdateCancellationGuardedData {
  adminNotes?: string | null;
  authorizedBy?: string | null;
  authorizedAt?: Date | string | null;
  calculatedRefundAmount?: number;
  calculatedPenaltyAmount?: number;
}

export interface RecordAuthorizationData {
  authorizedBy: string;
  authorizedAt?: Date | string;
  adminNotes?: string | null;
  overrideRefundAmount?: number;
  overridePenaltyAmount?: number;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const CANCELLATION_REQ_PROJECTION = `
  id,
  booking_id,
  requested_by,
  cancellation_reason,
  calculated_refund_amount,
  calculated_penalty_amount,
  status,
  admin_notes,
  authorized_by,
  authorized_at,
  created_at,
  updated_at
`;

function mapRowToCancellationRequestEntity(row: CancellationRequestRow): CancellationRequestEntity {
  return {
    id: row.id,
    bookingId: row.booking_id,
    requestedBy: row.requested_by,
    cancellationReason: row.cancellation_reason,
    calculatedRefundAmount: Number(row.calculated_refund_amount),
    calculatedPenaltyAmount: Number(row.calculated_penalty_amount),
    status: row.status as CancellationStatus,
    adminNotes: row.admin_notes ?? null,
    authorizedBy: row.authorized_by ?? null,
    authorizedAt: row.authorized_at
      ? row.authorized_at instanceof Date
        ? row.authorized_at
        : new Date(row.authorized_at)
      : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

// ============================================================
// 3. CancellationRequestRepository Class
// ============================================================

export class CancellationRequestRepository {
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
   * Persists a new cancellation request record.
   */
  async create(
    data: CreateCancellationRequestData,
    client?: pg.PoolClient,
  ): Promise<CancellationRequestEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO cancellation_requests (
        booking_id,
        requested_by,
        cancellation_reason,
        calculated_refund_amount,
        calculated_penalty_amount,
        status,
        admin_notes,
        authorized_by,
        authorized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${CANCELLATION_REQ_PROJECTION};
    `;

    const values = [
      data.bookingId,
      data.requestedBy,
      data.cancellationReason,
      data.calculatedRefundAmount ?? 0,
      data.calculatedPenaltyAmount ?? 0,
      data.status ?? 'PENDING_APPROVAL',
      data.adminNotes ?? null,
      data.authorizedBy ?? null,
      data.authorizedAt ?? null,
    ];

    const result = await executor.query<CancellationRequestRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create cancellation request: no row returned');
    }
    return mapRowToCancellationRequestEntity(row);
  }

  /**
   * Finds a cancellation request by primary UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<CancellationRequestEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${CANCELLATION_REQ_PROJECTION}
      FROM cancellation_requests
      WHERE id = $1;
    `;

    const result = await executor.query<CancellationRequestRow>(sql, [id]);
    const row = result.rows[0];
    return row ? mapRowToCancellationRequestEntity(row) : null;
  }

  /**
   * Finds all cancellation requests for a given booking ID.
   */
  async findByBookingId(
    bookingId: string,
    client?: pg.PoolClient,
  ): Promise<CancellationRequestEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${CANCELLATION_REQ_PROJECTION}
      FROM cancellation_requests
      WHERE booking_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<CancellationRequestRow>(sql, [bookingId]);
    return result.rows.map(mapRowToCancellationRequestEntity);
  }

  /**
   * Lists cancellation requests with pagination and optional status filter.
   */
  async list(
    options: CancellationListOptions = {},
    client?: pg.PoolClient,
  ): Promise<CancellationListResult> {
    const executor = this.getExecutor(client);
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (options.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        ${CANCELLATION_REQ_PROJECTION},
        COUNT(*) OVER() AS total_count
      FROM cancellation_requests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    values.push(limit, offset);

    const result = await executor.query<CancellationRequestRow>(sql, values);
    const total = result.rows.length > 0 ? Number(result.rows[0]?.total_count ?? 0) : 0;
    const items = result.rows.map(mapRowToCancellationRequestEntity);

    return { items, total };
  }

  /**
   * Guarded status transition for cancellation requests (e.g. from PENDING_APPROVAL to AUTHORIZED or REJECTED).
   */
  async updateStatusGuarded(
    id: string,
    fromStatus: CancellationStatus | CancellationStatus[],
    toStatus: CancellationStatus,
    updateData?: UpdateCancellationGuardedData,
    client?: pg.PoolClient,
  ): Promise<CancellationRequestEntity | null> {
    const executor = this.getExecutor(client);
    const fromStatuses = Array.isArray(fromStatus) ? fromStatus : [fromStatus];

    const setClauses: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [toStatus, id, fromStatuses];
    let paramIndex = 4;

    if (updateData?.adminNotes !== undefined) {
      setClauses.push(`admin_notes = $${paramIndex++}`);
      values.push(updateData.adminNotes);
    }

    if (updateData?.authorizedBy !== undefined) {
      setClauses.push(`authorized_by = $${paramIndex++}`);
      values.push(updateData.authorizedBy);
    }

    if (updateData?.authorizedAt !== undefined) {
      setClauses.push(`authorized_at = $${paramIndex++}`);
      values.push(updateData.authorizedAt);
    }

    if (updateData?.calculatedRefundAmount !== undefined) {
      setClauses.push(`calculated_refund_amount = $${paramIndex++}`);
      values.push(updateData.calculatedRefundAmount);
    }

    if (updateData?.calculatedPenaltyAmount !== undefined) {
      setClauses.push(`calculated_penalty_amount = $${paramIndex++}`);
      values.push(updateData.calculatedPenaltyAmount);
    }

    const sql = `
      UPDATE cancellation_requests
      SET ${setClauses.join(', ')}
      WHERE id = $2
        AND status = ANY($3::cancellation_status[])
      RETURNING ${CANCELLATION_REQ_PROJECTION};
    `;

    const result = await executor.query<CancellationRequestRow>(sql, values);
    const row = result.rows[0];
    return row ? mapRowToCancellationRequestEntity(row) : null;
  }

  /**
   * Records admin authorization of a cancellation request atomically.
   */
  async recordAuthorization(
    id: string,
    data: RecordAuthorizationData,
    client?: pg.PoolClient,
  ): Promise<CancellationRequestEntity | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = [
      "status = 'AUTHORIZED'",
      'authorized_by = $2',
      'authorized_at = COALESCE($3, NOW())',
      'updated_at = NOW()',
    ];
    const values: unknown[] = [id, data.authorizedBy, data.authorizedAt ?? null];
    let paramIndex = 4;

    if (data.adminNotes !== undefined) {
      setClauses.push(`admin_notes = $${paramIndex++}`);
      values.push(data.adminNotes);
    }

    if (data.overrideRefundAmount !== undefined) {
      setClauses.push(`calculated_refund_amount = $${paramIndex++}`);
      values.push(data.overrideRefundAmount);
    }

    if (data.overridePenaltyAmount !== undefined) {
      setClauses.push(`calculated_penalty_amount = $${paramIndex++}`);
      values.push(data.overridePenaltyAmount);
    }

    const sql = `
      UPDATE cancellation_requests
      SET ${setClauses.join(', ')}
      WHERE id = $1
        AND status = 'PENDING_APPROVAL'
      RETURNING ${CANCELLATION_REQ_PROJECTION};
    `;

    const result = await executor.query<CancellationRequestRow>(sql, values);
    const row = result.rows[0];
    return row ? mapRowToCancellationRequestEntity(row) : null;
  }
}
