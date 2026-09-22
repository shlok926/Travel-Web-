# Phase 0.4.2 — System Architecture & Technical Blueprint

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Blueprint (Gate-Reviewed)  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md)
- [docs/PHASE_0_2_PRODUCT_DEFINITION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_2_PRODUCT_DEFINITION.md)
- [docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md)

---

## 1. Document Control

| Property            | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.2`                                                          |
| **Document Title**  | System Architecture & Technical Blueprint                                 |
| **Current Version** | `1.1.0` (Architectural Gate-Reviewed)                                     |
| **Author Roles**    | Lead System Architect, Enterprise Solutions Architect, Security Architect |
| **Target Audience** | Engineering Team, Full-Stack Developers, DevOps/Platform Engineers        |

---

## 2. Architecture Style Evaluation & Selection

To determine the optimal architecture pattern for the Young Tours & Travels platform, three industry architecture styles were evaluated against the project requirements and constraints.

### 2.1 Architecture Options Evaluated

```
+-------------------+       +-------------------+       +-------------------+
|     OPTION A      |       |     OPTION B      |       |     OPTION C      |
|  Modular Monolith |       |   Microservices   |       |    Serverless     |
+-------------------+       +-------------------+       +-------------------+
| Decoupled domains |       | Independent svcs  |       | Function-as-a-Svc |
| Single deployment |       | Network RPC / HTTP|       | Managed Event Bus |
| Shared ACID DB    |       | Distributed DBs   |       | Vendor Ecosystem  |
+-------------------+       +-------------------+       +-------------------+
```

| Evaluation Dimension         | Option A: Modular Monolith                                                                    | Option B: Microservices                                                                            | Option C: Serverless / Distributed                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Architectural Complexity** | **Low–Medium:** Well-structured internal domain modules within a single runtime.              | **High:** Network latency, distributed transactions, service discovery, distributed tracing.       | **Medium–High:** Function orchestration, cold starts, vendor-specific event routing.        |
| **Development Speed**        | **Very High:** Single repository, unified test suite, simplified local development setup.     | **Low:** Multi-repo overhead, contract coordination, complex mock environments.                    | **Medium:** Fast initial deployment, but local integration testing is difficult.            |
| **Operational Burden**       | **Low:** Single container/process to monitor, log, and deploy.                                | **High:** Requires Kubernetes, service meshes, centralized API gateways, cluster ops.              | **Medium:** Minimal server maintenance, but complex observability and cloud IAM.            |
| **Scalability**              | **High:** Stateless monolith scales horizontally behind a load balancer; read-caching on CDN. | **Very High:** Individual domain scaling, but unnecessary for initial MVP-1 traffic.               | **Very High:** Automated burst scaling, but expensive under continuous baseline loads.      |
| **Consistency & ACID**       | **Strict ACID:** Atomic seat booking and payment verification in single relational DB.        | **Eventual Consistency:** Requires 2PC, Saga patterns, or outbox queues; high risk of overselling. | **Complex Consistency:** Distributed locking across lambdas requires external Redis/Dynamo. |
| **Deployment Simplicity**    | **High:** Single CI/CD pipeline, zero-downtime rolling container deploys.                     | **Low:** Multi-service coordination, versioned inter-service dependency management.                | **Medium:** CloudFormation / Terraform script sprawl; multi-function deployment locks.      |
| **Cost Efficiency**          | **High:** Low infrastructure overhead; minimal baseline cloud server cost.                    | **Low:** High baseline infrastructure cost (multiple VMs/nodes, managed Kafka, etc.).              | **Variable:** Low idle cost, but high cost spikes under high API query traffic.             |
| **Suitability for MVP-1**    | **EXCELLENT (Optimal Fit):** Matches 100 concurrent checkout constraint directly.             | **POOR:** Massive over-engineering; introduces excessive accidental complexity.                    | **SUB-OPTIMAL:** Complex local development for custom PDF rendering and background timers.  |
| **Future Expansion**         | **High:** Clean domain boundaries allow slicing individual modules into services later.       | **High:** Naturally modular, but premature.                                                        | **Medium:** Risk of cloud vendor lock-in.                                                   |

### 2.2 Selected Architectural Style: Modular Monolith with Asynchronous Worker

**Architectural Decision:** The platform shall be architected as a **Modular Monolith** comprising:

1. A **Single Page Application (SPA) Client** serving Public Storefront, Customer Portal, and Admin Console using modular Vanilla Web Standards.
2. A **Layered Modular Backend API** built on **Node.js (TypeScript) + Fastify** encapsulating 20 decoupled domain modules with strict internal boundaries.
3. A **Single Authoritative Relational Database (PostgreSQL 15+)** enforcing ACID transactions, foreign keys, and atomic inventory allocations.
4. An **Asynchronous Background Worker / Queue (BullMQ + Redis)** handling long-running or non-blocking tasks (PDF document generation, transactional email dispatch, expired hold cleanup timers) with strict failure isolation from core booking transactions.

---

## 3. C4 Architecture Model

### 3.1 Level 1: System Context Diagram

```
                                          +-----------------------+
                                          |   Registered Customer |
                                          |        (ACT-CUST)     |
                                          +-----------------------+
                                                      |
                                                      | Browses, Books, Pays,
                                                      | Downloads Vouchers
                                                      v
