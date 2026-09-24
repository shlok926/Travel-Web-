import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from '../modules/auth/routes/auth.routes.js';
import { AuthService } from '../modules/auth/services/auth.service.js';
import { DatabaseService } from '../infrastructure/database/index.js';
import { RedisService } from '../infrastructure/redis/index.js';
import { IStorageService } from '../infrastructure/storage/index.js';
import { EnvConfig } from '../config/env.js';

export interface ApiRoutesOptions {
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
  authService?: AuthService;
  config?: EnvConfig;
}

export const apiRoutes: FastifyPluginAsync<ApiRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  // Register Infrastructure Health Routes under /api/v1/
  await fastify.register(healthRoutes, {
    db: options.db,
    redis: options.redis,
  });

  // Register Authentication Routes under /api/v1/auth
  if (options.authService) {
    await fastify.register(authRoutes, {
      prefix: '/auth',
      authService: options.authService,
      config: options.config,
    });
  }
};
