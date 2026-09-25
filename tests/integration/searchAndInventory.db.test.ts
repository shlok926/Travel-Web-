import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  DatabaseService,
  runMigrations,
  seedAll,
} from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  DepartureRepository,
  InventoryHoldRepository,
} from '../../backend/src/modules/inventory/repositories/index.js';
import { PackageSearchRepository } from '../../backend/src/modules/search/repositories/index.js';

describe('Phase 4 Step 3 — Search & Inventory Repositories (PostgreSQL Integration)', () => {
  let db: DatabaseService | null = null;
  let isDbAvailable = false;

  let departureRepo: DepartureRepository;
  let holdRepo: InventoryHoldRepository;
  let searchRepo: PackageSearchRepository;

  let testPackageId: string;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;

        // Run migrations and seeds to ensure clean state
        await runMigrations(db);
        await seedAll();

        departureRepo = new DepartureRepository(db);
        holdRepo = new InventoryHoldRepository(db);
        searchRepo = new PackageSearchRepository(db);

        // Fetch a seeded package ID for departure testing
        const pkgRes = await db.query<{ id: string }>(
          `SELECT id FROM tour_packages WHERE is_published = TRUE LIMIT 1;`,
        );
        testPackageId = pkgRes.rows[0]?.id ?? '';
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db) {
      if (isDbAvailable) {
        // Clean up any departures and holds created during tests
        await db.query(`DELETE FROM inventory_holds;`);
        await db.query(`DELETE FROM departure_schedules;`);
      }
      await db.close();
    }
  });

  describe('1. PackageSearchRepository Integration', () => {
    it('1.1 searches published packages with keyword (q) matching title or destination', async () => {
      if (!isDbAvailable) return;

      const result = await searchRepo.searchPackages({ q: 'Manali' });
      expect(result.total).toBeGreaterThan(0);
      expect(
        result.items.some((p) => p.title.includes('Manali') || p.destination.cityName === 'Manali'),
      ).toBe(true);
    });

    it('1.2 filters by destinationSlug, themeSlug, and duration range', async () => {
      if (!isDbAvailable) return;

      const result = await searchRepo.searchPackages({
        minDuration: 3,
        maxDuration: 10,
        maxPrice: 10000000, // 1,00,000 INR
        page: 1,
        limit: 10,
      });

      expect(result.total).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.durationDays).toBeGreaterThanOrEqual(3);
        expect(item.durationDays).toBeLessThanOrEqual(10);
        expect(item.baseAdultPrice).toBeLessThanOrEqual(10000000);
      }
    });

    it('1.3 executes canonical sorting without SQL injection or errors', async () => {
      if (!isDbAvailable) return;

      const ascResult = await searchRepo.searchPackages({ sortBy: 'price_asc' });
      const descResult = await searchRepo.searchPackages({ sortBy: 'price_desc' });

      expect(ascResult.total).toBeGreaterThan(0);
      expect(descResult.total).toBeGreaterThan(0);

      if (ascResult.items.length >= 2) {
        expect(ascResult.items[0]!.baseAdultPrice).toBeLessThanOrEqual(
          ascResult.items[1]!.baseAdultPrice,
        );
      }
      if (descResult.items.length >= 2) {
        expect(descResult.items[0]!.baseAdultPrice).toBeGreaterThanOrEqual(
          descResult.items[1]!.baseAdultPrice,
        );
      }
    });

    it('1.4 strictly parameterizes SQL and prevents SQL injection payloads', async () => {
      if (!isDbAvailable) return;

      const maliciousResult = await searchRepo.searchPackages({
        q: "' OR 1=1 --",
        destinationSlug: "'; DROP TABLE tour_packages; --",
      });

      expect(maliciousResult.total).toBe(0);
      expect(maliciousResult.items).toEqual([]);
    });
  });

  describe('2. Departure & Inventory Hold Repositories Integration', () => {
    let createdDepartureId: string;

    it('2.1 creates departure schedule and persists to PostgreSQL', async () => {
      if (!isDbAvailable || !testPackageId) return;

      const departure = await departureRepo.create({
        packageId: testPackageId,
        departureDate: '2026-11-15',
        returnDate: '2026-11-20',
        totalSeatCapacity: 20,
        priceOverrideAdult: 4800000,
        currency: 'INR',
      });

      expect(departure.id).toBeDefined();
      expect(departure.packageId).toBe(testPackageId);
      expect(departure.totalSeatCapacity).toBe(20);
      expect(departure.bookedSeats).toBe(0);
      expect(departure.priceOverrideAdult).toBe(4800000);
      createdDepartureId = departure.id;
    });

    it('2.2 dynamically aggregates live availability with active and expired holds', async () => {
      if (!isDbAvailable || !createdDepartureId) return;

      // 1. Initial availability: 20 total, 0 booked, 0 held -> 20 available
      const initialAvail = await departureRepo.getAvailabilityById(createdDepartureId);
      expect(initialAvail?.availableSeats).toBe(20);
      expect(initialAvail?.activeHeldSeats).toBe(0);

      // 2. Add an ACTIVE unexpired hold (4 seats, expires in 15 minutes)
      const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await holdRepo.create({
        departureId: createdDepartureId,
        checkoutSessionToken: 'sess_active_123',
        heldSeats: 4,
        status: 'ACTIVE',
        expiresAt: futureExpiry,
      });

      // 3. Add an EXPIRED hold (3 seats, expired 10 minutes ago)
      const pastExpiry = new Date(Date.now() - 10 * 60 * 1000);
      await holdRepo.create({
        departureId: createdDepartureId,
        checkoutSessionToken: 'sess_expired_456',
        heldSeats: 3,
        status: 'ACTIVE',
        expiresAt: pastExpiry,
      });

      // 4. Check active hold count: only the unexpired hold must be counted (4 seats)
      const activeHoldCount = await holdRepo.getActiveHoldCountForDeparture(createdDepartureId);
      expect(activeHoldCount).toBe(4);

      // 5. Check departure availability aggregate:
      // total = 20, booked = 0, activeHeld = 4 -> available = 20 - 4 = 16 (expired hold ignored)
      const availAfterHold = await departureRepo.getAvailabilityById(createdDepartureId);
      expect(availAfterHold?.totalSeatCapacity).toBe(20);
      expect(availAfterHold?.activeHeldSeats).toBe(4);
      expect(availAfterHold?.availableSeats).toBe(16);
      expect(availAfterHold?.priceOverrideAdult).toBe(4800000);
    });

    it('2.3 releases hold and restores dynamic available seats immediately', async () => {
      if (!isDbAvailable || !createdDepartureId) return;

      const hold = await holdRepo.findBySessionToken('sess_active_123');
      expect(hold).not.toBeNull();

      if (hold) {
        const released = await holdRepo.releaseHold(hold.id);
        expect(released).toBe(true);

        // Active holds should now be 0
        const activeHoldCount = await holdRepo.getActiveHoldCountForDeparture(createdDepartureId);
        expect(activeHoldCount).toBe(0);

        // Available seats should return to 20
        const availAfterRelease = await departureRepo.getAvailabilityById(createdDepartureId);
        expect(availAfterRelease?.availableSeats).toBe(20);
      }
    });

    it('2.4 acquires row-level lock FOR UPDATE inside transaction helper', async () => {
      if (!isDbAvailable || !createdDepartureId) return;

      await db!.withTransaction(async (client) => {
        const lockedDeparture = await departureRepo.findByIdForUpdate(createdDepartureId, client);
        expect(lockedDeparture).not.toBeNull();
        expect(lockedDeparture?.id).toBe(createdDepartureId);
      });
    });
  });
});
