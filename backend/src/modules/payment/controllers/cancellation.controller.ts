import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  ErrorCodes,
  CancellationRequestDTO,
  RefundSettlementDTO,
  createCancellationRequestSchema,
  rejectCancellationRequestSchema,
  authorizeCancellationRequestSchema,
  cancellationListQuerySchema,
} from '../../../../../shared/src/index.js';
import { CancellationService } from '../services/cancellation.service.js';
import { CancellationRequestEntity } from '../repositories/cancellationRequest.repository.js';
import { RefundSettlementEntity } from '../repositories/refundSettlement.repository.js';

const bookingReferenceParamSchema = z.object({
  bookingReference: z
    .string({ required_error: 'Booking reference is required' })
    .trim()
    .min(1, 'Booking reference cannot be empty')
    .max(64, 'Booking reference must not exceed 64 characters'),
});

const cancellationIdParamSchema = z.object({
  cancellationId: z
    .string({ required_error: 'Cancellation ID is required' })
    .uuid('Invalid cancellation ID format'),
});

function parseZod<T>(schema: z.ZodType<T, any, any>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || context,
      issue: i.message,
    }));
    throw AppError.badRequest(`Request ${context} validation failed`, details);
  }
  return result.data;
}

function mapCancellationEntityToDto(
  entity: CancellationRequestEntity,
  bookingReference?: string,
): CancellationRequestDTO {
  return {
    id: entity.id,
    bookingId: entity.bookingId,
    bookingReference,
    requestedBy: entity.requestedBy,
    cancellationReason: entity.cancellationReason,
    calculatedRefundAmount: entity.calculatedRefundAmount,
    calculatedPenaltyAmount: entity.calculatedPenaltyAmount,
    status: entity.status,
    adminNotes: entity.adminNotes,
    authorizedBy: entity.authorizedBy,
    authorizedAt: entity.authorizedAt ? entity.authorizedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function mapSettlementEntityToDto(entity: RefundSettlementEntity): RefundSettlementDTO {
  return {
    id: entity.id,
    cancellationRequestId: entity.cancellationRequestId,
    paymentTransactionId: entity.paymentTransactionId,
    gatewayRefundId: entity.gatewayRefundId,
    refundAmount: entity.refundAmount,
    currency: entity.currency,
    settlementStatus: entity.settlementStatus,
    errorMessage: entity.errorMessage,
    processedAt: entity.processedAt ? entity.processedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class CancellationController {
  constructor(private readonly cancellationService: CancellationService) {}

  /**
   * POST /api/v1/bookings/:bookingReference/cancellation
   * Customer initiates a cancellation request.
   */
  requestCancellation = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.userId;
    if (!userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    const { bookingReference } = parseZod(bookingReferenceParamSchema, request.params, 'params');
    const body = parseZod(createCancellationRequestSchema, request.body, 'body');

    const entity = await this.cancellationService.requestCancellation({
      bookingReference,
      customerId: userId,
      reason: body.reason,
    });

    const data = mapCancellationEntityToDto(entity, bookingReference);

    return reply.status(201).send({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/bookings/:bookingReference/cancellation
   * Retrieve cancellation request and settlements for a booking.
   */
  getCancellationDetails = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.userId;
    if (!userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    const isAdmin = request.user?.role === 'ADMIN';
    const { bookingReference } = parseZod(bookingReferenceParamSchema, request.params, 'params');

    const result = await this.cancellationService.getCancellationDetails(
      bookingReference,
      userId,
      isAdmin,
    );

    const data = {
      request: mapCancellationEntityToDto(result.request, bookingReference),
      settlements: result.settlements.map(mapSettlementEntityToDto),
    };

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/cancellations
   * Admin lists cancellation requests with pagination and status filter.
   */
  listPendingCancellations = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (request.user?.role !== 'ADMIN') {
      throw AppError.forbidden('Admin access required', ErrorCodes.ACCESS_FORBIDDEN);
    }

    const query = parseZod(cancellationListQuerySchema, request.query, 'query');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.cancellationService.listPendingCancellations({
      page,
      limit,
      status: query.status,
    });

    const items = result.items.map((item) => mapCancellationEntityToDto(item));
    const totalPages = Math.ceil(result.total / limit) || 1;

    return reply.status(200).send({
      success: true,
      data: items,
      meta: {
        page,
        limit,
        totalItems: result.total,
        totalPages,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/cancellations/:cancellationId/authorize
   * Admin authorizes cancellation request, triggering gateway refund and seat release.
   */
  authorizeCancellation = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (request.user?.role !== 'ADMIN') {
      throw AppError.forbidden('Admin access required', ErrorCodes.ACCESS_FORBIDDEN);
    }

    const { cancellationId } = parseZod(cancellationIdParamSchema, request.params, 'params');
    const body = parseZod(authorizeCancellationRequestSchema, request.body ?? {}, 'body');

    const result = await this.cancellationService.authorizeCancellation({
      cancellationId,
      adminId: request.user.userId,
      adminNotes: body.adminNotes,
      overrideRefundAmount: body.overrideRefundAmount,
    });

    const data = {
      cancellation: mapCancellationEntityToDto(
        result.cancellation,
        result.booking.bookingReference,
      ),
      settlement: mapSettlementEntityToDto(result.settlement),
      bookingStatus: result.booking.status,
    };

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/cancellations/:cancellationId/reject
   * Admin rejects cancellation request.
   */
  rejectCancellation = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (request.user?.role !== 'ADMIN') {
      throw AppError.forbidden('Admin access required', ErrorCodes.ACCESS_FORBIDDEN);
    }

    const { cancellationId } = parseZod(cancellationIdParamSchema, request.params, 'params');
    const body = parseZod(rejectCancellationRequestSchema, request.body ?? {}, 'body');

    const result = await this.cancellationService.rejectCancellation({
      cancellationId,
      adminId: request.user.userId,
      adminNotes: body.adminNotes,
    });

    const data = mapCancellationEntityToDto(result);

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
