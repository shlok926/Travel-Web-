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

  const adminSecurity = [{ BearerAuth: [] }];

  // --- 1. Destinations Admin APIs ---
  fastify.get(
    '/destinations',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin list all destinations',
        security: adminSecurity,
      },
    },
    destController.list,
  );
  fastify.get(
    '/destinations/:id',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin get destination by ID',
        security: adminSecurity,
      },
    },
    destController.getById,
  );
  fastify.post(
    '/destinations',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin create destination',
        security: adminSecurity,
      },
    },
    destController.create,
  );
  fastify.patch(
    '/destinations/:id',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin update destination',
        security: adminSecurity,
      },
    },
    destController.update,
  );
  fastify.delete(
    '/destinations/:id',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin delete destination',
        security: adminSecurity,
      },
    },
    destController.delete,
  );
  fastify.post(
    '/destinations/:id/publish',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin publish destination',
        security: adminSecurity,
      },
    },
    destController.publish,
  );
  fastify.post(
    '/destinations/:id/unpublish',
    {
      schema: {
        tags: ['Admin — Destinations'],
        summary: 'Admin unpublish destination',
        security: adminSecurity,
      },
    },
    destController.unpublish,
  );

  // --- 2. Themes Admin APIs ---
  fastify.get(
    '/themes',
    {
      schema: {
        tags: ['Admin — Themes'],
        summary: 'Admin list all themes',
        security: adminSecurity,
      },
    },
    themeController.list,
  );
  fastify.get(
    '/themes/:id',
    {
      schema: {
        tags: ['Admin — Themes'],
        summary: 'Admin get theme by ID',
        security: adminSecurity,
      },
    },
    themeController.getById,
  );
  fastify.post(
    '/themes',
    {
      schema: {
        tags: ['Admin — Themes'],
        summary: 'Admin create theme',
        security: adminSecurity,
      },
    },
    themeController.create,
  );
  fastify.patch(
    '/themes/:id',
    {
      schema: {
        tags: ['Admin — Themes'],
        summary: 'Admin update theme',
        security: adminSecurity,
      },
    },
    themeController.update,
  );
  fastify.delete(
    '/themes/:id',
    {
      schema: {
        tags: ['Admin — Themes'],
        summary: 'Admin delete theme',
        security: adminSecurity,
      },
    },
    themeController.delete,
  );

  // --- 3. Tour Packages Admin APIs ---
  fastify.get(
    '/packages',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin list all tour packages',
        security: adminSecurity,
      },
    },
    pkgController.list,
  );
  fastify.get(
    '/packages/:id',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin get tour package by ID',
        security: adminSecurity,
      },
    },
    pkgController.getById,
  );
  fastify.post(
    '/packages',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin create tour package',
        security: adminSecurity,
      },
    },
    pkgController.create,
  );
  fastify.patch(
    '/packages/:id',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin update tour package',
        security: adminSecurity,
      },
    },
    pkgController.update,
  );
  fastify.delete(
    '/packages/:id',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin delete tour package',
        security: adminSecurity,
      },
    },
    pkgController.delete,
  );
  fastify.post(
    '/packages/:id/publish',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin publish tour package',
        security: adminSecurity,
      },
    },
    pkgController.publish,
  );
  fastify.post(
    '/packages/:id/unpublish',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin unpublish tour package',
        security: adminSecurity,
      },
    },
    pkgController.unpublish,
  );
  fastify.put(
    '/packages/:id/itinerary',
    {
      schema: {
        tags: ['Admin — Packages'],
        summary: 'Admin set package itinerary days',
        security: adminSecurity,
      },
    },
    pkgController.setItinerary,
  );
};
