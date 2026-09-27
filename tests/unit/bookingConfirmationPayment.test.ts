import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingService } from '../../backend/src/modules/booking/services/booking.service.js';
import {
  BookingRepository,
  BookingEntity,
} from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { IdempotencyRepository } from '../../backend/src/modules/booking/repositories/idempotency.repository.js';
import {
  DepartureRepository,
  DepartureEntity,
} from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import {
  InventoryHoldRepository,
  InventoryHoldEntity,
} from '../../backend/src/modules/inventory/repositories/inventoryHold.repository.js';
import { TourPackageRepository } from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import { ItineraryRepository } from '../../backend/src/modules/catalogue/repositories/itinerary.repository.js';
import { DestinationRepository } from '../../backend/src/modules/catalogue/repositories/destination.repository.js';
import {
  PaymentTransactionRepository,
  PaymentTransactionEntity,
} from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { ErrorCodes } from '../../shared/src/index.js';

describe('Phase 6 Step 7 — Verified Payment to Booking Confirmation (Unit Tests)', () => {
  let db: DatabaseService;
  let mockBookingRepo: BookingRepository;
  let mockPassengerRepo: PassengerRepository;
  let mockIdempotencyRepo: IdempotencyRepository;
  let mockDepartureRepo: DepartureRepository;
  let mockInventoryHoldRepo: InventoryHoldRepository;
  let mockPackageRepo: TourPackageRepository;
  let mockItineraryRepo: ItineraryRepository;
  let mockDestinationRepo: DestinationRepository;
  let mockPaymentTxRepo: PaymentTransactionRepository;
  let bookingService: BookingService;

  const sampleBookingId = 'b1111111-1111-1111-1111-111111111111';
  const sampleDepartureId = 'd2222222-2222-2222-2222-222222222222';
  const sampleHoldId = 'h3333333-3333-3333-3333-333333333333';
  const samplePaymentId = 'p4444444-4444-4444-4444-444444444444';

  const sampleBooking: BookingEntity = {
    id: sampleBookingId,
    bookingReference: 'BK-20261115-A1B2',
    customerId: 'u5555555-5555-5555-5555-555555555555',
    departureId: sampleDepartureId,
    holdId: sampleHoldId,
    partySize: 2,
    adultCount: 2,
    childCount: 0,
    totalPrice: 150000, // 150000 minor units (₹1,500.00)
    currency: 'INR',
    status: 'AWAITING_PAYMENT',
    priceBreakdown: {} as any,
    packageSnapshot: {} as any,
    departureSnapshot: {} as any,
    itinerarySnapshot: [],
    primaryContact: { name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleDeparture: DepartureEntity = {
    id: sampleDepartureId,
    packageId: 'pkg-1',
    departureDate: '2026-11-15',
    returnDate: '2026-11-20',
    totalSeatCapacity: 20,
    bookedSeats: 5,
    priceOverrideAdult: null,
    priceOverrideChild: null,
    currency: 'INR',
    status: 'OPEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleHold: InventoryHoldEntity = {
    id: sampleHoldId,
    departureId: sampleDepartureId,
    checkoutSessionToken: 'tok-123',
    userId: 'u5555555-5555-5555-5555-555555555555',
    heldSeats: 2,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins in future
    createdAt: new Date(),
  };

  const samplePaymentTx: PaymentTransactionEntity = {
    id: samplePaymentId,
    bookingId: sampleBookingId,
    provider: 'MOCK',
    gatewayOrderId: 'ord_123',
    gatewayPaymentId: 'pay_123',
    amount: 150000,
    currency: 'INR',
    status: 'SUCCESS',
    idempotencyKey: 'idemp-1',
    gatewayResponsePayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    db = {
      withTransaction: vi.fn().mockImplementation(async (cb) => cb({})),
      query: vi.fn(),
    } as unknown as DatabaseService;

    mockBookingRepo = {
      findById: vi.fn().mockResolvedValue(sampleBooking),
      updateStatusGuarded: vi.fn().mockResolvedValue({
        ...sampleBooking,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      }),
    } as unknown as BookingRepository;

    mockPassengerRepo = {} as unknown as PassengerRepository;
    mockIdempotencyRepo = {} as unknown as IdempotencyRepository;

    mockDepartureRepo = {
      findByIdForUpdate: vi.fn().mockResolvedValue(sampleDeparture),
      incrementBookedSeats: vi.fn().mockResolvedValue({
        ...sampleDeparture,
        bookedSeats: sampleDeparture.bookedSeats + 2,
      }),
    } as unknown as DepartureRepository;

    mockInventoryHoldRepo = {
      findById: vi.fn().mockResolvedValue(sampleHold),
      updateStatusGuarded: vi.fn().mockResolvedValue({
        ...sampleHold,
        status: 'COMMITTED',
      }),
    } as unknown as InventoryHoldRepository;

    mockPackageRepo = {} as unknown as TourPackageRepository;
    mockItineraryRepo = {} as unknown as ItineraryRepository;
    mockDestinationRepo = {} as unknown as DestinationRepository;

    mockPaymentTxRepo = {
      findById: vi.fn().mockResolvedValue(samplePaymentTx),
      findByBookingId: vi.fn().mockResolvedValue([samplePaymentTx]),
    } as unknown as PaymentTransactionRepository;

    bookingService = new BookingService(
      db,
      mockBookingRepo,
      mockPassengerRepo,
      mockIdempotencyRepo,
      mockDepartureRepo,
      mockInventoryHoldRepo,
      mockPackageRepo,
      mockItineraryRepo,
      mockDestinationRepo,
      mockPaymentTxRepo,
    );
  });

  // ============================================================
  // 1. Core Confirmation & Invariant Tests
  // ============================================================
  describe('1. Authoritative Successful Confirmation', () => {
    it('1.1 confirms booking, commits hold, and increments departure booked seats', async () => {
      const result = await bookingService.confirmBooking({
        bookingId: sampleBookingId,
        paymentVerified: true,
        paymentTransactionId: samplePaymentId,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(mockDepartureRepo.findByIdForUpdate).toHaveBeenCalledWith(
        sampleDepartureId,
        expect.anything(),
      );
      expect(mockBookingRepo.updateStatusGuarded).toHaveBeenCalledWith(
        sampleBookingId,
        'AWAITING_PAYMENT',
        'CONFIRMED',
        expect.anything(),
        expect.anything(),
      );
      expect(mockInventoryHoldRepo.updateStatusGuarded).toHaveBeenCalledWith(
        sampleHoldId,
        'ACTIVE',
        'COMMITTED',
        expect.anything(),
      );
      expect(mockDepartureRepo.incrementBookedSeats).toHaveBeenCalledWith(
        sampleDepartureId,
        2,
        expect.anything(),
      );
    });

    it('1.2 returns existing booking idempotently if already CONFIRMED', async () => {
      vi.mocked(mockBookingRepo.findById).mockResolvedValueOnce({
        ...sampleBooking,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      });

      const result = await bookingService.confirmBooking({
        bookingId: sampleBookingId,
        paymentVerified: true,
        paymentTransactionId: samplePaymentId,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(mockBookingRepo.updateStatusGuarded).not.toHaveBeenCalled();
      expect(mockInventoryHoldRepo.updateStatusGuarded).not.toHaveBeenCalled();
      expect(mockDepartureRepo.incrementBookedSeats).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. Payment Transaction Integrity Validation
  // ============================================================
  describe('2. Payment Validation Invariants', () => {
    it('2.1 rejects confirmation when paymentVerified is false', async () => {
      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: false,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.BOOKING_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });

    it('2.2 rejects confirmation when payment status is not SUCCESS (e.g. PENDING)', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        status: 'PENDING',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_INVALID_STATE,
          statusCode: 400,
        }),
      );
      expect(mockBookingRepo.updateStatusGuarded).not.toHaveBeenCalled();
    });

    it('2.3 rejects confirmation when payment status is FAILED', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        status: 'FAILED',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });

    it('2.4 rejects confirmation when payment status is REFUNDED', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        status: 'REFUNDED',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });

    it('2.5 rejects confirmation when payment belongs to another booking', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        bookingId: 'other-booking-uuid-9999',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });

    it('2.6 rejects confirmation when payment amount does not match booking total price', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        amount: 140000, // Expected 150000
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_AMOUNT_MISMATCH,
          statusCode: 400,
        }),
      );
    });

    it('2.7 rejects confirmation when payment currency does not match booking currency', async () => {
      vi.mocked(mockPaymentTxRepo.findById).mockResolvedValueOnce({
        ...samplePaymentTx,
        currency: 'USD', // Expected INR
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.PAYMENT_CURRENCY_MISMATCH,
          statusCode: 400,
        }),
      );
    });
  });

  // ============================================================
  // 3. Inventory Hold & Capacity Validation
  // ============================================================
  describe('3. Inventory Hold & Capacity Validation', () => {
    it('3.1 rejects confirmation if inventory hold has expired', async () => {
      vi.mocked(mockInventoryHoldRepo.findById).mockResolvedValueOnce({
        ...sampleHold,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.INVENTORY_HOLD_EXPIRED,
          statusCode: 400,
        }),
      );
    });

    it('3.2 rejects confirmation if inventory hold status is not ACTIVE (e.g. EXPIRED)', async () => {
      vi.mocked(mockInventoryHoldRepo.findById).mockResolvedValueOnce({
        ...sampleHold,
        status: 'EXPIRED',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.INVENTORY_HOLD_EXPIRED,
          statusCode: 400,
        }),
      );
    });

    it('3.3 rejects confirmation if inventory hold belongs to another departure', async () => {
      vi.mocked(mockInventoryHoldRepo.findById).mockResolvedValueOnce({
        ...sampleHold,
        departureId: 'other-departure-uuid-8888',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.VALIDATION_ERROR,
          statusCode: 400,
        }),
      );
    });

    it('3.4 rejects confirmation if inventory hold seat count does not match party size', async () => {
      vi.mocked(mockInventoryHoldRepo.findById).mockResolvedValueOnce({
        ...sampleHold,
        heldSeats: 3, // Expected 2
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.VALIDATION_ERROR,
          statusCode: 400,
        }),
      );
    });

    it('3.5 rejects confirmation if departure seat capacity would be exceeded', async () => {
      vi.mocked(mockDepartureRepo.findByIdForUpdate).mockResolvedValueOnce({
        ...sampleDeparture,
        totalSeatCapacity: 10,
        bookedSeats: 9, // Adding 2 would exceed capacity 10
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.INVENTORY_CAPACITY_EXCEEDED,
          statusCode: 400,
        }),
      );
    });
  });

  // ============================================================
  // 4. Booking State Lifecycle Validation
  // ============================================================
  describe('4. Booking Lifecycle Constraints', () => {
    it('4.1 rejects confirmation if booking is in EXPIRED state (forbidden transition)', async () => {
      vi.mocked(mockBookingRepo.findById).mockResolvedValueOnce({
        ...sampleBooking,
        status: 'EXPIRED',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.BOOKING_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });

    it('4.2 rejects confirmation if booking is in CANCELLED state (forbidden transition)', async () => {
      vi.mocked(mockBookingRepo.findById).mockResolvedValueOnce({
        ...sampleBooking,
        status: 'CANCELLED',
      });

      await expect(
        bookingService.confirmBooking({
          bookingId: sampleBookingId,
          paymentVerified: true,
          paymentTransactionId: samplePaymentId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCodes.BOOKING_INVALID_STATE,
          statusCode: 400,
        }),
      );
    });
  });
});
