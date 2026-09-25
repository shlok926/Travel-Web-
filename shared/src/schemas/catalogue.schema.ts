import { z } from 'zod';
import { ACCOMMODATION_TIERS, MEAL_PLANS, DAILY_MEALS } from '../types/catalogue.js';

// Slug regex: lowercase alphanumeric characters and single hyphens, no leading/trailing hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- 1. Destination Schemas ---

export const createDestinationSchema = z
  .object({
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(100, 'Slug must not exceed 100 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      ),

    cityName: z
      .string({ required_error: 'City name is required' })
      .trim()
      .min(1, 'City name is required')
      .max(100, 'City name must not exceed 100 characters'),

    country: z
      .string({ required_error: 'Country is required' })
      .trim()
      .min(1, 'Country is required')
      .max(100, 'Country must not exceed 100 characters'),

    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(1, 'Description is required'),

    thumbnailUrl: z
      .string({ required_error: 'Thumbnail URL is required' })
      .trim()
      .url('Thumbnail must be a valid URL'),

    heroImageUrl: z.string().trim().url('Hero image must be a valid URL').nullable().optional(),

    isFeatured: z.boolean().optional().default(false),
    isPublished: z.boolean().optional().default(false),
  })
  .strict();

export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;

export const updateDestinationSchema = createDestinationSchema.partial().strict();

export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;

export const destinationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  isFeatured: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .optional(),
  isPublished: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .optional(),
});

export type DestinationQueryInput = z.infer<typeof destinationQuerySchema>;

// --- 2. Tour Theme Schemas ---

export const createThemeSchema = z
  .object({
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(100, 'Slug must not exceed 100 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      ),

    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(100, 'Title must not exceed 100 characters'),

    description: z.string().trim().nullable().optional(),

    iconUrl: z.string().trim().url('Icon URL must be a valid URL').nullable().optional(),
  })
  .strict();

export type CreateThemeInput = z.infer<typeof createThemeSchema>;

export const updateThemeSchema = createThemeSchema.partial().strict();

export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

// --- 3. Itinerary Day Schemas ---

export const itineraryDayInputSchema = z
  .object({
    dayNumber: z
      .number({ required_error: 'Day number is required' })
      .int('Day number must be an integer')
      .positive('Day number must be greater than 0'),

    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(255, 'Title must not exceed 255 characters'),

    activityDescription: z
      .string({ required_error: 'Activity description is required' })
      .trim()
      .min(1, 'Activity description is required'),

    mealsIncluded: z.array(z.enum(DAILY_MEALS)).optional().default([]),

    accommodationNotes: z.string().trim().nullable().optional(),
  })
  .strict();

export type ItineraryDayInput = z.infer<typeof itineraryDayInputSchema>;

export const upsertPackageItinerarySchema = z
  .object({
    itineraryDays: z
      .array(itineraryDayInputSchema)
      .min(1, 'At least one itinerary day is required when updating package itinerary'),
  })
  .strict();

export type UpsertPackageItineraryInput = z.infer<typeof upsertPackageItinerarySchema>;

// --- 4. Tour Package Schemas ---

export const createTourPackageSchema = z
  .object({
    destinationId: z
      .string({ required_error: 'Destination ID is required' })
      .uuid('Destination ID must be a valid UUID'),

    themeId: z.string().uuid('Theme ID must be a valid UUID').nullable().optional(),

    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters long')
      .max(150, 'Slug must not exceed 150 characters')
      .regex(
        SLUG_REGEX,
        'Slug must contain only lowercase alphanumeric characters and single hyphens',
      ),

    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(3, 'Title must be at least 3 characters long')
      .max(255, 'Title must not exceed 255 characters'),

    shortDescription: z
      .string({ required_error: 'Short description is required' })
      .trim()
      .min(10, 'Short description must be at least 10 characters long')
      .max(500, 'Short description must not exceed 500 characters'),

    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(10, 'Description must be at least 10 characters long'),

    durationDays: z
      .number({ required_error: 'Duration days is required' })
      .int('Duration days must be an integer')
      .positive('Duration days must be greater than 0'),

    durationNights: z
      .number({ required_error: 'Duration nights is required' })
      .int('Duration nights must be an integer')
      .nonnegative('Duration nights must be non-negative'),

    originCity: z
      .string({ required_error: 'Origin city is required' })
      .trim()
      .min(1, 'Origin city is required')
      .max(100, 'Origin city must not exceed 100 characters'),

    destinationCity: z
      .string({ required_error: 'Destination city is required' })
      .trim()
      .min(1, 'Destination city is required')
      .max(100, 'Destination city must not exceed 100 characters'),

    baseAdultPrice: z
      .number({ required_error: 'Base adult price is required' })
      .int('Base adult price must be an integer in minor units (paise)')
      .nonnegative('Base adult price must be non-negative'),

    baseChildPrice: z
      .number()
      .int('Base child price must be an integer in minor units (paise)')
      .nonnegative('Base child price must be non-negative')
      .optional()
      .default(0),

    currency: z.enum(['INR', 'USD']).optional().default('INR'),

    heroImageUrl: z
      .string({ required_error: 'Hero image URL is required' })
      .trim()
      .url('Hero image must be a valid URL'),

    galleryUrls: z
      .array(z.string().trim().url('Gallery image must be a valid URL'))
      .optional()
      .default([]),

    inclusions: z
      .array(z.string().trim().min(1, 'Inclusion item cannot be empty'))
      .optional()
      .default([]),

    exclusions: z
      .array(z.string().trim().min(1, 'Exclusion item cannot be empty'))
      .optional()
      .default([]),

    accommodationTiers: z
      .array(z.enum(ACCOMMODATION_TIERS))
      .optional()
      .default(['BUDGET', 'STANDARD', 'LUXURY']),

    mealPlans: z
      .array(z.enum(MEAL_PLANS))
      .optional()
      .default(['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD']),

    isPublished: z.boolean().optional().default(false),
    isFeatured: z.boolean().optional().default(false),
  })
  .strict();

export type CreateTourPackageInput = z.infer<typeof createTourPackageSchema>;

export const updateTourPackageSchema = createTourPackageSchema.partial().strict();

export type UpdateTourPackageInput = z.infer<typeof updateTourPackageSchema>;

export const tourPackageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  destinationSlug: z.string().trim().optional(),
  themeSlug: z.string().trim().optional(),
  isFeatured: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .optional(),
  isPublished: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .optional(),
});

export type TourPackageQueryInput = z.infer<typeof tourPackageQuerySchema>;
