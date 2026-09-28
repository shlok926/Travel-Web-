import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  UserRepository,
  UserEntity,
} from '../../backend/src/modules/auth/repositories/user.repository.js';
import {
  HeroSliderRepository,
  HeroSliderEntity,
} from '../../backend/src/modules/cms/repositories/heroSlider.repository.js';
import {
  CmsPageRepository,
  CmsPageEntity,
} from '../../backend/src/modules/cms/repositories/cmsPage.repository.js';
import { HeroSliderService } from '../../backend/src/modules/cms/services/heroSlider.service.js';
import { CmsPageService } from '../../backend/src/modules/cms/services/cmsPage.service.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 7 Step 4 — CMS REST APIs & RBAC Guardrails', () => {
  let app: FastifyInstance;
  let mockUserRepo: UserRepository;
  let mockSliderRepo: HeroSliderRepository;
  let mockPageRepo: CmsPageRepository;
  let heroSliderService: HeroSliderService;
  let cmsPageService: CmsPageService;

  const config = loadEnv();

  const sampleAdmin: UserEntity = {
    id: '99999999-9999-4999-8999-999999999999',
    email: 'admin.cms@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Admin User',
    mobileContact: '+919999999999',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleCustomer: UserEntity = {
    id: '88888888-8888-4888-8888-888888888888',
    email: 'customer.cms@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Regular Customer',
    mobileContact: '+918888888888',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleSlider: HeroSliderEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Explore Swiss Alps',
    subtitle: 'Unforgettable winter holidays',
    imageUrl: 'https://cdn.example.com/sliders/alps.webp',
    ctaLabel: 'Book Now',
    ctaUrl: '/packages/swiss-alps',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    updatedAt: new Date('2026-09-28T00:00:00.000Z'),
  };

  const samplePage: CmsPageEntity = {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'about-us',
    title: 'About Young Tours & Travels',
    contentHtml: '<h1>About Us</h1><p>We provide curated premium tours.</p>',
    metaDescription: 'Learn more about Young Tours & Travels mission and history.',
    isPublished: true,
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    updatedAt: new Date('2026-09-28T00:00:00.000Z'),
  };

  function createToken(user: UserEntity): string {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      config.JWT_PRIVATE_KEY,
      { expiresInSeconds: 3600 },
    );
  }

  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    adminToken = createToken(sampleAdmin);
    customerToken = createToken(sampleCustomer);

    mockUserRepo = {
      findById: vi.fn(async (id: string) => {
        if (id === sampleAdmin.id) return sampleAdmin;
        if (id === sampleCustomer.id) return sampleCustomer;
        return null;
      }),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    mockSliderRepo = {
      create: vi.fn(async (input) => ({
        id: sampleSlider.id,
        ...input,
        subtitle: input.subtitle ?? null,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: vi.fn(async (id: string) => (id === sampleSlider.id ? sampleSlider : null)),
      findAll: vi.fn(async () => ({ items: [sampleSlider], total: 1 })),
      update: vi.fn(async (id: string, input) => {
        if (id !== sampleSlider.id) return null;
        return { ...sampleSlider, ...input, updatedAt: new Date() };
      }),
      delete: vi.fn(async (id: string) => id === sampleSlider.id),
    } as unknown as HeroSliderRepository;

    mockPageRepo = {
      create: vi.fn(async (input) => ({
        id: samplePage.id,
        ...input,
        metaDescription: input.metaDescription ?? null,
        isPublished: input.isPublished ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: vi.fn(async (id: string) => (id === samplePage.id ? samplePage : null)),
      findBySlug: vi.fn(async (slug: string) => (slug === samplePage.slug ? samplePage : null)),
      findAll: vi.fn(async () => ({ items: [samplePage], total: 1 })),
      update: vi.fn(async (id: string, input) => {
        if (id !== samplePage.id) return null;
        return { ...samplePage, ...input, updatedAt: new Date() };
      }),
      delete: vi.fn(async (id: string) => id === samplePage.id),
    } as unknown as CmsPageRepository;

    heroSliderService = new HeroSliderService(mockSliderRepo);
    cmsPageService = new CmsPageService(mockPageRepo);

    const created = await createApp({
      config,
      userRepo: mockUserRepo,
      heroSliderRepo: mockSliderRepo,
      heroSliderService,
      cmsPageRepo: mockPageRepo,
      cmsPageService,
    });

    app = created.app;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ============================================================
  // 1. HERO SLIDER ADMIN & PUBLIC REST APIs
  // ============================================================

  describe('Hero Slider REST APIs', () => {
    it('POST /api/v1/admin/cms/sliders — creates slider when authenticated as ADMIN', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Explore Swiss Alps',
          subtitle: 'Winter holidays',
          imageUrl: 'https://cdn.example.com/sliders/alps.webp',
          ctaLabel: 'Book Now',
          ctaUrl: '/packages/swiss-alps',
          sortOrder: 1,
          isActive: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Explore Swiss Alps');
      expect(json.data.imageUrl).toBe('https://cdn.example.com/sliders/alps.webp');
    });

    it('POST /api/v1/admin/cms/sliders — returns 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        payload: {
          title: 'Explore Swiss Alps',
          imageUrl: 'https://cdn.example.com/sliders/alps.webp',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/v1/admin/cms/sliders — returns 403 when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          title: 'Explore Swiss Alps',
          imageUrl: 'https://cdn.example.com/sliders/alps.webp',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('POST /api/v1/admin/cms/sliders — returns 400 on validation failure (missing required title)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/sliders',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          imageUrl: 'https://cdn.example.com/sliders/alps.webp',
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/admin/cms/sliders — returns paginated list for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/sliders?page=1&limit=10&isActive=true',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.totalItems).toBe(1);
    });

    it('GET /api/v1/admin/cms/sliders/:id — returns single slider by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/cms/sliders/${sampleSlider.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleSlider.id);
      expect(json.data.title).toBe(sampleSlider.title);
    });

    it('GET /api/v1/admin/cms/sliders/:id — returns 404 when slider not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/sliders/00000000-0000-4000-8000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('HERO_SLIDER_NOT_FOUND');
    });

    it('PATCH /api/v1/admin/cms/sliders/:id — updates slider fields', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/cms/sliders/${sampleSlider.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Updated Swiss Alps Banner',
          sortOrder: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Updated Swiss Alps Banner');
      expect(json.data.sortOrder).toBe(5);
    });

    it('DELETE /api/v1/admin/cms/sliders/:id — deletes slider by ID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/cms/sliders/${sampleSlider.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
    });

    it('GET /api/v1/cms/sliders — public endpoint returns active sliders without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cms/sliders',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  // ============================================================
  // 2. CMS PAGES ADMIN & PUBLIC REST APIs
  // ============================================================

  describe('CMS Static Pages REST APIs', () => {
    it('POST /api/v1/admin/cms/pages — creates page when authenticated as ADMIN', async () => {
      vi.mocked(mockPageRepo.findBySlug).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: 'privacy-policy',
          title: 'Privacy Policy',
          contentHtml: '<h1>Privacy Policy</h1><p>We respect your privacy.</p>',
          metaDescription: 'Our privacy practices.',
          isPublished: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe('privacy-policy');
      expect(json.data.contentHtml).toBe('<h1>Privacy Policy</h1><p>We respect your privacy.</p>');
    });

    it('POST /api/v1/admin/cms/pages — returns 409 CONFLICT on duplicate slug', async () => {
      vi.mocked(mockPageRepo.findBySlug).mockResolvedValueOnce(samplePage);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/cms/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: 'about-us',
          title: 'Duplicate About Us',
          contentHtml: '<p>Content</p>',
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.error.code).toBe('CONFLICT');
    });

    it('GET /api/v1/admin/cms/pages — returns paginated pages list for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/pages?page=1&limit=20&isPublished=true',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('GET /api/v1/admin/cms/pages/:slug — returns static page by slug', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cms/pages/about-us',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe('about-us');
    });

    it('PATCH /api/v1/admin/cms/pages/:id — updates static page by ID', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/cms/pages/${samplePage.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Updated About Us Title',
          isPublished: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Updated About Us Title');
      expect(json.data.isPublished).toBe(false);
    });

    it('PUT /api/v1/admin/cms/pages/:slug — updates static page by slug', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/cms/pages/about-us',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Revised About Us',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Revised About Us');
    });

    it('DELETE /api/v1/admin/cms/pages/:id — deletes page by ID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/cms/pages/${samplePage.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
    });

    it('GET /api/v1/cms/pages/:slug — public endpoint returns published page without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cms/pages/about-us',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe('about-us');
      expect(json.data.contentHtml).toBe(samplePage.contentHtml);
    });

    it('GET /api/v1/cms/pages/:slug — public endpoint returns 404 if page is unpublished', async () => {
      vi.mocked(mockPageRepo.findBySlug).mockResolvedValueOnce({
        ...samplePage,
        isPublished: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cms/pages/about-us',
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('CMS_PAGE_NOT_FOUND');
    });
  });
});
