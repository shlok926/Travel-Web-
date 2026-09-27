import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../../backend/src/modules/payment/services/payment.service.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { PaymentGatewayFactory } from '../../backend/src/modules/payment/adapters/paymentGateway.factory.js';
import { BookingService } from '../../backend/src/modules/booking/services/booking.service.js';
import { MockPaymentGatewayAdapter } from '../../backend/src/modules/payment/adapters/mock.adapter.js';
import { AppError, ErrorCodes } from '../../shared/src/index.js';

describe('Phase 6 Step 5 — Payment Domain Service (Unit & Invariants)', () => {
  let paymentTxRepo: PaymentTransactionRepository;
  let gatewayFactory: PaymentGatewayFactory;
  let bookingService: BookingService;
  let paymentService: PaymentService;
  let mockAdapter: MockPaymentGatewayAdapter;

  const sampleBooking = {
    id: '11111111-1111-1111-1111-111111111111',
    bookingReference: 'BK-20261115-UNIT',
    customerId: 'user-123',
    departureId: 'dep-123',
    holdId: 'hold-123',
    partySize: 2,
    adultCount: 2,
    childCount: 0,
    totalPrice: 6000000, // 60,000 INR
    currency: 'INR' as const,
    status: 'AWAITING_PAYMENT' as const,
    priceBreakdown: {} as any,
    packageSnapshot: { title: 'Kashmir Delight' } as any,
    departureSnapshot: { departureDate: '2026-12-01', returnDate: '2026-12-05' } as any,
    itinerarySnapshot: [] as any,
    primaryContact: {
      name: 'Test Customer',
      email: 'customer@example.com',
      phone: '+919876543210',
    },
    cancellationReason: null,
    cancelledAt: null,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleTx = {
    id: '22222222-2222-2222-2222-222222222222',
    bookingId: sampleBooking.id,
    provider: 'MOCK' as const,
    gatewayOrderId: 'order_mock_test123',
    gatewayPaymentId: null,
    amount: 6000000,
    currency: 'INR' as const,
    status: 'INITIATED' as const,
    idempotencyKey: 'idemp-unit-1',
    gatewayResponsePayload: { orderId: 'order_mock_test123' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    paymentTxRepo = {
      create: vi.fn().mockResolvedValue(sampleTx),
      findById: vi.fn().mockResolvedValue(sampleTx),
      findByBookingId: vi.fn().mockResolvedValue([sampleTx]),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findByProviderOrderId: vi.fn().mockResolvedValue(sampleTx),
      findByProviderPaymentId: vi.fn().mockResolvedValue(sampleTx),
      updateStatusGuarded: vi.fn().mockResolvedValue({ ...sampleTx, status: 'PENDING' }),
      updateGatewayIdentifiers: vi.fn().mockResolvedValue(sampleTx),
      updateGatewayPayload: vi.fn().mockResolvedValue(sampleTx),
    } as unknown as PaymentTransactionRepository;

    mockAdapter = new MockPaymentGatewayAdapter();

    gatewayFactory = {
      getAdapter: vi.fn().mockReturnValue(mockAdapter),
      getRegisteredProviders: vi.fn().mockReturnValue(['MOCK', 'RAZORPAY', 'STRIPE']),
    } as unknown as PaymentGatewayFactory;

    bookingService = {
      getBookingByReference: vi.fn().mockResolvedValue({
        booking: sampleBooking,
        passengers: [],
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(), // 10 mins in future
      }),
    } as unknown as BookingService;

    paymentService = new PaymentService(paymentTxRepo, gatewayFactory, bookingService);
  });

  // ============================================================
  // 1. Authoritative Amount & Currency Invariants
  // ============================================================
  describe('1. Authoritative Pricing & Initiation Flow', () => {
    it('1.1 derives amount and currency strictly from booking snapshot and creates transaction', async () => {
      const result = await paymentService.initiatePayment({
        userId: 'user-123',
        bookingReference: 'BK-20261115-UNIT',
      });

      expect(result.amount).toBe(6000000); // 60,000 INR
      expect(result.currency).toBe('INR');
      expect(result.bookingReference).toBe('BK-20261115-UNIT');
      expect(result.provider).toBe('MOCK');
      expect(paymentTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: sampleBooking.id,
          amount: 6000000,
          currency: 'INR',
          status: 'INITIATED',
        }),
      );
    });

    it('1.1b regression: preserves canonical integer minor units (150000 paise = ₹1,500.00) without 100x multiplication', async () => {
      const bookingWith1500 = {
        ...sampleBooking,
        totalPrice: 150000, // 150000 paise (₹1,500.00)
      };

      vi.spyOn(bookingService, 'getBookingByReference').mockResolvedValueOnce({
        booking: bookingWith1500,
        passengers: [],
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
      });

      const adapterSpy = vi.spyOn(mockAdapter, 'createPaymentOrder');

      const result = await paymentService.initiatePayment({
        userId: 'user-123',
        bookingReference: 'BK-20261115-UNIT',
      });

      // 1. Transaction creation receives exactly 150000 (NOT 15000000)
      expect(paymentTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          currency: 'INR',
        }),
      );

      // 2. Gateway adapter receives exactly 150000 (NOT 15000000)
      expect(adapterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          currency: 'INR',
        }),
      );

      // 3. Returned payload contains exactly 150000
      expect(result.amount).toBe(150000);
      expect(result.amount).not.toBe(15000000);
    });

    it('1.2 rejects payment initiation when booking is already CONFIRMED', async () => {
      vi.spyOn(bookingService, 'getBookingByReference').mockResolvedValueOnce({
        booking: { ...sampleBooking, status: 'CONFIRMED' as any },
        passengers: [],
        holdExpiresAt: null,
      });

      try {
        await paymentService.initiatePayment({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_ALREADY_PROCESSED);
      }
    });

    it('1.3 rejects payment initiation when booking is CANCELLED or EXPIRED', async () => {
      vi.spyOn(bookingService, 'getBookingByReference').mockResolvedValueOnce({
        booking: { ...sampleBooking, status: 'CANCELLED' as any },
        passengers: [],
        holdExpiresAt: null,
      });

      try {
        await paymentService.initiatePayment({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_INVALID_STATE);
      }
    });

    it('1.4 rejects payment initiation when inventory hold is expired', async () => {
      vi.spyOn(bookingService, 'getBookingByReference').mockResolvedValueOnce({
        booking: sampleBooking,
        passengers: [],
        holdExpiresAt: new Date(Date.now() - 60000).toISOString(), // expired 1 minute ago
      });

      try {
        await paymentService.initiatePayment({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.INVENTORY_HOLD_EXPIRED);
      }
    });
  });

  // ============================================================
  // 2. Idempotency Invariants
  // ============================================================
  describe('2. Idempotency Invariants', () => {
    it('2.1 returns idempotent replay when identical request is sent with same idempotency key', async () => {
      vi.spyOn(paymentTxRepo, 'findByIdempotencyKey').mockResolvedValueOnce(sampleTx);

      const result = await paymentService.initiatePayment({
        userId: 'user-123',
        bookingReference: 'BK-20261115-UNIT',
        idempotencyKey: 'idemp-unit-1',
      });

      expect(result.paymentId).toBe(sampleTx.id);
      expect(result.amount).toBe(sampleTx.amount);
      expect(paymentTxRepo.create).not.toHaveBeenCalled();
    });

    it('2.2 throws IDEMPOTENCY_CONFLICT when key is reused with different booking or parameters', async () => {
      vi.spyOn(paymentTxRepo, 'findByIdempotencyKey').mockResolvedValueOnce({
        ...sampleTx,
        bookingId: 'different-booking-id',
      });

      try {
        await paymentService.initiatePayment({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
          idempotencyKey: 'idemp-unit-1',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.IDEMPOTENCY_CONFLICT);
      }
    });
  });

  // ============================================================
  // 3. Gateway Failure Handling
  // ============================================================
  describe('3. Gateway Failure Handling', () => {
    it('3.1 marks transaction FAILED and re-throws when gateway order creation fails', async () => {
      vi.spyOn(mockAdapter, 'createPaymentOrder').mockRejectedValueOnce(
        new AppError('Gateway rejected order', 400, ErrorCodes.PAYMENT_GATEWAY_REJECTED),
      );

      try {
        await paymentService.initiatePayment({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_GATEWAY_REJECTED);
        expect(paymentTxRepo.updateStatusGuarded).toHaveBeenCalledWith(
          sampleTx.id,
          'INITIATED',
          'FAILED',
        );
      }
    });
  });

  // ============================================================
  // 4. Payment Status Query
  // ============================================================
  describe('4. Payment Status Query', () => {
    it('4.1 retrieves payment status for existing transaction', async () => {
      const status = await paymentService.getPaymentStatus({
        userId: 'user-123',
        bookingReference: 'BK-20261115-UNIT',
      });

      expect(status.paymentId).toBe(sampleTx.id);
      expect(status.bookingReference).toBe('BK-20261115-UNIT');
      expect(status.amount).toBe(6000000);
      expect(status.currency).toBe('INR');
      expect(status.status).toBe('INITIATED');
    });

    it('4.2 throws PAYMENT_NOT_FOUND when no transaction exists for booking', async () => {
      vi.spyOn(paymentTxRepo, 'findByBookingId').mockResolvedValueOnce([]);

      try {
        await paymentService.getPaymentStatus({
          userId: 'user-123',
          bookingReference: 'BK-20261115-UNIT',
        });
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.PAYMENT_NOT_FOUND);
      }
    });
  });
});
