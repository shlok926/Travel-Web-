import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminDestinationController } from '../controllers/adminDestination.controller.js';
import { AdminThemeController } from '../controllers/adminTheme.controller.js';
import { AdminTourPackageController } from '../controllers/adminTourPackage.controller.js';
import { DestinationService } from '../services/destination.service.js';
import { ThemeService } from '../services/theme.service.js';
import { TourPackageService } from '../services/tourPackage.service.js';

export interface AdminCatalogueRoutesOptions {
  destinationService: DestinationService;
  themeService: ThemeService;
  tourPackageService: TourPackageService;
}

export const adminCatalogueRoutes: FastifyPluginAsync<AdminCatalogueRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { destinationService, themeService, tourPackageService } = options;

  const destController = new AdminDestinationController(destinationService);
  const themeController = new AdminThemeController(themeService);
  const pkgController = new AdminTourPackageController(tourPackageService);

  // Apply strict Authentication & RBAC Guard across all admin catalogue routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  // --- 1. Destinations Admin APIs ---
  fastify.get('/destinations', destController.list);
  fastify.get('/destinations/:id', destController.getById);
  fastify.post('/destinations', destController.create);
  fastify.patch('/destinations/:id', destController.update);
  fastify.delete('/destinations/:id', destController.delete);
  fastify.post('/destinations/:id/publish', destController.publish);
  fastify.post('/destinations/:id/unpublish', destController.unpublish);

  // --- 2. Themes Admin APIs ---
  fastify.get('/themes', themeController.list);
  fastify.get('/themes/:id', themeController.getById);
  fastify.post('/themes', themeController.create);
  fastify.patch('/themes/:id', themeController.update);
  fastify.delete('/themes/:id', themeController.delete);

  // --- 3. Tour Packages Admin APIs ---
  fastify.get('/packages', pkgController.list);
  fastify.get('/packages/:id', pkgController.getById);
  fastify.post('/packages', pkgController.create);
  fastify.patch('/packages/:id', pkgController.update);
  fastify.delete('/packages/:id', pkgController.delete);
  fastify.post('/packages/:id/publish', pkgController.publish);
  fastify.post('/packages/:id/unpublish', pkgController.unpublish);
  fastify.put('/packages/:id/itinerary', pkgController.setItinerary);
};
