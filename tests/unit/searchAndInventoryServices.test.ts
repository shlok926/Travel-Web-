import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppError,
  ErrorCodes,
  PackageSearchQueryDto,
  SupportedCurrency,
} from '../../shared/src/index.js';
import { PackageSearchRepository } from '../../backend/src/modules/search/repositories/packageSearch.repository.js';
import { PackageSearchService } from '../../backend/src/modules/search/services/packageSearch.service.js';
import {
  DepartureEntity,
  DepartureRepository,
  DepartureAvailabilityAggregate,
} from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { InventoryHoldRepository } from '../../backend/src/modules/inventory/repositories/inventoryHold.repository.js';
import { TourPackageRepository } from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import { DepartureService } from '../../backend/src/modules/inventory/services/departure.service.js';
import { AvailabilityService } from '../../backend/src/modules/inventory/services/availability.service.js';

// ============================================================
// Mock Factories & Fixtures
// ============================================================

const samplePackageId = '11111111-1111-1111-1111-111111111111';
const sampleDepartureId = '22222222-2222-2222-2222-222222222222';

const samplePackageEntity = {
  id: samplePackageId,
  destinationId: 'dest-1111',
  themeId: 'theme-1111',
  slug: 'manali-adventure-trek',
  title: 'Manali Adventure Trek',
  shortDescription: 'Explore the high passes of Himalayas',
  description: 'Full description of the tour package...',
  durationDays: 5,
  durationNights: 4,
  originCity: 'Delhi',
  destinationCity: 'Manali',
  baseAdultPrice: 4500000, // 45,000 INR
  baseChildPrice: 2500000, // 25,000 INR
  currency: 'INR' as SupportedCurrency,
  heroImageUrl: 'https://images.unsplash.com/photo-1.jpg',
  galleryUrls: [],
  inclusions: ['Meals', 'Guide'],
  exclusions: ['Flights'],
  accommodationTiers: ['STANDARD'],
  mealPlans: ['BREAKFAST'],
  isPublished: true,
  isFeatured: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const sampleDepartureEntity: DepartureEntity = {
  id: sampleDepartureId,
  packageId: samplePackageId,
  departureDate: '2026-11-15',
  returnDate: '2026-11-20',
  totalSeatCapacity: 20,
  bookedSeats: 5,
  priceOverrideAdult: 4800000,
  priceOverrideChild: 2700000,
  currency: 'INR',
  status: 'OPEN',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const sampleSearchRowResult = {
  id: samplePackageId,
  slug: 'manali-adventure-trek',
  title: 'Manali Adventure Trek',
  shortDescription: 'Explore the high passes of Himalayas',
  durationDays: 5,
  durationNights: 4,
  originCity: 'Delhi',
  destinationCity: 'Manali',
  baseAdultPrice: 4500000,
  baseChildPrice: 2500000,
  currency: 'INR' as SupportedCurrency,
  heroImageUrl: 'https://images.unsplash.com/photo-1.jpg',
  isPublished: true,
  isFeatured: false,
  destination: {
    id: 'dest-1111',
    slug: 'himachal-pradesh',
    cityName: 'Manali',
    country: 'India',
  },
  theme: {
    id: 'theme-1111',
    slug: 'adventure-trekking',
    title: 'Adventure & Trekking',
  },
  nextDeparture: {
    departureId: sampleDepartureId,
    departureDate: '2026-11-15',
    returnDate: '2026-11-20',
    availableSeats: 15,
    availabilityStatus: 'AVAILABLE' as const,
    effectiveAdultPrice: 4800000,
    currency: 'INR' as SupportedCurrency,
  },
};

describe('Phase 4 Step 4 — Domain & Business Rule Services', () => {
  // ============================================================
  // 1. PackageSearchService Unit Tests
  // ============================================================
  describe('1. PackageSearchService', () => {
    let mockSearchRepo: PackageSearchRepository;
    let searchService: PackageSearchService;

    beforeEach(() => {
      mockSearchRepo = {
        searchPackages: vi.fn(),
      } as unknown as PackageSearchRepository;
      searchService = new PackageSearchService(mockSearchRepo);
    });

    it('1.1 searches packages with valid canonical query parameters and returns paginated result', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [sampleSearchRowResult],
        total: 1,
      });

      const query: PackageSearchQueryDto = {
        q: 'Manali',
        destinationSlug: 'himachal-pradesh',
        themeSlug: 'adventure-trekking',
        minDuration: 3,
        maxDuration: 7,
        maxPrice: 5000000,
        page: 1,
        limit: 10,
      };

      const result = await searchService.searchPackages(query);

      expect(mockSearchRepo.searchPackages).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('Manali Adventure Trek');
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('1.2 calculates multi-page pagination metadata correctly (page 2 of 3)', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [sampleSearchRowResult],
        total: 25,
      });

      const result = await searchService.searchPackages({
        page: 2,
        limit: 10,
      });

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('1.3 returns valid empty search result when no packages match (FR-SEARCH-003, no exception)', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const result = await searchService.searchPackages({ q: 'NonExistentPlace' });

      expect(result.items).toEqual([]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('1.4 passes optional extensions (minPrice, currency, departure dates, isFeatured, sortBy) cleanly', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [sampleSearchRowResult],
        total: 1,
      });

      const query: PackageSearchQueryDto = {
        minPrice: 2000000,
        currency: 'INR',
        departureDateFrom: '2026-10-01',
        departureDateTo: '2026-10-31',
        isFeatured: true,
        sortBy: 'price_asc',
      };

      const result = await searchService.searchPackages(query);

      expect(mockSearchRepo.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          minPrice: 2000000,
          currency: 'INR',
          departureDateFrom: '2026-10-01',
          departureDateTo: '2026-10-31',
          isFeatured: true,
          sortBy: 'price_asc',
        }),
      );
      expect(result.items).toHaveLength(1);
    });

    it('1.5 rejects invalid search parameters via Zod schema (e.g. minDuration > maxDuration)', async () => {
      await expect(
        searchService.searchPackages({
          minDuration: 10,
          maxDuration: 5,
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // 2. DepartureService Unit Tests
  // ============================================================
  describe('2. DepartureService', () => {
    let mockDepartureRepo: DepartureRepository;
    let mockTourPackageRepo: TourPackageRepository;
    let mockHoldRepo: InventoryHoldRepository;
    let departureService: DepartureService;

    beforeEach(() => {
      mockDepartureRepo = {
        create: vi.fn(),
        findById: vi.fn(),
        listByPackageId: vi.fn(),
        listUpcomingForPackage: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      } as unknown as DepartureRepository;

      mockTourPackageRepo = {
        findById: vi.fn(),
      } as unknown as TourPackageRepository;

      mockHoldRepo = {
        getActiveHoldCountForDeparture: vi.fn(),
      } as unknown as InventoryHoldRepository;

      departureService = new DepartureService(mockDepartureRepo, mockTourPackageRepo, mockHoldRepo);
    });

    it('2.1 createDeparture: successfully creates departure schedule for existing package', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(samplePackageEntity as any);
      vi.mocked(mockDepartureRepo.create).mockResolvedValueOnce(sampleDepartureEntity);

      const result = await departureService.createDeparture({
        packageId: samplePackageId,
        departureDate: '2026-11-15',
        returnDate: '2026-11-20',
        totalSeatCapacity: 20,
        priceOverrideAdult: 4800000,
        priceOverrideChild: 2700000,
        currency: 'INR',
      });

      expect(mockTourPackageRepo.findById).toHaveBeenCalledWith(samplePackageId);
      expect(mockDepartureRepo.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(sampleDepartureId);
      expect(result.packageId).toBe(samplePackageId);
      expect(result.totalSeatCapacity).toBe(20);
      expect(result.status).toBe('OPEN');
    });

    it('2.2 createDeparture: throws 404 RESOURCE_NOT_FOUND when package does not exist', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(null);

      await expect(
        departureService.createDeparture({
          packageId: '99999999-9999-9999-9999-999999999999',
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
        }),
      ).rejects.toThrow(AppError);
    });

    it('2.3 createDeparture: throws 400 when returnDate < departureDate', async () => {
      await expect(
        departureService.createDeparture({
          packageId: samplePackageId,
          departureDate: '2026-11-20',
          returnDate: '2026-11-15', // Earlier than departureDate
          totalSeatCapacity: 20,
        }),
      ).rejects.toThrow();
    });

    it('2.4 createDeparture: throws 400 when totalSeatCapacity <= 0', async () => {
      await expect(
        departureService.createDeparture({
          packageId: samplePackageId,
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 0,
        }),
      ).rejects.toThrow();
    });

    it('2.5 createDeparture: maps PostgreSQL unique constraint violation (23505) to 409 CONFLICT', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(samplePackageEntity as any);
      const pgError = new Error('duplicate key value violates unique constraint');
      (pgError as any).code = '23505';
      vi.mocked(mockDepartureRepo.create).mockRejectedValueOnce(pgError);

      try {
        await departureService.createDeparture({
          packageId: samplePackageId,
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
        });
        expect.unreachable('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
        expect((err as AppError).code).toBe(ErrorCodes.CONFLICT);
      }
    });

    it('2.6 getDepartureById: returns mapped DepartureDto when found', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDepartureEntity);

      const result = await departureService.getDepartureById(sampleDepartureId);
      expect(result.id).toBe(sampleDepartureId);
      expect(result.departureDate).toBe('2026-11-15');
    });

    it('2.7 getDepartureById: throws 404 NOT_FOUND when departure does not exist', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(null);

      await expect(departureService.getDepartureById('non-existent-id')).rejects.toThrow(AppError);
    });

    it('2.8 listDeparturesForPackage: lists departures for existing tour package', async () => {
      vi.mocked(mockTourPackageRepo.findById).mockResolvedValueOnce(samplePackageEntity as any);
      vi.mocked(mockDepartureRepo.listByPackageId).mockResolvedValueOnce([sampleDepartureEntity]);

      const list = await departureService.listDeparturesForPackage(samplePackageId);
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(sampleDepartureId);
    });

    it('2.9 updateDeparture: successfully updates totalSeatCapacity and status', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDepartureEntity);
      vi.mocked(mockDepartureRepo.update).mockResolvedValueOnce({
        ...sampleDepartureEntity,
        totalSeatCapacity: 30,
        status: 'CLOSED',
      });

      const result = await departureService.updateDeparture(sampleDepartureId, {
        totalSeatCapacity: 30,
        status: 'CLOSED',
      });

      expect(result.totalSeatCapacity).toBe(30);
      expect(result.status).toBe('CLOSED');
    });

    it('2.10 updateDeparture: rejects capacity reduction below currently booked seats', async () => {
      // sampleDepartureEntity has bookedSeats = 5
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDepartureEntity);

      try {
        await departureService.updateDeparture(sampleDepartureId, {
          totalSeatCapacity: 4, // 4 < 5 booked seats
        });
        expect.unreachable('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe(ErrorCodes.INVENTORY_CAPACITY_EXCEEDED);
      }
    });

    it('2.11 deleteDeparture: successfully deletes departure when bookedSeats = 0 and no active holds exist', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce({
        ...sampleDepartureEntity,
        bookedSeats: 0,
      });
      vi.mocked(mockHoldRepo.getActiveHoldCountForDeparture).mockResolvedValueOnce(0);
      vi.mocked(mockDepartureRepo.delete).mockResolvedValueOnce(true);

      const deleted = await departureService.deleteDeparture(sampleDepartureId);
      expect(deleted).toBe(true);
      expect(mockDepartureRepo.delete).toHaveBeenCalledWith(sampleDepartureId);
    });

    it('2.12 deleteDeparture: rejects deletion when confirmed bookings exist (bookedSeats > 0)', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDepartureEntity); // bookedSeats = 5

      try {
        await departureService.deleteDeparture(sampleDepartureId);
        expect.unreachable('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe(ErrorCodes.CONFLICT);
      }
    });

    it('2.13 deleteDeparture: rejects deletion when active unexpired checkout holds exist', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce({
        ...sampleDepartureEntity,
        bookedSeats: 0,
      });
      vi.mocked(mockHoldRepo.getActiveHoldCountForDeparture).mockResolvedValueOnce(2); // 2 active holds

      try {
        await departureService.deleteDeparture(sampleDepartureId);
        expect.unreachable('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
        expect((err as AppError).code).toBe(ErrorCodes.CONFLICT);
      }
    });
  });

  // ============================================================
  // 3. AvailabilityService Unit Tests
  // ============================================================
  describe('3. AvailabilityService', () => {
    let mockDepartureRepo: DepartureRepository;
    let availabilityService: AvailabilityService;

    const baseAggregate: DepartureAvailabilityAggregate = {
      departureId: sampleDepartureId,
      packageId: samplePackageId,
      departureDate: '2026-11-15',
      returnDate: '2026-11-20',
      totalSeatCapacity: 20,
      bookedSeats: 5,
      activeHeldSeats: 3,
      availableSeats: 12, // 20 - 5 - 3 = 12
      priceOverrideAdult: 4800000,
      priceOverrideChild: 2700000,
      departureCurrency: 'INR',
      departureStatus: 'OPEN',
      baseAdultPrice: 4500000,
      baseChildPrice: 2500000,
      packageCurrency: 'INR',
    };

    beforeEach(() => {
      mockDepartureRepo = {
        getAvailabilityById: vi.fn(),
      } as unknown as DepartureRepository;
      availabilityService = new AvailabilityService(mockDepartureRepo);
    });

    it('3.1 derives AVAILABLE status when availableSeats >= 5 and status is OPEN', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        availableSeats: 12,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId, {
        partySize: 2,
      });

      expect(avail.availableSeats).toBe(12);
      expect(avail.availabilityStatus).toBe('AVAILABLE');
      expect(avail.isAvailableForParty).toBe(true);
      expect(avail.effectiveAdultPrice).toBe(4800000);
      expect(avail.effectiveChildPrice).toBe(2700000);
      expect(avail.currency).toBe('INR');
    });

    it('3.2 derives FEW_SEATS_LEFT status when 1 <= availableSeats < 5', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        availableSeats: 3,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId, {
        partySize: 2,
      });

      expect(avail.availableSeats).toBe(3);
      expect(avail.availabilityStatus).toBe('FEW_SEATS_LEFT');
      expect(avail.isAvailableForParty).toBe(true);
    });

    it('3.3 derives SOLD_OUT status when availableSeats === 0 and status is OPEN', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        bookedSeats: 20,
        activeHeldSeats: 0,
        availableSeats: 0,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId, {
        partySize: 1,
      });

      expect(avail.availableSeats).toBe(0);
      expect(avail.availabilityStatus).toBe('SOLD_OUT');
      expect(avail.isAvailableForParty).toBe(false);
    });

    it('3.4 derives CLOSED status when departure status is CLOSED', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        departureStatus: 'CLOSED',
        availableSeats: 10,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId);

      expect(avail.availabilityStatus).toBe('CLOSED');
      expect(avail.isAvailableForParty).toBe(false);
    });

    it('3.5 derives CANCELLED status when departure status is CANCELLED', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        departureStatus: 'CANCELLED',
        availableSeats: 10,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId);

      expect(avail.availabilityStatus).toBe('CANCELLED');
      expect(avail.isAvailableForParty).toBe(false);
    });

    it('3.6 blocks party size when requested partySize exceeds availableSeats (FR-INVENT-003)', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        availableSeats: 3,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId, {
        partySize: 4, // 4 > 3 available
      });

      expect(avail.availableSeats).toBe(3);
      expect(avail.isAvailableForParty).toBe(false);
    });

    it('3.7 falls back to tour package base price when departure price overrides are null', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...baseAggregate,
        priceOverrideAdult: null,
        priceOverrideChild: null,
        departureCurrency: null,
      });

      const avail = await availabilityService.getDepartureAvailability(sampleDepartureId);

      expect(avail.effectiveAdultPrice).toBe(4500000); // Package base price
      expect(avail.effectiveChildPrice).toBe(2500000); // Package base price
      expect(avail.currency).toBe('INR');
    });

    it('3.8 throws 404 RESOURCE_NOT_FOUND when departure aggregate does not exist', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(null);

      await expect(availabilityService.getDepartureAvailability('non-existent-id')).rejects.toThrow(
        AppError,
      );
    });
  });
});
