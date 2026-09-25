import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  DepartureRepository,
  DepartureRow,
  InventoryHoldRepository,
  InventoryHoldRow,
} from '../../backend/src/modules/inventory/repositories/index.js';
import {
  PackageSearchRepository,
  PackageSearchRow,
} from '../../backend/src/modules/search/repositories/index.js';

describe('Phase 4 Step 3 — Repositories & Data Access Layer (Search, Departures & Inventory Holds)', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockClientQuery: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseService;
  let mockClient: pg.PoolClient;

  let departureRepo: DepartureRepository;
  let holdRepo: InventoryHoldRepository;
  let searchRepo: PackageSearchRepository;

  const sampleDepartureRow: DepartureRow = {
    id: 'd1111111-2222-3333-4444-555555555555',
    package_id: 'p1111111-2222-3333-4444-555555555555',
    departure_date: '2026-10-15',
    return_date: '2026-10-22',
    total_seat_capacity: 20,
    booked_seats: 5,
    price_override_adult: '4500000',
    price_override_child: '2500000',
    currency: 'INR',
    status: 'OPEN',
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
  };

  const sampleHoldRow: InventoryHoldRow = {
    id: 'h1111111-2222-3333-4444-555555555555',
    departure_id: 'd1111111-2222-3333-4444-555555555555',
    checkout_session_token: 'chk_session_tok_abc123',
    user_id: 'u1111111-2222-3333-4444-555555555555',
    held_seats: 4,
    status: 'ACTIVE',
    expires_at: '2026-09-26T01:00:00.000Z',
    created_at: '2026-09-26T00:45:00.000Z',
  };

  const sampleSearchRow: PackageSearchRow = {
    id: 'p1111111-2222-3333-4444-555555555555',
    slug: 'manali-atal-tunnel-mountain-escape',
    title: 'Manali & Atal Tunnel Mountain Escape',
    short_description: 'Experience snowfall and Himalayan views.',
    duration_days: 5,
    duration_nights: 4,
    origin_city: 'Delhi',
    destination_city: 'Manali',
    base_adult_price: '2650000',
    base_child_price: '1500000',
    currency: 'INR',
    hero_image_url: 'https://images.unsplash.com/manali.jpg',
    is_published: true,
    is_featured: true,
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
    destination_id: 'dest-1111',
    destination_slug: 'manali-himachal',
    destination_city_name: 'Manali',
    destination_country: 'India',
    theme_id: 'theme-1111',
    theme_slug: 'adventure-trekking',
    theme_title: 'Adventure & Trekking',
    next_dep_id: 'd1111111-2222-3333-4444-555555555555',
    next_dep_date: '2026-10-15',
    next_dep_return_date: '2026-10-20',
    next_dep_available_seats: 11,
    next_dep_price_override_adult: null,
    next_dep_currency: 'INR',
  };

  beforeEach(() => {
    mockQuery = vi.fn();
    mockClientQuery = vi.fn();

    mockDb = {
      query: mockQuery,
    } as unknown as DatabaseService;

    mockClient = {
      query: mockClientQuery,
    } as unknown as pg.PoolClient;

    departureRepo = new DepartureRepository(mockDb);
    holdRepo = new InventoryHoldRepository(mockDb);
    searchRepo = new PackageSearchRepository(mockDb);
  });

  // ============================================================
  // 1. DepartureRepository Tests
  // ============================================================
  describe('1. DepartureRepository Data Access', () => {
    it('1.1 create: inserts departure with parameterized values and maps result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDepartureRow], rowCount: 1 });

      const result = await departureRepo.create({
        packageId: 'p1111111-2222-3333-4444-555555555555',
        departureDate: '2026-10-15',
        returnDate: '2026-10-22',
        totalSeatCapacity: 20,
        priceOverrideAdult: 4500000,
        priceOverrideChild: 2500000,
        currency: 'INR',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO departure_schedules');
      expect(params).toEqual([
        'p1111111-2222-3333-4444-555555555555',
        '2026-10-15',
        '2026-10-22',
        20,
        4500000,
        2500000,
        'INR',
        'OPEN',
      ]);
      expect(result.id).toBe(sampleDepartureRow.id);
      expect(result.totalSeatCapacity).toBe(20);
      expect(result.bookedSeats).toBe(5);
      expect(result.priceOverrideAdult).toBe(4500000);
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('OPEN');
    });

    it('1.2 findById: queries departure by primary key with explicit projection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDepartureRow], rowCount: 1 });

      const result = await departureRepo.findById(sampleDepartureRow.id);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE id = $1');
      expect(sql).not.toContain('SELECT *');
      expect(params).toEqual([sampleDepartureRow.id]);
      expect(result?.id).toBe(sampleDepartureRow.id);
    });

    it('1.3 findById: returns null when departure record does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await departureRepo.findById('non-existent-id');
      expect(result).toBeNull();
    });

    it('1.4 findByIdForUpdate: acquires exclusive row lock FOR UPDATE on transaction client', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [sampleDepartureRow], rowCount: 1 });

      const result = await departureRepo.findByIdForUpdate(sampleDepartureRow.id, mockClient);

      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockClientQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE id = $1');
      expect(sql).toContain('FOR UPDATE');
      expect(params).toEqual([sampleDepartureRow.id]);
      expect(result?.id).toBe(sampleDepartureRow.id);
    });

    it('1.5 listByPackageId: builds parameterized filters and deterministic date ordering', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDepartureRow], rowCount: 1 });

      const result = await departureRepo.listByPackageId(sampleDepartureRow.package_id, {
        status: 'OPEN',
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
        page: 1,
        limit: 10,
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain(
        'WHERE package_id = $1 AND status = $2 AND departure_date >= $3 AND departure_date <= $4',
      );
      expect(sql).toContain('ORDER BY departure_date ASC, id ASC');
      expect(sql).toContain('LIMIT $5 OFFSET $6');
      expect(params).toEqual([
        sampleDepartureRow.package_id,
        'OPEN',
        '2026-10-01',
        '2026-10-31',
        10,
        0,
      ]);
      expect(result).toHaveLength(1);
    });

    it('1.6 listUpcomingForPackage: queries open departures on or after CURRENT_DATE', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDepartureRow], rowCount: 1 });

      await departureRepo.listUpcomingForPackage(sampleDepartureRow.package_id);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("status = 'OPEN'");
      expect(sql).toContain('departure_date >= COALESCE($2::date, CURRENT_DATE)');
      expect(params).toEqual([sampleDepartureRow.package_id, null]);
    });

    it('1.7 update: performs dynamic parameterized update and updates updated_at', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleDepartureRow, total_seat_capacity: 30, status: 'CLOSED' }],
        rowCount: 1,
      });

      const result = await departureRepo.update(sampleDepartureRow.id, {
        totalSeatCapacity: 30,
        status: 'CLOSED',
        priceOverrideAdult: 5000000,
      });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE departure_schedules');
      expect(sql).toContain('total_seat_capacity = $2');
      expect(sql).toContain('price_override_adult = $3');
      expect(sql).toContain('status = $4');
      expect(sql).toContain('updated_at = NOW()');
      expect(params).toEqual([sampleDepartureRow.id, 30, 5000000, 'CLOSED']);
      expect(result?.totalSeatCapacity).toBe(30);
      expect(result?.status).toBe('CLOSED');
    });

    it('1.8 incrementBookedSeats: atomically increments booked_seats inside a transaction', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ ...sampleDepartureRow, booked_seats: 9 }],
        rowCount: 1,
      });

      const result = await departureRepo.incrementBookedSeats(sampleDepartureRow.id, 4, mockClient);

      const [sql, params] = mockClientQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('booked_seats = booked_seats + $2');
      expect(params).toEqual([sampleDepartureRow.id, 4]);
      expect(result?.bookedSeats).toBe(9);
    });

    it('1.9 delete: deletes departure only when booked_seats is zero', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const deleted = await departureRepo.delete(sampleDepartureRow.id);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE id = $1 AND booked_seats = 0');
      expect(params).toEqual([sampleDepartureRow.id]);
      expect(deleted).toBe(true);
    });

    it('1.10 getAvailabilityById: dynamically calculates S_available and active unexpired holds', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: sampleDepartureRow.id,
            package_id: sampleDepartureRow.package_id,
            departure_date: '2026-10-15',
            return_date: '2026-10-22',
            total_seat_capacity: 20,
            booked_seats: 8,
            price_override_adult: '4500000',
            price_override_child: null,
            departure_currency: 'INR',
            departure_status: 'OPEN',
            active_held_seats: 5,
            available_seats: 7, // 20 - 8 - 5 = 7
            base_adult_price: '4000000',
            base_child_price: '2000000',
            package_currency: 'INR',
          },
        ],
        rowCount: 1,
      });

      const result = await departureRepo.getAvailabilityById(sampleDepartureRow.id);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("ih.status = 'ACTIVE'");
      expect(sql).toContain('ih.expires_at > NOW()');
      expect(sql).toContain('available_seats');
      expect(sql).toContain('GREATEST(');
      expect(params).toEqual([sampleDepartureRow.id]);
      expect(result?.totalSeatCapacity).toBe(20);
      expect(result?.bookedSeats).toBe(8);
      expect(result?.activeHeldSeats).toBe(5);
      expect(result?.availableSeats).toBe(7);
      expect(result?.priceOverrideAdult).toBe(4500000);
      expect(result?.baseAdultPrice).toBe(4000000);
    });
  });

  // ============================================================
  // 2. InventoryHoldRepository Tests
  // ============================================================
  describe('2. InventoryHoldRepository Data Access', () => {
    it('2.1 create: persists temporary seat hold with parameterized values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleHoldRow], rowCount: 1 });

      const result = await holdRepo.create({
        departureId: sampleHoldRow.departure_id,
        checkoutSessionToken: sampleHoldRow.checkout_session_token,
        userId: sampleHoldRow.user_id,
        heldSeats: 4,
        expiresAt: sampleHoldRow.expires_at,
      });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO inventory_holds');
      expect(params).toEqual([
        sampleHoldRow.departure_id,
        sampleHoldRow.checkout_session_token,
        sampleHoldRow.user_id,
        4,
        'ACTIVE',
        sampleHoldRow.expires_at,
      ]);
      expect(result.id).toBe(sampleHoldRow.id);
      expect(result.heldSeats).toBe(4);
      expect(result.status).toBe('ACTIVE');
    });

    it('2.2 findBySessionToken: retrieves hold record by unique session token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleHoldRow], rowCount: 1 });

      const result = await holdRepo.findBySessionToken('chk_session_tok_abc123');

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE checkout_session_token = $1');
      expect(params).toEqual(['chk_session_tok_abc123']);
      expect(result?.checkoutSessionToken).toBe('chk_session_tok_abc123');
    });

    it('2.3 getActiveHoldCountForDeparture: sums only ACTIVE holds where expires_at > NOW()', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ active_held_seats: 6 }], rowCount: 1 });

      const count = await holdRepo.getActiveHoldCountForDeparture(sampleHoldRow.departure_id);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("status = 'ACTIVE'");
      expect(sql).toContain('expires_at > NOW()');
      expect(sql).toContain('COALESCE(SUM(held_seats), 0)::integer');
      expect(params).toEqual([sampleHoldRow.departure_id]);
      expect(count).toBe(6);
    });

    it('2.4 releaseHold: marks active hold as RELEASED', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const released = await holdRepo.releaseHold(sampleHoldRow.id);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE inventory_holds');
      expect(sql).toContain("SET status = 'RELEASED'");
      expect(sql).toContain("WHERE id = $1 AND status = 'ACTIVE'");
      expect(params).toEqual([sampleHoldRow.id]);
      expect(released).toBe(true);
    });

    it('2.5 findExpiredActiveHolds: queries active holds where expires_at <= NOW() for worker cleanup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleHoldRow], rowCount: 1 });

      const expiredHolds = await holdRepo.findExpiredActiveHolds(50);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("status = 'ACTIVE'");
      expect(sql).toContain('expires_at <= NOW()');
      expect(sql).toContain('LIMIT $1');
      expect(params).toEqual([50]);
      expect(expiredHolds).toHaveLength(1);
    });
  });

  // ============================================================
  // 3. PackageSearchRepository Tests
  // ============================================================
  describe('3. PackageSearchRepository Data Access & SQL Safety', () => {
    it('3.1 searchPackages: enforces publication rule (tour_packages.is_published AND destinations.is_published)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 }) // count query
        .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 }); // list query

      const result = await searchRepo.searchPackages({});

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const [countSql] = mockQuery.mock.calls[0] as [string, unknown[]];
      const [listSql] = mockQuery.mock.calls[1] as [string, unknown[]];

      expect(countSql).toContain('tp.is_published = TRUE AND d.is_published = TRUE');
      expect(listSql).toContain('tp.is_published = TRUE AND d.is_published = TRUE');
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('Manali & Atal Tunnel Mountain Escape');
      expect(result.items[0]?.nextDeparture?.availableSeats).toBe(11);
    });

    it('3.2 searchPackages: parameterizes keyword search (q) across title, short_description, city_name, country', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 });

      await searchRepo.searchPackages({ q: 'Manali Snow' });

      const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(countSql).toContain(
        'tp.title ILIKE $1 OR tp.short_description ILIKE $1 OR d.city_name ILIKE $1 OR d.country ILIKE $1',
      );
      expect(countParams).toEqual(['%Manali Snow%']);
    });

    it('3.3 searchPackages: safely parameterizes all canonical multi-criteria filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 });

      await searchRepo.searchPackages({
        q: 'Himalayas',
        destinationSlug: 'himachal-pradesh',
        themeSlug: 'adventure-trekking',
        minDuration: 3,
        maxDuration: 7,
        maxPrice: 5000000,
        page: 2,
        limit: 10,
      });

      const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(countSql).toContain('d.slug = $2');
      expect(countSql).toContain('t.slug = $3');
      expect(countSql).toContain('tp.duration_days >= $4');
      expect(countSql).toContain('tp.duration_days <= $5');
      expect(countSql).toContain('tp.base_adult_price <= $6');
      expect(countParams).toEqual([
        '%Himalayas%',
        'himachal-pradesh',
        'adventure-trekking',
        3,
        7,
        5000000,
      ]);

      const [listSql, listParams] = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(listSql).toContain('LIMIT $7 OFFSET $8');
      expect(listParams).toEqual([
        '%Himalayas%',
        'himachal-pradesh',
        'adventure-trekking',
        3,
        7,
        5000000,
        10,
        10, // offset = (2 - 1) * 10 = 10
      ]);
    });

    it('3.4 searchPackages: supports optional extensions (minPrice, currency, departure dates, isFeatured)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 });

      await searchRepo.searchPackages({
        minPrice: 2000000,
        currency: 'INR',
        departureDateFrom: '2026-10-01',
        departureDateTo: '2026-10-31',
        isFeatured: true,
      });

      const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(countSql).toContain('tp.base_adult_price >= $1');
      expect(countSql).toContain('tp.currency = $2');
      expect(countSql).toContain("status = 'OPEN'");
      expect(countSql).toContain('departure_date >= $3::date');
      expect(countSql).toContain('departure_date <= $4::date');
      expect(countSql).toContain('tp.is_featured = $5');
      expect(countParams).toEqual([2000000, 'INR', '2026-10-01', '2026-10-31', true]);
    });

    it('3.5 searchPackages: maps canonical and optional sort allowlists with secondary tie-breakers', async () => {
      const sortTests: Record<string, string> = {
        price_asc: 'tp.base_adult_price ASC, tp.created_at DESC, tp.id ASC',
        price_desc: 'tp.base_adult_price DESC, tp.created_at DESC, tp.id ASC',
        duration_asc: 'tp.duration_days ASC, tp.created_at DESC, tp.id ASC',
        duration_desc: 'tp.duration_days DESC, tp.created_at DESC, tp.id ASC',
        newest: 'tp.created_at DESC, tp.id ASC',
        featured: 'tp.is_featured DESC, tp.created_at DESC, tp.id ASC',
      };

      for (const [sortKey, expectedSql] of Object.entries(sortTests)) {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 });

        await searchRepo.searchPackages({ sortBy: sortKey as any });

        const [listSql] = mockQuery.mock.calls[1] as [string, unknown[]];
        expect(listSql).toContain(`ORDER BY ${expectedSql}`);
        mockQuery.mockClear();
      }
    });

    it('3.6 searchPackages: applies deterministic sort fallback when sortBy is omitted (no implicit featured default)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [sampleSearchRow], rowCount: 1 });

      await searchRepo.searchPackages({});

      const [listSql] = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(listSql).toContain('ORDER BY tp.created_at DESC, tp.id ASC');
      expect(listSql).not.toContain('ORDER BY tp.is_featured DESC');
    });

    it('3.7 SQL Injection Defense: malicious SQL payloads in q or slugs are strictly parameterized', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const maliciousPayload = "'; DROP TABLE tour_packages; --";

      await searchRepo.searchPackages({
        q: maliciousPayload,
        destinationSlug: maliciousPayload,
      });

      const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(countSql).not.toContain("'; DROP TABLE");
      expect(countParams[0]).toBe(`%${maliciousPayload}%`);
      expect(countParams[1]).toBe(maliciousPayload.toLowerCase());
    });
  });
});
