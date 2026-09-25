import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';

export interface RefreshTokenEntity {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

function mapTokenRowToEntity(row: RefreshTokenRow): RefreshTokenEntity {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export class RefreshTokenRepository {
  constructor(private readonly db: DatabaseService) {}

  private getExecutor(client?: pg.PoolClient): {
    query: <R extends pg.QueryResultRow = pg.QueryResultRow>(
      text: string,
      params?: unknown[],
    ) => Promise<pg.QueryResult<R>>;
  } {
    return client ?? this.db;
  }

  /**
   * Persist a new refresh token record with SHA-256 hash.
   * Fully transaction-capable for atomic refresh token rotation.
   */
  async create(data: CreateRefreshTokenData, client?: pg.PoolClient): Promise<RefreshTokenEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        expires_at
      ) VALUES (
        $1, $2, $3
      ) RETURNING
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at,
        created_at;`,
      [data.userId, data.tokenHash, data.expiresAt],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert refresh token record into database.');
    }

    return mapTokenRowToEntity(createdRow);
  }

  /**
   * Find an active, unexpired, unrevoked refresh token by its SHA-256 hash.
   */
  async findActiveByHash(
    tokenHash: string,
    client?: pg.PoolClient,
  ): Promise<RefreshTokenEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<RefreshTokenRow>(
      `SELECT
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at,
        created_at
      FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW();`,
      [tokenHash],
    );

    const row = result.rows[0];
    return row ? mapTokenRowToEntity(row) : null;
  }

  /**
   * Revoke a refresh token by setting revoked_at = NOW().
   * Preserves audit history (does not delete row).
   */
  async revoke(tokenId: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING id;`,
      [tokenId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Revoke all active refresh tokens for a user (used for logout-all / compromise recovery).
   * Preserves audit history.
   */
  async revokeAllForUser(userId: string, client?: pg.PoolClient): Promise<number> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL;`,
      [userId],
    );

    return result.rowCount ?? 0;
  }
}
