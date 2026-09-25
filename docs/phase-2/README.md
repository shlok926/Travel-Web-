# Phase 2 — Identity & Access Management

## 1. Objective

Phase 2 establishes a production-grade, cryptographically secure Identity & Access Management (IAM) foundation for **Young Tours & Travels (`Travel-Web`)**. It enables customer registration, secure authentication, session lifecycle management with refresh-token rotation, database-authoritative role-based access control (RBAC), and an in-memory frontend authentication layer that prevents XSS-based token theft.

---

## 2. Scope

The Phase 2 implementation encompasses:

- **Customer Registration:** Validated input schema, email normalization, duplicate conflict handling, and Argon2id password hashing.
- **Customer & Admin Login:** Constant-time side-channel defense, password verification, active-user guard, and dual-token issuance.
- **Current-User Session (`/me`):** Bearer token authentication, claims decoding, and real-time active status check against PostgreSQL.
- **JWT Access Authentication:** Asymmetric RS256 signing (15-minute expiration) with algorithm enforcement and claim structure validation.
- **Refresh Tokens & Rotation:** Cryptographically random 256-bit opaque tokens, SHA-256 digest storage, and single-use atomic rotation.
- **Cookie-Based Token Transport:** `HttpOnly`, `SameSite=Strict`, scoped `Path=/api/v1/auth`, with dynamic `Secure` flag in production.
- **Role-Based Access Control (RBAC):** DB-authoritative roles (`GUEST`, `CUSTOMER`, `ADMIN`, `AGENT`) with Fastify preHandler guards.
- **Frontend Authentication State:** In-memory `AuthStore` with zero browser-storage persistence (`localStorage`/`sessionStorage`/`IndexedDB`).
- **Authentication UI:** Modal interface for registration, login, logout, field-level error mapping, and navigation state synchronization.
- **Security & Attack Matrix:** 29 automated attack scenarios covering JWT forgery, algorithm confusion, replay attacks, concurrent races, and deactivation.
- **Production Hardening:** Route-level rate limiting, canonical RFC 7807 error envelopes, and zero credential leakage.

---

## 3. Completed Implementation Steps

