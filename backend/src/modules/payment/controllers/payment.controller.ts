import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  ErrorCodes,
  initiatePaymentRequestSchema,
  InitiatePaymentResponse,
  PaymentStatusResponse,
} from '../../../../../shared/src/index.js';
import { PaymentService } from '../services/payment.service.js';

const paymentBookingParamSchema = z.object({
  bookingReference: z
    .string({ required_error: 'Booking reference is required' })
    .trim()
    .min(1, 'Booking reference cannot be empty')
    .max(64, 'Booking reference must not exceed 64 characters'),
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

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/v1/payments/initiate
   * Initiates payment order with the selected/default payment gateway.
   */
  initiatePayment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.userId;
    if (!userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    // 1. Extract optional Idempotency-Key header
    const rawIdempotencyKey = request.headers['idempotency-key'];
    let idempotencyKey: string | undefined;

    if (typeof rawIdempotencyKey === 'string' && rawIdempotencyKey.trim().length > 0) {
      idempotencyKey = rawIdempotencyKey.trim();
      if (idempotencyKey.length > 128) {
        throw AppError.badRequest('Idempotency-Key header must not exceed 128 characters', [
          { field: 'idempotency-key', issue: 'Length exceeds 128 characters' },
        ]);
      }
    }

    // 2. Validate request body against canonical initiatePaymentRequestSchema
    const body = parseZod(initiatePaymentRequestSchema, request.body, 'body');

    // 3. Initiate payment via PaymentService
    const result: InitiatePaymentResponse = await this.paymentService.initiatePayment({
      userId,
      bookingReference: body.bookingReference,
      provider: body.provider,
      idempotencyKey,
    });

    return reply.status(201).send({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/payments/:bookingReference/status
   * Retrieves current payment status for an authenticated customer's booking.
   */
  getPaymentStatus = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.userId;
    if (!userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    const { bookingReference } = parseZod(paymentBookingParamSchema, request.params, 'params');

    const result: PaymentStatusResponse = await this.paymentService.getPaymentStatus({
      userId,
      bookingReference,
    });

    return reply.status(200).send({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
