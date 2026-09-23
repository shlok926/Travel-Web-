import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../backend/src/app.js';
import { FastifyInstance } from 'fastify';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { RedisService } from '../../backend/src/infrastructure/redis/index.js';

describe('API Foundation — Centralized Error Handling & Security Headers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4002',
    });

    const mockDb = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 2 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as RedisService;

    const created = await createApp({ config, db: mockDb, redis: mockRedis });
    app = created.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 404 with standardized Phase 0.4 error envelope (mapped to RFC 7807) for non-existent routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/non-existent-endpoint',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('does not exist');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.meta.timestamp).toBeDefined();
  });

  it('should inject security headers (Helmet) and correlation ID (x-request-id)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        'x-request-id': 'custom-correlation-id-12345',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('custom-correlation-id-12345');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
