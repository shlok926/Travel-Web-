import { describe, it, expect } from 'vitest';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  getRefreshTokenCookieOptions,
  getRefreshTokenClearCookieOptions,
} from '../../backend/src/modules/auth/controllers/auth.controller.js';

describe('Phase 2 Step 10 — Authentication Hardening & Production Readiness', () => {
  describe('1. Production Storage Driver & Environment Validation', () => {
    it('PROD-ENV-01: Prohibits local storage driver in production mode', () => {
      expect(() => {
        loadEnv({
          NODE_ENV: 'production',
          STORAGE_DRIVER: 'local',
        });
      }).toThrow(/Production environment prohibits local filesystem storage driver/i);
    });

    it('PROD-ENV-02: Accepts s3 storage driver in production mode', () => {
      const prodConfig = loadEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        S3_BUCKET_PRIVATE: 'prod-bucket',
        S3_BUCKET_PUBLIC: 'prod-public',
      });

      expect(prodConfig.NODE_ENV).toBe('production');
      expect(prodConfig.STORAGE_DRIVER).toBe('s3');
    });
  });

  describe('2. Cookie Security Attributes Across Environments', () => {
    it('PROD-COOKIE-01: Secure flag is true in production environment', () => {
      const prodConfig = loadEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        S3_BUCKET_PRIVATE: 'prod-bucket',
        S3_BUCKET_PUBLIC: 'prod-public',
      });

      const options = getRefreshTokenCookieOptions(prodConfig);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.secure).toBe(true);
      expect(options.path).toBe('/api/v1/auth');
      expect(options.maxAge).toBe(604800);
    });

    it('PROD-COOKIE-02: Clear cookie options in production preserve Secure and SameSite attributes', () => {
      const prodConfig = loadEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 's3',
        S3_BUCKET_PRIVATE: 'prod-bucket',
        S3_BUCKET_PUBLIC: 'prod-public',
      });

      const clearOptions = getRefreshTokenClearCookieOptions(prodConfig);
      expect(clearOptions.httpOnly).toBe(true);
      expect(clearOptions.sameSite).toBe('strict');
      expect(clearOptions.secure).toBe(true);
      expect(clearOptions.path).toBe('/api/v1/auth');
    });

    it('DEV-COOKIE-01: Secure flag is false in development/test environment for localhost testing', () => {
      const devConfig = loadEnv({
        NODE_ENV: 'development',
      });

      const options = getRefreshTokenCookieOptions(devConfig);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.secure).toBe(false);
      expect(options.path).toBe('/api/v1/auth');
    });
  });
});
