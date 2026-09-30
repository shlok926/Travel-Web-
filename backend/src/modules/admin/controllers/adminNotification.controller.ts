import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  adminNotificationIdParamSchema,
  adminNotificationListQuerySchema,
  adminNotificationResendRequestSchema,
  AppError,
} from '../../../../../shared/src/index.js';
import { AdminNotificationService } from '../services/adminNotification.service.js';

// ============================================================
// Phase 8 Step 7 — Admin Notification Operations Controller
// ============================================================

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

export class AdminNotificationController {
  constructor(private readonly notificationService: AdminNotificationService) {}

  /**
   * GET /api/v1/admin/notifications
   * List and filter notification delivery records with deterministic pagination.
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(adminNotificationListQuerySchema, request.query, 'query');
    const result = await this.notificationService.listNotifications(query);

    return reply.status(200).send({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/notifications/:id
   * Inspect individual notification delivery record by primary UUID.
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(adminNotificationIdParamSchema, request.params, 'params');
    const notification = await this.notificationService.getNotificationById(id);

    return reply.status(200).send({
      success: true,
      data: notification,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/notifications/:id/resend
   * Request administrative manual resend of an existing notification record.
   */
  resend = async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(adminNotificationIdParamSchema, request.params, 'params');
    // Enforce strictly empty body to prohibit administrator overrides
    parseZod(adminNotificationResendRequestSchema, request.body ?? {}, 'body');

    // 1. Idempotency-Key Header extraction & validation
    const rawIdempotencyKey = request.headers['idempotency-key'];
    if (
      !rawIdempotencyKey ||
      typeof rawIdempotencyKey !== 'string' ||
      rawIdempotencyKey.trim().length === 0
    ) {
      throw AppError.badRequest('Idempotency-Key header is required', [
        { field: 'idempotency-key', issue: 'Header is missing or empty' },
      ]);
    }

    const idempotencyKey = rawIdempotencyKey.trim();
    if (idempotencyKey.length > 128) {
      throw AppError.badRequest('Idempotency-Key header must not exceed 128 characters', [
        { field: 'idempotency-key', issue: 'Length exceeds 128 characters' },
      ]);
    }

    const adminId = request.user?.userId;
    if (!adminId) {
      throw AppError.unauthorized('Authenticated administrator identity required');
    }

    const result = await this.notificationService.resendNotification(
      id,
      adminId,
      idempotencyKey,
      request.ip,
    );

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
