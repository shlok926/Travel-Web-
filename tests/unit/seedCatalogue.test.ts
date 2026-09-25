import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  seedCatalogue,
  validateSeedDatasetIntegrity,
  SEED_THEMES,
  SEED_DESTINATIONS,
  SEED_PACKAGES,
} from '../../backend/src/infrastructure/database/seeds/seedCatalogue.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { CataloguePublicationService } from '../../backend/src/modules/catalogue/services/cataloguePublication.service.js';

describe('Phase 3 Step 7 — Catalogue Seed Dataset & Provisioning Engine', () => {
  describe('1. Dataset Invariant & Referential Integrity', () => {
    it('validateSeedDatasetIntegrity executes cleanly without throwing', () => {
      expect(() => validateSeedDatasetIntegrity()).not.toThrow();
    });

    it('all themes have unique IDs and slugs', () => {
      const ids = new Set<string>();
      const slugs = new Set<string>();

      for (const theme of SEED_THEMES) {
        expect(ids.has(theme.id)).toBe(false);
        expect(slugs.has(theme.slug)).toBe(false);
        ids.add(theme.id);
        slugs.add(theme.slug);

        expect(theme.title.length).toBeGreaterThanOrEqual(3);
        expect(theme.slug.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('all destinations have unique IDs and slugs, with valid location information', () => {
      const ids = new Set<string>();
      const slugs = new Set<string>();

      for (const dest of SEED_DESTINATIONS) {
        expect(ids.has(dest.id)).toBe(false);
        expect(slugs.has(dest.slug)).toBe(false);
        ids.add(dest.id);
        slugs.add(dest.slug);

        expect(dest.cityName.trim().length).toBeGreaterThan(0);
        expect(dest.country.trim().length).toBeGreaterThan(0);
        expect(dest.description.trim().length).toBeGreaterThan(10);
        expect(dest.thumbnailUrl.startsWith('http')).toBe(true);
        expect(dest.isPublished).toBe(true);
      }
    });

    it('all tour packages have unique IDs, unique slugs, and valid referential keys', () => {
      const destIds = new Set(SEED_DESTINATIONS.map((d) => d.id));
      const themeIds = new Set(SEED_THEMES.map((t) => t.id));
      const pkgIds = new Set<string>();
      const pkgSlugs = new Set<string>();

      for (const pkg of SEED_PACKAGES) {
        expect(pkgIds.has(pkg.id)).toBe(false);
        expect(pkgSlugs.has(pkg.slug)).toBe(false);
        pkgIds.add(pkg.id);
        pkgSlugs.add(pkg.slug);

        // Referential checks
        expect(destIds.has(pkg.destinationId)).toBe(true);
        if (pkg.themeId) {
          expect(themeIds.has(pkg.themeId)).toBe(true);
        }

        // Money checks (Integer minor units)
        expect(Number.isInteger(pkg.baseAdultPrice)).toBe(true);
        expect(pkg.baseAdultPrice).toBeGreaterThan(0);
        expect(Number.isInteger(pkg.baseChildPrice)).toBe(true);
        expect(pkg.baseChildPrice).toBeGreaterThanOrEqual(0);
        expect(['INR', 'USD']).toContain(pkg.currency);

        // Duration checks
        expect(pkg.durationDays).toBeGreaterThan(0);
        expect(pkg.durationNights).toBeGreaterThanOrEqual(0);

        // Images & Inclusions
        expect(pkg.heroImageUrl.startsWith('http')).toBe(true);
        expect(pkg.inclusions.length).toBeGreaterThan(0);
        expect(pkg.exclusions.length).toBeGreaterThan(0);
      }
    });

    it('all package itineraries have contiguous day numbers starting from 1 with no duplicates', () => {
      const allItineraryIds = new Set<string>();

      for (const pkg of SEED_PACKAGES) {
        expect(pkg.itineraries.length).toBeGreaterThanOrEqual(1);

        const dayNumbers: number[] = [];
        for (const it of pkg.itineraries) {
          expect(allItineraryIds.has(it.id)).toBe(false);
          allItineraryIds.add(it.id);

          dayNumbers.push(it.dayNumber);
          expect(it.title.trim().length).toBeGreaterThan(0);
          expect(it.activityDescription.trim().length).toBeGreaterThan(10);
        }

        // Check sequential: 1, 2, 3, ...
        for (let i = 0; i < dayNumbers.length; i++) {
          expect(dayNumbers[i]).toBe(i + 1);
        }
      }
    });

    it('every published seed package satisfies the BR-PKG-001 Publication Invariant', () => {
      const destMap = new Map(SEED_DESTINATIONS.map((d) => [d.id, d]));

      for (const pkg of SEED_PACKAGES) {
        if (!pkg.isPublished) continue;

        const dest = destMap.get(pkg.destinationId)!;
        const result = CataloguePublicationService.validatePackagePublication(
          {
            ...pkg,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            ...dest,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          pkg.itineraries.map((it) => ({
            ...it,
            packageId: pkg.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );

        expect(result.isEligible).toBe(true);
        expect(result.issues).toHaveLength(0);
      }
    });
  });

  describe('2. Seed Runner & Database Interaction', () => {
    let mockClient: { query: ReturnType<typeof vi.fn> };
    let mockDb: DatabaseService;

    beforeEach(() => {
      mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [{ is_insert: true }],
          rowCount: 1,
        }),
      };

      mockDb = {
        withTransaction: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockClient);
        }),
      } as unknown as DatabaseService;
    });

    it('executes atomic transaction and counts inserted records on initial run', async () => {
      const result = await seedCatalogue(mockDb, { isProduction: false });

      expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
      expect(result.themes.inserted).toBe(SEED_THEMES.length);
      expect(result.destinations.inserted).toBe(SEED_DESTINATIONS.length);
      expect(result.packages.inserted).toBe(SEED_PACKAGES.length);

      const totalItineraries = SEED_PACKAGES.reduce((acc, p) => acc + p.itineraries.length, 0);
      expect(result.itineraries.inserted).toBe(totalItineraries);
    });

    it('reports updated records when rows already exist (idempotency check)', async () => {
      mockClient.query = vi.fn().mockResolvedValue({
        rows: [{ is_insert: false }],
        rowCount: 1,
      });

      const result = await seedCatalogue(mockDb, { isProduction: false });

      expect(result.themes.updated).toBe(SEED_THEMES.length);
      expect(result.destinations.updated).toBe(SEED_DESTINATIONS.length);
      expect(result.packages.updated).toBe(SEED_PACKAGES.length);
    });

    it('blocks execution in production environment without explicit allowProductionSeed confirmation', async () => {
      await expect(
        seedCatalogue(mockDb, { isProduction: true, allowProductionSeed: false }),
      ).rejects.toThrow('Production Security Guard');
    });

    it('allows execution in production when allowProductionSeed is explicitly true', async () => {
      await expect(
        seedCatalogue(mockDb, { isProduction: true, allowProductionSeed: true }),
      ).resolves.toBeDefined();
    });
  });
});
