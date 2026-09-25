# Phase 2 — Authentication & Lifecycle Flows

This document details the exact sequence of events, security validations, and transaction boundaries for all 8 authentication workflows implemented across the backend and frontend.

---

## Flow 1: Customer Registration

```
[Browser / Client]              [Fastify API / Controller]             [AuthService / Database]
        │                                  │                                      │
        │── 1. POST /api/v1/auth/register ─►                                      │
        │      { email, password, ... }    │── 2. Zod Schema Validation ─────────►│
        │                                  │      (SafeParse input schema)        │
        │                                  │                                      │
        │                                  │── 3. Duplicate Email Check ─────────►│
        │                                  │      SELECT id FROM users...         │
        │                                  │      (Throws 409 if exists)          │
        │                                  │                                      │
        │                                  │── 4. Argon2id Hash Password ────────►│
        │                                  │      (m=64MB, t=3, p=4)              │
        │                                  │                                      │
        │                                  │── 5. Database Transaction ──────────►│
        │                                  │      • INSERT INTO users             │
        │                                  │      • Gen 256-bit refresh token     │
        │                                  │      • INSERT INTO refresh_tokens    │
        │                                  │        (SHA-256 token hash only)     │
        │                                  │      • Sign RS256 Access Token       │
        │                                  │                                      │
        │◄── 6. 201 Created ───────────────│                                      │
        │      Set-Cookie: refreshToken=.. │                                      │
        │      { user: UserDto,            │                                      │
        │        accessToken: "..." }      │                                      │
```

### Steps:

1. **Client Request:** Submits `email`, `password`, `fullName`, and optional `mobileContact`.
2. **Schema Validation:** Fastify and `AuthService` validate field constraints using Zod `registerSchema`.
3. **Duplicate Check:** Queries PostgreSQL for existing email; returns `409 Conflict` if already registered.
4. **Argon2id Hashing:** Password hashed with Argon2id parameters before transaction.
5. **Atomic Transaction:** Inside `db.withTransaction`:
   - Persists user record in `users` table with role `CUSTOMER` and `is_active = TRUE`.
   - Generates a 256-bit cryptographically secure opaque refresh token.
   - Computes SHA-256 hash of refresh token and stores in `refresh_tokens` table.
   - Issues an RS256 signed JWT access token (15-minute expiration).
6. **Response & Cookie:** Controller attaches `HttpOnly`, `SameSite=Strict` cookie containing raw refresh token and returns `201 Created` with safe `UserDto` and access token.

---

## Flow 2: User Login (Customer & Admin)

```
[Browser / Client]              [Fastify API / Controller]             [AuthService / Database]
        │                                  │                                      │
        │── 1. POST /api/v1/auth/login ────►                                      │
        │      { email, password }         │── 2. Zod Schema Validation ─────────►│
        │                                  │                                      │
        │                                  │── 3. User Lookup by Email ──────────►│
        │                                  │      SELECT * FROM users...          │
        │                                  │                                      │
        │                                  │   [If User Not Found]                │
        │                                  │   • Run Dummy Argon2 Verification    │
        │                                  │   • Throws 401 Unauthorized          │
        │                                  │                                      │
        │                                  │── 4. Verify Argon2id Password ──────►│
        │                                  │      (Throws 401 if mismatch)        │
        │                                  │                                      │
        │                                  │── 5. Active-User Check ─────────────►│
        │                                  │      (Throws 403 if is_active=false) │
        │                                  │                                      │
        │                                  │── 6. Database Transaction ──────────►│
        │                                  │      • UPDATE users last_login_at    │
        │                                  │      • Store SHA-256 refresh hash    │
        │                                  │      • Sign RS256 Access Token       │
        │                                  │                                      │
        │◄── 7. 200 OK ────────────────────│                                      │
        │      Set-Cookie: refreshToken=.. │                                      │
        │      { user: UserDto,            │                                      │
        │        accessToken: "..." }      │                                      │
```

### Steps:

1. **Client Request:** Submits `email` and `password`.
2. **Schema Validation:** Zod `loginSchema` validates format.
3. **Lookup & Timing Defense:** Queries `users` by normalized email. If the user is absent, executes a dummy Argon2id verification against a constant hash to prevent timing-based user enumeration.
4. **Credential Verification:** Verifies plaintext password against stored Argon2id hash.
5. **Account Status Check:** Rejects deactivated users with `403 Forbidden` (`ACCESS_FORBIDDEN`).
6. **Session Creation:** Inside database transaction, updates `last_login_at`, generates and persists a new SHA-256 refresh token hash, and generates an RS256 access token.
7. **Response & Cookie:** Controller returns `200 OK` with `UserDto`, access token, and sets the secure `HttpOnly` refresh cookie.

