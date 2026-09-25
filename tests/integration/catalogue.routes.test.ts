import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { RedisService } from '../../backend/src/infrastructure/redis/index.js';
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
  DestinationEntity,
  ThemeEntity,
  TourPackageEntity,
  ItineraryDayEntity,
} from '../../backend/src/modules/catalogue/index.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 3 Step 5 — Catalogue REST API Routes & Fastify Controllers', () => {
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

  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4010',
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

  const samplePublishedDestination: DestinationEntity = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'kashmir-valley',
    cityName: 'Srinagar',
    country: 'India',
    description: 'Paradise on Earth with snow-clad mountains and beautiful lakes.',
    thumbnailUrl: 'https://images.example.com/kashmir-thumb.jpg',
    heroImageUrl: 'https://images.example.com/kashmir-hero.jpg',
    isFeatured: true,
    isPublished: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const sampleUnpublishedDestination: DestinationEntity = {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'ladakh-high-passes',
    cityName: 'Leh',
    country: 'India',
    description: 'Land of high passes and ancient monasteries.',
    thumbnailUrl: 'https://images.example.com/ladakh-thumb.jpg',
    heroImageUrl: null,
    isFeatured: false,
    isPublished: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const sampleTheme: ThemeEntity = {
    id: '10000000-0000-0000-0000-000000000001',
    slug: 'honeymoon',
    title: 'Honeymoon',
    description: 'Romantic packages tailored for newlyweds.',
    iconUrl: 'https://images.example.com/honeymoon-icon.svg',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const samplePublishedPackage: TourPackageEntity = {
    id: '20000000-0000-0000-0000-000000000001',
    destinationId: samplePublishedDestination.id,
    themeId: sampleTheme.id,
    slug: 'splendid-kashmir-honeymoon',
    title: 'Splendid Kashmir Honeymoon',
    shortDescription: 'Experience the magic of Srinagar in 6 days.',
    description:
      'Experience the magic of Srinagar, Gulmarg and Pahalgam in 6 days with luxury houseboat stay.',
    durationDays: 6,
    durationNights: 5,
    originCity: 'Srinagar',
    destinationCity: 'Srinagar',
    baseAdultPrice: 4500000,
    baseChildPrice: 2250000,
    currency: 'INR',
    heroImageUrl: 'https://images.example.com/kashmir-package.jpg',
    galleryUrls: ['https://images.example.com/kashmir-p1.jpg'],
    inclusions: ['Accommodation', 'Daily Breakfast', 'Transfers', 'Shikara Ride'],
    exclusions: ['Airfare', 'Personal Expenses', 'Gondola Ride Tickets'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isFeatured: true,
    isPublished: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const sampleItineraryDays: ItineraryDayEntity[] = [
    {
      id: '30000000-0000-0000-0000-000000000001',
      packageId: samplePublishedPackage.id,
      dayNumber: 1,
      title: 'Arrival in Srinagar & Shikara Ride',
      activityDescription:
        'Arrive at Srinagar airport, transfer to Houseboat, enjoy evening Shikara ride on Dal Lake.',
      mealsIncluded: ['DINNER'],
      accommodationNotes: 'Deluxe Houseboat',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      packageId: samplePublishedPackage.id,
      dayNumber: 2,
      title: 'Srinagar to Gulmarg Excursion',
      activityDescription:
        'Full day trip to Gulmarg, meadow of flowers and Gondola cable car ride.',
      mealsIncluded: ['BREAKFAST', 'DINNER'],
      accommodationNotes: 'Gulmarg Resort',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000003',
      packageId: samplePublishedPackage.id,
      dayNumber: 3,
      title: 'Gulmarg to Pahalgam Valley',
      activityDescription: 'Transfer to Pahalgam via saffron fields and apple orchards.',
      mealsIncluded: ['BREAKFAST', 'DINNER'],
      accommodationNotes: 'Pahalgam River View Hotel',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000004',
      packageId: samplePublishedPackage.id,
      dayNumber: 4,
      title: 'Pahalgam Exploration to Srinagar',
      activityDescription: 'Explore Aru Valley and return back to Srinagar hotel.',
      mealsIncluded: ['BREAKFAST', 'DINNER'],
      accommodationNotes: 'Srinagar Luxury Hotel',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000005',
      packageId: samplePublishedPackage.id,
      dayNumber: 5,
      title: 'Sonamarg Day Trip',
      activityDescription: 'Excursion to Sonamarg, the Meadow of Gold and Thajiwas Glacier.',
      mealsIncluded: ['BREAKFAST', 'DINNER'],
      accommodationNotes: 'Srinagar Luxury Hotel',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000006',
      packageId: samplePublishedPackage.id,
      dayNumber: 6,
      title: 'Departure from Srinagar',
      activityDescription:
        'Morning Mughal Gardens tour and departure transfer to Srinagar Airport.',
      mealsIncluded: ['BREAKFAST'],
      accommodationNotes: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];

  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    mockDb = {
      withTransaction: vi.fn(async (callback) => callback({} as any)),
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as RedisService;

    mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn((id: string) => {
        if (id === sampleAdmin.id) return Promise.resolve(sampleAdmin);
        if (id === sampleCustomer.id) return Promise.resolve(sampleCustomer);
        return Promise.resolve(null);
      }),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    mockTokenRepo = {
      create: vi.fn(),
      findActiveByHash: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
    } as unknown as RefreshTokenRepository;

    authService = new AuthService(mockDb, mockUserRepo, mockTokenRepo, config);

    // Mock Catalogue Repositories
    mockDestRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
      countByDestinationId: vi.fn(),
    } as unknown as DestinationRepository;

    mockThemeRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
      countByThemeId: vi.fn(),
    } as unknown as ThemeRepository;

    mockPkgRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn(),
      listByDestinationId: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
      countByDestinationId: vi.fn().mockResolvedValue(0),
      countByThemeId: vi.fn().mockResolvedValue(0),
    } as unknown as TourPackageRepository;

    mockItineraryRepo = {
      listByPackageId: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue([]),
      replaceForPackage: vi.fn(),
      deleteByPackageId: vi.fn().mockResolvedValue(1),
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

    const created = await createApp({
      config,
      db: mockDb,
      redis: mockRedis,
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
    });

    app = created.app;
    await app.ready();

    // Sign Access Tokens for Auth and Admin
    adminToken = JwtSecurity.sign(
      { userId: sampleAdmin.id, email: sampleAdmin.email, role: 'ADMIN' },
      config.JWT_PRIVATE_KEY,
    );

    customerToken = JwtSecurity.sign(
      { userId: sampleCustomer.id, email: sampleCustomer.email, role: 'CUSTOMER' },
      config.JWT_PRIVATE_KEY,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. PUBLIC CATALOGUE APIS
  // =========================================================================
  describe('Public Catalogue Routes', () => {
    describe('GET /api/v1/destinations', () => {
      it('returns 200 with list of published destinations and pagination metadata', async () => {
        vi.mocked(mockDestRepo.list).mockResolvedValue({
          items: [samplePublishedDestination],
          total: 1,
        });

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/destinations?page=1&limit=10',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].slug).toBe('kashmir-valley');
        expect(body.meta.total).toBe(1);
        expect(body.meta.page).toBe(1);
        expect(body.meta.limit).toBe(10);
      });
    });

    describe('GET /api/v1/destinations/:slug', () => {
      it('returns 200 with destination details when destination is published', async () => {
        vi.mocked(mockDestRepo.findBySlug).mockResolvedValue(samplePublishedDestination);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/destinations/kashmir-valley',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.slug).toBe('kashmir-valley');
        expect(body.data.isPublished).toBe(true);
      });

      it('returns 404 NOT_FOUND when destination is unpublished', async () => {
        vi.mocked(mockDestRepo.findBySlug).mockResolvedValue(sampleUnpublishedDestination);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/destinations/ladakh-high-passes',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('returns 404 NOT_FOUND when destination slug does not exist', async () => {
        vi.mocked(mockDestRepo.findBySlug).mockResolvedValue(null);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/destinations/non-existent-destination',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/v1/themes', () => {
      it('returns 200 with list of themes', async () => {
        vi.mocked(mockThemeRepo.list).mockResolvedValue([sampleTheme]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/themes',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].slug).toBe('honeymoon');
      });
    });

    describe('GET /api/v1/packages', () => {
      it('returns 200 with list of published packages and metadata', async () => {
        vi.mocked(mockPkgRepo.list).mockResolvedValue({
          items: [samplePublishedPackage],
          total: 1,
        });

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/packages?isFeatured=true&limit=10',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].slug).toBe('splendid-kashmir-honeymoon');
        expect(body.meta.total).toBe(1);
      });
    });

    describe('GET /api/v1/packages/:slug', () => {
      it('returns 200 with full package detail including destination, theme, and itinerary', async () => {
        vi.mocked(mockPkgRepo.findBySlug).mockResolvedValue(samplePublishedPackage);
        vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
        vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
        vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/packages/splendid-kashmir-honeymoon',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.slug).toBe('splendid-kashmir-honeymoon');
        expect(body.data.destination.slug).toBe('kashmir-valley');
        expect(body.data.theme.slug).toBe('honeymoon');
        expect(body.data.itinerary).toHaveLength(6);
        expect(body.data.itinerary[0].dayNumber).toBe(1);
      });

      it('returns 404 NOT_FOUND when package is unpublished', async () => {
        const unpublishedPkg = { ...samplePublishedPackage, isPublished: false };
        vi.mocked(mockPkgRepo.findBySlug).mockResolvedValue(unpublishedPkg);
        vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
        vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
        vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/packages/splendid-kashmir-honeymoon',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });

      it('returns 404 NOT_FOUND when package references an unpublished destination', async () => {
        vi.mocked(mockPkgRepo.findBySlug).mockResolvedValue(samplePublishedPackage);
        vi.mocked(mockDestRepo.findById).mockResolvedValue(sampleUnpublishedDestination);
        vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
        vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/packages/splendid-kashmir-honeymoon',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });
  });

  // =========================================================================
  // 2. AUTHENTICATION & RBAC GUARDS
  // =========================================================================
  describe('Admin Routes Authentication & Authorization', () => {
    it('returns 401 UNAUTHORIZED when no Authorization header is sent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when an invalid Bearer token is sent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
        headers: {
          authorization: 'Bearer invalid.token.value',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('returns 403 FORBIDDEN when user has CUSTOMER role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
        headers: {
          authorization: `Bearer ${customerToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('allows access when user has ADMIN role', async () => {
      vi.mocked(mockDestRepo.list).mockResolvedValue({
        items: [samplePublishedDestination],
        total: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 3. ADMIN DESTINATION MANAGEMENT
  // =========================================================================
  describe('Admin Destinations APIs', () => {
    it('POST /api/v1/admin/destinations creates a new destination', async () => {
      vi.mocked(mockDestRepo.create).mockResolvedValue(samplePublishedDestination);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/destinations',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          slug: 'kashmir-valley',
          cityName: 'Srinagar',
          country: 'India',
          description: 'Paradise on Earth with snow-clad mountains and beautiful lakes.',
          thumbnailUrl: 'https://images.example.com/kashmir-thumb.jpg',
          heroImageUrl: 'https://images.example.com/kashmir-hero.jpg',
          isFeatured: true,
          isPublished: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe('kashmir-valley');
    });

    it('PATCH /api/v1/admin/destinations/:id updates an existing destination', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockDestRepo.update).mockResolvedValue({
        ...samplePublishedDestination,
        cityName: 'Srinagar Capital',
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/destinations/${samplePublishedDestination.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          cityName: 'Srinagar Capital',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.cityName).toBe('Srinagar Capital');
    });

    it('POST /api/v1/admin/destinations/:id/publish publishes a destination', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(sampleUnpublishedDestination);
      vi.mocked(mockDestRepo.update).mockResolvedValue({
        ...sampleUnpublishedDestination,
        isPublished: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/destinations/${sampleUnpublishedDestination.id}/publish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isPublished).toBe(true);
    });

    it('POST /api/v1/admin/destinations/:id/unpublish unpublishes a destination', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockDestRepo.update).mockResolvedValue({
        ...samplePublishedDestination,
        isPublished: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/destinations/${samplePublishedDestination.id}/unpublish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isPublished).toBe(false);
    });

    it('DELETE /api/v1/admin/destinations/:id deletes destination when no packages linked', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockPkgRepo.listByDestinationId).mockResolvedValue([]);
      vi.mocked(mockDestRepo.delete).mockResolvedValue(true);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/destinations/${samplePublishedDestination.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('successfully deleted');
    });

    it('DELETE /api/v1/admin/destinations/:id returns 409 CONFLICT if packages are linked', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockPkgRepo.listByDestinationId).mockResolvedValue([samplePublishedPackage]);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/destinations/${samplePublishedDestination.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // =========================================================================
  // 4. ADMIN THEME MANAGEMENT
  // =========================================================================
  describe('Admin Themes APIs', () => {
    it('POST /api/v1/admin/themes creates a new theme', async () => {
      vi.mocked(mockThemeRepo.create).mockResolvedValue(sampleTheme);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/themes',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          slug: 'honeymoon',
          title: 'Honeymoon',
          description: 'Romantic packages tailored for newlyweds.',
          iconUrl: 'https://images.example.com/honeymoon-icon.svg',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Honeymoon');
    });

    it('PATCH /api/v1/admin/themes/:id updates an existing theme', async () => {
      vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
      vi.mocked(mockThemeRepo.update).mockResolvedValue({
        ...sampleTheme,
        title: 'Honeymoon Special',
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/themes/${sampleTheme.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          title: 'Honeymoon Special',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Honeymoon Special');
    });

    it('DELETE /api/v1/admin/themes/:id deletes theme when no packages linked', async () => {
      vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
      vi.mocked(mockThemeRepo.delete).mockResolvedValue(true);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/themes/${sampleTheme.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('successfully deleted');
    });
  });

  // =========================================================================
  // 5. ADMIN TOUR PACKAGE & ITINERARY MANAGEMENT (INCLUDING BR-PKG-001)
  // =========================================================================
  describe('Admin Tour Packages & Itinerary APIs', () => {
    it('POST /api/v1/admin/packages creates a draft tour package', async () => {
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
      vi.mocked(mockPkgRepo.create).mockResolvedValue({
        ...samplePublishedPackage,
        isPublished: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/packages',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          destinationId: samplePublishedDestination.id,
          themeId: sampleTheme.id,
          slug: 'splendid-kashmir-honeymoon',
          title: 'Splendid Kashmir Honeymoon',
          shortDescription: 'Experience the magic of Srinagar in 6 days.',
          description:
            'Experience the magic of Srinagar, Gulmarg and Pahalgam in 6 days with luxury houseboat stay.',
          durationDays: 6,
          durationNights: 5,
          originCity: 'Srinagar',
          destinationCity: 'Srinagar',
          baseAdultPrice: 4500000,
          baseChildPrice: 2250000,
          currency: 'INR',
          heroImageUrl: 'https://images.example.com/kashmir-package.jpg',
          galleryUrls: ['https://images.example.com/kashmir-p1.jpg'],
          inclusions: ['Accommodation', 'Daily Breakfast', 'Transfers', 'Shikara Ride'],
          exclusions: ['Airfare', 'Personal Expenses', 'Gondola Ride Tickets'],
          accommodationTiers: ['STANDARD', 'LUXURY'],
          mealPlans: ['BREAKFAST', 'HALF_BOARD'],
          isFeatured: true,
          isPublished: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Splendid Kashmir Honeymoon');
    });

    it('PUT /api/v1/admin/packages/:id/itinerary atomically replaces itinerary days', async () => {
      vi.mocked(mockPkgRepo.findById).mockResolvedValue(samplePublishedPackage);
      vi.mocked(mockItineraryRepo.createMany).mockResolvedValue(sampleItineraryDays);
      vi.mocked(mockItineraryRepo.deleteByPackageId).mockResolvedValue(1);

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/packages/${samplePublishedPackage.id}/itinerary`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          itineraryDays: [
            {
              dayNumber: 1,
              title: 'Arrival in Srinagar & Shikara Ride',
              activityDescription:
                'Arrive at Srinagar airport, transfer to Houseboat, enjoy evening Shikara ride on Dal Lake.',
              mealsIncluded: ['DINNER'],
              accommodationNotes: 'Deluxe Houseboat',
            },
            {
              dayNumber: 2,
              title: 'Srinagar to Gulmarg Excursion',
              activityDescription:
                'Full day trip to Gulmarg, meadow of flowers and Gondola cable car ride.',
              mealsIncluded: ['BREAKFAST', 'DINNER'],
              accommodationNotes: 'Gulmarg Resort',
            },
            {
              dayNumber: 3,
              title: 'Gulmarg to Pahalgam Valley',
              activityDescription: 'Transfer to Pahalgam via saffron fields and apple orchards.',
              mealsIncluded: ['BREAKFAST', 'DINNER'],
              accommodationNotes: 'Pahalgam Hotel',
            },
            {
              dayNumber: 4,
              title: 'Pahalgam Exploration to Srinagar',
              activityDescription: 'Explore Aru Valley and return back to Srinagar hotel.',
              mealsIncluded: ['BREAKFAST', 'DINNER'],
              accommodationNotes: 'Srinagar Luxury Hotel',
            },
            {
              dayNumber: 5,
              title: 'Sonamarg Day Trip',
              activityDescription:
                'Excursion to Sonamarg, the Meadow of Gold and Thajiwas Glacier.',
              mealsIncluded: ['BREAKFAST', 'DINNER'],
              accommodationNotes: 'Srinagar Luxury Hotel',
            },
            {
              dayNumber: 6,
              title: 'Departure from Srinagar',
              activityDescription:
                'Morning Mughal Gardens tour and departure transfer to Srinagar Airport.',
              mealsIncluded: ['BREAKFAST'],
              accommodationNotes: null,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(6);
    });

    it('POST /api/v1/admin/packages/:id/publish succeeds when BR-PKG-001 requirements are fully met', async () => {
      const draftPkg = { ...samplePublishedPackage, isPublished: false };
      vi.mocked(mockPkgRepo.findById).mockResolvedValue(draftPkg);
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);
      vi.mocked(mockPkgRepo.update).mockResolvedValue({
        ...draftPkg,
        isPublished: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${draftPkg.id}/publish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isPublished).toBe(true);
    });

    it('POST /api/v1/admin/packages/:id/publish fails (400 BAD_REQUEST) when BR-PKG-001 is violated (itinerary incomplete)', async () => {
      const draftPkg = { ...samplePublishedPackage, isPublished: false };
      vi.mocked(mockPkgRepo.findById).mockResolvedValue(draftPkg);
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      // 0 days provided (BR-PKG-001 requires at least 1 itinerary day)
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue([]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${draftPkg.id}/publish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('BR-PKG-001');
    });

    it('POST /api/v1/admin/packages/:id/publish fails when destination is not published', async () => {
      const draftPkg = { ...samplePublishedPackage, isPublished: false };
      vi.mocked(mockPkgRepo.findById).mockResolvedValue(draftPkg);
      vi.mocked(mockDestRepo.findById).mockResolvedValue(sampleUnpublishedDestination);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${draftPkg.id}/publish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('BR-PKG-001');
    });

    it('POST /api/v1/admin/packages/:id/unpublish unpublishes a tour package', async () => {
      vi.mocked(mockPkgRepo.findById).mockResolvedValue(samplePublishedPackage);
      vi.mocked(mockDestRepo.findById).mockResolvedValue(samplePublishedDestination);
      vi.mocked(mockThemeRepo.findById).mockResolvedValue(sampleTheme);
      vi.mocked(mockItineraryRepo.listByPackageId).mockResolvedValue(sampleItineraryDays);
      vi.mocked(mockPkgRepo.update).mockResolvedValue({
        ...samplePublishedPackage,
        isPublished: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/packages/${samplePublishedPackage.id}/unpublish`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isPublished).toBe(false);
    });
  });

  // =========================================================================
  // 6. VALIDATION FAILURES & ERROR HANDLING
  // =========================================================================
  describe('Input Validation & Canonical Error Handling', () => {
    it('rejects invalid UUID in path parameter with 400 VALIDATION_ERROR', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations/not-a-valid-uuid',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects malformed creation body with 400 VALIDATION_ERROR and field-level details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/destinations',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          // Missing required fields
          cityName: '',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBeGreaterThan(0);
    });
  });
});