+-------------------+                     +---------------------------------------+                     +---------------------+
|    Guest User     | ------------------> |       YOUNG TOURS & TRAVELS           | <------------------ |    Administrator    |
|    (ACT-GUEST)    |  Discovers Tours,   |              PLATFORM                 |   Manages Catalog,  |     (ACT-ADMIN)     |
+-------------------+  Searches Packages  |        (Travel-Web System)            |   Inventory, CMS    +---------------------+
                                          +---------------------------------------+
                                            |                 |                 |
                       Processes Payments   |                 | Dispatches      | Generates Invoices/
                       via Provider Adapter |                 | Emails          | Tickets Asynchronously
                                            v                 v                 v
                                 +--------------------+ +-------------------+ +-------------------+
                                 |  Payment Gateway   | |   Email Service   | | Document Engine   |
                                 |   (ACT-EXT-PAY)    | |  (ACT-EXT-MAIL)   | | (ACT-SYS-DOCGEN)  |
                                 +--------------------+ +-------------------+ +-------------------+
                                            |
                                            v (Future Phase 1.1 / Phase 3)
                                 +--------------------+ +-------------------+
                                 |    SMS Gateway     | | Flight GDS Engine |
                                 |   (ACT-EXT-SMS)    | |  (Phase 3 Engine) |
                                 +--------------------+ +-------------------+