| Step        | Milestone                       | Implementation Scope                                                                                      | Baseline Commit                                                                                                           | Status        |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Step 1**  | Identity DB Schema & Migrations | PostgreSQL `users`, `refresh_tokens`, `schema_migrations`, native SQL migration runner, admin seed script | [`65d8fc5`](file:///d:/Desktop/Travel-Web-/backend/src/infrastructure/database/migrations/001_create_identity_schema.sql) | **COMPLETED** |
| **Step 2**  | Auth Contracts & Validation     | Zod schemas, TypeScript DTOs, UserDto projection, standard error catalog                                  | [`20ef173`](file:///d:/Desktop/Travel-Web-/shared/src/schemas/auth.schema.ts)                                             | **COMPLETED** |
| **Step 3**  | Persistence Repositories        | `UserRepository`, `RefreshTokenRepository`, transactions, parameterized SQL queries                       | [`ccde1a2`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/repositories/user.repository.ts)                      | **COMPLETED** |
| **Step 4**  | Auth Domain Service             | `AuthService` registration, login, refresh rotation, logout, timing attack defense                        | [`4f56a75`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/services/auth.service.ts)                             | **COMPLETED** |
| **Step 5**  | JWT Decorator & RBAC            | Fastify `authenticate` decorator, `authorize` role guard, RS256 enforcement                               | [`1837074`](file:///d:/Desktop/Travel-Web-/backend/src/plugins/auth.ts)                                                   | **COMPLETED** |
| **Step 6**  | Auth Routes & Cookies           | `/register`, `/login`, `/refresh`, `/logout`, `/me`, HttpOnly cookie transport                            | [`99987ec`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/routes/auth.routes.ts)                                | **COMPLETED** |
| **Step 7**  | Frontend Auth Foundation        | In-memory `AuthStore`, `ApiClient` with single-flight refresh lock and 401 retry                          | [`c6e814f`](file:///d:/Desktop/Travel-Web-/frontend/src/state/auth.js)                                                    | **COMPLETED** |
| **Step 8**  | Frontend Auth UI                | `AuthModal`, navbar integration, login/registration forms, reactive state updates                         | [`8d5831d`](file:///d:/Desktop/Travel-Web-/frontend/src/components/authModal.js)                                          | **COMPLETED** |
| **Step 9**  | Integration & Attack Matrix     | 29-scenario security attack matrix, race conditions, replay protection, JWT forgery tests                 | [`c12c95b`](file:///d:/Desktop/Travel-Web-/tests/integration/auth.attack-matrix.test.ts)                                  | **COMPLETED** |
| **Step 10** | Hardening & Rate Limiting       | Route-level rate limits (register: 10/15m, login: 20/15m, refresh/logout: 60/15m)                         | [`c860c15`](file:///d:/Desktop/Travel-Web-/backend/src/modules/auth/routes/auth.routes.ts)                                | **COMPLETED** |
| **Step 11** | Documentation & Freeze          | Technical specifications, traceability matrix, ADRs, limitations, and freeze audit                        | `<current>`                                                                                                               | **COMPLETED** |

---

## 4. Final Baseline & Verification

- **Starting Phase 2 Baseline:** `9de42c6` / `adc675f`
- **Final Implementation Commit:** `c860c15` (`chore(auth): harden authentication for production readiness`)
- **Final Phase 2 Frozen Baseline:** Final documentation commit on `feature/phase-2-authentication`

### Quality Gate Results

| Check                      | Tool / Framework    | Target / Command                                 | Result                          |
| -------------------------- | ------------------- | ------------------------------------------------ | ------------------------------- |
| **Test Suite**             | Vitest 3.2.7        | 20 test files, 226 tests                         | **226/226 PASSED (0 failures)** |
| **TypeScript Strictness**  | TypeScript 5.8      | `tsc --noEmit`                                   | **PASS (0 errors)**             |
| **Static Analysis & Lint** | ESLint 9.x          | `eslint "{backend,worker,shared,tests}/**/*.ts"` | **PASS (0 warnings/errors)**    |
| **Code Formatting**        | Prettier 3.x        | `prettier --check`                               | **PASS (All files match)**      |
| **Production Build**       | TypeScript Compiler | `tsc -b`                                         | **PASS (Clean bundle)**         |

---

## 5. System Architecture Summary

The Phase 2 authentication system operates across three tiers:

```
[Browser Client]
  │  ├── In-Memory Access Token (JavaScript State)
  │  └── HttpOnly Strict Refresh Cookie (Managed by Browser Engine)
  │
  ▼
[Fastify REST API]
  │  ├── Rate Limiters (10/20/60 req per 15 min)
  │  ├── Auth Routes & AuthController
  │  ├── AuthPlugin (fastify.authenticate & fastify.authorize)
  │  └── AuthService (Argon2id + RS256 Keypairs)
  │
  ▼
[PostgreSQL Database]
     ├── users Table (Unique Email, Argon2id Hash, Active Flag, Role)
     └── refresh_tokens Table (User ID FK, SHA-256 Token Hash, Expiry, Revocation)
```

---

## 6. Security Model Summary

- **Password Protection:** Argon2id (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`) with dummy verification defense against timing attacks.
- **Access Tokens:** Asymmetric RS256 signed JWTs with 15-minute lifespan. HS256, `none`, and symmetric confusion tokens are explicitly rejected.
- **Refresh Tokens:** 256-bit cryptographically random tokens stored strictly as SHA-256 hex digests in PostgreSQL.
- **Token Rotation:** Every token refresh revokes the presented refresh token and issues a replacement. Replay of spent tokens is rejected.
- **Cookie Security:** Refresh tokens travel exclusively in `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` cookies, with dynamic `Secure` enforcement in production.
- **Role-Based Authorization:** DB-authoritative validation ensures role changes or deactivations take effect immediately.
- **Rate Limiting:** Route-level throttling mitigates credential stuffing and brute-force registration.

---

## 7. Out of Scope for Phase 2

The following items are intentionally excluded from Phase 2 and scheduled for later development phases:

- **MFA / TOTP:** Multi-factor authentication workflows.
- **OAuth2 / Social Login:** Third-party federated identity (Google, Apple).
- **Password Reset & Account Recovery:** Email-based forgot password workflows (scheduled for Phase 5 notifications).
- **Email Verification:** Mandatory email confirmation loops.
- **Operational Pruning Workers:** Background cron jobs for pruning expired revoked refresh token rows (scheduled for Phase 4 worker maintenance).
- **Domain Modules:** Tour destinations, package catalogue, booking engine, seat inventory, and payments (Phases 3–6).

---

## 8. Phase 2 Status

**STATUS: COMPLETED AND FROZEN**

Phase 2 has fulfilled all functional, security, and verification acceptance criteria. The engineering baseline is frozen at commit `c860c15` with full traceability documented herein.
