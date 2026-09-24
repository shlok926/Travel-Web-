import type pg from 'pg';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { UserRole } from '../../../../../shared/src/index.js';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  mobileContact: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  mobile_contact: string | null;
  role: string;
  is_active: boolean;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  mobileContact?: string | null;
  role?: UserRole;
  isActive?: boolean;
}

function mapUserRowToEntity(row: UserRow): UserEntity {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    mobileContact: row.mobile_contact,
    role: row.role as UserRole,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class UserRepository {
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
   * Find a user by their unique email address.
   * Accepts normalized email and returns full UserEntity including passwordHash for service-layer verification.
   */
  async findByEmail(email: string, client?: pg.PoolClient): Promise<UserEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<UserRow>(
      `SELECT
        id,
        email,
        password_hash,
        full_name,
        mobile_contact,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE email = $1;`,
      [email],
    );

    const row = result.rows[0];
    return row ? mapUserRowToEntity(row) : null;
  }

  /**
   * Find a user by their primary key UUID.
   */
  async findById(id: string, client?: pg.PoolClient): Promise<UserEntity | null> {
    const executor = this.getExecutor(client);
    const result = await executor.query<UserRow>(
      `SELECT
        id,
        email,
        password_hash,
        full_name,
        mobile_contact,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = $1;`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapUserRowToEntity(row) : null;
  }

  /**
   * Persist a new user in the PostgreSQL database.
   * Receives pre-hashed password from service layer and persists with parameterized query.
   */
  async create(data: CreateUserData, client?: pg.PoolClient): Promise<UserEntity> {
    const executor = this.getExecutor(client);
    const result = await executor.query<UserRow>(
      `INSERT INTO users (
        email,
        password_hash,
        full_name,
        mobile_contact,
        role,
        is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING
        id,
        email,
        password_hash,
        full_name,
        mobile_contact,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at;`,
      [
        data.email,
        data.passwordHash,
        data.fullName,
        data.mobileContact ?? null,
        data.role ?? 'CUSTOMER',
        data.isActive ?? true,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error('Failed to insert user record into database.');
    }

    return mapUserRowToEntity(createdRow);
  }

  /**
   * Update the user's last login timestamp.
   */
  async updateLastLogin(userId: string, client?: pg.PoolClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `UPDATE users
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id;`,
      [userId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
