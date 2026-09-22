import pg from 'pg';
import { EnvConfig } from '../../config/env.js';

const { Pool } = pg;

export class DatabaseService {
  private pool: pg.Pool | null = null;
  private isConnected = false;

  constructor(private readonly config: EnvConfig) {}

  public get isReady(): boolean {
    return this.isConnected;
  }

  public getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.config.DATABASE_URL,
        min: this.config.DATABASE_POOL_MIN,
        max: this.config.DATABASE_POOL_MAX,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (_err) => {
        // Pool level error handler
      });
    }

    return this.pool;
  }

  public async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const pool = this.getPool();
      await pool.query('SELECT 1');
      this.isConnected = true;
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      this.isConnected = false;
      const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  public async query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    const pool = this.getPool();
    return pool.query<R>(text, params);
  }

  public async withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
    }
  }
}
