import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedAdmin } from '../../backend/src/infrastructure/database/seeds/seedAdmin.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { EnvConfig } from '../../backend/src/config/env.js';
import { PasswordSecurity } from '../../shared/src/security/argon2.js';

describe('Admin Seed Provisioning & Security Safeguards', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseService;

  const devConfig = {
    NODE_ENV: 'development',
    ARGON2_MEMORY_COST: 4096,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
  } as EnvConfig;

  const prodConfig = {
    NODE_ENV: 'production',
    ARGON2_MEMORY_COST: 4096,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
  } as EnvConfig;

  beforeEach(() => {
    mockQuery = vi.fn();
    mockDb = {
      query: mockQuery,
    } as unknown as DatabaseService;
    delete process.env.ADMIN_SEED_EMAIL;
    delete process.env.ADMIN_SEED_PASSWORD;
  });

  it('1. should create admin user when no admin exists in development environment', async () => {
    process.env.ADMIN_SEED_EMAIL = 'admin@example.com';
    process.env.ADMIN_SEED_PASSWORD = 'CustomDevPassword123!';

    // 1. SELECT query: no existing user
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 2. INSERT query: returns created user
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'usr_admin_uuid_123', email: 'admin@example.com' }],
      rowCount: 1,
    });

    const result = await seedAdmin(mockDb, devConfig);

    expect(result.status).toBe('created');
    expect(result.email).toBe('admin@example.com');
    expect(result.userId).toBe('usr_admin_uuid_123');

    // Verify insert parameters
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall).toBeDefined();
    const insertSql = insertCall?.[0] as string;
    const insertParams = insertCall?.[1] as unknown[];

    expect(insertSql).toContain('INSERT INTO users');
    expect(insertParams[0]).toBe('admin@example.com');
    expect(typeof insertParams[1]).toBe('string');
    expect(insertParams[1] as string).toContain('$argon2id$'); // Argon2id hash
    expect(insertParams[3]).toBe('ADMIN'); // Role
    expect(insertParams[4]).toBe(true); // is_active

    // Verify password hash is valid
    const isPasswordValid = await PasswordSecurity.verify(
      insertParams[1] as string,
      'CustomDevPassword123!',
    );
    expect(isPasswordValid).toBe(true);
  });

  it('2. should be idempotent when admin user already exists', async () => {
    process.env.ADMIN_SEED_EMAIL = 'admin@example.com';

    // SELECT query: user already exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'usr_admin_existing_456', email: 'admin@example.com', role: 'ADMIN' }],
      rowCount: 1,
    });

    const result = await seedAdmin(mockDb, devConfig);

    expect(result.status).toBe('already_exists');
    expect(result.email).toBe('admin@example.com');
    expect(result.userId).toBe('usr_admin_existing_456');
    expect(mockQuery).toHaveBeenCalledTimes(1); // No insert query executed
  });

  it('3. should block automatic seeding in production when ADMIN_SEED_PASSWORD is missing', async () => {
    delete process.env.ADMIN_SEED_PASSWORD;

    await expect(seedAdmin(mockDb, prodConfig)).rejects.toThrow(
      'Production Security Guard: ADMIN_SEED_PASSWORD environment variable must be explicitly set',
    );
  });

  it('4. should block seeding in production when password is too short (<12 chars)', async () => {
    process.env.ADMIN_SEED_PASSWORD = 'Short1!';

    await expect(seedAdmin(mockDb, prodConfig)).rejects.toThrow(
      'Production Security Guard: ADMIN_SEED_PASSWORD must be at least 12 characters',
    );
  });

  it('5. should block seeding in production when password matches a known insecure default', async () => {
    process.env.ADMIN_SEED_PASSWORD = 'Admin@Dev2026!';

    await expect(seedAdmin(mockDb, prodConfig)).rejects.toThrow(
      'Production Security Guard: ADMIN_SEED_PASSWORD matches a known default or insecure password',
    );
  });

  it('6. should allow seeding in production when a valid, strong password is provided', async () => {
    process.env.ADMIN_SEED_EMAIL = 'admin@production.travel.com';
    process.env.ADMIN_SEED_PASSWORD = 'super-secret-unique-production-pwd-2026';

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'usr_prod_admin_789', email: 'admin@production.travel.com' }],
      rowCount: 1,
    });

    const result = await seedAdmin(mockDb, prodConfig);

    expect(result.status).toBe('created');
    expect(result.email).toBe('admin@production.travel.com');
  });
});
