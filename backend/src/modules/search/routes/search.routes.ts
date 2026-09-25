import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PackageSearchController } from '../controllers/packageSearch.controller.js';
import { PackageSearchService } from '../services/packageSearch.service.js';

export interface SearchRoutesOptions {
  searchService: PackageSearchService;
}

export const searchRoutes: FastifyPluginAsync<SearchRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new PackageSearchController(options.searchService);

  // GET /api/v1/packages/search
  fastify.get(
    '/packages/search',
    {
      schema: {
        tags: ['Search'],
        summary: 'Multi-criteria package search and filtering',
        description:
          'Search published tour packages by keyword, destination, theme, duration bounds, budget, and departure dates with real-time next departure availability.',
      },
    },
    controller.search,
  );
};
