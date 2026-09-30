import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { CmsPageDto } from '../../../../../shared/src/index.js';

export interface CmsPageEntity {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
  metaDescription: string | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CmsPageRow {
  id: string;
  slug: string;
  title: string;
  content_html: string;
  meta_description: string | null;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateCmsPageData {
  slug: string;
  title: string;
  contentHtml: string;
  metaDescription?: string | null;
  isPublished?: boolean;
}

export interface UpdateCmsPageData {
  slug?: string;
  title?: string;
  contentHtml?: string;
  metaDescription?: string | null;
  isPublished?: boolean;
}

export interface CmsPageListOptions {
  page?: number;
  limit?: number;
  isPublished?: boolean;
}

export function mapCmsPageRowToEntity(row: CmsPageRow): CmsPageEntity {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    contentHtml: row.content_html,
    metaDescription: row.meta_description,
    isPublished: row.is_published,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toCmsPageDto(entity: CmsPageEntity): CmsPageDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    contentHtml: entity.contentHtml,
    metaDescription: entity.metaDescription,
    isPublished: entity.isPublished,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export class CmsPageRepository {
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
   * Find a CMS page by primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<CmsPageEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<CmsPageRow>(
      `SELECT
        id,
        slug,
        title,
        content_html,
        meta_description,
        is_published,
        created_at,
        updated_at
      FROM cms_pages
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapCmsPageRowToEntity(row) : null;
  }

  /**
   * Find a CMS page by its unique slug.
   */
  async findBySlug(slug: string, client?: pg.PoolClient): Promise<CmsPageEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<CmsPageRow>(
      `SELECT
        id,
        slug,
        title,
        content_html,
        meta_description,
        is_published,
        created_at,
        updated_at
      FROM cms_pages
      WHERE slug = $1;`,
      [slug],
    );

    const row = result.rows[0];
    return row ? mapCmsPageRowToEntity(row) : null;
  }

  /**
   * Create a new CMS page.
   */
  async create(data: CreateCmsPageData, client?: pg.PoolClient): Promise<CmsPageEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<CmsPageRow>(
      `INSERT INTO cms_pages (
        slug,
        title,
        content_html,
        meta_description,
        is_published
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        slug,
        title,
        content_html,
        meta_description,
        is_published,
        created_at,
        updated_at;`,
      [
        data.slug,
        data.title,
        data.contentHtml,
        data.metaDescription ?? null,
        data.isPublished ?? true,
      ],
    );

    return mapCmsPageRowToEntity(result.rows[0]!);
  }

  /**
   * Update a CMS page by ID.
   */
  async update(
    id: string,
    data: UpdateCmsPageData,
    client?: pg.PoolClient,
  ): Promise<CmsPageEntity | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (data.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex++}`);
      params.push(data.slug);
    }
    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.contentHtml !== undefined) {
      setClauses.push(`content_html = $${paramIndex++}`);
      params.push(data.contentHtml);
    }
    if (data.metaDescription !== undefined) {
      setClauses.push(`meta_description = $${paramIndex++}`);
      params.push(data.metaDescription);
    }
    if (data.isPublished !== undefined) {
      setClauses.push(`is_published = $${paramIndex++}`);
      params.push(data.isPublished);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);

    const sql = `
      UPDATE cms_pages
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING
        id,
        slug,
        title,
        content_html,
        meta_description,
        is_published,
        created_at,
        updated_at;
    `;

    const executor = this.getExecutor(client);
    const result = await executor.query<CmsPageRow>(sql, params);
    const row = result.rows[0];
    return row ? mapCmsPageRowToEntity(row) : null;
  }

  /**
   * List CMS pages with optional filtering and pagination, ordered by created_at DESC.
   */
  async findAll(
    options: CmsPageListOptions = {},
    client?: pg.PoolClient,
  ): Promise<{ items: CmsPageEntity[]; total: number }> {
    const { page = 1, limit = 20, isPublished } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (isPublished !== undefined) {
      conditions.push(`is_published = $${paramIndex++}`);
      params.push(isPublished);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int as total FROM cms_pages ${whereClause};`;
    const executor = this.getExecutor(client);
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    const querySql = `
      SELECT
        id,
        slug,
        title,
        content_html,
        meta_description,
        is_published,
        created_at,
        updated_at
      FROM cms_pages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    const listResult = await executor.query<CmsPageRow>(querySql, [...params, limit, offset]);
    const items = listResult.rows.map(mapCmsPageRowToEntity);

    return { items, total };
  }

  /**
   * Delete a CMS page by ID.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM cms_pages
      WHERE id = $1;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
