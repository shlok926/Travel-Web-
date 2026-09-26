import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { RefundSettlementStatus, SupportedCurrency } from '../../../../../shared/src/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface RefundSettlementEntity {
  id: string;
  cancellationRequestId: string | null;
  paymentTransactionId: string;
  gatewayRefundId: string | null;
  refundAmount: number; // Minor units (paise/cents)
  currency: SupportedCurrency;
  settlementStatus: RefundSettlementStatus;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

export interface RefundSettlementRow {
  id: string;
  cancellation_request_id: string | null;
  payment_transaction_id: string;
  gateway_refund_id: string | null;
  refund_amount: string | number;
  currency: string;
  settlement_status: string;
  error_message: string | null;
  processed_at: Date | string | null;
  created_at: Date | string;
}

export interface CreateRefundSettlementData {
  id?: string;
  cancellationRequestId?: string | null;
  paymentTransactionId: string;
  gatewayRefundId?: string | null;
  refundAmount: number; // Minor units
  currency: SupportedCurrency;
  settlementStatus?: RefundSettlementStatus;
  errorMessage?: string | null;
  processedAt?: Date | string | null;
}

export interface UpdateSettlementStatusData {
  settlementStatus: RefundSettlementStatus;
  gatewayRefundId?: string | null;
  errorMessage?: string | null;
  processedAt?: Date | string | null;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const REFUND_SETTLEMENT_PROJECTION = `
  id,
  cancellation_request_id,
  payment_transaction_id,
  gateway_refund_id,
  refund_amount,
  currency,
  settlement_status,
  error_message,
  processed_at,
  created_at
`;

function mapRowToRefundSettlementEntity(row: RefundSettlementRow): RefundSettlementEntity {
  return {
    id: row.id,
    cancellationRequestId: row.cancellation_request_id ?? null,
    paymentTransactionId: row.payment_transaction_id,
    gatewayRefundId: row.gateway_refund_id ?? null,
    refundAmount: Number(row.refund_amount),
    currency: row.currency as SupportedCurrency,
    settlementStatus: row.settlement_status as RefundSettlementStatus,
    errorMessage: row.error_message ?? null,
    processedAt: row.processed_at
      ? row.processed_at instanceof Date
        ? row.processed_at
        : new Date(row.processed_at)
      : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

// ============================================================
// 3. RefundSettlementRepository Class
// ============================================================

export class RefundSettlementRepository {
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
   * Persists a new refund settlement audit record.
   */
  async create(
    data: CreateRefundSettlementData,
    client?: pg.PoolClient,
  ): Promise<RefundSettlementEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO refund_settlements (
        cancellation_request_id,
        payment_transaction_id,
        gateway_refund_id,
        refund_amount,
        currency,
        settlement_status,
        error_message,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${REFUND_SETTLEMENT_PROJECTION};
    `;

    const values = [
      data.cancellationRequestId ?? null,
      data.paymentTransactionId,
      data.gatewayRefundId ?? null,
      data.refundAmount,
      data.currency,
      data.settlementStatus ?? 'PROCESSING',
      data.errorMessage ?? null,
      data.processedAt ?? null,
    ];

    const result = await executor.query<RefundSettlementRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create refund settlement: no row returned');
    }
    return mapRowToRefundSettlementEntity(row);
  }

  /**
   * Finds a refund settlement by primary UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<RefundSettlementEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${REFUND_SETTLEMENT_PROJECTION}
      FROM refund_settlements
      WHERE id = $1;
    `;

    const result = await executor.query<RefundSettlementRow>(sql, [id]);
    const row = result.rows[0];
    return row ? mapRowToRefundSettlementEntity(row) : null;
  }

  /**
   * Finds all refund settlements for a given cancellation request ID.
   */
  async findByCancellationRequestId(
    cancellationRequestId: string,
    client?: pg.PoolClient,
  ): Promise<RefundSettlementEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${REFUND_SETTLEMENT_PROJECTION}
      FROM refund_settlements
      WHERE cancellation_request_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<RefundSettlementRow>(sql, [cancellationRequestId]);
    return result.rows.map(mapRowToRefundSettlementEntity);
  }

  /**
   * Finds all refund settlements for a given payment transaction ID.
   */
  async findByPaymentTransactionId(
    paymentTransactionId: string,
    client?: pg.PoolClient,
  ): Promise<RefundSettlementEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${REFUND_SETTLEMENT_PROJECTION}
      FROM refund_settlements
      WHERE payment_transaction_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<RefundSettlementRow>(sql, [paymentTransactionId]);
    return result.rows.map(mapRowToRefundSettlementEntity);
  }

  /**
   * Finds a refund settlement by gateway refund ID using index.
   */
  async findByGatewayRefundId(
    gatewayRefundId: string,
    client?: pg.PoolClient,
  ): Promise<RefundSettlementEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${REFUND_SETTLEMENT_PROJECTION}
      FROM refund_settlements
      WHERE gateway_refund_id = $1;
    `;

    const result = await executor.query<RefundSettlementRow>(sql, [gatewayRefundId]);
    const row = result.rows[0];
    return row ? mapRowToRefundSettlementEntity(row) : null;
  }

  /**
   * Updates settlement status, gateway refund ID, error message, and processed timestamp.
   */
  async updateSettlementStatus(
    id: string,
    data: UpdateSettlementStatusData,
    client?: pg.PoolClient,
  ): Promise<RefundSettlementEntity | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = ['settlement_status = $1'];
    const values: unknown[] = [data.settlementStatus, id];
    let paramIndex = 3;

    if (data.gatewayRefundId !== undefined) {
      setClauses.push(`gateway_refund_id = $${paramIndex++}`);
      values.push(data.gatewayRefundId);
    }

    if (data.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(data.errorMessage);
    }

    if (data.processedAt !== undefined) {
      setClauses.push(`processed_at = $${paramIndex++}`);
      values.push(data.processedAt);
    } else if (data.settlementStatus === 'SETTLED' || data.settlementStatus === 'FAILED') {
      setClauses.push(`processed_at = COALESCE(processed_at, NOW())`);
    }

    const sql = `
      UPDATE refund_settlements
      SET ${setClauses.join(', ')}
      WHERE id = $2
      RETURNING ${REFUND_SETTLEMENT_PROJECTION};
    `;

    const result = await executor.query<RefundSettlementRow>(sql, values);
    const row = result.rows[0];
    return row ? mapRowToRefundSettlementEntity(row) : null;
  }
}
