import {
  AppError,
  CreateDepartureInput,
  DepartureDto,
  ErrorCodes,
  UpdateDepartureInput,
  createDepartureSchema,
  updateDepartureSchema,
} from '../../../../../shared/src/index.js';
import { TourPackageRepository } from '../../catalogue/repositories/tourPackage.repository.js';
import {
  DepartureEntity,
  DepartureListOptions,
  DepartureRepository,
} from '../repositories/departure.repository.js';
import { InventoryHoldRepository } from '../repositories/inventoryHold.repository.js';

export function toDepartureDto(entity: DepartureEntity): DepartureDto {
  return {
    id: entity.id,
    packageId: entity.packageId,
    departureDate: entity.departureDate,
    returnDate: entity.returnDate,
    totalSeatCapacity: entity.totalSeatCapacity,
    bookedSeats: entity.bookedSeats,
    priceOverrideAdult: entity.priceOverrideAdult,
    priceOverrideChild: entity.priceOverrideChild,
    currency: entity.currency,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

/**
 * DepartureService: Manages departure schedules, capacity constraints, lifecycle updates, and deletions.
 *
 * Core Principles:
 * - Decoupled from SQL: coordinates DepartureRepository, InventoryHoldRepository, and TourPackageRepository.
 * - Enforces application-level business invariants:
 *   1. Referenced tour package must exist.
 *   2. Departure and return dates must maintain returnDate >= departureDate.
 *   3. Capacity reduction cannot lower total_seat_capacity below existing booked_seats.
 *   4. Deletion blocked if booked_seats > 0 or active unexpired checkout holds exist.
 *   5. Maps PostgreSQL unique constraint violations (code 23505) to canonical domain conflict errors.
 */
export class DepartureService {
  constructor(
    private readonly departureRepo: DepartureRepository,
    private readonly tourPackageRepo: TourPackageRepository,
    private readonly holdRepo: InventoryHoldRepository,
  ) {}

  /**
   * Create a new departure schedule for a tour package.
   */
  async createDeparture(input: CreateDepartureInput): Promise<DepartureDto> {
    // 1. Validate payload with shared schema
    const data = createDepartureSchema.parse(input);

    // 2. Verify referenced tour package exists
    const pkg = await this.tourPackageRepo.findById(data.packageId);
    if (!pkg) {
      throw AppError.notFound('Tour package not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 3. Persist via repository
    try {
      const created = await this.departureRepo.create(data);
      return toDepartureDto(created);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw AppError.conflict(
          'A departure schedule already exists for this package on the specified date',
          ErrorCodes.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * Get a single departure schedule by primary key UUID.
   */
  async getDepartureById(id: string): Promise<DepartureDto> {
    const departure = await this.departureRepo.findById(id);
    if (!departure) {
      throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return toDepartureDto(departure);
  }

  /**
   * List all departures for a specific tour package with optional status and date filters.
   */
  async listDeparturesForPackage(
    packageId: string,
    options: DepartureListOptions = {},
  ): Promise<DepartureDto[]> {
    const pkg = await this.tourPackageRepo.findById(packageId);
    if (!pkg) {
      throw AppError.notFound('Tour package not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const departures = await this.departureRepo.listByPackageId(packageId, options);
    return departures.map(toDepartureDto);
  }

  /**
   * List upcoming open departures for customer storefront selection.
   */
  async listUpcomingDeparturesForPackage(
    packageId: string,
    fromDate?: string,
  ): Promise<DepartureDto[]> {
    const pkg = await this.tourPackageRepo.findById(packageId);
    if (!pkg) {
      throw AppError.notFound('Tour package not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const departures = await this.departureRepo.listUpcomingForPackage(packageId, fromDate);
    return departures.map(toDepartureDto);
  }

  /**
   * Update an existing departure schedule.
   * Enforces capacity lower-bound constraint and date range invariants.
   */
  async updateDeparture(id: string, input: UpdateDepartureInput): Promise<DepartureDto> {
    // 1. Validate partial update payload
    const data = updateDepartureSchema.parse(input);

    // 2. Verify departure exists
    const existing = await this.departureRepo.findById(id);
    if (!existing) {
      throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 3. Validate merged date invariants
    const effectiveDepartureDate = data.departureDate ?? existing.departureDate;
    const effectiveReturnDate = data.returnDate ?? existing.returnDate;
    if (effectiveReturnDate < effectiveDepartureDate) {
      throw AppError.badRequest(
        'Return date must be on or after departure date',
        [{ field: 'returnDate', issue: 'Return date precedes departure date' }],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // 4. Validate capacity reduction against existing booked seats
    if (data.totalSeatCapacity !== undefined && data.totalSeatCapacity < existing.bookedSeats) {
      throw AppError.badRequest(
        'Total seat capacity cannot be less than currently booked seats',
        [
          {
            field: 'totalSeatCapacity',
            issue: `Requested capacity (${data.totalSeatCapacity}) is lower than confirmed booked seats (${existing.bookedSeats})`,
          },
        ],
        ErrorCodes.INVENTORY_CAPACITY_EXCEEDED,
      );
    }

    // 5. Update via repository
    try {
      const updated = await this.departureRepo.update(id, data);
      if (!updated) {
        throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
      }
      return toDepartureDto(updated);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw AppError.conflict(
          'A departure schedule already exists for this package on the specified date',
          ErrorCodes.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * Delete a departure schedule if no confirmed bookings or active holds exist.
   */
  async deleteDeparture(id: string): Promise<boolean> {
    const existing = await this.departureRepo.findById(id);
    if (!existing) {
      throw AppError.notFound('Departure schedule not found', ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 1. Invariant: Cannot delete departures with confirmed bookings
    if (existing.bookedSeats > 0) {
      throw AppError.badRequest(
        'Cannot delete departure schedule with confirmed bookings',
        [{ field: 'bookedSeats', issue: 'Confirmed bookings exist on this departure' }],
        ErrorCodes.CONFLICT,
      );
    }

    // 2. Invariant: Cannot delete departures with active unexpired holds
    const activeHoldCount = await this.holdRepo.getActiveHoldCountForDeparture(id);
    if (activeHoldCount > 0) {
      throw AppError.conflict(
        'Cannot delete departure schedule with active checkout holds',
        ErrorCodes.CONFLICT,
      );
    }

    return this.departureRepo.delete(id);
  }
}
