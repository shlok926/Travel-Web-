import { describe, it, expect } from 'vitest';
import {
  createDepartureSchema,
  updateDepartureSchema,
  packageSearchQuerySchema,
  departureAvailabilityQuerySchema,
  DEPARTURE_STATUSES,
  AVAILABILITY_STATUSES,
  CANONICAL_PACKAGE_SORT_OPTIONS,
  OPTIONAL_PACKAGE_SORT_EXTENSIONS,
  PACKAGE_SORT_OPTIONS,
  CreateDepartureInput,
  DepartureDto,
  DepartureAvailabilityDto,
} from '../../shared/src/index.js';

describe('Shared Search & Inventory Contracts & Zod Validation Schemas (Phase 4 Step 2)', () => {
  // ============================================================
  // 1. Enum & Type Classification Integrity
  // ============================================================
  describe('1. Controlled Enums & Taxonomies', () => {
    it('1.1 DepartureStatus matches PostgreSQL enum values exactly', () => {
      expect(DEPARTURE_STATUSES).toEqual(['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED']);
    });

    it('1.2 AvailabilityStatus contains derived in-memory lifecycle statuses', () => {
      expect(AVAILABILITY_STATUSES).toEqual([
        'AVAILABLE',
        'FEW_SEATS_LEFT',
        'SOLD_OUT',
        'CLOSED',
        'CANCELLED',
      ]);
    });

    it('1.3 Canonical package sort options match FR-SEARCH-004 exactly (Price and Duration only)', () => {
      expect(CANONICAL_PACKAGE_SORT_OPTIONS).toEqual([
        'price_asc',
        'price_desc',
        'duration_asc',
        'duration_desc',
      ]);
    });

    it('1.4 Optional sort extensions are explicitly classified (DEC-4-006)', () => {
      expect(OPTIONAL_PACKAGE_SORT_EXTENSIONS).toEqual(['newest', 'featured']);
    });

    it('1.5 PACKAGE_SORT_OPTIONS includes canonical options and optional extensions', () => {
      expect(PACKAGE_SORT_OPTIONS).toEqual([
        'price_asc',
        'price_desc',
        'duration_asc',
        'duration_desc',
        'newest',
        'featured',
      ]);
    });
  });

  // ============================================================
  // 2. Departure Schemas (Admin Management)
  // ============================================================
  describe('2. CreateDepartureSchema Validation', () => {
    const validCreatePayload: CreateDepartureInput = {
      packageId: '11111111-2222-3333-4444-555555555555',
      departureDate: '2026-10-15',
      returnDate: '2026-10-22',
      totalSeatCapacity: 20,
    };

    it('2.1 passes with valid canonical fields and applies null/optional defaults', () => {
      const result = createDepartureSchema.safeParse(validCreatePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.packageId).toBe('11111111-2222-3333-4444-555555555555');
        expect(result.data.departureDate).toBe('2026-10-15');
        expect(result.data.returnDate).toBe('2026-10-22');
        expect(result.data.totalSeatCapacity).toBe(20);
        expect(result.data.priceOverrideAdult).toBeUndefined();
        expect(result.data.priceOverrideChild).toBeUndefined();
        expect(result.data.currency).toBeUndefined();
      }
    });

    it('2.2 passes with valid optional price overrides and currency (DEC-4-008)', () => {
      const payloadWithOverrides = {
        ...validCreatePayload,
        priceOverrideAdult: 4500000, // 45000 INR in paise
        priceOverrideChild: 2500000, // 25000 INR in paise
        currency: 'INR' as const,
      };
      const result = createDepartureSchema.safeParse(payloadWithOverrides);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priceOverrideAdult).toBe(4500000);
        expect(result.data.priceOverrideChild).toBe(2500000);
        expect(result.data.currency).toBe('INR');
      }
    });

    it('2.3 allows explicit null for optional price overrides and currency', () => {
      const payloadWithNulls = {
        ...validCreatePayload,
        priceOverrideAdult: null,
        priceOverrideChild: null,
        currency: null,
      };
      const result = createDepartureSchema.safeParse(payloadWithNulls);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priceOverrideAdult).toBeNull();
        expect(result.data.priceOverrideChild).toBeNull();
        expect(result.data.currency).toBeNull();
      }
    });

    it('2.4 rejects invalid UUID for packageId', () => {
      const result = createDepartureSchema.safeParse({
        ...validCreatePayload,
        packageId: 'invalid-uuid-1234',
      });
      expect(result.success).toBe(false);
    });

    it('2.5 rejects malformed departure and return dates', () => {
      const invalidDates = ['15-10-2026', '2026/10/15', '2026-10', 'invalid'];
      for (const d of invalidDates) {
        expect(
          createDepartureSchema.safeParse({
            ...validCreatePayload,
            departureDate: d,
          }).success,
        ).toBe(false);

        expect(
          createDepartureSchema.safeParse({
            ...validCreatePayload,
            returnDate: d,
          }).success,
        ).toBe(false);
      }
    });

    it('2.6 rejects returnDate earlier than departureDate', () => {
      const result = createDepartureSchema.safeParse({
        ...validCreatePayload,
        departureDate: '2026-10-20',
        returnDate: '2026-10-15',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['returnDate']);
        expect(result.error.issues[0]?.message).toMatch(
          /Return date must be on or after departure date/i,
        );
      }
    });

    it('2.7 allows same-day departure and return dates (single-day tours)', () => {
      const result = createDepartureSchema.safeParse({
        ...validCreatePayload,
        departureDate: '2026-10-15',
        returnDate: '2026-10-15',
      });
      expect(result.success).toBe(true);
    });

    it('2.8 rejects zero or negative totalSeatCapacity', () => {
      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          totalSeatCapacity: 0,
        }).success,
      ).toBe(false);

      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          totalSeatCapacity: -5,
        }).success,
      ).toBe(false);

      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          totalSeatCapacity: 12.5,
        }).success,
      ).toBe(false);
    });

    it('2.9 rejects negative price overrides or invalid currency', () => {
      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          priceOverrideAdult: -100,
        }).success,
      ).toBe(false);

      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          priceOverrideChild: -50,
        }).success,
      ).toBe(false);

      expect(
        createDepartureSchema.safeParse({
          ...validCreatePayload,
          currency: 'EUR',
        }).success,
      ).toBe(false);
    });

    it('2.10 strictly rejects unexpected additional properties', () => {
      const result = createDepartureSchema.safeParse({
        ...validCreatePayload,
        bookedSeats: 5,
        status: 'OPEN',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('3. UpdateDepartureSchema Validation', () => {
    it('3.1 passes with valid partial updates', () => {
      const result = updateDepartureSchema.safeParse({
        totalSeatCapacity: 25,
        status: 'CLOSED',
        priceOverrideAdult: 5000000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalSeatCapacity).toBe(25);
        expect(result.data.status).toBe('CLOSED');
        expect(result.data.priceOverrideAdult).toBe(5000000);
      }
    });

    it('3.2 strictly forbids immutable fields (id, packageId, bookedSeats, createdAt, updatedAt)', () => {
      const forbiddenFields = [
        { id: '11111111-2222-3333-4444-555555555555' },
        { packageId: '11111111-2222-3333-4444-555555555555' },
        { bookedSeats: 10 },
        { createdAt: new Date().toISOString() },
        { updatedAt: new Date().toISOString() },
      ];

      for (const field of forbiddenFields) {
        const result = updateDepartureSchema.safeParse(field);
        expect(result.success).toBe(false);
      }
    });

    it('3.3 validates date bounds when both dates are supplied in update', () => {
      const invalidResult = updateDepartureSchema.safeParse({
        departureDate: '2026-11-20',
        returnDate: '2026-11-10',
      });
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.issues[0]?.path).toEqual(['returnDate']);
      }

      const validResult = updateDepartureSchema.safeParse({
        departureDate: '2026-11-10',
        returnDate: '2026-11-20',
      });
      expect(validResult.success).toBe(true);
    });

    it('3.4 allows single date update when only one date is updated', () => {
      expect(updateDepartureSchema.safeParse({ departureDate: '2026-11-10' }).success).toBe(true);
      expect(updateDepartureSchema.safeParse({ returnDate: '2026-11-20' }).success).toBe(true);
    });

    it('3.5 validates status against allowable DepartureStatus values', () => {
      for (const status of DEPARTURE_STATUSES) {
        expect(updateDepartureSchema.safeParse({ status }).success).toBe(true);
      }

      // Invalid status values
      expect(updateDepartureSchema.safeParse({ status: 'AVAILABLE' }).success).toBe(false);
      expect(updateDepartureSchema.safeParse({ status: 'DRAFT' }).success).toBe(false);
      expect(updateDepartureSchema.safeParse({ status: 'SOLD_OUT' }).success).toBe(false);
    });
  });

  // ============================================================
  // 4. Departure Availability Query Schema
  // ============================================================
  describe('4. DepartureAvailabilityQuerySchema Validation', () => {
    it('4.1 defaults partySize to 1 when omitted', () => {
      const result = departureAvailabilityQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.partySize).toBe(1);
      }
    });

    it('4.2 coerces partySize from query string and accepts positive integers', () => {
      const result = departureAvailabilityQuerySchema.safeParse({ partySize: '4' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.partySize).toBe(4);
      }
    });

    it('4.3 rejects zero, negative, or non-integer party sizes', () => {
      expect(departureAvailabilityQuerySchema.safeParse({ partySize: '0' }).success).toBe(false);
      expect(departureAvailabilityQuerySchema.safeParse({ partySize: '-2' }).success).toBe(false);
      expect(departureAvailabilityQuerySchema.safeParse({ partySize: '2.5' }).success).toBe(false);
      expect(departureAvailabilityQuerySchema.safeParse({ partySize: 'abc' }).success).toBe(false);
    });
  });

  // ============================================================
  // 5. Package Search Query Schema Validation
  // ============================================================
  describe('5. PackageSearchQuerySchema Validation', () => {
    it('5.1 passes with empty query and applies default pagination and sort', () => {
      const result = packageSearchQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(12);
        expect(result.data.sortBy).toBe('featured');
      }
    });

    it('5.2 validates canonical search keyword (q) constraints', () => {
      // Valid query
      const valid = packageSearchQuerySchema.safeParse({ q: 'Manali Snow' });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.q).toBe('Manali Snow');
      }

      // Query too short (< 2 characters)
      const tooShort = packageSearchQuerySchema.safeParse({ q: 'a' });
      expect(tooShort.success).toBe(false);

      // Query too long (> 100 characters)
      const tooLong = packageSearchQuerySchema.safeParse({ q: 'a'.repeat(101) });
      expect(tooLong.success).toBe(false);
    });

    it('5.3 validates canonical destination and theme slug formats', () => {
      const valid = packageSearchQuerySchema.safeParse({
        destinationSlug: 'himachal-pradesh',
        themeSlug: 'adventure-trekking',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.destinationSlug).toBe('himachal-pradesh');
        expect(valid.data.themeSlug).toBe('adventure-trekking');
      }

      // Invalid slug formats
      expect(
        packageSearchQuerySchema.safeParse({ destinationSlug: 'Himachal Pradesh' }).success,
      ).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ destinationSlug: '-himachal' }).success).toBe(
        false,
      );
      expect(packageSearchQuerySchema.safeParse({ themeSlug: 'adventure_trekking' }).success).toBe(
        false,
      );
    });

    it('5.4 validates duration filters and minDuration <= maxDuration refinement', () => {
      const valid = packageSearchQuerySchema.safeParse({
        minDuration: '3',
        maxDuration: '7',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.minDuration).toBe(3);
        expect(valid.data.maxDuration).toBe(7);
      }

      // minDuration > maxDuration refinement failure
      const invalid = packageSearchQuerySchema.safeParse({
        minDuration: '8',
        maxDuration: '4',
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0]?.path).toEqual(['maxDuration']);
      }

      // Zero or negative duration
      expect(packageSearchQuerySchema.safeParse({ minDuration: '0' }).success).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ maxDuration: '-1' }).success).toBe(false);
    });

    it('5.5 validates price filters and minPrice <= maxPrice refinement (minor units)', () => {
      const valid = packageSearchQuerySchema.safeParse({
        minPrice: '1000000', // 10,000 INR
        maxPrice: '5000000', // 50,000 INR
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.minPrice).toBe(1000000);
        expect(valid.data.maxPrice).toBe(5000000);
      }

      // minPrice > maxPrice refinement failure
      const invalid = packageSearchQuerySchema.safeParse({
        minPrice: '6000000',
        maxPrice: '3000000',
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0]?.path).toEqual(['maxPrice']);
      }

      // Negative price
      expect(packageSearchQuerySchema.safeParse({ maxPrice: '-500' }).success).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ minPrice: '-100' }).success).toBe(false);
    });

    it('5.6 validates optional departure date range filters and refinement', () => {
      const valid = packageSearchQuerySchema.safeParse({
        departureDateFrom: '2026-10-01',
        departureDateTo: '2026-10-31',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.departureDateFrom).toBe('2026-10-01');
        expect(valid.data.departureDateTo).toBe('2026-10-31');
      }

      // End date before start date
      const invalid = packageSearchQuerySchema.safeParse({
        departureDateFrom: '2026-10-31',
        departureDateTo: '2026-10-01',
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0]?.path).toEqual(['departureDateTo']);
      }
    });

    it('5.7 validates isFeatured boolean coercion', () => {
      expect(packageSearchQuerySchema.safeParse({ isFeatured: 'true' }).data?.isFeatured).toBe(
        true,
      );
      expect(packageSearchQuerySchema.safeParse({ isFeatured: '1' }).data?.isFeatured).toBe(true);
      expect(packageSearchQuerySchema.safeParse({ isFeatured: 'false' }).data?.isFeatured).toBe(
        false,
      );
      expect(packageSearchQuerySchema.safeParse({ isFeatured: '0' }).data?.isFeatured).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ isFeatured: true }).data?.isFeatured).toBe(true);
    });

    it('5.8 accepts all valid sort keys and rejects invalid/SQL injection attempts', () => {
      // Canonical sorts
      for (const sort of CANONICAL_PACKAGE_SORT_OPTIONS) {
        expect(packageSearchQuerySchema.safeParse({ sortBy: sort }).success).toBe(true);
      }

      // Optional sort extensions
      for (const sort of OPTIONAL_PACKAGE_SORT_EXTENSIONS) {
        expect(packageSearchQuerySchema.safeParse({ sortBy: sort }).success).toBe(true);
      }

      // Invalid/Dangerous sort inputs
      const invalidSorts = [
        'price_asc; DROP TABLE tour_packages;',
        'created_at',
        'rating_desc',
        'SELECT * FROM users',
        'random_sort',
      ];
      for (const sort of invalidSorts) {
        expect(packageSearchQuerySchema.safeParse({ sortBy: sort }).success).toBe(false);
      }
    });

    it('5.9 enforces pagination bounds (page >= 1, limit 1..50)', () => {
      const valid = packageSearchQuerySchema.safeParse({ page: '3', limit: '25' });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.page).toBe(3);
        expect(valid.data.limit).toBe(25);
      }

      // page < 1
      expect(packageSearchQuerySchema.safeParse({ page: '0' }).success).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ page: '-2' }).success).toBe(false);

      // limit < 1 or limit > 50
      expect(packageSearchQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
      expect(packageSearchQuerySchema.safeParse({ limit: '100' }).success).toBe(false);
    });
  });

  // ============================================================
  // 6. DTO Shape & Invariant Checks
  // ============================================================
  describe('6. DTO Shape & Architectural Invariants', () => {
    it('6.1 DepartureDto represents departure schedule without mutable held_seats field', () => {
      const sampleDeparture: DepartureDto = {
        id: '11111111-2222-3333-4444-555555555555',
        packageId: '22222222-3333-4444-5555-666666666666',
        departureDate: '2026-11-01',
        returnDate: '2026-11-08',
        totalSeatCapacity: 20,
        bookedSeats: 5,
        priceOverrideAdult: null,
        priceOverrideChild: null,
        currency: 'INR',
        status: 'OPEN',
        createdAt: '2026-09-26T00:00:00.000Z',
        updatedAt: '2026-09-26T00:00:00.000Z',
      };

      expect(sampleDeparture.totalSeatCapacity).toBe(20);
      expect(sampleDeparture.bookedSeats).toBe(5);
      // Ensure TypeScript does not require or allow heldSeats as a mutable field on DepartureDto
      expect('heldSeats' in sampleDeparture).toBe(false);
    });

    it('6.2 DepartureAvailabilityDto models computed availability and effective pricing', () => {
      const sampleAvailability: DepartureAvailabilityDto = {
        departureId: '11111111-2222-3333-4444-555555555555',
        packageId: '22222222-3333-4444-5555-666666666666',
        departureDate: '2026-11-01',
        returnDate: '2026-11-08',
        totalSeatCapacity: 20,
        bookedSeats: 5,
        availableSeats: 12, // 20 - 5 - 3 held
        availabilityStatus: 'AVAILABLE',
        departureStatus: 'OPEN',
        effectiveAdultPrice: 2850000, // 28,500 INR in paise
        effectiveChildPrice: 1500000, // 15,000 INR in paise
        currency: 'INR',
        isAvailableForParty: true,
      };

      expect(sampleAvailability.availableSeats).toBe(12);
      expect(sampleAvailability.availabilityStatus).toBe('AVAILABLE');
      expect(sampleAvailability.effectiveAdultPrice).toBe(2850000);
    });
  });
});
