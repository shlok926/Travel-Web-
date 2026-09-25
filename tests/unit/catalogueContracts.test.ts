import { describe, it, expect } from 'vitest';
import {
  createDestinationSchema,
  updateDestinationSchema,
  destinationQuerySchema,
  createThemeSchema,
  updateThemeSchema,
  createTourPackageSchema,
  updateTourPackageSchema,
  tourPackageQuerySchema,
  itineraryDayInputSchema,
  upsertPackageItinerarySchema,
  ACCOMMODATION_TIERS,
  MEAL_PLANS,
  DAILY_MEALS,
  CreateDestinationInput,
  CreateTourPackageInput,
} from '../../shared/src/index.js';

describe('Shared Catalogue Contracts & Zod Validation Schemas (Phase 3 Step 2)', () => {
  describe('1. Destination Schema Validation', () => {
    const validDestinationPayload: CreateDestinationInput = {
      slug: 'paris-france',
      cityName: 'Paris',
      country: 'France',
      description: 'The city of light, art, culture, and romantic charm.',
      thumbnailUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a',
      heroImageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34',
      isFeatured: true,
      isPublished: true,
    };

    it('1.1 valid destination payload passes validation and normalizes slug', () => {
      const result = createDestinationSchema.safeParse({
        ...validDestinationPayload,
        slug: '  PARIS-FRANCE  ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('paris-france');
        expect(result.data.cityName).toBe('Paris');
        expect(result.data.country).toBe('France');
        expect(result.data.isFeatured).toBe(true);
        expect(result.data.isPublished).toBe(true);
      }
    });

    it('1.2 applies default boolean values for isFeatured and isPublished', () => {
      const { isFeatured: _, isPublished: __, ...minimalPayload } = validDestinationPayload;
      const result = createDestinationSchema.safeParse(minimalPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFeatured).toBe(false);
        expect(result.data.isPublished).toBe(false);
      }
    });

    it('1.3 accepts null or undefined for heroImageUrl', () => {
      const resultNull = createDestinationSchema.safeParse({
        ...validDestinationPayload,
        heroImageUrl: null,
      });
      expect(resultNull.success).toBe(true);

      const resultUndef = createDestinationSchema.safeParse({
        ...validDestinationPayload,
        heroImageUrl: undefined,
      });
      expect(resultUndef.success).toBe(true);
    });

    it('1.4 rejects invalid slug formats (uppercase, spaces, special chars, leading/trailing hyphens)', () => {
      const invalidSlugs = [
        '-paris',
        'paris-',
        'paris--france',
        'paris france',
        'paris_france',
        'p@ris!',
      ];
      for (const slug of invalidSlugs) {
        const result = createDestinationSchema.safeParse({
          ...validDestinationPayload,
          slug,
        });
        expect(result.success).toBe(false);
      }
    });

    it('1.5 rejects missing required fields and invalid URLs', () => {
      expect(createDestinationSchema.safeParse({}).success).toBe(false);

      const invalidUrlResult = createDestinationSchema.safeParse({
        ...validDestinationPayload,
        thumbnailUrl: 'not-a-valid-url',
      });
      expect(invalidUrlResult.success).toBe(false);
    });

    it('1.6 updateDestinationSchema allows partial updates and enforces strictness', () => {
      const partialResult = updateDestinationSchema.safeParse({
        cityName: 'Paris Updated',
        isFeatured: false,
      });
      expect(partialResult.success).toBe(true);

      const unknownFieldResult = updateDestinationSchema.safeParse({
        cityName: 'Paris',
        unexpectedField: 'forbidden',
      });
      expect(unknownFieldResult.success).toBe(false);
    });

    it('1.7 destinationQuerySchema coerces pagination and boolean filter parameters', () => {
      const result = destinationQuerySchema.safeParse({
        page: '2',
        limit: '15',
        isFeatured: 'true',
        isPublished: '1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(15);
        expect(result.data.isFeatured).toBe(true);
        expect(result.data.isPublished).toBe(true);
      }
    });
  });

  describe('2. Tour Theme Schema Validation', () => {
    it('2.1 valid theme payload parses and allows nullable optional fields', () => {
      const result = createThemeSchema.safeParse({
        slug: 'honeymoon-special',
        title: 'Honeymoon Special',
        description: 'Curated romantic packages for couples.',
        iconUrl: 'https://example.com/icons/heart.svg',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('honeymoon-special');
        expect(result.data.title).toBe('Honeymoon Special');
      }

      const minimalResult = createThemeSchema.safeParse({
        slug: 'adventure-sports',
        title: 'Adventure Sports',
      });
      expect(minimalResult.success).toBe(true);
    });

    it('2.2 rejects missing title or malformed slug for theme', () => {
      expect(createThemeSchema.safeParse({ slug: 'valid-slug' }).success).toBe(false);
      expect(createThemeSchema.safeParse({ title: 'Valid Title' }).success).toBe(false);
      expect(
        createThemeSchema.safeParse({
          slug: 'INVALID SLUG',
          title: 'Valid Title',
        }).success,
      ).toBe(false);
    });

    it('2.3 updateThemeSchema allows partial updates', () => {
      const result = updateThemeSchema.safeParse({
        title: 'Updated Theme Title',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('3. Tour Package Schema Validation', () => {
    const validPackagePayload: CreateTourPackageInput = {
      destinationId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      themeId: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      slug: 'romantic-paris-getaway-5d4n',
      title: 'Romantic Paris Getaway 5D/4N',
      shortDescription: 'Experience the magic of Paris with Eiffel Tower access and Seine cruise.',
      description:
        'Detailed tour itinerary with guided excursions, museum passes, and luxury hotel accommodations.',
      durationDays: 5,
      durationNights: 4,
      originCity: 'Mumbai',
      destinationCity: 'Paris',
      baseAdultPrice: 12500000, // ₹125,000 in minor units (paise)
      baseChildPrice: 7500000, // ₹75,000 in minor units (paise)
      currency: 'INR',
      heroImageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34',
      galleryUrls: [
        'https://images.unsplash.com/photo-1499856871958-5b9627545d1a',
        'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f',
      ],
      inclusions: ['Flight tickets', '4-star hotel stay', 'Daily breakfast', 'Airport transfers'],
      exclusions: ['Personal expenses', 'Travel insurance', 'Visa fees'],
      accommodationTiers: ['BUDGET', 'STANDARD', 'LUXURY'],
      mealPlans: ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'],
      isPublished: false,
      isFeatured: true,
    };

    it('3.1 valid tour package payload parses correctly with all arrays and minor-unit prices', () => {
      const result = createTourPackageSchema.safeParse(validPackagePayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseAdultPrice).toBe(12500000);
        expect(result.data.baseChildPrice).toBe(7500000);
        expect(result.data.currency).toBe('INR');
        expect(result.data.durationDays).toBe(5);
        expect(result.data.durationNights).toBe(4);
        expect(result.data.inclusions).toHaveLength(4);
        expect(result.data.accommodationTiers).toEqual(ACCOMMODATION_TIERS);
        expect(result.data.mealPlans).toEqual(MEAL_PLANS);
      }
    });

    it('3.2 applies default arrays and pricing when optional fields omitted', () => {
      const minimalPackage = {
        destinationId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        slug: 'kashmir-paradise-4d3n',
        title: 'Kashmir Paradise Tour',
        shortDescription: 'Explore the scenic valleys of Srinagar and Gulmarg.',
        description: 'Comprehensive 4-day tour covering Dal Lake Shikara ride and snow adventures.',
        durationDays: 4,
        durationNights: 3,
        originCity: 'Delhi',
        destinationCity: 'Srinagar',
        baseAdultPrice: 4500000,
        heroImageUrl: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d',
      };

      const result = createTourPackageSchema.safeParse(minimalPackage);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseChildPrice).toBe(0);
        expect(result.data.currency).toBe('INR');
        expect(result.data.galleryUrls).toEqual([]);
        expect(result.data.inclusions).toEqual([]);
        expect(result.data.exclusions).toEqual([]);
        expect(result.data.isPublished).toBe(false);
        expect(result.data.isFeatured).toBe(false);
        expect(result.data.accommodationTiers).toEqual(['BUDGET', 'STANDARD', 'LUXURY']);
        expect(result.data.mealPlans).toEqual(['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD']);
      }
    });

    it('3.3 rejects durationDays <= 0 and durationNights < 0', () => {
      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          durationDays: 0,
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          durationDays: -2,
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          durationNights: -1,
        }).success,
      ).toBe(false);

      // Day trips: durationNights = 0 is valid
      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          durationDays: 1,
          durationNights: 0,
        }).success,
      ).toBe(true);
    });

    it('3.4 rejects negative or floating-point monetary values for package pricing', () => {
      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          baseAdultPrice: -1000,
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          baseAdultPrice: 12500.5, // floating-point rupees instead of integer minor units
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          baseChildPrice: -50,
        }).success,
      ).toBe(false);
    });

    it('3.5 rejects invalid UUID format for destinationId and themeId', () => {
      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          destinationId: 'not-a-uuid',
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          themeId: 'not-a-uuid',
        }).success,
      ).toBe(false);
    });

    it('3.6 accepts supported currencies (INR, USD) and rejects invalid currencies/enums', () => {
      // Valid supported currencies: INR and USD
      const inrResult = createTourPackageSchema.safeParse({
        ...validPackagePayload,
        currency: 'INR',
      });
      expect(inrResult.success).toBe(true);
      if (inrResult.success) {
        expect(inrResult.data.currency).toBe('INR');
      }

      const usdResult = createTourPackageSchema.safeParse({
        ...validPackagePayload,
        currency: 'USD',
      });
      expect(usdResult.success).toBe(true);
      if (usdResult.success) {
        expect(usdResult.data.currency).toBe('USD');
      }

      // Unsupported currency: EUR
      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          currency: 'EUR',
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          accommodationTiers: ['ULTRA_LUXURY'],
        }).success,
      ).toBe(false);

      expect(
        createTourPackageSchema.safeParse({
          ...validPackagePayload,
          mealPlans: ['ALL_INCLUSIVE'],
        }).success,
      ).toBe(false);
    });

    it('3.7 updateTourPackageSchema allows partial updates and rejects unknown fields', () => {
      const partialResult = updateTourPackageSchema.safeParse({
        title: 'Updated Package Title',
        baseAdultPrice: 13000000,
      });
      expect(partialResult.success).toBe(true);

      const unknownFieldResult = updateTourPackageSchema.safeParse({
        title: 'Updated',
        illegalField: 123,
      });
      expect(unknownFieldResult.success).toBe(false);
    });

    it('3.8 tourPackageQuerySchema coerces filters and pagination parameters', () => {
      const result = tourPackageQuerySchema.safeParse({
        page: '1',
        limit: '10',
        destinationSlug: 'paris-france',
        themeSlug: 'honeymoon-special',
        isFeatured: 'true',
        isPublished: '1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
        expect(result.data.destinationSlug).toBe('paris-france');
        expect(result.data.themeSlug).toBe('honeymoon-special');
        expect(result.data.isFeatured).toBe(true);
        expect(result.data.isPublished).toBe(true);
      }
    });
  });

  describe('4. Itinerary Day & Package Itinerary Schemas', () => {
    const validItineraryDay = {
      dayNumber: 1,
      title: 'Arrival in Paris & Evening Seine River Cruise',
      activityDescription:
        'Arrive at Charles de Gaulle Airport, meet tour guide, hotel check-in, and enjoy an illuminated evening cruise on the River Seine.',
      mealsIncluded: ['DINNER'] as const,
      accommodationNotes: 'Overnight at Hotel Pullman Paris Tour Eiffel',
    };

    it('4.1 valid itinerary day parses with controlled meal enum items', () => {
      const result = itineraryDayInputSchema.safeParse(validItineraryDay);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dayNumber).toBe(1);
        expect(result.data.mealsIncluded).toEqual(['DINNER']);
        expect(result.data.accommodationNotes).toBe('Overnight at Hotel Pullman Paris Tour Eiffel');
      }
    });

    it('4.2 rejects dayNumber <= 0 or non-integer', () => {
      expect(
        itineraryDayInputSchema.safeParse({
          ...validItineraryDay,
          dayNumber: 0,
        }).success,
      ).toBe(false);

      expect(
        itineraryDayInputSchema.safeParse({
          ...validItineraryDay,
          dayNumber: -1,
        }).success,
      ).toBe(false);

      expect(
        itineraryDayInputSchema.safeParse({
          ...validItineraryDay,
          dayNumber: 1.5,
        }).success,
      ).toBe(false);
    });

    it('4.3 rejects invalid meal values not in DAILY_MEALS', () => {
      expect(DAILY_MEALS).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);

      expect(
        itineraryDayInputSchema.safeParse({
          ...validItineraryDay,
          mealsIncluded: ['MIDNIGHT_SNACK'],
        }).success,
      ).toBe(false);

      // Valid meals: BREAKFAST, LUNCH, DINNER
      expect(
        itineraryDayInputSchema.safeParse({
          ...validItineraryDay,
          mealsIncluded: ['BREAKFAST', 'LUNCH', 'DINNER'],
        }).success,
      ).toBe(true);
    });

    it('4.4 upsertPackageItinerarySchema accepts non-empty array of itinerary days', () => {
      const result = upsertPackageItinerarySchema.safeParse({
        itineraryDays: [
          validItineraryDay,
          {
            dayNumber: 2,
            title: 'Eiffel Tower & Louvre Museum Tour',
            activityDescription:
              'Guided summit visit to the Eiffel Tower followed by guided Louvre art tour.',
            mealsIncluded: ['BREAKFAST', 'LUNCH'],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itineraryDays).toHaveLength(2);
      }
    });

    it('4.5 upsertPackageItinerarySchema rejects empty itinerary array', () => {
      const result = upsertPackageItinerarySchema.safeParse({
        itineraryDays: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
