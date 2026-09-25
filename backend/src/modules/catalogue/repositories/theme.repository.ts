import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';

export interface ThemeEntity {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  createdAt: Date;
}

export interface ThemeRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  created_at: Date | string;
}

export interface CreateThemeData {
  slug: string;
  title: string;
  description?: string | null;
  iconUrl?: string | null;
}

export interface UpdateThemeData {
  slug?: string;
  title?: string;
  description?: string | null;
  iconUrl?: string | null;
}

export function mapThemeRowToEntity(row: ThemeRow): ThemeEntity {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    iconUrl: row.icon_url,
    createdAt: new Date(row.created_at),
  };
}

export class ThemeRepository {
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
   * Find a theme by its primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<ThemeEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ThemeRow>(
      `SELECT
        id,
        slug,
        title,
        description,
        icon_url,
        created_at
      FROM themes
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapThemeRowToEntity(row) : null;
  }

  /**
   * Find a theme by its unique URL slug.
   */
  async findBySlug(slug: string, client?: pg.PoolClient): Promise<ThemeEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ThemeRow>(
      `SELECT
        id,
        slug,
        title,
        description,
        icon_url,
        created_at
      FROM themes
      WHERE slug = $1;`,
      [slug],
    );

    const row = result.rows[0];
    return row ? mapThemeRowToEntity(row) : null;
  }

  /**
   * Create a new theme record.
   */
  async create(data: CreateThemeData, client?: pg.PoolClient): Promise<ThemeEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ThemeRow>(
      `INSERT INTO themes (
        slug,
        title,
        description,
        icon_url
      ) VALUES (
        $1, $2, $3, $4
      ) RETURNING
        id,
        slug,
        title,
        description,
        icon_url,
        created_at;`,
      [data.slug, data.title, data.description ?? null, data.iconUrl ?? null],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert theme record into database.');
    }

    return mapThemeRowToEntity(createdRow);
  }

  /**
   * Update an existing theme record.
   */
  async update(
    id: string,
    data: UpdateThemeData,
    client?: pg.PoolClient,
  ): Promise<ThemeEntity | null> {
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex++}`);
      values.push(data.slug);
    }
    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.iconUrl !== undefined) {
      setClauses.push(`icon_url = $${paramIndex++}`);
      values.push(data.iconUrl);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);

    const result = await executor.query<ThemeRow>(
      `UPDATE themes
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        slug,
        title,
        description,
        icon_url,
        created_at;`,
      values,
    );

    const updatedRow = result.rows[0];
    return updatedRow ? mapThemeRowToEntity(updatedRow) : null;
  }

  /**
   * Delete a theme by its ID.
   * Note: Foreign keys in tour_packages use ON DELETE SET NULL.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM themes
      WHERE id = $1
      RETURNING id;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List all themes ordered alphabetically by title.
   */
  async list(client?: pg.PoolClient): Promise<ThemeEntity[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ThemeRow>(
      `SELECT
        id,
        slug,
        title,
        description,
        icon_url,
        created_at
      FROM themes
      ORDER BY title ASC;`,
    );

    return result.rows.map(mapThemeRowToEntity);
  }
}
