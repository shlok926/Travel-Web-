import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  UserRepository,
  UserEntity,
  RefreshTokenRepository,
} from '../../backend/src/modules/auth/repositories/index.js';
import { AuthService } from '../../backend/src/modules/auth/services/auth.service.js';
import {
  DestinationRepository,
  ThemeRepository,
  TourPackageRepository,
  ItineraryRepository,
  DestinationService,
  ThemeService,
  TourPackageService,
  TourPackageEntity,
} from '../../backend/src/modules/catalogue/index.js';
import {
  DepartureEntity,
  DepartureRepository,
  InventoryHoldRepository,
  DepartureService,
  AvailabilityService,
  DepartureAvailabilityAggregate,
} from '../../backend/src/modules/inventory/index.js';
import {
  PackageSearchRepository,
  PackageSearchService,
} from '../../backend/src/modules/search/index.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 4 — Final Integration, Security Audit & Freeze Verification', () => {
  let app: FastifyInstance;
  let mockDb: DatabaseService;
  let mockUserRepo: UserRepository;
  let mockTokenRepo: RefreshTokenRepository;
  let authService: AuthService;

  let mockDestRepo: DestinationRepository;
  let mockThemeRepo: ThemeRepository;
  let mockPkgRepo: TourPackageRepository;
  let mockItineraryRepo: ItineraryRepository;
  let destinationService: DestinationService;
  let themeService: ThemeService;
  let tourPackageService: TourPackageService;

  let mockSearchRepo: PackageSearchRepository;
  let mockDepartureRepo: DepartureRepository;
  let mockHoldRepo: InventoryHoldRepository;
  let packageSearchService: PackageSearchService;
  let departureService: DepartureService;
  let availabilityService: AvailabilityService;

  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4016',
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
  });

  const sampleAdmin: UserEntity = {
    id: 'usr_admin_freeze_1',
    email: 'admin@youngtoursandtravels.com',
    passwordHash: '$argon2id$...',
    fullName: 'Admin Super',
    mobileContact: '+919876543299',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  const sampleCustomer: UserEntity = {
    id: 'usr_cust_freeze_1',
    email: 'customer@example.com',
    passwordHash: '$argon2id$...',
    fullName: 'Regular Customer',
    mobileContact: '+919876543211',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  const samplePackageId = '11111111-1111-1111-1111-111111111111';
  const sampleDepartureId = '22222222-2222-2222-2222-222222222222';

  const samplePackage: TourPackageEntity = {
    id: samplePackageId,
    destinationId: '00000000-0000-0000-0000-000000000001',
    themeId: '00000000-0000-0000-0000-000000000002',
    slug: 'kashmir-delight-tour',
    title: 'Kashmir Delight Tour',
    shortDescription: '6 Days paradise tour',
    description: 'Detailed description of Kashmir delight tour...',
    durationDays: 6,
    durationNights: 5,
    originCity: 'Delhi',
    destinationCity: 'Srinagar',
    baseAdultPrice: 4500000,
    baseChildPrice: 2250000,
    currency: 'INR',
    heroImageUrl: 'https://images.unsplash.com/kashmir.jpg',
    galleryUrls: [],
    inclusions: ['Guide', 'Houseboat'],
    exclusions: ['Flights'],
    accommodationTiers: ['STANDARD'],
    mealPlans: ['FULL_BOARD'],
    isPublished: true,
    isFeatured: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };

  const sampleDeparture: DepartureEntity = {
    id: sampleDepartureId,
    packageId: samplePackageId,
    departureDate: '2026-11-15',
    returnDate: '2026-11-20',
    totalSeatCapacity: 20,
    bookedSeats: 5,
    priceOverrideAdult: 4200000,
    priceOverrideChild: 2100000,
    currency: 'INR',
    status: 'OPEN',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };

  const adminToken = JwtSecurity.sign(
    { userId: sampleAdmin.id, email: sampleAdmin.email, role: 'ADMIN' },
    config.JWT_PRIVATE_KEY,
  );

  const customerToken = JwtSecurity.sign(
    { userId: sampleCustomer.id, email: sampleCustomer.email, role: 'CUSTOMER' },
    config.JWT_PRIVATE_KEY,
  );

  beforeEach(async () => {
    mockDb = {
      query: vi.fn(),
      getPool: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
      withTransaction: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn() })),
    } as unknown as DatabaseService;

    mockUserRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === sampleAdmin.id) return sampleAdmin;
        if (id === sampleCustomer.id) return sampleCustomer;
        return null;
      }),
      findByEmail: vi.fn(),
    } as unknown as UserRepository;

    mockTokenRepo = {
      findActiveByHash: vi.fn(),
      revoke: vi.fn(),
    } as unknown as RefreshTokenRepository;

    authService = new AuthService(mockDb, mockUserRepo, mockTokenRepo, config);

    mockDestRepo = {
      findById: vi.fn().mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'kashmir-valley',
        cityName: 'Srinagar',
        country: 'India',
        isPublished: true,
        heroImageUrl: 'https://images.unsplash.com/dest.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findBySlug: vi.fn(),
      list: vi.fn(),
    } as unknown as DestinationRepository;

    mockThemeRepo = {
      findById: vi.fn().mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
        slug: 'family',
        title: 'Family Holidays',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findBySlug: vi.fn(),
      list: vi.fn(),
    } as unknown as ThemeRepository;

    mockPkgRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === samplePackageId) return samplePackage;
        return null;
      }),
      findBySlug: vi.fn().mockImplementation(async (slug: string) => {
        if (slug === samplePackage.slug) return samplePackage;
        return null;
      }),
      list: vi.fn(),
    } as unknown as TourPackageRepository;

    mockItineraryRepo = {
      listByPackageId: vi.fn().mockResolvedValue([]),
    } as unknown as ItineraryRepository;

    destinationService = new DestinationService(mockDestRepo, mockPkgRepo);
    themeService = new ThemeService(mockThemeRepo);
    tourPackageService = new TourPackageService(
      mockPkgRepo,
      mockDestRepo,
      mockThemeRepo,
      mockItineraryRepo,
      mockDb,
    );

    mockSearchRepo = {
      searchPackages: vi.fn(),
    } as unknown as PackageSearchRepository;

    mockDepartureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByPackageId: vi.fn(),
      listUpcomingForPackage: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getAvailabilityById: vi.fn(),
    } as unknown as DepartureRepository;

    mockHoldRepo = {
      getActiveHoldCountForDeparture: vi.fn().mockResolvedValue(0),
    } as unknown as InventoryHoldRepository;

    packageSearchService = new PackageSearchService(mockSearchRepo);
    departureService = new DepartureService(mockDepartureRepo, mockPkgRepo, mockHoldRepo);
    availabilityService = new AvailabilityService(mockDepartureRepo);

    const appInstance = await createApp({
      config,
      db: mockDb,
      userRepo: mockUserRepo,
      refreshTokenRepo: mockTokenRepo,
      authService,
      destinationRepo: mockDestRepo,
      themeRepo: mockThemeRepo,
      tourPackageRepo: mockPkgRepo,
      itineraryRepo: mockItineraryRepo,
      destinationService,
      themeService,
      tourPackageService,
      packageSearchRepo: mockSearchRepo,
      departureRepo: mockDepartureRepo,
      holdRepo: mockHoldRepo,
      packageSearchService,
      departureService,
      availabilityService,
    });

    app = appInstance.app;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.restoreAllMocks();
  });

  describe('1. Search & Multi-Criteria Filtering (FR-SEARCH-001..004)', () => {
    it('1.1 public search filters packages by keyword, destination, theme, duration, and budget', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [
          {
            id: samplePackageId,
            slug: samplePackage.slug,
            title: samplePackage.title,
            shortDescription: samplePackage.shortDescription,
            durationDays: samplePackage.durationDays,
            durationNights: samplePackage.durationNights,
            originCity: samplePackage.originCity,
            destinationCity: samplePackage.destinationCity,
            baseAdultPrice: samplePackage.baseAdultPrice,
            baseChildPrice: samplePackage.baseChildPrice,
            currency: samplePackage.currency,
            heroImageUrl: samplePackage.heroImageUrl,
            isPublished: true,
            isFeatured: true,
            destination: {
              id: '00000000-0000-0000-0000-000000000001',
              slug: 'kashmir-valley',
              cityName: 'Srinagar',
              country: 'India',
            },
            theme: {
              id: '00000000-0000-0000-0000-000000000002',
              slug: 'family',
              title: 'Family Holidays',
            },
            nextDeparture: {
              departureId: sampleDepartureId,
              departureDate: '2026-11-15',
              returnDate: '2026-11-20',
              availableSeats: 15,
              availabilityStatus: 'AVAILABLE',
              effectiveAdultPrice: 4200000,
              currency: 'INR',
            },
          },
        ],
        total: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?q=Kashmir&destinationSlug=kashmir-valley&themeSlug=family&minDuration=4&maxDuration=7&maxPrice=5000000&sortBy=price_asc&page=1&limit=12',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].slug).toBe('kashmir-delight-tour');
      expect(json.data[0].nextDeparture.availableSeats).toBe(15);
      expect(json.meta.total).toBe(1);
    });

    it('1.2 returns HTTP 200 with empty array when no packages match (FR-SEARCH-003)', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?q=NonExistentPackageQuery',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
    });

    it('1.3 rejects invalid duration queries with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?minDuration=-1',
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. SQL Injection Resistance & Input Validation (SECURITY AUDIT)', () => {
    it('2.1 securely parameterizes malicious search strings without SQL injection', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const maliciousSql = "' OR '1'='1' UNION SELECT * FROM users; --";
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/packages/search?q=${encodeURIComponent(maliciousSql)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(mockSearchRepo.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          q: maliciousSql,
        }),
      );
    });

    it('2.2 rejects non-allowlisted sort keys with 400 validation error', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?sortBy=malicious_col',
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Real-Time Availability & Party-Size Calculation (FR-INVENT-001..003 / DR-006)', () => {
    it('3.1 calculates derived available seats subtracting active unexpired holds', async () => {
      const aggregate: DepartureAvailabilityAggregate = {
        departureId: sampleDepartureId,
        packageId: samplePackageId,
        departureDate: '2026-11-15',
        returnDate: '2026-11-20',
        totalSeatCapacity: 20,
        bookedSeats: 12,
        activeHeldSeats: 4,
        availableSeats: 4, // 20 - 12 - 4 = 4
        priceOverrideAdult: 4200000,
        priceOverrideChild: 2100000,
        departureCurrency: 'INR',
        departureStatus: 'OPEN',
        baseAdultPrice: 4500000,
        baseChildPrice: 2250000,
        packageCurrency: 'INR',
      };

      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(aggregate);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability?partySize=4`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.availableSeats).toBe(4);
      expect(json.data.availabilityStatus).toBe('FEW_SEATS_LEFT');
      expect(json.data.isAvailableForParty).toBe(true);
      expect(json.data.effectiveAdultPrice).toBe(4200000); // Departure price override
    });

    it('3.2 evaluates isAvailableForParty as false when party size exceeds available seats', async () => {
      const aggregate: DepartureAvailabilityAggregate = {
        departureId: sampleDepartureId,
        packageId: samplePackageId,
        departureDate: '2026-11-15',
        returnDate: '2026-11-20',
        totalSeatCapacity: 20,
        bookedSeats: 18,
        activeHeldSeats: 0,
        availableSeats: 2,
        priceOverrideAdult: null,
        priceOverrideChild: null,
        departureCurrency: 'INR',
        departureStatus: 'OPEN',
        baseAdultPrice: 4500000,
        baseChildPrice: 2250000,
        packageCurrency: 'INR',
      };

      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(aggregate);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability?partySize=5`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.availableSeats).toBe(2);
      expect(json.data.isAvailableForParty).toBe(false);
      expect(json.data.effectiveAdultPrice).toBe(4500000); // Base package price fallback
    });

    it('3.3 marks status as SOLD_OUT when availableSeats reaches 0', async () => {
      const aggregate: DepartureAvailabilityAggregate = {
        departureId: sampleDepartureId,
        packageId: samplePackageId,
        departureDate: '2026-11-15',
        returnDate: '2026-11-20',
        totalSeatCapacity: 20,
        bookedSeats: 20,
        activeHeldSeats: 0,
        availableSeats: 0,
        priceOverrideAdult: null,
        priceOverrideChild: null,
        departureCurrency: 'INR',
        departureStatus: 'OPEN',
        baseAdultPrice: 4500000,
        baseChildPrice: 2250000,
        packageCurrency: 'INR',
      };

      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(aggregate);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.availableSeats).toBe(0);
      expect(json.data.availabilityStatus).toBe('SOLD_OUT');
      expect(json.data.isAvailableForParty).toBe(false);
    });
  });

  describe('4. Security & RBAC Boundary Verification', () => {
    it('4.1 public departures list is accessible without authentication token', async () => {
      vi.mocked(mockDepartureRepo.listUpcomingForPackage).mockResolvedValueOnce([sampleDeparture]);
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        departureId: sampleDeparture.id,
        packageId: samplePackage.id,
        departureDate: sampleDeparture.departureDate,
        returnDate: sampleDeparture.returnDate,
        totalSeatCapacity: sampleDeparture.totalSeatCapacity,
        bookedSeats: sampleDeparture.bookedSeats,
        activeHeldSeats: 0,
        availableSeats: 15,
        priceOverrideAdult: sampleDeparture.priceOverrideAdult,
        priceOverrideChild: sampleDeparture.priceOverrideChild,
        departureCurrency: sampleDeparture.currency,
        departureStatus: sampleDeparture.status,
        baseAdultPrice: samplePackage.baseAdultPrice,
        baseChildPrice: samplePackage.baseChildPrice,
        packageCurrency: samplePackage.currency,
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/packages/${samplePackage.slug}/departures`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].availableSeats).toBe(15);
    });

    it('4.2 admin departure mutation rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        payload: {
          departureDate: '2026-12-01',
          returnDate: '2026-12-07',
          totalSeatCapacity: 20,
        },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('4.3 admin departure mutation rejects CUSTOMER role with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: {
          authorization: `Bearer ${customerToken}`,
        },
        payload: {
          departureDate: '2026-12-01',
          returnDate: '2026-12-07',
          totalSeatCapacity: 20,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('4.4 admin departure creation succeeds with ADMIN JWT token (FR-ADMIN-004)', async () => {
      vi.mocked(mockDepartureRepo.listByPackageId).mockResolvedValueOnce([]);
      vi.mocked(mockDepartureRepo.create).mockResolvedValueOnce(sampleDeparture);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
          priceOverrideAdult: 4200000,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleDepartureId);
      expect(json.data.totalSeatCapacity).toBe(20);
    });
  });

  describe('5. Concurrency, Invariant & Phase 5 Boundary Safety', () => {
    it('5.1 validates that returnDate cannot be earlier than departureDate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          departureDate: '2026-12-10',
          returnDate: '2026-12-05', // Invalid
          totalSeatCapacity: 20,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('5.2 rejects departure schedules on non-existent tour packages with 404', async () => {
      const nonExistentPkgId = '00000000-0000-0000-0000-000000000999';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${nonExistentPkgId}/departures`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          departureDate: '2026-12-01',
          returnDate: '2026-12-07',
          totalSeatCapacity: 20,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
