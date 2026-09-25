import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, departureAvailabilityQuerySchema } from '../../../../../shared/src/index.js';
import { TourPackageService } from '../../catalogue/services/tourPackage.service.js';
import { DepartureService } from '../services/departure.service.js';
import { AvailabilityService } from '../services/availability.service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Departure ID must be a valid UUID'),
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

export class PublicInventoryController {
  constructor(
    private readonly departureService: DepartureService,
    private readonly availabilityService: AvailabilityService,
    private readonly tourPackageService: TourPackageService,
  ) {}

  /**
   * GET /api/v1/packages/:slug/departures
   * List all upcoming scheduled departures with availability badges for a published tour package.
   */
  listUpcomingDeparturesForPackage = async (
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

    const departures = await this.departureService.listUpcomingDeparturesForPackage(pkg.id);

    // Compute live availability aggregate for each upcoming departure
    const availabilityList = await Promise.all(
      departures.map((dep) => this.availabilityService.getDepartureAvailability(dep.id)),
    );

    return reply.status(200).send({
      success: true,
      data: availabilityList,
      meta: {
        total: availabilityList.length,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/departures/:id/availability
   * Inspect real-time remaining seat availability and effective pricing for a specific departure.
   */
  getDepartureAvailability = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { id } = parseZod(uuidParamSchema, request.params, 'params');
    const query = parseZod(departureAvailabilityQuerySchema, request.query, 'query');

    const availability = await this.availabilityService.getDepartureAvailability(id, query);

    return reply.status(200).send({
      success: true,
      data: availability,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
