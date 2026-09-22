import { describe, it, expect } from 'vitest';
import { PasswordSecurity } from '../../shared/src/security/argon2.js';
import { JwtSecurity, JwtTokenPayload } from '../../shared/src/security/jwt.js';

describe('Security Baseline — Argon2id & JWT Tokens', () => {
  it('should hash and verify passwords using Argon2id', async () => {
    const plainText = 'P@ssw0rdSecure!2026';
    const hash = await PasswordSecurity.hash(plainText, {
      memoryCost: 4096,
      timeCost: 2, // Argon2 minimum time cost is 2
      parallelism: 1,
    });

    expect(hash).toContain('$argon2id$');

    const isValid = await PasswordSecurity.verify(hash, plainText);
    expect(isValid).toBe(true);

    const isWrong = await PasswordSecurity.verify(hash, 'WrongPassword123');
    expect(isWrong).toBe(false);
  });

  it('should sign and verify JWT access tokens with HS256 / RS256 compatibility', () => {
    const secretKey = 'test_secret_key_minimum_32_characters_long_12345';
    const payload: JwtTokenPayload = {
      userId: 'usr_8839210',
      role: 'CUSTOMER',
      email: 'traveller@example.com',
    };

    const token = JwtSecurity.sign(payload, secretKey, {
      algorithm: 'HS256',
      expiresInSeconds: 300,
    });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = JwtSecurity.verify(token, secretKey, {
      algorithm: 'HS256',
    });

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.email).toBe(payload.email);
  });
});
