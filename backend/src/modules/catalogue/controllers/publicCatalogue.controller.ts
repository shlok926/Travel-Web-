import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  destinationQuerySchema,
  tourPackageQuerySchema,
} from '../../../../../shared/src/index.js';
import { DestinationService } from '../services/destination.service.js';
import { ThemeService } from '../services/theme.service.js';
import { TourPackageService } from '../services/tourPackage.service.js';

function parseZod<T>(schema: z.ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || 'query',
      issue: i.message,
    }));
    throw AppError.badRequest('Request validation failed', details);
  }
  return result.data;
}

export class PublicCatalogueController {
  constructor(
    private readonly destinationService: DestinationService,
    private readonly themeService: ThemeService,
    private readonly tourPackageService: TourPackageService,
  ) {}

  /**
   * GET /api/v1/destinations
   * List all published destinations for the public storefront.
   */
  listDestinations = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(destinationQuerySchema, request.query);
    const result = await this.destinationService.list({
      ...query,
      isPublished: true,
    });

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
   * GET /api/v1/destinations/:slug
   * Retrieve published destination details by URL slug.
   */
  getDestinationBySlug = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { slug } = request.params;
    if (!slug || slug.trim().length === 0) {
      throw AppError.badRequest('Destination slug is required');
    }

    const destination = await this.destinationService.getBySlug(slug);

    // Guard: public endpoint must not expose unpublished destinations
    if (!destination.isPublished) {
      throw AppError.notFound(`Destination with slug '${slug}' not found.`);
    }

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
   * GET /api/v1/themes
   * List all themes.
   */
  listThemes = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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
   * GET /api/v1/packages
   * List published tour packages with basic filters (destinationSlug, themeSlug, isFeatured, pagination).
   */
  listPackages = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(tourPackageQuerySchema, request.query);
    const result = await this.tourPackageService.list({
      ...query,
      isPublished: true,
    });

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
   * GET /api/v1/packages/:slug
   * Retrieve published package details (including destination, theme, and itinerary) by URL slug.
   */
  getPackageBySlug = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { slug } = request.params;
    if (!slug || slug.trim().length === 0) {
      throw AppError.badRequest('Package slug is required');
    }

    const pkg = await this.tourPackageService.getBySlug(slug);

    // Guard: public endpoint must not expose unpublished packages or packages with unpublished destinations
    if (!pkg.isPublished || !pkg.destination.isPublished) {
      throw AppError.notFound(`Tour package with slug '${slug}' not found.`);
    }

    return reply.status(200).send({
      success: true,
      data: pkg,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
