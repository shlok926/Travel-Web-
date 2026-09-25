import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { DestinationQueryFilter } from '../../../../../shared/src/index.js';

export interface DestinationEntity {
  id: string;
  slug: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DestinationRow {
  id: string;
  slug: string;
  city_name: string;
  country: string;
  description: string;
  thumbnail_url: string;
  hero_image_url: string | null;
  is_featured: boolean;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateDestinationData {
  slug: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl?: string | null;
  isFeatured?: boolean;
  isPublished?: boolean;
}

export interface UpdateDestinationData {
  slug?: string;
  cityName?: string;
  country?: string;
  description?: string;
  thumbnailUrl?: string;
  heroImageUrl?: string | null;
  isFeatured?: boolean;
  isPublished?: boolean;
}

export function mapDestinationRowToEntity(row: DestinationRow): DestinationEntity {
  return {
    id: row.id,
    slug: row.slug,
    cityName: row.city_name,
    country: row.country,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    heroImageUrl: row.hero_image_url,
    isFeatured: row.is_featured,
    isPublished: row.is_published,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class DestinationRepository {
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
   * Find a destination by its primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<DestinationEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<DestinationRow>(
      `SELECT
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at
      FROM destinations
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapDestinationRowToEntity(row) : null;
  }

  /**
   * Find a destination by its unique URL slug.
   */
  async findBySlug(slug: string, client?: pg.PoolClient): Promise<DestinationEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<DestinationRow>(
      `SELECT
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at
      FROM destinations
      WHERE slug = $1;`,
      [slug],
    );

    const row = result.rows[0];
    return row ? mapDestinationRowToEntity(row) : null;
  }

  /**
   * Create a new destination record.
   */
  async create(data: CreateDestinationData, client?: pg.PoolClient): Promise<DestinationEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<DestinationRow>(
      `INSERT INTO destinations (
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at;`,
      [
        data.slug,
        data.cityName,
        data.country,
        data.description,
        data.thumbnailUrl,
        data.heroImageUrl ?? null,
        data.isFeatured ?? false,
        data.isPublished ?? false,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert destination record into database.');
    }

    return mapDestinationRowToEntity(createdRow);
  }

  /**
   * Update an existing destination record.
   */
  async update(
    id: string,
    data: UpdateDestinationData,
    client?: pg.PoolClient,
  ): Promise<DestinationEntity | null> {
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex++}`);
      values.push(data.slug);
    }
    if (data.cityName !== undefined) {
      setClauses.push(`city_name = $${paramIndex++}`);
      values.push(data.cityName);
    }
    if (data.country !== undefined) {
      setClauses.push(`country = $${paramIndex++}`);
      values.push(data.country);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.thumbnailUrl !== undefined) {
      setClauses.push(`thumbnail_url = $${paramIndex++}`);
      values.push(data.thumbnailUrl);
    }
    if (data.heroImageUrl !== undefined) {
      setClauses.push(`hero_image_url = $${paramIndex++}`);
      values.push(data.heroImageUrl);
    }
    if (data.isFeatured !== undefined) {
      setClauses.push(`is_featured = $${paramIndex++}`);
      values.push(data.isFeatured);
    }
    if (data.isPublished !== undefined) {
      setClauses.push(`is_published = $${paramIndex++}`);
      values.push(data.isPublished);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await executor.query<DestinationRow>(
      `UPDATE destinations
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at;`,
      values,
    );

    const updatedRow = result.rows[0];
    return updatedRow ? mapDestinationRowToEntity(updatedRow) : null;
  }

  /**
   * Delete a destination by its ID.
   * Note: Enforced with ON DELETE RESTRICT in database if referenced by tour packages.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM destinations
      WHERE id = $1
      RETURNING id;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List destinations with filtering and pagination.
   */
  async list(
    filter: DestinationQueryFilter = {},
    client?: pg.PoolClient,
  ): Promise<{ items: DestinationEntity[]; total: number }> {
    const executor = this.getExecutor(client);
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.isPublished !== undefined) {
      whereClauses.push(`is_published = $${paramIndex++}`);
      values.push(filter.isPublished);
    }

    if (filter.isFeatured !== undefined) {
      whereClauses.push(`is_featured = $${paramIndex++}`);
      values.push(filter.isFeatured);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countResult = await executor.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM destinations ${whereSql};`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Pagination bounds
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    const listValues = [...values, limit, offset];
    const limitParam = `$${paramIndex++}`;
    const offsetParam = `$${paramIndex++}`;

    const listResult = await executor.query<DestinationRow>(
      `SELECT
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at
      FROM destinations
      ${whereSql}
      ORDER BY is_featured DESC, created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};`,
      listValues,
    );

    return {
      items: listResult.rows.map(mapDestinationRowToEntity),
      total,
    };
  }

  /**
   * List all published destinations for public catalogue.
   */
  async listPublished(limit = 100, client?: pg.PoolClient): Promise<DestinationEntity[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<DestinationRow>(
      `SELECT
        id,
        slug,
        city_name,
        country,
        description,
        thumbnail_url,
        hero_image_url,
        is_featured,
        is_published,
        created_at,
        updated_at
      FROM destinations
      WHERE is_published = TRUE
      ORDER BY is_featured DESC, city_name ASC
      LIMIT $1;`,
      [limit],
    );

    return result.rows.map(mapDestinationRowToEntity);
  }
}
