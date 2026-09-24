import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Schema & Migration DDL Constraints Verification', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/001_create_identity_schema.sql',
  );

  let sqlContent: string;

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');
  });

  it('1. should include pgcrypto extension for UUID generation', () => {
    expect(sqlContent).toMatch(/CREATE EXTENSION IF NOT EXISTS "pgcrypto"/i);
  });

  describe('users table definition', () => {
    it('2. should define users table with all required fields and constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS users/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Email constraint: VARCHAR(255) UNIQUE NOT NULL
      expect(sqlContent).toMatch(/email\s+VARCHAR\(255\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Password hash: VARCHAR(255) NOT NULL
      expect(sqlContent).toMatch(/password_hash\s+VARCHAR\(255\)\s+NOT\s+NULL/i);

      // Full Name: VARCHAR(255) NOT NULL
      expect(sqlContent).toMatch(/full_name\s+VARCHAR\(255\)\s+NOT\s+NULL/i);

      // Mobile contact: VARCHAR(30)
      expect(sqlContent).toMatch(/mobile_contact\s+VARCHAR\(30\)/i);

      // Role: VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER'
      expect(sqlContent).toMatch(/role\s+VARCHAR\(50\)\s+NOT\s+NULL\s+DEFAULT\s+['"]CUSTOMER['"]/i);

      // is_active: BOOLEAN NOT NULL DEFAULT TRUE
      expect(sqlContent).toMatch(/is_active\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE/i);

      // last_login_at: TIMESTAMPTZ
      expect(sqlContent).toMatch(/last_login_at\s+TIMESTAMPTZ/i);

      // created_at & updated_at timestamps
      expect(sqlContent).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
      expect(sqlContent).toMatch(
        /updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });
  });

  describe('refresh_tokens table definition', () => {
    it('3. should define refresh_tokens table with foreign key and cascade constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS refresh_tokens/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Foreign Key with ON DELETE CASCADE
      expect(sqlContent).toMatch(
        /user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
      );

      // Token Hash: VARCHAR(64) UNIQUE NOT NULL (SHA-256 hex string)
      expect(sqlContent).toMatch(/token_hash\s+VARCHAR\(64\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Expires At: TIMESTAMPTZ NOT NULL
      expect(sqlContent).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);

      // Revoked At: TIMESTAMPTZ (nullable)
      expect(sqlContent).toMatch(/revoked_at\s+TIMESTAMPTZ/i);

      // Created At: TIMESTAMPTZ NOT NULL DEFAULT NOW()
      expect(sqlContent).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });
  });

  describe('Indexes & Performance', () => {
    it('4. should create non-redundant secondary indexes', () => {
      // Role index
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_users_role ON users\s*\(\s*role\s*\)/i,
      );

      // Foreign key index
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens\s*\(\s*user_id\s*\)/i,
      );

      // Must NOT have redundant manual indexes on UNIQUE constraint columns
      expect(sqlContent).not.toMatch(/CREATE INDEX.*idx_users_email/i);
      expect(sqlContent).not.toMatch(/CREATE INDEX.*idx_refresh_tokens_hash/i);
    });
  });
});
