# Changelog

All notable changes to the **Young Tours & Travels Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — Phase 1: Production Repository Setup & Engineering Foundation (2026-09-22)

### Added
* **Monorepo Architecture:** Clean directory structure (`backend/`, `worker/`, `shared/`, `frontend/`, `docker/`, `tests/`, `docs/`) with root npm workspace and strict TypeScript configuration.
* **Backend Foundation:** Fastify 5.x application factory with structured Pino logging, correlation IDs, centralized RFC 7807 error handling, and health/readiness endpoints (`/api/v1/health`, `/api/v1/ready`).
* **Worker Foundation:** BullMQ worker on Redis with graceful shutdown hooks (`SIGTERM`/`SIGINT`), connection retry strategies, and smoke test queues.
* **Database Infrastructure:** PostgreSQL 15 connection pool (`pg.Pool`), query runner, and transaction boundary utilities (`withTransaction()`).
* **Redis Infrastructure:** Singleton `ioredis` client with fault-tolerant reconnect handling and decoupled health diagnostics.
* **Object Storage Abstraction:** Abstract `IStorageService` interface with `LocalStorageService` and `S3StorageService` adapters.
* **Security Modules:** Argon2id password hashing (`PasswordSecurity`), RS256-only asymmetric JWT signing/verification (`JwtSecurity`), Helmet, CORS, and rate limiting.
* **Monetary Engine:** `MoneyUtil` utility operating exclusively on integer minor units (paise/cents) with zero floating-point arithmetic.
* **Modular Frontend Client:** Refactored ES6 client (`frontend/src/`) with typed `ApiClient` and component controllers, preserving 100% of the landing page prototype's visual styling.
* **Containerization:** `docker-compose.yml` orchestrating PostgreSQL 15, Redis 7, MinIO S3 storage, Backend API, and Worker containers.
* **CI/CD Automation:** GitHub Actions workflow (`.github/workflows/ci.yml`) validating Prettier formatting, ESLint, TypeScript types, Vitest test suite, and bundle builds.
* **Testing Foundation:** 19 unit, integration, resilience, and worker tests across 8 test suites with 100% pass rate.

---

## [0.4.0] — Phase 0.4: System Architecture & Technical Design (2026-09-22)
* Established C4 architecture models (L1 Context, L2 Containers, L3 Components).
* Authored 10 Architecture Decision Records (`ADR-001` through `ADR-010`).
* Defined RESTful API surface, conceptual ER schemas, STRIDE security architecture, and deployment topology.

---

## [0.3.0] — Phase 0.3: Requirements Specification (2026-09-22)
* Established canonical frozen specification (`DOC-REQ-SPEC-0.3` v3.0.0) containing 77 FRs, 28 NFRs, 10 BRs (115 total), with 100% Given/When/Then acceptance criteria coverage.

---

## [0.2.0] — Phase 0.2: Product Understanding & Definition (2026-09-22)
* Defined product vision, actor models, core business model, and canonical Decision Register (`DEC-001` through `DEC-010`).

---

## [0.1.0] — Phase 0.1: Existing System & Documentation Audit (2026-09-22)
* Completed 28-section forensic baseline audit of legacy documentation and initial HTML/CSS prototype.
