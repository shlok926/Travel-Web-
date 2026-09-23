import { describe, it, expect } from 'vitest';
import { loadEnv } from '../../backend/src/config/env.js';

describe('Configuration & Environment Validation', () => {
  it('should successfully load default valid configuration', () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://test_user:test_pass@localhost:5432/test_db',
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.HOLD_DURATION_MINUTES).toBe(15);
    expect(config.JWT_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
    expect(config.JWT_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
  });

  it('should reject configuration with short COOKIE_SECRET (< 32 characters)', () => {
    expect(() => {
      loadEnv({
        COOKIE_SECRET: 'too_short',
      });
    }).toThrow(/COOKIE_SECRET must be at least 32 characters/);
  });

  it('should reject local storage driver in production (Production Storage Safety Guard)', () => {
    expect(() => {
      loadEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'local',
      });
    }).toThrow(/Production environment prohibits local filesystem storage driver/);
  });

  it('should allow s3 storage driver in production environment', () => {
    const config = loadEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 's3',
      S3_BUCKET_PRIVATE: 'prod-travel-docs',
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.STORAGE_DRIVER).toBe('s3');
  });
});
