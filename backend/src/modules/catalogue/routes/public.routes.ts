import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PublicCatalogueController } from '../controllers/publicCatalogue.controller.js';
import { DestinationService } from '../services/destination.service.js';
import { ThemeService } from '../services/theme.service.js';
import { TourPackageService } from '../services/tourPackage.service.js';

export interface PublicCatalogueRoutesOptions {
  destinationService: DestinationService;
  themeService: ThemeService;
  tourPackageService: TourPackageService;
}

export const publicCatalogueRoutes: FastifyPluginAsync<PublicCatalogueRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { destinationService, themeService, tourPackageService } = options;
  const controller = new PublicCatalogueController(
    destinationService,
    themeService,
    tourPackageService,
  );

  // 1. Destinations
  fastify.get(
    '/destinations',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'List published destinations',
        description: 'Returns a paginated list of published travel destinations.',
      },
    },
    controller.listDestinations,
  );

  fastify.get(
    '/destinations/:slug',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'Get destination by slug',
        description: 'Returns destination details and associated package counts.',
      },
    },
    controller.getDestinationBySlug,
  );

  // 2. Themes
  fastify.get(
    '/themes',
    {
      schema: {
        tags: ['Themes'],
        summary: 'List all travel themes',
        description: 'Returns curated travel themes taxonomy.',
      },
    },
    controller.listThemes,
  );

  // 3. Tour Packages
  fastify.get(
    '/packages',
    {
      schema: {
        tags: ['Tour Packages'],
        summary: 'List published tour packages',
        description: 'Returns a paginated list of tour packages filtered by destination or theme.',
      },
    },
    controller.listPackages,
  );

  fastify.get(
    '/packages/:slug',
    {
      schema: {
        tags: ['Tour Packages'],
        summary: 'Get tour package details by slug',
        description:
          'Returns full package details, day-by-day itinerary, pricing, and destination metadata.',
      },
    },
    controller.getPackageBySlug,
  );
};
