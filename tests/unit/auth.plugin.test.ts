import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { authPlugin } from '../../backend/src/plugins/auth.js';
import { securityPlugin } from '../../backend/src/plugins/security.js';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.js';
import {
  UserRepository,
  UserEntity,
} from '../../backend/src/modules/auth/repositories/user.repository.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';
import { env } from '../../backend/src/config/env.js';

describe('Phase 2 Step 5 — Fastify Authentication Decorator & RBAC Guards', () => {
  let app: FastifyInstance;
  let mockUserRepo: UserRepository;

  const sampleUser: UserEntity = {
    id: 'usr_8839210_uuid',
    email: 'traveller@example.com',
    passwordHash: '$argon2id$somehash',
    fullName: 'John Traveller',
    mobileContact: '+919876543210',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  const sampleAdmin: UserEntity = {
    ...sampleUser,
    id: 'usr_admin_uuid_999',
    email: 'admin@youngtoursandtravels.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    mockUserRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    app = Fastify({ logger: false });

    // Register Security, Auth & ErrorHandler Plugins
    await app.register(securityPlugin, { config: env });
    await app.register(authPlugin, { userRepo: mockUserRepo, config: env });
    await app.register(errorHandlerPlugin);

    // Setup test routes
    app.get('/test/protected', { preHandler: [app.authenticate] }, async (request) => {
      return { success: true, user: request.user };
    });

    app.get(
      '/test/admin-only',
      { preHandler: [app.authenticate, app.authorize(['ADMIN'])] },
      async (request) => {
        return { success: true, user: request.user };
      },
    );

    app.get(
      '/test/customer-or-admin',
      { preHandler: [app.authenticate, app.authorize(['CUSTOMER', 'ADMIN'])] },
      async (request) => {
        return { success: true, user: request.user };
      },
    );

    app.get(
      '/test/unauthenticated-authorize',
      { preHandler: [app.authorize(['ADMIN'])] },
      async (request) => {
        return { success: true, user: request.user };
      },
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function createValidToken(
    user: { id: string; email: string; role: 'CUSTOMER' | 'ADMIN' | 'AGENT' | 'GUEST' },
    expiresIn = 900,
  ) {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_PRIVATE_KEY,
      { expiresInSeconds: expiresIn },
    );
  }

  describe('JWT Authentication Verification (fastify.authenticate)', () => {
    it('1. valid RS256 Bearer token succeeds and populates request.user', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      const token = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.user).toEqual({
        userId: sampleUser.id,
        email: sampleUser.email,
        role: sampleUser.role,
      });
    });

    it('2. missing Authorization header fails with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('3. empty Authorization header fails with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: '   ' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('4. malformed Authorization header (missing token) fails with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: 'Bearer' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('5. non-Bearer scheme (e.g. Basic auth) fails with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('6. malformed JWT string fails with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: 'Bearer not.a.valid.jwt.string' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('7. expired JWT token fails with 401', async () => {
      const expiredToken = createValidToken(sampleUser, -10); // Expired 10 seconds ago

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('8. forged JWT signed with an alternate RSA private key fails with 401', async () => {
      const altKeypair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const forgedToken = JwtSecurity.sign(
        { userId: sampleUser.id, email: sampleUser.email, role: 'ADMIN' },
        altKeypair.privateKey,
      );

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${forgedToken}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('9. symmetric HS256 token is strictly rejected with 401', async () => {
      const hs256Token = jwt.sign(
        { userId: sampleUser.id, email: sampleUser.email, role: 'ADMIN' },
        'symmetric_secret_key_1234567890123456',
        { algorithm: 'HS256' },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${hs256Token}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('10. "none" algorithm token is strictly rejected with 401', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ userId: sampleUser.id, email: sampleUser.email, role: 'ADMIN' }),
      ).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${unsignedToken}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('11. token with invalid role claim is rejected with 401', async () => {
      const invalidRoleToken = JwtSecurity.sign(
        {
          userId: sampleUser.id,
          email: sampleUser.email,
          role: 'SUPERUSER' as unknown as 'CUSTOMER',
        },
        env.JWT_PRIVATE_KEY,
      );

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${invalidRoleToken}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });
  });

  describe('Real-Time Active User Status Verification', () => {
    it('12. valid JWT for nonexistent database user fails with 401', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(null);
      const token = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('13. valid JWT for deactivated/inactive database user fails with 401', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        ...sampleUser,
        isActive: false,
      });
      const token = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('RBAC Authorization Guard (fastify.authorize)', () => {
    it('14. ADMIN user is allowed on ADMIN-only route', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleAdmin);
      const adminToken = createValidToken(sampleAdmin);

      const response = await app.inject({
        method: 'GET',
        url: '/test/admin-only',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.user.role).toBe('ADMIN');
    });

    it('15. CUSTOMER user is rejected from ADMIN-only route with 403 FORBIDDEN', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      const customerToken = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: '/test/admin-only',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('16. multiple allowed roles route accepts both CUSTOMER and ADMIN', async () => {
      // CUSTOMER test
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      const customerToken = createValidToken(sampleUser);
      const customerRes = await app.inject({
        method: 'GET',
        url: '/test/customer-or-admin',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(customerRes.statusCode).toBe(200);

      // ADMIN test
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleAdmin);
      const adminToken = createValidToken(sampleAdmin);
      const adminRes = await app.inject({
        method: 'GET',
        url: '/test/customer-or-admin',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminRes.statusCode).toBe(200);
    });

    it('17. authorize hook rejects with 401 if called before authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/unauthenticated-authorize',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token Source Restriction Defense', () => {
    it('18. token in query parameters is not accepted for authentication', async () => {
      const token = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: `/test/protected?token=${token}&access_token=${token}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('19. token in cookie is not accepted as Bearer authentication', async () => {
      const token = createValidToken(sampleUser);

      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        cookies: {
          accessToken: token,
          token: token,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
