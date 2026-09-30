import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdminPackageService,
  AdminDepartureService,
  AdminBookingService,
  AdminCancellationService,
  AdminAuditLogService,
} from '../../backend/src/modules/admin/services/index.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { AppError } from '../../shared/src/index.js';

describe('Phase 7 Step 3 — Admin Domain Operations Services Unit Tests', () => {
  let mockAuditLogService: any;

  beforeEach(() => {
    mockAuditLogService = {
      logAction: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
    };
  });

  // ============================================================
  // 1. Admin Package Service
  // ============================================================
  describe('AdminPackageService', () => {
    let mockTourPackageService: any;
    let mockTourPackageRepo: any;
    let mockDestinationRepo: any;
    let mockItineraryRepo: any;
    let adminPackageService: AdminPackageService;

    const samplePackage = {
      id: 'pkg-1',
      destinationId: 'dest-1',
      title: 'Majestic Kerala Backwaters',
      slug: 'majestic-kerala',
      shortDescription: 'Short description of Kerala',
      description: 'Full description of Kerala tour',
      durationDays: 5,
      durationNights: 4,
      originCity: 'Kochi',
      destinationCity: 'Alleppey',
      baseAdultPrice: 1500000,
      heroImageUrl: 'https://images.unsplash.com/kerala.jpg',
      isPublished: false,
    };

    const sampleDestination = {
      id: 'dest-1',
      cityName: 'Kochi',
      isPublished: true,
    };

    const sampleItineraryDays = [
      {
        id: 'itin-1',
        packageId: 'pkg-1',
        dayNumber: 1,
        title: 'Arrival at Kochi',
        activityDescription: 'Welcome',
      },
      {
        id: 'itin-2',
        packageId: 'pkg-1',
        dayNumber: 2,
        title: 'Alleppey Houseboat',
        activityDescription: 'Cruise',
      },
    ];

    beforeEach(() => {
      mockTourPackageService = {
        create: vi.fn().mockResolvedValue({ ...samplePackage, isPublished: true }),
        update: vi.fn().mockResolvedValue({ ...samplePackage, isPublished: true }),
        setItinerary: vi.fn().mockResolvedValue(sampleItineraryDays),
        getById: vi.fn().mockResolvedValue(samplePackage),
        list: vi.fn().mockResolvedValue({ items: [samplePackage], total: 1 }),
      };
      mockTourPackageRepo = {
        findById: vi.fn().mockResolvedValue(samplePackage),
      };
      mockDestinationRepo = {
        findById: vi.fn().mockResolvedValue(sampleDestination),
      };
      mockItineraryRepo = {
        listByPackageId: vi.fn().mockResolvedValue(sampleItineraryDays),
      };

      adminPackageService = new AdminPackageService(
        mockTourPackageService,
        mockTourPackageRepo,
        mockDestinationRepo,
        mockItineraryRepo,
        mockAuditLogService as unknown as AdminAuditLogService,
      );
    });

    it('should create a package and trigger audit logging', async () => {
      const result = await adminPackageService.createPackage(
        'admin-uuid-1',
        {
          destinationId: 'dest-1',
          themeId: 'theme-1',
          title: 'Majestic Kerala Backwaters',
          slug: 'majestic-kerala',
          shortDescription: 'Short description of Kerala',
          description: 'Full description of Kerala tour',
          durationDays: 5,
          durationNights: 4,
          originCity: 'Kochi',
          destinationCity: 'Alleppey',
          baseAdultPrice: 1500000,
          heroImageUrl: 'https://images.unsplash.com/kerala.jpg',
        },
        '127.0.0.1',
      );

      expect(result.id).toBe('pkg-1');
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-uuid-1',
          action: 'PACKAGE_CREATE',
          entityType: 'PACKAGE',
        }),
      );
    });

    it('should publish a package when completeness invariant passes and record audit log', async () => {
      const result = await adminPackageService.setPublicationStatus(
        'admin-uuid-1',
        'pkg-1',
        true,
        '127.0.0.1',
      );

      expect(result.isPublished).toBe(true);
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PACKAGE_PUBLISH',
        }),
      );
    });

    it('should reject publication if package destination is unpublished', async () => {
      mockDestinationRepo.findById.mockResolvedValueOnce({
        ...sampleDestination,
        isPublished: false,
      });

      await expect(
        adminPackageService.setPublicationStatus('admin-uuid-1', 'pkg-1', true),
      ).rejects.toThrow(AppError);
    });

    it('should upsert itinerary and record audit log', async () => {
      const result = await adminPackageService.upsertItinerary(
        'admin-uuid-1',
        'pkg-1',
        [
          { dayNumber: 1, title: 'Arrival', activityDescription: 'Welcome to tour' },
          { dayNumber: 2, title: 'Safari', activityDescription: 'Jungle safari tour' },
        ],
        '127.0.0.1',
      );

      expect(result).toHaveLength(2);
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ITINERARY_UPDATE',
        }),
      );
    });
  });

  // ============================================================
  // 2. Admin Departure Service
  // ============================================================
  describe('AdminDepartureService', () => {
    let mockDepartureService: any;
    let mockDepartureRepo: any;
    let adminDepartureService: AdminDepartureService;

    const sampleDeparture = {
      id: 'dep-1',
      packageId: 'pkg-1',
      departureDate: '2026-10-15',
      returnDate: '2026-10-20',
      totalSeatCapacity: 30,
      bookedSeats: 0,
      status: 'OPEN' as const,
    };

    beforeEach(() => {
      mockDepartureService = {
        createDeparture: vi.fn().mockResolvedValue(sampleDeparture),
        updateDeparture: vi.fn().mockResolvedValue({ ...sampleDeparture, status: 'CLOSED' }),
        deleteDeparture: vi.fn().mockResolvedValue(undefined),
      };
      mockDepartureRepo = {
        listByPackageId: vi.fn().mockResolvedValue([sampleDeparture]),
        findById: vi.fn().mockResolvedValue(sampleDeparture),
      };

      adminDepartureService = new AdminDepartureService(
        mockDepartureService,
        mockDepartureRepo,
        mockAuditLogService as unknown as AdminAuditLogService,
      );
    });

    it('should schedule a departure and record audit log', async () => {
      const result = await adminDepartureService.createDeparture(
        'admin-uuid-1',
        {
          packageId: 'pkg-1',
          departureDate: '2026-10-15',
          returnDate: '2026-10-20',
          totalSeatCapacity: 30,
        },
        '127.0.0.1',
      );

      expect(result.id).toBe('dep-1');
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPARTURE_CREATE',
          entityType: 'DEPARTURE',
        }),
      );
    });

    it('should change departure status and record audit log', async () => {
      const result = await adminDepartureService.setDepartureStatus(
        'admin-uuid-1',
        'dep-1',
        'CLOSED',
        '127.0.0.1',
      );

      expect(result.status).toBe('CLOSED');
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPARTURE_UPDATE',
        }),
      );
    });
  });

  // ============================================================
  // 3. Admin Booking Service
  // ============================================================
  describe('AdminBookingService', () => {
    let mockBookingService: any;
    let mockBookingRepo: any;
    let mockPassengerRepo: any;
    let adminBookingService: AdminBookingService;

    const sampleManifest = {
      departureId: 'dep-1',
      packageId: 'pkg-1',
      packageTitle: 'Majestic Kerala',
      departureDate: '2026-10-15',
      returnDate: '2026-10-20',
      totalCapacity: 30,
      bookedSeats: 2,
      totalPassengers: 2,
      adultPassengers: 2,
      childPassengers: 0,
      passengers: [
        {
          passengerId: 'p-1',
          bookingReference: 'YTT-2026-ABC12',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          fullName: 'John Doe',
          passengerType: 'ADULT' as const,
          gender: 'MALE' as const,
          ageAtBooking: 32,
          isPrimaryContact: true,
          specialRequests: null,
          bookingStatus: 'CONFIRMED' as const,
        },
      ],
    };

    beforeEach(() => {
      mockBookingService = {
        listAdminBookings: vi.fn().mockResolvedValue({ bookings: [], total: 0 }),
        getDepartureManifest: vi.fn().mockResolvedValue(sampleManifest),
      };
      mockBookingRepo = {
        findById: vi.fn().mockResolvedValue({ id: 'b-1', reference: 'YTT-1' }),
        findByReference: vi.fn().mockResolvedValue({ id: 'b-1', reference: 'YTT-1' }),
      };
      mockPassengerRepo = {
        findByBookingId: vi.fn().mockResolvedValue([]),
      };

      adminBookingService = new AdminBookingService(
        mockBookingService,
        mockBookingRepo as unknown as BookingRepository,
        mockPassengerRepo as unknown as PassengerRepository,
      );
    });

    it('should retrieve confirmed departure passenger manifest', async () => {
      const manifest = await adminBookingService.getDepartureManifest('dep-1');

      expect(manifest.departureId).toBe('dep-1');
      expect(manifest.passengers).toHaveLength(1);
      expect(manifest.passengers[0]?.fullName).toBe('John Doe');
    });

    it('should throw NOT_FOUND if manifest is not found', async () => {
      mockBookingService.getDepartureManifest.mockResolvedValueOnce(null);

      await expect(adminBookingService.getDepartureManifest('non-existent')).rejects.toThrow(
        AppError,
      );
    });
  });

  // ============================================================
  // 4. Admin Cancellation Service
  // ============================================================
  describe('AdminCancellationService', () => {
    let mockCancellationService: any;
    let mockCancellationRepo: any;
    let mockBookingRepo: any;
    let adminCancellationService: AdminCancellationService;

    const sampleAuthResult = {
      cancellation: { id: 'canc-1', status: 'AUTHORIZED' },
      settlement: { id: 'settle-1', refundAmount: 750000, settlementStatus: 'SETTLED' },
      booking: { id: 'book-1' },
      payment: { id: 'pay-1' },
    };

    beforeEach(() => {
      mockCancellationService = {
        authorizeCancellation: vi.fn().mockResolvedValue(sampleAuthResult),
        rejectCancellation: vi.fn().mockResolvedValue({
          id: 'canc-1',
          bookingId: 'book-1',
          status: 'REJECTED',
        }),
      };
      mockCancellationRepo = {
        list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findById: vi.fn().mockResolvedValue({ id: 'canc-1', bookingId: 'book-1' }),
      };
      mockBookingRepo = {
        findById: vi.fn().mockResolvedValue({ id: 'book-1' }),
      };

      adminCancellationService = new AdminCancellationService(
        mockCancellationService,
        mockCancellationRepo,
        mockBookingRepo,
        mockAuditLogService as unknown as AdminAuditLogService,
      );
    });

    it('should authorize cancellation, invoke Phase 6 service, and record audit log', async () => {
      const result = await adminCancellationService.authorizeCancellation(
        'admin-uuid-1',
        'canc-1',
        { adminNotes: 'Approved refund per policy' },
        '127.0.0.1',
      );

      expect(result.cancellation.status).toBe('AUTHORIZED');
      expect(mockCancellationService.authorizeCancellation).toHaveBeenCalledWith({
        cancellationId: 'canc-1',
        adminId: 'admin-uuid-1',
        adminNotes: 'Approved refund per policy',
        overrideRefundAmount: undefined,
      });
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CANCELLATION_AUTHORIZE',
          entityType: 'CANCELLATION',
        }),
      );
    });

    it('should reject cancellation, invoke Phase 6 service, and record audit log', async () => {
      const result = await adminCancellationService.rejectCancellation(
        'admin-uuid-1',
        'canc-1',
        { adminNotes: 'Departure is within 24 hours' },
        '127.0.0.1',
      );

      expect(result.status).toBe('REJECTED');
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CANCELLATION_REJECT',
          entityType: 'CANCELLATION',
        }),
      );
    });

    it('should retrieve detailed cancellation request with associated booking', async () => {
      const details = await adminCancellationService.getCancellationDetails('canc-1');
      expect(details.request.id).toBe('canc-1');
      expect(details.booking?.id).toBe('book-1');
    });
  });
});
