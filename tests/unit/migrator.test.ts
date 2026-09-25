import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  ensureMigrationTable,
  getAppliedMigrations,
  runMigrations,
} from '../../backend/src/infrastructure/database/migrator.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';

describe('Database Migration Runner (Native SQL Migrations)', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockClientQuery: ReturnType<typeof vi.fn>;
  let mockWithTransaction: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseService;
  let tempMigrationsDir: string;

  beforeEach(async () => {
    mockClientQuery = vi.fn();
    mockQuery = vi.fn();
    mockWithTransaction = vi.fn(async (callback) => {
      const mockClient = {
        query: mockClientQuery,
      };
      return callback(mockClient);
    });

    mockDb = {
      query: mockQuery,
      withTransaction: mockWithTransaction,
    } as unknown as DatabaseService;

    // Create a temporary directory with test SQL migrations
    tempMigrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-migrations-'));
    await fs.writeFile(
      path.join(tempMigrationsDir, '001_test_migration.sql'),
      'CREATE TABLE test_table (id SERIAL PRIMARY KEY);',
      'utf-8',
    );
    await fs.writeFile(
      path.join(tempMigrationsDir, '002_another_migration.sql'),
      'CREATE TABLE test_table_2 (id SERIAL PRIMARY KEY);',
      'utf-8',
    );
  });

  it('1. ensureMigrationTable should execute schema_migrations table creation DDL', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await ensureMigrationTable(mockDb);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
  });

  it('2. getAppliedMigrations should query schema_migrations in ascending order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ensureMigrationTable
      .mockResolvedValueOnce({
        rows: [{ migration_name: '001_test_migration.sql' }],
        rowCount: 1,
      });

    const migrations = await getAppliedMigrations(mockDb);

    expect(migrations).toEqual(['001_test_migration.sql']);
    expect(mockQuery.mock.calls[1]?.[0]).toContain(
      'SELECT migration_name FROM schema_migrations ORDER BY id ASC',
    );
  });

  it('3. runMigrations should execute unapplied migrations inside transaction with advisory lock', async () => {
    // 1. ensureMigrationTable call
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // Mock withTransaction for 001 and 002
    mockClientQuery
      // For 001
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT id FROM schema_migrations (not applied)
      .mockResolvedValueOnce({ rows: [] }) // SQL execute
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO schema_migrations
      // For 002
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT id FROM schema_migrations (not applied)
      .mockResolvedValueOnce({ rows: [] }) // SQL execute
      .mockResolvedValueOnce({ rows: [] }); // INSERT INTO schema_migrations

    const result = await runMigrations(mockDb, tempMigrationsDir);

    expect(result.applied).toEqual(['001_test_migration.sql', '002_another_migration.sql']);
    expect(result.skipped).toEqual([]);
    expect(result.total).toBe(2);
    expect(mockWithTransaction).toHaveBeenCalledTimes(2);
  });

  it('4. runMigrations should skip already applied migrations idempotently', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockClientQuery
      // For 001 (already applied)
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // already applied
      // For 002 (unapplied)
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // not applied
      .mockResolvedValueOnce({ rows: [] }) // SQL execute
      .mockResolvedValueOnce({ rows: [] }); // INSERT INTO schema_migrations

    const result = await runMigrations(mockDb, tempMigrationsDir);

    expect(result.applied).toEqual(['002_another_migration.sql']);
    expect(result.skipped).toEqual(['001_test_migration.sql']);
    expect(result.total).toBe(2);
  });

  it('5. runMigrations should fail and bubble error when SQL execution fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // not applied
      .mockRejectedValueOnce(new Error('syntax error at or near "INVALID"')); // SQL execute failure

    await expect(runMigrations(mockDb, tempMigrationsDir)).rejects.toThrow(
      'Migration \'001_test_migration.sql\' failed execution: syntax error at or near "INVALID"',
    );
  });
});
