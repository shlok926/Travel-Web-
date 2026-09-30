import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  createHeroSliderSchema,
  heroSliderIdParamSchema,
  heroSliderListQuerySchema,
  updateHeroSliderSchema,
} from '../../../../../shared/src/index.js';
import { HeroSliderService } from '../services/heroSlider.service.js';

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

export class HeroSliderController {
  constructor(private readonly heroSliderService: HeroSliderService) {}

  /**
   * POST /api/v1/admin/cms/sliders
   * Create a new hero slider banner.
   */
  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = parseZod(createHeroSliderSchema, request.body, 'body');
    const created = await this.heroSliderService.createSlider(input);

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
   * GET /api/v1/admin/cms/sliders
   * List hero sliders with administrative filters and pagination.
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(heroSliderListQuerySchema, request.query, 'query');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.heroSliderService.listSliders({
      page,
      limit,
      isActive: query.isActive,
    });

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
   * GET /api/v1/admin/cms/sliders/:id
   * Get hero slider by ID.
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(heroSliderIdParamSchema, request.params, 'params');
    const slider = await this.heroSliderService.getSliderById(id);

    return reply.status(200).send({
      success: true,
      data: slider,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/cms/sliders/:id
   * Update hero slider banner fields.
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(heroSliderIdParamSchema, request.params, 'params');
    const input = parseZod(updateHeroSliderSchema, request.body, 'body');
    const updated = await this.heroSliderService.updateSlider(id, input);

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
   * DELETE /api/v1/admin/cms/sliders/:id
   * Delete hero slider banner by ID.
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(heroSliderIdParamSchema, request.params, 'params');
    await this.heroSliderService.deleteSlider(id);

    return reply.status(200).send({
      success: true,
      data: { id, deleted: true },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/cms/sliders
   * Public storefront endpoint to list active hero banners ordered by sort sequence.
   */
  listActive = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(heroSliderListQuerySchema, request.query, 'query');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.heroSliderService.listSliders({
      page,
      limit,
      isActive: true,
    });

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
}
