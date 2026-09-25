import { DatabaseService } from '../index.js';
import { PasswordSecurity } from '../../../../../shared/src/security/argon2.js';
import { EnvConfig, loadEnv } from '../../../config/env.js';

export interface AdminSeedResult {
  status: 'created' | 'already_exists' | 'skipped';
  email: string;
  userId?: string;
}

const INSECURE_PASSWORDS = new Set([
  'admin',
  'admin123',
  'password',
  'password123',
  'Admin@123',
  'changeme',
  'secret',
  '12345678',
  'Admin@Dev2026!',
]);

/**
 * Seeds the initial administrator account safely and idempotently.
 */
export async function seedAdmin(
  db: DatabaseService,
  config: EnvConfig = loadEnv(),
): Promise<AdminSeedResult> {
  const isProduction = config.NODE_ENV === 'production';
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@youngtoursandtravels.com';
  const password = process.env.ADMIN_SEED_PASSWORD;

  // 1. Production Safety Guards
  if (isProduction) {
    if (!password) {
      throw new Error(
        'Production Security Guard: ADMIN_SEED_PASSWORD environment variable must be explicitly set to seed an admin user.',
      );
    }

    if (password.length < 12) {
      throw new Error(
        'Production Security Guard: ADMIN_SEED_PASSWORD must be at least 12 characters in production.',
      );
    }

    if (INSECURE_PASSWORDS.has(password)) {
      throw new Error(
        'Production Security Guard: ADMIN_SEED_PASSWORD matches a known default or insecure password. A strong, unique secret is required in production.',
      );
    }
  }

  // Determine effective password for non-production environments
  const effectivePassword = password || 'Admin@Dev2026!';

  // 2. Check if admin user already exists (Idempotency check)
  const existingUser = await db.query<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM users WHERE email = $1`,
    [email],
  );

  if (existingUser.rowCount && existingUser.rowCount > 0) {
    const existing = existingUser.rows[0]!;
    return {
      status: 'already_exists',
      email: existing.email,
      userId: existing.id,
    };
  }

  // 3. Hash password using Argon2id
  const passwordHash = await PasswordSecurity.hash(effectivePassword, {
    memoryCost: config.ARGON2_MEMORY_COST,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
  });

  // 4. Atomically insert admin user record
  const result = await db.query<{ id: string; email: string }>(
    `INSERT INTO users (
      email,
      password_hash,
      full_name,
      role,
      is_active
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email;`,
    [email, passwordHash, 'System Administrator', 'ADMIN', true],
  );

  if (!result.rowCount || result.rowCount === 0) {
    // Handled race condition where user was inserted concurrently
    const fetched = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1`,
      [email],
    );
    return {
      status: 'already_exists',
      email,
      userId: fetched.rows[0]?.id,
    };
  }

  const createdUser = result.rows[0]!;
  return {
    status: 'created',
    email: createdUser.email,
    userId: createdUser.id,
  };
}

/**
 * CLI runner when executed directly via Node / tsx
 */
async function main(): Promise<void> {
  const config = loadEnv();
  const db = new DatabaseService(config);

  try {
    console.info('🔄 Checking database and executing admin seed...');
    const result = await seedAdmin(db, config);
    if (result.status === 'created') {
      console.info(`✅ Admin user successfully seeded: ${result.email} (ID: ${result.userId})`);
    } else {
      console.info(`ℹ️ Admin user already exists: ${result.email} (ID: ${result.userId})`);
    }
  } catch (err) {
    console.error('❌ Admin seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Execute if run directly from CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('seedAdmin.ts') || process.argv[1].endsWith('seedAdmin.js'))
) {
  void main();
}
