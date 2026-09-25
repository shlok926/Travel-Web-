import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { DailyMeal } from '../../../../../shared/src/index.js';

export interface ItineraryDayEntity {
  id: string;
  packageId: string;
  dayNumber: number;
  title: string;
  activityDescription: string;
  mealsIncluded: DailyMeal[];
  accommodationNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItineraryDayRow {
  id: string;
  package_id: string;
  day_number: number;
  title: string;
  activity_description: string;
  meals_included: unknown;
  accommodation_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateItineraryDayData {
  packageId: string;
  dayNumber: number;
  title: string;
  activityDescription: string;
  mealsIncluded?: DailyMeal[];
  accommodationNotes?: string | null;
}

export interface UpdateItineraryDayData {
  dayNumber?: number;
  title?: string;
  activityDescription?: string;
  mealsIncluded?: DailyMeal[];
  accommodationNotes?: string | null;
}

function parseMeals(value: unknown): DailyMeal[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as DailyMeal[];
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as DailyMeal[];
    } catch {
      return [];
    }
  }
  return [];
}

export function mapItineraryDayRowToEntity(row: ItineraryDayRow): ItineraryDayEntity {
  return {
    id: row.id,
    packageId: row.package_id,
    dayNumber: row.day_number,
    title: row.title,
    activityDescription: row.activity_description,
    mealsIncluded: parseMeals(row.meals_included),
    accommodationNotes: row.accommodation_notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const ITINERARY_PROJECTION = `
  id,
  package_id,
  day_number,
  title,
  activity_description,
  meals_included,
  accommodation_notes,
  created_at,
  updated_at
`;

export class ItineraryRepository {
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
   * Find an itinerary day by its primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<ItineraryDayEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ItineraryDayRow>(
      `SELECT
        ${ITINERARY_PROJECTION}
      FROM itinerary_days
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapItineraryDayRowToEntity(row) : null;
  }

  /**
   * List all itinerary days for a package ordered by day_number ascending.
   */
  async listByPackageId(packageId: string, client?: pg.PoolClient): Promise<ItineraryDayEntity[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ItineraryDayRow>(
      `SELECT
        ${ITINERARY_PROJECTION}
      FROM itinerary_days
      WHERE package_id = $1
      ORDER BY day_number ASC;`,
      [packageId],
    );

    return result.rows.map(mapItineraryDayRowToEntity);
  }

  /**
   * Create a single itinerary day record.
   */
  async create(data: CreateItineraryDayData, client?: pg.PoolClient): Promise<ItineraryDayEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<ItineraryDayRow>(
      `INSERT INTO itinerary_days (
        package_id,
        day_number,
        title,
        activity_description,
        meals_included,
        accommodation_notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING
        ${ITINERARY_PROJECTION};`,
      [
        data.packageId,
        data.dayNumber,
        data.title,
        data.activityDescription,
        JSON.stringify(data.mealsIncluded ?? []),
        data.accommodationNotes ?? null,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert itinerary day record into database.');
    }

    return mapItineraryDayRowToEntity(createdRow);
  }

  /**
   * Batch insert multiple itinerary days for a package (useful in transactions).
   */
  async createMany(
    items: CreateItineraryDayData[],
    client?: pg.PoolClient,
  ): Promise<ItineraryDayEntity[]> {
    if (items.length === 0) {
      return [];
    }

    const results: ItineraryDayEntity[] = [];

    // Sequential inserts in transaction client
    for (const item of items) {
      const created = await this.create(item, client);
      results.push(created);
    }

    return results;
  }

  /**
   * Update an existing itinerary day record.
   */
  async update(
    id: string,
    data: UpdateItineraryDayData,
    client?: pg.PoolClient,
  ): Promise<ItineraryDayEntity | null> {
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.dayNumber !== undefined) {
      setClauses.push(`day_number = $${paramIndex++}`);
      values.push(data.dayNumber);
    }
    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.activityDescription !== undefined) {
      setClauses.push(`activity_description = $${paramIndex++}`);
      values.push(data.activityDescription);
    }
    if (data.mealsIncluded !== undefined) {
      setClauses.push(`meals_included = $${paramIndex++}`);
      values.push(JSON.stringify(data.mealsIncluded));
    }
    if (data.accommodationNotes !== undefined) {
      setClauses.push(`accommodation_notes = $${paramIndex++}`);
      values.push(data.accommodationNotes);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await executor.query<ItineraryDayRow>(
      `UPDATE itinerary_days
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        ${ITINERARY_PROJECTION};`,
      values,
    );

    const updatedRow = result.rows[0];
    return updatedRow ? mapItineraryDayRowToEntity(updatedRow) : null;
  }

  /**
   * Delete an itinerary day by its ID.
   */
  async delete(id: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM itinerary_days
      WHERE id = $1
      RETURNING id;`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete all itinerary days for a specific package (useful for atomic itinerary replacement).
   */
  async deleteByPackageId(packageId: string, client?: pg.PoolClient): Promise<number> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM itinerary_days
      WHERE package_id = $1;`,
      [packageId],
    );

    return result.rowCount ?? 0;
  }
}
