# Phase 1.0 — Baseline Repository Audit & Pre-Setup Inspection

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Audit Baseline  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Frozen Baseline) & [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md) (v1.1.0 Frozen Architecture)

---

## 1. Document Control

| Property            | Value                                                           |
| ------------------- | --------------------------------------------------------------- |
| **Document ID**     | `DOC-ENG-1.0`                                                   |
| **Document Title**  | Phase 1.0 Baseline Repository Audit & Pre-Setup Inspection      |
| **Current Version** | `1.0.0` (Production Setup Baseline)                             |
| **Author Roles**    | Senior Staff Software Engineer, DevSecOps Engineer, QA Engineer |
| **Target Audience** | Engineering Team, Solution Architects, Technical Auditors       |

---

## 2. Baseline Repository Inspection

### 2.1 Git & Environment State

- **Current Git Branch:** `main` (synchronized with `origin/main`).
- **Working Tree State:** Clean tracking status; untracked legacy documentation assets and approved `docs/` specifications present.
- **Runtime Environment:**
  - Node.js Version: `v24.13.0` (LTS-compatible modern JavaScript/TypeScript runtime).
  - Package Manager: `npm v11.6.2`.
  - Operating System: Windows (Target Deployment: Linux Docker Containers).

### 2.2 Existing Repository Inventory

| File / Directory Path                               | Size / Type       | Classification                  | Action in Phase 1                                                                                                 |
| --------------------------------------------------- | ----------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `frontend/index.html`                               | 4,173 bytes       | Static Landing Page Prototype   | **Preserve & Modularize:** Refactor into modular component architecture while maintaining 100% visual styling.    |
| `frontend/styles.css`                               | 5,365 bytes       | CSS3 Styling & Glassmorphism    | **Preserve & Organize:** Structure into core design tokens, layout, and component styles.                         |
| `README.md`                                         | 1,378 bytes       | Initial Prototype README        | **Replace/Update:** Upgrade to production engineering guide with architecture, local setup, and testing commands. |
| `dotnet-install.ps1`                                | 76,676 bytes      | Residual Environment Script     | **Deprecate / Remove:** Not part of Node.js/TypeScript architecture.                                              |
| `Tours and Travel Document.docx`                    | 2.5 MB            | Legacy Academic Source Document | **Preserve as Historical Source:** Keep isolated in repository root or docs.                                      |
| `Tours and Travel Portal Synopsis.docx`             | 24 KB             | Legacy Synopsis Document        | **Preserve as Historical Source:** Keep isolated in repository root or docs.                                      |
| `docs/PHASE_0_1_*.md` through `docs/PHASE_0_4_*.md` | 15 Markdown Files | Frozen Engineering Baselines    | **Preserve (Immutable):** Canonical specification and architecture authorities.                                   |

---

## 3. Engineering Infrastructure Gap Analysis

| Infrastructure Area      | Current State in Repository | Required Production Foundation (Phase 0.4)        | Status in Phase 1 |
| ------------------------ | --------------------------- | ------------------------------------------------- | ----------------- |
| **Package Management**   | None (No `package.json`)    | Root workspace with npm/TypeScript                | **TO BE CREATED** |
| **TypeScript Config**    | None                        | Strict `tsconfig.json` across backend & worker    | **TO BE CREATED** |
| **Backend API Server**   | None                        | Node.js + TypeScript + Fastify                    | **TO BE CREATED** |
| **Async Task Worker**    | None                        | Node.js + TypeScript + BullMQ                     | **TO BE CREATED** |
| **Database Connector**   | None                        | PostgreSQL connection pool & migrations           | **TO BE CREATED** |
| **Redis Connector**      | None                        | Redis client with health & fault tolerance        | **TO BE CREATED** |
| **Object Storage**       | None                        | S3-compatible abstract interface adapter          | **TO BE CREATED** |
| **Environment Config**   | None                        | Type-safe environment validation (`.env.example`) | **TO BE CREATED** |
| **Testing Harness**      | None                        | Vitest / Jest unit & integration test suite       | **TO BE CREATED** |
| **Linting & Formatting** | None                        | ESLint + Prettier + strict TypeScript checks      | **TO BE CREATED** |
| **Containerization**     | None                        | Dockerfiles & `docker-compose.yml`                | **TO BE CREATED** |
| **CI / CD Pipeline**     | None                        | GitHub Actions CI (`.github/workflows/ci.yml`)    | **TO BE CREATED** |

---

## 4. Risks & Compatibility Considerations

1. **Visual Regression Risk:** Refactoring `frontend/index.html` must not break the responsive hero section, glassmorphism navbar, destination grid, or typography.
2. **Architecture Compliance:** Backend must strictly use Fastify (`ADR-003`), PostgreSQL (`ADR-004`), Redis/BullMQ (`ADR-010`), and Argon2id (`ADR-005`). Zero Express, MongoDB, or React.
3. **Boundary Integrity:** Phase 1 must strictly establish foundational infrastructure and mockable adapter interfaces without implementing business features (e.g. user authentication logic, booking transactions, or payment integrations).

---

## 5. File Transition Plan

- **Preserved Files:** `frontend/index.html`, `frontend/styles.css`, `docs/PHASE_0_*.md`.
- **Cleaned / Replaced Files:** `README.md`, `dotnet-install.ps1`.
- **Introduced Directories & Files:**
  - `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.prettierrc`, `eslint.config.js`.
  - `backend/` (`src/app.ts`, `src/server.ts`, `src/config/`, `src/infrastructure/`, `src/routes/`).
  - `worker/` (`src/worker.ts`, `src/config/`, `src/queues/`).
  - `shared/` (`src/types/`, `src/constants/`, `src/errors/`).
  - `tests/` (`unit/`, `integration/`, `smoke/`).
  - `docker/`, `docker-compose.yml`, `.github/workflows/ci.yml`.
  - `docs/PHASE_1_*.md` documentation suite.

---

_End of Document DOC-ENG-1.0 (Phase 1.0 Baseline Repository Audit)._
