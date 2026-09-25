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
  PackageSearchRepository,
  PackageSearchService,
} from '../../backend/src/modules/search/index.js';
import {
  DepartureEntity,
  DepartureRepository,
  InventoryHoldRepository,
  DepartureService,
  AvailabilityService,
  DepartureAvailabilityAggregate,
} from '../../backend/src/modules/inventory/index.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 4 Step 5 — Fastify REST API Routes (Search, Departures & Availability)', () => {
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
    PORT: '4015',
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
  });

  const sampleAdmin: UserEntity = {
    id: 'usr_admin_uuid_1001',
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
    id: 'usr_cust_uuid_2002',
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
    slug: 'manali-adventure-trek',
    title: 'Manali Adventure Trek',
    shortDescription: 'Explore high passes of Himalayas',
    description: 'Detailed description of Manali adventure trek...',
    durationDays: 5,
    durationNights: 4,
    originCity: 'Delhi',
    destinationCity: 'Manali',
    baseAdultPrice: 4500000,
    baseChildPrice: 2500000,
    currency: 'INR',
    heroImageUrl: 'https://images.unsplash.com/photo-manali.jpg',
    galleryUrls: [],
    inclusions: ['Guide', 'Trek Gear'],
    exclusions: ['Flights'],
    accommodationTiers: ['STANDARD'],
    mealPlans: ['FULL_BOARD'],
    isPublished: true,
    isFeatured: false,
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
    priceOverrideAdult: 4800000,
    priceOverrideChild: 2700000,
    currency: 'INR',
    status: 'OPEN',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };

  const sampleSearchItem = {
    id: samplePackageId,
    slug: 'manali-adventure-trek',
    title: 'Manali Adventure Trek',
    shortDescription: 'Explore high passes of Himalayas',
    durationDays: 5,
    durationNights: 4,
    originCity: 'Delhi',
    destinationCity: 'Manali',
    baseAdultPrice: 4500000,
    baseChildPrice: 2500000,
    currency: 'INR' as const,
    heroImageUrl: 'https://images.unsplash.com/photo-manali.jpg',
    isPublished: true,
    isFeatured: false,
    destination: {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'himachal-pradesh',
      cityName: 'Manali',
      country: 'India',
    },
    theme: {
      id: '00000000-0000-0000-0000-000000000002',
      slug: 'adventure-trekking',
      title: 'Adventure & Trekking',
    },
    nextDeparture: {
      departureId: sampleDepartureId,
      departureDate: '2026-11-15',
      returnDate: '2026-11-20',
      availableSeats: 12,
      availabilityStatus: 'AVAILABLE' as const,
      effectiveAdultPrice: 4800000,
      currency: 'INR' as const,
    },
  };

  const sampleAvailabilityAggregate: DepartureAvailabilityAggregate = {
    departureId: sampleDepartureId,
    packageId: samplePackageId,
    departureDate: '2026-11-15',
    returnDate: '2026-11-20',
    totalSeatCapacity: 20,
    bookedSeats: 5,
    activeHeldSeats: 3,
    availableSeats: 12,
    priceOverrideAdult: 4800000,
    priceOverrideChild: 2700000,
    departureCurrency: 'INR',
    departureStatus: 'OPEN',
    baseAdultPrice: 4500000,
    baseChildPrice: 2500000,
    packageCurrency: 'INR',
  };

  function createAuthToken(user: UserEntity): string {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      config.JWT_PRIVATE_KEY,
    );
  }

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
        slug: 'himachal-pradesh',
        cityName: 'Manali',
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
        slug: 'adventure-trekking',
        title: 'Adventure & Trekking',
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
  });

  // ============================================================
  // 1. Public Package Search API
  // ============================================================
  describe('1. GET /api/v1/packages/search', () => {
    it('1.1 returns 200 with matching tour packages and pagination metadata', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [sampleSearchItem],
        total: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?q=Manali&page=1&limit=10',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title).toBe('Manali Adventure Trek');
      expect(json.data[0].nextDeparture).toBeDefined();
      expect(json.data[0].nextDeparture.availableSeats).toBe(12);
      expect(json.meta.total).toBe(1);
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(10);
    });

    it('1.2 supports canonical and optional filters (destinationSlug, themeSlug, maxPrice, dates)', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [sampleSearchItem],
        total: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?destinationSlug=himachal-pradesh&themeSlug=adventure-trekking&minDuration=3&maxDuration=7&maxPrice=5000000&departureDateFrom=2026-10-01&departureDateTo=2026-10-31&isFeatured=false&sortBy=price_asc',
      });

      expect(response.statusCode).toBe(200);
      expect(mockSearchRepo.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationSlug: 'himachal-pradesh',
          themeSlug: 'adventure-trekking',
          minDuration: 3,
          maxDuration: 7,
          maxPrice: 5000000,
          departureDateFrom: '2026-10-01',
          departureDateTo: '2026-10-31',
          sortBy: 'price_asc',
        }),
      );
    });

    it('1.3 returns HTTP 200 with empty array when no packages match (FR-SEARCH-003, no 404)', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?q=NonExistentDestination',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
      expect(json.meta.totalPages).toBe(0);
    });

    it('1.4 returns 400 with canonical error envelope for invalid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/search?minDuration=10&maxDuration=5', // maxDuration < minDuration
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details).toBeDefined();
    });

    it('1.5 handles SQL injection payloads securely via schema validation and parameterization', async () => {
      vi.mocked(mockSearchRepo.searchPackages).mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: "/api/v1/packages/search?q=' OR 1=1 --",
      });

      expect(response.statusCode).toBe(200);
      expect(mockSearchRepo.searchPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "' OR 1=1 --",
        }),
      );
    });
  });

  // ============================================================
  // 2. Public Departures & Availability APIs
  // ============================================================
  describe('2. Public Departure & Availability APIs', () => {
    it('2.1 GET /api/v1/packages/:slug/departures returns upcoming open departures with availability badges', async () => {
      vi.mocked(mockPkgRepo.findBySlug).mockResolvedValueOnce(samplePackage);
      vi.mocked(mockDepartureRepo.listUpcomingForPackage).mockResolvedValueOnce([sampleDeparture]);
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(
        sampleAvailabilityAggregate,
      );

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/packages/${samplePackage.slug}/departures`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].departureId).toBe(sampleDepartureId);
      expect(json.data[0].availableSeats).toBe(12);
      expect(json.data[0].availabilityStatus).toBe('AVAILABLE');
      expect(json.data[0].effectiveAdultPrice).toBe(4800000);
    });

    it('2.2 GET /api/v1/packages/:slug/departures returns 404 when package is unpublished', async () => {
      vi.mocked(mockPkgRepo.findBySlug).mockResolvedValueOnce({
        ...samplePackage,
        isPublished: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/packages/${samplePackage.slug}/departures`,
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('2.3 GET /api/v1/departures/:id/availability returns real-time availability and pricing', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(
        sampleAvailabilityAggregate,
      );

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability?partySize=2`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.departureId).toBe(sampleDepartureId);
      expect(json.data.availableSeats).toBe(12);
      expect(json.data.isAvailableForParty).toBe(true);
      expect(json.data.effectiveAdultPrice).toBe(4800000);
      expect(json.data.effectiveChildPrice).toBe(2700000);
    });

    it('2.4 GET /api/v1/departures/:id/availability blocks insufficient party size (FR-INVENT-003)', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce({
        ...sampleAvailabilityAggregate,
        availableSeats: 3,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability?partySize=4`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.availableSeats).toBe(3);
      expect(json.data.isAvailableForParty).toBe(false);
    });

    it('2.5 GET /api/v1/departures/:id/availability returns 400 for invalid UUID parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/departures/invalid-uuid-format/availability',
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.6 GET /api/v1/departures/:id/availability returns 404 when departure does not exist', async () => {
      vi.mocked(mockDepartureRepo.getAvailabilityById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/departures/${sampleDepartureId}/availability`,
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  // ============================================================
  // 3. Admin Departure Management APIs (RBAC & Mutations)
  // ============================================================
  describe('3. Admin Departure Management APIs', () => {
    let adminToken: string;
    let customerToken: string;

    beforeEach(() => {
      adminToken = createAuthToken(sampleAdmin);
      customerToken = createAuthToken(sampleCustomer);
    });

    it('3.1 POST /api/v1/admin/packages/:packageId/departures: rejects unauthenticated requests with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        payload: {
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.success).toBe(false);
    });

    it('3.2 POST /api/v1/admin/packages/:packageId/departures: rejects CUSTOMER with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
        },
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('3.3 POST /api/v1/admin/packages/:packageId/departures: allows ADMIN and returns 201 with created departure', async () => {
      vi.mocked(mockPkgRepo.findById).mockResolvedValueOnce(samplePackage);
      vi.mocked(mockDepartureRepo.create).mockResolvedValueOnce(sampleDeparture);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
          priceOverrideAdult: 4800000,
          priceOverrideChild: 2700000,
          currency: 'INR',
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleDepartureId);
      expect(json.data.packageId).toBe(samplePackageId);
      expect(json.data.totalSeatCapacity).toBe(20);
    });

    it('3.4 POST /api/v1/admin/packages/:packageId/departures: returns 409 Conflict when duplicate departure exists', async () => {
      vi.mocked(mockPkgRepo.findById).mockResolvedValueOnce(samplePackage);
      const pgError = new Error('duplicate key');
      (pgError as any).code = '23505';
      vi.mocked(mockDepartureRepo.create).mockRejectedValueOnce(pgError);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          departureDate: '2026-11-15',
          returnDate: '2026-11-20',
          totalSeatCapacity: 20,
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('CONFLICT');
    });

    it('3.5 GET /api/v1/admin/packages/:packageId/departures: allows ADMIN to list all package departures', async () => {
      vi.mocked(mockPkgRepo.findById).mockResolvedValueOnce(samplePackage);
      vi.mocked(mockDepartureRepo.listByPackageId).mockResolvedValueOnce([sampleDeparture]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/packages/${samplePackageId}/departures`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(sampleDepartureId);
    });

    it('3.6 GET /api/v1/admin/departures/:id: retrieves departure details for ADMIN', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDeparture);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleDepartureId);
    });

    it('3.7 PATCH /api/v1/admin/departures/:id: allows ADMIN to update capacity and status', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDeparture);
      vi.mocked(mockDepartureRepo.update).mockResolvedValueOnce({
        ...sampleDeparture,
        totalSeatCapacity: 25,
        status: 'CLOSED',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          totalSeatCapacity: 25,
          status: 'CLOSED',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.totalSeatCapacity).toBe(25);
      expect(json.data.status).toBe('CLOSED');
    });

    it('3.8 PATCH /api/v1/admin/departures/:id: rejects capacity reduction below booked seats with 400', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDeparture); // bookedSeats = 5

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          totalSeatCapacity: 4, // 4 < 5
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVENTORY_CAPACITY_EXCEEDED');
    });

    it('3.9 DELETE /api/v1/admin/departures/:id: allows ADMIN to delete departure when bookedSeats = 0', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce({
        ...sampleDeparture,
        bookedSeats: 0,
      });
      vi.mocked(mockHoldRepo.getActiveHoldCountForDeparture).mockResolvedValueOnce(0);
      vi.mocked(mockDepartureRepo.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
    });

    it('3.10 DELETE /api/v1/admin/departures/:id: rejects deletion when confirmed bookings exist', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce(sampleDeparture); // bookedSeats = 5

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('CONFLICT');
    });

    it('3.11 DELETE /api/v1/admin/departures/:id: rejects deletion when active checkout holds exist', async () => {
      vi.mocked(mockDepartureRepo.findById).mockResolvedValueOnce({
        ...sampleDeparture,
        bookedSeats: 0,
      });
      vi.mocked(mockHoldRepo.getActiveHoldCountForDeparture).mockResolvedValueOnce(2); // 2 active holds

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/departures/${sampleDepartureId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('CONFLICT');
    });
  });
});
