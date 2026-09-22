# Phase 0.4.4 — Technology Decisions & Evaluation Matrix

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Blueprint (Gate-Reviewed)  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md)
- [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)
- [docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md)

---

## 1. Document Control

| Property            | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.4`                                      |
| **Document Title**  | Technology Decisions & Evaluation Matrix              |
| **Current Version** | `1.1.0` (Architectural Gate-Reviewed)                 |
| **Author Roles**    | Lead System Architect, Technology Selection Committee |
| **Target Audience** | Engineering Team, Lead Developers, DevOps Engineers   |

---

## 2. Technology Selection Methodology

Technology selections in this phase are made strictly **after** defining the architectural constraints, system boundaries, and quality requirements. Every choice is evaluated using a formal evaluation structure:

$$\text{Frozen Requirements} \longrightarrow \text{Technical Need} \longrightarrow \text{Candidate Options} \longrightarrow \text{Trade-off Analysis} \longrightarrow \text{Decision \& Rationale}$$

Arbitrary technology preferences are prohibited. Decisions prioritize:

1. Direct alignment with Phase 0.3 Functional and Non-Functional Requirements.
2. Low operational overhead and high developer velocity for the MVP-1 release.
3. Strict ACID consistency for booking inventory and financial transactions.
4. Clean separation of concerns and standard cloud portability.

---

## 3. Technology Evaluation & Decision Matrices

### 3.1 Frontend Technology Stack

```
+-----------------------------------------------------------------------------------+
|                        FRONTEND TECHNOLOGY EVALUATION                             |
+-----------------------------------------------------------------------------------+
| Requirement   | Storefront speed (<2s TTFB), interactive booking configurator,    |
|               | responsive mobile layout, reuse of valid prototype styling.       |
| Candidates    | 1. Vanilla HTML5 / Modern CSS3 / Modular ES6 JavaScript           |
|               | 2. React (Next.js / Vite SPA)                                     |
|               | 3. Vue.js (Nuxt)                                                  |
+---------------+-------------------------------------------------------------------+
```

| Dimension                     | Option 1: Vanilla ES6 + Modern CSS                         | Option 2: React (Vite / Next.js)   | Option 3: Vue.js          |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------- | ------------------------- |
| **Bundle Overhead**           | **0 KB (Instant load)**                                    | 140 KB – 300 KB                    | 80 KB – 150 KB            |
| **Prototype Reuse**           | **100% direct reuse** of existing CSS & markup             | Requires full JSX refactor         | Requires template rewrite |
| **Build Complexity**          | Zero build step (or lightweight bundle)                    | Node.js bundler, JSX transpilation | Vue CLI / Vite bundler    |
| **Storefront Performance**    | Optimal (`< 1.0s` FCP)                                     | Fast, but client hydration delay   | Fast                      |
| **Dynamic Wizard & Admin UX** | Modular component controllers & Web Standards              | Virtual DOM component state        | Reactive state bindings   |
| **Decision**                  | **SELECTED: Vanilla HTML5 / Modern CSS3 / Modular ES6 JS** | Candidate for Phase 2/3            | Rejected                  |

- **Architectural Justification for Complex Flows:**
  - _Public Storefront & Catalog:_ Pure semantic HTML5 + CSS with micro-interactions delivers sub-second load times (`NFR-PERF-001`).
  - _Booking Configurator Wizard & Customer Dashboard:_ Managed through lightweight modular ES6 state controllers that bind DOM elements to validated state machines without requiring heavy virtual DOM trees.
  - _Admin Console & Package Management:_ Built using standard reusable UI component modules (data tables, modal managers, form validators) operating against `/api/v1/admin/*` REST endpoints.
  - _Maintainability:_ Clean directory modularity (`frontend/src/components/`, `frontend/src/modules/`, `frontend/src/services/api.js`) ensures long-term scalability without framework churn.

---

### 3.2 Backend Runtime & Framework

```
+-----------------------------------------------------------------------------------+
|                         BACKEND RUNTIME EVALUATION                                |
+-----------------------------------------------------------------------------------+
| Requirement   | High-throughput REST API, async I/O for webhooks and email,       |
|               | atomic DB transactions, clean layered architecture, type safety.   |
| Candidates    | 1. Node.js (TypeScript) with Express                              |
|               | 2. Node.js (TypeScript) with Fastify                              |
|               | 3. Python (FastAPI / SQLAlchemy)                                  |
|               | 4. Go (Gin / Chi)                                                 |
+---------------+-------------------------------------------------------------------+
```

| Dimension                         | Option 1: Node.js (Express)  | Option 2: Node.js (Fastify)                  | Option 3: Python (FastAPI) | Option 4: Go (Gin) |
| --------------------------------- | ---------------------------- | -------------------------------------------- | -------------------------- | ------------------ |
| **Typing & Schema Validation**    | Ad-hoc middleware (Zod)      | **Built-in JSON Schema (AJV)**               | Native Pydantic            | Static Structs     |
| **Throughput & Async Latency**    | Moderate (~15k req/sec)      | **Very High (~45k req/sec)**                 | Moderate (~20k req/sec)    | Ultra-High (~60k)  |
| **Plugin & Module Encapsulation** | Middleware chain             | **Native Scoped Plugin Architecture**        | Dependency Injection       | Clean Packages     |
| **PDF Generation Integration**    | Native Puppeteer             | **Native Puppeteer**                         | Requires subprocess / C    | Cgo bindings       |
| **Decision**                      | Rejected in favor of Fastify | **SELECTED: Node.js (TypeScript) + Fastify** | Secondary alternative      | Overkill for MVP   |

- **Definitive Decision:** **Node.js (TypeScript) with Fastify**.
- **Rationale:** Fastify is explicitly selected as the **single canonical backend framework** for Phase 1. It provides built-in JSON Schema validation (AJV) for high-performance input verification (`NFR-SEC-003`), native scoped plugin architecture matching the modular monolith domain boundaries, lower latency than Express, and first-class TypeScript integration.

---

### 3.3 Relational Database Engine

- **Decision:** **PostgreSQL 15+**.
- **Rationale:** PostgreSQL delivers superior relational integrity, rock-solid transactional row-locking (`SELECT ... FOR UPDATE`) for anti-overbooking concurrency control (`NFR-REL-001`), native JSONB storage for immutable package snapshots (`FR-BOOK-003`), and ubiquitous managed cloud availability.

---

### 3.4 Authentication & Identity Strategy

- **Decision:** **Self-Hosted Dual-Token JWT (Short-Lived Access + HttpOnly SameSite=Strict Refresh Cookie) with Argon2id Password Hashing**.
- **Rationale:** Self-hosted JWT authentication provides complete data ownership, instant user provisioning during guest checkout (`DEC-009`), zero monthly per-user licensing fees, and sub-millisecond local token validation without external network hops.

---

### 3.5 Payment Integration Architecture (Provider-Agnostic Pattern)

```
+-----------------------------------------------------------------------------------+
|                        PAYMENT ARCHITECTURE PATTERN                               |
+-----------------------------------------------------------------------------------+
| Architectural Requirement: Provider-Agnostic Abstraction Layer (`DEC-006`).      |
| Phase 0.3 Authority: DEC-006 defines Payment Semantics (100% upfront payment);    |
|                      it does NOT mandate any proprietary third-party provider.     |
| Technical Solution:  Abstract `PaymentGatewayAdapter` Interface with pluggable    |
|                      gateway drivers.                                             |
| Candidate Drivers:   1. Razorpay Adapter (Candidate for domestic INR/UPI)        |
|                      2. Stripe Adapter (Candidate for international USD/Cards)    |
|                      3. Mock Sandbox Adapter (For local/CI testing)               |
+-----------------------------------------------------------------------------------+
```

- **Architectural Mandate:** The system core depends strictly on an abstract `PaymentGatewayAdapter` interface defining `createOrder()`, `verifyWebhookSignature()`, `parseWebhookEvent()`, and `processRefund()`.
- **Provider Selection Status:** Specific third-party gateways (e.g., Razorpay, Stripe, CCAvenue) are **modular candidate plugins** configured via environment variables at deployment, preserving complete architectural vendor-independence.

---

### 3.6 PDF Document Generation Engine

- **Decision:** **Headless Chrome via Puppeteer** compiling pixel-perfect HTML/CSS templates into PDF Tax Invoices (`DR-009`) and E-Tickets (`DR-010`).
- **Decoupling Guarantee:** PDF generation is an asynchronous background task. Booking confirmation and payment settlement are committed independently in the database and NEVER block on PDF rendering.

---

### 3.7 File & Object Storage

- **Decision:** **S3-Compatible Object Storage (AWS S3 / Cloudflare R2 / MinIO)**.
- **Rationale:** Standard pre-signed URL generation for secure, time-limited document downloads (`BR-DOC-001`), highly durable cloud storage, and local container testing via MinIO.

---

### 3.8 Background Task Queue & Resilient Concurrency

- **Decision:** **BullMQ with Redis (supplemented by Database Outbox & Sweeper Resiliency)**.
- **Resiliency Guarantees:**
  1. _Decoupled Confirmation:_ Payment success commits immediately to PostgreSQL. Background job failure does NOT alter or roll back booking confirmation.
  2. _Fallback Document Generation:_ If a customer attempts to download an invoice before background rendering completes, the API generates the document on-demand synchronously.
  3. _Deterministic Hold Expiration:_ In addition to the BullMQ sweeper worker, database queries enforce `WHERE expires_at > NOW()` on all inventory calculations, guaranteeing zero overselling even if Redis is temporarily unreachable.

---

## 4. Summary of Selected Technology Stack

| Layer / Component        | Selected Technology                          | Status         | Primary Justification                                                         |
| ------------------------ | -------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| **Frontend Client**      | HTML5 / Vanilla CSS3 / Modular ES6 JS        | **Definitive** | Instant load time, 100% prototype reuse, zero framework bloat.                |
| **Backend API**          | Node.js (TypeScript) + Fastify               | **Definitive** | High async performance, built-in JSON schema validation, plugin architecture. |
| **Database**             | PostgreSQL 15+                               | **Definitive** | Strict ACID, pessimistic locking (`FOR UPDATE`), JSONB snapshots.             |
| **Authentication**       | Self-Hosted JWT + Argon2id Hashing           | **Definitive** | Seamless guest checkout, zero external cost, full data control.               |
| **Payment Integration**  | Abstract `PaymentGatewayAdapter` Interface   | **Definitive** | Complete provider independence (`DEC-006`); candidate adapters pluggable.     |
| **Document Generation**  | Puppeteer (Headless Chrome) + HTML Templates | **Definitive** | Pixel-perfect branded PDF Tax Invoices and E-Tickets.                         |
| **Object Storage**       | S3-Compatible Storage (S3 / R2 / MinIO)      | **Definitive** | Secure pre-signed download URLs, high durability.                             |
| **Task Queue & Sweeper** | BullMQ (Redis) + DB Outbox / Query Guards    | **Definitive** | Resilient background processing with fallback on-demand rendering.            |

---

_End of Document DOC-ARCH-0.4.4 (Technology Decisions & Evaluation Matrix)._
