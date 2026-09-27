import { z } from 'zod';

// Slug regex: lowercase alphanumeric characters and single hyphens, no leading/trailing hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ============================================================
// 1. Hero Slider Schemas
// ============================================================

/**
 * createHeroSliderSchema: Validates `POST /api/v1/admin/cms/sliders` creation payload.
 */
export const createHeroSliderSchema = z
  .object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(128, 'Title must not exceed 128 characters'),

    subtitle: z
      .string()
      .trim()
      .max(256, 'Subtitle must not exceed 256 characters')
      .nullable()
      .optional(),

    imageUrl: z
      .string({ required_error: 'Image URL is required' })
      .trim()
      .url('Image URL must be a valid URL')
      .max(512, 'Image URL must not exceed 512 characters'),

    ctaLabel: z
      .string()
      .trim()
      .max(64, 'CTA label must not exceed 64 characters')
      .nullable()
      .optional(),

    ctaUrl: z
      .string()
      .trim()
      .max(256, 'CTA URL must not exceed 256 characters')
      .refine(
        (val) => {
          if (!val) return true;
          return val.startsWith('/') || /^https?:\/\//.test(val);
        },
        {
          message:
            'CTA URL must be a valid absolute URL (http/https) or relative path starting with /',
        },
      )
      .nullable()
      .optional(),

    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .nonnegative('Sort order cannot be negative')
      .optional()
      .default(0),

    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateHeroSliderInput = z.input<typeof createHeroSliderSchema>;

/**
 * updateHeroSliderSchema: Validates `PATCH /api/v1/admin/cms/sliders/:id` update payload.
 */
export const updateHeroSliderSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(128, 'Title must not exceed 128 characters')
      .optional(),

    subtitle: z
      .string()
      .trim()
      .max(256, 'Subtitle must not exceed 256 characters')
      .nullable()
      .optional(),

    imageUrl: z
      .string()
      .trim()
      .url('Image URL must be a valid URL')
      .max(512, 'Image URL must not exceed 512 characters')
      .optional(),

    ctaLabel: z
      .string()
      .trim()
      .max(64, 'CTA label must not exceed 64 characters')
      .nullable()
      .optional(),

    ctaUrl: z
      .string()
      .trim()
      .max(256, 'CTA URL must not exceed 256 characters')
      .refine(
        (val) => {
          if (!val) return true;
          return val.startsWith('/') || /^https?:\/\//.test(val);
        },
        {
          message:
            'CTA URL must be a valid absolute URL (http/https) or relative path starting with /',
        },
      )
      .nullable()
      .optional(),

    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .nonnegative('Sort order cannot be negative')
      .optional(),

    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateHeroSliderInput = z.input<typeof updateHeroSliderSchema>;

/**
 * heroSliderListQuerySchema: Validates query parameters for listing sliders.
 */
export const heroSliderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .optional()
    .default(20),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
    .optional(),
});

export type HeroSliderListQueryInput = z.infer<typeof heroSliderListQuerySchema>;

/**
 * heroSliderIdParamSchema: Validates `:id` UUID route parameter.
 */
export const heroSliderIdParamSchema = z
  .object({
    id: z.string({ required_error: 'Slider ID is required' }).uuid('Invalid slider ID format'),
  })
  .strict();

export type HeroSliderIdParamInput = z.infer<typeof heroSliderIdParamSchema>;

// ============================================================
// 2. CMS Page Schemas
// ============================================================

/**
 * createCmsPageSchema: Validates `POST /api/v1/admin/cms/pages` creation payload.
 */
export const createCmsPageSchema = z
  .object({
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(64, 'Slug must not exceed 64 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      ),

    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(128, 'Title must not exceed 128 characters'),

    contentHtml: z
      .string({ required_error: 'Content HTML is required' })
      .trim()
      .min(1, 'Content HTML cannot be empty'),

    metaDescription: z
      .string()
      .trim()
      .max(256, 'Meta description must not exceed 256 characters')
      .nullable()
      .optional(),

    isPublished: z.boolean().optional().default(true),
  })
  .strict();

export type CreateCmsPageInput = z.input<typeof createCmsPageSchema>;

/**
 * updateCmsPageSchema: Validates `PATCH/PUT /api/v1/admin/cms/pages/:slug` update payload.
 */
export const updateCmsPageSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(64, 'Slug must not exceed 64 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      )
      .optional(),

    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(128, 'Title must not exceed 128 characters')
      .optional(),

    contentHtml: z.string().trim().min(1, 'Content HTML cannot be empty').optional(),

    metaDescription: z
      .string()
      .trim()
      .max(256, 'Meta description must not exceed 256 characters')
      .nullable()
      .optional(),

    isPublished: z.boolean().optional(),
  })
  .strict();

export type UpdateCmsPageInput = z.input<typeof updateCmsPageSchema>;

/**
 * cmsPageListQuerySchema: Validates query parameters for listing CMS pages.
 */
export const cmsPageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .optional()
    .default(20),
  isPublished: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
    .optional(),
});

export type CmsPageListQueryInput = z.infer<typeof cmsPageListQuerySchema>;

/**
 * cmsPageSlugParamSchema: Validates `:slug` route parameter for public/admin page lookup.
 */
export const cmsPageSlugParamSchema = z
  .object({
    slug: z
      .string({ required_error: 'Page slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(64, 'Slug must not exceed 64 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      ),
  })
  .strict();

export type CmsPageSlugParamInput = z.infer<typeof cmsPageSlugParamSchema>;

/**
 * cmsPageIdParamSchema: Validates `:id` UUID route parameter.
 */
export const cmsPageIdParamSchema = z
  .object({
    id: z.string({ required_error: 'Page ID is required' }).uuid('Invalid page ID format'),
  })
  .strict();

export type CmsPageIdParamInput = z.infer<typeof cmsPageIdParamSchema>;
