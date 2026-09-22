# Phase 0.4.7 — Deployment, Environment & Observability Architecture

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Blueprint  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md)
- [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)
- [docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md)

---

## 1. Document Control

| Property            | Value                                                |
| ------------------- | ---------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.7`                                     |
| **Document Title**  | Deployment, Environment & Observability Architecture |
| **Current Version** | `1.0.0` (Technical Architecture Baseline)            |
| **Author Roles**    | Lead DevOps Architect, Site Reliability Engineer     |
| **Target Audience** | Platform Engineers, DevOps, Backend Developers       |

---

## 2. Deployment Topology

The production architecture employs a standard containerized cloud topology designed for 99.5% uptime (`NFR-AVAIL-001`), horizontal elasticity, and zero-downtime rolling updates:

```
                                  [Edge CDN & DDoS Protection: Cloudflare / CloudFront]
                                                        │
                                                        ├────────────────────────────────────────┐
                                                        │ (Static Assets / HTML / CSS / JS)      │ (API Requests / Dynamic HTTPS)
                                                        ▼                                        ▼
                                          [Public Static Web Hosting]             [Application Load Balancer (ALB)]
                                          - Vanilla SPA Frontend Bundle                          │ (TLS 1.3 Termination)
                                          - Global Asset Edge Caching                            ▼
                                                                                  +──────────────────────────────+
                                                                                  | [Container Cluster / App VMs]|
                                                                                  | Node.js API Application Node |
                                                                                  +──────────────────────────────+
                                                                                                 │
                                                        ┌────────────────────────────────────────┴────────────────────────────────────────┐
                                                        │                                                                                 │
                                                        ▼ (SQL Pool)                                                                      ▼ (Job Enqueue)
                                      +-----------------------------------+                                             +-----------------------------------+
                                      | [Managed PostgreSQL 15+]          |                                             | [Managed Redis 7+]                |
                                      | - Multi-AZ Standby Replication    |                                             | - In-Memory Task Queue (BullMQ)   |
                                      | - Automated Point-in-Time Backups |                                             | - Rate Limiter Cache              |
                                      +-----------------------------------+                                             +-----------------------------------+
                                                        │                                                                                 │
                                                        │ Read Snapshots                                                                  ▼
                                                        │                                                               +-----------------------------------+
                                                        └──────────────────────────────────────────────────────────────►| [Background Worker Node]          |
                                                                                                                        | - PDF Rendering (Puppeteer)       |
                                                                                                                        | - Email Dispatcher                |
                                                                                                                        | - Hold Expiration Sweeper         |
                                                                                                                        +-----------------------------------+
                                                                                                                                          │
                                                                                                                                          ▼ (Write PDF)
                                                                                                                        +-----------------------------------+
                                                                                                                        | [Private S3 Object Storage]       |
                                                                                                                        | - Encrypted Invoices & Vouchers   |
                                                                                                                        +-----------------------------------+
