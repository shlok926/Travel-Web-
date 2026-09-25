import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  DestinationRepository,
  DestinationRow,
  ThemeRepository,
  ThemeRow,
  TourPackageRepository,
  TourPackageRow,
  ItineraryRepository,
  ItineraryDayRow,
} from '../../backend/src/modules/catalogue/repositories/index.js';

describe('Phase 3 Step 3 — Catalogue Repositories (PostgreSQL Data Access Layer)', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockClientQuery: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseService;
  let mockClient: pg.PoolClient;

  let destinationRepo: DestinationRepository;
  let themeRepo: ThemeRepository;
  let tourPackageRepo: TourPackageRepository;
  let itineraryRepo: ItineraryRepository;

  const sampleDestinationRow: DestinationRow = {
    id: 'd1111111-1111-1111-1111-111111111111',
    slug: 'goa-india',
    city_name: 'Goa',
    country: 'India',
    description: 'Tropical beaches and vibrant culture.',
    thumbnail_url: 'https://images.unsplash.com/goa-thumb.jpg',
    hero_image_url: 'https://images.unsplash.com/goa-hero.jpg',
    is_featured: true,
    is_published: true,
    created_at: '2026-09-25T10:00:00.000Z',
    updated_at: '2026-09-25T10:00:00.000Z',
  };

  const sampleThemeRow: ThemeRow = {
    id: 't2222222-2222-2222-2222-222222222222',
    slug: 'beach-getaway',
    title: 'Beach Getaways',
    description: 'Sun, sand, and relaxing sea views.',
    icon_url: 'https://images.unsplash.com/icons/beach.svg',
    created_at: '2026-09-25T10:00:00.000Z',
  };

  const samplePackageRow: TourPackageRow = {
    id: 'p3333333-3333-3333-3333-333333333333',
    destination_id: 'd1111111-1111-1111-1111-111111111111',
    theme_id: 't2222222-2222-2222-2222-222222222222',
    slug: 'scenic-goa-holiday-4d3n',
    title: 'Scenic Goa Holiday',
    short_description: '4 days of sun and beaches in Goa.',
    description: 'Full description of Goa tour package.',
    duration_days: 4,
    duration_nights: 3,
    origin_city: 'Mumbai',
    destination_city: 'Goa',
    base_adult_price: '4500000', // 45,000 INR represented as BIGINT string in pg
    base_child_price: '2500000',
    currency: 'INR',
    hero_image_url: 'https://images.unsplash.com/goa-package-hero.jpg',
    gallery_urls: ['https://images.unsplash.com/goa-g1.jpg'],
    inclusions: ['Airport transfer', 'Daily breakfast'],
    exclusions: ['Airfare', 'Personal expenses'],
    accommodation_tiers: ['BUDGET', 'STANDARD', 'LUXURY'],
    meal_plans: ['BREAKFAST', 'HALF_BOARD'],
    is_published: true,
    is_featured: true,
    created_at: '2026-09-25T10:00:00.000Z',
    updated_at: '2026-09-25T10:00:00.000Z',
  };

  const sampleItineraryRow: ItineraryDayRow = {
    id: 'i4444444-4444-4444-4444-444444444444',
    package_id: 'p3333333-3333-3333-3333-333333333333',
    day_number: 1,
    title: 'Arrival and Beach Leisure',
    activity_description: 'Arrive at Goa Airport, check in and relax at Calangute Beach.',
    meals_included: ['DINNER'],
    accommodation_notes: 'Beachside 4-star resort',
    created_at: '2026-09-25T10:00:00.000Z',
    updated_at: '2026-09-25T10:00:00.000Z',
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

    destinationRepo = new DestinationRepository(mockDb);
    themeRepo = new ThemeRepository(mockDb);
    tourPackageRepo = new TourPackageRepository(mockDb);
    itineraryRepo = new ItineraryRepository(mockDb);
  });

  // ============================================================================
  // 1. DestinationRepository
  // ============================================================================
  describe('DestinationRepository', () => {
    it('1. findById returns mapped DestinationEntity with explicit projections', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDestinationRow], rowCount: 1 });

      const destination = await destinationRepo.findById(sampleDestinationRow.id);

      expect(destination).not.toBeNull();
      expect(destination?.id).toBe(sampleDestinationRow.id);
      expect(destination?.slug).toBe('goa-india');
      expect(destination?.cityName).toBe('Goa');
      expect(destination?.country).toBe('India');
      expect(destination?.isFeatured).toBe(true);
      expect(destination?.isPublished).toBe(true);
      expect(destination?.createdAt).toEqual(new Date(sampleDestinationRow.created_at));

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('SELECT');
      expect(sql).not.toContain('SELECT *');
      expect(sql).toContain('city_name');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1;'), [
        sampleDestinationRow.id,
      ]);
    });

    it('2. findBySlug returns null when destination slug does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const destination = await destinationRepo.findBySlug('non-existent-slug');
      expect(destination).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE slug = $1;'), [
        'non-existent-slug',
      ]);
    });

    it('3. create persists new destination record with parameterized values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDestinationRow], rowCount: 1 });

      const created = await destinationRepo.create({
        slug: 'goa-india',
        cityName: 'Goa',
        country: 'India',
        description: 'Tropical beaches and vibrant culture.',
        thumbnailUrl: 'https://images.unsplash.com/goa-thumb.jpg',
        heroImageUrl: 'https://images.unsplash.com/goa-hero.jpg',
        isFeatured: true,
        isPublished: true,
      });

      expect(created.id).toBe(sampleDestinationRow.id);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO destinations'), [
        'goa-india',
        'Goa',
        'India',
        'Tropical beaches and vibrant culture.',
        'https://images.unsplash.com/goa-thumb.jpg',
        'https://images.unsplash.com/goa-hero.jpg',
        true,
        true,
      ]);
    });

    it('4. update modifies existing destination fields and updates timestamp', async () => {
      const updatedRow = { ...sampleDestinationRow, city_name: 'South Goa', is_featured: false };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const updated = await destinationRepo.update(sampleDestinationRow.id, {
        cityName: 'South Goa',
        isFeatured: false,
      });

      expect(updated?.cityName).toBe('South Goa');
      expect(updated?.isFeatured).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE destinations\n      SET city_name = $1, is_featured = $2, updated_at = NOW()',
        ),
        ['South Goa', false, sampleDestinationRow.id],
      );
    });

    it('5. delete removes destination and returns true if deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: sampleDestinationRow.id }], rowCount: 1 });

      const deleted = await destinationRepo.delete(sampleDestinationRow.id);
      expect(deleted).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM destinations\n      WHERE id = $1'),
        [sampleDestinationRow.id],
      );
    });

    it('6. list applies pagination and filters for published & featured', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 }) // count query
        .mockResolvedValueOnce({ rows: [sampleDestinationRow], rowCount: 1 }); // list query

      const result = await destinationRepo.list({
        page: 2,
        limit: 5,
        isPublished: true,
        isFeatured: true,
      });

      expect(result.total).toBe(10);
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.slug).toBe('goa-india');

      // Check pagination calculation: offset = (2 - 1) * 5 = 5
      expect(mockQuery.mock.calls[1]?.[1]).toEqual([true, true, 5, 5]);
    });

    it('7. listPublished returns published destinations ordered by featured status and city name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleDestinationRow], rowCount: 1 });

      const list = await destinationRepo.listPublished(50);
      expect(list.length).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_published = TRUE'),
        [50],
      );
    });
  });

  // ============================================================================
  // 2. ThemeRepository
  // ============================================================================
  describe('ThemeRepository', () => {
    it('8. findById returns mapped ThemeEntity with explicit projections', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleThemeRow], rowCount: 1 });

      const theme = await themeRepo.findById(sampleThemeRow.id);

      expect(theme).not.toBeNull();
      expect(theme?.id).toBe(sampleThemeRow.id);
      expect(theme?.slug).toBe('beach-getaway');
      expect(theme?.title).toBe('Beach Getaways');
      expect(theme?.description).toBe(sampleThemeRow.description);
      expect(theme?.iconUrl).toBe(sampleThemeRow.icon_url);

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).not.toContain('SELECT *');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1;'), [
        sampleThemeRow.id,
      ]);
    });

    it('9. findBySlug returns mapped ThemeEntity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleThemeRow], rowCount: 1 });

      const theme = await themeRepo.findBySlug('beach-getaway');
      expect(theme?.slug).toBe('beach-getaway');
    });

    it('10. create persists new theme record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleThemeRow], rowCount: 1 });

      const created = await themeRepo.create({
        slug: 'beach-getaway',
        title: 'Beach Getaways',
        description: 'Sun and sand.',
      });

      expect(created.id).toBe(sampleThemeRow.id);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO themes'), [
        'beach-getaway',
        'Beach Getaways',
        'Sun and sand.',
        null,
      ]);
    });

    it('11. update modifies theme fields', async () => {
      const updatedRow = { ...sampleThemeRow, title: 'Luxury Beach Getaways' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const updated = await themeRepo.update(sampleThemeRow.id, {
        title: 'Luxury Beach Getaways',
      });

      expect(updated?.title).toBe('Luxury Beach Getaways');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE themes\n      SET title = $1'),
        ['Luxury Beach Getaways', sampleThemeRow.id],
      );
    });

    it('12. delete removes theme by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: sampleThemeRow.id }], rowCount: 1 });

      const deleted = await themeRepo.delete(sampleThemeRow.id);
      expect(deleted).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM themes\n      WHERE id = $1'),
        [sampleThemeRow.id],
      );
    });

    it('13. list returns all themes ordered by title ascending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleThemeRow], rowCount: 1 });

      const list = await themeRepo.list();
      expect(list.length).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY title ASC;'));
    });
  });

  // ============================================================================
  // 3. TourPackageRepository
  // ============================================================================
  describe('TourPackageRepository', () => {
    it('14. findById returns mapped TourPackageEntity with BIGINT price and JSONB fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });

      const pkg = await tourPackageRepo.findById(samplePackageRow.id);

      expect(pkg).not.toBeNull();
      expect(pkg?.id).toBe(samplePackageRow.id);
      expect(pkg?.destinationId).toBe(samplePackageRow.destination_id);
      expect(pkg?.themeId).toBe(samplePackageRow.theme_id);
      expect(pkg?.slug).toBe('scenic-goa-holiday-4d3n');
      expect(pkg?.baseAdultPrice).toBe(4500000); // Converted safely to number
      expect(pkg?.baseChildPrice).toBe(2500000);
      expect(pkg?.currency).toBe('INR');
      expect(pkg?.galleryUrls).toEqual(['https://images.unsplash.com/goa-g1.jpg']);
      expect(pkg?.inclusions).toEqual(['Airport transfer', 'Daily breakfast']);
      expect(pkg?.accommodationTiers).toEqual(['BUDGET', 'STANDARD', 'LUXURY']);
      expect(pkg?.mealPlans).toEqual(['BREAKFAST', 'HALF_BOARD']);

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).not.toContain('SELECT *');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1;'), [
        samplePackageRow.id,
      ]);
    });

    it('15. findBySlug returns mapped package entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });

      const pkg = await tourPackageRepo.findBySlug('scenic-goa-holiday-4d3n');
      expect(pkg?.slug).toBe('scenic-goa-holiday-4d3n');
    });

    it('16. create persists tour package and serializes JSONB structures', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });

      const created = await tourPackageRepo.create({
        destinationId: samplePackageRow.destination_id,
        themeId: samplePackageRow.theme_id,
        slug: 'scenic-goa-holiday-4d3n',
        title: 'Scenic Goa Holiday',
        shortDescription: '4 days in Goa.',
        description: 'Detailed description.',
        durationDays: 4,
        durationNights: 3,
        originCity: 'Mumbai',
        destinationCity: 'Goa',
        baseAdultPrice: 4500000,
        baseChildPrice: 2500000,
        currency: 'INR',
        heroImageUrl: 'https://images.unsplash.com/hero.jpg',
        galleryUrls: ['https://images.unsplash.com/g1.jpg'],
        inclusions: ['Breakfast'],
        exclusions: ['Flight'],
        accommodationTiers: ['STANDARD', 'LUXURY'],
        mealPlans: ['HALF_BOARD'],
        isPublished: true,
        isFeatured: true,
      });

      expect(created.id).toBe(samplePackageRow.id);
      const params = mockQuery.mock.calls[0]?.[1] as unknown[];
      expect(params[0]).toBe(samplePackageRow.destination_id);
      expect(params[1]).toBe(samplePackageRow.theme_id);
      expect(params[10]).toBe(4500000); // baseAdultPrice
      expect(params[14]).toBe(JSON.stringify(['https://images.unsplash.com/g1.jpg'])); // gallery_urls
      expect(params[17]).toBe(JSON.stringify(['STANDARD', 'LUXURY'])); // accommodation_tiers
    });

    it('17. update modifies package details with RETURNING projection', async () => {
      const updatedRow = {
        ...samplePackageRow,
        title: 'Super Scenic Goa Holiday',
        base_adult_price: '5000000',
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const updated = await tourPackageRepo.update(samplePackageRow.id, {
        title: 'Super Scenic Goa Holiday',
        baseAdultPrice: 5000000,
      });

      expect(updated?.title).toBe('Super Scenic Goa Holiday');
      expect(updated?.baseAdultPrice).toBe(5000000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE tour_packages\n      SET title = $1, base_adult_price = $2, updated_at = NOW()',
        ),
        ['Super Scenic Goa Holiday', 5000000, samplePackageRow.id],
      );
    });

    it('18. delete removes package and returns true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: samplePackageRow.id }], rowCount: 1 });

      const deleted = await tourPackageRepo.delete(samplePackageRow.id);
      expect(deleted).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tour_packages\n      WHERE id = $1'),
        [samplePackageRow.id],
      );
    });

    it('19. list supports destinationSlug and themeSlug filtering with JOINs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });

      const result = await tourPackageRepo.list({
        destinationSlug: 'goa-india',
        themeSlug: 'beach-getaway',
        isPublished: true,
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(3);
      expect(result.items.length).toBe(1);

      const countSql = mockQuery.mock.calls[0]?.[0] as string;
      expect(countSql).toContain('JOIN destinations d ON tp.destination_id = d.id');
      expect(countSql).toContain('JOIN themes t ON tp.theme_id = t.id');
      expect(countSql).toContain('d.slug = $1');
      expect(countSql).toContain('t.slug = $2');
      expect(countSql).toContain('tp.is_published = $3');
    });

    it('20. listByDestinationId and listByThemeId query explicit projections', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });
      const destList = await tourPackageRepo.listByDestinationId(samplePackageRow.destination_id);
      expect(destList.length).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE destination_id = $1'), [
        samplePackageRow.destination_id,
      ]);

      mockQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });
      const themeList = await tourPackageRepo.listByThemeId(samplePackageRow.theme_id as string);
      expect(themeList.length).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE theme_id = $1'), [
        samplePackageRow.theme_id,
      ]);
    });
  });

  // ============================================================================
  // 4. ItineraryRepository
  // ============================================================================
  describe('ItineraryRepository', () => {
    it('21. findById returns mapped ItineraryDayEntity with JSONB meals', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleItineraryRow], rowCount: 1 });

      const day = await itineraryRepo.findById(sampleItineraryRow.id);

      expect(day).not.toBeNull();
      expect(day?.id).toBe(sampleItineraryRow.id);
      expect(day?.packageId).toBe(sampleItineraryRow.package_id);
      expect(day?.dayNumber).toBe(1);
      expect(day?.mealsIncluded).toEqual(['DINNER']);
      expect(day?.accommodationNotes).toBe('Beachside 4-star resort');

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).not.toContain('SELECT *');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1;'), [
        sampleItineraryRow.id,
      ]);
    });

    it('22. listByPackageId returns itinerary days ordered by day_number ascending', async () => {
      const day2Row = {
        ...sampleItineraryRow,
        id: 'i5555555-5555-5555-5555-555555555555',
        day_number: 2,
        title: 'Day 2',
      };
      mockQuery.mockResolvedValueOnce({ rows: [sampleItineraryRow, day2Row], rowCount: 2 });

      const list = await itineraryRepo.listByPackageId(sampleItineraryRow.package_id);

      expect(list.length).toBe(2);
      expect(list[0]?.dayNumber).toBe(1);
      expect(list[1]?.dayNumber).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE package_id = $1\n      ORDER BY day_number ASC;'),
        [sampleItineraryRow.package_id],
      );
    });

    it('23. create persists itinerary day and maps returned entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleItineraryRow], rowCount: 1 });

      const created = await itineraryRepo.create({
        packageId: sampleItineraryRow.package_id,
        dayNumber: 1,
        title: 'Arrival and Beach Leisure',
        activityDescription: 'Arrive at airport.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Beachside resort',
      });

      expect(created.id).toBe(sampleItineraryRow.id);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO itinerary_days'),
        [
          sampleItineraryRow.package_id,
          1,
          'Arrival and Beach Leisure',
          'Arrive at airport.',
          JSON.stringify(['DINNER']),
          'Beachside resort',
        ],
      );
    });

    it('24. createMany performs sequential inserts in transaction client', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [sampleItineraryRow], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...sampleItineraryRow, day_number: 2, title: 'Day 2' }],
          rowCount: 1,
        });

      const results = await itineraryRepo.createMany(
        [
          {
            packageId: sampleItineraryRow.package_id,
            dayNumber: 1,
            title: 'Day 1',
            activityDescription: 'Act 1',
          },
          {
            packageId: sampleItineraryRow.package_id,
            dayNumber: 2,
            title: 'Day 2',
            activityDescription: 'Act 2',
          },
        ],
        mockClient,
      );

      expect(results.length).toBe(2);
      expect(mockClientQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('25. update modifies itinerary day details and timestamp', async () => {
      const updatedRow = { ...sampleItineraryRow, title: 'Updated Beach Leisure' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const updated = await itineraryRepo.update(sampleItineraryRow.id, {
        title: 'Updated Beach Leisure',
      });

      expect(updated?.title).toBe('Updated Beach Leisure');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE itinerary_days\n      SET title = $1, updated_at = NOW()'),
        ['Updated Beach Leisure', sampleItineraryRow.id],
      );
    });

    it('26. deleteByPackageId deletes all days for atomic itinerary replacement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 4 });

      const count = await itineraryRepo.deleteByPackageId(sampleItineraryRow.package_id);
      expect(count).toBe(4);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM itinerary_days\n      WHERE package_id = $1;'),
        [sampleItineraryRow.package_id],
      );
    });
  });

  // ============================================================================
  // 5. Transaction Participation & SQL Injection Security Defense
  // ============================================================================
  describe('Transaction Participation & SQL Injection Security Defense', () => {
    it('27. repositories execute on supplied pg.PoolClient transaction context', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [sampleDestinationRow], rowCount: 1 });

      const dest = await destinationRepo.findById(sampleDestinationRow.id, mockClient);
      expect(dest).not.toBeNull();
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();

      mockClientQuery.mockResolvedValueOnce({ rows: [samplePackageRow], rowCount: 1 });
      const pkg = await tourPackageRepo.findById(samplePackageRow.id, mockClient);
      expect(pkg).not.toBeNull();
      expect(mockClientQuery).toHaveBeenCalledTimes(2);
    });

    it('28. malicious SQL injection payloads in slug lookups are strictly parameterized', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const maliciousSlug = "goa' OR '1'='1' --";

      await destinationRepo.findBySlug(maliciousSlug);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE slug = $1;'), [
        maliciousSlug,
      ]);
    });

    it('29. malicious SQL injection payloads in package update / filters are strictly parameterized', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const maliciousFilter = "'); DROP TABLE tour_packages; --";

      await tourPackageRepo.findBySlug(maliciousFilter);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE slug = $1;'), [
        maliciousFilter,
      ]);
    });
  });
});
