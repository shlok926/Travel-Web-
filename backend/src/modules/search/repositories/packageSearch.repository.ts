import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import {
  PackageSearchQueryDto,
  PackageSearchResultDto,
  PackageSortOption,
  SupportedCurrency,
} from '../../../../../shared/src/index.js';

// ============================================================
// 1. Data Transfer & Internal Interfaces
// ============================================================

export interface PackageSearchRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  duration_days: number;
  duration_nights: number;
  origin_city: string;
  destination_city: string;
  base_adult_price: string | number;
  base_child_price: string | number;
  currency: string;
  hero_image_url: string;
  is_published: boolean;
  is_featured: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  // Joined Destination fields
  destination_id: string;
  destination_slug: string;
  destination_city_name: string;
  destination_country: string;
  // Joined Theme fields
  theme_id: string | null;
  theme_slug: string | null;
  theme_title: string | null;
  // Joined Next Departure fields (from LATERAL join)
  next_dep_id: string | null;
  next_dep_date: string | null;
  next_dep_return_date: string | null;
  next_dep_available_seats: number | string | null;
  next_dep_price_override_adult: string | number | null;
  next_dep_currency: string | null;
}

export interface PackageSearchResultEntity {
  items: PackageSearchResultDto[];
  total: number;
}

// Allowlisted sort mappings with secondary tie-breakers
const SORT_MAPPING: Record<PackageSortOption, string> = {
  price_asc: 'tp.base_adult_price ASC, tp.created_at DESC, tp.id ASC',
  price_desc: 'tp.base_adult_price DESC, tp.created_at DESC, tp.id ASC',
  duration_asc: 'tp.duration_days ASC, tp.created_at DESC, tp.id ASC',
  duration_desc: 'tp.duration_days DESC, tp.created_at DESC, tp.id ASC',
  newest: 'tp.created_at DESC, tp.id ASC',
  featured: 'tp.is_featured DESC, tp.created_at DESC, tp.id ASC',
};

// Default deterministic sort fallback when sortBy is undefined at contract layer
const DEFAULT_DETERMINISTIC_SORT = 'tp.created_at DESC, tp.id ASC';

function mapRowToSearchResultDto(row: PackageSearchRow): PackageSearchResultDto {
  const baseAdultPrice = Number(row.base_adult_price);
  const baseChildPrice = Number(row.base_child_price);
  const currency = row.currency as SupportedCurrency;

  let nextDeparture = null;
  if (row.next_dep_id && row.next_dep_date && row.next_dep_return_date) {
    const availSeats = Number(row.next_dep_available_seats ?? 0);
    let availabilityStatus: 'AVAILABLE' | 'FEW_SEATS_LEFT' | 'SOLD_OUT' = 'AVAILABLE';
    if (availSeats <= 0) {
      availabilityStatus = 'SOLD_OUT';
    } else if (availSeats < 5) {
      availabilityStatus = 'FEW_SEATS_LEFT';
    }

    const effectiveAdultPrice =
      row.next_dep_price_override_adult !== null && row.next_dep_price_override_adult !== undefined
        ? Number(row.next_dep_price_override_adult)
        : baseAdultPrice;

    nextDeparture = {
      departureId: row.next_dep_id,
      departureDate: row.next_dep_date.split('T')[0] ?? row.next_dep_date,
      returnDate: row.next_dep_return_date.split('T')[0] ?? row.next_dep_return_date,
      availableSeats: availSeats,
      availabilityStatus,
      effectiveAdultPrice,
      currency: (row.next_dep_currency as SupportedCurrency) || currency,
    };
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    durationDays: Number(row.duration_days),
    durationNights: Number(row.duration_nights),
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    baseAdultPrice,
    baseChildPrice,
    currency,
    heroImageUrl: row.hero_image_url,
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    destination: {
      id: row.destination_id,
      slug: row.destination_slug,
      cityName: row.destination_city_name,
      country: row.destination_country,
    },
    theme:
      row.theme_id && row.theme_slug && row.theme_title
        ? {
            id: row.theme_id,
            slug: row.theme_slug,
            title: row.theme_title,
          }
        : null,
    nextDeparture,
  };
}

// ============================================================
// 2. PackageSearchRepository Class
// ============================================================

