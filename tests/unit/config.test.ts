import { describe, it, expect } from 'vitest';
import { loadEnv } from '../../backend/src/config/env.js';

describe('Configuration & Environment Validation', () => {
  it('should successfully load default valid configuration', () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://test_user:test_pass@localhost:5432/test_db',
      JWT_SECRET_KEY: 'test_jwt_secret_key_minimum_32_characters_long_123',
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.HOLD_DURATION_MINUTES).toBe(15);
  });

  it('should reject configuration with short JWT secret key in development/production', () => {
    expect(() => {
      loadEnv({
        JWT_SECRET_KEY: 'too_short',
      });
    }).toThrow(/JWT_SECRET_KEY must be at least 32 characters/);
  });
});
