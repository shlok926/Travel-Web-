import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.js';
import { DatabaseService } from '../infrastructure/database/index.js';
import { RedisService } from '../infrastructure/redis/index.js';
import { IStorageService } from '../infrastructure/storage/index.js';

export interface ApiRoutesOptions {
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
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

  // Future domain route modules (Auth, Packages, Bookings, Payments) will be registered here in Phase 2+
};
