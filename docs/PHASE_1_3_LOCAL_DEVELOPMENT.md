# Phase 1.3 — Local Development & Environment Setup Guide

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Developer Guide  
**Upstream Authority:** [docs/PHASE_0_4_7_DEPLOYMENT_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_7_DEPLOYMENT_ARCHITECTURE.md) (v1.0.0 Frozen Baseline)

---

## 1. Document Control

| Property            | Value                                           |
| ------------------- | ----------------------------------------------- |
| **Document ID**     | `DOC-ENG-1.3`                                   |
| **Document Title**  | Local Development & Environment Setup Guide     |
| **Current Version** | `1.0.0` (Production Baseline)                   |
| **Author Roles**    | Senior Staff Software Engineer, DevOps Engineer |
| **Target Audience** | All Software Engineers, QA Automation Engineers |

---

## 2. Prerequisites & Toolchains

Before setting up the repository locally, ensure the following tools are installed:

| Tool                 | Minimum Version | Recommended Version          | Verification Command     |
| -------------------- | --------------- | ---------------------------- | ------------------------ |
| **Node.js**          | `v20.0.0+`      | `v22.x` or `v24.x`           | `node -v`                |
| **npm**              | `v10.0.0+`      | `v11.x`                      | `npm -v`                 |
| **Docker & Compose** | `v24.0+`        | `v27.x+` (Docker Compose v2) | `docker compose version` |
| **Git**              | `v2.40+`        | Latest                       | `git --version`          |

---

## 3. Quickstart Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/utkarshdaule11/Travel-Web-.git
cd Travel-Web-
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Copy the template configuration file:

```bash
cp .env.example .env
```

### Step 4: Start Local Infrastructure (PostgreSQL, Redis, MinIO)

```bash
docker compose up -d postgres redis minio
```

Verify that all services are healthy:

```bash
docker compose ps
```

### Step 5: Start Development Application Services

- **Start Backend API Server (Hot Reload via `tsx`):**

  ```bash
  npm run dev:backend
  ```

  The API will start listening at: `http://localhost:3000`
  - Health Probe: `http://localhost:3000/api/v1/health`
  - Readiness Probe: `http://localhost:3000/api/v1/ready`

- **Start Background Task Worker (Hot Reload):**

  ```bash
  npm run dev:worker
  ```

- **Open Frontend Landing Page:**
  Open `frontend/index.html` directly in your browser or serve via static server:
  ```bash
  npx serve frontend -l 8080
  ```

---

## 4. Development Commands & Scripts

| Command                 | Action / Scope                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | Runs backend API server in hot-reload watch mode.                    |
| `npm run dev:backend`   | Runs Fastify backend API server with tsx watch.                      |
| `npm run dev:worker`    | Runs BullMQ asynchronous worker with tsx watch.                      |
| `npm run build`         | Compiles TypeScript into production JavaScript bundles in `/dist`.   |
| `npm run clean`         | Cross-platform cleanup of `/dist` and `/coverage` directories.       |
| `npm run typecheck`     | Executes strict TypeScript type validation (`tsc --noEmit`).         |
| `npm run lint`          | Runs ESLint analysis across all TypeScript files.                    |
| `npm run lint:fix`      | Automatically fixes ESLint-repairable issues.                        |
| `npm run format`        | Formats all code, HTML, CSS, JSON, and Markdown files via Prettier.  |
| `npm run format:check`  | Verifies code formatting compliance in CI pipelines.                 |
| `npm test`              | Runs all Vitest test suites (unit, integration, resilience, worker). |
| `npm run test:watch`    | Runs Vitest in interactive watch mode for TDD.                       |
| `npm run test:coverage` | Generates detailed test coverage reports.                            |

---

## 5. Local Docker Environment Management

### Start All Services (Including Backend & Worker Containers)

```bash
docker compose up --build -d
```

### Inspect Container Logs

```bash
docker compose logs -f backend
docker compose logs -f worker
```

### Stop Local Stack

```bash
docker compose down
```

### Reset Local Development Database & Storage Volumes

```bash
docker compose down -v
```

---

_End of Document DOC-ENG-1.3 (Phase 1.3 Local Development & Environment Setup Guide)._
