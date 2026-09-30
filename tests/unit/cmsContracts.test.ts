import { describe, it, expect } from 'vitest';
import {
  createHeroSliderSchema,
  updateHeroSliderSchema,
  heroSliderListQuerySchema,
  heroSliderIdParamSchema,
  createCmsPageSchema,
  updateCmsPageSchema,
  cmsPageListQuerySchema,
  cmsPageSlugParamSchema,
  cmsPageIdParamSchema,
  CreateHeroSliderDto,
  CreateCmsPageDto,
} from '../../shared/src/index.js';

describe('Phase 7 Step 2 — CMS Shared Contracts & Zod Validation Schemas', () => {
  // ============================================================
  // 1. Hero Slider Contracts & Validation
  // ============================================================
  describe('1. Hero Slider Schemas', () => {
    const validSliderPayload: CreateHeroSliderDto = {
      title: 'Discover the Swiss Alps',
      subtitle: 'Experience breathtaking alpine landscapes and luxury rail journeys.',
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
      ctaLabel: 'View Swiss Tours',
      ctaUrl: '/packages?destination=switzerland',
      sortOrder: 1,
      isActive: true,
    };

    it('1.1 valid hero slider payload passes validation', () => {
      const result = createHeroSliderSchema.safeParse(validSliderPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Discover the Swiss Alps');
        expect(result.data.imageUrl).toBe(validSliderPayload.imageUrl);
        expect(result.data.sortOrder).toBe(1);
        expect(result.data.isActive).toBe(true);
      }
    });

    it('1.2 applies default values for sortOrder (0) and isActive (true)', () => {
      const minimalPayload = {
        title: 'Bespoke Journeys',
        imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1',
      };

      const result = createHeroSliderSchema.safeParse(minimalPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
        expect(result.data.isActive).toBe(true);
      }
    });

    it('1.3 accepts both absolute http/https URLs and relative paths for ctaUrl', () => {
      const relativeResult = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        ctaUrl: '/destinations/europe',
      });
      expect(relativeResult.success).toBe(true);

      const absoluteResult = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        ctaUrl: 'https://youngtoursandtravels.com/deals',
      });
      expect(absoluteResult.success).toBe(true);
    });

    it('1.4 rejects invalid image URLs', () => {
      const result = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        imageUrl: 'not-a-valid-url',
      });
      expect(result.success).toBe(false);
    });

    it('1.5 rejects negative sortOrder or non-integer', () => {
      const negativeResult = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        sortOrder: -1,
      });
      expect(negativeResult.success).toBe(false);

      const floatResult = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        sortOrder: 1.5,
      });
      expect(floatResult.success).toBe(false);
    });

    it('1.6 rejects unknown properties on strict create payload', () => {
      const result = createHeroSliderSchema.safeParse({
        ...validSliderPayload,
        extraProperty: 'malicious',
      });
      expect(result.success).toBe(false);
    });

    it('1.7 validates update payload with partial fields', () => {
      const partialUpdate = {
        title: 'Updated Swiss Tours',
        isActive: false,
      };
      const result = updateHeroSliderSchema.safeParse(partialUpdate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Updated Swiss Tours');
        expect(result.data.isActive).toBe(false);
      }
    });

    it('1.8 validates heroSliderListQuerySchema with defaults and boolean transforms', () => {
      const emptyQuery = heroSliderListQuerySchema.parse({});
      expect(emptyQuery.page).toBe(1);
      expect(emptyQuery.limit).toBe(20);
      expect(emptyQuery.isActive).toBeUndefined();

      const filteredQuery = heroSliderListQuerySchema.parse({
        page: '2',
        limit: '10',
        isActive: 'true',
      });
      expect(filteredQuery.page).toBe(2);
      expect(filteredQuery.limit).toBe(10);
      expect(filteredQuery.isActive).toBe(true);
    });

    it('1.9 validates heroSliderIdParamSchema with UUID format', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const validResult = heroSliderIdParamSchema.safeParse({ id: validUuid });
      expect(validResult.success).toBe(true);

      const invalidResult = heroSliderIdParamSchema.safeParse({ id: 'invalid-id' });
      expect(invalidResult.success).toBe(false);
    });
  });

  // ============================================================
  // 2. CMS Page Contracts & Validation
  // ============================================================
  describe('2. CMS Page Schemas', () => {
    const validPagePayload: CreateCmsPageDto = {
      slug: 'about-us',
      title: 'About Young Tours & Travels',
      contentHtml:
        '<h1>Our Story</h1><p>Crafting bespoke luxury travel experiences since 2010.</p>',
      metaDescription: 'Learn about Young Tours & Travels, our heritage and philosophy.',
      isPublished: true,
    };

    it('2.1 valid CMS page payload passes validation and normalizes slug', () => {
      const result = createCmsPageSchema.safeParse({
        ...validPagePayload,
        slug: '  ABOUT-US  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('about-us');
        expect(result.data.title).toBe(validPagePayload.title);
        expect(result.data.contentHtml).toBe(validPagePayload.contentHtml);
        expect(result.data.isPublished).toBe(true);
      }
    });

    it('2.2 applies default isPublished value (true)', () => {
      const minimalPayload = {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        contentHtml: '<p>Your privacy is important to us.</p>',
      };
      const result = createCmsPageSchema.safeParse(minimalPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPublished).toBe(true);
      }
    });

    it('2.3 rejects invalid slugs with special characters, spaces, or leading/trailing hyphens', () => {
      expect(createCmsPageSchema.safeParse({ ...validPagePayload, slug: 'about us' }).success).toBe(
        false,
      );
      expect(
        createCmsPageSchema.safeParse({ ...validPagePayload, slug: '-about-us' }).success,
      ).toBe(false);
      expect(
        createCmsPageSchema.safeParse({ ...validPagePayload, slug: 'about-us-' }).success,
      ).toBe(false);
      expect(createCmsPageSchema.safeParse({ ...validPagePayload, slug: 'about_us' }).success).toBe(
        false,
      );
      expect(createCmsPageSchema.safeParse({ ...validPagePayload, slug: 'a' }).success).toBe(false); // min 2
    });

    it('2.4 rejects empty contentHtml or title', () => {
      expect(createCmsPageSchema.safeParse({ ...validPagePayload, title: '' }).success).toBe(false);
      expect(createCmsPageSchema.safeParse({ ...validPagePayload, contentHtml: '' }).success).toBe(
        false,
      );
    });

    it('2.5 validates partial CMS page update schema', () => {
      const partialUpdate = {
        title: 'Updated Terms of Service',
        contentHtml: '<p>New terms effective immediately.</p>',
        isPublished: false,
      };
      const result = updateCmsPageSchema.safeParse(partialUpdate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Updated Terms of Service');
        expect(result.data.isPublished).toBe(false);
      }
    });

    it('2.6 validates cmsPageListQuerySchema with pagination defaults', () => {
      const query = cmsPageListQuerySchema.parse({ page: '3', limit: '15', isPublished: '0' });
      expect(query.page).toBe(3);
      expect(query.limit).toBe(15);
      expect(query.isPublished).toBe(false);
    });

    it('2.7 validates cmsPageSlugParamSchema and cmsPageIdParamSchema', () => {
      expect(cmsPageSlugParamSchema.safeParse({ slug: 'terms-and-conditions' }).success).toBe(true);
      expect(cmsPageSlugParamSchema.safeParse({ slug: 'INVALID SLUG!' }).success).toBe(false);

      expect(
        cmsPageIdParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success,
      ).toBe(true);
      expect(cmsPageIdParamSchema.safeParse({ id: '12345' }).success).toBe(false);
    });
  });
});
