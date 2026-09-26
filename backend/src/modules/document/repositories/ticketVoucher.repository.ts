import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface TicketVoucherEntity {
  id: string;
  voucherCode: string;
  bookingId: string;
  pdfStorageKey: string | null;
  createdAt: Date;
}

export interface TicketVoucherRow {
  id: string;
  voucher_code: string;
  booking_id: string;
  pdf_storage_key: string | null;
  created_at: Date | string;
}

export interface CreateTicketVoucherData {
  id?: string;
  voucherCode: string;
  bookingId: string;
  pdfStorageKey?: string | null;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const TICKET_VOUCHER_PROJECTION = `
  id,
  voucher_code,
  booking_id,
  pdf_storage_key,
  created_at
`;

function mapRowToTicketVoucherEntity(row: TicketVoucherRow): TicketVoucherEntity {
  return {
    id: row.id,
    voucherCode: row.voucher_code,
    bookingId: row.booking_id,
    pdfStorageKey: row.pdf_storage_key ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

// ============================================================
// 3. TicketVoucherRepository Class
// ============================================================

export class TicketVoucherRepository {
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
   * Persists an e-ticket voucher record.
   */
  async create(
    data: CreateTicketVoucherData,
    client?: pg.PoolClient,
  ): Promise<TicketVoucherEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO ticket_vouchers (
        voucher_code,
        booking_id,
        pdf_storage_key
      ) VALUES ($1, $2, $3)
      RETURNING ${TICKET_VOUCHER_PROJECTION};
    `;

    const values = [data.voucherCode, data.bookingId, data.pdfStorageKey ?? null];

    const result = await executor.query<TicketVoucherRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create ticket voucher: no row returned');
    }
    return mapRowToTicketVoucherEntity(row);
  }

  /**
   * Finds a ticket voucher by primary UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<TicketVoucherEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TICKET_VOUCHER_PROJECTION}
      FROM ticket_vouchers
      WHERE id = $1;
    `;

    const result = await executor.query<TicketVoucherRow>(sql, [id]);
    const row = result.rows[0];
    return row ? mapRowToTicketVoucherEntity(row) : null;
  }

  /**
   * Finds all ticket vouchers for a given booking ID.
   */
  async findByBookingId(bookingId: string, client?: pg.PoolClient): Promise<TicketVoucherEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TICKET_VOUCHER_PROJECTION}
      FROM ticket_vouchers
      WHERE booking_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<TicketVoucherRow>(sql, [bookingId]);
    return result.rows.map(mapRowToTicketVoucherEntity);
  }

  /**
   * Finds a ticket voucher by unique voucher code.
   */
  async findByVoucherCode(
    voucherCode: string,
    client?: pg.PoolClient,
  ): Promise<TicketVoucherEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TICKET_VOUCHER_PROJECTION}
      FROM ticket_vouchers
      WHERE voucher_code = $1;
    `;

    const result = await executor.query<TicketVoucherRow>(sql, [voucherCode]);
    const row = result.rows[0];
    return row ? mapRowToTicketVoucherEntity(row) : null;
  }

  /**
   * Updates the private PDF storage key after asynchronous document generation.
   */
  async updatePdfStorageKey(
    id: string,
    pdfStorageKey: string,
    client?: pg.PoolClient,
  ): Promise<TicketVoucherEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE ticket_vouchers
      SET pdf_storage_key = $2
      WHERE id = $1
      RETURNING ${TICKET_VOUCHER_PROJECTION};
    `;

    const result = await executor.query<TicketVoucherRow>(sql, [id, pdfStorageKey]);
    const row = result.rows[0];
    return row ? mapRowToTicketVoucherEntity(row) : null;
  }
}
