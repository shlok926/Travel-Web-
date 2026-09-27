import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { HeroSliderDto } from '../../../../../shared/src/index.js';

export interface HeroSliderEntity {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeroSliderRow {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateHeroSliderData {
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateHeroSliderData {
  title?: string;
  subtitle?: string | null;
  imageUrl?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface HeroSliderListOptions {
  page?: number;
  limit?: number;
  isActive?: boolean;
}

export function mapHeroSliderRowToEntity(row: HeroSliderRow): HeroSliderEntity {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toHeroSliderDto(entity: HeroSliderEntity): HeroSliderDto {
  return {
    id: entity.id,
    title: entity.title,
    subtitle: entity.subtitle,
    imageUrl: entity.imageUrl,
    ctaLabel: entity.ctaLabel,
    ctaUrl: entity.ctaUrl,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export class HeroSliderRepository {
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
   * Find a hero slider by ID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<HeroSliderEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<HeroSliderRow>(
      `SELECT
        id,
        title,
        subtitle,
        image_url,
        cta_label,
        cta_url,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM hero_sliders
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapHeroSliderRowToEntity(row) : null;
  }

  /**
   * Create a new hero slider.
   */
  async create(data: CreateHeroSliderData, client?: pg.PoolClient): Promise<HeroSliderEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<HeroSliderRow>(
      `INSERT INTO hero_sliders (
        title,
        subtitle,
        image_url,
        cta_label,
        cta_url,
        sort_order,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        title,
        subtitle,
        image_url,
        cta_label,
        cta_url,
        sort_order,
        is_active,
        created_at,
        updated_at;`,
      [
        data.title,
        data.subtitle ?? null,
        data.imageUrl,
        data.ctaLabel ?? null,
        data.ctaUrl ?? null,
        data.sortOrder ?? 0,
        data.isActive ?? true,
      ],
    );

    return mapHeroSliderRowToEntity(result.rows[0]!);
  }

  /**
   * Update a hero slider by ID.
   */
  async update(
    id: string,
    data: UpdateHeroSliderData,
    client?: pg.PoolClient,
  ): Promise<HeroSliderEntity | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.subtitle !== undefined) {
      setClauses.push(`subtitle = $${paramIndex++}`);
      params.push(data.subtitle);
    }
    if (data.imageUrl !== undefined) {
      setClauses.push(`image_url = $${paramIndex++}`);
      params.push(data.imageUrl);
    }
    if (data.ctaLabel !== undefined) {
      setClauses.push(`cta_label = $${paramIndex++}`);
      params.push(data.ctaLabel);
    }
    if (data.ctaUrl !== undefined) {
      setClauses.push(`cta_url = $${paramIndex++}`);
      params.push(data.ctaUrl);
    }
    if (data.sortOrder !== undefined) {
      setClauses.push(`sort_order = $${paramIndex++}`);
      params.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);

    const sql = `
      UPDATE hero_sliders
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING
        id,
        title,
        subtitle,
        image_url,
        cta_label,
        cta_url,
        sort_order,
        is_active,
        created_at,
        updated_at;
    `;

    const executor = this.getExecutor(client);
    const result = await executor.query<HeroSliderRow>(sql, params);
    const row = result.rows[0];
    return row ? mapHeroSliderRowToEntity(row) : null;
  }

  /**
   * List hero sliders with optional filtering and pagination, ordered by sort_order ASC, created_at DESC.
   */
  async findAll(
    options: HeroSliderListOptions = {},
    client?: pg.PoolClient,
  ): Promise<{ items: HeroSliderEntity[]; total: number }> {
    const { page = 1, limit = 20, isActive } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int as total FROM hero_sliders ${whereClause};`;
    const executor = this.getExecutor(client);
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    const querySql = `
      SELECT
        id,
        title,
        subtitle,
        image_url,
        cta_label,
        cta_url,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM hero_sliders
      ${whereClause}
      ORDER BY sort_order ASC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const listResult = await executor.query<HeroSliderRow>(querySql, [...params, limit, offset]);
    const items = listResult.rows.map(mapHeroSliderRowToEntity);

    return { items, total };
  }

  /**
   * Delete a hero slider by ID.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM hero_sliders
      WHERE id = $1;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
