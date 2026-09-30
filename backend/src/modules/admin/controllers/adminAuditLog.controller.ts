import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  adminAuditLogIdParamSchema,
  adminAuditLogListQuerySchema,
  AppError,
} from '../../../../../shared/src/index.js';
import { AdminAuditLogService } from '../services/adminAuditLog.service.js';

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

export class AdminAuditLogController {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  /**
   * GET /api/v1/admin/audit-logs
   * List and search append-only audit trail records.
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(adminAuditLogListQuerySchema, request.query, 'query');
    const result = await this.auditLogService.listLogs(query);

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
   * GET /api/v1/admin/audit-logs/:id
   * Inspect single audit log entry by ID.
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(adminAuditLogIdParamSchema, request.params, 'params');
    const log = await this.auditLogService.getLogById(id);

    return reply.status(200).send({
      success: true,
      data: log,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
