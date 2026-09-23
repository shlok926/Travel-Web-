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
   * Liveness Probe: Verifies HTTP server process event loop is alive.
   * Returns 200 OK unconditionally as long as the server process is responsive.
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
   * Readiness Probe: Verifies availability of underlying infrastructure dependencies.
   *
   * Exact Readiness Semantics:
   * 1. DB (Healthy) + Redis (Healthy)   -> 200 OK, status: 'ready'
   * 2. DB (Healthy) + Redis (Unhealthy) -> 200 OK, status: 'degraded' (DB is authoritative transactional store;
   *                                        system operates with synchronous fallback)
   * 3. DB (Unhealthy) + Redis (Healthy) -> 503 Service Unavailable, status: 'unhealthy' (Authoritative transactional
   *                                        data store offline; cannot guarantee booking ACID integrity)
   * 4. DB (Unhealthy) + Redis (Unhealthy)-> 503 Service Unavailable, status: 'unhealthy'
   */
  fastify.get('/ready', async (request, reply) => {
    const [dbHealth, redisHealth] = await Promise.all([db.checkHealth(), redis.checkHealth()]);

    const isDbHealthy = dbHealth.status === 'healthy';
    const isRedisHealthy = redisHealth.status === 'healthy';

    let statusCode = 200;
    let overallStatus: 'ready' | 'degraded' | 'unhealthy' = 'ready';
    let isSuccess = true;

    if (!isDbHealthy) {
      // Database failure is fatal for transactional readiness
      statusCode = 503;
      overallStatus = 'unhealthy';
      isSuccess = false;
    } else if (!isRedisHealthy) {
      // Redis outage leaves DB active: degraded mode with sync fallbacks
      statusCode = 200;
      overallStatus = 'degraded';
      isSuccess = true;
    } else {
      statusCode = 200;
      overallStatus = 'ready';
      isSuccess = true;
    }

    const response = {
      success: isSuccess,
      data: {
        status: overallStatus,
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
