import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
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

describe('Phase 2 Step 6 — Authentication REST API Routes & Cookie Handling', () => {
  let app: FastifyInstance;
  let mockDb: DatabaseService;
  let mockUserRepo: UserRepository;
  let mockTokenRepo: RefreshTokenRepository;
  let authService: AuthService;

  const config = loadEnv({
    NODE_ENV: 'test',
    PORT: '4005',
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock_db',
  });

  const sampleUser: UserEntity = {
    id: 'usr_8839210_uuid',
    email: 'traveller@example.com',
    passwordHash: '',
    fullName: 'John Traveller',
    mobileContact: '+919876543210',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  beforeEach(async () => {
    // Generate valid argon2 hash for sample user
    sampleUser.passwordHash = await PasswordSecurity.hash('SecurePassword123!', {
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
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    const validRegisterPayload = {
      email: 'newuser@example.com',
      password: 'SecurePassword123!',
      fullName: 'New User',
      mobileContact: '+919876543211',
    };

    it('1. registers user, sets HttpOnly refresh cookie, and returns safe UserDto + accessToken', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce({
        ...sampleUser,
        id: 'usr_new_uuid',
        email: 'newuser@example.com',
        fullName: 'New User',
      });
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: validRegisterPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe('usr_new_uuid');
      expect(body.data.user.email).toBe('newuser@example.com');
      expect(body.data.accessToken).toBeDefined();

      // Ensure sensitive fields are excluded from JSON
      expect(body.data.user.passwordHash).toBeUndefined();
      expect(body.data.user.password_hash).toBeUndefined();
      expect(body.data.rawRefreshToken).toBeUndefined();
      expect(body.data.refreshToken).toBeUndefined();

      // Inspect Set-Cookie header
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(REFRESH_TOKEN_COOKIE_NAME);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/api/v1/auth');
    });

    it('2. returns 409 Conflict when registering with duplicate email', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: validRegisterPayload,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });

    it('3. returns 400 Bad Request with validation details on invalid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'short',
          fullName: 'J',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('4. logs in valid credentials, sets HttpOnly refresh cookie, and returns tokens', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleUser.email,
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(sampleUser.id);
      expect(body.data.accessToken).toBeDefined();

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toContain(REFRESH_TOKEN_COOKIE_NAME);
      expect(setCookie).toContain('HttpOnly');
    });

    it('5. returns 401 on incorrect credentials', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'WrongPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('6. returns 403 on deactivated account login attempt', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce({
        ...sampleUser,
        isActive: false,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: sampleUser.email,
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ACCESS_FORBIDDEN');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('7. rotates refresh token from cookie and returns new accessToken', async () => {
      const activeTokenRecord: RefreshTokenEntity = {
        id: 'tok_active_123',
        userId: sampleUser.id,
        tokenHash: 'somehash',
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(activeTokenRecord);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce({} as RefreshTokenEntity);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: {
          [REFRESH_TOKEN_COOKIE_NAME]: 'a'.repeat(64),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeDefined();

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toContain(REFRESH_TOKEN_COOKIE_NAME);
      expect(setCookie).toContain('HttpOnly');
    });

    it('8. returns 401 when refresh cookie is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('9. revokes active session and clears refresh cookie', async () => {
      const activeTokenRecord: RefreshTokenEntity = {
        id: 'tok_active_123',
        userId: sampleUser.id,
        tokenHash: 'somehash',
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
        createdAt: new Date(),
      };

      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(activeTokenRecord);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        cookies: {
          [REFRESH_TOKEN_COOKIE_NAME]: 'a'.repeat(64),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('Logged out');

      // Check cookie was cleared (expires in past / max-age=0)
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(REFRESH_TOKEN_COOKIE_NAME);
    });

    it('10. logout is idempotent when no cookie is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('11. returns current authenticated user with valid Bearer token', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser);

      const token = JwtSecurity.sign(
        {
          userId: sampleUser.id,
          email: sampleUser.email,
          role: sampleUser.role,
        },
        config.JWT_PRIVATE_KEY,
        { expiresInSeconds: 900 },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(sampleUser.id);
      expect(body.data.user.email).toBe(sampleUser.email);
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it('12. returns 401 Unauthorized when Bearer token is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
