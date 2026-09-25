import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  UserRepository,
  RefreshTokenRepository,
  UserEntity,
  RefreshTokenEntity,
} from '../../backend/src/modules/auth/repositories/index.js';
import { AuthService } from '../../backend/src/modules/auth/services/auth.service.js';
import { PasswordSecurity } from '../../shared/src/security/argon2.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';
import { EnvConfig } from '../../backend/src/config/env.js';

describe('Phase 2 Step 4 — AuthService Domain Service', () => {
  let mockDb: DatabaseService;
  let mockUserRepo: UserRepository;
  let mockTokenRepo: RefreshTokenRepository;
  let authService: AuthService;
  let mockClient: pg.PoolClient;

  // Canonical RSA 2048-bit Keypair for tests
  const testConfig = {
    NODE_ENV: 'test',
    JWT_ACCESS_EXPIRES_IN: 900,
    JWT_REFRESH_EXPIRES_IN: 604800,
    JWT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCuMhSWidtaNWDZ
bCdXXg+VG9APN3lUHmgBuTI+iR2g3qs0GJjH1kXsx5+74UPiCpCyZQ9FhhwVLtXh
yEBp5fEnjTyo1uUoV8lA0gsEl2DdhNHnIHjWDsqHTapFOHX5OnNgDDdXLIt6uOn5
oU3plAZ1qsf7f2UX1BFhnFd1PrbTD+KM8q1VtIZ86pl2bFQMBOrC9e/k47LCbJDS
rgyrukZLwdE53DP2VlK8afC7KvW+Mp/ZuNoxpVuAzFv83DnNlQl+G2QOldiv985y
+26M8jNiLrQYWQfBiWvtCwZHOhf1F/o3pHswPKwIVUIY5661qpPJ8+QbV4k+8YVX
K5tkWUVXAgMBAAECggEAHJuW6/4p6w+3Hx32/A8zie5uZgFbSKhRtm6+xKxqFEBd
Z4nelXsoMrG6FvXw2w+XIeUc8/MJa6UsdQ8ZHQspZrB4VNYt/kkkgSO9sXxW6Spl
+opHrgfx1PS5UPLr1Ql3Zz+6WvOy2G3D5z5JeGHaCbsJatFKPfaTAC/X4SZyigjd
cwb7k8EG0A/g9N6a0QrjRpdRSWAD2M9QmTWfsmxd6P1AVdBdTLUyRoi4E8Z162bw
di0vXirnTK346z/2++86a1kYyVF0SuhnWopzoIe+fsXNQACc8q305bhiCA1QjEMt
OayuBToFt3OSRTvXnUp78ZRH51YEdnmtKkvZWdOXUQKBgQDVuNLtL9uVPHg8WoKM
9eIyRBROUhSP5qU65cOtB4kXC2hhFJLojtyvlgiPmnOGslOBNPZGtqC7/HAHPUKO
TY8hDw0bPrtMGG5pBYqGd2mjNejd6AzyoJZ7TqtlSXsAIr5NDWW6b1sPT0hSdIiy
5+O6H5PfkEU097ZjRzcu9EKh3wKBgQDQp5Z+4zXz6eBAN0zl5YytF1SQaGqvn5ko
rG23t4ESM4Bj91ER0YuYc/fCNQpC1T2Gv6VOr3U8IO6emJ5+JOWffqWH/9KdO6NQ
2slDupgF36E+HF5Ts1led2IJfjO4qs1VC1/MPnE6gKYko95tovYI1H5I6TcbHFfN
gbH55WX7iQKBgCdgrWRMPA4MHS8pkgI8z5dpWcBweR9mZK0sZlg8GjMnw+yXKNY2
dEzZvOwQjhaURrR4uKOgxI6+XTnIPLoRajyyFD0f2syTd8xb3AEYgVsz9JrmRXRy
yCciAIxh9Iq63AtAW6z1FXcFqZKfrAwik5/Yb5tybn3q4iz6kx1QnfJLAoGBALt3
dw22Eol9fc/0X5DGd2gk6AN+7SuxlygmE8XWh47U2uv2Ds6VmHh26QmCIh/9+vOQ
SHOzzP8jD4FK2ku31t9AKHVSceZ26LsCd4X0phXQ4MwvLMjDAO6REHI7AzlNrIJW
X9Hf4FeRsrSEzpluquMwF+5mKu6evnyTpFZDtycRAoGAUQG9I6PdwP7Luz3YJwjp
Itd67Oec4lVt5YPP4zO7sZMShrMauzBSq/JPeFBDGxVSB3hREYla3d5iiQs1REvU
Llk/fRrTZg8OyLdqjVVs7VKE2mvIMfR7GHziwIng27aZODvOgVO4sA4S4HDP405F
dDoUHT8J06AaHfWO7JTJd/s=
-----END PRIVATE KEY-----`,
    JWT_PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArjIUlonbWjVg2WwnV14P
lRvQDzd5VB5oAbkyPokdoN6rNBiYx9ZF7Mefu+FD4gqQsmUPRYYcFS7V4chAaeXx
J408qNblKFfJQNILBJdg3YTR5yB41g7Kh02qRTh1+TpzYAw3VyyLerjp+aFN6ZQG
darH+39lF9QRYZxXdT620w/ijPKtVbSGfOqZdmxUDATqwvXv5OOywmyQ0q4Mq7pG
S8HROdwz9lZSvGnwuyr1vjKf2bjaMaVbgMxb/Nw5zZUJfhtkDpXYr/fOcvtujPIz
Yi60GFkHwYlr7QsGRzoX9Rf6N6R7MDysCFVCGOeutaqTyfPkG1eJPvGFVyubZFlF
VwIDAQAB
-----END PUBLIC KEY-----`,
    ARGON2_MEMORY_COST: 4096,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
  } as unknown as EnvConfig;

  const sampleUser: UserEntity = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'traveller@example.com',
    passwordHash: '$argon2id$v=19$m=4096,t=2,p=1$fakehash',
    fullName: 'John Traveller',
    mobileContact: '+919876543210',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date('2026-09-25T01:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };

  const sampleToken: RefreshTokenEntity = {
    id: 'b1ffcd88-8b0a-3ef7-aa5c-5aa8ac270b22',
    userId: sampleUser.id,
    tokenHash: 'sampletokenhash64charslong12345678901234567890123456789012345678',
    expiresAt: new Date(Date.now() + 604800000),
    revokedAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockClient = {} as pg.PoolClient;

    mockDb = {
      withTransaction: vi.fn(async (callback) => callback(mockClient)),
      query: vi.fn(),
    } as unknown as DatabaseService;

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

    authService = new AuthService(mockDb, mockUserRepo, mockTokenRepo, testConfig);
  });

  describe('Registration Flow', () => {
    const validRegisterInput = {
      email: 'traveller@example.com',
      password: 'SecurePassword123!',
      fullName: 'John Traveller',
      mobileContact: '+919876543210',
    };

    it('1. successfully registers a new user with CUSTOMER role and returns tokens', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      const result = await authService.register(validRegisterInput);

      expect(result.user.id).toBe(sampleUser.id);
      expect(result.user.email).toBe(sampleUser.email);
      expect(result.user.role).toBe('CUSTOMER');
      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
      expect(result.rawRefreshToken).toHaveLength(64); // 32 bytes hex = 64 hex chars

      // Verify RS256 token validity
      const decoded = JwtSecurity.verify(result.accessToken, testConfig.JWT_PUBLIC_KEY);
      expect(decoded.userId).toBe(sampleUser.id);
      expect(decoded.email).toBe(sampleUser.email);
      expect(decoded.role).toBe('CUSTOMER');
    });

    it('2. normalizes email before checking existence and creating user', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      await authService.register({
        ...validRegisterInput,
        email: '  TRAVELLER@Example.COM  ',
      });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('traveller@example.com');
      const createCall = vi.mocked(mockUserRepo.create).mock.calls[0];
      expect(createCall?.[0].email).toBe('traveller@example.com');
    });

    it('3. rejects registration if email already exists with 409 CONFLICT', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(sampleUser);

      await expect(authService.register(validRegisterInput)).rejects.toThrow(/already exists/i);
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('4. hashes password using Argon2id and passes hash (not plaintext) to repository', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      await authService.register(validRegisterInput);

      const createCall = vi.mocked(mockUserRepo.create).mock.calls[0];
      const passwordHash = createCall?.[0].passwordHash;

      expect(passwordHash).toBeDefined();
      expect(passwordHash).not.toBe(validRegisterInput.password);
      expect(passwordHash).toContain('$argon2id$');

      // Verify hash against plaintext
      const isValid = await PasswordSecurity.verify(
        passwordHash as string,
        validRegisterInput.password,
      );
      expect(isValid).toBe(true);
    });

    it('5. returned UserDto excludes passwordHash and internal tokens', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      const result = await authService.register(validRegisterInput);

      const userRecord = result.user as unknown as Record<string, unknown>;
      expect(userRecord.passwordHash).toBeUndefined();
      expect(userRecord.password_hash).toBeUndefined();
      expect(userRecord.tokenHash).toBeUndefined();
      expect(userRecord.token_hash).toBeUndefined();
    });

    it('6. validates registration schema and rejects malformed email or weak password', async () => {
      await expect(
        authService.register({ ...validRegisterInput, email: 'not-an-email' }),
      ).rejects.toThrow(/Validation failed/i);

      await expect(
        authService.register({ ...validRegisterInput, password: 'weak' }),
      ).rejects.toThrow(/Validation failed/i);
    });
  });

  describe('Login Flow', () => {
    const validLoginInput = {
      email: 'traveller@example.com',
      password: 'SecurePassword123!',
    };

    it('7. successfully authenticates valid credentials, updates last_login_at, and issues tokens', async () => {
      const realHash = await PasswordSecurity.hash(validLoginInput.password, {
        memoryCost: 4096,
        timeCost: 2,
        parallelism: 1,
      });

      const userWithRealHash = { ...sampleUser, passwordHash: realHash };
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(userWithRealHash);
      vi.mocked(mockUserRepo.updateLastLogin).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      const result = await authService.login(validLoginInput);

      expect(result.user.id).toBe(sampleUser.id);
      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith(sampleUser.id, mockClient);
      expect(mockTokenRepo.create).toHaveBeenCalled();
    });

    it('8. rejects non-existent user with generic 401 AUTHENTICATION_FAILED', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(null);

      await expect(authService.login(validLoginInput)).rejects.toThrow(
        /Invalid email or password/i,
      );
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('9. rejects wrong password with generic 401 AUTHENTICATION_FAILED', async () => {
      const realHash = await PasswordSecurity.hash('DifferentPassword123!', {
        memoryCost: 4096,
        timeCost: 2,
        parallelism: 1,
      });

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce({
        ...sampleUser,
        passwordHash: realHash,
      });

      await expect(authService.login(validLoginInput)).rejects.toThrow(
        /Invalid email or password/i,
      );
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('10. rejects inactive / deactivated user with 403 ACCESS_FORBIDDEN', async () => {
      const realHash = await PasswordSecurity.hash(validLoginInput.password, {
        memoryCost: 4096,
        timeCost: 2,
        parallelism: 1,
      });

      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce({
        ...sampleUser,
        passwordHash: realHash,
        isActive: false,
      });

      await expect(authService.login(validLoginInput)).rejects.toThrow(/deactivated/i);
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });
  });

  describe('Refresh Token Rotation Flow', () => {
    it('11. successfully performs atomic refresh rotation inside a single transaction', async () => {
      const rawRefreshToken = 'a'.repeat(64);
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(sampleToken);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockResolvedValueOnce(sampleToken);

      const result = await authService.refresh(rawRefreshToken);

      expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockTokenRepo.findActiveByHash).toHaveBeenCalledWith(expect.any(String), mockClient);
      expect(mockUserRepo.findById).toHaveBeenCalledWith(sampleToken.userId, mockClient);
      expect(mockTokenRepo.revoke).toHaveBeenCalledWith(sampleToken.id, mockClient);
      expect(mockTokenRepo.create).toHaveBeenCalledWith(expect.any(Object), mockClient);

      expect(result.user.id).toBe(sampleUser.id);
      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
      expect(result.rawRefreshToken).not.toBe(rawRefreshToken); // Rotated to new token
    });

    it('12. rejects empty, missing, or whitespace refresh token', async () => {
      await expect(authService.refresh('')).rejects.toThrow(/Invalid or missing refresh token/i);
      await expect(authService.refresh('   ')).rejects.toThrow(/Invalid or missing refresh token/i);
    });

    it('13. rejects refresh when token is expired, revoked, or not found', async () => {
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(null);

      await expect(
        authService.refresh('somevalidlookingtokenhashstring12345678901234567890123456789012'),
      ).rejects.toThrow(/Invalid, expired, or revoked refresh token/i);
      expect(mockTokenRepo.revoke).not.toHaveBeenCalled();
      expect(mockTokenRepo.create).not.toHaveBeenCalled();
    });

    it('14. rejects refresh when user account is deactivated', async () => {
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(sampleToken);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        ...sampleUser,
        isActive: false,
      });

      await expect(
        authService.refresh('somevalidlookingtokenhashstring12345678901234567890123456789012'),
      ).rejects.toThrow(/deactivated/i);
      expect(mockTokenRepo.revoke).not.toHaveBeenCalled();
    });

    it('15. fails and aborts entire rotation transaction if replacement persistence fails', async () => {
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(sampleToken);
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);
      vi.mocked(mockTokenRepo.create).mockRejectedValueOnce(new Error('DB connection reset'));

      await expect(
        authService.refresh('somevalidlookingtokenhashstring12345678901234567890123456789012'),
      ).rejects.toThrow('DB connection reset');
    });
  });

  describe('Logout Flow', () => {
    it('16. revokes active token by hash during logout', async () => {
      const rawRefreshToken = 'a'.repeat(64);
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(sampleToken);
      vi.mocked(mockTokenRepo.revoke).mockResolvedValueOnce(true);

      await authService.logout(rawRefreshToken);

      expect(mockTokenRepo.findActiveByHash).toHaveBeenCalledWith(expect.any(String));
      expect(mockTokenRepo.revoke).toHaveBeenCalledWith(sampleToken.id);
    });

    it('17. is idempotent and succeeds without error when token is already revoked or missing', async () => {
      vi.mocked(mockTokenRepo.findActiveByHash).mockResolvedValueOnce(null);

      await expect(authService.logout('already_revoked_token')).resolves.toBeUndefined();
      await expect(authService.logout('')).resolves.toBeUndefined();
      await expect(authService.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe('getCurrentUser Flow', () => {
    it('18. returns safe UserDto for active user', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(sampleUser);

      const userDto = await authService.getCurrentUser(sampleUser.id);

      expect(userDto.id).toBe(sampleUser.id);
      expect(userDto.email).toBe(sampleUser.email);
      expect(userDto.role).toBe(sampleUser.role);
      expect(userDto.isActive).toBe(true);

      const asRecord = userDto as unknown as Record<string, unknown>;
      expect(asRecord.passwordHash).toBeUndefined();
      expect(asRecord.password_hash).toBeUndefined();
    });

    it('19. rejects when user not found with 404', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(null);

      await expect(authService.getCurrentUser('missing-user-id')).rejects.toThrow(
        /User not found/i,
      );
    });

    it('20. rejects when user is inactive with 403', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        ...sampleUser,
        isActive: false,
      });

      await expect(authService.getCurrentUser(sampleUser.id)).rejects.toThrow(/deactivated/i);
    });

    it('21. rejects when userId is empty with 400', async () => {
      await expect(authService.getCurrentUser('')).rejects.toThrow(/User ID is required/i);
    });
  });
});
