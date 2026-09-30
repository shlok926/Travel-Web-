import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  HeroSliderRepository,
  CmsPageRepository,
} from '../../backend/src/modules/cms/repositories/index.js';
import { HeroSliderService, CmsPageService } from '../../backend/src/modules/cms/services/index.js';
import { AppError } from '../../shared/src/index.js';

describe('Phase 7 Step 3 — CMS Repositories & Services Unit Tests', () => {
  let mockDb: any;
  let heroSliderRepo: HeroSliderRepository;
  let cmsPageRepo: CmsPageRepository;
  let heroSliderService: HeroSliderService;
  let cmsPageService: CmsPageService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    heroSliderRepo = new HeroSliderRepository(mockDb as unknown as DatabaseService);
    cmsPageRepo = new CmsPageRepository(mockDb as unknown as DatabaseService);
    heroSliderService = new HeroSliderService(heroSliderRepo);
    cmsPageService = new CmsPageService(cmsPageRepo);
  });

  // ============================================================
  // 1. Hero Slider Repository & Service
  // ============================================================
  describe('HeroSliderRepository & HeroSliderService', () => {
    const sampleSliderRow = {
      id: 'a0000000-0000-0000-0000-000000000001',
      title: 'Explore Kashmir Paradise',
      subtitle: 'Experience breathtaking snowfall in Gulmarg',
      image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      cta_label: 'Book Kashmir Tour',
      cta_url: '/packages/kashmir-paradise',
      sort_order: 1,
      is_active: true,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };

    it('should create a hero slider successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleSliderRow], rowCount: 1 });

      const result = await heroSliderService.createSlider({
        title: 'Explore Kashmir Paradise',
        subtitle: 'Experience breathtaking snowfall in Gulmarg',
        imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
        ctaLabel: 'Book Kashmir Tour',
        ctaUrl: '/packages/kashmir-paradise',
        sortOrder: 1,
        isActive: true,
      });

      expect(result.id).toBe(sampleSliderRow.id);
      expect(result.title).toBe(sampleSliderRow.title);
      expect(result.sortOrder).toBe(1);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should find hero slider by ID', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleSliderRow], rowCount: 1 });

      const result = await heroSliderService.getSliderById(sampleSliderRow.id);
      expect(result.id).toBe(sampleSliderRow.id);
      expect(result.title).toBe(sampleSliderRow.title);
    });

    it('should throw NOT_FOUND (HERO_SLIDER_NOT_FOUND) when slider does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        heroSliderService.getSliderById('a0000000-0000-0000-0000-000000000099'),
      ).rejects.toThrow(AppError);
    });

    it('should list sliders with pagination and ordering', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 }) // count query
        .mockResolvedValueOnce({ rows: [sampleSliderRow], rowCount: 1 }); // list query

      const result = await heroSliderService.listSliders({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should update hero slider partially', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleSliderRow], rowCount: 1 }) // findById
        .mockResolvedValueOnce({
          rows: [{ ...sampleSliderRow, title: 'Updated Title' }],
          rowCount: 1,
        }); // update

      const result = await heroSliderService.updateSlider(sampleSliderRow.id, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should delete hero slider', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleSliderRow], rowCount: 1 }) // findById
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // delete

      const result = await heroSliderService.deleteSlider(sampleSliderRow.id);
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // 2. CMS Page Repository & Service
  // ============================================================
  describe('CmsPageRepository & CmsPageService', () => {
    const samplePageRow = {
      id: 'c0000000-0000-0000-0000-000000000001',
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content_html: '<h1>Privacy Policy</h1><p>We respect your privacy.</p>',
      meta_description: 'Read our comprehensive privacy policy',
      is_published: true,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };

    it('should create a CMS page successfully preserving raw content_html', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing slug
        .mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 }); // insert

      const result = await cmsPageService.createPage({
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        contentHtml: '<h1>Privacy Policy</h1><p>We respect your privacy.</p>',
        metaDescription: 'Read our comprehensive privacy policy',
        isPublished: true,
      });

      expect(result.id).toBe(samplePageRow.id);
      expect(result.slug).toBe('privacy-policy');
      expect(result.contentHtml).toBe(samplePageRow.content_html);
    });

    it('should reject creation if slug already exists with CONFLICT (409)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 }); // findBySlug

      await expect(
        cmsPageService.createPage({
          slug: 'privacy-policy',
          title: 'Privacy Policy',
          contentHtml: '<p>Content</p>',
        }),
      ).rejects.toThrow(AppError);
    });

    it('should retrieve CMS page by slug', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 });

      const result = await cmsPageService.getPageBySlug('privacy-policy');
      expect(result.slug).toBe('privacy-policy');
      expect(result.title).toBe('Privacy Policy');
    });

    it('should throw NOT_FOUND (CMS_PAGE_NOT_FOUND) when slug is not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(cmsPageService.getPageBySlug('non-existent-page')).rejects.toThrow(AppError);
    });

    it('should list CMS pages with publication filter and pagination', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 }) // count
        .mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 }); // list

      const result = await cmsPageService.listPages({ page: 1, limit: 10, isPublished: true });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]?.slug).toBe('privacy-policy');
    });

    it('should update CMS page and prevent duplicate slug on collision', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 }) // findByIdOrSlug
        .mockResolvedValueOnce({
          rows: [{ ...samplePageRow, id: 'c0000000-0000-0000-0000-000000000002', slug: 'terms' }],
          rowCount: 1,
        }); // findBySlug conflict

      await expect(cmsPageService.updatePage('privacy-policy', { slug: 'terms' })).rejects.toThrow(
        AppError,
      );
    });

    it('should delete CMS page', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [samplePageRow], rowCount: 1 }) // findByIdOrSlug
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // delete

      const result = await cmsPageService.deletePage('privacy-policy');
      expect(result.success).toBe(true);
    });
  });
});
