import { describe, it, expect } from 'vitest';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';

describe('Failure & Resilience Architecture Verification', () => {
  it('should return 503 and report degraded status when database is unreachable', async () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4003',
      JWT_SECRET_KEY: 'test_jwt_secret_key_minimum_32_characters_long_123',
    });

    // Mock failing DB
    const failingDb = {
      checkHealth: async () => ({
        status: 'unhealthy' as const,
        latencyMs: 50,
        error: 'Connection refused at localhost:5432',
      }),
      close: async () => {},
    } as any;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as any;

    const { app } = await createApp({ config, db: failingDb, redis: mockRedis });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('degraded');
    expect(body.data.checks.database.status).toBe('unhealthy');
    expect(body.data.checks.database.error).toContain('Connection refused');

    await app.close();
  });

  it('should continue serving liveness /health even if database is temporarily degraded', async () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4004',
      JWT_SECRET_KEY: 'test_jwt_secret_key_minimum_32_characters_long_123',
    });

    const failingDb = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as any;

    const mockRedis = {
      checkHealth: async () => ({ status: 'unhealthy' as const, latencyMs: 50 }),
      close: async () => {},
    } as any;

    const { app } = await createApp({ config, db: failingDb, redis: mockRedis });
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
