import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  createDepartureSchema,
  updateDepartureSchema,
} from '../../../../../shared/src/index.js';
import { DepartureService } from '../services/departure.service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Departure ID must be a valid UUID'),
});

const packageIdParamSchema = z.object({
  packageId: z.string().uuid('Package ID must be a valid UUID'),
});

const departureListQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED']).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'From date must be in YYYY-MM-DD format')
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'To date must be in YYYY-MM-DD format')
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

export class AdminDepartureController {
  constructor(private readonly departureService: DepartureService) {}

  /**
   * GET /api/v1/admin/packages/:packageId/departures
   * List all departures for a tour package (including closed, cancelled, and historical).
   */
  listByPackage = async (
    request: FastifyRequest<{ Params: { packageId: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { packageId } = parseZod(packageIdParamSchema, request.params, 'params');
    const query = parseZod(departureListQuerySchema, request.query, 'query');

    const departures = await this.departureService.listDeparturesForPackage(packageId, query);

    return reply.status(200).send({
      success: true,
      data: departures,
      meta: {
        total: departures.length,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/packages/:packageId/departures
   * Schedule a new departure date for a tour package.
   */
  create = async (
    request: FastifyRequest<{ Params: { packageId: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { packageId } = parseZod(packageIdParamSchema, request.params, 'params');
    const rawBody = typeof request.body === 'object' && request.body !== null ? request.body : {};
    const body = parseZod(createDepartureSchema, { ...rawBody, packageId }, 'body');

    const created = await this.departureService.createDeparture(body);

    return reply.status(201).send({
      success: true,
      data: created,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/departures/:id
   * Get departure details by ID.
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const departure = await this.departureService.getDepartureById(id);

    return reply.status(200).send({
      success: true,
      data: departure,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/departures/:id
   * Update departure schedule, capacity bounds, pricing overrides, or operational status.
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const body = parseZod(updateDepartureSchema, request.body, 'body');

    const updated = await this.departureService.updateDeparture(id, body);

    return reply.status(200).send({
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * DELETE /api/v1/admin/departures/:id
   * Delete a departure schedule if no bookings or active checkout holds exist.
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');

    await this.departureService.deleteDeparture(id);

    return reply.status(200).send({
      success: true,
      data: { id, deleted: true },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