```

### 3.2 Level 2: Container Diagram

```
+--------------------------------------------------------------------------------------------------------+
|                                  YOUNG TOURS & TRAVELS PLATFORM BOUNDARY                               |
|                                                                                                        |
|  +--------------------------------------------------------------------------------------------------+  |
|  | [Container: Single Page Application (SPA)]                                                       |  |
|  | HTML5 / Modern CSS / Modular ES6 JS Client (Storefront, Customer Portal, Admin Console)          |  |
|  +--------------------------------------------------------------------------------------------------+  |
|                                                     |                                                  |
|                                                     | HTTPS / REST JSON API                            |
|                                                     v                                                  |
|  +--------------------------------------------------------------------------------------------------+  |
|  | [Container: Backend API Application Server (Fastify + TypeScript)]                               |  |
|  | Layered Modular Application (Auth, Catalog, Booking Engine, Payment Adapter, Admin CMS)         |  |
|  +--------------------------------------------------------------------------------------------------+  |
|                         |                                         |                                    |
|       SQL / Connection  |                                         | Job Enqueue /                      |
|       Pool (ACID)       v                                         v Background Channel                 |
|  +----------------------------------+            +--------------------------------------------------+  |
|  | [Container: Relational Database] |            | [Container: Background Worker Process (BullMQ)]  |  |
|  | Persistent Store for Catalog,    |            | Asynchronous Task Executor:                      |  |
|  | Bookings, Payments, Users, Logs  |            | - Expired Hold Sweeper (15m timer)               |  |
|  +----------------------------------+            | - PDF Document Generator (Invoices/Tickets)      |  |
|                         |                        | - Email Dispatch Worker                          |  |
|                         |                        +--------------------------------------------------+  |
|                         |                                                 |                            |
|                         +-----------------------+                         | Write Generated PDF        |
|                                                 v                         v                            |
|                            +----------------------------------------------------+                      |
|                            | [Container: Object / Media Storage]                |                      |
|                            | Secure Private Bucket: Generated PDF Invoices      |                      |
|                            | Public CDN Bucket: Destination & Package Imagery   |                      |
|                            +----------------------------------------------------+                      |
+--------------------------------------------------------------------------------------------------------+
```

### 3.3 Level 3: Backend Component Architecture

```
+--------------------------------------------------------------------------------------------------------+
|                                    BACKEND API APPLICATION CONTAINER (Fastify)                         |
+--------------------------------------------------------------------------------------------------------+
| [HTTP Routing / Controller Layer (Fastify Plugins)]                                                    |
|  - AuthRoutes        - CatalogRoutes       - BookingRoutes       - PaymentRoutes     - AdminRoutes     |
+--------------------------------------------------------------------------------------------------------+
| [Middleware & Hook Pipeline]                                                                           |
|  - RateLimiter       - RequestValidator(AJV) - AuthTokenVerifier   - SecurityHeaders   - AuditLogger   |
+--------------------------------------------------------------------------------------------------------+
| [Application Service Layer (Domain Modules)]                                                           |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
|  | Identity & User Svc | | Catalog & Tour Svc  | | Inventory & Hold Svc| | Dynamic Pricing Svc |     |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
|  | Booking Engine Svc  | | Payment Adapter Svc | | Document Gen Svc    | | Cancellation Svc    |     |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
|  | Review / Rating Svc | | CMS Content Svc     | | Notification Svc    | | Admin Analytics Svc |     |
|  +---------------------+ +---------------------+ +---------------------+ +---------------------+     |
+--------------------------------------------------------------------------------------------------------+
| [Domain / Business Invariant Layer]                                                                    |
|  - BookingStateMachine - PricingEngine         - SeatAllocationRules   - PolicyEvaluator (DEC-007)     |
+--------------------------------------------------------------------------------------------------------+
| [Persistence / Repository Layer]                                                                       |
|  - UserRepository      - PackageRepository   - InventoryRepository   - BookingRepository               |
|  - PaymentRepository   - DocumentRepository  - AuditLogRepository    - CMSContentRepository            |
+--------------------------------------------------------------------------------------------------------+
| [External Integration Adapters]                                                                        |
|  - PaymentGatewayAdapter (Provider-Agnostic Interface) - EmailProviderAdapter (ACT-EXT-MAIL)           |
|  - PDFRenderingEngine (Puppeteer Headless Chrome)      - StorageBucketAdapter (S3 / R2 / MinIO)        |
+--------------------------------------------------------------------------------------------------------+
```

---

## 4. Frontend Architecture

### 4.1 Application Structure & Routing Boundary

The client application is organized into three distinct operational domains:

1. **Public Storefront (`/`, `/destinations`, `/packages`, `/package/:id`, `/about`, `/contact`):**
   - Publicly accessible without authentication.
   - High performance, responsive layout, SEO-optimized semantic HTML.
   - Dynamic catalog browsing, theme filtering, keyword search, and detail modal/pages.
2. **Customer Portal (`/account/login`, `/account/register`, `/checkout`, `/dashboard`, `/bookings/:id`):**
   - Authenticated customer workspace.
   - Interactive package configurator (party size, accommodation/meal tiers, departure date).
   - Frictionless Guest-to-Customer conversion flow during checkout (`DEC-009`).
   - Secure booking dashboard with 1-click PDF download links and cancellation request modal.
3. **Administrator Operations Console (`/admin/login`, `/admin/dashboard`, `/admin/packages`, `/admin/inventory`, `/admin/bookings`, `/admin/cms`, `/admin/reports`):**
   - Isolated admin login boundary with elevated token verification.
   - CRUD interfaces for packages, day-wise itineraries, destinations, and themes.
   - Departure calendar manager with real-time seat quota monitors and passenger manifest exports.
   - CMS banner manager and booking cancellation/refund authorization queue.

### 4.2 Modular Maintainability Without Framework Bloat

To ensure long-term maintainability across complex interactive flows without heavy framework dependencies:

- **Component Controllers:** Each complex view (e.g. Booking Wizard, Admin Package Editor) is encapsulated in a dedicated ES module controller exposing `init()`, `render()`, `bindEvents()`, and `destroy()`.
- **Centralized API Client:** All network requests pass through a typed API client (`frontend/src/services/api.js`) providing automated JWT token injection, refresh rotation, and uniform error handling.
- **Reactive DOM Helpers:** Targeted micro-helpers update UI state reactively without virtual DOM diffing overhead.

---

## 5. Backend Layering & Architectural Invariants

### 5.1 Layer Responsibilities

```
[1. API / Route Layer (Fastify Plugins)]
       │  - HTTP deserialization, JSON Schema validation (AJV), response formatting.
       │  - Route-level rate limiting and security headers.
       ▼
[2. Application Service Layer]
       │  - Orchestrates business workflows across multiple domain services.
       │  - Handles transaction boundaries (commit/rollback).
       ▼
[3. Domain / Business Logic Layer]
       │  - Pure business rules, state machine transitions, invariants.
       │  - Independent of databases, HTTP, or third-party frameworks.
       ▼
[4. Repository / Persistence Layer]
       │  - Data access abstraction, SQL queries, mapping to domain entities.
       ▼
