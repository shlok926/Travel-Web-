import {
  AdminBookingListQueryDto,
  AppError,
  DepartureManifestDto,
  ErrorCodes,
} from '../../../../../shared/src/index.js';
import { BookingService } from '../../booking/services/booking.service.js';
import { BookingRepository } from '../../booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../booking/repositories/passenger.repository.js';

export class AdminBookingService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly bookingRepo: BookingRepository,
    private readonly passengerRepo: PassengerRepository,
  ) {}

  /**
   * List all bookings for administrative operations with status and pagination filters.
   */
  async listBookings(query: AdminBookingListQueryDto = {}) {
    return this.bookingService.listAdminBookings({
      page: query.page,
      limit: query.limit,
      status: query.status,
      departureId: query.departureId,
      customerId: query.customerId,
      search: query.search,
    });
  }

  /**
   * Admin booking lookup by primary key ID or reference.
   */
  async getBookingDetails(idOrReference: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrReference,
    );

    const booking = isUuid
      ? await this.bookingRepo.findById(idOrReference)
      : await this.bookingRepo.findByReference(idOrReference);

    if (!booking) {
      throw AppError.notFound(
        `Booking '${idOrReference}' was not found.`,
        ErrorCodes.BOOKING_NOT_FOUND,
      );
    }

    const passengers = await this.passengerRepo.findByBookingId(booking.id);
    return { booking, passengers };
  }

  /**
   * Retrieves operational passenger manifest for a departure.
   * Strictly includes CONFIRMED passengers only.
   */
  async getDepartureManifest(departureId: string): Promise<DepartureManifestDto> {
    const manifest = await this.bookingService.getDepartureManifest(departureId);
    if (!manifest) {
      throw AppError.notFound(
        `Departure with ID '${departureId}' was not found or has no schedule.`,
        ErrorCodes.NOT_FOUND,
      );
    }

    return {
      departureId: manifest.departureId,
      packageId: manifest.packageId,
      packageTitle: manifest.packageTitle,
      departureDate: manifest.departureDate,
      returnDate: manifest.returnDate,
      totalCapacity: manifest.totalCapacity,
      bookedSeats: manifest.bookedSeats,
      totalPassengers: manifest.totalPassengers,
      adultPassengers: manifest.adultPassengers,
      childPassengers: manifest.childPassengers,
      passengers: manifest.passengers.map((p) => ({
        passengerId: p.passengerId,
        bookingReference: p.bookingReference,
        customerName: p.customerName,
        customerEmail: p.customerEmail,
        passengerType: p.passengerType,
        fullName: p.fullName,
        ageAtBooking: p.ageAtBooking,
        gender: p.gender,
        isPrimaryContact: p.isPrimaryContact,
        specialRequests: p.specialRequests,
        bookingStatus: p.bookingStatus,
      })),
    };
  }
}
