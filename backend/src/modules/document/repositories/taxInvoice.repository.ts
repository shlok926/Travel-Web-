import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { SupportedCurrency } from '../../../../../shared/src/index.js';

// ============================================================
// 1. Entity & Row Interfaces
// ============================================================

export interface TaxInvoiceEntity {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  customerId: string;
  gstinNumber: string | null;
  taxableAmount: number; // Minor units
  gstAmount: number; // Minor units
  totalAmount: number; // Minor units
  currency: SupportedCurrency;
  pdfStorageKey: string | null;
  createdAt: Date;
}

export interface TaxInvoiceRow {
  id: string;
  invoice_number: string;
  booking_id: string;
  customer_id: string;
  gstin_number: string | null;
  taxable_amount: string | number;
  gst_amount: string | number;
  total_amount: string | number;
  currency: string;
  pdf_storage_key: string | null;
  created_at: Date | string;
}

export interface CreateTaxInvoiceData {
  id?: string;
  invoiceNumber: string;
  bookingId: string;
  customerId: string;
  gstinNumber?: string | null;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  currency: SupportedCurrency;
  pdfStorageKey?: string | null;
}

// ============================================================
// 2. Explicit SQL Projections & Mappings
// ============================================================

const TAX_INVOICE_PROJECTION = `
  id,
  invoice_number,
  booking_id,
  customer_id,
  gstin_number,
  taxable_amount,
  gst_amount,
  total_amount,
  currency,
  pdf_storage_key,
  created_at
`;

function mapRowToTaxInvoiceEntity(row: TaxInvoiceRow): TaxInvoiceEntity {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    gstinNumber: row.gstin_number ?? null,
    taxableAmount: Number(row.taxable_amount),
    gstAmount: Number(row.gst_amount),
    totalAmount: Number(row.total_amount),
    currency: row.currency as SupportedCurrency,
    pdfStorageKey: row.pdf_storage_key ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

// ============================================================
// 3. TaxInvoiceRepository Class
// ============================================================

export class TaxInvoiceRepository {
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
   * Persists a statutory tax invoice record.
   */
  async create(data: CreateTaxInvoiceData, client?: pg.PoolClient): Promise<TaxInvoiceEntity> {
    const executor = this.getExecutor(client);
    const sql = `
      INSERT INTO tax_invoices (
        invoice_number,
        booking_id,
        customer_id,
        gstin_number,
        taxable_amount,
        gst_amount,
        total_amount,
        currency,
        pdf_storage_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${TAX_INVOICE_PROJECTION};
    `;

    const values = [
      data.invoiceNumber,
      data.bookingId,
      data.customerId,
      data.gstinNumber ?? null,
      data.taxableAmount,
      data.gstAmount,
      data.totalAmount,
      data.currency,
      data.pdfStorageKey ?? null,
    ];

    const result = await executor.query<TaxInvoiceRow>(sql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create tax invoice: no row returned');
    }
    return mapRowToTaxInvoiceEntity(row);
  }

  /**
   * Finds a tax invoice by primary UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<TaxInvoiceEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TAX_INVOICE_PROJECTION}
      FROM tax_invoices
      WHERE id = $1;
    `;

    const result = await executor.query<TaxInvoiceRow>(sql, [id]);
    const row = result.rows[0];
    return row ? mapRowToTaxInvoiceEntity(row) : null;
  }

  /**
   * Finds all tax invoices for a given booking ID.
   */
  async findByBookingId(bookingId: string, client?: pg.PoolClient): Promise<TaxInvoiceEntity[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TAX_INVOICE_PROJECTION}
      FROM tax_invoices
      WHERE booking_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await executor.query<TaxInvoiceRow>(sql, [bookingId]);
    return result.rows.map(mapRowToTaxInvoiceEntity);
  }

  /**
   * Finds a tax invoice by unique invoice number.
   */
  async findByInvoiceNumber(
    invoiceNumber: string,
    client?: pg.PoolClient,
  ): Promise<TaxInvoiceEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT ${TAX_INVOICE_PROJECTION}
      FROM tax_invoices
      WHERE invoice_number = $1;
    `;

    const result = await executor.query<TaxInvoiceRow>(sql, [invoiceNumber]);
    const row = result.rows[0];
    return row ? mapRowToTaxInvoiceEntity(row) : null;
  }

  /**
   * Updates the private PDF storage key after asynchronous document generation.
   */
  async updatePdfStorageKey(
    id: string,
    pdfStorageKey: string,
    client?: pg.PoolClient,
  ): Promise<TaxInvoiceEntity | null> {
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE tax_invoices
      SET pdf_storage_key = $2
      WHERE id = $1
      RETURNING ${TAX_INVOICE_PROJECTION};
    `;

    const result = await executor.query<TaxInvoiceRow>(sql, [id, pdfStorageKey]);
    const row = result.rows[0];
    return row ? mapRowToTaxInvoiceEntity(row) : null;
  }
}
