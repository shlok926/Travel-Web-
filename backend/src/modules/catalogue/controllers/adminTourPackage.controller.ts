import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  createTourPackageSchema,
  tourPackageQuerySchema,
  updateTourPackageSchema,
  upsertPackageItinerarySchema,
} from '../../../../../shared/src/index.js';
import { TourPackageService } from '../services/tourPackage.service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Package ID must be a valid UUID'),
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

export class AdminTourPackageController {
  constructor(private readonly tourPackageService: TourPackageService) {}

  /**
   * GET /api/v1/admin/packages
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(tourPackageQuerySchema, request.query, 'query');
    const result = await this.tourPackageService.list(query);

    return reply.status(200).send({
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/packages/:id
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const pkg = await this.tourPackageService.getById(id);

    return reply.status(200).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/packages
   */
  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = parseZod(createTourPackageSchema, request.body, 'body');
    const pkg = await this.tourPackageService.create(input);

    return reply.status(201).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/packages/:id
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const input = parseZod(updateTourPackageSchema, request.body, 'body');
    const pkg = await this.tourPackageService.update(id, input);

    return reply.status(200).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * DELETE /api/v1/admin/packages/:id
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    await this.tourPackageService.delete(id);

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Tour package successfully deleted',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/packages/:id/publish
   */
  publish = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const pkg = await this.tourPackageService.publish(id);

    return reply.status(200).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/packages/:id/unpublish
   */
  unpublish = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const pkg = await this.tourPackageService.unpublish(id);

    return reply.status(200).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PUT /api/v1/admin/packages/:id/itinerary
   */
  setItinerary = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const input = parseZod(upsertPackageItinerarySchema, request.body, 'body');
    const days = await this.tourPackageService.setItinerary(id, input.itineraryDays);

    return reply.status(200).send({
      success: true,
      data: days,
      meta: {
        total: days.length,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
