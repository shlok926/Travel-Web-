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
  fastify.get('/destinations', controller.listDestinations);
  fastify.get('/destinations/:slug', controller.getDestinationBySlug);

  // 2. Themes
  fastify.get('/themes', controller.listThemes);

  // 3. Tour Packages
  fastify.get('/packages', controller.listPackages);
  fastify.get('/packages/:slug', controller.getPackageBySlug);
};