---

## Flow 3: Current Authenticated User (`GET /me`)

```
[Browser / Client]              [Fastify authenticate Guard]            [Database]
        │                                  │                                │
        │── 1. GET /api/v1/auth/me ────────►                                │
        │      Authorization: Bearer <JWT> │── 2. Verify RS256 Signature ──►│
        │                                  │      (Rejects HS256/none/exp)  │
        │                                  │                                │
        │                                  │── 3. Validate Claims ─────────►│
        │                                  │      (userId, email, role)     │
        │                                  │                                │
        │                                  │── 4. Live DB User Lookup ─────►│
        │                                  │      SELECT * FROM users       │
        │                                  │      WHERE id = userId         │
        │                                  │                                │
        │                                  │── 5. Active User Verification ─►│
        │                                  │      (Throws 401 if deactivated)
        │                                  │                                │
        │                                  │── 6. Populate request.user ───►│
        │                                  │                                │
        │◄── 7. 200 OK { user: UserDto } ──│                                │
```

### Steps:

1. **Client Request:** Sends HTTP request with `Authorization: Bearer <accessToken>` header.
2. **Signature Verification:** `JwtSecurity` validates RS256 signature using RSA public key, checking expiration and token structure.
3. **Claim Structure Validation:** Validates required claims (`userId`, `email`, `role`).
4. **Live Database Status:** Queries PostgreSQL `users` table to ensure the account has not been deleted or modified.
5. **Active Status Verification:** Rejects deactivated users even if the JWT has not expired.
6. **Request Context:** Decorates Fastify `request.user` with authenticated identity.
7. **Response:** Emits `200 OK` with canonical `UserDto`.

---

## Flow 4: Refresh-Token Rotation

```
[Browser / Client]              [Fastify API / Controller]             [AuthService / Database]
        │                                  │                                      │
        │── 1. POST /api/v1/auth/refresh ──►                                      │
        │      Cookie: refreshToken=<raw>  │── 2. Extract & Validate Cookie ─────►│
        │                                  │      (Throws 401 if missing)         │
        │                                  │                                      │
        │                                  │── 3. SHA-256 Hash Token ────────────►│
        │                                  │                                      │
        │                                  │── 4. Database Transaction ──────────►│
        │                                  │      • Find active token by hash:    │
        │                                  │        (revoked_at IS NULL AND       │
        │                                  │         expires_at > NOW())          │
        │                                  │      • If absent -> REPLAY DETECTED  │
        │                                  │        (Throws 401 Unauthorized)     │
        │                                  │      • Verify user is_active         │
        │                                  │      • UPDATE: SET revoked_at = NOW()│
        │                                  │      • INSERT new refresh token hash │
        │                                  │      • Sign new RS256 access token   │
        │                                  │                                      │
        │◄── 5. 200 OK ────────────────────│                                      │
        │      Set-Cookie: refreshToken=.. │                                      │
        │      { user: UserDto,            │                                      │
        │        accessToken: "..." }      │                                      │
```

### Steps:

1. **Client Request:** Browser automatically transmits `HttpOnly` refresh cookie to `/api/v1/auth/refresh`.
2. **Cookie Extraction:** Controller extracts cookie; throws `401 Unauthorized` if missing.
3. **Hashing:** Hashes raw cookie value with SHA-256 to produce query digest.
4. **Atomic Rotation in Transaction:**
   - Queries `refresh_tokens` for an active, unrevoked, unexpired record. If not found, transaction aborts with `401 Unauthorized` (mitigating token reuse/replay).
   - Verifies active status of associated user.
   - Atomically marks presented refresh token as revoked (`revoked_at = NOW()`).
   - Generates a new 256-bit replacement token and stores its SHA-256 hash.
   - Issues a fresh RS256 access token.
5. **Response:** Emits `200 OK` with new access token and rotates the `HttpOnly` cookie.

---

## Flow 5: User Logout & Session Revocation

