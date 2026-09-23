import { describe, it, expect } from 'vitest';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { RedisService } from '../../backend/src/infrastructure/redis/index.js';

describe('Failure & Resilience Architecture Verification', () => {
  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4003',
  });

  it('1. should return 503 and report "unhealthy" status when database is unreachable (DB Authoritative Guard)', async () => {
    // Failing DB, Healthy Redis
    const failingDb = {
      checkHealth: async () => ({
        status: 'unhealthy' as const,
        latencyMs: 50,
        error: 'Connection refused at localhost:5432',
      }),
      close: async () => {},
    } as unknown as DatabaseService;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as RedisService;

    const { app } = await createApp({ config, db: failingDb, redis: mockRedis });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.checks.database.status).toBe('unhealthy');
    expect(body.data.checks.database.error).toContain('Connection refused');
    expect(body.data.checks.redis.status).toBe('healthy');

    await app.close();
  });

  it('2. should return 200 and report "degraded" status when Redis is unreachable but database is healthy', async () => {
    // Healthy DB, Failing Redis
    const healthyDb = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 2 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const failingRedis = {
      checkHealth: async () => ({
        status: 'unhealthy' as const,
        latencyMs: 30,
        error: 'Redis connection timeout',
      }),
      close: async () => {},
    } as unknown as RedisService;

    const { app } = await createApp({ config, db: healthyDb, redis: failingRedis });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('degraded');
    expect(body.data.checks.database.status).toBe('healthy');
    expect(body.data.checks.redis.status).toBe('unhealthy');

    await app.close();
  });

  it('3. should return 503 and report "unhealthy" status when both database and Redis are unreachable', async () => {
    // Both failing
    const failingDb = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const failingRedis = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as unknown as RedisService;

    const { app } = await createApp({ config, db: failingDb, redis: failingRedis });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('unhealthy');

    await app.close();
  });

  it('4. should continue serving liveness /health with 200 OK even under complete dependency outage', async () => {
    const failingDb = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const failingRedis = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as unknown as RedisService;

    const { app } = await createApp({ config, db: failingDb, redis: failingRedis });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');

    await app.close();
  });
});
