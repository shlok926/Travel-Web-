import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface PaymentEventEntity {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt: Date;
  createdAt: Date;
}

export interface PaymentEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown> | string;
  processed_at: Date | string;
  created_at: Date | string;
}

export interface CreatePaymentEventData {
  id?: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt?: Date | string;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const PAYMENT_EVENT_PROJECTION = `
  id,
  provider,
  event_id,
  event_type,
  payload,
  processed_at,
  created_at
`;

function parseJsonField<T>(field: T | string): T {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return field as unknown as T;
    }
  }
  return field;
}

function mapRowToPaymentEventEntity(row: PaymentEventRow): PaymentEventEntity {
  return {
    id: row.id,
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    payload: parseJsonField<Record<string, unknown>>(row.payload),
    processedAt: row.processed_at instanceof Date ? row.processed_at : new Date(row.processed_at),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

// ============================================================
// 3. PaymentEventRepository Class
// ============================================================

export class PaymentEventRepository {
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
   * Persists a webhook event record.
   * Throws on unique constraint violation (provider, event_id).
   */
  async create(data: CreatePaymentEventData, client?: pg.PoolClient): Promise<PaymentEventEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO payment_events (
        provider,
        event_id,
        event_type,
        payload,
        processed_at
      ) VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
      RETURNING ${PAYMENT_EVENT_PROJECTION};
    `;

    const values = [
      data.provider,
      data.eventId,
      data.eventType,
      JSON.stringify(data.payload),
      data.processedAt ?? null,
    ];

    const result = await executor.query<PaymentEventRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create payment event: no row returned');
    }
    return mapRowToPaymentEventEntity(row);
  }

  /**
   * Finds a webhook event by compound uniqueness key (provider, event_id).
   */
  async findByProviderAndEventId(
    provider: string,
    eventId: string,
    client?: pg.PoolClient,
  ): Promise<PaymentEventEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_EVENT_PROJECTION}
      FROM payment_events
      WHERE provider = $1
        AND event_id = $2;
    `;

    const result = await executor.query<PaymentEventRow>(sql, [provider, eventId]);
    const row = result.rows[0];
    return row ? mapRowToPaymentEventEntity(row) : null;
  }

  /**
   * Checks whether a webhook event has already been recorded for (provider, event_id).
   */
  async exists(provider: string, eventId: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT 1
      FROM payment_events
      WHERE provider = $1
        AND event_id = $2
      LIMIT 1;
    `;

    const result = await executor.query(sql, [provider, eventId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Marks/updates an event's processed_at timestamp.
   */
  async markProcessed(
    id: string,
    processedAt?: Date,
    client?: pg.PoolClient,
  ): Promise<PaymentEventEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE payment_events
      SET processed_at = COALESCE($2, NOW())
      WHERE id = $1
      RETURNING ${PAYMENT_EVENT_PROJECTION};
    `;

    const result = await executor.query<PaymentEventRow>(sql, [id, processedAt ?? null]);
    const row = result.rows[0];
    return row ? mapRowToPaymentEventEntity(row) : null;
  }
}
