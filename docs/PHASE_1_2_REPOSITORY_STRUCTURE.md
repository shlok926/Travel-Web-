# Phase 1.2 — Repository Structure & Directory Blueprint

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Foundation Blueprint  
**Upstream Authority:** [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md) (v1.1.0 Frozen Architecture)

---

## 1. Document Control

| Property            | Value                                                |
| ------------------- | ---------------------------------------------------- |
| **Document ID**     | `DOC-ENG-1.2`                                        |
| **Document Title**  | Phase 1.2 Repository Structure & Directory Blueprint |
| **Current Version** | `1.0.0` (Production Baseline)                        |
| **Author Roles**    | Senior Staff Software Engineer, Solution Architect   |
| **Target Audience** | All Developers, DevOps Engineers, QA Engineers       |

---

## 2. Directory Taxonomy & Component Map

The repository is structured as a clean modular codebase with strict boundaries:

```
Travel-Web-/
├── .github/
│   └── workflows/
│       └── ci.yml                      # Automated CI Validation Pipeline
├── backend/
│   └── src/
│       ├── config/
│       │   └── env.ts                  # Zod Schema Environment Validation
│       ├── infrastructure/
│       │   ├── database/
│       │   │   └── index.ts            # PostgreSQL 15 Connection Pool & Health Check
│       │   ├── redis/
│       │   │   └── index.ts            # ioredis Client & Fault-Tolerant Reconnect
│       │   └── storage/
│       │       ├── storage.interface.ts # Abstract IStorageService Interface
│       │       ├── local.storage.ts    # Local Filesystem Storage Adapter
│       │       ├── s3.storage.ts       # S3 / MinIO Cloud Storage Adapter
│       │       └── index.ts            # Storage Driver Factory
│       ├── plugins/
│       │   ├── logging.ts              # Pino Logger with Request ID Correlation
│       │   ├── security.ts             # Helmet, CORS, Rate Limiting & Cookies
│       │   └── errorHandler.ts         # Centralized RFC 7807 Error Envelope Handler
│       ├── routes/
│       │   ├── health.ts               # Liveness (/health) & Readiness (/ready) Probes
│       │   └── index.ts                # Main Route Registry (/api/v1/*)
│       ├── app.ts                      # Fastify Application Factory
│       └── server.ts                   # Entrypoint with Graceful Shutdown
├── worker/
│   └── src/
│       ├── config/
│       │   └── workerEnv.ts            # Worker Environment Validation
│       ├── queues/
│       │   └── smokeQueue.ts           # BullMQ Smoke Test Queue & Processor
│       └── index.ts                    # Asynchronous Worker Bootstrap
├── shared/
│   └── src/
│       ├── errors/
│       │   ├── errorCodes.ts           # Standard Error Code Catalog
│       │   └── appError.ts             # Operational AppError Class
│       ├── types/
│       │   └── api.ts                  # API Success/Error Envelopes
│       ├── utils/
│       │   └── money.ts                # Integer Minor Units Money Arithmetic (INR/USD)
│       ├── security/
│       │   ├── argon2.ts               # Argon2id Password Hashing & Verification
│       │   └── jwt.ts                  # RS256 / HS256 Token Signing & Verification
│       └── index.ts                    # Shared Module Barrel Export
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js               # Typed API Client with Error Unwrapping
│   │   ├── components/
│   │   │   └── navbar.js               # Navbar Component Controller
│   │   ├── config.js                   # Frontend Runtime Config
│   │   └── main.js                     # Modular Client Bootstrap
│   ├── index.html                      # Semantic Landing Page (Preserved Prototype)
│   └── styles.css                      # Glassmorphism & Responsive CSS
├── docker/
│   ├── Dockerfile.backend              # Multi-Stage Backend Dockerfile
│   └── Dockerfile.worker               # Multi-Stage Worker Dockerfile
├── docs/                               # Engineering & Architecture Documentation Suite
├── tests/
│   ├── unit/
│   │   ├── config.test.ts              # Environment Validation Unit Tests
│   │   ├── money.test.ts               # Monetary Minor Units Unit Tests
│   │   ├── security.test.ts            # Argon2id & JWT Token Tests
│   │   └── storage.test.ts             # Object Storage Adapter Unit Tests
│   ├── integration/
│   │   ├── health.test.ts              # Fastify Health & Readiness Probes Test
│   │   └── errors.test.ts              # Error Handling & Security Headers Test
│   ├── resilience/
│   │   └── failure.test.ts             # Database/Redis Outage Resilience Tests
│   └── worker/
│       └── smoke.test.ts               # BullMQ Worker Smoke Test
├── .env.example                        # Comprehensive Environment Variable Template
├── .gitignore                          # Node, Docker, and Sensitive File Exclusion
├── .prettierrc                         # Code Formatter Standards
├── docker-compose.yml                  # Local Dev Stack (Postgres, Redis, MinIO, App)
├── eslint.config.js                    # TypeScript ESLint Standards
├── package.json                        # Root NPM Workspace & Scripts
├── tsconfig.json                       # Strict TypeScript Compiler Options
└── README.md                           # Developer Onboarding & Architecture Guide
```

---

_End of Document DOC-ENG-1.2 (Phase 1.2 Repository Structure & Directory Blueprint)._
