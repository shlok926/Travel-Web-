import { SupportedCurrency } from '../utils/money.js';
import { TourPackageCardDto } from './catalogue.js';

// ============================================================
// 1. Controlled Enums & Taxonomies
// ============================================================

/**
 * DepartureStatus: Canonical operational lifecycle stored in PostgreSQL enum `departure_status`.
 * Matches database enum: ('OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED').
 */
export const DEPARTURE_STATUSES = ['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED'] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

/**
 * AvailabilityStatus: Derived, in-memory taxonomy computed in API responses.
 * NEVER stored in database tables or PostgreSQL enums.
 *
 * Rules:
 * - AVAILABLE: DepartureStatus is OPEN and availableSeats >= 5
 * - FEW_SEATS_LEFT: DepartureStatus is OPEN and 1 <= availableSeats < 5
 * - SOLD_OUT: DepartureStatus is OPEN and availableSeats === 0
 * - CLOSED: DepartureStatus is CLOSED or departure date is in the past
 * - CANCELLED: DepartureStatus is CANCELLED
 */
export const AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'FEW_SEATS_LEFT',
  'SOLD_OUT',
  'CLOSED',
  'CANCELLED',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * InventoryHoldStatus: PostgreSQL enum `inventory_hold_status`.
 * Temporary 15-minute seat locks for checkout (Phase 4 schema / Phase 5 booking engine).
 */
export const INVENTORY_HOLD_STATUSES = ['ACTIVE', 'COMMITTED', 'EXPIRED', 'RELEASED'] as const;
export type InventoryHoldStatus = (typeof INVENTORY_HOLD_STATUSES)[number];

/**
 * Canonical sorting options required by FR-SEARCH-004:
 * "The system shall support sorting search results by Price and Duration."
 */
export const CANONICAL_PACKAGE_SORT_OPTIONS = [
  'price_asc',
  'price_desc',
  'duration_asc',
  'duration_desc',
] as const;
export type CanonicalPackageSortOption = (typeof CANONICAL_PACKAGE_SORT_OPTIONS)[number];

/**
 * Optional sort extensions (DEC-4-006).
 * [OPTIONAL EXTENSION]
 */
export const OPTIONAL_PACKAGE_SORT_EXTENSIONS = ['newest', 'featured'] as const;
export type OptionalPackageSortExtension = (typeof OPTIONAL_PACKAGE_SORT_EXTENSIONS)[number];

/**
 * Combined package sort options for API validation.
 */
export const PACKAGE_SORT_OPTIONS = [
  ...CANONICAL_PACKAGE_SORT_OPTIONS,
  ...OPTIONAL_PACKAGE_SORT_EXTENSIONS,
] as const;
export type PackageSortOption = (typeof PACKAGE_SORT_OPTIONS)[number];

// ============================================================
// 2. Departure DTOs & Models
// ============================================================

/**
 * DepartureDto: Full departure schedule representation matching PostgreSQL table `departure_schedules`.
 * Note: Temporary holds are NEVER stored as a mutable column on departures; availability is derived dynamically.
 */
