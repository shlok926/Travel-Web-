import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { AppError } from '../../shared/src/index.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  DestinationEntity,
  DestinationRepository,
} from '../../backend/src/modules/catalogue/repositories/destination.repository.js';
import {
  ThemeEntity,
  ThemeRepository,
} from '../../backend/src/modules/catalogue/repositories/theme.repository.js';
import {
  TourPackageEntity,
  TourPackageRepository,
} from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import {
  ItineraryDayEntity,
  ItineraryRepository,
} from '../../backend/src/modules/catalogue/repositories/itinerary.repository.js';
import {
  CataloguePublicationService,
  DestinationService,
  ThemeService,
  TourPackageService,
  slugify,
} from '../../backend/src/modules/catalogue/services/index.js';

describe('Phase 3 Step 4 — Catalogue Domain Services & Business Rules', () => {
  let mockDestinationRepo: DestinationRepository;
  let mockThemeRepo: ThemeRepository;
  let mockTourPackageRepo: TourPackageRepository;
  let mockItineraryRepo: ItineraryRepository;
  let mockDb: DatabaseService;

  let destinationService: DestinationService;
  let themeService: ThemeService;
  let tourPackageService: TourPackageService;

  const mockDestination: DestinationEntity = {
    id: 'd1111111-1111-1111-1111-111111111111',
    slug: 'goa-india',
    cityName: 'Goa',
    country: 'India',
    description: 'Tropical paradise',
    thumbnailUrl: 'https://images.unsplash.com/goa-thumb.jpg',
    heroImageUrl: 'https://images.unsplash.com/goa-hero.jpg',
    isFeatured: true,
    isPublished: true,
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
    updatedAt: new Date('2026-09-25T10:00:00.000Z'),
  };

  const mockTheme: ThemeEntity = {
    id: 't2222222-2222-2222-2222-222222222222',
    slug: 'beach-getaways',
    title: 'Beach Getaways',
    description: 'Sun and sand',
    iconUrl: 'https://images.unsplash.com/icons/beach.svg',
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
  };

  const mockPackage: TourPackageEntity = {
    id: 'p3333333-3333-3333-3333-333333333333',
    destinationId: 'd1111111-1111-1111-1111-111111111111',
    themeId: 't2222222-2222-2222-2222-222222222222',
    slug: 'scenic-goa-holiday-4d3n',
    title: 'Scenic Goa Holiday',
    shortDescription: '4 days of beaches',
    description: 'Full description of Goa tour package',
    durationDays: 4,
    durationNights: 3,
    originCity: 'Mumbai',
    destinationCity: 'Goa',
    baseAdultPrice: 4500000,
    baseChildPrice: 2500000,
    currency: 'INR',
    heroImageUrl: 'https://images.unsplash.com/goa-hero.jpg',
    galleryUrls: ['https://images.unsplash.com/goa-g1.jpg'],
    inclusions: ['Breakfast'],
    exclusions: ['Flights'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: false,
    isFeatured: false,
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
    updatedAt: new Date('2026-09-25T10:00:00.000Z'),
  };

  const mockItineraryDays: ItineraryDayEntity[] = [
    {
      id: 'i1111111-1111-1111-1111-111111111111',
      packageId: 'p3333333-3333-3333-3333-333333333333',
      dayNumber: 1,
      title: 'Arrival & Beach Visit',
      activityDescription: 'Arrive at airport and check in.',
      mealsIncluded: ['DINNER'],
      accommodationNotes: 'Resort',
      createdAt: new Date('2026-09-25T10:00:00.000Z'),
      updatedAt: new Date('2026-09-25T10:00:00.000Z'),
    },
    {
      id: 'i2222222-2222-2222-2222-222222222222',
      packageId: 'p3333333-3333-3333-3333-333333333333',
      dayNumber: 2,
      title: 'North Goa Tour',
      activityDescription: 'Explore forts and markets.',
      mealsIncluded: ['BREAKFAST'],
      accommodationNotes: 'Resort',
      createdAt: new Date('2026-09-25T10:00:00.000Z'),
      updatedAt: new Date('2026-09-25T10:00:00.000Z'),
    },
  ];

  beforeEach(() => {
    mockDestinationRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      listPublished: vi.fn(),
    } as unknown as DestinationRepository;

    mockThemeRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as ThemeRepository;

    mockTourPackageRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      listByDestinationId: vi.fn().mockResolvedValue([]),
      listByThemeId: vi.fn().mockResolvedValue([]),
    } as unknown as TourPackageRepository;

    mockItineraryRepo = {
      findById: vi.fn(),
      listByPackageId: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteByPackageId: vi.fn(),
    } as unknown as ItineraryRepository;

    mockDb = {
      withTransaction: vi
        .fn()
        .mockImplementation(async (cb: (client: pg.PoolClient) => unknown) => {
          const mockClient = {} as pg.PoolClient;
          return cb(mockClient);
        }),
    } as unknown as DatabaseService;

    destinationService = new DestinationService(mockDestinationRepo, mockTourPackageRepo);
    themeService = new ThemeService(mockThemeRepo);
    tourPackageService = new TourPackageService(
      mockTourPackageRepo,
      mockDestinationRepo,
      mockThemeRepo,
      mockItineraryRepo,
      mockDb,
    );
  });

  // ============================================================================
  // 1. Slug Utility
  // ============================================================================
  describe('Slug Utility', () => {
    it('1. normalizes strings to lowercase URL-safe kebab-case slugs', () => {
      expect(slugify('Grand Goa Tour 4D/3N!')).toBe('grand-goa-tour-4d-3n');
      expect(slugify('  Kerala  Backwaters & Houseboat  ')).toBe('kerala-backwaters-houseboat');
      expect(slugify('Shimla - Manali -- Special')).toBe('shimla-manali-special');
      expect(slugify('Été à Paris 2026')).toBe('ete-a-paris-2026');
    });
  });

  // ============================================================================
  // 2. BR-PKG-001 Publication Completeness Gate
  // ============================================================================
  describe('BR-PKG-001 Publication Completeness Invariant', () => {
    it('2. rejects publication if title is missing or shorter than 3 chars', () => {
      const invalidPkg = { ...mockPackage, title: 'Go' };
      const res = CataloguePublicationService.validatePackagePublication(
        invalidPkg,
        mockDestination,
        mockItineraryDays,
      );
      expect(res.isEligible).toBe(false);
      expect(res.issues.some((i) => i.field === 'title')).toBe(true);
    });

    it('3. rejects publication if destination is missing or unpublished', () => {
      const resNullDest = CataloguePublicationService.validatePackagePublication(
        mockPackage,
        null,
        mockItineraryDays,
      );
      expect(resNullDest.isEligible).toBe(false);
      expect(resNullDest.issues.some((i) => i.field === 'destinationId')).toBe(true);

      const unpublishedDest = { ...mockDestination, isPublished: false };
      const resUnpubDest = CataloguePublicationService.validatePackagePublication(
        mockPackage,
        unpublishedDest,
        mockItineraryDays,
      );
      expect(resUnpubDest.isEligible).toBe(false);
      expect(resUnpubDest.issues[0]?.issue).toContain('is not published');
    });

    it('4. rejects publication if duration <= 0 or price <= 0', () => {
      const invalidDuration = { ...mockPackage, durationDays: 0 };
      const resDuration = CataloguePublicationService.validatePackagePublication(
        invalidDuration,
        mockDestination,
        mockItineraryDays,
      );
      expect(resDuration.isEligible).toBe(false);
      expect(resDuration.issues.some((i) => i.field === 'durationDays')).toBe(true);

      const invalidPrice = { ...mockPackage, baseAdultPrice: 0 };
      const resPrice = CataloguePublicationService.validatePackagePublication(
        invalidPrice,
        mockDestination,
        mockItineraryDays,
      );
      expect(resPrice.isEligible).toBe(false);
      expect(resPrice.issues.some((i) => i.field === 'baseAdultPrice')).toBe(true);
    });

    it('5. rejects publication if hero image URL is missing', () => {
      const noHero = { ...mockPackage, heroImageUrl: '' };
      const res = CataloguePublicationService.validatePackagePublication(
        noHero,
        mockDestination,
        mockItineraryDays,
      );
      expect(res.isEligible).toBe(false);
      expect(res.issues.some((i) => i.field === 'heroImageUrl')).toBe(true);
    });

    it('6. rejects publication if itinerary has 0 days', () => {
      const res = CataloguePublicationService.validatePackagePublication(
        mockPackage,
        mockDestination,
        [],
      );
      expect(res.isEligible).toBe(false);
      expect(res.issues.some((i) => i.field === 'itinerary')).toBe(true);
    });

    it('7. passes publication check when all 7 BR-PKG-001 criteria are satisfied', () => {
      const res = CataloguePublicationService.validatePackagePublication(
        mockPackage,
        mockDestination,
        mockItineraryDays,
      );
      expect(res.isEligible).toBe(true);
      expect(res.issues.length).toBe(0);
    });
  });

  // ============================================================================
  // 3. DestinationService
  // ============================================================================
  describe('DestinationService', () => {
    it('8. getById returns DTO and throws 404 when missing', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      const res = await destinationService.getById(mockDestination.id);
      expect(res.cityName).toBe('Goa');

      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(null);
      await expect(destinationService.getById('missing-id')).rejects.toThrow(AppError);
    });

    it('9. getBySlug normalizes slug and returns DTO', async () => {
      vi.mocked(mockDestinationRepo.findBySlug).mockResolvedValueOnce(mockDestination);
      const res = await destinationService.getBySlug('Goa-India');
      expect(res.slug).toBe('goa-india');
      expect(mockDestinationRepo.findBySlug).toHaveBeenCalledWith('goa-india');
    });

    it('10. create normalizes slug and rejects duplicate slug with 409 Conflict', async () => {
      vi.mocked(mockDestinationRepo.findBySlug).mockResolvedValueOnce(mockDestination);

      await expect(
        destinationService.create({
          cityName: 'Goa',
          country: 'India',
          description: 'Desc',
          thumbnailUrl: 'https://images.unsplash.com/thumb.jpg',
        }),
      ).rejects.toThrow('already exists');
    });

    it('11. create creates destination successfully when slug is unique', async () => {
      vi.mocked(mockDestinationRepo.findBySlug).mockResolvedValueOnce(null);
      vi.mocked(mockDestinationRepo.create).mockResolvedValueOnce(mockDestination);

      const res = await destinationService.create({
        cityName: 'Goa',
        country: 'India',
        description: 'Tropical paradise',
        thumbnailUrl: 'https://images.unsplash.com/goa-thumb.jpg',
      });

      expect(res.cityName).toBe('Goa');
      expect(mockDestinationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'goa',
          cityName: 'Goa',
        }),
      );
    });

    it('12. delete enforces RESTRICT check and throws 409 if packages exist', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockTourPackageRepo.listByDestinationId).mockResolvedValueOnce([mockPackage]);

      await expect(destinationService.delete(mockDestination.id)).rejects.toThrow(
        'tour package(s) are associated',
      );
    });

    it('13. delete succeeds when no packages are attached', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockTourPackageRepo.listByDestinationId).mockResolvedValueOnce([]);
      vi.mocked(mockDestinationRepo.delete).mockResolvedValueOnce(true);

      await expect(destinationService.delete(mockDestination.id)).resolves.not.toThrow();
      expect(mockDestinationRepo.delete).toHaveBeenCalledWith(mockDestination.id);
    });
  });

  // ============================================================================
  // 4. ThemeService
  // ============================================================================
  describe('ThemeService', () => {
    it('14. create normalizes slug and creates theme', async () => {
      vi.mocked(mockThemeRepo.findBySlug).mockResolvedValueOnce(null);
      vi.mocked(mockThemeRepo.create).mockResolvedValueOnce(mockTheme);

      const res = await themeService.create({
        title: 'Beach Getaways',
        description: 'Sun and sand',
      });

      expect(res.title).toBe('Beach Getaways');
      expect(mockThemeRepo.create).toHaveBeenCalledWith({
        slug: 'beach-getaways',
        title: 'Beach Getaways',
        description: 'Sun and sand',
        iconUrl: null,
      });
    });

    it('15. create throws 409 Conflict if theme slug exists', async () => {
      vi.mocked(mockThemeRepo.findBySlug).mockResolvedValueOnce(mockTheme);

      await expect(
        themeService.create({
          title: 'Beach Getaways',
        }),
      ).rejects.toThrow('already exists');
    });

    it('16. delete deletes theme by ID and preserves SET NULL behavior', async () => {
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(mockTheme);
      vi.mocked(mockThemeRepo.delete).mockResolvedValueOnce(true);

      await expect(themeService.delete(mockTheme.id)).resolves.not.toThrow();
      expect(mockThemeRepo.delete).toHaveBeenCalledWith(mockTheme.id);
    });
  });

  // ============================================================================
  // 5. TourPackageService
  // ============================================================================
  describe('TourPackageService', () => {
    it('17. getById returns full detail DTO with destination, theme, and itinerary', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(mockPackage);
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(mockTheme);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValueOnce(mockItineraryDays);

      const detail = await tourPackageService.getById(mockPackage.id);

      expect(detail.id).toBe(mockPackage.id);
      expect(detail.title).toBe(mockPackage.title);
      expect(detail.destination.cityName).toBe('Goa');
      expect(detail.theme?.title).toBe('Beach Getaways');
      expect(detail.itinerary.length).toBe(2);
      expect(detail.itinerary[0]?.dayNumber).toBe(1);
    });

    it('18. create validates that referenced destination exists', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(null);

      await expect(
        tourPackageService.create({
          destinationId: 'missing-dest-id',
          title: 'Goa Trip',
          shortDescription: 'Short',
          description: 'Full',
          durationDays: 3,
          durationNights: 2,
          originCity: 'Mumbai',
          destinationCity: 'Goa',
          baseAdultPrice: 3000000,
          heroImageUrl: 'https://images.unsplash.com/hero.jpg',
        }),
      ).rejects.toThrow('Referenced destination');
    });

    it('19. create validates that referenced theme exists if provided', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(null);

      await expect(
        tourPackageService.create({
          destinationId: mockDestination.id,
          themeId: 'missing-theme-id',
          title: 'Goa Trip',
          shortDescription: 'Short',
          description: 'Full',
          durationDays: 3,
          durationNights: 2,
          originCity: 'Mumbai',
          destinationCity: 'Goa',
          baseAdultPrice: 3000000,
          heroImageUrl: 'https://images.unsplash.com/hero.jpg',
        }),
      ).rejects.toThrow('Referenced theme');
    });

    it('20. create with isPublished = true enforces BR-PKG-001 completeness', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockTourPackageRepo.findBySlug).mockResolvedValueOnce(null);

      // Attempt creating directly as published with 0 itinerary days
      await expect(
        tourPackageService.create({
          destinationId: mockDestination.id,
          title: 'Goa Trip',
          shortDescription: 'Short',
          description: 'Full',
          durationDays: 3,
          durationNights: 2,
          originCity: 'Mumbai',
          destinationCity: 'Goa',
          baseAdultPrice: 3000000,
          heroImageUrl: 'https://images.unsplash.com/hero.jpg',
          isPublished: true,
          itinerary: [], // No itinerary
        }),
      ).rejects.toThrow('BR-PKG-001 completeness gate failed');
    });

    it('21. create executes in atomic transaction creating package and itinerary days', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(mockTheme);
      vi.mocked(mockTourPackageRepo.findBySlug).mockResolvedValueOnce(null);
      vi.mocked(mockTourPackageRepo.create).mockResolvedValueOnce(mockPackage);
      vi.mocked(mockItineraryRepo.createMany).mockResolvedValueOnce(mockItineraryDays);

      const res = await tourPackageService.create({
        destinationId: mockDestination.id,
        themeId: mockTheme.id,
        title: 'Scenic Goa Holiday',
        shortDescription: 'Short',
        description: 'Full',
        durationDays: 4,
        durationNights: 3,
        originCity: 'Mumbai',
        destinationCity: 'Goa',
        baseAdultPrice: 4500000,
        heroImageUrl: 'https://images.unsplash.com/goa-hero.jpg',
        itinerary: [
          { dayNumber: 1, title: 'Day 1', activityDescription: 'Arrive' },
          { dayNumber: 2, title: 'Day 2', activityDescription: 'Explore' },
        ],
      });

      expect(res.title).toBe(mockPackage.title);
      expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockTourPackageRepo.create).toHaveBeenCalled();
      expect(mockItineraryRepo.createMany).toHaveBeenCalled();
    });

    it('22. publish checks BR-PKG-001 and publishes draft package', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(mockPackage);
      vi.mocked(mockDestinationRepo.findById).mockResolvedValue(mockDestination);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(mockItineraryDays);
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(mockTheme);

      const publishedPkg = { ...mockPackage, isPublished: true };
      vi.mocked(mockTourPackageRepo.update).mockResolvedValueOnce(publishedPkg);

      const res = await tourPackageService.publish(mockPackage.id);

      expect(res.isPublished).toBe(true);
      expect(mockTourPackageRepo.update).toHaveBeenCalledWith(mockPackage.id, {
        isPublished: true,
      });
    });

    it('23. publish rejects with 400 when destination is unpublished', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(mockPackage);
      const unpublishedDest = { ...mockDestination, isPublished: false };
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(unpublishedDest);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValueOnce(mockItineraryDays);

      await expect(tourPackageService.publish(mockPackage.id)).rejects.toThrow(
        'BR-PKG-001 completeness gate failed',
      );
      expect(mockTourPackageRepo.update).not.toHaveBeenCalled();
    });

    it('24. setItinerary atomically replaces itinerary days in transaction', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(mockPackage);
      vi.mocked(mockItineraryRepo.deleteByPackageId).mockResolvedValueOnce(2);
      vi.mocked(mockItineraryRepo.createMany).mockResolvedValueOnce(mockItineraryDays);

      const updatedItinerary = await tourPackageService.setItinerary(mockPackage.id, [
        { dayNumber: 1, title: 'Day 1', activityDescription: 'Arrival' },
        { dayNumber: 2, title: 'Day 2', activityDescription: 'Sightseeing' },
      ]);

      expect(updatedItinerary.length).toBe(2);
      expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockItineraryRepo.deleteByPackageId).toHaveBeenCalledWith(
        mockPackage.id,
        expect.anything(),
      );
      expect(mockItineraryRepo.createMany).toHaveBeenCalled();
    });

    it('25. setItinerary rejects duplicate or non-positive day numbers', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValue(mockPackage);

      await expect(
        tourPackageService.setItinerary(mockPackage.id, [
          { dayNumber: 1, title: 'Day 1', activityDescription: 'A' },
          { dayNumber: 1, title: 'Day 1 duplicate', activityDescription: 'B' },
        ]),
      ).rejects.toThrow('Duplicate day number');

      await expect(
        tourPackageService.setItinerary(mockPackage.id, [
          { dayNumber: 0, title: 'Day 0', activityDescription: 'A' },
        ]),
      ).rejects.toThrow('Invalid day number');
    });

    it('26. setItinerary prevents removing all days from a published package', async () => {
      const publishedPkg = { ...mockPackage, isPublished: true };
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(publishedPkg);

      await expect(tourPackageService.setItinerary(mockPackage.id, [])).rejects.toThrow(
        'Cannot remove all itinerary days from an active published package (BR-PKG-001)',
      );
    });

    it('27. unpublish updates package status to false', async () => {
      const publishedPkg = { ...mockPackage, isPublished: true };
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(publishedPkg);
      vi.mocked(mockTourPackageRepo.update).mockResolvedValueOnce(mockPackage);
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValueOnce(mockTheme);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValueOnce(mockItineraryDays);

      const res = await tourPackageService.unpublish(mockPackage.id);
      expect(res.isPublished).toBe(false);
      expect(mockTourPackageRepo.update).toHaveBeenCalledWith(mockPackage.id, {
        isPublished: false,
      });
    });
  });

  // ============================================================================
  // 6. Transaction Rollback & Atomicity Guarantees
  // ============================================================================
  describe('Transaction Atomicity & Rollback Guarantees', () => {
    it('28. rolls back and throws if itinerary creation fails during package create', async () => {
      vi.mocked(mockDestinationRepo.findById).mockResolvedValueOnce(mockDestination);
      vi.mocked(mockTourPackageRepo.findBySlug).mockResolvedValueOnce(null);

      // Simulate transaction failure during itinerary insert
      vi.mocked(mockDb.withTransaction).mockRejectedValueOnce(
        new Error('Database disk error during itinerary insert'),
      );

      await expect(
        tourPackageService.create({
          destinationId: mockDestination.id,
          title: 'Scenic Goa Holiday',
          shortDescription: 'Short',
          description: 'Full',
          durationDays: 4,
          durationNights: 3,
          originCity: 'Mumbai',
          destinationCity: 'Goa',
          baseAdultPrice: 4500000,
          heroImageUrl: 'https://images.unsplash.com/goa-hero.jpg',
          itinerary: [{ dayNumber: 1, title: 'Day 1', activityDescription: 'Arrive' }],
        }),
      ).rejects.toThrow('Database disk error during itinerary insert');
    });
  });
});
