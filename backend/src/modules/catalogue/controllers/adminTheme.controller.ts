import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, createThemeSchema, updateThemeSchema } from '../../../../../shared/src/index.js';
import { ThemeService } from '../services/theme.service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Theme ID must be a valid UUID'),
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

export class AdminThemeController {
  constructor(private readonly themeService: ThemeService) {}

  /**
   * GET /api/v1/admin/themes
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const themes = await this.themeService.list();

    return reply.status(200).send({
      success: true,
      data: themes,
      meta: {
        total: themes.length,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/themes/:id
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const theme = await this.themeService.getById(id);

    return reply.status(200).send({
      success: true,
      data: theme,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/admin/themes
   */
  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = parseZod(createThemeSchema, request.body, 'body');
    const theme = await this.themeService.create(input);

    return reply.status(201).send({
      success: true,
      data: theme,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/themes/:id
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const input = parseZod(updateThemeSchema, request.body, 'body');
    const theme = await this.themeService.update(id, input);

    return reply.status(200).send({
      success: true,
      data: theme,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * DELETE /api/v1/admin/themes/:id
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    await this.themeService.delete(id);

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Theme successfully deleted',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
