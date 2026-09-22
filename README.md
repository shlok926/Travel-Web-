# Young Tours & Travels — Web Platform

[![CI Quality Gate](https://github.com/utkarshdaule11/Travel-Web-/actions/workflows/ci.yml/badge.svg)](https://github.com/utkarshdaule11/Travel-Web-/actions/workflows/ci.yml)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.8%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Backend-Fastify%205.x-black.svg)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2015-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Cache%20%26%20Queue-Redis%207%20%2F%20BullMQ-DC382D.svg)](https://redis.io/)

Production-ready web platform for **Young Tours & Travels (`Travel-Web`)**, enabling leisure travellers to discover, configure, book, and pay for curated tour packages, while providing administrators with departure inventory control and content management.

---

## 🏛️ System Architecture Summary

The platform is designed as a **Modular Monolith** adhering to the frozen Phase 0.4 Architecture:

* **Frontend:** Modular Vanilla Web Standards (HTML5, Modern CSS3, ES6 JavaScript) delivering instant sub-second paint with zero framework bundle bloat.
* **Backend API:** Fastify with TypeScript providing schema-validated (AJV) REST APIs, short-lived JWT authentication, and structured Pino logging.
* **Persistence Tier:** PostgreSQL 15+ enforcing strict ACID transactions, row-level pessimistic locking (`SELECT ... FOR UPDATE`) for seat quotas, and native `JSONB` for immutable package snapshots.
* **Asynchronous Worker:** BullMQ on Redis executing background PDF generation (Headless Chrome), transactional emails, and the 15-minute temporary reservation hold sweeper.
* **Security Baseline:** Argon2id password hashing, RS256 asymmetric JWT keypairs, Helmet security headers, rate limiting, and strict PCI-DSS cardholder data isolation.

---

## 🚀 Quickstart & Local Development

### 1. Prerequisites
* **Node.js:** `v20.0.0+` (Recommended: `v22.x` or `v24.x`)
* **npm:** `v10.0.0+`
* **Docker & Docker Compose**

### 2. Installation
```bash
git clone https://github.com/utkarshdaule11/Travel-Web-.git
cd Travel-Web-
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
```

### 4. Start Infrastructure with Docker Compose
```bash
docker compose up -d postgres redis minio
```

### 5. Run Application Services
```bash
# Start Backend API Server (Watch Mode):
npm run dev:backend

# Start Asynchronous Background Worker (Watch Mode):
npm run dev:worker
```

* **API Base URL:** `http://localhost:3000/api/v1`
* **Health Check:** `http://localhost:3000/api/v1/health`
* **Readiness Check:** `http://localhost:3000/api/v1/ready`
* **Frontend Landing Page:** Open `frontend/index.html` in browser.

---

## 🛠️ Developer Toolchains & Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Fastify backend in watch mode with hot reloading. |
| `npm run dev:worker` | Starts BullMQ background worker in watch mode. |
| `npm run build` | Compiles TypeScript into `/dist` production bundles. |
| `npm run typecheck` | Executes strict TypeScript compiler checks (`tsc --noEmit`). |
| `npm run lint` | Runs ESLint across all TypeScript source files. |
| `npm run format:check` | Verifies code formatting with Prettier. |
| `npm run format` | Automatically formats all codebase files. |
| `npm test` | Runs the full Vitest unit, integration, and resilience test suite. |

---

## 📁 Repository Structure

```
Travel-Web-/
├── backend/            # Fastify REST API Application Server
│   └── src/
│       ├── config/     # Zod Environment Validation
│       ├── infrastructure/ # PostgreSQL, Redis, and Storage Adapters
│       ├── plugins/    # Logging, Security (Helmet/CORS), and Error Handlers
│       ├── routes/     # Health & Domain Route Handlers (/api/v1/*)
│       ├── app.ts      # Fastify App Factory
│       └── server.ts   # Entrypoint with Graceful Shutdown
├── worker/             # Asynchronous BullMQ Background Task Worker
├── shared/             # Shared Types, Error Catalog, Money Minor Units, and Security
├── frontend/           # Vanilla HTML5 / CSS3 / ES6 Modular Client
├── docker/             # Dockerfiles for Backend and Worker
├── docs/               # Phase 0 & Phase 1 Specifications and Architecture Suite
├── tests/              # Unit, Integration, Resilience, and Worker Test Suites
├── docker-compose.yml  # Local Development Topology
└── package.json        # NPM Workspace Configuration
```

---

## 📖 Architecture & Governance Documentation

* [Phase 0.3 Requirements Specification](docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) *(v3.0.0 Frozen Baseline)*
* [Phase 0.4 System Architecture](docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md) *(C4 Models & Layering)*
* [Phase 0.4 Security Architecture](docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md) *(STRIDE Threat Mitigation)*
* [Phase 0.4 Architecture Decision Records (ADRs)](docs/PHASE_0_4_8_ARCHITECTURE_DECISION_RECORDS.md) *(ADR-001 through ADR-010)*
* [Phase 1.0 Baseline Audit](docs/PHASE_1_0_BASELINE_AUDIT.md)
* [Phase 1.1 Foundation Implementation Plan](docs/PHASE_1_1_ENGINEERING_FOUNDATION_PLAN.md)
* [Phase 1.6 Testing Foundation Report](docs/PHASE_1_6_TESTING_FOUNDATION.md)
* [Phase 1.8 Security Baseline Report](docs/PHASE_1_8_SECURITY_BASELINE.md)
* [Phase 1 Final Review & Freeze Gate](docs/PHASE_1_FINAL_REVIEW.md) *(Phase 1 FROZEN)*

---

## 📄 License

Internal Proprietary Project — Young Tours & Travels.
