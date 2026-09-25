# Phase 2 — Security Architecture & Threat Mitigation

This document details the security controls, cryptographic primitives, and threat defenses implemented across the Phase 2 Identity & Access Management system.

---

## 1. Cryptographic Primitives & Storage

### 1.1 Password Protection (Argon2id)

- **Algorithm:** Argon2id (OWASP recommended memory-hard hashing function).
- **Configuration Parameters:**
  - `memoryCost`: `65536 KiB` (64 MiB RAM per hash)
  - `timeCost`: `3` iterations
  - `parallelism`: `4` threads
- **Timing Attack Defense:** When a login request specifies an email that does not exist in the database, `AuthService` executes a dummy Argon2id verification against a pre-computed constant hash. This normalizes response latency across valid and invalid email addresses, preventing user enumeration via timing side-channels.

### 1.2 Access Tokens (Asymmetric RS256 JWT)

- **Algorithm:** RS256 (RSA Signature with SHA-256).
- **Key Management:** Asymmetric keypair (Private key for Fastify signing; Public key for verification).
- **Token Lifetime:** `900 seconds` (15 minutes).
- **Algorithm Confusion Protection:** `JwtSecurity` inspects the unverified JWT header before executing full verification. Tokens declaring `alg: "HS256"`, `alg: "none"`, or any non-RS256 algorithm are rejected immediately, preventing symmetric key confusion attacks.
- **Claims Enforcement:** Tokens must contain valid `userId`, `email`, and `role` claims matching the system's role enum (`GUEST`, `CUSTOMER`, `ADMIN`, `AGENT`).

### 1.3 Refresh Tokens & Replay Defense

- **Token Generation:** 256 bits of cryptographically secure entropy (`crypto.randomBytes(32).toString('hex')`).
- **Digest Storage:** Raw refresh tokens are **never** persisted in the database. Only their SHA-256 hexadecimal digests (`crypto.createHash('sha256').update(rawToken).digest('hex')`) are stored in the `refresh_tokens` table.
- **Single-Use Rotation:** Every call to `POST /api/v1/auth/refresh` immediately revokes the presented refresh token in the database (`revoked_at = NOW()`) and issues a newly generated token.
- **Replay Attack Invalidation:** If a previously revoked or spent refresh token is presented, the lookup fails, rejecting the request with `401 Unauthorized`.

---

## 2. Transport & Cookie Security

| Cookie Attribute | Configuration                      | Security Objective                                                                                                                                |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name`           | `refreshToken`                     | Standard token identifier                                                                                                                         |
| `HttpOnly`       | `true`                             | Completely blocks client-side JavaScript (`document.cookie`) access, mitigating XSS token theft.                                                  |
| `SameSite`       | `Strict`                           | Restricts cookie transmission exclusively to first-party requests originating from the site domain, mitigating Cross-Site Request Forgery (CSRF). |
| `Path`           | `/api/v1/auth`                     | Limits cookie transmission scope strictly to authentication routes (`/refresh`, `/logout`), withholding it from domain and static asset requests. |
| `Secure`         | `config.NODE_ENV === 'production'` | Requires TLS transport in production environments.                                                                                                |
| `Max-Age`        | `604800` (7 days)                  | Absolute cookie expiration matching token lifetime.                                                                                               |

---

## 3. Database-Authoritative Authorization & Active User Checks

### 3.1 Why Live Database Checks Are Enforced

In stateless JWT systems, deactivating a user account or revoking permissions does not take effect until the token expires. To eliminate this security window:

1. Fastify's `fastify.authenticate` hook extracts the `userId` claim from the validated RS256 token and performs a real-time database query (`userRepo.findById(payload.userId)`).
2. If `user.isActive` is `false`, the request is rejected immediately with `401 Unauthorized` (`AUTHENTICATION_FAILED`).
3. If the user's role in the database has changed, the database role takes precedence over stale JWT claims.

### 3.2 Role-Based Access Control (RBAC)

The `fastify.authorize(allowedRoles)` preHandler factory validates that the verified `request.user.role` belongs to the route's permitted role set. Unauthorized requests receive `403 Forbidden` (`FORBIDDEN`).

---

## 4. Route-Level Rate Limiting

To prevent brute-force attacks, credential stuffing, and resource exhaustion, endpoints enforce IP-based rate limiting via `@fastify/rate-limit`:

| Route                        | Maximum Requests | Window     | Attack Defense                             |
| ---------------------------- | ---------------- | ---------- | ------------------------------------------ |
| `POST /api/v1/auth/register` | 10               | 15 minutes | Automated mass account creation & spam     |
| `POST /api/v1/auth/login`    | 20               | 15 minutes | Credential stuffing & password brute-force |
| `POST /api/v1/auth/refresh`  | 60               | 15 minutes | Session rotation flooding                  |
| `POST /api/v1/auth/logout`   | 60               | 15 minutes | Session invalidation flooding              |
| Global API Gateway           | 100              | 1 minute   | General DoS mitigation                     |

---

## 5. Frontend Token Security & Zero-Storage Guarantees

- **In-Memory Storage Only:** Access tokens exist exclusively inside the JavaScript execution context (`authStore.accessToken`).
- **Zero Browser Persistence:** No tokens, passwords, or session identifiers are written to `localStorage`, `sessionStorage`, or `IndexedDB`.
- **XSS Mitigation:** In the event of an XSS vulnerability, an attacker cannot extract persistent tokens because refresh tokens are guarded by `HttpOnly` cookies, and in-memory access tokens expire within 15 minutes.

---

## 6. Information Leakage Prevention

- **Safe Projections (`UserDto`):** Internal database properties (`password_hash`, `token_hash`) are stripped before serialization using the `toUserDto` mapping utility.
- **Unified Error Envelopes:** Error responses use canonical RFC 7807 structures without exposing SQL query strings, stack traces, database column names, or internal hostnames.
- **User Enumeration Defense:** Login failures return generic `Invalid email or password.` messages with identical HTTP status codes (`401`) and constant-time latency.
