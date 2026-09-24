# Phase 2 — Authentication & Identity Architecture

## 1. Architectural Overview

The Phase 2 Identity & Access Management system implements a defense-in-depth, asymmetric token architecture designed to prevent token exfiltration, token forgery, replay attacks, and timing side-channels.

### 1.1 Dual-Token Isolation Topology

```
+─────────────────────────────────────────────────────────────────────────────+
│                               BROWSER CLIENT                                │
│                                                                             │
│  +─────────────────────────+                 +───────────────────────────+  │
│  │   JavaScript Context    │                 │   Browser Cookie Jar      │  │
│  │  (Volatile Memory Only) │                 │  (Protected from JS / XSS)│  │
│  │                         │                 │                           │  │
│  │  • AuthStore            │                 │  • HttpOnly Cookie        │  │
│  │  • Access Token (RS256) │                 │  • SameSite=Strict        │  │
│  │  • ApiClient Request    │                 │  • Path=/api/v1/auth      │  │
│  +────────────┬────────────+                 +─────────────┬─────────────+  │
+───────────────┼────────────────────────────────────────────┼────────────────+
                │ Authorization: Bearer <JWT>                │ Cookie: refreshToken=<opaque>
                │ (All Protected API Routes)                 │ (/auth/refresh, /auth/logout)
                ▼                                            ▼
+─────────────────────────────────────────────────────────────────────────────+
│                           FASTIFY REST API SERVER                           │
│                                                                             │
│  +───────────────────────────+             +─────────────────────────────+  │
│  │   AuthPlugin Decorators   │             │       Auth Controller       │  │
│  │  • fastify.authenticate   │             │  • Cookie Parser / Setter   │  │
│  │  • fastify.authorize(role)│             │  • Rate Limit Policies      │  │
│  +─────────────┬─────────────+             +──────────────┬──────────────+  │
│                │                                          │                 │
│                ▼                                          ▼                 │
│  +───────────────────────────────────────────────────────────────────────+  │
│  │                      AuthService (Domain Logic)                       │  │
│  │  • Argon2id Password Hashing & Verification                           │  │
│  │  • RS256 Asymmetric JWT Signing & Verification                       │  │
│  │  • 256-bit Cryptographic Refresh Token Pair Generation                │  │
│  │  • Atomic Token Rotation & Replay Attack Defense                      │  │
│  +───────────────────────────────────┬───────────────────────────────────+  │
+──────────────────────────────────────┼──────────────────────────────────────+
                                       │
                                       │ Parameterized SQL Queries / Transactions
                                       ▼
+─────────────────────────────────────────────────────────────────────────────+
│                             POSTGRESQL DATABASE                             │
│                                                                             │
│  +───────────────────────────+             +─────────────────────────────+  │
│  │        users Table        │             │    refresh_tokens Table     │  │
│  │  • id (UUID PK)           │             │  • id (UUID PK)             │  │
│  │  • email (UNIQUE)         │◄────────────┤  • user_id (FK -> users.id) │  │
│  │  • password_hash (Argon2) │             │  • token_hash (SHA-256)     │  │
│  │  • role, is_active        │             │  • expires_at, revoked_at   │  │
│  +───────────────────────────+             +─────────────────────────────+  │
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Core Architectural Components

### 2.1 Backend Routing & Controller Tier

#### `authRoutes`

- **Location:** [`backend/src/modules/auth/routes/auth.routes.ts`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/routes/auth.routes.ts)
- **Purpose:** Registers public and protected authentication endpoints on the Fastify instance.
- **Responsibilities:**
  - Maps route paths (`/register`, `/login`, `/refresh`, `/logout`, `/me`) to `AuthController` handlers.
  - Configures route-specific rate limits to protect endpoints against brute force and credential stuffing.
  - Attaches the `fastify.authenticate` preHandler hook to protected endpoints (`GET /me`).

#### `AuthController`

- **Location:** [`backend/src/modules/auth/controllers/auth.controller.ts`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/controllers/auth.controller.ts)
- **Purpose:** Manages HTTP request/response lifecycles, cookie transport, and canonical response envelopes.
- **Responsibilities:**
  - Extracts input bodies and cookies from incoming requests.
  - Invokes domain methods on `AuthService`.
  - Serializes and sets secure `HttpOnly` refresh token cookies (`SameSite=Strict`, `Path=/api/v1/auth`, `maxAge: 7d`).
  - Emits canonical success envelopes with `data` payload and `meta` (ISO timestamp and correlation request ID).

---

### 2.2 Domain Service Tier

#### `AuthService`

- **Location:** [`backend/src/modules/auth/services/auth.service.ts`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/services/auth.service.ts)
- **Purpose:** Encapsulates business logic, cryptographic workflows, and transaction boundaries for authentication.
- **Responsibilities:**
  - Validates and normalizes registration and login payloads with Zod schemas.
  - Hashes passwords with Argon2id and verifies credentials with constant-time dummy verification.
  - Generates RS256 signed access tokens with user ID, email, and role claims.
  - Generates 256-bit cryptographically secure opaque refresh tokens and stores only their SHA-256 digests.
  - Orchestrates atomic single-use refresh token rotation and replay invalidation in database transactions.
  - Transforms internal persistence entities into safe public `UserDto` objects, stripping security-sensitive properties.

---

### 2.3 Persistence Tier & Repositories

#### `UserRepository`

- **Location:** [`backend/src/modules/auth/repositories/user.repository.ts`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/repositories/user.repository.ts)
- **Purpose:** Data access gateway for the `users` PostgreSQL table.
- **Responsibilities:**
  - Creates user records within optional database transaction clients.
  - Finds users by normalized email address or primary UUID key.
  - Updates `last_login_at` timestamps upon successful authentication.
  - Maps raw database snake_case columns to strongly-typed camelCase `UserEntity` models.

#### `RefreshTokenRepository`

- **Location:** [`backend/src/modules/auth/repositories/refreshToken.repository.ts`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/repositories/refreshToken.repository.ts)
- **Purpose:** Data access gateway for the `refresh_tokens` PostgreSQL table.
- **Responsibilities:**
  - Stores SHA-256 hashed refresh tokens with explicit expiration dates.
  - Queries active, unexpired, and unrevoked tokens (`revoked_at IS NULL AND expires_at > NOW()`).
  - Revokes tokens by setting `revoked_at = NOW()`.
  - Revokes all active tokens for a specific user ID upon security events.

#### Database Service & Migrator

- **Location:** [`backend/src/infrastructure/database/index.ts`](file:///d:/Desktop/Travel-Web-/backend/src/infrastructure/database/index.ts), [`backend/src/infrastructure/database/migrator.ts`](file:///d:/Desktop/Travel-Web-/backend/src/infrastructure/database/migrator.ts)
- **Purpose:** PostgreSQL connection pooling and native migration runner.
- **Responsibilities:**
  - Manages `pg.Pool` connection pool with automatic health probing and parameter verification.
  - Executes atomic native SQL migrations tracked in `schema_migrations`.
  - Provides `withTransaction` helper ensuring automatic `COMMIT` or `ROLLBACK`.

---

### 2.4 Cryptographic & Security Infrastructure

#### `JwtSecurity`

- **Location:** [`shared/src/security/jwt.ts`](file:///d:/Desktop/Travel-Web-/shared/src/security/jwt.ts)
- **Purpose:** Cryptographic signing and validation of JSON Web Tokens.
- **Responsibilities:**
  - Signs payload using asymmetric RSA private key (RS256 algorithm).
  - Enforces RS256 algorithm verification using RSA public key.
  - Explicitly inspects token header before verification to reject algorithm confusion (e.g. HS256, `none`).
  - Validates standard claims: issuer, audience, subject/userId, and expiration.

#### `PasswordSecurity`

- **Location:** [`shared/src/security/argon2.ts`](file:///d:/Desktop/Travel-Web-/shared/src/security/argon2.ts)
- **Purpose:** Cryptographic password hashing and verification using Argon2id.
- **Responsibilities:**
  - Hashes passwords using OWASP-compliant Argon2id parameters (`memoryCost: 65536 KiB`, `timeCost: 3`, `parallelism: 4`).
  - Verifies plaintext passwords against stored hashes in constant time.

#### `authPlugin` (Fastify Decorator & RBAC)

- **Location:** [`backend/src/plugins/auth.ts`](file:///d:/Desktop/Travel-Web-/backend/src/plugins/auth.ts)
- **Purpose:** Fastify preHandler decorators for route authentication and authorization.
- **Responsibilities:**
  - `fastify.authenticate`: Extracts `Authorization: Bearer <token>`, verifies RS256 signature, validates claim structure, checks live database account status (`isActive`), and populates `request.user`.
  - `fastify.authorize(allowedRoles)`: Verifies that authenticated `request.user.role` belongs to the allowed set, emitting 403 Forbidden otherwise.

---

### 2.5 Frontend Authentication Tier

#### `AuthStore`

- **Location:** [`frontend/src/state/auth.js`](file:///d:/Desktop/Travel-Web-/frontend/src/state/auth.js)
- **Purpose:** Reactive in-memory state store for user authentication.
- **Responsibilities:**
  - Holds active `user`, `accessToken`, and `status` (`unauthenticated`, `restoring`, `authenticated`) exclusively in JavaScript memory.
  - Notifies subscribed UI components of state transitions.
  - Provides zero-storage guarantees (no `localStorage`, `sessionStorage`, `IndexedDB`, or client-side cookie access).

#### `ApiClient`

- **Location:** [`frontend/src/api/client.js`](file:///d:/Desktop/Travel-Web-/frontend/src/api/client.js)
- **Purpose:** HTTP transport layer with automatic Bearer token injection and transparent 401 recovery.
- **Responsibilities:**
  - Injects `Authorization: Bearer <accessToken>` into outgoing requests.
  - Intercepts 401 responses, executes a single-flight token refresh (`POST /api/v1/auth/refresh`), and retries the original request once.
  - Implements `restoreSession()` on page load to restore in-memory authentication from the browser's HttpOnly cookie.
  - Provides programmatic helper methods (`register`, `login`, `logout`, `getCurrentUser`).

#### `AuthModal` & Navigation

- **Location:** [`frontend/src/components/authModal.js`](file:///d:/Desktop/Travel-Web-/frontend/src/components/authModal.js), [`frontend/src/components/navbar.js`](file:///d:/Desktop/Travel-Web-/frontend/src/components/navbar.js)
- **Purpose:** User interface for authentication actions.
- **Responsibilities:**
  - Renders accessible modal dialogs for customer login and registration.
  - Performs client-side form validation and maps server validation errors to input fields.
  - Synchronizes navigation header state with `AuthStore` subscriptions.
