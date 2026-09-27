import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { AdminDashboardStatsDto } from '../../../../../shared/src/index.js';

export class AdminDashboardRepository {
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
   * Aggregate operational summary metrics across catalogue, inventory, booking, and cancellation modules.
   * Strictly non-revenue operational statistics.
   */
  async getOperationalStats(client?: pg.PoolClient): Promise<AdminDashboardStatsDto> {
    const executor = this.getExecutor(client);

    const statsSql = `
      SELECT
        (SELECT COUNT(*)::int FROM tour_packages) AS total_packages,
        (SELECT COUNT(*)::int FROM tour_packages WHERE is_published = true) AS published_packages,
        (SELECT COUNT(*)::int FROM tour_packages WHERE is_published = false) AS draft_packages,
        (SELECT COUNT(*)::int FROM destinations) AS total_destinations,
        (SELECT COUNT(*)::int FROM themes) AS total_themes,
        (SELECT COUNT(*)::int FROM departures) AS total_departures,
        (SELECT COUNT(*)::int FROM departures WHERE status = 'OPEN') AS open_departures,
        (SELECT COUNT(*)::int FROM departures WHERE departure_date >= CURRENT_DATE AND status = 'OPEN') AS upcoming_departures,
        (SELECT COUNT(*)::int FROM bookings) AS total_bookings,
        (SELECT COUNT(*)::int FROM bookings WHERE status = 'CONFIRMED') AS confirmed_bookings,
        (SELECT COUNT(*)::int FROM bookings WHERE status = 'AWAITING_PAYMENT') AS awaiting_payment_bookings,
        (SELECT COUNT(*)::int FROM bookings WHERE status = 'CANCELLED') AS cancelled_bookings,
        (SELECT COUNT(*)::int FROM cancellation_requests WHERE status = 'PENDING') AS pending_cancellations,
        COALESCE(
          (
            SELECT CASE
              WHEN SUM(total_seat_capacity) > 0 THEN
                ROUND((SUM(booked_seats)::numeric / SUM(total_seat_capacity)::numeric) * 100, 2)::float
              ELSE 0.0
            END
            FROM departures
          ),
          0.0
        ) AS inventory_utilization_percent;
    `;

    interface OperationalStatsRow {
      total_packages: number;
      published_packages: number;
      draft_packages: number;
      total_destinations: number;
      total_themes: number;
      total_departures: number;
      open_departures: number;
      upcoming_departures: number;
      total_bookings: number;
      confirmed_bookings: number;
      awaiting_payment_bookings: number;
      cancelled_bookings: number;
      pending_cancellations: number;
      inventory_utilization_percent: number;
    }

    const result = await executor.query<OperationalStatsRow>(statsSql);
    const row = result.rows[0];

    return {
      totalPackages: row?.total_packages ?? 0,
      publishedPackages: row?.published_packages ?? 0,
      draftPackages: row?.draft_packages ?? 0,
      totalDestinations: row?.total_destinations ?? 0,
      totalThemes: row?.total_themes ?? 0,
      totalDepartures: row?.total_departures ?? 0,
      openDepartures: row?.open_departures ?? 0,
      upcomingDeparturesCount: row?.upcoming_departures ?? 0,
      totalBookings: row?.total_bookings ?? 0,
      confirmedBookings: row?.confirmed_bookings ?? 0,
      awaitingPaymentBookings: row?.awaiting_payment_bookings ?? 0,
      cancelledBookings: row?.cancelled_bookings ?? 0,
      pendingCancellations: row?.pending_cancellations ?? 0,
      inventoryUtilizationPercent: Number(row?.inventory_utilization_percent ?? 0),
    };
  }
}
