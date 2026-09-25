import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from '../modules/auth/routes/auth.routes.js';
import { AuthService } from '../modules/auth/services/auth.service.js';
import { DatabaseService } from '../infrastructure/database/index.js';
import { RedisService } from '../infrastructure/redis/index.js';
import { IStorageService } from '../infrastructure/storage/index.js';
import { EnvConfig } from '../config/env.js';
import {
  DestinationService,
  ThemeService,
  TourPackageService,
  publicCatalogueRoutes,
  adminCatalogueRoutes,
} from '../modules/catalogue/index.js';

export interface ApiRoutesOptions {
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
  authService?: AuthService;
  destinationService?: DestinationService;
  themeService?: ThemeService;
  tourPackageService?: TourPackageService;
  config?: EnvConfig;
}

export const apiRoutes: FastifyPluginAsync<ApiRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  // 1. Register Infrastructure Health Routes under /api/v1/
  await fastify.register(healthRoutes, {
    db: options.db,
    redis: options.redis,
  });

  // 2. Register Authentication Routes under /api/v1/auth
  if (options.authService) {
    await fastify.register(authRoutes, {
      prefix: '/auth',
      authService: options.authService,
      config: options.config,
    });
  }

  // 3. Register Public Catalogue Routes under /api/v1/ (e.g. /destinations, /themes, /packages)
  if (options.destinationService && options.themeService && options.tourPackageService) {
    await fastify.register(publicCatalogueRoutes, {
      destinationService: options.destinationService,
      themeService: options.themeService,
      tourPackageService: options.tourPackageService,
    });

    // 4. Register Admin Catalogue Routes under /api/v1/admin
    await fastify.register(adminCatalogueRoutes, {
      prefix: '/admin',
      destinationService: options.destinationService,
      themeService: options.themeService,
      tourPackageService: options.tourPackageService,
    });
  }
};
