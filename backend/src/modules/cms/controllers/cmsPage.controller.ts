import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  cmsPageIdParamSchema,
  cmsPageListQuerySchema,
  cmsPageSlugParamSchema,
  createCmsPageSchema,
  ErrorCodes,
  updateCmsPageSchema,
} from '../../../../../shared/src/index.js';
import { CmsPageService } from '../services/cmsPage.service.js';

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

export class CmsPageController {
  constructor(private readonly cmsPageService: CmsPageService) {}

  /**
   * POST /api/v1/admin/cms/pages
   * Create a new static CMS page.
   */
  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = parseZod(createCmsPageSchema, request.body, 'body');
    const created = await this.cmsPageService.createPage(input);

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
   * GET /api/v1/admin/cms/pages
   * List static CMS pages with administrative filters and pagination.
   */
  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(cmsPageListQuerySchema, request.query, 'query');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.cmsPageService.listPages({
      page,
      limit,
      isPublished: query.isPublished,
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
   * GET /api/v1/admin/cms/pages/id/:id
   * Get static CMS page by ID.
   */
  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(cmsPageIdParamSchema, request.params, 'params');
    const page = await this.cmsPageService.getPageById(id);

    return reply.status(200).send({
      success: true,
      data: page,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/admin/cms/pages/:slug
   * Get static CMS page by slug for administrative inspection.
   */
  getBySlug = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { slug } = parseZod(cmsPageSlugParamSchema, request.params, 'params');
    const page = await this.cmsPageService.getPageBySlug(slug);

    return reply.status(200).send({
      success: true,
      data: page,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * PATCH /api/v1/admin/cms/pages/:id
   * Update static CMS page by ID.
   */
  update = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(cmsPageIdParamSchema, request.params, 'params');
    const input = parseZod(updateCmsPageSchema, request.body, 'body');
    const updated = await this.cmsPageService.updatePage(id, input);

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
   * PUT /api/v1/admin/cms/pages/:slug
   * Update static CMS page by slug.
   */
  updateBySlug = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { slug } = parseZod(cmsPageSlugParamSchema, request.params, 'params');
    const input = parseZod(updateCmsPageSchema, request.body, 'body');
    const updated = await this.cmsPageService.updatePage(slug, input);

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
   * DELETE /api/v1/admin/cms/pages/:id
   * Delete static CMS page by ID or Slug.
   */
  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(cmsPageIdParamSchema, request.params, 'params');
    await this.cmsPageService.deletePage(id);

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
   * GET /api/v1/cms/pages/:slug
   * Public storefront endpoint to retrieve a published static CMS page.
   */
  getPublishedBySlug = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { slug } = parseZod(cmsPageSlugParamSchema, request.params, 'params');
    const page = await this.cmsPageService.getPageBySlug(slug);

    if (!page.isPublished) {
      throw AppError.notFound(
        `CMS page '${slug}' is not published or does not exist.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    return reply.status(200).send({
      success: true,
      data: page,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