[5. Relational Database (PostgreSQL 15+)]
```

### 5.2 Architectural Rules (Enforced Invariants)

1. **Zero Business Logic in Routes:** Fastify route handlers only validate request payloads, delegate execution to Application Services, and format HTTP responses.
2. **Zero Direct Database Access from Controllers:** All data access must pass through typed Repository interfaces.
3. **Decoupled Payment & Booking:** Payment gateway integration code must NEVER directly manipulate booking status flags without emitting verifiable payment domain events.
4. **Server-Side Price Locking:** The backend is the sole authority on price calculation; any price submitted in client request bodies must be rejected or overwritten.

---

## 6. Critical Lifecycle Architectures

### 6.1 Booking Lifecycle & State Machine

```
               [Customer Initiates Checkout]
                             │
                             ▼
                   (AWAITING_PAYMENT) ──[15-min Hold Expired]──► (EXPIRED / CANCELLED)
                             │
                  [Payment Success Callback]
                             │
                             ▼
                          (PAID)
                             │
             ┌───────────────┴───────────────┐
             │ (DEC-003 Option A: Instant)   │ (DEC-003 Option B: Manual Gate)
             ▼                               ▼
        (CONFIRMED)                (AWAITING_APPROVAL)
             │                               │
             │                     [Admin Approves Booking]
             │                               │
             │◄──────────────────────────────┘
             │
             ├──[Customer Requests Cancel & Admin Approves]──► (CANCELLED)
             │
             └──[Tour Completed Successfully]────────────────► (COMPLETED)
```

### 6.2 Concurrency & Inventory Control Architecture

```
+-----------------------------------------------------------------------------------+
|                        CONCURRENT SEAT RESERVATION FLOW                           |
+-----------------------------------------------------------------------------------+
| 1. Customer initiates checkout for Package Departure (Date D, Party Size N).      |
| 2. Backend opens Database Transaction:                                            |
|    - SELECT * FROM departure_schedules WHERE id = ? FOR UPDATE;                   |
|    - Real-Time Guard: ActiveHoldSeats = SUM(reserved_seats)                       |
|                       WHERE departure_id = ? AND status = 'ACTIVE'                |
|                       AND expires_at > NOW();                                     |
|    - Available = TotalCapacity - ConfirmedSeats - ActiveHoldSeats                 |
|    - IF Available >= N:                                                           |
|        INSERT INTO inventory_holds (departure_id, seats, expires_at, status);     |
|        COMMIT Transaction.                                                        |
|        RETURN Checkout Session Token (Valid for 15 minutes).                      |
|    - ELSE:                                                                        |
|        ROLLBACK Transaction.                                                      |
|        RETURN HTTP 409 Conflict ("Seats no longer available").                    |
+-----------------------------------------------------------------------------------+
```

- **Deterministic Defense in Depth:** In addition to the background sweeper worker, database inventory calculation queries explicitly filter `AND expires_at > NOW()`, guaranteeing that even if Redis or the background worker process is temporarily delayed, expired holds can never block seat availability or cause overselling.

---

### 6.3 Payment Architecture & Resilient Webhook Engine

```
[Customer Browser] ──(1. Checkout)──► [Backend API] ──(2. Create Order)──► [Payment Gateway]
       │                                     ▲                                  │
       │ (3. Pay via Gateway UI/Modal)       │                                  │
       ▼                                     │                                  │
 [Payment Gateway Execution] ────────────────┼──────────────────────────────────┘
                                             │ (4. Asynchronous Webhook Callback)
                                             ▼
                              [Payment Webhook Handler]
                                             │
                                             ├─► (Verify Cryptographic HMAC Signature)
                                             ├─► (Check Idempotency: Has event_id been processed?)
                                             ├─► IF Already Processed: Return HTTP 200 OK immediately.
                                             ├─► ELSE: Open Database Transaction:
                                             │     - Update payment_transactions record to SUCCESS.
                                             │     - Update booking record to PAID / CONFIRMED.
                                             │     - Write pending Document/Notification outbox tasks.
                                             │     - Enqueue BullMQ background jobs.
                                             │     - COMMIT Transaction.
                                             └─► Return HTTP 200 OK.
```

- **Failure Isolation Guarantee:** Payment transaction success and booking confirmation are committed **independently and immediately** to PostgreSQL. The booking confirmation status NEVER depends on whether the BullMQ worker or Puppeteer PDF generator succeeds.
- **On-Demand Document Fallback:** If a customer immediately navigates to their dashboard and clicks "Download Invoice" before the background worker has finished rendering the PDF to object storage, the API dynamically compiles the PDF on-demand synchronously and streams it to the user.

---

## 7. Authentication, Authorization & RBAC Architecture

- **Token Architecture:** Short-lived **JWT Access Tokens** (15-minute expiration) and secure **Refresh Tokens** stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
- **Password Hashing (`NFR-SEC-002`):** Argon2id salted adaptive hashing. Plaintext credentials are never persisted.
- **Guest Checkout Conversion (`DEC-009`):** Checkout seamlessly auto-provisions or associates the customer record without mandatory upfront registration.

---

_End of Document DOC-ARCH-0.4.2 (System Architecture & Technical Blueprint)._
