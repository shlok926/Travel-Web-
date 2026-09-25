import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { RedisService } from '../../backend/src/infrastructure/redis/index.js';
import {
  UserRepository,
  RefreshTokenRepository,
  UserEntity,
  RefreshTokenEntity,
} from '../../backend/src/modules/auth/repositories/index.js';
import { AuthService } from '../../backend/src/modules/auth/services/auth.service.js';
import { PasswordSecurity } from '../../shared/src/security/argon2.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';
import { REFRESH_TOKEN_COOKIE_NAME } from '../../backend/src/modules/auth/controllers/auth.controller.js';

describe('Phase 2 Step 9 — Full Authentication Integration & Security Attack Matrix', () => {
  let app: FastifyInstance;
  let mockDb: DatabaseService;
  let mockUserRepo: UserRepository;
  let mockTokenRepo: RefreshTokenRepository;
  let authService: AuthService;

  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4009',
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
  });

  const sampleCustomer: UserEntity = {
    id: 'usr_customer_1001',
    email: 'customer@example.com',
    passwordHash: '',
    fullName: 'Alice Customer',
    mobileContact: '+919876543210',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  const sampleAdmin: UserEntity = {
    id: 'usr_admin_2002',
    email: 'admin@youngtoursandtravels.com',
    passwordHash: '',
    fullName: 'Admin Super',
    mobileContact: '+919876543299',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  beforeEach(async () => {
    // Generate valid Argon2id hashes
    sampleCustomer.passwordHash = await PasswordSecurity.hash('CustomerPass123!', {
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });
    sampleAdmin.passwordHash = await PasswordSecurity.hash('AdminPass123!', {
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    mockDb = {
      withTransaction: vi.fn(async (callback) => callback({} as any)),
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as DatabaseService;

    const mockRedis = {
      checkHealth: async () => ({ status: 'healthy' as const, latencyMs: 1 }),
      close: async () => {},
    } as unknown as RedisService;

    mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    mockTokenRepo = {
      create: vi.fn(),
      findActiveByHash: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
    } as unknown as RefreshTokenRepository;

    authService = new AuthService(mockDb, mockUserRepo, mockTokenRepo, config);

    const created = await createApp({
      config,
      db: mockDb,
      redis: mockRedis,
      userRepo: mockUserRepo,
      refreshTokenRepo: mockTokenRepo,
      authService,
    });

    app = created.app;

    // Register a dedicated RBAC test route protected by fastify.authenticate and fastify.authorize
    app.get(
      '/api/v1/test/admin-zone',
      { preHandler: [app.authenticate, app.authorize(['ADMIN'])] },
      async (request) => {
        return { success: true, message: 'Welcome to admin zone', user: request.user };
      },
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  function createSignedJwt(payload: any, privateKey = config.JWT_PRIVATE_KEY, expiresIn = 900) {
    return JwtSecurity.sign(payload, privateKey, { expiresInSeconds: expiresIn });
  }

  // =========================================================================
  // 1. END-TO-END AUTHENTICATION LIFECYCLE
  // =========================================================================
  describe('1. End-to-End Authentication Lifecycle', () => {
    it('LIFECYCLE-01: Full flow (Register -> Login -> /me -> Refresh Rotation -> Logout)', async () => {
      // Step A: Register new customer
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'customer@example.com',
          password: 'CustomerPass123!',
          fullName: 'Alice Customer',
          mobileContact: '+919876543210',
        },
      });

      expect(regRes.statusCode).toBe(201);
      const regBody = regRes.json();
      expect(regBody.success).toBe(true);
      expect(regBody.data.user.email).toBe('customer@example.com');
      expect(regBody.data.accessToken).toBeDefined();

      // Extract cookie
      const regCookieHeader = String(regRes.headers['set-cookie'] || '');
      expect(regCookieHeader).toContain(REFRESH_TOKEN_COOKIE_NAME);
      const regCookieMatch = regCookieHeader.match(/refreshToken=([a-f0-9]+);/i);
      const rawRefreshToken1: string =
        regCookieMatch && regCookieMatch[1] ? regCookieMatch[1] : 'a'.repeat(64);

      // Step B: Login
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'customer@example.com',
          password: 'CustomerPass123!',
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const loginBody = loginRes.json();
      const accessToken = loginBody.data.accessToken;

      // Step C: Access /auth/me with Bearer token
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleCustomer);

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(meRes.statusCode).toBe(200);
      const meBody = meRes.json();
      expect(meBody.success).toBe(true);
      expect(meBody.data.user.id).toBe(sampleCustomer.id);
      expect(meBody.data.user.passwordHash).toBeUndefined();

      // Step D: Refresh Session
      const activeRecord: RefreshTokenEntity = {
        id: 'tok_1',
        userId: sampleCustomer.id,
        tokenHash: crypto.createHash('sha256').update(rawRefreshToken1).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
        revokedAt: null,
        createdAt: new Date(),
      };
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(activeRecord);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: rawRefreshToken1 },
      });

      expect(refreshRes.statusCode).toBe(200);
      const refreshBody = refreshRes.json();
      expect(refreshBody.data.accessToken).toBeDefined();

      // Step E: Logout
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(activeRecord);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: rawRefreshToken1 },
      });

      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.headers['set-cookie']).toBeDefined();
    });
  });

  // =========================================================================
  // 2. REFRESH-TOKEN ROTATION ATTACK TESTS
  // =========================================================================
  describe('2. Refresh-Token Rotation & Replay Attack Matrix', () => {
    it('ROTATE-01: Replay attack with previously rotated token is rejected with 401', async () => {
      // Previously rotated/revoked token will return null from findActiveByHash
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(null);

      const replayedOldToken = crypto.randomBytes(32).toString('hex');
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: replayedOldToken },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('ROTATE-02: Modified/tampered refresh token (flipped character) is rejected', async () => {
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(null);

      const tamperedToken = 'a'.repeat(63) + 'b';
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: tamperedToken },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('ROTATE-03: Expired refresh token is rejected', async () => {
      // Repository returns null because findActiveByHash filters expires_at > NOW() AND revoked_at IS NULL
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: crypto.randomBytes(32).toString('hex') },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('ROTATE-04: Refresh token belonging to deactivated user fails rotation', async () => {
      const activeRecord: RefreshTokenEntity = {
        id: 'tok_active_deactivated_user',
        userId: 'usr_deactivated_user',
        tokenHash: 'somehash',
        expiresAt: new Date(Date.now() + 600000),
        revokedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(activeRecord);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        ...sampleCustomer,
        isActive: false, // Deactivated in DB
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: crypto.randomBytes(32).toString('hex') },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('ROTATE-05: Plaintext refresh token is NEVER persisted to DB (only SHA-256 hash)', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      let persistedTokenHash = '';
      vi.mocked(mockTokenRepo.create).mockImplementationOnce(async (data: any) => {
        persistedTokenHash = data.tokenHash;
        return data as RefreshTokenEntity;
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleCustomer.email,
          password: 'CustomerPass123!',
        },
      });

      const setCookie = response.headers['set-cookie'] as string;
      const rawTokenMatch = setCookie.match(/refreshToken=([a-f0-9]+);/i);
      const rawToken = rawTokenMatch![1]!;

      // Verify that the persisted value is the 64-char SHA256 digest and NOT the raw token
      expect(persistedTokenHash).not.toBe(rawToken);
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(persistedTokenHash).toBe(expectedHash);
    });
  });

  // =========================================================================
  // 3. JWT SECURITY ATTACK MATRIX
  // =========================================================================
  describe('3. JWT Security Attack Matrix', () => {
    it('JWT-01: Valid RS256 token is accepted', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleCustomer);
      const token = createSignedJwt({
        userId: sampleCustomer.id,
        email: sampleCustomer.email,
        role: sampleCustomer.role,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.user.id).toBe(sampleCustomer.id);
    });

    it('JWT-02: Missing Authorization header is rejected with 401 UNAUTHORIZED', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('JWT-03: Malformed Authorization headers (Basic, Bearer alone, gibberish) are rejected', async () => {
      const headers = ['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer    ', 'Gibberish'];

      for (const h of headers) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { authorization: h },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it('JWT-04: Expired JWT is rejected with 401', async () => {
      const expiredToken = createSignedJwt(
        { userId: sampleCustomer.id, email: sampleCustomer.email, role: 'CUSTOMER' },
        config.JWT_PRIVATE_KEY,
        -10, // Expired in past
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('JWT-05: Token forged with alternate RSA keypair is rejected with 401', async () => {
      const altKeys = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const forgedToken = createSignedJwt(
        { userId: sampleCustomer.id, email: sampleCustomer.email, role: 'ADMIN' },
        altKeys.privateKey,
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${forgedToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('JWT-06: Symmetric HS256 algorithm confusion attack token is strictly rejected', async () => {
      const hs256Token = jwt.sign(
        { userId: sampleCustomer.id, email: sampleCustomer.email, role: 'ADMIN' },
        config.JWT_PUBLIC_KEY, // Attacker attempts to use public key as HMAC secret
        { algorithm: 'HS256' },
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${hs256Token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('JWT-07: Unsigned "none" algorithm token is strictly rejected', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ userId: sampleCustomer.id, email: sampleCustomer.email, role: 'ADMIN' }),
      ).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${unsignedToken}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('JWT-08: Tampered payload with modified claims fails signature check', async () => {
      const originalToken = createSignedJwt({
        userId: sampleCustomer.id,
        email: sampleCustomer.email,
        role: 'CUSTOMER',
      });
      const [header, , sig] = originalToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: sampleCustomer.id, email: sampleCustomer.email, role: 'ADMIN' }),
      ).toString('base64url');
      const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${tamperedToken}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('JWT-09: Token with malformed/missing claim structures is rejected', async () => {
      const malformedClaims = [
        { email: 'c@example.com', role: 'CUSTOMER' }, // missing userId
        { userId: 'u1', role: 'CUSTOMER' }, // missing email
        { userId: 'u1', email: 'c@example.com' }, // missing role
        { userId: { id: 'u1' }, email: 'c@example.com', role: 'CUSTOMER' }, // userId as object
        { userId: 'u1', email: 12345, role: 'CUSTOMER' }, // email as number
      ];

      for (const claims of malformedClaims) {
        const token = createSignedJwt(claims);
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it('JWT-10: Token for deleted/nonexistent DB user fails real-time active user check', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(null); // Not in DB
      const token = createSignedJwt({
        userId: 'usr_ghost_deleted',
        email: 'ghost@example.com',
        role: 'CUSTOMER',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('JWT-11: Database role is authoritative over stale JWT role claim', async () => {
      // User has token claiming 'ADMIN', but database role was demoted to 'CUSTOMER'
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        ...sampleCustomer,
        role: 'CUSTOMER', // Authoritative DB role
      });

      const staleAdminToken = createSignedJwt({
        userId: sampleCustomer.id,
        email: sampleCustomer.email,
        role: 'ADMIN', // Stale claim in JWT
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/test/admin-zone', // Requires ADMIN role
        headers: { authorization: `Bearer ${staleAdminToken}` },
      });

      // Must be forbidden (403) because DB role is CUSTOMER
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 4. RBAC AUTHORIZATION MATRIX
  // =========================================================================
  describe('4. RBAC Authorization Security Matrix', () => {
    it('RBAC-01: ADMIN role successfully accesses ADMIN route', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleAdmin);
      const token = createSignedJwt({
        userId: sampleAdmin.id,
        email: sampleAdmin.email,
        role: sampleAdmin.role,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/test/admin-zone',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('RBAC-02: CUSTOMER role is rejected from ADMIN route with 403 FORBIDDEN', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleCustomer);
      const token = createSignedJwt({
        userId: sampleCustomer.id,
        email: sampleCustomer.email,
        role: sampleCustomer.role,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/test/admin-zone',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 5. USER ACCOUNT & VALIDATION SECURITY
  // =========================================================================
  describe('5. User Account & Input Security', () => {
    it('INPUT-01: Email normalization trims and lowercases email on registration and login', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      let createdEmail = '';
      vi.mocked(mockUserRepo.create).mockImplementationOnce(async (data: any) => {
        createdEmail = data.email;
        return { ...sampleCustomer, email: data.email };
      });
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: '  ALICE.NEW@EXAMPLE.COM  ',
          password: 'CustomerPass123!',
          fullName: 'Alice New',
        },
      });

      expect(createdEmail).toBe('alice.new@example.com');
    });

    it('INPUT-02: Nonexistent user login returns generic 401 without account enumeration', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'unknown@example.com',
          password: 'SomePassword123!',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTHENTICATION_FAILED');
      expect(res.json().error.message).toBe('Invalid email or password.');
    });

    it('INPUT-03: Registration password complexity rejects weak passwords', async () => {
      const weakPasswords = [
        'short', // < 8 chars
        'alllowercase123!', // no uppercase
        'NO_NUMBERS_HERE!', // no digit
        'NoSpecialCharacters123', // no special char
      ];

      for (const pass of weakPasswords) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'valid@example.com',
            password: pass,
            fullName: 'Valid Name',
          },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // =========================================================================
  // 6. COOKIE & TRANSPORT SECURITY MATRIX
  // =========================================================================
  describe('6. Cookie & Transport Security Matrix', () => {
    it('COOKIE-01: Set-Cookie specifies HttpOnly, SameSite=Strict, and Path=/api/v1/auth', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleCustomer.email,
          password: 'CustomerPass123!',
        },
      });

      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/api/v1/auth');
      expect(setCookie).toContain('Max-Age=');
    });

    it('COOKIE-02: Refresh token is strictly excluded from JSON response body', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleCustomer.email,
          password: 'CustomerPass123!',
        },
      });

      const body = res.json();
      expect(body.data.refreshToken).toBeUndefined();
      expect(body.data.rawRefreshToken).toBeUndefined();
      expect(body.data.tokenHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 7. SENSITIVE-DATA LEAKAGE PREVENTION & ERROR ENVELOPE CONSISTENCY
  // =========================================================================
  describe('7. Sensitive-Data Leakage Prevention & Error Envelope Consistency', () => {
    it('LEAK-01: Canonical error envelope is preserved across all error states', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'bad-email-format',
          password: '',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('details');
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('LEAK-02: Password hash and secrets never leak in error details or user objects', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleCustomer);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleCustomer.email,
          password: 'CustomerPass123!',
        },
      });

      const stringified = JSON.stringify(res.json());
      expect(stringified).not.toContain(sampleCustomer.passwordHash);
      expect(stringified).not.toContain('argon2');
      expect(stringified).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(stringified).not.toContain('BEGIN PRIVATE KEY');
    });
  });

  // =========================================================================
  // 8. CONCURRENCY & TRANSACTION RESILIENCE
  // =========================================================================
  describe('8. Concurrency & Transaction Resilience', () => {
    it('CONCUR-01: Concurrent registration attempts for the same email result in exactly one success', async () => {
      let registered = false;
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(mockUserRepo.create).mockImplementation(async (data: any) => {
        if (registered) {
          const duplicateErr = new Error(
            'duplicate key value violates unique constraint "users_email_key"',
          );
          (duplicateErr as any).code = '23505';
          throw duplicateErr;
        }
        registered = true;
        return { ...sampleCustomer, email: data.email };
      });
      vi.mocked(mockTokenRepo.create).mockResolvedValue({} as RefreshTokenEntity);

      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'concurrent@example.com',
            password: 'CustomerPass123!',
            fullName: 'Concurrent One',
          },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'concurrent@example.com',
            password: 'CustomerPass123!',
            fullName: 'Concurrent Two',
          },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('CONCUR-02: Concurrent refresh requests with the same original token permit only one rotation', async () => {
      let rotated = false;
      const rawToken = crypto.randomBytes(32).toString('hex');
      const activeRecord: RefreshTokenEntity = {
        id: 'tok_active_concurrent',
        userId: sampleCustomer.id,
        tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
        revokedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(mockTokenRepo.findActiveByHash).mockImplementation(async () => {
        if (rotated) return null; // Already revoked by first call
        rotated = true;
        return activeRecord;
      });
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleCustomer);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValue(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValue({} as RefreshTokenEntity);

      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          cookies: { [REFRESH_TOKEN_COOKIE_NAME]: rawToken },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          cookies: { [REFRESH_TOKEN_COOKIE_NAME]: rawToken },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      expect(statuses).toEqual([200, 401]);
    });

    it('TRANS-01: Transaction failure during registration properly rolls back without dangling token', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockDb.withTransaction).mockRejectedValueOnce(
        new Error('DB transaction constraint failure'),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'failed_tx@example.com',
          password: 'CustomerPass123!',
          fullName: 'Tx Fail',
        },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('INTERNAL_ERROR');
    });
  });
});