export interface DepartureDto {
  id: string;
  packageId: string;
  departureDate: string; // ISO Date YYYY-MM-DD
  returnDate: string; // ISO Date YYYY-MM-DD
  totalSeatCapacity: number;
  bookedSeats: number;
  /** [OPTIONAL EXTENSION DEC-4-008] Nullable seasonal price override for adults (integer minor units). */
  priceOverrideAdult?: number | null;
  /** [OPTIONAL EXTENSION DEC-4-008] Nullable seasonal price override for children (integer minor units). */
  priceOverrideChild?: number | null;
  /** [OPTIONAL EXTENSION DEC-4-008] Nullable currency matching package currency. */
  currency?: SupportedCurrency | null;
  status: DepartureStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * CreateDepartureDto: Input payload for admin departure creation.
 */
export interface CreateDepartureDto {
  packageId: string;
  departureDate: string;
  returnDate: string;
  totalSeatCapacity: number;
  /** [OPTIONAL EXTENSION] */
  priceOverrideAdult?: number | null;
  /** [OPTIONAL EXTENSION] */
  priceOverrideChild?: number | null;
  /** [OPTIONAL EXTENSION] */
  currency?: SupportedCurrency | null;
}

/**
 * UpdateDepartureDto: Partial input payload for admin departure updates.
 * Immutable fields (id, packageId, bookedSeats, createdAt, updatedAt) are strictly excluded.
 */
export interface UpdateDepartureDto {
  departureDate?: string;
  returnDate?: string;
  totalSeatCapacity?: number;
  /** [OPTIONAL EXTENSION] */
  priceOverrideAdult?: number | null;
  /** [OPTIONAL EXTENSION] */
  priceOverrideChild?: number | null;
  /** [OPTIONAL EXTENSION] */
  currency?: SupportedCurrency | null;
  status?: DepartureStatus;
}

// ============================================================
// 3. Availability DTOs
// ============================================================

/**
 * NextDepartureSummaryDto: Lightweight departure summary embedded inside package search cards.
 */
export interface NextDepartureSummaryDto {
  departureId: string;
  departureDate: string;
  returnDate: string;
  availableSeats: number;
  availabilityStatus: AvailabilityStatus;
  effectiveAdultPrice: number; // Integer minor units
  currency: SupportedCurrency;
}

/**
 * DepartureAvailabilityDto: Real-time availability inspection DTO.
 * Computes: availableSeats = max(0, totalSeatCapacity - (bookedSeats + activeHeldSeats)).
 */
export interface DepartureAvailabilityDto {
  departureId: string;
  packageId: string;
  departureDate: string;
  returnDate: string;
  totalSeatCapacity: number;
  bookedSeats: number;
  availableSeats: number;
  availabilityStatus: AvailabilityStatus;
  departureStatus: DepartureStatus;
  effectiveAdultPrice: number; // Integer minor units
  effectiveChildPrice: number; // Integer minor units
  currency: SupportedCurrency;
  isAvailableForParty?: boolean;
}

/**
 * DepartureAvailabilityQueryDto: Query parameters for departure availability inspection.
 */
export interface DepartureAvailabilityQueryDto {
  partySize?: number; // Integer >= 1, default 1
}

// ============================================================
// 4. Search & Multi-Criteria Filter Contracts
// ============================================================

/**
 * PackageSearchQueryDto: Search, multi-criteria filters, sorting, and pagination parameters.
 */
export interface PackageSearchQueryDto {
  // --- Canonical Filters (FR-SEARCH-001, FR-SEARCH-002) ---
  /** Search query matching package title, short description, destination city, country. */
  q?: string;
  /** Filter by destination slug. */
  destinationSlug?: string;
  /** Filter by tour theme slug. */
  themeSlug?: string;
  /** Filter by minimum duration in days. */
  minDuration?: number;
  /** Filter by maximum duration in days. */
  maxDuration?: number;
  /** Canonical FR-SEARCH-002 Maximum Budget (in integer minor units). */
  maxPrice?: number;

  // --- Optional Filter Extensions (DEC-4-007) ---
  /** [OPTIONAL EXTENSION] Minimum price threshold (in integer minor units). */
  minPrice?: number;
  /** [OPTIONAL EXTENSION] Currency filter ('INR' | 'USD'). */
  currency?: SupportedCurrency;
  /** [OPTIONAL EXTENSION] Filter packages with open departures on or after this ISO date. */
  departureDateFrom?: string;
  /** [OPTIONAL EXTENSION] Filter packages with open departures on or before this ISO date. */
  departureDateTo?: string;
  /** [OPTIONAL EXTENSION] Filter featured packages only. */
  isFeatured?: boolean;

  // --- Sorting & Pagination ---
  /** Sort order allowlist (canonical: price_asc, price_desc, duration_asc, duration_desc; optional extensions: newest, featured). Optional with no contract-level default. */
  sortBy?: PackageSortOption;
  /** Page number (1-indexed, default 1). */
  page?: number;
  /** Items per page (default 12, min 1, max 50). */
  limit?: number;
}

/**
 * PackageSearchResultDto: Individual package card in search results with next available departure.
 */
export interface PackageSearchResultDto extends TourPackageCardDto {
  nextDeparture?: NextDepartureSummaryDto | null;
}

/**
 * SearchPaginationMetaDto: Standardized pagination metadata envelope for search responses.
 */
export interface SearchPaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
