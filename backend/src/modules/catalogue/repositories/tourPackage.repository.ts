import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import {
  AccommodationTier,
  MealPlan,
  SupportedCurrency,
  TourPackageQueryFilter,
} from '../../../../../shared/src/index.js';

export interface TourPackageEntity {
  id: string;
  destinationId: string;
  themeId: string | null;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  durationDays: number;
  durationNights: number;
  originCity: string;
  destinationCity: string;
  baseAdultPrice: number; // Integer minor units (paise / cents)
  baseChildPrice: number; // Integer minor units (paise / cents)
  currency: SupportedCurrency;
  heroImageUrl: string;
  galleryUrls: string[];
  inclusions: string[];
  exclusions: string[];
  accommodationTiers: AccommodationTier[];
  mealPlans: MealPlan[];
  isPublished: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TourPackageRow {
  id: string;
  destination_id: string;
  theme_id: string | null;
  slug: string;
  title: string;
  short_description: string;
  description: string;
  duration_days: number;
  duration_nights: number;
  origin_city: string;
  destination_city: string;
  base_adult_price: string | number | bigint;
  base_child_price: string | number | bigint;
  currency: string;
  hero_image_url: string;
  gallery_urls: unknown;
  inclusions: unknown;
  exclusions: unknown;
  accommodation_tiers: unknown;
  meal_plans: unknown;
  is_published: boolean;
  is_featured: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateTourPackageData {
  destinationId: string;
  themeId?: string | null;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  durationDays: number;
  durationNights: number;
  originCity: string;
  destinationCity: string;
  baseAdultPrice: number;
  baseChildPrice?: number;
  currency?: SupportedCurrency;
  heroImageUrl: string;
  galleryUrls?: string[];
  inclusions?: string[];
  exclusions?: string[];
  accommodationTiers?: AccommodationTier[];
  mealPlans?: MealPlan[];
  isPublished?: boolean;
  isFeatured?: boolean;
}

export interface UpdateTourPackageData {
  destinationId?: string;
  themeId?: string | null;
  slug?: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  durationDays?: number;
  durationNights?: number;
  originCity?: string;
  destinationCity?: string;
  baseAdultPrice?: number;
  baseChildPrice?: number;
  currency?: SupportedCurrency;
  heroImageUrl?: string;
  galleryUrls?: string[];
  inclusions?: string[];
  exclusions?: string[];
  accommodationTiers?: AccommodationTier[];
  mealPlans?: MealPlan[];
  isPublished?: boolean;
  isFeatured?: boolean;
}

export interface ExtendedTourPackageQueryFilter extends TourPackageQueryFilter {
  destinationId?: string;
  themeId?: string;
}

function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function mapTourPackageRowToEntity(row: TourPackageRow): TourPackageEntity {
  return {
    id: row.id,
    destinationId: row.destination_id,
    themeId: row.theme_id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    description: row.description,
    durationDays: row.duration_days,
    durationNights: row.duration_nights,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    baseAdultPrice:
      typeof row.base_adult_price === 'number'
        ? row.base_adult_price
        : Number(row.base_adult_price),
    baseChildPrice:
      typeof row.base_child_price === 'number'
        ? row.base_child_price
        : Number(row.base_child_price),
    currency: row.currency as SupportedCurrency,
    heroImageUrl: row.hero_image_url,
    galleryUrls: parseJsonbField<string[]>(row.gallery_urls, []),
    inclusions: parseJsonbField<string[]>(row.inclusions, []),
    exclusions: parseJsonbField<string[]>(row.exclusions, []),
    accommodationTiers: parseJsonbField<AccommodationTier[]>(row.accommodation_tiers, [
      'BUDGET',
      'STANDARD',
      'LUXURY',
    ]),
    mealPlans: parseJsonbField<MealPlan[]>(row.meal_plans, [
      'BREAKFAST',
      'HALF_BOARD',
      'FULL_BOARD',
    ]),
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const PACKAGE_PROJECTION = `
  id,
  destination_id,
  theme_id,
  slug,
  title,
  short_description,
  description,
  duration_days,
  duration_nights,
  origin_city,
  destination_city,
  base_adult_price,
  base_child_price,
  currency,
  hero_image_url,
  gallery_urls,
  inclusions,
  exclusions,
  accommodation_tiers,
  meal_plans,
  is_published,
  is_featured,
  created_at,
  updated_at
`;

export class TourPackageRepository {
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
   * Find a tour package by its primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<TourPackageEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<TourPackageRow>(
      `SELECT
        ${PACKAGE_PROJECTION}
      FROM tour_packages
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapTourPackageRowToEntity(row) : null;
  }

  /**
   * Find a tour package by its unique URL slug.
   */
  async findBySlug(slug: string, client?: pg.PoolClient): Promise<TourPackageEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<TourPackageRow>(
      `SELECT
        ${PACKAGE_PROJECTION}
      FROM tour_packages
      WHERE slug = $1;`,
      [slug],
    );

    const row = result.rows[0];
    return row ? mapTourPackageRowToEntity(row) : null;
  }

  /**
   * Create a new tour package record.
   */
  async create(data: CreateTourPackageData, client?: pg.PoolClient): Promise<TourPackageEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<TourPackageRow>(
      `INSERT INTO tour_packages (
        destination_id,
        theme_id,
        slug,
        title,
        short_description,
        description,
        duration_days,
        duration_nights,
        origin_city,
        destination_city,
        base_adult_price,
        base_child_price,
        currency,
        hero_image_url,
        gallery_urls,
        inclusions,
        exclusions,
        accommodation_tiers,
        meal_plans,
        is_published,
        is_featured
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING
        ${PACKAGE_PROJECTION};`,
      [
        data.destinationId,
        data.themeId ?? null,
        data.slug,
        data.title,
        data.shortDescription,
        data.description,
        data.durationDays,
        data.durationNights,
        data.originCity,
        data.destinationCity,
        data.baseAdultPrice,
        data.baseChildPrice ?? 0,
        data.currency ?? 'INR',
        data.heroImageUrl,
        JSON.stringify(data.galleryUrls ?? []),
        JSON.stringify(data.inclusions ?? []),
        JSON.stringify(data.exclusions ?? []),
        JSON.stringify(data.accommodationTiers ?? ['BUDGET', 'STANDARD', 'LUXURY']),
        JSON.stringify(data.mealPlans ?? ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD']),
        data.isPublished ?? false,
        data.isFeatured ?? false,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert tour package record into database.');
    }

    return mapTourPackageRowToEntity(createdRow);
  }

  /**
   * Update an existing tour package record.
   */
  async update(
    id: string,
    data: UpdateTourPackageData,
    client?: pg.PoolClient,
  ): Promise<TourPackageEntity | null> {
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.destinationId !== undefined) {
      setClauses.push(`destination_id = $${paramIndex++}`);
      values.push(data.destinationId);
    }
    if (data.themeId !== undefined) {
      setClauses.push(`theme_id = $${paramIndex++}`);
      values.push(data.themeId);
    }
    if (data.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex++}`);
      values.push(data.slug);
    }
    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.shortDescription !== undefined) {
      setClauses.push(`short_description = $${paramIndex++}`);
      values.push(data.shortDescription);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.durationDays !== undefined) {
      setClauses.push(`duration_days = $${paramIndex++}`);
      values.push(data.durationDays);
    }
    if (data.durationNights !== undefined) {
      setClauses.push(`duration_nights = $${paramIndex++}`);
      values.push(data.durationNights);
    }
    if (data.originCity !== undefined) {
      setClauses.push(`origin_city = $${paramIndex++}`);
      values.push(data.originCity);
    }
    if (data.destinationCity !== undefined) {
      setClauses.push(`destination_city = $${paramIndex++}`);
      values.push(data.destinationCity);
    }
    if (data.baseAdultPrice !== undefined) {
      setClauses.push(`base_adult_price = $${paramIndex++}`);
      values.push(data.baseAdultPrice);
    }
    if (data.baseChildPrice !== undefined) {
      setClauses.push(`base_child_price = $${paramIndex++}`);
      values.push(data.baseChildPrice);
    }
    if (data.currency !== undefined) {
      setClauses.push(`currency = $${paramIndex++}`);
      values.push(data.currency);
    }
    if (data.heroImageUrl !== undefined) {
      setClauses.push(`hero_image_url = $${paramIndex++}`);
      values.push(data.heroImageUrl);
    }
    if (data.galleryUrls !== undefined) {
      setClauses.push(`gallery_urls = $${paramIndex++}`);
      values.push(JSON.stringify(data.galleryUrls));
    }
    if (data.inclusions !== undefined) {
      setClauses.push(`inclusions = $${paramIndex++}`);
      values.push(JSON.stringify(data.inclusions));
    }
    if (data.exclusions !== undefined) {
      setClauses.push(`exclusions = $${paramIndex++}`);
      values.push(JSON.stringify(data.exclusions));
    }
    if (data.accommodationTiers !== undefined) {
      setClauses.push(`accommodation_tiers = $${paramIndex++}`);
      values.push(JSON.stringify(data.accommodationTiers));
    }
    if (data.mealPlans !== undefined) {
      setClauses.push(`meal_plans = $${paramIndex++}`);
      values.push(JSON.stringify(data.mealPlans));
    }
    if (data.isPublished !== undefined) {
      setClauses.push(`is_published = $${paramIndex++}`);
      values.push(data.isPublished);
    }
    if (data.isFeatured !== undefined) {
      setClauses.push(`is_featured = $${paramIndex++}`);
      values.push(data.isFeatured);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await executor.query<TourPackageRow>(
      `UPDATE tour_packages
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        ${PACKAGE_PROJECTION};`,
      values,
    );

    const updatedRow = result.rows[0];
    return updatedRow ? mapTourPackageRowToEntity(updatedRow) : null;
  }

  /**
   * Delete a tour package by its ID.
   * Note: Cascades deletion to itinerary_days in PostgreSQL.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM tour_packages
      WHERE id = $1
      RETURNING id;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List tour packages with filters and pagination.
   */
  async list(
    filter: ExtendedTourPackageQueryFilter = {},
    client?: pg.PoolClient,
  ): Promise<{ items: TourPackageEntity[]; total: number }> {
    const executor = this.getExecutor(client);
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    let joinSql = '';

    if (filter.destinationId !== undefined) {
      whereClauses.push(`tp.destination_id = $${paramIndex++}`);
      values.push(filter.destinationId);
    }

    if (filter.destinationSlug !== undefined) {
      joinSql += ` JOIN destinations d ON tp.destination_id = d.id`;
      whereClauses.push(`d.slug = $${paramIndex++}`);
      values.push(filter.destinationSlug);
    }

    if (filter.themeId !== undefined) {
      whereClauses.push(`tp.theme_id = $${paramIndex++}`);
      values.push(filter.themeId);
    }

    if (filter.themeSlug !== undefined) {
      joinSql += ` JOIN themes t ON tp.theme_id = t.id`;
      whereClauses.push(`t.slug = $${paramIndex++}`);
      values.push(filter.themeSlug);
    }

    if (filter.isPublished !== undefined) {
      whereClauses.push(`tp.is_published = $${paramIndex++}`);
      values.push(filter.isPublished);
    }

    if (filter.isFeatured !== undefined) {
      whereClauses.push(`tp.is_featured = $${paramIndex++}`);
      values.push(filter.isFeatured);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total Count
    const countResult = await executor.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM tour_packages tp ${joinSql} ${whereSql};`,
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

    const listResult = await executor.query<TourPackageRow>(
      `SELECT
        tp.id,
        tp.destination_id,
        tp.theme_id,
        tp.slug,
        tp.title,
        tp.short_description,
        tp.description,
        tp.duration_days,
        tp.duration_nights,
        tp.origin_city,
        tp.destination_city,
        tp.base_adult_price,
        tp.base_child_price,
        tp.currency,
        tp.hero_image_url,
        tp.gallery_urls,
        tp.inclusions,
        tp.exclusions,
        tp.accommodation_tiers,
        tp.meal_plans,
        tp.is_published,
        tp.is_featured,
        tp.created_at,
        tp.updated_at
      FROM tour_packages tp
      ${joinSql}
      ${whereSql}
      ORDER BY tp.is_featured DESC, tp.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};`,
      listValues,
    );

    return {
      items: listResult.rows.map(mapTourPackageRowToEntity),
      total,
    };
  }

  /**
   * List tour packages for a specific destination ID.
   */
  async listByDestinationId(
    destinationId: string,
    client?: pg.PoolClient,
  ): Promise<TourPackageEntity[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<TourPackageRow>(
      `SELECT
        ${PACKAGE_PROJECTION}
      FROM tour_packages
      WHERE destination_id = $1
      ORDER BY is_featured DESC, title ASC;`,
      [destinationId],
    );

    return result.rows.map(mapTourPackageRowToEntity);
  }

  /**
   * List tour packages for a specific theme ID.
   */
  async listByThemeId(themeId: string, client?: pg.PoolClient): Promise<TourPackageEntity[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<TourPackageRow>(
      `SELECT
        ${PACKAGE_PROJECTION}
      FROM tour_packages
      WHERE theme_id = $1
      ORDER BY is_featured DESC, title ASC;`,
      [themeId],
    );

    return result.rows.map(mapTourPackageRowToEntity);
  }
}