```
[Browser / Client]              [Fastify API / Controller]             [AuthService / Database]
        │                                  │                                      │
        │── 1. POST /api/v1/auth/logout ───►                                      │
        │      Cookie: refreshToken=<raw>  │── 2. Read Cookie (if present) ──────►│
        │                                  │                                      │
        │                                  │── 3. SHA-256 Hash & Revoke ─────────►│
        │                                  │      UPDATE refresh_tokens           │
        │                                  │      SET revoked_at = NOW()          │
        │                                  │      WHERE token_hash = hash         │
        │                                  │                                      │
        │◄── 4. 200 OK ────────────────────│                                      │
        │      Clear-Cookie: refreshToken  │                                      │
        │      { message: "Logged out..." }│                                      │
```

### Steps:

1. **Client Request:** Sends `POST /api/v1/auth/logout` with `credentials: 'include'`.
2. **Hash & Revocation:** If a refresh cookie is present, hashes the token with SHA-256 and sets `revoked_at = NOW()` in the database.
3. **Idempotency:** If cookie is absent or already revoked, succeeds silently without throwing errors.
4. **Cookie Deletion:** Clears the `refreshToken` cookie on the client with `maxAge: 0` / expiration in the past.

---

## Flow 6: Role-Based Access Control (RBAC)

```
[Incoming Request] ──► [fastify.authenticate] ──► [fastify.authorize(allowedRoles)] ──► [Route Handler]
                             │                                  │
                   (Validates RS256 Token             (Checks request.user.role
                    + Checks Active User               against allowed list)
                    in PostgreSQL)                              │
                             │                                  ├─ Role Allowed ──► 200 OK
                             ▼                                  │
                     Populates request.user                     └─ Role Denied  ──► 403 Forbidden
```

### Steps:

1. **Authentication PreHandler:** `fastify.authenticate` decodes Bearer token, queries DB, and populates `request.user = { userId, email, role }`.
2. **Authorization PreHandler:** `fastify.authorize(['ADMIN', 'AGENT'])` compares `request.user.role` with allowed roles.
3. **Decision:**
   - If role matches: execution proceeds to the route controller.
   - If role does not match: throws `403 Forbidden` (`FORBIDDEN`).

---

## Flow 7: Frontend Session Restoration on Page Load

```
[Page Load] ──► [api.restoreSession()] ──► [POST /api/v1/auth/refresh]
                                                    │
                   ┌────────────────────────────────┴───────────────────────────────┐
                   ▼                                                                ▼
             [200 OK Response]                                            [401 / Network Error]
                   │                                                                │
     AuthStore.setSession(user, token)                             AuthStore.clearSession()
                   │                                                                │
      AuthStatus: AUTHENTICATED                                        AuthStatus: UNAUTHENTICATED
                   │                                                                │
      Navbar: "Welcome, User" + Logout                                 Navbar: "Sign In" Button
```

### Steps:

1. **Page Load:** Frontend initializes `authStore` in `restoring` status and invokes `api.restoreSession()`.
2. **Background Refresh:** `ApiClient` sends background `POST /api/v1/auth/refresh` with browser credentials.
3. **State Resolution:**
   - **Success (200 OK):** Populates `AuthStore` with active user and access token. Updates navbar to show authenticated profile.
   - **Failure (401 Unauthorized):** Clears `AuthStore` to `unauthenticated` state. Navbar displays "Sign In" button.

---

## Flow 8: Frontend 401 Interception & Single-Flight Recovery

```
[API Request] ──► [401 Unauthorized Received]
                         │
                         ▼
        [Check: Is Refresh Already in Flight?]
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
       [YES]                          [NO]
  Wait for existing           Initiate Single-Flight
  refreshPromise              POST /api/v1/auth/refresh
          │                             │
          └──────────────┬──────────────┘
                         ▼
             [Did Refresh Succeed?]
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
        [YES]                          [NO]
  Update in-memory token       AuthStore.clearSession()
  Retry original request       Reject original request
  once with new Bearer token   with Auth Error
```

### Steps:

1. **401 Interception:** `ApiClient.request()` detects a 401 response on an authenticated domain endpoint.
2. **Concurrency Lock:** Checks `this.refreshPromise`. If a refresh is already in progress, chains onto the existing promise to prevent concurrent refresh storms.
3. **Token Refresh:** Issues `POST /api/v1/auth/refresh` with `credentials: 'include'`.
4. **Retry Strategy:**
   - If refresh succeeds: updates in-memory `accessToken` in `AuthStore` and retries the original request with `retry: false`.
   - If refresh fails: calls `AuthStore.clearSession()`, resetting UI state to unauthenticated.
