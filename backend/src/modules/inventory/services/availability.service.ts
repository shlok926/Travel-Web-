import {
  AppError,
  AvailabilityStatus,
  DepartureAvailabilityDto,
  DepartureAvailabilityQueryInput,
  ErrorCodes,
  departureAvailabilityQuerySchema,
} from '../../../../../shared/src/index.js';
import { DepartureRepository } from '../repositories/departure.repository.js';

/**
 * AvailabilityService: Computes real-time seat availability, status taxonomy, and effective pricing.
 *
 * Core Principles:
 * - Read-only atomic aggregation via DepartureRepository.getAvailabilityById().
 * - Dynamic formula: S_available = MAX(0, total_seat_capacity - booked_seats - SUM(active_unexpired_holds)).
 * - Derived AvailabilityStatus taxonomy:
 *   1. CANCELLED: departure status is CANCELLED.
 *   2. CLOSED: departure status is CLOSED or departure_date is in the past.
 *   3. SOLD_OUT: departure status is OPEN and availableSeats === 0.
 *   4. FEW_SEATS_LEFT: departure status is OPEN and 1 <= availableSeats < 5.
 *   5. AVAILABLE: departure status is OPEN and availableSeats >= 5.
 * - Resolves effective adult/child pricing with seasonal departure overrides.
 * - Computes party size eligibility (FR-INVENT-003).
 * - Zero inventory mutation or hold modification during read operations.
 */
export class AvailabilityService {
  constructor(private readonly departureRepo: DepartureRepository) {}

  /**
   * Get real-time availability and effective pricing for a specific departure schedule.
   */
  async getDepartureAvailability(
    departureId: string,
    query: DepartureAvailabilityQueryInput = { partySize: 1 },
  ): Promise<DepartureAvailabilityDto> {
    // 1. Validate query input
    const validatedQuery = departureAvailabilityQuerySchema.parse(query);
    const partySize = validatedQuery.partySize ?? 1;

    // 2. Fetch atomic availability aggregate from repository
    const aggregate = await this.departureRepo.getAvailabilityById(departureId);
    if (!aggregate) {
      throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 3. Derive AvailabilityStatus taxonomy
    const todayIso = new Date().toISOString().split('T')[0] ?? '';
    let availabilityStatus: AvailabilityStatus;

    if (aggregate.departureStatus === 'CANCELLED') {
      availabilityStatus = 'CANCELLED';
    } else if (aggregate.departureStatus === 'CLOSED' || aggregate.departureDate < todayIso) {
      availabilityStatus = 'CLOSED';
    } else if (aggregate.availableSeats <= 0) {
      availabilityStatus = 'SOLD_OUT';
    } else if (aggregate.availableSeats < 5) {
      // Documented taxonomy: 1 <= availableSeats < 5 -> FEW_SEATS_LEFT
      availabilityStatus = 'FEW_SEATS_LEFT';
    } else {
      availabilityStatus = 'AVAILABLE';
    }

    // 4. Resolve Effective Pricing (override precedence over base package price)
    const effectiveAdultPrice =
      aggregate.priceOverrideAdult !== null && aggregate.priceOverrideAdult !== undefined
        ? aggregate.priceOverrideAdult
        : aggregate.baseAdultPrice;

    const effectiveChildPrice =
      aggregate.priceOverrideChild !== null && aggregate.priceOverrideChild !== undefined
        ? aggregate.priceOverrideChild
        : aggregate.baseChildPrice;

    const currency = aggregate.departureCurrency ?? aggregate.packageCurrency;

    // 5. Evaluate party size eligibility (FR-INVENT-003)
    const isBookable =
      availabilityStatus === 'AVAILABLE' || availabilityStatus === 'FEW_SEATS_LEFT';
    const isAvailableForParty = isBookable && aggregate.availableSeats >= partySize;

    // 6. Return standard DepartureAvailabilityDto
    return {
      departureId: aggregate.departureId,
      packageId: aggregate.packageId,
      departureDate: aggregate.departureDate,
      returnDate: aggregate.returnDate,
      totalSeatCapacity: aggregate.totalSeatCapacity,
      bookedSeats: aggregate.bookedSeats,
      availableSeats: aggregate.availableSeats,
      availabilityStatus,
      departureStatus: aggregate.departureStatus,
      effectiveAdultPrice,
      effectiveChildPrice,
      currency,
      isAvailableForParty,
    };
  }
}
