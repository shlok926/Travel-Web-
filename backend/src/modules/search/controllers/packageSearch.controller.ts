import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, packageSearchQuerySchema } from '../../../../../shared/src/index.js';
import { PackageSearchService } from '../services/packageSearch.service.js';

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

export class PackageSearchController {
  constructor(private readonly searchService: PackageSearchService) {}

  /**
   * GET /api/v1/packages/search
   * Multi-criteria search and filter across published packages with real-time departure availability cards.
   */
  search = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = parseZod(packageSearchQuerySchema, request.query, 'query');
    const result = await this.searchService.searchPackages(query);

    return reply.status(200).send({
      success: true,
      data: result.items,
      meta: {
        ...result.pagination,
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
