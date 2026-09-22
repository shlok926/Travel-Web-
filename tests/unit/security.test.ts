import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PasswordSecurity } from '../../shared/src/security/argon2.js';
import { JwtSecurity, JwtTokenPayload } from '../../shared/src/security/jwt.js';
import { env } from '../../backend/src/config/env.js';

describe('Security Baseline — Argon2id & RS256 JWT Tokens', () => {
  it('should hash and verify passwords using Argon2id', async () => {
    const plainText = 'P@ssw0rdSecure!2026';
    const hash = await PasswordSecurity.hash(plainText, {
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    expect(hash).toContain('$argon2id$');

    const isValid = await PasswordSecurity.verify(hash, plainText);
    expect(isValid).toBe(true);

    const isWrong = await PasswordSecurity.verify(hash, 'WrongPassword123');
    expect(isWrong).toBe(false);
  });

  describe('RS256-Only JWT Token Security', () => {
    const payload: JwtTokenPayload = {
      userId: 'usr_8839210',
      role: 'CUSTOMER',
      email: 'traveller@example.com',
    };

    it('1. should successfully sign and verify tokens using RS256 asymmetric keypair', () => {
      const token = JwtSecurity.sign(payload, env.JWT_PRIVATE_KEY, {
        expiresInSeconds: 300,
      });

      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Verify header uses RS256
      const headerPart = parts[0] ?? '';
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf-8'));
      expect(header.alg).toBe('RS256');

      const decoded = JwtSecurity.verify(token, env.JWT_PUBLIC_KEY);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.email).toBe(payload.email);
    });

    it('2. should fail verification when signed with a different private key', () => {
      // Generate an alternate RSA keypair
      const altKeypair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const foreignToken = JwtSecurity.sign(payload, altKeypair.privateKey);

      expect(() => {
        JwtSecurity.verify(foreignToken, env.JWT_PUBLIC_KEY);
      }).toThrow(/invalid signature/i);
    });

    it('3. should strictly reject symmetric HS256 tokens', () => {
      // Manually forge an HS256 token
      const forgedHs256Token = jwt.sign(payload, 'symmetric_secret_key_1234567890123456', {
        algorithm: 'HS256',
      });

      expect(() => {
        JwtSecurity.verify(forgedHs256Token, env.JWT_PUBLIC_KEY);
      }).toThrow(/Invalid or unsupported JWT algorithm.*RS256/i);
    });

    it('4. should reject algorithm confusion / "none" algorithm tokens', () => {
      // Craft an unverified token with alg "none"
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const unsignedNoneToken = `${header}.${body}.`;

      expect(() => {
        JwtSecurity.verify(unsignedNoneToken, env.JWT_PUBLIC_KEY);
      }).toThrow(/Invalid or unsupported JWT algorithm.*RS256/i);
    });
  });
});
