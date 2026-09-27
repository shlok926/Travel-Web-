import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancellationService } from '../../backend/src/modules/payment/services/cancellation.service.js';
import { CancellationPolicyEvaluator } from '../../backend/src/modules/payment/services/cancellationPolicy.js';

describe('Phase 6 Step 10 — CancellationService (Unit)', () => {
  let dbMock: any;
  let bookingRepoMock: any;
  let departureRepoMock: any;
  let cancellationRequestRepoMock: any;
  let refundSettlementRepoMock: any;
  let paymentTxRepoMock: any;
  let gatewayFactoryMock: any;
  let gatewayAdapterMock: any;
  let cancellationService: CancellationService;

  beforeEach(() => {
    dbMock = {
      withTransaction: vi.fn(async (cb: any) => cb({})),
    };

    bookingRepoMock = {
      findByReferenceAndCustomer: vi.fn(),
      findByReference: vi.fn(),
      findById: vi.fn(),
      updateStatusGuarded: vi.fn(),
    };

    departureRepoMock = {
      findById: vi.fn(),
      findByIdForUpdate: vi.fn(),
      decrementBookedSeats: vi.fn(),
    };

    cancellationRequestRepoMock = {
      create: vi.fn(),
      findById: vi.fn(),
      findByBookingId: vi.fn(),
      list: vi.fn(),
      updateStatusGuarded: vi.fn(),
    };

    refundSettlementRepoMock = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCancellationRequestId: vi.fn(),
    };

    paymentTxRepoMock = {
      findByBookingId: vi.fn(),
      findById: vi.fn(),
      updateStatusGuarded: vi.fn(),
      updateGatewayPayload: vi.fn(),
    };

    gatewayAdapterMock = {
      provider: 'MOCK',
      refundPayment: vi.fn(),
    };

    gatewayFactoryMock = {
      getAdapter: vi.fn().mockReturnValue(gatewayAdapterMock),
    };

    cancellationService = new CancellationService(
      dbMock,
      bookingRepoMock,
      departureRepoMock,
      cancellationRequestRepoMock,
      refundSettlementRepoMock,
      paymentTxRepoMock,
      gatewayFactoryMock,
      new CancellationPolicyEvaluator(),
    );
  });

  describe('requestCancellation', () => {
    it('should reject when booking is not found (IDOR protection)', async () => {
      bookingRepoMock.findByReferenceAndCustomer.mockResolvedValue(null);

      await expect(
        cancellationService.requestCancellation({
          bookingReference: 'BK-20260601-ABCD',
          customerId: 'user-123',
          reason: 'Personal reasons',
        }),
      ).rejects.toThrow('Booking not found');
    });

    it('should reject when booking is already CANCELLED', async () => {
      bookingRepoMock.findByReferenceAndCustomer.mockResolvedValue({
        id: 'b-1',
        status: 'CANCELLED',
      });

      await expect(
        cancellationService.requestCancellation({
          bookingReference: 'BK-20260601-ABCD',
          customerId: 'user-123',
          reason: 'Personal reasons',
        }),
      ).rejects.toThrow('Booking is already cancelled');
    });

    it('should reject when booking is in AWAITING_PAYMENT status', async () => {
      bookingRepoMock.findByReferenceAndCustomer.mockResolvedValue({
        id: 'b-1',
        status: 'AWAITING_PAYMENT',
      });

      await expect(
        cancellationService.requestCancellation({
          bookingReference: 'BK-20260601-ABCD',
          customerId: 'user-123',
          reason: 'Personal reasons',
        }),
      ).rejects.toThrow('Cannot cancel booking in status: AWAITING_PAYMENT');
    });

    it('should reject when an active cancellation request is already pending', async () => {
      bookingRepoMock.findByReferenceAndCustomer.mockResolvedValue({
        id: 'b-1',
        status: 'CONFIRMED',
      });
      cancellationRequestRepoMock.findByBookingId.mockResolvedValue([
        { id: 'c-1', status: 'PENDING_APPROVAL' },
      ]);

      await expect(
        cancellationService.requestCancellation({
          bookingReference: 'BK-20260601-ABCD',
          customerId: 'user-123',
          reason: 'Personal reasons',
        }),
      ).rejects.toThrow('A cancellation request is already pending approval or authorized');
    });

    it('should successfully create cancellation request with calculated amounts', async () => {
      const departureDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000); // 40 days ahead (90% refund)
      bookingRepoMock.findByReferenceAndCustomer.mockResolvedValue({
        id: 'b-1',
        bookingReference: 'BK-20260601-ABCD',
        customerId: 'user-123',
        status: 'CONFIRMED',
        totalPrice: 100000,
        departureId: 'dep-1',
        departureSnapshot: { departureDate },
      });
      cancellationRequestRepoMock.findByBookingId.mockResolvedValue([]);
      cancellationRequestRepoMock.create.mockImplementation(async (data: any) => ({
        id: 'cr-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await cancellationService.requestCancellation({
        bookingReference: 'BK-20260601-ABCD',
        customerId: 'user-123',
        reason: 'Change of travel plans',
      });

      expect(result.id).toBe('cr-1');
      expect(result.calculatedRefundAmount).toBe(90000);
      expect(result.calculatedPenaltyAmount).toBe(10000);
      expect(result.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('rejectCancellation', () => {
    it('should reject when cancellation request is not found', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue(null);

      await expect(
        cancellationService.rejectCancellation({
          cancellationId: 'cr-999',
          adminId: 'admin-1',
          adminNotes: 'Invalid request',
        }),
      ).rejects.toThrow('Cancellation request not found');
    });

    it('should reject when cancellation request is not in PENDING_APPROVAL status', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-1',
        status: 'AUTHORIZED',
      });

      await expect(
        cancellationService.rejectCancellation({
          cancellationId: 'cr-1',
          adminId: 'admin-1',
          adminNotes: 'Invalid request',
        }),
      ).rejects.toThrow('Cannot reject cancellation request in status: AUTHORIZED');
    });

    it('should update status to REJECTED on valid request', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-1',
        status: 'PENDING_APPROVAL',
      });
      cancellationRequestRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'cr-1',
        status: 'REJECTED',
        adminNotes: 'Trip non-cancellable per contract',
      });

      const result = await cancellationService.rejectCancellation({
        cancellationId: 'cr-1',
        adminId: 'admin-1',
        adminNotes: 'Trip non-cancellable per contract',
      });

      expect(result.status).toBe('REJECTED');
      expect(result.adminNotes).toBe('Trip non-cancellable per contract');
    });
  });

  describe('authorizeCancellation', () => {
    it('should reject when cancellation request is not found', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue(null);

      await expect(
        cancellationService.authorizeCancellation({
          cancellationId: 'cr-999',
          adminId: 'admin-1',
        }),
      ).rejects.toThrow('Cancellation request not found');
    });

    it('should reject when no successful payment transaction is found', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-1',
        bookingId: 'b-1',
        status: 'PENDING_APPROVAL',
        calculatedRefundAmount: 50000,
      });
      bookingRepoMock.findById.mockResolvedValue({
        id: 'b-1',
        status: 'CONFIRMED',
      });
      paymentTxRepoMock.findByBookingId.mockResolvedValue([{ id: 'tx-1', status: 'INITIATED' }]);

      await expect(
        cancellationService.authorizeCancellation({
          cancellationId: 'cr-1',
          adminId: 'admin-1',
        }),
      ).rejects.toThrow('No successful payment transaction found for this booking');
    });

    it('should execute full cancellation, refund gateway, and atomic seat release', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-1',
        bookingId: 'b-1',
        status: 'PENDING_APPROVAL',
        calculatedRefundAmount: 90000,
        calculatedPenaltyAmount: 10000,
        cancellationReason: 'Customer request',
      });
      bookingRepoMock.findById.mockResolvedValue({
        id: 'b-1',
        departureId: 'dep-1',
        partySize: 2,
        status: 'CONFIRMED',
      });
      paymentTxRepoMock.findByBookingId.mockResolvedValue([
        {
          id: 'tx-1',
          bookingId: 'b-1',
          amount: 100000,
          currency: 'INR',
          status: 'SUCCESS',
          provider: 'MOCK',
          gatewayPaymentId: 'pay_mock_123',
          gatewayOrderId: 'order_mock_123',
        },
      ]);
      gatewayAdapterMock.refundPayment.mockResolvedValue({
        provider: 'MOCK',
        gatewayRefundId: 'rfnd_mock_123',
        status: 'SETTLED',
        rawPayload: { id: 'rfnd_mock_123' },
      });

      departureRepoMock.findByIdForUpdate.mockResolvedValue({
        id: 'dep-1',
        bookedSeats: 5,
        totalSeatCapacity: 20,
      });
      cancellationRequestRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'cr-1',
        status: 'COMPLETED',
        calculatedRefundAmount: 90000,
      });
      refundSettlementRepoMock.create.mockResolvedValue({
        id: 'rs-1',
        cancellationRequestId: 'cr-1',
        gatewayRefundId: 'rfnd_mock_123',
        settlementStatus: 'SETTLED',
      });
      bookingRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'b-1',
        status: 'CANCELLED',
      });
      departureRepoMock.decrementBookedSeats.mockResolvedValue({
        id: 'dep-1',
        bookedSeats: 3,
      });
      paymentTxRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'tx-1',
        status: 'REFUNDED',
      });

      const result = await cancellationService.authorizeCancellation({
        cancellationId: 'cr-1',
        adminId: 'admin-1',
        adminNotes: 'Authorized by admin',
      });

      expect(gatewayAdapterMock.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayPaymentId: 'pay_mock_123',
          amount: 90000,
          currency: 'INR',
        }),
      );
      expect(departureRepoMock.decrementBookedSeats).toHaveBeenCalledWith(
        'dep-1',
        2,
        expect.anything(),
      );
      expect(result.cancellation.status).toBe('COMPLETED');
      expect(result.booking.status).toBe('CANCELLED');
      expect(result.settlement.settlementStatus).toBe('SETTLED');
    });

    it('should safely handle ambiguous gateway timeout by recording PROCESSING and transitioning request to AUTHORIZED', async () => {
      const { AppError, ErrorCodes } = await import('../../shared/src/index.js');
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-timeout-1',
        bookingId: 'b-timeout-1',
        status: 'PENDING_APPROVAL',
        calculatedRefundAmount: 50000,
        calculatedPenaltyAmount: 50000,
        cancellationReason: 'Ambiguous test',
      });
      bookingRepoMock.findById.mockResolvedValue({
        id: 'b-timeout-1',
        departureId: 'dep-1',
        partySize: 2,
        status: 'CONFIRMED',
      });
      paymentTxRepoMock.findByBookingId.mockResolvedValue([
        {
          id: 'tx-timeout-1',
          bookingId: 'b-timeout-1',
          amount: 100000,
          currency: 'INR',
          status: 'SUCCESS',
          provider: 'MOCK',
          gatewayPaymentId: 'pay_mock_TIMEOUT_123',
        },
      ]);
      refundSettlementRepoMock.findByCancellationRequestId.mockResolvedValue([]);

      // Gateway throws network timeout (503)
      gatewayAdapterMock.refundPayment.mockRejectedValue(
        new AppError('Gateway timeout / connection failure', 503, ErrorCodes.SERVICE_UNAVAILABLE),
      );

      departureRepoMock.findByIdForUpdate.mockResolvedValue({
        id: 'dep-1',
        bookedSeats: 5,
        totalSeatCapacity: 20,
      });
      cancellationRequestRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'cr-timeout-1',
        status: 'AUTHORIZED',
        calculatedRefundAmount: 50000,
      });
      refundSettlementRepoMock.create.mockResolvedValue({
        id: 'rs-timeout-1',
        cancellationRequestId: 'cr-timeout-1',
        gatewayRefundId: null,
        settlementStatus: 'PROCESSING',
      });
      bookingRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'b-timeout-1',
        status: 'CANCELLED',
      });
      departureRepoMock.decrementBookedSeats.mockResolvedValue({
        id: 'dep-1',
        bookedSeats: 3,
      });
      paymentTxRepoMock.updateStatusGuarded.mockResolvedValue({
        id: 'tx-timeout-1',
        status: 'REFUNDED',
      });

      const result = await cancellationService.authorizeCancellation({
        cancellationId: 'cr-timeout-1',
        adminId: 'admin-1',
      });

      // Assertions: Ambiguous timeout does NOT crash, records PROCESSING, AUTHORIZES cancellation,
      // but keeps booking CONFIRMED, payment SUCCESS, and seats RESERVED (no premature release).
      expect(result.cancellation.status).toBe('AUTHORIZED');
      expect(result.settlement.settlementStatus).toBe('PROCESSING');
      expect(result.booking.status).toBe('CONFIRMED');
      expect(result.payment?.status).toBe('SUCCESS');
      expect(cancellationRequestRepoMock.updateStatusGuarded).toHaveBeenCalledWith(
        'cr-timeout-1',
        'PENDING_APPROVAL',
        'AUTHORIZED',
        expect.anything(),
        expect.anything(),
      );
      expect(refundSettlementRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settlementStatus: 'PROCESSING',
          gatewayRefundId: null,
        }),
        expect.anything(),
      );
      expect(bookingRepoMock.updateStatusGuarded).not.toHaveBeenCalled();
      expect(departureRepoMock.decrementBookedSeats).not.toHaveBeenCalled();
      expect(paymentTxRepoMock.updateStatusGuarded).not.toHaveBeenCalled();
    });

    it('should handle explicit gateway rejection by recording FAILED and keeping booking CONFIRMED', async () => {
      const { AppError, ErrorCodes } = await import('../../shared/src/index.js');
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-reject-1',
        bookingId: 'b-reject-1',
        status: 'PENDING_APPROVAL',
        calculatedRefundAmount: 50000,
        cancellationReason: 'Rejection test',
      });
      bookingRepoMock.findById.mockResolvedValue({
        id: 'b-reject-1',
        departureId: 'dep-1',
        partySize: 2,
        status: 'CONFIRMED',
      });
      paymentTxRepoMock.findByBookingId.mockResolvedValue([
        {
          id: 'tx-reject-1',
          bookingId: 'b-reject-1',
          amount: 100000,
          currency: 'INR',
          status: 'SUCCESS',
          provider: 'MOCK',
          gatewayPaymentId: 'pay_mock_FAIL_REFUND_123',
        },
      ]);
      refundSettlementRepoMock.findByCancellationRequestId.mockResolvedValue([]);

      gatewayAdapterMock.refundPayment.mockRejectedValue(
        new AppError('Gateway card refund rejected', 400, ErrorCodes.REFUND_FAILED),
      );

      await expect(
        cancellationService.authorizeCancellation({
          cancellationId: 'cr-reject-1',
          adminId: 'admin-1',
        }),
      ).rejects.toThrow('Gateway card refund rejected');

      // Verify FAILED record was created
      expect(refundSettlementRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settlementStatus: 'FAILED',
        }),
      );
      // Verify DB transaction was NOT run to mutate booking or decrement seats
      expect(departureRepoMock.decrementBookedSeats).not.toHaveBeenCalled();
      expect(bookingRepoMock.updateStatusGuarded).not.toHaveBeenCalled();
    });

    it('should reject authorization when a PROCESSING settlement is already in-flight', async () => {
      cancellationRequestRepoMock.findById.mockResolvedValue({
        id: 'cr-inflight-1',
        bookingId: 'b-inflight-1',
        status: 'PENDING_APPROVAL',
        calculatedRefundAmount: 50000,
      });
      bookingRepoMock.findById.mockResolvedValue({
        id: 'b-inflight-1',
        status: 'CONFIRMED',
      });
      paymentTxRepoMock.findByBookingId.mockResolvedValue([
        {
          id: 'tx-1',
          amount: 100000,
          status: 'SUCCESS',
        },
      ]);
      refundSettlementRepoMock.findByCancellationRequestId.mockResolvedValue([
        { id: 'rs-1', settlementStatus: 'PROCESSING' },
      ]);

      await expect(
        cancellationService.authorizeCancellation({
          cancellationId: 'cr-inflight-1',
          adminId: 'admin-1',
        }),
      ).rejects.toThrow(
        'A refund settlement is already in-flight or processing for this cancellation request',
      );
    });
  });
});
