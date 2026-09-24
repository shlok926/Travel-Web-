# Phase 2 — Database Schema & Persistence Architecture

This document specifies the PostgreSQL 15+ persistence tier for the Phase 2 Identity & Access Management system.

---

## 1. Schema Overview

The identity schema consists of two domain tables and one migration tracking table:

```
+────────────────────────────────────────+
│                 users                  │
+────────────────────────────────────────+
│ id (UUID, PK)                          │◄────────┐
│ email (VARCHAR(255), UNIQUE)           │         │
│ password_hash (VARCHAR(255))           │         │
│ full_name (VARCHAR(255))               │         │
│ mobile_contact (VARCHAR(30))           │         │
│ role (VARCHAR(50))                     │         │ 1:N
│ is_active (BOOLEAN)                    │         │ Cascade Delete
│ last_login_at (TIMESTAMPTZ)            │         │
│ created_at (TIMESTAMPTZ)               │         │
│ updated_at (TIMESTAMPTZ)               │         │
+────────────────────────────────────────+         │
                                                   │
+────────────────────────────────────────+         │
│             refresh_tokens             │         │
+────────────────────────────────────────+         │
│ id (UUID, PK)                          │         │
│ user_id (UUID, FK) ────────────────────┴─────────┘
│ token_hash (VARCHAR(64), UNIQUE)       │
│ expires_at (TIMESTAMPTZ)               │
│ revoked_at (TIMESTAMPTZ)               │
│ created_at (TIMESTAMPTZ)               │
+────────────────────────────────────────+
```

---

## 2. Table Specifications

### 2.1 Table: `users`

Stores customer, administrator, and agent identity profiles.

| Column           | Data Type      | Nullable | Constraints & Defaults                  | Description                                                | Security Classification |
| ---------------- | -------------- | -------- | --------------------------------------- | ---------------------------------------------------------- | ----------------------- |
| `id`             | `UUID`         | No       | `PRIMARY KEY DEFAULT gen_random_uuid()` | Immutable internal user identifier                         | Public Identifier       |
| `email`          | `VARCHAR(255)` | No       | `UNIQUE`                                | Normalized user login email                                | PII                     |
| `password_hash`  | `VARCHAR(255)` | No       | None                                    | Argon2id cryptographically salted hash                     | **Confidential**        |
| `full_name`      | `VARCHAR(255)` | No       | None                                    | User's full display name                                   | PII                     |
| `mobile_contact` | `VARCHAR(30)`  | Yes      | `DEFAULT NULL`                          | Mobile phone contact number                                | PII                     |
| `role`           | `VARCHAR(50)`  | No       | `DEFAULT 'CUSTOMER'`                    | Authorization role (`CUSTOMER`, `ADMIN`, `AGENT`, `GUEST`) | Authorization Context   |
| `is_active`      | `BOOLEAN`      | No       | `DEFAULT TRUE`                          | Real-time account active status flag                       | Authorization Context   |
| `last_login_at`  | `TIMESTAMPTZ`  | Yes      | `DEFAULT NULL`                          | Timestamp of most recent login                             | Audit Context           |
| `created_at`     | `TIMESTAMPTZ`  | No       | `DEFAULT NOW()`                         | Account creation timestamp                                 | Audit Context           |
| `updated_at`     | `TIMESTAMPTZ`  | No       | `DEFAULT NOW()`                         | Record modification timestamp                              | Audit Context           |

#### Indexes & Performance

- `users_pkey`: Primary key B-Tree index on `(id)`.
- `users_email_key`: Unique B-Tree index on `(email)` enforcing account uniqueness and fast login lookups.
- `idx_users_role`: Secondary B-Tree index on `(role)` for filtered administrative queries.

---

### 2.2 Table: `refresh_tokens`

Stores cryptographically hashed, single-use refresh token records.

| Column       | Data Type     | Nullable | Constraints & Defaults                   | Description                                     | Security Classification |
| ------------ | ------------- | -------- | ---------------------------------------- | ----------------------------------------------- | ----------------------- |
| `id`         | `UUID`        | No       | `PRIMARY KEY DEFAULT gen_random_uuid()`  | Refresh token record ID                         | Internal Identifier     |
| `user_id`    | `UUID`        | No       | `REFERENCES users(id) ON DELETE CASCADE` | Owning user ID                                  | Foreign Key             |
| `token_hash` | `VARCHAR(64)` | No       | `UNIQUE`                                 | SHA-256 hexadecimal digest of raw refresh token | **Confidential Digest** |
| `expires_at` | `TIMESTAMPTZ` | No       | None                                     | Absolute token expiration date                  | Session Context         |
| `revoked_at` | `TIMESTAMPTZ` | Yes      | `DEFAULT NULL`                           | Token revocation timestamp                      | Session Context         |
| `created_at` | `TIMESTAMPTZ` | No       | `DEFAULT NOW()`                          | Token creation timestamp                        | Audit Context           |

#### Indexes & Performance

- `refresh_tokens_pkey`: Primary key B-Tree index on `(id)`.
- `refresh_tokens_token_hash_key`: Unique B-Tree index on `(token_hash)` for $O(1)$ token lookup during rotation.
- `idx_refresh_tokens_user_id`: Secondary B-Tree index on `(user_id)` for cascade lookups and user session revocations.

---

### 2.3 Table: `schema_migrations`

Tracks applied native SQL migrations.

| Column           | Data Type      | Nullable | Constraints & Defaults | Description                           |
| ---------------- | -------------- | -------- | ---------------------- | ------------------------------------- |
| `id`             | `SERIAL`       | No       | `PRIMARY KEY`          | Incremental migration execution order |
| `migration_name` | `VARCHAR(255)` | No       | `UNIQUE`               | Migration SQL filename                |
| `applied_at`     | `TIMESTAMPTZ`  | No       | `DEFAULT NOW()`        | Timestamp when migration executed     |

---

## 3. Migration Runner Strategy

- **Tooling:** Native TypeScript migration runner (`backend/src/infrastructure/database/migrator.ts`).
- **Execution Model:**
  1. Bootstraps `schema_migrations` table if not present.
  2. Reads `.sql` files from `backend/src/infrastructure/database/migrations/` in alphabetical order.
  3. Skips already-applied migrations based on `schema_migrations.migration_name`.
  4. Wraps each migration in an atomic database transaction (`BEGIN ... COMMIT / ROLLBACK`).
  5. Records the migration in `schema_migrations` upon success.

### Applied Migration Files

- `001_create_identity_schema.sql`: Creates `pgcrypto` extension, `users` table, `refresh_tokens` table, foreign keys, and indexes.

---

## 4. Concurrency & Transaction Guarantees

- **Atomic Registration:** Creation of `users` row and initial `refresh_tokens` hash executed inside a single transaction. A failure in either causes a complete rollback.
- **Atomic Refresh Rotation:** Verifying the old token, marking it `revoked_at = NOW()`, inserting the replacement token hash, and loading the user occur inside `withTransaction`.
- **Unique Key Guarding:** Race conditions attempting to register duplicate emails or reuse token hashes are caught by PostgreSQL unique indexes (`23505`) and mapped to standard HTTP error codes (`409 Conflict` / `401 Unauthorized`).
