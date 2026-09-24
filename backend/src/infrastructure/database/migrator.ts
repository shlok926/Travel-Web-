import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from './index.js';
import { loadEnv } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  total: number;
}

export interface MigrationRecord {
  id: number;
  migration_name: string;
  applied_at: Date;
}

/**
 * Ensures the schema_migrations tracking table exists.
 */
export async function ensureMigrationTable(db: DatabaseService): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Retrieves the list of all applied migration names in chronological order.
 */
export async function getAppliedMigrations(db: DatabaseService): Promise<string[]> {
  await ensureMigrationTable(db);
  const result = await db.query<MigrationRecord>(
    `SELECT migration_name FROM schema_migrations ORDER BY id ASC`,
  );
  return result.rows.map((row) => row.migration_name);
}

/**
 * Executes pending native SQL migrations deterministically and atomically.
 */
export async function runMigrations(
  db: DatabaseService,
  migrationsDir: string = path.join(__dirname, 'migrations'),
): Promise<MigrationResult> {
  // 1. Ensure tracking table exists
  await ensureMigrationTable(db);

  // 2. Discover and sort migration SQL files deterministically
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));

  const applied: string[] = [];
  const skipped: string[] = [];

  // 3. Process each migration file
  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);

    await db.withTransaction(async (client) => {
      // Concurrency guard: Acquire transaction-level advisory lock to serialize concurrent startup migrations
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('travel_web_schema_migrations'))`);

      // Check if migration has already been applied
      const existing = await client.query(
        `SELECT id FROM schema_migrations WHERE migration_name = $1`,
        [file],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        skipped.push(file);
        return;
      }

      // Read migration SQL file
      const sqlContent = await fs.readFile(filePath, 'utf-8');

      // Execute migration SQL
      try {
        await client.query(sqlContent);
      } catch (sqlErr: unknown) {
        const errorMsg = sqlErr instanceof Error ? sqlErr.message : String(sqlErr);
        throw new Error(`Migration '${file}' failed execution: ${errorMsg}`);
      }

      // Record applied migration atomically within the same transaction
      await client.query(`INSERT INTO schema_migrations (migration_name) VALUES ($1)`, [file]);

      applied.push(file);
    });
  }

  return {
    applied,
    skipped,
    total: sqlFiles.length,
  };
}

/**
 * CLI runner when executed directly via Node / tsx
 */
async function main(): Promise<void> {
  const config = loadEnv();
  const db = new DatabaseService(config);

  try {
    console.info('🔄 Checking database connection and running pending migrations...');
    const health = await db.checkHealth();
    if (health.status !== 'healthy') {
      throw new Error(`Database connection unhealthy: ${health.error}`);
    }

    const result = await runMigrations(db);
    console.info(
      `✅ Database migration completed. Applied: ${result.applied.length}, Skipped: ${result.skipped.length}, Total: ${result.total}`,
    );
    if (result.applied.length > 0) {
      console.info(`📦 Applied migrations: ${result.applied.join(', ')}`);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Execute if run directly from CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('migrator.ts') || process.argv[1].endsWith('migrator.js'))
) {
  void main();
}
