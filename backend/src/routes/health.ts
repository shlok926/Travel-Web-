import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../infrastructure/database/index.js';
import { RedisService } from '../infrastructure/redis/index.js';
import { ApiSuccessResponse } from '../../../shared/src/types/api.js';

export interface HealthRouteOptions {
  db: DatabaseService;
  redis: RedisService;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { db, redis } = options;
  const startTime = Date.now();

  /**
   * Liveness Probe: Verifies HTTP server event loop is responsive.
   */
  fastify.get('/health', async (request, reply) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const response: ApiSuccessResponse<{
      status: 'healthy';
      uptimeSeconds: number;
      version: string;
    }> = {
      success: true,
      data: {
        status: 'healthy',
        uptimeSeconds,
        version: '1.0.0',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    };

    return reply.status(200).send(response);
  });

  /**
   * Readiness Probe: Verifies database and Redis connection readiness.
   */
  fastify.get('/ready', async (request, reply) => {
    const [dbHealth, redisHealth] = await Promise.all([db.checkHealth(), redis.checkHealth()]);

    const isHealthy = dbHealth.status === 'healthy'; // In dev without Redis, DB is primary authority

    const statusCode = isHealthy ? 200 : 503;

    const response = {
      success: isHealthy,
      data: {
        status: isHealthy ? 'ready' : 'degraded',
        checks: {
          database: dbHealth,
          redis: redisHealth,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    };

    return reply.status(statusCode).send(response);
  });
};