```

---

## 3. Environment Strategy

The deployment lifecycle is partitioned into four isolated environments:

| Environment       | Purpose                      | Database Isolation                | Payment Gateway Mode        | Email Transport Mode        |
| ----------------- | ---------------------------- | --------------------------------- | --------------------------- | --------------------------- |
| **`local`**       | Local developer workstation  | Local Docker container (Postgres) | Mock / Test Sandbox         | Local Mailpit / Console Log |
| **`test` / `ci`** | Automated CI/CD pipeline     | Ephemeral containerized DB        | Mock / Test Sandbox         | Mock                        |
| **`staging`**     | Pre-production QA validation | Dedicated Managed Staging DB      | Gateway Test Sandbox        | Staging Inboxes / Sandbox   |
| **`production`**  | Live customer operations     | Multi-AZ Managed PostgreSQL       | Live Production Credentials | Production SES / SendGrid   |

### 3.1 Secrets Management & Configuration

- **Zero Hardcoded Secrets:** Application containers receive configuration exclusively via runtime environment variables injected through secure secret managers (e.g. AWS Secrets Manager, Doppler, or GitHub Secrets in CI).
- **Key Configuration Variables:**
  - `DATABASE_URL`: Connection string with connection pooling parameters (`?sslmode=require&pool_size=20`).
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: Cryptographically generated 256-bit secrets.
  - `PAYMENT_GATEWAY_KEY_ID`, `PAYMENT_GATEWAY_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`.
  - `S3_BUCKET_PRIVATE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`.

---

## 4. Continuous Integration & Deployment (CI/CD)

```
[Git Push / PR] ──► [CI Pipeline] ──► [1. Static Analysis / Linter]
                                   ──► [2. TypeScript Type Check]
                                   ──► [3. Unit & Integration Tests]
                                   ──► [4. Security SAST Scan]
                                   ──► [5. Build Docker Images]
                                   ──► [6. Deploy to Staging]
                                   ──► [7. Smoke Tests]
                                   ──► [8. Manual Approval]
                                   ──► [9. Rolling Deploy to Production]
```

- **Zero-Downtime Deployment:** Rolling update strategy ensuring healthy new containers pass `/health/ready` probes before terminating old instances.

---

## 5. Observability, Telemetry & Logging Architecture

### 5.1 Structured Logging (`NFR-AUDIT-001`)

- **Format:** NDJSON (Newline Delimited JSON) output to `stdout` containing:
  - `timestamp`: ISO-8601 UTC string.
  - `level`: `info`, `warn`, `error`, `debug`.
  - `requestId`: Unique correlation identifier propagated from incoming HTTP headers.
  - `userId`, `role`: Masked actor identifiers.
  - `message`: Descriptive log event.
  - `context`: Structured key-value payload (excluding passwords, full card details, and PII).

### 5.2 Metrics & Service Level Indicators (SLIs)

```
+-----------------------------------------------------------------------------------+
|                        OPERATIONAL METRIC MONITORS                                |
+-----------------------------------------------------------------------------------+
| Metric Category               | Target Threshold             | Alert Trigger      |
+-------------------------------+------------------------------+--------------------+
| API Request Latency (p95)     | < 500ms                      | p95 > 1000ms (5m)  |
| HTTP 5xx Server Error Rate    | < 0.1% of all requests       | > 1% in 5 minutes  |
| Database Connection Pool Sat. | < 70% pool utilization       | > 85% pool used    |
| Checkout Conversion Ratio     | > 75% completed holds        | Sharp drop > 30%   |
| Webhook Failure Rate          | 0 unhandled webhook errors   | > 1 failure event  |
| Background Worker Queue Lag   | < 30 seconds job latency     | Queue depth > 500  |
+-----------------------------------------------------------------------------------+
```

### 5.3 Health Check Endpoints

- `GET /health/live` — Liveness probe returning HTTP 200 if the Node.js event loop is responsive.
- `GET /health/ready` — Readiness probe verifying active database connection pool and Redis reachability.

---

## 6. Error Architecture & Operational Runbooks

| Incident Scenario                   | Automated Recovery Action                                        | SRE Operational Runbook                                           |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Payment Gateway Webhook Timeout** | Gateway automatically retries callback with exponential backoff. | Check gateway webhook logs; verify HMAC signature secrets.        |
| **PDF Generation Engine Crash**     | BullMQ retries PDF generation job up to 3 times with backoff.    | Check Headless Chrome memory allocation; restart worker.          |
| **Inventory Hold Release Failure**  | Hold sweeper cron re-evaluates expired holds every 60 seconds.   | Inspect `inventory_holds` for stuck `ACTIVE` records past expiry. |
| **Database Connection Exhaustion**  | Backend returns HTTP 503; connection pool rejects new queries.   | Scale connection pooler (PgBouncer); increase DB instance size.   |

---

_End of Document DOC-ARCH-0.4.7 (Deployment, Environment & Observability Architecture)._
