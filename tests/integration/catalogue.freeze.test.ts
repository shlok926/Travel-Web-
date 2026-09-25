import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { RedisService } from '../../backend/src/infrastructure/redis/index.js';
import {
  UserRepository,
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
  CataloguePublicationService,
} from '../../backend/src/modules/catalogue/index.js';
import {
  SEED_THEMES,
  SEED_DESTINATIONS,
  SEED_PACKAGES,
} from '../../backend/src/infrastructure/database/seeds/seedCatalogue.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 3 — Final Integration, Cross-Layer Audit & Freeze Verification', () => {
  let app: FastifyInstance;
  let mockDb: DatabaseService;
  let mockRedis: RedisService;
  let mockUserRepo: UserRepository;
  let mockTokenRepo: RefreshTokenRepository;
  let authService: AuthService;

  let destRepo: DestinationRepository;
  let themeRepo: ThemeRepository;
  let pkgRepo: TourPackageRepository;
  let itineraryRepo: ItineraryRepository;

  let destService: DestinationService;
  let themeService: ThemeService;
  let pkgService: TourPackageService;

  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4011',
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
  });

  const adminToken = JwtSecurity.sign(
    { userId: 'usr_admin_1', email: 'admin@youngtoursandtravels.com', role: 'ADMIN' },
    config.JWT_PRIVATE_KEY,
  );

  const customerToken = JwtSecurity.sign(
    { userId: 'usr_cust_1', email: 'cust@example.com', role: 'CUSTOMER' },
    config.JWT_PRIVATE_KEY,
  );

  beforeEach(async () => {
    mockDb = {
      withTransaction: vi.fn(async (callback) => callback({} as any)),
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as DatabaseService;

    mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as RedisService;

    mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(async (id: string) => {
        if (id === 'usr_admin_1') {
          return {
            id: 'usr_admin_1',
            email: 'admin@youngtoursandtravels.com',
            role: 'ADMIN',
            fullName: 'Admin',
            isActive: true,
            passwordHash: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (id === 'usr_cust_1') {
          return {
            id: 'usr_cust_1',
            email: 'cust@example.com',
            role: 'CUSTOMER',
            fullName: 'Customer',
            isActive: true,
            passwordHash: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
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

    destRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listPublished: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
      countByDestinationId: vi.fn().mockResolvedValue(0),
    } as unknown as DestinationRepository;

    themeRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
    } as unknown as ThemeRepository;

    pkgRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listPublished: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn().mockResolvedValue(false),
      countByDestinationId: vi.fn().mockResolvedValue(0),
      countByThemeId: vi.fn().mockResolvedValue(0),
    } as unknown as TourPackageRepository;

    itineraryRepo = {
      listByPackageId: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue([]),
      replaceForPackage: vi.fn(),
      deleteByPackageId: vi.fn().mockResolvedValue(1),
    } as unknown as ItineraryRepository;

    destService = new DestinationService(destRepo, pkgRepo);
    themeService = new ThemeService(themeRepo);
    pkgService = new TourPackageService(pkgRepo, destRepo, themeRepo, itineraryRepo, mockDb);

    const instance = await createApp({
      config,
      db: mockDb,
      redis: mockRedis,
      userRepo: mockUserRepo,
      refreshTokenRepo: mockTokenRepo,
      authService,
      destinationRepo: destRepo,
      themeRepo,
      tourPackageRepo: pkgRepo,
      itineraryRepo,
      destinationService: destService,
      themeService,
      tourPackageService: pkgService,
    });

    app = instance.app;
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. COMPLETE SEED DATASET INTEGRATION INVARIANTS
  // ==========================================================================
  describe('1. Seed Dataset End-to-End Invariants', () => {
    it('seed dataset has exact counts: 7 themes, 10 destinations, 12 packages, 61 itineraries', () => {
      expect(SEED_THEMES).toHaveLength(7);
      expect(SEED_DESTINATIONS).toHaveLength(10);
      expect(SEED_PACKAGES).toHaveLength(12);

      const totalItineraries = SEED_PACKAGES.reduce((acc, p) => acc + p.itineraries.length, 0);
      expect(totalItineraries).toBe(61);
    });

    it('all seed packages satisfy BR-PKG-001 publication invariant against seed destinations', () => {
      const destMap = new Map(SEED_DESTINATIONS.map((d) => [d.id, d]));

      for (const pkg of SEED_PACKAGES) {
        const dest = destMap.get(pkg.destinationId)!;
        expect(dest).toBeDefined();
        expect(dest.isPublished).toBe(true);

        const result = CataloguePublicationService.validatePackagePublication(
          { ...pkg, createdAt: new Date(), updatedAt: new Date() },
          { ...dest, createdAt: new Date(), updatedAt: new Date() },
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

  // ==========================================================================
  // 2. MONEY & CURRENCY INTEGRITY
  // ==========================================================================
  describe('2. Money & Currency Cross-Layer Integrity', () => {
    it('guarantees integer minor-unit prices across all packages with no floating points', () => {
      for (const pkg of SEED_PACKAGES) {
        expect(Number.isInteger(pkg.baseAdultPrice)).toBe(true);
        expect(pkg.baseAdultPrice % 1).toBe(0);
        expect(pkg.baseAdultPrice).toBeGreaterThan(0);

        expect(Number.isInteger(pkg.baseChildPrice)).toBe(true);
        expect(pkg.baseChildPrice % 1).toBe(0);
        expect(pkg.baseChildPrice).toBeGreaterThanOrEqual(0);

        expect(['INR', 'USD']).toContain(pkg.currency);
      }
    });

    it('rejects tour package creation with negative prices via API schema validation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/packages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destinationId: '22222222-2222-4222-8222-222222222001',
          title: 'Negative Price Tour',
          slug: 'negative-price-tour',
          shortDescription: 'Short description for negative price test',
          description: 'Full description text for negative price tour test',
          durationDays: 3,
          durationNights: 2,
          originCity: 'Delhi',
          destinationCity: 'Srinagar',
          baseAdultPrice: -5000,
          currency: 'INR',
          heroImageUrl: 'https://example.com/hero.jpg',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // 3. PUBLICATION GATE & VISIBILITY INVARIANTS
  // ==========================================================================
  describe('3. Publication Gate & Public API Leak Prevention', () => {
    it('public package endpoint rejects unpublished package with 404 NOT_FOUND', async () => {
      vi.spyOn(pkgRepo, 'findBySlug').mockResolvedValueOnce({
        id: 'pkg-unpub-1',
        destinationId: 'dest-1',
        themeId: null,
        slug: 'secret-draft-tour',
        title: 'Draft Tour',
        shortDescription: 'Draft short desc',
        description: 'Draft description',
        durationDays: 3,
        durationNights: 2,
        originCity: 'Delhi',
        destinationCity: 'Agra',
        baseAdultPrice: 1500000,
        baseChildPrice: 0,
        currency: 'INR',
        heroImageUrl: 'https://example.com/hero.jpg',
        galleryUrls: [],
        inclusions: [],
        exclusions: [],
        accommodationTiers: ['STANDARD'],
        mealPlans: ['BREAKFAST'],
        isPublished: false, // UNPUBLISHED
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/secret-draft-tour',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('publication gate blocks publishing package if destination is unpublished', async () => {
      vi.spyOn(pkgRepo, 'findById').mockResolvedValueOnce({
        id: 'pkg-1',
        destinationId: 'dest-unpub-1',
        themeId: null,
        slug: 'tour-under-unpub-dest',
        title: 'Tour Under Unpub Dest',
        shortDescription: 'Valid short description',
        description: 'Valid full description',
        durationDays: 4,
        durationNights: 3,
        originCity: 'Mumbai',
        destinationCity: 'Goa',
        baseAdultPrice: 2000000,
        baseChildPrice: 1000000,
        currency: 'INR',
        heroImageUrl: 'https://example.com/hero.jpg',
        galleryUrls: [],
        inclusions: ['Breakfast'],
        exclusions: ['Flight'],
        accommodationTiers: ['STANDARD'],
        mealPlans: ['BREAKFAST'],
        isPublished: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(destRepo, 'findById').mockResolvedValueOnce({
        id: 'dest-unpub-1',
        slug: 'unpub-goa',
        cityName: 'Panaji',
        country: 'India',
        description: 'Unpublished destination description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        heroImageUrl: null,
        isFeatured: false,
        isPublished: false, // DESTINATION UNPUBLISHED
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(itineraryRepo, 'listByPackageId').mockResolvedValueOnce([
        {
          id: 'it-1',
          packageId: 'pkg-1',
          dayNumber: 1,
          title: 'Day 1',
          activityDescription: 'Arrival and checkin',
          mealsIncluded: ['DINNER'],
          accommodationNotes: 'Hotel',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/packages/pkg-1/publish',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // 4. RBAC & SECURITY GATES
  // ==========================================================================
  describe('4. Authentication & RBAC Boundary Invariants', () => {
    it('unauthenticated guest is rejected from admin catalogue endpoints with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('customer role is rejected from admin catalogue endpoints with 403 FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('admin role is allowed to access admin catalogue endpoints', async () => {
      vi.spyOn(destRepo, 'list').mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/destinations',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  // ==========================================================================
  // 5. CANONICAL ERROR ENVELOPE FORMAT
  // ==========================================================================
  describe('5. Canonical Error Envelope Invariant', () => {
    it('returns exact frozen error envelope shape on 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/themes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'X' }, // Missing required fields and too short
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);

      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('details');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('timestamp');
      expect(body.meta).toHaveProperty('requestId');
    });
  });
});
