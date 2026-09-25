# Phase 2 — Architecture Decision Records (ADRs)

This document records the architectural decisions adopted during the design and implementation of Phase 2 Identity & Access Management.

---

### ADR-P2-01: Asymmetric RS256 JWT for Access Authentication

- **Context:** The application requires short-lived, cryptographically verified tokens for API authorization without imposing database query overhead on every micro-operation while maintaining strict signature verification.
- **Decision:** Adopt RSA Signature with SHA-256 (RS256) asymmetric keypairs. Only the Fastify backend possesses the RSA private key; the public key is used for signature validation. Reject symmetric algorithms (HS256) and unsigned tokens (`none`).
- **Reason:** Eliminates shared secret leakage risks. Allows future distributed services to verify tokens independently without access to signing keys.
- **Consequences:** Requires managing RSA PEM keypairs in environment variables (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`).

---

### ADR-P2-02: Argon2id for Password Hashing

- **Context:** User password hashes must resist offline brute-forcing, GPU/ASIC acceleration, and side-channel timing attacks.
- **Decision:** Standardize on Argon2id with parameters `m=65536 KiB`, `t=3`, `p=4`. Implement constant-time dummy verification when looking up non-existent user accounts.
- **Reason:** Argon2id is the OWASP recommended memory-hard hashing function providing superior defense against GPU cracking compared to bcrypt or PBKDF2.
- **Consequences:** Moderate CPU and memory overhead during user registration and login (capped by route-level rate limiting).

---

### ADR-P2-03: Opaque 256-Bit Refresh Tokens

- **Context:** Long-lived user sessions require a token mechanism to refresh expired access tokens without re-prompting users for credentials.
- **Decision:** Use 256-bit cryptographically secure random hexadecimal strings (`crypto.randomBytes(32).toString('hex')`) rather than self-encoded JWTs.
- **Reason:** Opaque tokens cannot be parsed or decoded by clients or intermediaries, and session state is strictly controlled server-side.
- **Consequences:** Requires server-side storage and database lookups during token refresh.

---

### ADR-P2-04: SHA-256 Hash Storage for Refresh Tokens

- **Context:** If the `refresh_tokens` database table is compromised, attackers must not be able to obtain valid refresh tokens to hijack sessions.
- **Decision:** Never store raw refresh tokens in the database. Compute and store strictly the SHA-256 hexadecimal digest (`token_hash`).
- **Reason:** Parallels password hashing principles for persistent session tokens, rendering stolen database dumps useless for session hijacking.
- **Consequences:** Verification during refresh requires hashing the incoming token before querying the database index.

---

### ADR-P2-05: HttpOnly, SameSite=Strict Cookie Transport

- **Context:** Refresh tokens must be transported between browser and API without exposure to JavaScript context or third-party web origins.
- **Decision:** Set refresh tokens in an `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` cookie. Dynamically enable `Secure` in production environments.
- **Reason:** Protects tokens from XSS-based theft (`HttpOnly`), mitigates CSRF attacks (`SameSite=Strict`), and restricts transmission strictly to authentication endpoints (`Path`).
- **Consequences:** Frontend JavaScript cannot inspect the refresh token directly, necessitating dedicated backend endpoints (`/auth/refresh`, `/auth/logout`).

---

### ADR-P2-06: In-Memory Frontend Access Token Storage

- **Context:** Single-Page Applications (SPAs) often store access tokens in `localStorage` or `sessionStorage`, leaving them permanently vulnerable to XSS exfiltration.
- **Decision:** Store access tokens and user profile state exclusively in JavaScript runtime memory (`authStore`). Re-establish sessions on page reload via `POST /api/v1/auth/refresh`.
- **Reason:** Eliminates browser storage persistence vulnerabilities. Any malicious script executing in the page cannot read persistent access tokens from browser storage.
- **Consequences:** Requires a silent background refresh call on page load to restore session state.

---

### ADR-P2-07: PostgreSQL as Authoritative Session and Identity Store

- **Context:** Fastify needs a reliable, transactional persistence engine for user records, migration tracking, and refresh token states.
- **Decision:** Use PostgreSQL 15+ native connection pooling (`pg.Pool`) and native SQL migrations.
- **Reason:** Preserves ACID transaction guarantees, allows strict unique constraints on email and token hashes, and avoids premature architectural complexity.
- **Consequences:** Direct dependency on PostgreSQL connectivity for authentication and token rotation.

---

### ADR-P2-08: Database-Authoritative RBAC & Real-Time Status Validation

- **Context:** In standard JWT authentication, user role changes or account deactivations are not recognized until the JWT expires.
- **Decision:** Enforce live PostgreSQL user lookup within `fastify.authenticate` to verify `user.isActive` and attach current database roles to `request.user`.
- **Reason:** Guarantees instantaneous account deactivation and permission revocation without waiting for access token expiration (900 seconds).
- **Consequences:** Adds a fast, indexed primary key query on protected API requests.

---

### ADR-P2-09: Atomic Single-Use Refresh Token Rotation

- **Context:** Long-lived refresh tokens present replay and interception risks if intercepted during transport.
- **Decision:** Rotate refresh tokens on every refresh call: atomically mark the presented token as revoked (`revoked_at = NOW()`) and issue a new token pair inside a database transaction. Reject previously spent tokens.
- **Reason:** Limits the window of vulnerability for any token to a single use. Attempts to replay an old token immediately fail.
- **Consequences:** Frontend must implement single-flight request queuing to prevent race conditions during concurrent API requests.

---

### ADR-P2-10: Route-Level Authentication Rate Limiting

- **Context:** Public authentication routes are prime targets for brute-force password guessing, credential stuffing, and automated account creation.
- **Decision:** Apply specialized IP-based rate limits via `@fastify/rate-limit` to `/register` (10/15m), `/login` (20/15m), `/refresh` (60/15m), and `/logout` (60/15m).
- **Reason:** Provides tailored protection calibrated to the expected usage patterns of each endpoint while preventing abuse.
- **Consequences:** Legitimate users submitting rapid repeated failures will be temporarily rate-limited with `429 Too Many Requests`.
