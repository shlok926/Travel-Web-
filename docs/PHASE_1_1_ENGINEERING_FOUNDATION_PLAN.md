# Phase 1.1 — Engineering Foundation Implementation Plan

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Implementation Plan  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) & [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)

---

## 1. Document Control

| Property            | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| **Document ID**     | `DOC-ENG-1.1`                                                      |
| **Document Title**  | Phase 1.1 Engineering Foundation Implementation Plan               |
| **Current Version** | `1.0.0` (Production Implementation Plan)                           |
| **Author Roles**    | Senior Staff Software Engineer, Solution Architect, DevSecOps Lead |
| **Target Audience** | Engineering Team, System Implementers, QA Engineers                |

---

## 2. Engineering Architecture Foundations

### A. Repository & Workspace Architecture

- **Design:** Modular monorepo workspace managed via `npm workspaces` or unified root TypeScript project.
- **Directory Structure:**
  - `backend/` — Fastify REST API application server.
  - `worker/` — Asynchronous BullMQ background worker.
  - `shared/` — Common TypeScript types, domain error codes, monetary utilities, and schemas.
  - `frontend/` — Vanilla HTML5 / CSS3 / ES6 modular client (preserving landing page prototype).
  - `infrastructure/` — Database migrations, seed helpers, and Docker configs.
  - `tests/` — Unified test suite (unit, integration, failure, smoke).
  - `.github/workflows/` — Automated CI validation pipeline.

### B. Backend Foundation (Fastify + TypeScript)

- **Design:** Application Factory pattern (`createApp()`) decoupled from network listener (`server.ts`) for deterministic testing with `fastify.inject()`.
- **Middlewares & Plugins:**
  - `@fastify/helmet` — Security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options).
  - `@fastify/cors` — Strict origin validation based on `CORS_ORIGIN`.
  - `@fastify/rate-limit` — Rate limiting with Redis/in-memory store.
  - `@fastify/cookie` — Secure cookie management (`HttpOnly`, `SameSite=Strict`, `Secure`).
  - Request Correlation ID — Propagation of `x-request-id` across request lifecycle and logs.
  - Centralized Error Handler — Standardized RFC 7807 error responses.
  - Health Endpoints — `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (readiness with DB/Redis probes).

### C. Worker Foundation (BullMQ + Redis)

- **Design:** Dedicated worker process with queue management (`worker/src/index.ts`).
- **Resiliency:** Automated retries with exponential backoff; dead-letter queue (DLQ) logging; graceful shutdown on `SIGTERM` / `SIGINT`.
- **Phase 1 Scope:** Infrastructure smoke test queue (`smoke-test-queue`) to verify queue/worker health without prematurely creating business jobs.

### D. Database Foundation (PostgreSQL 15+)

- **Design:** Connection pooling using `pg` (`Pool`), connection lifecycle management, health check query (`SELECT 1`), and transactional helper (`withTransaction()`).
- **Migration Boundary:** Migration tracking structure (`infrastructure/database/migrations/`) ready for Phase 2+ schema DDL scripts. Zero business tables created in Phase 1.

### E. Redis Foundation

- **Design:** Singleton `ioredis` client with automatic reconnection, error handling events, and decoupled health check.
- **Failure Tolerance:** Failure to connect to Redis logs an error and causes `/api/v1/ready` to report degraded status, but does not crash the HTTP server process.

### F. Object Storage Abstraction

- **Design:** Abstract `StorageService` interface (`upload()`, `getDownloadUrl()`, `delete()`) with pluggable implementations:
  - `LocalStorageService` — Saves files to local filesystem for offline development.
  - `S3StorageService` — S3-compatible client for AWS S3, Cloudflare R2, or MinIO.

---

## 3. Concrete Security & Data Resolutions

| Decision Domain             | Concrete Resolution     | Technical Justification & Implementation Standard                                                                                                                                               |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Password Hashing**        | **Argon2id**            | Enforce Argon2id via `argon2` npm library. Zero bcrypt. Minimum memory cost: 64MB, time cost: 3 iterations, parallelism: 4 (`NFR-SEC-002`).                                                     |
| **JWT Signing Algorithm**   | **RS256 (Asymmetric)**  | Standardize on **RS256** (RSA Signature with SHA-256) utilizing private/public key pairs. HS256 supported as configurable fallback for local development (`ADR-005`).                           |
| **Monetary Representation** | **Integer Minor Units** | All monetary values are represented as **Integer Minor Units** (e.g. `4500000` paise = ₹45,000.00 INR, `25000` cents = $250.00 USD). Float arithmetic is strictly prohibited in business logic. |

---

## 4. Configuration & Environment Validation

- **Validation Library:** `zod` for strict runtime schema parsing and type inference at application startup.
- **Failsafe Startup:** If any required environment variable is missing or malformed, the process immediately logs a structured error and exits with code 1.

---

## 5. Testing & Quality Assurance Plan

- **Testing Harness:** `vitest` with native TypeScript and fast execution.
- **Test Suites:**
  - `tests/unit/` — Config validation, monetary math, error formatting, storage adapter, security hashing.
  - `tests/integration/` — Fastify API lifecycle, health probe, readiness probe, error handler, CORS headers, rate limiting.
  - `tests/resilience/` — Database outage simulation, Redis disconnection, malformed payload recovery.
  - `tests/worker/` — BullMQ queue job enqueuing and processing smoke test.

---

_End of Document DOC-ENG-1.1 (Phase 1.1 Engineering Foundation Implementation Plan)._
