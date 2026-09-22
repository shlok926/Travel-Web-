import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../backend/src/app.js';
import { FastifyInstance } from 'fastify';
import { loadEnv } from '../../backend/src/config/env.js';

describe('API Foundation — Health & Readiness Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4001',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
      JWT_SECRET_KEY: 'test_jwt_secret_key_minimum_32_characters_long_123',
    });

    // Mock DB & Redis for isolated integration test
    const mockDb = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 2 }),
      close: async () => {},
    } as any;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as any;

    const created = await createApp({ config, db: mockDb, redis: mockRedis });
    app = created.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health should return 200 OK with liveness status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.version).toBe('1.0.0');
    expect(body.meta.timestamp).toBeDefined();
  });

  it('GET /api/v1/ready should return 200 OK when dependencies report healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ready');
    expect(body.data.checks.database.status).toBe('healthy');
    expect(body.data.checks.redis.status).toBe('healthy');
  });
});
