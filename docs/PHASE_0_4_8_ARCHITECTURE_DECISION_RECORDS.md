# Phase 0.4.8 — Architecture Decision Records (ADRs)

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Records (Gate-Reviewed)  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md)
- [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)
- [docs/PHASE_0_4_4_TECHNOLOGY_DECISIONS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_4_TECHNOLOGY_DECISIONS.md)

---

## 1. Document Control

| Property            | Value                                             |
| ------------------- | ------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.8`                                  |
| **Document Title**  | Architecture Decision Records (ADRs)              |
| **Current Version** | `1.1.0` (Architectural Gate-Reviewed)             |
| **Author Roles**    | Architecture Review Board, Lead Systems Architect |
| **Target Audience** | All Engineering & Architecture Stakeholders       |

---

## 2. Architecture Decision Register Index

| ADR ID        | Decision Title                                                 | Status       | Impact Area                                     |
| ------------- | -------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| **`ADR-001`** | Adoption of Modular Monolith Architecture Style                | **APPROVED** | System Topology & Scalability                   |
| **`ADR-002`** | Selection of Vanilla Web Standards for Frontend SPA            | **APPROVED** | Client Performance, Modularity & Velocity       |
| **`ADR-003`** | Selection of Node.js (TypeScript) with Fastify for Backend API | **APPROVED** | Server Runtime, Schema Validation & Latency     |
| **`ADR-004`** | Selection of PostgreSQL 15+ for Persistence Engine             | **APPROVED** | Data Integrity & ACID Transactions              |
| **`ADR-005`** | Adoption of Self-Hosted JWT & Argon2id Authentication          | **APPROVED** | Identity Security & Guest Checkout              |
| **`ADR-006`** | Selection of RESTful JSON API with Path Versioning             | **APPROVED** | Client-Server Communication                     |
| **`ADR-007`** | Adoption of Provider-Agnostic Payment Adapter Pattern          | **APPROVED** | Payment Resilience & Multi-Currency Abstraction |
| **`ADR-008`** | Selection of S3-Compatible Object Storage with Signed URLs     | **APPROVED** | Document Security & Storage                     |
| **`ADR-009`** | Containerized Deployment Model with Managed Services           | **APPROVED** | DevOps, Cloud Hosting & SLA                     |
| **`ADR-010`** | Adoption of Resilient Asynchronous Worker & Task Queue         | **APPROVED** | Concurrency, Background Jobs & Fault Isolation  |

---

## 3. Detailed Architecture Decision Records

### ADR-001: Adoption of Modular Monolith Architecture Style

- **Context:** The platform requires high cohesion between inventory, bookings, and payments, with strict ACID guarantees for up to 100 concurrent checkouts (`NFR-SCALE-001`). Microservices introduce excessive operational complexity for MVP-1.
- **Decision:** Adopt a **Modular Monolith** architecture with strictly separated internal domain modules, clean dependency injection, and an asynchronous background worker.
- **Alternatives Considered:** Microservices Architecture (Rejected: excessive network overhead and distributed transaction failure modes); Serverless Functions (Rejected: cold starts and complex concurrency locks).
- **Consequences:** Simplified deployment, zero distributed network latency, single database ACID transactions. Modules can be decoupled into microservices in Phase 3 if traffic warrants.
- **Traceability:** `NFR-SCALE-001`, `NFR-REL-001`, `NFR-MAINT-001`.

---

### ADR-002: Selection of Vanilla Web Standards for Frontend SPA

- **Context:** The existing repository contains clean, functional HTML/CSS assets (`frontend/index.html`, `frontend/styles.css`). The storefront requires instant load times (`< 2.0s` TTFB, `NFR-PERF-001`), and the interactive flows (Auth, Booking Configurator Wizard, Customer Dashboard, Admin Console) need clean modularity without framework bloat.
- **Decision:** Build the Single Page Application using **HTML5, Modern CSS3, and Modular ES6 JavaScript** organized into clean component controllers, API services, and page modules.
- **Alternatives Considered:** React / Next.js (Rejected: 200KB+ framework payload, hydration delay, and unnecessary build overhead for MVP); Vue.js (Rejected: template rewrites without tangible MVP benefits).
- **Consequences:** 0 KB framework overhead, instant initial paint, direct reuse of existing prototype CSS, zero build-chain breakage, long-term maintainability via standard ES modules.
- **Traceability:** `NFR-PERF-001`, `NFR-COMPAT-001`, `FR-STOREFRONT-001..006`, `FR-CONFIG-001..003`, `FR-DASH-001..004`, `FR-ADMIN-001..004`.

---

### ADR-003: Selection of Node.js (TypeScript) with Fastify for Backend API

- **Context:** The backend requires high-throughput asynchronous I/O for payment webhooks, database querying, email delivery, schema validation, and headless browser PDF rendering. The team requires a single definitive framework for Phase 1.
- **Decision:** Standardize on **Node.js (TypeScript) with Fastify** as the single canonical backend framework.
- **Alternatives Considered:** Express (Rejected: lacks native high-performance JSON schema validation and modern plugin encapsulation); Python / FastAPI (Secondary option, but less unified for Puppeteer PDF rendering); Go (Rejected: higher initial boilerplate for rapid MVP modeling).
- **Consequences:** Native AJV JSON schema request validation (`NFR-SEC-003`), ultra-high asynchronous throughput (~45k req/sec), modular plugin architecture matching domain boundaries, first-class TypeScript support.
- **Traceability:** `NFR-PERF-002`, `NFR-SEC-003`, `NFR-MAINT-001`, `FR-BOOK-001..005`.

---

### ADR-004: Selection of PostgreSQL 15+ for Persistence Engine

- **Context:** Seat allocation requires strict serialization (`SELECT ... FOR UPDATE`), immutable booking snapshots require JSONB columns (`FR-BOOK-003`), and financial logs require relational constraints.
- **Decision:** Select **PostgreSQL 15+** as the canonical relational persistence engine.
- **Alternatives Considered:** MySQL 8.0 (Rejected: weaker JSONB indexing and constraint tooling); MongoDB (Rejected: lacks pessimistic locking guarantees needed for anti-overbooking).
- **Consequences:** Flawless ACID transactions, native pessimistic row-level locking for seat quotas, rich indexing on JSONB package snapshots.
- **Traceability:** `NFR-REL-001..003`, `FR-INVENT-001..005`, `FR-BOOK-003`.

---

### ADR-005: Adoption of Self-Hosted JWT & Argon2id Authentication

- **Context:** The platform requires seamless conversion from guest checkout to registered customer (`DEC-009`), zero external auth latency, and robust password protection (`NFR-SEC-002`).
- **Decision:** Implement a **Self-Hosted Dual-Token JWT (Access + HttpOnly Refresh Cookie)** authentication system with **Argon2id** password hashing.
- **Alternatives Considered:** Auth0 / Clerk (Rejected: high per-user monthly cost and complex guest-checkout sync); Firebase Auth (Rejected: vendor lock-in).
- **Consequences:** Complete data sovereignty, zero external dependency, instant user provisioning during guest checkout, sub-millisecond local auth verification.
- **Traceability:** `NFR-SEC-002`, `NFR-SEC-006`, `DEC-009`, `FR-AUTH-001..008`.

---

### ADR-006: Selection of RESTful JSON API with Path Versioning

- **Context:** Client and administrative interfaces require predictable, stateless, resource-oriented communication with standard error envelopes.
- **Decision:** Standardize on **RESTful JSON APIs** versioned under `/api/v1/*` with RFC 7807 error envelopes and `Idempotency-Key` headers.
- **Alternatives Considered:** GraphQL (Rejected: unnecessary client query complexity and caching overhead for MVP-1); gRPC (Rejected: browser web-client incompatibility).
- **Consequences:** High cacheability, clear documentation, simple debugging, standard HTTP status codes.
- **Traceability:** `NFR-MAINT-001`, `NFR-SEC-003..007`, `DOC-ARCH-0.4.5`.

---

### ADR-007: Adoption of Provider-Agnostic Payment Adapter Pattern

- **Context:** Phase 0.3 `DEC-006` establishes 100% full upfront payment semantics, but does NOT mandate any proprietary payment vendor. The architecture must support domestic (INR/UPI) and international payment methods without vendor lock-in.
- **Decision:** Architect a **Provider-Agnostic `PaymentGatewayAdapter` Interface** in the core domain, with pluggable gateway drivers (e.g. Razorpay adapter, Stripe adapter, Mock sandbox adapter) configured at deployment.
- **Alternatives Considered:** Hardcoding a single proprietary SDK in core domain logic (Rejected: violates architectural neutrality and creates severe commercial lock-in).
- **Consequences:** Core booking and refund business logic depends strictly on domain interfaces; gateway drivers can be swapped, extended, or mocked without altering core business rules.
- **Traceability:** `DEC-005`, `DEC-006`, `FR-PAY-001..003`, `BR-PAY-001`.

---

### ADR-008: Selection of S3-Compatible Object Storage with Signed URLs

- **Context:** Generated Tax Invoices (`DR-009`) and E-Ticket Vouchers (`DR-010`) contain confidential customer PII and must be securely archived and served (`BR-DOC-001`).
- **Decision:** Store PDF documents in **Private S3-Compatible Object Storage** and serve downloads exclusively via authenticated **15-minute Pre-Signed URLs**.
- **Alternatives Considered:** Storing PDFs directly in database BLOBs (Rejected: database bloat and memory pressure); Public CDN storage (Rejected: severe privacy violation).
- **Consequences:** High durability, zero web server file I/O bottleneck, airtight access control.
- **Traceability:** `BR-DOC-001`, `NFR-PRIV-001`, `FR-DOC-001..004`.

---

### ADR-009: Containerized Deployment Model with Managed Services

- **Context:** The system must achieve 99.5% uptime (`NFR-AVAIL-001`), support zero-downtime rolling updates, and maintain operational simplicity.
- **Decision:** Package the application into standard **Docker containers** deployed across managed cloud infrastructure (Container App Service + Managed PostgreSQL + Managed Redis).
- **Alternatives Considered:** Bare-metal / Unmanaged VM deployments (Rejected: manual patching and scaling friction); Kubernetes (Rejected: excessive operational overhead for MVP-1).
- **Consequences:** Predictable local-to-production parity, automated self-healing, automated backups and point-in-time recovery.
- **Traceability:** `NFR-AVAIL-001..002`, `NFR-PERF-001..003`, `DOC-ARCH-0.4.7`.

---

### ADR-010: Adoption of Resilient Asynchronous Worker & Task Queue

- **Context:** PDF rendering, transactional email delivery, and temporary 15-minute seat hold releases must execute asynchronously without degrading HTTP request latencies. The failure of a background worker must never compromise core financial or booking data integrity.
- **Decision:** Adopt **BullMQ with Redis** as the asynchronous task queue, engineered with **strict failure isolation**:
  1. _Decoupled Confirmation:_ Booking confirmation is committed in PostgreSQL immediately upon payment verification; it does NOT wait for or depend on PDF rendering.
  2. _Fallback Synchronous Generation:_ If a customer requests a voucher before the worker has generated the PDF, the API dynamically renders the document on-demand.
  3. _Database-Level Expiry Defense:_ Database queries enforce `expires_at > NOW()` directly on inventory calculations, guaranteeing zero overbooking even during worker downtime.
- **Alternatives Considered:** In-process Node.js setTimeout (Rejected: lost jobs on restart); Synchronous PDF generation in HTTP handlers (Rejected: adds 2–3s latency to checkout response).
- **Consequences:** Fast sub-500ms checkout responses, guaranteed job retries, bulletproof fault tolerance against Redis/worker outages.
- **Traceability:** `NFR-PERF-003`, `NFR-REL-001..002`, `FR-INVENT-005`, `FR-DOC-001`, `FR-NOTIFY-001..002`.

---

_End of Document DOC-ARCH-0.4.8 (Architecture Decision Records)._
