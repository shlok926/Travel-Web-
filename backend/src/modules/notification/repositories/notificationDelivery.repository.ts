import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import {
  NotificationChannel,
  NotificationType,
  NotificationStatus,
  SafeNotificationError,
  AdminNotificationListQueryDto,
  AppError,
  ErrorCodes,
} from '../../../../../shared/src/index.js';

// ============================================================
// Phase 8 Step 3 — Notification Delivery Persistence Repository
// ============================================================

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface NotificationDeliveryEntity {
  id: string;
  idempotencyKey: string;
  recipientEmail: string;
  recipientPhone: string | null;
  channel: NotificationChannel;
  notificationType: NotificationType;
  referenceId: string;
  subject: string;
  status: NotificationStatus;
  providerName: string;
  providerMessageId: string | null;
  retryCount: number;
  errorDetails: SafeNotificationError | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDeliveryRow {
  id: string;
  idempotency_key: string;
  recipient_email: string;
  recipient_phone: string | null;
  channel: string;
  notification_type: string;
  reference_id: string;
  subject: string;
  status: string;
  provider_name: string;
  provider_message_id: string | null;
  retry_count: number | string;
  error_details: SafeNotificationError | string | null;
  sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateNotificationDeliveryData {
  id?: string;
  idempotencyKey: string;
  recipientEmail: string;
  recipientPhone?: string | null;
  channel?: NotificationChannel;
  notificationType: NotificationType;
  referenceId: string;
  subject: string;
  status?: NotificationStatus;
  providerName: string;
  providerMessageId?: string | null;
  retryCount?: number;
  errorDetails?: SafeNotificationError | null;
  sentAt?: Date | null;
}

export interface UpdateNotificationDeliveryStatusData {
  status: NotificationStatus;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  errorDetails?: SafeNotificationError | null;
  retryCount?: number;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const NOTIFICATION_DELIVERY_PROJECTION = `
  id,
  idempotency_key,
  recipient_email,
  recipient_phone,
  channel,
  notification_type,
  reference_id,
  subject,
  status,
  provider_name,
  provider_message_id,
  retry_count,
  error_details,
  sent_at,
  created_at,
  updated_at
`;

function parseJsonField<T>(field: T | string | null | undefined): T | null {
  if (field === null || field === undefined) return null;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return field as unknown as T;
    }
  }
  return field;
}

function mapRowToNotificationDeliveryEntity(
  row: NotificationDeliveryRow,
): NotificationDeliveryEntity {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone ?? null,
    channel: row.channel as NotificationChannel,
    notificationType: row.notification_type as NotificationType,
    referenceId: row.reference_id,
    subject: row.subject,
    status: row.status as NotificationStatus,
    providerName: row.provider_name,
    providerMessageId: row.provider_message_id ?? null,
    retryCount: Number(row.retry_count ?? 0),
    errorDetails: parseJsonField<SafeNotificationError>(row.error_details),
    sentAt: row.sent_at
      ? row.sent_at instanceof Date
        ? row.sent_at
        : new Date(row.sent_at)
      : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

// ============================================================
// 3. NotificationDeliveryRepository Class
// ============================================================

export class NotificationDeliveryRepository {
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
   * Persists a new notification delivery record.
   * Deterministically handles unique idempotency key collisions:
   * - If same key + matching logical attributes: returns existing delivery entity (idempotent reuse).
   * - If same key + conflicting attributes: throws AppError.conflict(IDEMPOTENCY_CONFLICT).
   */
  async create(
    data: CreateNotificationDeliveryData,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO notification_deliveries (
        idempotency_key,
        recipient_email,
        recipient_phone,
        channel,
        notification_type,
        reference_id,
        subject,
        status,
        provider_name,
        provider_message_id,
        retry_count,
        error_details,
        sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${NOTIFICATION_DELIVERY_PROJECTION};
    `;

    const values = [
      data.idempotencyKey,
      data.recipientEmail.trim().toLowerCase(),
      data.recipientPhone ?? null,
      data.channel ?? 'EMAIL',
      data.notificationType,
      data.referenceId,
      data.subject,
      data.status ?? 'PENDING',
      data.providerName,
      data.providerMessageId ?? null,
      data.retryCount ?? 0,
      data.errorDetails ? JSON.stringify(data.errorDetails) : null,
      data.sentAt ?? null,
    ];

    try {
      const result = await executor.query<NotificationDeliveryRow>(sql, values);
      if (!result.rows[0]) {
        throw new Error('Failed to insert notification delivery record');
      }
      return mapRowToNotificationDeliveryEntity(result.rows[0]);
    } catch (err: unknown) {
      const pgError = err as { code?: string; message?: string };
      if (pgError.code === '23505') {
        // Unique violation on idempotency_key
        const existing = await this.findByIdempotencyKey(data.idempotencyKey, client);
        if (existing) {
          // Verify logical congruence
          const isMatching =
            existing.notificationType === data.notificationType &&
            existing.referenceId === data.referenceId &&
            existing.recipientEmail.toLowerCase() === data.recipientEmail.trim().toLowerCase();

          if (isMatching) {
            return existing;
          }

          throw AppError.conflict(
            `Idempotency key collision for key "${data.idempotencyKey}" with conflicting notification attributes`,
            ErrorCodes.IDEMPOTENCY_CONFLICT,
          );
        }
      }
      throw err;
    }
  }

  /**
   * Finds a delivery record by primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<NotificationDeliveryEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${NOTIFICATION_DELIVERY_PROJECTION}
      FROM notification_deliveries
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await executor.query<NotificationDeliveryRow>(sql, [id]);
    if (!result.rows[0]) return null;
    return mapRowToNotificationDeliveryEntity(result.rows[0]);
  }

  /**
   * Finds a delivery record by unique idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${NOTIFICATION_DELIVERY_PROJECTION}
      FROM notification_deliveries
      WHERE idempotency_key = $1
      LIMIT 1;
    `;

    const result = await executor.query<NotificationDeliveryRow>(sql, [idempotencyKey]);
    if (!result.rows[0]) return null;
    return mapRowToNotificationDeliveryEntity(result.rows[0]);
  }

  /**
   * Finds all delivery records associated with a generic domain reference ID.
   */
  async findByReferenceId(
    referenceId: string,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${NOTIFICATION_DELIVERY_PROJECTION}
      FROM notification_deliveries
      WHERE reference_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<NotificationDeliveryRow>(sql, [referenceId]);
    return result.rows.map(mapRowToNotificationDeliveryEntity);
  }

  /**
   * Updates delivery status, diagnostics, sent timestamp, and provider message ID.
   */
  async updateStatus(
    id: string,
    data: UpdateNotificationDeliveryStatusData,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity | null> {
    const executor = this.getExecutor(client);

    const setClauses: string[] = ['status = $2'];
    const values: unknown[] = [id, data.status];
    let paramIndex = 3;

    if (data.providerMessageId !== undefined) {
      setClauses.push(`provider_message_id = $${paramIndex++}`);
      values.push(data.providerMessageId);
    }

    if (data.sentAt !== undefined) {
      setClauses.push(`sent_at = $${paramIndex++}`);
      values.push(data.sentAt);
    }

    if (data.errorDetails !== undefined) {
      setClauses.push(`error_details = $${paramIndex++}`);
      values.push(data.errorDetails ? JSON.stringify(data.errorDetails) : null);
    }

    if (data.retryCount !== undefined) {
      setClauses.push(`retry_count = $${paramIndex++}`);
      values.push(Math.max(0, data.retryCount));
    }

    const sql = `
      UPDATE notification_deliveries
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING ${NOTIFICATION_DELIVERY_PROJECTION};
    `;

    const result = await executor.query<NotificationDeliveryRow>(sql, values);
    if (!result.rows[0]) return null;
    return mapRowToNotificationDeliveryEntity(result.rows[0]);
  }

  /**
   * Increments retry count and sets status to RETRYING with structured error diagnostic.
   */
  async incrementRetryCount(
    id: string,
    errorDetails?: SafeNotificationError | null,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE notification_deliveries
      SET
        retry_count = retry_count + 1,
        status = 'RETRYING',
        error_details = $2
      WHERE id = $1
      RETURNING ${NOTIFICATION_DELIVERY_PROJECTION};
    `;

    const values = [id, errorDetails ? JSON.stringify(errorDetails) : null];
    const result = await executor.query<NotificationDeliveryRow>(sql, values);
    if (!result.rows[0]) return null;
    return mapRowToNotificationDeliveryEntity(result.rows[0]);
  }

  /**
   * Marks a delivery as SENT with provider message ID and sent_at timestamp.
   */
  async markSent(
    id: string,
    providerMessageId?: string | null,
    sentAt: Date = new Date(),
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity | null> {
    return this.updateStatus(
      id,
      {
        status: 'SENT',
        providerMessageId: providerMessageId ?? null,
        sentAt,
        errorDetails: null,
      },
      client,
    );
  }

  /**
   * Marks a delivery as FAILED with safe diagnostic error details.
   */
  async markFailed(
    id: string,
    errorDetails: SafeNotificationError,
    client?: pg.PoolClient,
  ): Promise<NotificationDeliveryEntity | null> {
    return this.updateStatus(
      id,
      {
        status: 'FAILED',
        errorDetails,
      },
      client,
    );
  }

  /**
   * Lists and paginates notification delivery records with safe parameterized filtering.
   */
  async list(
    query: AdminNotificationListQueryDto,
    client?: pg.PoolClient,
  ): Promise<{ items: NotificationDeliveryEntity[]; total: number }> {
    const executor = this.getExecutor(client);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(query.status);
    }

    if (query.notificationType) {
      conditions.push(`notification_type = $${paramIndex++}`);
      values.push(query.notificationType);
    }

    if (query.channel) {
      conditions.push(`channel = $${paramIndex++}`);
      values.push(query.channel);
    }

    if (query.referenceId) {
      conditions.push(`reference_id = $${paramIndex++}`);
      values.push(query.referenceId);
    }

    if (query.recipientEmail) {
      conditions.push(`recipient_email = $${paramIndex++}`);
      values.push(query.recipientEmail.trim().toLowerCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::text as count
      FROM notification_deliveries
      ${whereClause};
    `;

    const countResult = await executor.query<{ count: string }>(countSql, values);
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const listSql = `
      SELECT ${NOTIFICATION_DELIVERY_PROJECTION}
      FROM notification_deliveries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const listValues = [...values, limit, offset];
    const listResult = await executor.query<NotificationDeliveryRow>(listSql, listValues);

    return {
      items: listResult.rows.map(mapRowToNotificationDeliveryEntity),
      total,
    };
  }
}