export class PackageSearchRepository {
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
   * Search published tour packages using multi-criteria filters, canonical sorting, and pagination.
   *
   * Core Invariants:
   * - Enforces `tp.is_published = TRUE AND d.is_published = TRUE` (BR-PKG-001)
   * - Fully parameterized SQL queries ($1, $2, ...)
   * - Allows safe allowlisted sorting without SQL injection
   * - Computes real-time available seats for next upcoming departure via LATERAL subquery
   */
  async searchPackages(
    filters: PackageSearchQueryDto = {},
    client?: pg.PoolClient,
  ): Promise<PackageSearchResultEntity> {
    const executor = this.getExecutor(client);
    const conditions: string[] = ['tp.is_published = TRUE', 'd.is_published = TRUE'];
    const values: unknown[] = [];
    let paramIndex = 1;

    // 1. Keyword search (FR-SEARCH-001: title, short_description, city_name, country)
    if (filters.q && filters.q.trim().length > 0) {
      const searchPattern = `%${filters.q.trim()}%`;
      conditions.push(
        `(tp.title ILIKE $${paramIndex} OR tp.short_description ILIKE $${paramIndex} OR d.city_name ILIKE $${paramIndex} OR d.country ILIKE $${paramIndex})`,
      );
      values.push(searchPattern);
      paramIndex++;
    }

    // 2. Canonical Destination Slug (FR-SEARCH-002)
    if (filters.destinationSlug) {
      conditions.push(`d.slug = $${paramIndex++}`);
      values.push(filters.destinationSlug.trim().toLowerCase());
    }

    // 3. Canonical Theme Slug (FR-SEARCH-002)
    if (filters.themeSlug) {
      conditions.push(`t.slug = $${paramIndex++}`);
      values.push(filters.themeSlug.trim().toLowerCase());
    }

    // 4. Canonical Duration Bounds (FR-SEARCH-002)
    if (filters.minDuration !== undefined) {
      conditions.push(`tp.duration_days >= $${paramIndex++}`);
      values.push(filters.minDuration);
    }
    if (filters.maxDuration !== undefined) {
      conditions.push(`tp.duration_days <= $${paramIndex++}`);
      values.push(filters.maxDuration);
    }

    // 5. Canonical Maximum Budget (FR-SEARCH-002, minor units)
    if (filters.maxPrice !== undefined) {
      conditions.push(`tp.base_adult_price <= $${paramIndex++}`);
      values.push(filters.maxPrice);
    }

    // 6. [OPTIONAL EXTENSION] Minimum Price (minor units)
    if (filters.minPrice !== undefined) {
      conditions.push(`tp.base_adult_price >= $${paramIndex++}`);
      values.push(filters.minPrice);
    }

    // 7. [OPTIONAL EXTENSION] Currency
    if (filters.currency) {
      conditions.push(`tp.currency = $${paramIndex++}`);
      values.push(filters.currency);
    }

    // 8. [OPTIONAL EXTENSION] Departure Date Range
    if (filters.departureDateFrom) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM departure_schedules ds_filter
          WHERE ds_filter.package_id = tp.id
            AND ds_filter.status = 'OPEN'
            AND ds_filter.departure_date >= $${paramIndex++}::date
        )`,
      );
      values.push(filters.departureDateFrom);
    }

    if (filters.departureDateTo) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM departure_schedules ds_filter
          WHERE ds_filter.package_id = tp.id
            AND ds_filter.status = 'OPEN'
            AND ds_filter.departure_date <= $${paramIndex++}::date
        )`,
      );
      values.push(filters.departureDateTo);
    }

    // 9. [OPTIONAL EXTENSION] isFeatured
    if (filters.isFeatured !== undefined) {
      conditions.push(`tp.is_featured = $${paramIndex++}`);
      values.push(filters.isFeatured);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Order By Resolution (strictly allowlisted)
    let orderByClause = DEFAULT_DETERMINISTIC_SORT;
    if (filters.sortBy && SORT_MAPPING[filters.sortBy]) {
      orderByClause = SORT_MAPPING[filters.sortBy];
    }

    // 10. Execute Total Count Query
    const countSql = `
      SELECT COUNT(*)::text AS total
      FROM tour_packages tp
      JOIN destinations d ON tp.destination_id = d.id
      LEFT JOIN themes t ON tp.theme_id = t.id
      ${whereClause};
    `;

    const countResult = await executor.query<{ total: string }>(countSql, values);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // 11. Pagination
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(50, filters.limit ?? 12));
    const offset = (page - 1) * limit;

    const listValues = [...values, limit, offset];
    const limitPlaceholder = `$${paramIndex++}`;
    const offsetPlaceholder = `$${paramIndex++}`;

    // 12. Main Search Query with Next Available Departure Projection
    const searchSql = `
      SELECT
        tp.id,
        tp.slug,
        tp.title,
        tp.short_description,
        tp.duration_days,
        tp.duration_nights,
        tp.origin_city,
        tp.destination_city,
        tp.base_adult_price,
        tp.base_child_price,
        tp.currency,
        tp.hero_image_url,
        tp.is_published,
        tp.is_featured,
        tp.created_at,
        tp.updated_at,
        d.id AS destination_id,
        d.slug AS destination_slug,
        d.city_name AS destination_city_name,
        d.country AS destination_country,
        t.id AS theme_id,
        t.slug AS theme_slug,
        t.title AS theme_title,
        next_dep.next_dep_id,
        next_dep.next_dep_date,
        next_dep.next_dep_return_date,
        next_dep.next_dep_available_seats,
        next_dep.next_dep_price_override_adult,
        next_dep.next_dep_currency
      FROM tour_packages tp
      JOIN destinations d ON tp.destination_id = d.id
      LEFT JOIN themes t ON tp.theme_id = t.id
      LEFT JOIN LATERAL (
        SELECT
          ds.id AS next_dep_id,
          ds.departure_date::text AS next_dep_date,
          ds.return_date::text AS next_dep_return_date,
          GREATEST(0, ds.total_seat_capacity - ds.booked_seats - COALESCE(SUM(ih.held_seats), 0))::integer AS next_dep_available_seats,
          ds.price_override_adult AS next_dep_price_override_adult,
          ds.currency AS next_dep_currency
        FROM departure_schedules ds
        LEFT JOIN inventory_holds ih ON ds.id = ih.departure_id
          AND ih.status = 'ACTIVE'
          AND ih.expires_at > NOW()
        WHERE ds.package_id = tp.id
          AND ds.status = 'OPEN'
          AND ds.departure_date >= CURRENT_DATE
        GROUP BY ds.id
        HAVING GREATEST(0, ds.total_seat_capacity - ds.booked_seats - COALESCE(SUM(ih.held_seats), 0)) > 0
        ORDER BY ds.departure_date ASC
        LIMIT 1
      ) next_dep ON true
      ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;

    const result = await executor.query<PackageSearchRow>(searchSql, listValues);

    return {
      items: result.rows.map(mapRowToSearchResultDto),
      total,
    };
  }
}
