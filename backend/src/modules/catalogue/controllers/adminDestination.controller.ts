import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  createDestinationSchema,
  destinationQuerySchema,
  updateDestinationSchema,
} from '../../../../../shared/src/index.js';
import { DestinationService } from '../services/destination.service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Destination ID must be a valid UUID'),
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

export class AdminDestinationController {
  constructor(private readonly destinationService: DestinationService) {}

  /**
   * GET /api/v1/admin/destinations
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(destinationQuerySchema, request.query, 'query');
    const result = await this.destinationService.list(query);

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
   * GET /api/v1/admin/destinations/:id
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const destination = await this.destinationService.getById(id);

    return reply.status(200).send({
      success: true,
      data: destination,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/destinations
   */
  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = parseZod(createDestinationSchema, request.body, 'body');
    const destination = await this.destinationService.create(input);

    return reply.status(201).send({
      success: true,
      data: destination,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/destinations/:id
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const input = parseZod(updateDestinationSchema, request.body, 'body');
    const destination = await this.destinationService.update(id, input);

    return reply.status(200).send({
      success: true,
      data: destination,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * DELETE /api/v1/admin/destinations/:id
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    await this.destinationService.delete(id);

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Destination successfully deleted',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/destinations/:id/publish
   */
  publish = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const destination = await this.destinationService.publish(id);

    return reply.status(200).send({
      success: true,
      data: destination,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/destinations/:id/unpublish
   */
  unpublish = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const destination = await this.destinationService.unpublish(id);

    return reply.status(200).send({
      success: true,
      data: destination,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
