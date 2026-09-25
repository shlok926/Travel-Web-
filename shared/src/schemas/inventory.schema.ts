import { z } from 'zod';
import { DEPARTURE_STATUSES, PACKAGE_SORT_OPTIONS } from '../types/inventory.js';

// ISO Date regex (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Slug regex: lowercase alphanumeric characters and single hyphens, no leading/trailing hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ============================================================
// 1. Departure Schemas (Admin Management)
// ============================================================

/**
 * createDepartureSchema: Validates admin departure creation payload.
 *
 * Requirements:
 * - packageId: UUID format
 * - departureDate & returnDate: YYYY-MM-DD
 * - returnDate >= departureDate
 * - totalSeatCapacity: positive integer (> 0)
 * - optional price overrides: non-negative integers (paise/cents)
 * - optional currency: 'INR' | 'USD' | null
 */
export const createDepartureSchema = z
  .object({
    packageId: z
      .string({ required_error: 'Package ID is required' })
      .uuid('Package ID must be a valid UUID'),

    departureDate: z
      .string({ required_error: 'Departure date is required' })
      .regex(ISO_DATE_REGEX, 'Departure date must be in YYYY-MM-DD format'),

    returnDate: z
      .string({ required_error: 'Return date is required' })
      .regex(ISO_DATE_REGEX, 'Return date must be in YYYY-MM-DD format'),

    totalSeatCapacity: z
      .number({ required_error: 'Total seat capacity is required' })
      .int('Total seat capacity must be an integer')
      .positive('Total seat capacity must be greater than 0'),

    // [OPTIONAL EXTENSION DEC-4-008]
    priceOverrideAdult: z
      .number()
      .int('Adult price override must be an integer in minor units')
      .nonnegative('Adult price override must be non-negative')
      .nullable()
      .optional(),

    // [OPTIONAL EXTENSION DEC-4-008]
    priceOverrideChild: z
      .number()
      .int('Child price override must be an integer in minor units')
      .nonnegative('Child price override must be non-negative')
      .nullable()
      .optional(),

    // [OPTIONAL EXTENSION DEC-4-008]
    currency: z.enum(['INR', 'USD']).nullable().optional(),
  })
  .strict()
  .refine((data) => data.returnDate >= data.departureDate, {
    message: 'Return date must be on or after departure date',
    path: ['returnDate'],
  });

export type CreateDepartureInput = z.input<typeof createDepartureSchema>;
export type CreateDepartureDtoInput = CreateDepartureInput;

/**
 * updateDepartureSchema: Validates partial admin departure updates.
 * Immutable fields (id, packageId, bookedSeats, createdAt, updatedAt) are forbidden.
 */
export const updateDepartureSchema = z
  .object({
    departureDate: z
      .string()
      .regex(ISO_DATE_REGEX, 'Departure date must be in YYYY-MM-DD format')
      .optional(),

    returnDate: z
      .string()
      .regex(ISO_DATE_REGEX, 'Return date must be in YYYY-MM-DD format')
      .optional(),

    totalSeatCapacity: z
      .number()
      .int('Total seat capacity must be an integer')
      .positive('Total seat capacity must be greater than 0')
      .optional(),

    // [OPTIONAL EXTENSION DEC-4-008]
    priceOverrideAdult: z
      .number()
      .int('Adult price override must be an integer in minor units')
      .nonnegative('Adult price override must be non-negative')
      .nullable()
      .optional(),

    // [OPTIONAL EXTENSION DEC-4-008]
    priceOverrideChild: z
      .number()
      .int('Child price override must be an integer in minor units')
      .nonnegative('Child price override must be non-negative')
      .nullable()
      .optional(),

    // [OPTIONAL EXTENSION DEC-4-008]
    currency: z.enum(['INR', 'USD']).nullable().optional(),

    status: z.enum(DEPARTURE_STATUSES).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.departureDate && data.returnDate) {
        return data.returnDate >= data.departureDate;
      }
      return true;
    },
    {
      message: 'Return date must be on or after departure date',
      path: ['returnDate'],
    },
  );

export type UpdateDepartureInput = z.input<typeof updateDepartureSchema>;
export type UpdateDepartureDtoInput = UpdateDepartureInput;

// ============================================================
// 2. Availability Inspection Schemas
// ============================================================

/**
 * departureAvailabilityQuerySchema: Validates query parameters for checking availability.
 */
export const departureAvailabilityQuerySchema = z.object({
  partySize: z.coerce
    .number()
    .int('Party size must be an integer')
    .min(1, 'Party size must be at least 1')
    .optional()
    .default(1),
});

