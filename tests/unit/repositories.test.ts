import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import {
  UserRepository,
  UserRow,
  RefreshTokenRepository,
  RefreshTokenRow,
} from '../../backend/src/modules/auth/repositories/index.js';

describe('Phase 2 Step 3 — User & RefreshToken Repositories', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockClientQuery: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseService;
  let mockClient: pg.PoolClient;
  let userRepo: UserRepository;
  let tokenRepo: RefreshTokenRepository;

  const sampleUserRow: UserRow = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'traveller@example.com',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'John Traveller',
    mobile_contact: '+919876543210',
    role: 'CUSTOMER',
    is_active: true,
    last_login_at: '2026-09-25T01:00:00.000Z',
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
  };

  const sampleTokenRow: RefreshTokenRow = {
    id: 'b1ffcd88-8b0a-3ef7-aa5c-5aa8ac270b22',
    user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expires_at: new Date(Date.now() + 604800000).toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    mockQuery = vi.fn();
    mockClientQuery = vi.fn();

    mockDb = {
      query: mockQuery,
    } as unknown as DatabaseService;

    mockClient = {
      query: mockClientQuery,
    } as unknown as pg.PoolClient;

    userRepo = new UserRepository(mockDb);
    tokenRepo = new RefreshTokenRepository(mockDb);
  });

  describe('UserRepository', () => {
    it('1. findByEmail returns mapped UserEntity when user exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      const user = await userRepo.findByEmail('traveller@example.com');

      expect(user).not.toBeNull();
      expect(user?.id).toBe(sampleUserRow.id);
      expect(user?.email).toBe(sampleUserRow.email);
      expect(user?.passwordHash).toBe(sampleUserRow.password_hash);
      expect(user?.fullName).toBe(sampleUserRow.full_name);
      expect(user?.mobileContact).toBe(sampleUserRow.mobile_contact);
      expect(user?.role).toBe('CUSTOMER');
      expect(user?.isActive).toBe(true);
      expect(user?.lastLoginAt).toEqual(new Date(sampleUserRow.last_login_at as string));

      // Parameterized assertion
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), [
        'traveller@example.com',
      ]);
    });

    it('2. findByEmail returns null when user does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const user = await userRepo.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });

    it('3. findById returns mapped UserEntity when user exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      const user = await userRepo.findById(sampleUserRow.id);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(sampleUserRow.id);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [
        sampleUserRow.id,
      ]);
    });

    it('4. findById returns null when user does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const user = await userRepo.findById('missing-id');

      expect(user).toBeNull();
    });

    it('5. create persists a valid user and returns mapped UserEntity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      const result = await userRepo.create({
        email: 'traveller@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        fullName: 'John Traveller',
        mobileContact: '+919876543210',
        role: 'CUSTOMER',
        isActive: true,
      });

      expect(result.id).toBe(sampleUserRow.id);
      expect(result.email).toBe('traveller@example.com');
      expect(result.passwordHash).toBe('$argon2id$v=19$m=65536,t=3,p=4$somehash');

      // Parameterized assertion
      const call = mockQuery.mock.calls[0];
      expect(call?.[0]).toContain('INSERT INTO users');
      expect(call?.[1]).toEqual([
        'traveller@example.com',
        '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        'John Traveller',
        '+919876543210',
        'CUSTOMER',
        true,
      ]);
    });

    it('6. create defaults role to CUSTOMER and isActive to true when omitted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      await userRepo.create({
        email: 'traveller@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        fullName: 'John Traveller',
      });

      const call = mockQuery.mock.calls[0];
      expect(call?.[1]).toEqual([
        'traveller@example.com',
        '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        'John Traveller',
        null,
        'CUSTOMER',
        true,
      ]);
    });

    it('7. updateLastLogin updates last_login_at and updated_at timestamps', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: sampleUserRow.id }],
        rowCount: 1,
      });

      const success = await userRepo.updateLastLogin(sampleUserRow.id);

      expect(success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET last_login_at = NOW(),\n          updated_at = NOW()'),
        [sampleUserRow.id],
      );
    });

    it('8. updateLastLogin returns false when user row not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const success = await userRepo.updateLastLogin('missing-id');

      expect(success).toBe(false);
    });

    it('9. password_hash remains preserved in UserEntity for AuthService verification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      const user = await userRepo.findByEmail('traveller@example.com');

      expect(user?.passwordHash).toBe(sampleUserRow.password_hash);
    });

    it('10. uses transaction client when provided for user operations', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [sampleUserRow],
        rowCount: 1,
      });

      const user = await userRepo.findByEmail('traveller@example.com', mockClient);

      expect(user).not.toBeNull();
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('RefreshTokenRepository', () => {
    it('11. create persists refresh token record and returns RefreshTokenEntity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleTokenRow],
        rowCount: 1,
      });

      const expiresAt = new Date(sampleTokenRow.expires_at as string);
      const token = await tokenRepo.create({
        userId: sampleTokenRow.user_id,
        tokenHash: sampleTokenRow.token_hash,
        expiresAt,
      });

      expect(token.id).toBe(sampleTokenRow.id);
      expect(token.userId).toBe(sampleTokenRow.user_id);
      expect(token.tokenHash).toBe(sampleTokenRow.token_hash);
      expect(token.revokedAt).toBeNull();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        [sampleTokenRow.user_id, sampleTokenRow.token_hash, expiresAt],
      );
    });

    it('12. findActiveByHash queries for unrevoked, unexpired tokens', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [sampleTokenRow],
        rowCount: 1,
      });

      const token = await tokenRepo.findActiveByHash(sampleTokenRow.token_hash);

      expect(token).not.toBeNull();
      expect(token?.id).toBe(sampleTokenRow.id);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'WHERE token_hash = $1\n        AND revoked_at IS NULL\n        AND expires_at > NOW()',
        ),
        [sampleTokenRow.token_hash],
      );
    });

    it('13. findActiveByHash returns null when no matching active token found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const token = await tokenRepo.findActiveByHash('inactive_or_missing_hash');

      expect(token).toBeNull();
    });

    it('14. revoke sets revoked_at = NOW() without deleting token row', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: sampleTokenRow.id }],
        rowCount: 1,
      });

      const success = await tokenRepo.revoke(sampleTokenRow.id);

      expect(success).toBe(true);
      const call = mockQuery.mock.calls[0];
      expect(call?.[0]).toContain('UPDATE refresh_tokens\n      SET revoked_at = NOW()');
      expect(call?.[0]).not.toContain('DELETE');
      expect(call?.[1]).toEqual([sampleTokenRow.id]);
    });

    it('15. revoke returns false when token already revoked or not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const success = await tokenRepo.revoke('already-revoked-id');

      expect(success).toBe(false);
    });

    it('16. revokeAllForUser sets revoked_at = NOW() for all active user tokens', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 3,
      });

      const count = await tokenRepo.revokeAllForUser(sampleUserRow.id);

      expect(count).toBe(3);
      const call = mockQuery.mock.calls[0];
      expect(call?.[0]).toContain('UPDATE refresh_tokens\n      SET revoked_at = NOW()');
      expect(call?.[0]).toContain('WHERE user_id = $1');
      expect(call?.[0]).not.toContain('DELETE');
      expect(call?.[1]).toEqual([sampleUserRow.id]);
    });

    it('17. transaction-aware create executes on supplied pg.PoolClient', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [sampleTokenRow],
        rowCount: 1,
      });

      const token = await tokenRepo.create(
        {
          userId: sampleTokenRow.user_id,
          tokenHash: sampleTokenRow.token_hash,
          expiresAt: new Date(sampleTokenRow.expires_at as string),
        },
        mockClient,
      );

      expect(token).toBeDefined();
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('18. transaction-aware revoke executes on supplied pg.PoolClient', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: sampleTokenRow.id }],
        rowCount: 1,
      });

      const success = await tokenRepo.revoke(sampleTokenRow.id, mockClient);

      expect(success).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('19. transaction-aware revokeAllForUser executes on supplied pg.PoolClient', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
      });

      const count = await tokenRepo.revokeAllForUser(sampleUserRow.id, mockClient);

      expect(count).toBe(2);
      expect(mockClientQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('SQL Parameterization & Security Defense', () => {
    it('20. malicious email payload is parameterized and cannot alter SQL query structure', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const maliciousEmail = "' OR '1'='1' --";

      await userRepo.findByEmail(maliciousEmail);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1;'), [
        maliciousEmail,
      ]);
    });

    it('21. malicious tokenHash payload is parameterized and cannot alter SQL query structure', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const maliciousHash = "'; DROP TABLE refresh_tokens; --";

      await tokenRepo.findActiveByHash(maliciousHash);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE token_hash = $1'), [
        maliciousHash,
      ]);
    });

    it('22. malicious userId payload is parameterized and cannot alter SQL query structure', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const maliciousId = "1' UNION SELECT * FROM users --";

      await userRepo.findById(maliciousId);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1;'), [
        maliciousId,
      ]);
    });
  });
});
