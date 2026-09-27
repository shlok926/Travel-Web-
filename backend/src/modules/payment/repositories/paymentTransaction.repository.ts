import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import {
  PaymentStatus,
  PaymentProvider,
  SupportedCurrency,
} from '../../../../../shared/src/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface PaymentTransactionEntity {
  id: string;
  bookingId: string;
  provider: PaymentProvider;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  amount: number; // Minor units (paise/cents)
  currency: SupportedCurrency;
  status: PaymentStatus;
  idempotencyKey: string | null;
  gatewayResponsePayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTransactionRow {
  id: string;
  booking_id: string;
  provider: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  amount: string | number;
  currency: string;
  status: string;
  idempotency_key: string | null;
  gateway_response_payload: Record<string, unknown> | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreatePaymentTransactionData {
  id?: string;
  bookingId: string;
  provider: PaymentProvider;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  amount: number; // Minor units
  currency: SupportedCurrency;
  status?: PaymentStatus;
  idempotencyKey?: string | null;
  gatewayResponsePayload?: Record<string, unknown> | null;
}

export interface UpdateGatewayIdentifiersData {
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  gatewayResponsePayload?: Record<string, unknown> | null;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const PAYMENT_TX_PROJECTION = `
  id,
  booking_id,
  provider,
  gateway_order_id,
  gateway_payment_id,
  amount,
  currency,
  status,
  idempotency_key,
  gateway_response_payload,
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

function mapRowToPaymentTransactionEntity(row: PaymentTransactionRow): PaymentTransactionEntity {
  return {
    id: row.id,
    bookingId: row.booking_id,
    provider: row.provider as PaymentProvider,
    gatewayOrderId: row.gateway_order_id ?? null,
    gatewayPaymentId: row.gateway_payment_id ?? null,
    amount: Number(row.amount),
    currency: row.currency as SupportedCurrency,
    status: row.status as PaymentStatus,
    idempotencyKey: row.idempotency_key ?? null,
    gatewayResponsePayload: parseJsonField<Record<string, unknown>>(row.gateway_response_payload),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

// ============================================================
// 3. PaymentTransactionRepository Class
// ============================================================

export class PaymentTransactionRepository {
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
   * Persists a new payment transaction with server-authoritative amount & currency.
   */
  async create(
    data: CreatePaymentTransactionData,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO payment_transactions (
        booking_id,
        provider,
        gateway_order_id,
        gateway_payment_id,
        amount,
        currency,
        status,
        idempotency_key,
        gateway_response_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${PAYMENT_TX_PROJECTION};
    `;

    const values = [
      data.bookingId,
      data.provider,
      data.gatewayOrderId ?? null,
      data.gatewayPaymentId ?? null,
      data.amount,
      data.currency,
      data.status ?? 'INITIATED',
      data.idempotencyKey ?? null,
      data.gatewayResponsePayload ? JSON.stringify(data.gatewayResponsePayload) : null,
    ];

    const result = await executor.query<PaymentTransactionRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create payment transaction: no row returned');
    }
    return mapRowToPaymentTransactionEntity(row);
  }

  /**
   * Finds a payment transaction by primary UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_TX_PROJECTION}
      FROM payment_transactions
      WHERE id = $1;
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [id]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Finds all payment transactions for a given booking ID, ordered by creation time descending.
   */
  async findByBookingId(
    bookingId: string,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_TX_PROJECTION}
      FROM payment_transactions
      WHERE booking_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [bookingId]);
    return result.rows.map(mapRowToPaymentTransactionEntity);
  }

  /**
   * Finds a payment transaction by unique idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_TX_PROJECTION}
      FROM payment_transactions
      WHERE idempotency_key = $1;
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [idempotencyKey]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Finds a payment transaction by provider and gateway order ID using composite index.
   */
  async findByProviderOrderId(
    provider: string,
    gatewayOrderId: string,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_TX_PROJECTION}
      FROM payment_transactions
      WHERE provider = $1
        AND gateway_order_id = $2;
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [provider, gatewayOrderId]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Finds a payment transaction by provider and gateway payment ID using composite index.
   */
  async findByProviderPaymentId(
    provider: string,
    gatewayPaymentId: string,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${PAYMENT_TX_PROJECTION}
      FROM payment_transactions
      WHERE provider = $1
        AND gateway_payment_id = $2;
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [provider, gatewayPaymentId]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Atomically updates status with guard conditions (optimistic concurrency / state transition guard).
   * Returns null if condition not met (e.g. status was not in `fromStatus`).
   */
  async updateStatusGuarded(
    id: string,
    fromStatus: PaymentStatus | PaymentStatus[],
    toStatus: PaymentStatus,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const fromStatuses = Array.isArray(fromStatus) ? fromStatus : [fromStatus];

    const sql = `
      UPDATE payment_transactions
      SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
        AND status = ANY($3::payment_status[])
      RETURNING ${PAYMENT_TX_PROJECTION};
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [toStatus, id, fromStatuses]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Updates gateway order and/or payment identifiers and optional response payload.
   */
  async updateGatewayIdentifiers(
    id: string,
    data: UpdateGatewayIdentifiersData,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (data.gatewayOrderId !== undefined) {
      setClauses.push(`gateway_order_id = $${paramIndex++}`);
      values.push(data.gatewayOrderId);
    }

    if (data.gatewayPaymentId !== undefined) {
      setClauses.push(`gateway_payment_id = $${paramIndex++}`);
      values.push(data.gatewayPaymentId);
    }

    if (data.gatewayResponsePayload !== undefined) {
      setClauses.push(`gateway_response_payload = $${paramIndex++}`);
      values.push(data.gatewayResponsePayload ? JSON.stringify(data.gatewayResponsePayload) : null);
    }

    const sql = `
      UPDATE payment_transactions
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING ${PAYMENT_TX_PROJECTION};
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, values);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }

  /**
   * Updates the gateway response payload for audit/debugging without modifying identifiers or status.
   */
  async updateGatewayPayload(
    id: string,
    payload: Record<string, unknown>,
    client?: pg.PoolClient,
  ): Promise<PaymentTransactionEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE payment_transactions
      SET
        gateway_response_payload = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${PAYMENT_TX_PROJECTION};
    `;

    const result = await executor.query<PaymentTransactionRow>(sql, [id, JSON.stringify(payload)]);
    const row = result.rows[0];
    return row ? mapRowToPaymentTransactionEntity(row) : null;
  }
}