export type DepartureAvailabilityQueryInput = z.infer<typeof departureAvailabilityQuerySchema>;

// ============================================================
// 3. Search & Multi-Criteria Filter Query Schema
// ============================================================

/**
 * packageSearchQuerySchema: Validates search query, multi-criteria filters, sorting, and pagination.
 *
 * Canonical Filters (FR-SEARCH-001, FR-SEARCH-002):
 * - q: 2-100 characters (trimmed)
 * - destinationSlug: valid slug format
 * - themeSlug: valid slug format
 * - minDuration: integer >= 1
 * - maxDuration: integer >= minDuration
 * - maxPrice: integer >= 0 (minor units)
 *
 * Optional Extensions (DEC-4-006, DEC-4-007):
 * - minPrice: integer >= 0 (minor units, <= maxPrice)
 * - currency: 'INR' | 'USD'
 * - departureDateFrom: YYYY-MM-DD
 * - departureDateTo: YYYY-MM-DD (>= departureDateFrom)
 * - isFeatured: boolean
 * - sortBy: 'price_asc' | 'price_desc' | 'duration_asc' | 'duration_desc' | 'newest' | 'featured'
 *
 * Pagination:
 * - page: integer >= 1 (default 1)
 * - limit: integer 1..50 (default 12)
 */
export const packageSearchQuerySchema = z
  .object({
    // --- Canonical Filters (FR-SEARCH-001, FR-SEARCH-002) ---
    q: z
      .string()
      .trim()
      .min(2, 'Search query must be at least 2 characters long')
      .max(100, 'Search query must not exceed 100 characters')
      .optional(),

    destinationSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Destination slug must be at least 2 characters long')
      .max(100, 'Destination slug must not exceed 100 characters')
      .regex(
        SLUG_REGEX,
        'Destination slug must contain only lowercase alphanumeric characters and single hyphens',
      )
      .optional(),

    themeSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Theme slug must be at least 2 characters long')
      .max(100, 'Theme slug must not exceed 100 characters')
      .regex(
        SLUG_REGEX,
        'Theme slug must contain only lowercase alphanumeric characters and single hyphens',
      )
      .optional(),

    minDuration: z.coerce
      .number()
      .int('Minimum duration must be an integer')
      .min(1, 'Minimum duration must be at least 1 day')
      .optional(),

    maxDuration: z.coerce
      .number()
      .int('Maximum duration must be an integer')
      .min(1, 'Maximum duration must be at least 1 day')
      .optional(),

    maxPrice: z.coerce
      .number()
      .int('Maximum budget must be an integer in minor units')
      .nonnegative('Maximum budget must be non-negative')
      .optional(),

    // --- Optional Filter Extensions (DEC-4-007) ---
    minPrice: z.coerce
      .number()
      .int('Minimum price must be an integer in minor units')
      .nonnegative('Minimum price must be non-negative')
      .optional(),

    currency: z.enum(['INR', 'USD']).optional(),

    departureDateFrom: z
      .string()
      .regex(ISO_DATE_REGEX, 'Departure start date must be in YYYY-MM-DD format')
      .optional(),

    departureDateTo: z
      .string()
      .regex(ISO_DATE_REGEX, 'Departure end date must be in YYYY-MM-DD format')
      .optional(),

    isFeatured: z
      .union([
        z.boolean(),
        z.enum(['true', 'false', '1', '0']).transform((val) => val === 'true' || val === '1'),
      ])
      .optional(),

    // --- Sorting & Pagination ---
    sortBy: z.enum(PACKAGE_SORT_OPTIONS).optional().default('featured'),

    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(50, 'Limit must not exceed 50')
      .optional()
      .default(12),
  })
  .refine(
    (data) => {
      if (data.minDuration !== undefined && data.maxDuration !== undefined) {
        return data.maxDuration >= data.minDuration;
      }
      return true;
    },
    {
      message: 'Maximum duration must be greater than or equal to minimum duration',
      path: ['maxDuration'],
    },
  )
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.maxPrice >= data.minPrice;
      }
      return true;
    },
    {
      message: 'Maximum price must be greater than or equal to minimum price',
      path: ['maxPrice'],
    },
  )
  .refine(
    (data) => {
      if (data.departureDateFrom && data.departureDateTo) {
        return data.departureDateTo >= data.departureDateFrom;
      }
      return true;
    },
    {
      message: 'Departure end date must be on or after departure start date',
      path: ['departureDateTo'],
    },
  );

export type PackageSearchQueryInput = z.infer<typeof packageSearchQuerySchema>;
