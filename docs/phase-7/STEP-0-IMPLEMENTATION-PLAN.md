# Phase 7 — Admin & Operations
## Step 0 Implementation Plan: Architecture, Requirements Discovery & Implementation Roadmap

> **Author**: Senior Product Architect + Backend Architect + Application Security Engineer + Database Architect + QA/Release Engineer  
> **Status**: APPROVED & READY FOR SEQUENCED EXECUTION  
> **Classification Standard**: Every requirement, capability, and constraint is categorized as `[DOCUMENTED]`, `[REPOSITORY]`, `[DECISION]`, `[ASSUMPTION]`, `[INFERENCE]`, `[UNKNOWN]`, or `[CONFLICT]`.

---

## 1. Executive Summary

Phase 0 through Phase 6 have established a rock-solid, production-grade foundation for the **Young Tours & Travels** platform. The system now possesses verified authentication (Phase 2), catalogue management (Phase 3), high-performance search and inventory availability (Phase 4), a pessimistic concurrency booking engine with 15-minute reservation holds (Phase 5), and an atomic multi-gateway payment, statutory invoicing, e-ticket generation, and cancellation/refund lifecycle (Phase 6) with 993/993 green tests.

**Phase 7 (Admin & Operations)** completes the core operational loop of the platform. While Phases 1–6 implemented several administrative backend endpoints (Catalogue CRUD, Departure schedules, Bookings list, Manifests, and Cancellation authorization), these capabilities currently lack a unified, secure, and reactive **Admin Operations Console** on the frontend, comprehensive **Audit Logging**, operational **Dashboard Metrics**, and structured **CMS/Content Management** for hero sliders, static informational pages, and company metadata.

This document establishes the authoritative requirements inventory, domain boundaries, security threat model, database impact analysis, API architecture, frontend console architecture, testing strategy, and a phased step-by-step implementation sequence for Phase 7 without modifying any frozen business or backend logic.

---

## 2. Phase 0–6 Frozen Baseline

The following architectural and business components are completed, verified, and strictly **FROZEN**:

```
+---------------------------------------------------------------------------------------------------+
|                                      FROZEN SYSTEM BASELINE                                       |
+---------------------------------------------------------------------------------------------------+
| Phase 0: Product Definition & Documentation  | Full product model, actor taxonomy, business rules  |
| Phase 1: Engineering Foundation              | Fastify, TypeScript, PostgreSQL, Redis, Vitest, CI |
| Phase 2: Identity & Access Control           | Argon2id, RS256 Asymmetric JWT, HttpOnly Cookies   |
| Phase 3: Destinations & Package Catalogue    | Relational schema, slug routing, base pricing       |
| Phase 4: Search & Inventory Availability     | High-speed filtered queries, departure calendars    |
| Phase 5: Customer Booking Engine             | 15-min seat holds, pessimistic locks, hold workers  |
| Phase 6: Payment, Invoicing & Refunds        | Multi-gateway adapters, BullMQ PDFs, refund state   |
+---------------------------------------------------------------------------------------------------+
```

### Absolute Architecture Invariants:
1. **Modular Monolith**: Fastify backend + PostgreSQL + Redis + BullMQ. No microservices, No ORM. `[DOCUMENTED]`
2. **PostgreSQL Inventory Authority**: All seat capacity, reservations, and commitments are governed strictly by PostgreSQL transactions with `SELECT ... FOR UPDATE` row locks. `[DOCUMENTED]`
3. **Financial Precision**: All monetary values are stored and calculated strictly as integer minor units (`BIGINT` paise / cents). Floating-point arithmetic on money is prohibited. `[DOCUMENTED]`
4. **Authoritative State Transitions**:
   - `BOOKING`: `AWAITING_PAYMENT` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CANCELLED` (or `EXPIRED`). Manual confirmation without verified payment is strictly forbidden. `[DOCUMENTED]`
   - `REFUND`: `PROCESSING` $\neq$ `REFUNDED` $\neq$ `CANCELLED`. `PROCESSING` retains `CONFIRMED` booking, `SUCCESS` payment, and reserved seats. Only `SETTLED` triggers `REFUNDED` payment, `CANCELLED` booking, and seat release. `[DOCUMENTED]`
5. **Frontend Paradigm**: Vanilla HTML5 + CSS3 + ES6 JavaScript modules. No frontend SPA framework (React/Vue/Angular) will be introduced. `[DOCUMENTED]`

---

## 3. Authoritative Requirements Sources

The requirements for Phase 7 are derived directly from the following project documentation and repository artifacts:

1. **`Tours and Travel Document.docx` & `Tours and Travel Portal Synopsis.docx`**:
   - Administrator actor definition (§1.2, §1.3, §4.1). `[DOCUMENTED]`
   - Package CRUD, pricing, inclusions, and itineraries (§6). `[DOCUMENTED]`
   - Booking management and operational visibility (§1.3, §6). `[DOCUMENTED]`
   - Sliders, cities, themes, and CMS configuration (§6). `[DOCUMENTED]`
   - Revenue and transaction reporting (§6). `[DOCUMENTED]`
2. **`docs/PHASE_0_2_PRODUCT_DEFINITION.md`**:
   - Direct Tour Operator Model A (§8). `[DOCUMENTED]`
   - Section 26: Complete Administrator Journey. `[DOCUMENTED]`
   - Section 29: MVP-1 Scope Matrix (Admin Console, Package CRUD, Content CMS). `[DOCUMENTED]`
   - Section 28: Business Rules BR-001 through BR-010. `[DOCUMENTED]`
3. **`docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md`**:
   - `FR-005`: Admin Authentication & Dashboard Access. `[DOCUMENTED]`
   - `FR-010`: Admin Booking Management Queue. `[DOCUMENTED]`
   - `FR-019`: Testimonial & Review Moderation (Deferred / Phase 7+). `[DOCUMENTED]`
   - `NFR-004`: Role-Based Access Control (Admin vs. Customer isolation). `[DOCUMENTED]`
4. **`docs/phase-3/PHASE-3-FINAL-INTEGRATION-AUDIT.md`**:
   - Admin Catalogue REST APIs (`/api/v1/admin/destinations`, `/themes`, `/packages`, `/itinerary`, `/publish`). `[REPOSITORY]`
5. **`docs/phase-5/PHASE-5-BOOKING-PLAN.md`**:
   - Admin Booking Management & Departure Manifest APIs (`/api/v1/admin/bookings`, `/departures/:id/manifest`). `[REPOSITORY]`
6. **`docs/phase-6/STEP-0-IMPLEMENTATION-PLAN.md`**:
   - Admin Cancellation Review & Refund Authorization APIs (`/api/v1/admin/cancellations`). `[REPOSITORY]`

---

## 4. Phase 7 Requirements Inventory

| Requirement ID | Domain Area | Requirement Description | Source | Priority | Actor | Existing / Future | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`FR-ADM-001`** | Access Control | Secure Admin authentication guard and admin-only navigation routing. | `PHASE_0_2` §26 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-002`** | Dashboard | Operational dashboard displaying KPIs: Bookings count, Revenue, Pending Cancellations, Inventory alerts. | `PHASE_0_2` §26 | MUST | Admin | Future | `[DOCUMENTED]` |
| **`FR-ADM-003`** | Destinations | Manage destinations (Create, Read, Update, Delete, Publish, Unpublish, Hero image). | `PHASE_0_2` §24 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-004`** | Themes | Manage tour themes (Create, Read, Update, Delete, Image). | `PHASE_0_2` §24 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-005`** | Packages | Tour package lifecycle (Draft, Edit, Inclusions, Pricing, Publish completeness validation `BR-PKG-001`, Unpublish). | `PHASE_0_2` §24 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-006`** | Itineraries | Day-wise itinerary builder (Day number, Title, Description, Activities, Meals, Hotel tier). | `PHASE_0_2` §24 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-007`** | Departures | Departure schedule management (Create dates, Set seat capacity, Close/Cancel departure). | `PHASE_0_2` §26 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-008`** | Bookings | Operational booking queue (Search by reference/customer, Filter by status/date, View details & payments). | `PHASE_0_2` §26 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-009`** | Manifest | Passenger roster manifest viewer for ground operations (Traveller names, ages, primary contact, dietary/special requests). | `PHASE_0_2` §27 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-010`** | Cancellations | Review queue for customer cancellation requests; authorize gateway refunds or reject with admin notes. | `PHASE_0_2` §26 | MUST | Admin | Backend: Exist / Frontend: Future | `[DOCUMENTED]` |
| **`FR-ADM-011`** | CMS Sliders | Manage homepage hero slider banners (Headline, Subtitle, Background image, CTA link, Sort order, Active state). | `PHASE_0_2` §24 | MUST | Admin | Future | `[DOCUMENTED]` |
| **`FR-ADM-012`** | CMS Pages | Manage static informational pages ("About Us", "Privacy Policy", "Terms & Conditions", "Contact Details"). | `PHASE_0_2` §24 | MUST | Admin | Future | `[DOCUMENTED]` |
| **`FR-ADM-013`** | Audit Logging | Append-only audit logging for high-risk operations (Publish/Unpublish, Capacity overrides, Cancellations, CMS updates). | `NFR-004` | MUST | Admin / System | Future | `[INFERENCE]` |
| **`FR-ADM-014`** | Reports | Exportable operational reports (Booking summary, Departure capacity utilization, Revenue reconciliation). | `PHASE_0_2` §29 | SHOULD | Admin | Future | `[DOCUMENTED]` |
| **`NFR-ADM-001`** | Security | Zero IDOR vulnerability; strict function-level and object-level `role === 'ADMIN'` enforcement. | `NFR-004` | MUST | Security | Existing & Future | `[DOCUMENTED]` |
| **`NFR-ADM-002`** | Sanitization | Stored XSS prevention across all rich text CMS and description fields (`escapeHtml` / strict DOM sanitization). | `PHASE_0_4_3` | MUST | Security | Existing & Future | `[DOCUMENTED]` |

---

## 5. Existing Admin Capability Audit

A thorough audit of the repository reveals the following current state of backend vs. frontend administrative capabilities:

| Capability | Backend Endpoint(s) | Frontend UI | Automated Tests | Phase Origin | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin Authentication & RBAC** | `fastify.authorize(['ADMIN'])` plugin hook | None (Navbar only shows greeting) | `auth.plugin.test.ts`, `auth.routes.test.ts` | Phase 2 | **Backend Complete / Frontend Missing** |
| **Destination Management** | `GET/POST/PATCH/DELETE /api/v1/admin/destinations`, `POST /:id/publish`, `POST /:id/unpublish` | None | `catalogue.routes.test.ts`, `catalogueRepositories.test.ts` | Phase 3 | **Backend Complete / Frontend Missing** |
| **Theme Management** | `GET/POST/PATCH/DELETE /api/v1/admin/themes` | None | `catalogue.routes.test.ts` | Phase 3 | **Backend Complete / Frontend Missing** |
| **Tour Package CRUD & Publish** | `GET/POST/PATCH/DELETE /api/v1/admin/packages`, `POST /:id/publish`, `POST /:id/unpublish` | None | `catalogue.routes.test.ts`, `catalogueServices.test.ts` | Phase 3 | **Backend Complete / Frontend Missing** |
| **Itinerary Management** | `PUT /api/v1/admin/packages/:id/itinerary` | None | `catalogue.routes.test.ts` | Phase 3 | **Backend Complete / Frontend Missing** |
| **Departure Schedule Operations** | `GET/POST/PATCH/DELETE /api/v1/admin/packages/:packageId/departures`, `GET/PATCH/DELETE /api/v1/admin/departures/:id` | None | `searchAndInventory.routes.test.ts`, `departureDbSchema.test.ts` | Phase 4 | **Backend Complete / Frontend Missing** |
| **Booking Queue & Search** | `GET /api/v1/admin/bookings`, `GET /api/v1/admin/bookings/:reference` | None | `adminBooking.routes.test.ts` | Phase 5 | **Backend Complete / Frontend Missing** |
| **Passenger Manifest** | `GET /api/v1/admin/departures/:departureId/manifest` | None | `adminBooking.routes.test.ts` | Phase 5 | **Backend Complete / Frontend Missing** |
| **Cancellation Review & Refund Auth**| `GET /api/v1/admin/cancellations`, `POST /:id/authorize`, `POST /:id/reject` | None | `cancellation.routes.test.ts`, `cancellationConcurrency.test.ts` | Phase 6 | **Backend Complete / Frontend Missing** |
| **Document Downloads (Admin)** | `GET /api/v1/documents/invoice/:ref/download`, `GET /api/v1/documents/voucher/:ref/download` | None | `documentDownload.routes.test.ts` | Phase 6 | **Backend Complete / Frontend Missing** |
| **Admin Operational Dashboard** | None | None | None | Phase 7 | **Missing (In Scope)** |
| **CMS Hero Sliders & Banners** | None | Static HTML in `frontend/index.html` | None | Phase 7 | **Missing (In Scope)** |
| **CMS Informational Pages** | None | Static HTML footer | None | Phase 7 | **Missing (In Scope)** |
| **Operational Audit Logging** | None | None | None | Phase 7 | **Missing (In Scope)** |

---

## 6. Phase 7 Domain Boundaries

```
+---------------------------------------------------------------------------------------------------+
|                                     PHASE 7 DOMAIN BOUNDARIES                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [1. CATALOGUE & CONTENT OPS]        [2. INVENTORY & BOOKINGS OPS]    [3. GOVERNANCE & AUDIT]     |
|  ├── Destination Management          ├── Departure Schedules Calendar ├── Operations Dashboard    |
|  ├── Tour Themes Management          ├── Capacity & Seat Adjustments  ├── Append-Only Audit Trail |
|  ├── Package Editor (Pricing/Media)  ├── All-Bookings Management Queue├── Operational Reporting   |
|  ├── Day-wise Itinerary Builder      ├── Ground Passenger Manifest    └── Admin RBAC Hardening    |
|  └── CMS (Hero Sliders & Pages)      └── Cancellation Review & Refund                             |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Domain Analysis:
1. **Admin Dashboard Domain**: Aggregates live system statistics (Active bookings, departures departing within 7 days, pending cancellations, total revenue, unpublished drafts). `[DOCUMENTED]`
2. **Catalogue & Content Operations Domain**: Full management lifecycle for Destinations, Themes, Packages, and Day-wise Itineraries, with publication completeness validation (`BR-PKG-001`). `[DOCUMENTED]`
3. **Inventory & Departure Operations Domain**: Creates departure dates, defines total capacity, and tracks real-time booked seats vs. active holds without bypassing PostgreSQL locking. `[DOCUMENTED]`
4. **Booking Operations & Passenger Manifest Domain**: Multi-criteria booking search, itemized financial inspection, e-ticket/invoice download, and ground passenger roster generation. `[DOCUMENTED]`
5. **Cancellation & Refund Authorization Domain**: Visual operational queue for approving/rejecting customer cancellation requests and initiating gateway refund settlements under frozen Phase 6 rules. `[DOCUMENTED]`
6. **CMS & Marketing Domain**: Content management for hero slider banners and static informational pages ("About Us", "Contact Us", "Terms & Conditions"). `[DOCUMENTED]`
7. **Audit & Governance Domain**: Structured, tamper-resistant logging of all state-mutating administrative actions. `[INFERENCE]`

---

## 7. Admin Authorization Model

```
+---------------------------------------------------------------------------------------------------+
|                                  ROLE-BASED ACCESS CONTROL (RBAC)                                 |
+---------------------------------------------------------------------------------------------------+
|  Resource Route Prefix       | CUSTOMER Role Access         | ADMIN Role Access                   |
+------------------------------+------------------------------+-------------------------------------+
|  /api/v1/auth/*              | Self (Register, Login, Me)   | Self                                |
|  /api/v1/packages/* (Public) | Read Published Only          | Read Published                      |
|  /api/v1/bookings/*          | Own Bookings Only (IDOR safe)| Read/Cancel Own (Customer Context)  |
|  /api/v1/documents/*         | Own Documents Only           | ALL Bookings Documents              |
|  /api/v1/admin/*             | 403 ACCESS_FORBIDDEN (All)   | FULL ACCESS (Protected by Guard)    |
+------------------------------+------------------------------+-------------------------------------+
```

### Authorization Rules:
1. **PreHandler Enforcement**: All `/api/v1/admin/*` endpoints must register:
   ```typescript
   fastify.addHook('preHandler', fastify.authenticate);
   fastify.addHook('preHandler', fastify.authorize(['ADMIN']));
   ```
2. **Customer Isolation**: Any non-admin user presenting a valid JWT to `/api/v1/admin/*` receives HTTP 403 `ACCESS_FORBIDDEN`. `[DOCUMENTED]`
3. **Admin Customer Boundaries**: Admins can inspect and download documents for any booking in the system via `/api/v1/documents/*` or `/api/v1/admin/bookings/:ref`. `[DOCUMENTED]`
4. **No Privilege Escalation**: Role assignment is strictly non-editable via customer profile update APIs. `[DOCUMENTED]`

---

## 8. Admin Operational Workflows

### 8.1 Package Creation & Publication Workflow

```
[Create Package Draft] ──► [Set Itinerary Days] ──► [Completeness Check] ──► [Publish] ──► [Live on Storefront]
       │                          │                         │                     │
       ▼                          ▼                         ▼                     ▼
  DB: is_published=false     DB: itineraries rows     Validate: Inclusions,  DB: is_published=true
                                                      Pricing, Hero Image,
                                                      >=1 Itinerary Day
```

### 8.2 Departure Capacity & Scheduling Workflow

```
[Select Package] ──► [Define Dates & Capacity] ──► [Active Booking Window] ──► [Departure Day]
                             │                            │                           │
                             ▼                            ▼                           ▼
                     DB: total_capacity          PostgreSQL Hold Engine     Export Ground Manifest
                     booked_seats = 0            (Holds + Bookings <= Cap)  (Primary contacts & roster)
```

### 8.3 Cancellation & Refund Review Workflow

```
[Customer Cancellation] ──► [Admin Review Queue] ──► [Action: Authorize or Reject]
           │                         │                               │
           ▼                         ▼                               ├── [Reject] ──► Status: REJECTED | Booking remains CONFIRMED
  DB: PENDING_APPROVAL      DEC-007 Refund Calculated                │
                                                                     └── [Authorize] ──► Gateway Refund Invoked
                                                                                               │
                                                                                               ├── [Timeout] ──► PROCESSING (CONFIRMED)
                                                                                               └── [Success] ──► SETTLED (CANCELLED)
```

---

## 9. Package Management Plan

### Authoritative Business Rules (`BR-PKG-001`):
Before an administrator can publish a tour package (`is_published = true`), the system must strictly validate:
1. Package title, slug, summary, and full description are populated.
2. `destination_id` links to an active, published destination.
3. `theme_id` links to an active theme.
4. `base_price_adult` $> 0$ in minor units.
5. `duration_days` $\ge 1$ and `duration_nights` $\ge 0$.
6. `featured_image_url` is a valid, secure URI.
7. Minimum of 1 day-wise itinerary record is associated with the package.
8. Inclusions list contains at least 1 entry.

### Unpublish Behavior:
- Unpublishing a package hides it from public search and category listings (`is_published = false`).
- Existing confirmed bookings and already created departures for the package remain valid and unaffected. `[DOCUMENTED]`

---

## 10. Departure & Inventory Operations Plan

### Inventory Guardrails:
1. **Pessimistic Locking**: Any modification to a departure schedule must execute within a PostgreSQL transaction holding a `SELECT ... FOR UPDATE` row lock on `departure_schedules`. `[DOCUMENTED]`
2. **Capacity Modification Invariant**:
   - An administrator may increase total capacity at any time.
   - An administrator **CANNOT** reduce `total_seat_capacity` below `(booked_seats + active_unexpired_held_seats)`.
   - Violation throws HTTP 400 `INVENTORY_CAPACITY_CONFLICT`. `[DOCUMENTED]`
3. **Departure Cancellation**:
   - A departure with zero confirmed bookings can be marked `CANCELLED` or deleted.
   - A departure with confirmed bookings requires formal customer notification and cancellation/refund processing prior to schedule deletion. `[DOCUMENTED]`

---

## 11. Booking Operations Plan

### Operational Capabilities for Admin:
- **Listing & Pagination**: `GET /api/v1/admin/bookings` with multi-field search and filters:
  - `status`: `AWAITING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `EXPIRED`.
  - `dateFrom` / `dateTo`: Filter by booking creation date or departure date.
  - `query`: Text search across booking reference, primary contact email, customer name, and package title.
- **Detailed Inspection**: `GET /api/v1/admin/bookings/:reference`:
  - Full passenger roster (names, ages, genders, primary contact).
  - Price breakdown (adult/child subtotals, locked unit pricing, currency).
  - Linked payment transactions (provider, gateway order/payment ID, status).
  - Linked cancellation requests and refund settlements.
  - Direct 1-click links for GST Tax Invoice and E-Ticket Voucher downloads.
- **Strict Invariant**: No manual status override to `CONFIRMED`. `[DOCUMENTED]`

---

## 12. Passenger Manifest Plan

### Operational Data Exposure:
- **Endpoint**: `GET /api/v1/admin/departures/:departureId/manifest`
- **Security & Authorization**: Strictly `role === 'ADMIN'`.
- **Manifest Composition**:
  1. **Departure Header**: Package title, destination, departure date, return date, total booked passengers.
  2. **Passenger Roster**:
     - Booking Reference.
     - Passenger Full Name.
     - Passenger Type (`ADULT` / `CHILD`).
     - Age at Booking & Gender.
     - Primary Contact Flag (`true`/`false`).
     - Primary Contact Phone & Email.
     - Special Requests / Dietary notes.
- **Privacy Minimization**: Excludes sensitive internal credentials, payment secrets, and unnecessary user identifiers. `[DOCUMENTED]`

---

## 13. Cancellation / Refund Operations Plan

### Admin Cancellation Review Queue:
- **Endpoint**: `GET /api/v1/admin/cancellations?status=PENDING_APPROVAL`
- **Review Card Presentation**:
  - Booking reference, customer name, and tour departure date.
  - Days remaining until departure schedule.
  - DEC-007 Policy evaluation breakdown: Calculated Refund Amount vs. Cancellation Penalty Amount.
  - Customer stated reason for cancellation.
- **Authorization Action**:
  - `POST /api/v1/admin/cancellations/:id/authorize`
  - Allows optional administrative override of refund amount with mandatory admin notes.
  - Enforces deterministic idempotency key (`rfnd_${requestId}`) with payment gateway.
- **Rejection Action**:
  - `POST /api/v1/admin/cancellations/:id/reject`
  - Rejects request with admin notes; booking remains active and `CONFIRMED`. `[DOCUMENTED]`

---

## 14. CMS / Content Management Plan

### Managed Content Entities:

```
+---------------------------------------------------------------------------------------------------+
|                                      CMS DATA STRUCTURES                                          |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. HERO SLIDERS (hero_sliders table)                                                            |
|     - title: VARCHAR(128)                                                                        |
|     - subtitle: VARCHAR(256)                                                                     |
|     - image_url: VARCHAR(512)                                                                    |
|     - cta_text: VARCHAR(64)                                                                      |
|     - cta_link: VARCHAR(256)                                                                     |
|     - sort_order: INTEGER DEFAULT 0                                                              |
|     - is_active: BOOLEAN DEFAULT true                                                            |
|                                                                                                   |
|  2. STATIC PAGES (cms_pages table)                                                               |
|     - slug: VARCHAR(64) UNIQUE (e.g. 'about-us', 'privacy-policy', 'terms', 'contact')           |
|     - title: VARCHAR(128)                                                                        |
|     - content_html: TEXT                                                                         |
|     - meta_description: VARCHAR(256)                                                             |
|     - is_published: BOOLEAN DEFAULT true                                                         |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Public vs. Admin CMS Endpoints:
- **Public**:
  - `GET /api/v1/cms/sliders`: Returns active sliders sorted by `sort_order`.
  - `GET /api/v1/cms/pages/:slug`: Returns published static page content.
- **Admin (`/api/v1/admin/cms/*`)**:
  - CRUD operations for sliders and static pages.

---

## 15. Dashboard / Reporting Plan

### Operational KPI Metrics (`GET /api/v1/admin/dashboard/stats`):
1. **Total Confirmed Bookings**: All-time and current month.
2. **Total Gross Revenue**: Calculated strictly as integer minor units.
3. **Active Inventory Utilization**: Total capacity vs. booked seats across upcoming 30 days.
4. **Pending Action Items**:
   - Count of `PENDING_APPROVAL` cancellation requests.
   - Count of `PROCESSING` in-flight refund settlements requiring observation.
   - Count of unconfirmed `AWAITING_PAYMENT` holds.
   - Count of unpublished package drafts.

---

## 16. Auditability Plan

### Audit Log Architecture:
- **Table**: `admin_audit_logs`
- **Fields**:
  - `id`: UUID Primary Key.
  - `admin_id`: UUID References `users(id)` ON DELETE RESTRICT.
  - `action`: VARCHAR(64) (e.g. `PACKAGE_PUBLISH`, `CAPACITY_UPDATE`, `CANCELLATION_AUTHORIZE`, `CMS_UPDATE`).
  - `entity_type`: VARCHAR(32) (e.g. `PACKAGE`, `DEPARTURE`, `BOOKING`, `CANCELLATION`, `CMS`).
  - `entity_id`: VARCHAR(64).
  - `previous_state`: JSONB (nullable).
  - `new_state`: JSONB (nullable).
  - `ip_address`: VARCHAR(45) (nullable).
  - `created_at`: TIMESTAMPTZ DEFAULT NOW().
- **Immutable Append-Only**: Updates and deletions on `admin_audit_logs` are strictly disallowed. `[INFERENCE]`

---

## 17. Database Impact Analysis

Phase 7 introduces minimal, non-breaking schema additions via migration `006_create_admin_and_cms_schema.sql`:

```sql
-- 1. Hero Sliders Table
CREATE TABLE IF NOT EXISTS hero_sliders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(128) NOT NULL,
    subtitle VARCHAR(256),
    image_url VARCHAR(512) NOT NULL,
    cta_text VARCHAR(64),
    cta_link VARCHAR(256),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CMS Pages Table
CREATE TABLE IF NOT EXISTS cms_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(128) NOT NULL,
    content_html TEXT NOT NULL,
    meta_description VARCHAR(256),
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at);
```

---

## 18. API Architecture Plan

### New & Existing Admin REST Surface (`/api/v1/admin/*`):

| Method | Endpoint | Actor | Purpose | Idempotent |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard/stats` | ADMIN | Aggregated operational KPI metrics | Yes |
| `GET` | `/api/v1/admin/destinations` | ADMIN | List all destinations (including unpublished) | Yes |
| `POST` | `/api/v1/admin/destinations` | ADMIN | Create destination | No |
| `PATCH` | `/api/v1/admin/destinations/:id` | ADMIN | Update destination details | No |
| `POST` | `/api/v1/admin/destinations/:id/publish` | ADMIN | Publish destination | Yes |
| `POST` | `/api/v1/admin/destinations/:id/unpublish` | ADMIN | Unpublish destination | Yes |
| `GET` | `/api/v1/admin/packages` | ADMIN | List all packages with filters | Yes |
| `POST` | `/api/v1/admin/packages` | ADMIN | Create package draft | No |
| `PATCH` | `/api/v1/admin/packages/:id` | ADMIN | Update package pricing/details | No |
| `PUT` | `/api/v1/admin/packages/:id/itinerary` | ADMIN | Set day-wise itinerary entries | Yes |
| `POST` | `/api/v1/admin/packages/:id/publish` | ADMIN | Validate & publish package | Yes |
| `POST` | `/api/v1/admin/packages/:id/unpublish` | ADMIN | Unpublish package | Yes |
| `GET` | `/api/v1/admin/packages/:id/departures`| ADMIN | List departure calendar dates | Yes |
| `POST` | `/api/v1/admin/packages/:id/departures`| ADMIN | Create departure schedule | No |
| `PATCH`| `/api/v1/admin/departures/:id` | ADMIN | Adjust capacity / update status | No |
| `GET` | `/api/v1/admin/bookings` | ADMIN | List all bookings with search/filters | Yes |
| `GET` | `/api/v1/admin/bookings/:reference` | ADMIN | Inspect complete booking details | Yes |
| `GET` | `/api/v1/admin/departures/:id/manifest`| ADMIN | Generate ground passenger manifest | Yes |
| `GET` | `/api/v1/admin/cancellations` | ADMIN | List cancellation review queue | Yes |
| `POST` | `/api/v1/admin/cancellations/:id/authorize`| ADMIN | Authorize cancellation & refund | Yes |
| `POST` | `/api/v1/admin/cancellations/:id/reject` | ADMIN | Reject cancellation request | Yes |
| `GET` | `/api/v1/admin/cms/sliders` | ADMIN | List and manage hero sliders | Yes |
| `POST` | `/api/v1/admin/cms/sliders` | ADMIN | Create hero slider banner | No |
| `PATCH`| `/api/v1/admin/cms/sliders/:id` | ADMIN | Update slider banner | No |
| `DELETE`| `/api/v1/admin/cms/sliders/:id` | ADMIN | Delete slider banner | Yes |
| `GET` | `/api/v1/admin/cms/pages` | ADMIN | List static CMS pages | Yes |
| `PUT` | `/api/v1/admin/cms/pages/:slug` | ADMIN | Update static page content | Yes |
| `GET` | `/api/v1/admin/audit-logs` | ADMIN | Query audit history | Yes |

---

## 19. Frontend Admin Console Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                  ADMIN CONSOLE FRONTEND ARCHITECTURE                              |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Admin Navbar Badge] ──► [Admin Console Shell Modal / View (#admin-console-view)]                |
|                                   │                                                               |
|         +-------------------------+-------------------------+---------------------+               |
|         │                         │                         │                     │               |
|         ▼                         ▼                         ▼                     ▼               |
|  [Tab: Dashboard]        [Tab: Packages & Cat]     [Tab: Bookings & Man] [Tab: CMS & Content]     |
|  - Real-time KPI Cards   - Destination List/Form   - Searchable Table    - Hero Slider Form       |
|  - Inventory Alerts      - Package Draft Table     - Manifest Viewer     - Static Page Editor     |
|  - Action Required List  - Day-wise Itinerary Grid - Cancellation Queue  - Audit Trail Log        |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Component Structure:
1. **`frontend/src/components/admin/adminConsole.js`**: Core tabbed shell controller; verifies `authStore.getUser()?.role === 'ADMIN'`.
2. **`frontend/src/components/admin/adminDashboardTab.js`**: KPI metrics cards and rapid alerts.
3. **`frontend/src/components/admin/adminPackagesTab.js`**: Package CRUD modal, itinerary editor, and publication completeness checker.
4. **`frontend/src/components/admin/adminInventoryTab.js`**: Departure calendar scheduling and capacity management.
5. **`frontend/src/components/admin/adminBookingsTab.js`**: Searchable booking roster and ground manifest modal.
6. **`frontend/src/components/admin/adminCancellationsTab.js`**: Cancellation review queue with DEC-007 refund calculator breakdown and authorization buttons.
7. **`frontend/src/components/admin/adminCmsTab.js`**: Banner slider manager and static informational page editor.

---

## 20. Security Threat Model

| Threat ID | Threat Description | Attack Vector | Severity | Existing Mitigation | Phase 7 Mitigation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`THR-01`** | **Privilege Escalation** | Customer sends requests to `/api/v1/admin/*` | HIGH | None in frontend | Fastify `fastify.authorize(['ADMIN'])` preHandler hook on all admin endpoints. |
| **`THR-02`** | **Insecure Direct Object References (IDOR)** | Non-admin inspects other users' manifests or bookings | HIGH | Customer routes enforce ownership | Admin routes require verified `ADMIN` role; customer routes strictly isolate by `customer_id`. |
| **`THR-03`** | **Stored XSS via CMS** | Malicious admin or compromised account injects `<script>` into CMS or package description | HIGH | None in raw HTML | Strict HTML entity escaping via `escapeHtml()` and DOMPurify sanitization before rendering dynamic content. |
| **`THR-04`** | **Overbooking via Capacity Reduction** | Admin reduces departure capacity below booked seats + active holds | CRITICAL | Partial | Database transaction checking `capacity >= (booked_seats + held_seats)` under row lock. |
| **`THR-05`** | **Double Refund Execution** | Concurrent clicks on admin refund authorization button | CRITICAL | Phase 6 Idempotency | Frozen deterministic `rfnd_${id}` gateway receipt keys and `PROCESSING`/`SETTLED` state locks. |
| **`THR-06`** | **Audit Log Tampering** | Malicious admin alters audit records to conceal fraudulent actions | MEDIUM | None | Append-only table without update/delete endpoints; database trigger disallowing row mutation. |

---

## 21. Concurrency & Transaction Plan

### Lock Ordering Standards:
To prevent deadlocks during concurrent customer checkouts, hold expiries, and admin capacity updates, all transactions adhere to the canonical lock hierarchy:

$$\mathbf{departure\_schedules\ (FOR\ UPDATE)} \longrightarrow \mathbf{bookings} \longrightarrow \mathbf{inventory\_holds} \longrightarrow \mathbf{payment\_transactions}$$

### Protected Operations:
1. **Departure Capacity Modification**: Locks departure row; validates that `newCapacity >= bookedSeats + activeHeldSeats`.
2. **Package Publication**: Atomic verification of all 8 completeness rules in a single read transaction.
3. **Cancellation Authorization**: Re-verifies under lock that booking is `CONFIRMED` and no concurrent settlement exists.

---

## 22. Error Catalogue Impact

Phase 7 utilizes existing canonical error codes and introduces specific admin domain codes:

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `ACCESS_FORBIDDEN` | 403 | User does not possess the `ADMIN` role. |
| `PACKAGE_PUBLICATION_INVALID` | 400 | Package fails `BR-PKG-001` completeness rules for publication. |
| `INVENTORY_CAPACITY_CONFLICT` | 400 | Requested capacity is lower than existing booked seats + active holds. |
| `DEPARTURE_OPERATION_NOT_ALLOWED` | 400 | Cannot delete or cancel departure with active confirmed bookings. |
| `CMS_CONTENT_INVALID` | 400 | Validation failure on CMS slider or static page fields. |

---

## 23. Observability Plan

1. **Structured Logging**: All administrative actions logged with `adminId`, `action`, `entityType`, `entityId`, and `requestId`.
2. **Sensitive Data Redaction**: Log redaction prevents customer PII, passenger phone numbers, and payment credentials from appearing in debug logs.
3. **Audit Trails**: Critical operations automatically write an immutable row to `admin_audit_logs`.

---

## 24. Test Strategy

```
+---------------------------------------------------------------------------------------------------+
|                                      PHASE 7 TEST STRATEGY                                        |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. UNIT TESTS                                                                                    |
|     - Completeness validation logic (BR-PKG-001)                                                  |
|     - CMS and Slider schemas & sanitization                                                       |
|     - Capacity invariant calculations                                                             |
|                                                                                                   |
|  2. INTEGRATION & RBAC TESTS                                                                      |
|     - Admin routes reject anonymous users (401) and CUSTOMER role (403)                           |
|     - Package CRUD, Itinerary builder, and Publish/Unpublish lifecycle                            |
|     - Departure capacity adjustments and Manifest generation                                      |
|     - CMS Sliders & Static Pages CRUD                                                             |
|     - Audit log persistence verification                                                          |
|                                                                                                   |
|  3. CONCURRENCY & INTEGRATION TESTS                                                               |
|     - Concurrent capacity reduction vs. customer checkout hold                                    |
|     - Concurrent admin cancellation authorizations                                                |
|                                                                                                   |
|  4. FRONTEND COMPONENT & UI TESTS                                                                 |
|     - Admin console shell rendering for ADMIN role only                                           |
|     - Package draft forms, departure date pickers, and booking search filters                      |
|     - XSS sanitization verification on CMS preview                                                |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 25. Implementation Sequence

The implementation of Phase 7 is decomposed into **8 atomic, test-driven steps**:

```
[Step 0: Plan & Architecture] (Current)
           │
           ▼
[Step 1: Admin & CMS Database Schema & Migrations]
           │
           ▼
[Step 2: Shared Admin Contracts & Validation Schemas]
           │
           ▼
[Step 3: Admin CMS & Audit Repositories & Services]
           │
           ▼
[Step 4: Admin REST APIs & RBAC Hardening]
           │
           ▼
[Step 5: Frontend Admin Console Shell & Navigation]
           │
           ▼
[Step 6: Frontend Catalogue & Inventory Operations UI]
           │
           ▼
[Step 7: Frontend Bookings, Manifest & Cancellation UI]
           │
           ▼
[Step 8: Final Cross-Module Hardening, Audit & Phase 7 Freeze]
```

### Detailed Step Breakdown:

- **Step 1: Admin & CMS Database Schema & Migrations**
  - Migration `006_create_admin_and_cms_schema.sql` (`hero_sliders`, `cms_pages`, `admin_audit_logs`).
  - Unit tests for migration and constraints.
- **Step 2: Shared Admin Contracts & Validation Schemas**
  - Zod schemas for CMS sliders, static pages, audit queries, and dashboard stats.
- **Step 3: Admin CMS & Audit Repositories & Services**
  - Data access repositories and domain services for CMS and audit logging.
- **Step 4: Admin REST APIs & RBAC Hardening**
  - `/api/v1/admin/dashboard/stats`, `/api/v1/admin/cms/*`, `/api/v1/admin/audit-logs`, and public `/api/v1/cms/*` endpoints.
- **Step 5: Frontend Admin Console Shell & Navigation**
  - Navbar Admin link, Admin Console tabbed shell, and Dashboard KPI view.
- **Step 6: Frontend Catalogue & Inventory Operations UI**
  - Destination/Theme manager, Package editor modal, Itinerary builder, and Departure schedule calendar.
- **Step 7: Frontend Bookings, Manifest & Cancellation UI**
  - Searchable booking queue, Ground passenger manifest viewer, and Cancellation review queue.
- **Step 8: Final Cross-Module Hardening, Audit & Phase 7 Freeze**
  - Full end-to-end audit, security penetration checks, quality gates, and final freeze report.

---

## 26. Dependency Graph

```
Phase 0–6 Frozen System
         │
         ▼
Step 0: Phase 7 Plan
         │
         ▼
Step 1: Schema & Migrations (hero_sliders, cms_pages, audit_logs)
         │
         ▼
Step 2: Shared Contracts (Zod Schemas, DTOs)
         │
         ▼
Step 3: Repositories & Services (CMS, Audit, Dashboard)
         │
         ▼
Step 4: Admin REST APIs (Fastify Routes, RBAC Guards)
         │
         ▼
Step 5: Frontend Shell & Dashboard (Admin Navigation, KPI Cards)
         │
         ▼
Step 6: Frontend Catalogue & Inventory UI (Package Editor, Departures)
         │
         ▼
Step 7: Frontend Operations UI (Bookings, Manifest, Cancellations)
         │
         ▼
Step 8: Final Hardening, Quality Gates & Phase 7 Freeze
```

---

## 27. Requirement Traceability Matrix

| Business Goal | Requirement ID | Actor | Domain Area | API Endpoint | Database Table | Frontend Screen | Test Case |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Catalog Management** | `FR-ADM-003/4/5/6` | ADMIN | Catalogue Ops | `/api/v1/admin/packages` | `tour_packages`, `itineraries` | Package Editor Modal | `catalogue.routes.test.ts` |
| **Inventory Control** | `FR-ADM-007` | ADMIN | Inventory Ops | `/api/v1/admin/departures` | `departure_schedules` | Departure Calendar UI | `searchAndInventory.routes.test.ts` |
| **Booking Visibility** | `FR-ADM-008` | ADMIN | Booking Ops | `/api/v1/admin/bookings` | `bookings`, `passengers` | Admin Bookings Roster | `adminBooking.routes.test.ts` |
| **Ground Operations** | `FR-ADM-009` | ADMIN | Manifest Ops | `/api/v1/admin/departures/:id/manifest` | `passengers`, `bookings` | Manifest Export Viewer | `adminBooking.routes.test.ts` |
| **Refund Approvals** | `FR-ADM-010` | ADMIN | Cancellation Ops | `/api/v1/admin/cancellations` | `cancellation_requests` | Cancellation Queue Card | `cancellation.routes.test.ts` |
| **Marketing Banners** | `FR-ADM-011` | ADMIN | CMS | `/api/v1/admin/cms/sliders` | `hero_sliders` | Slider Manager Form | `cms.routes.test.ts` |
| **Static Content** | `FR-ADM-012` | ADMIN | CMS | `/api/v1/admin/cms/pages` | `cms_pages` | Static Page Editor | `cms.routes.test.ts` |
| **Audit Compliance** | `FR-ADM-013` | ADMIN | Audit | `/api/v1/admin/audit-logs` | `admin_audit_logs` | Audit Trail Table | `audit.service.test.ts` |
| **Operations Metrics** | `FR-ADM-002` | ADMIN | Dashboard | `/api/v1/admin/dashboard/stats` | Aggregated Views | Dashboard KPI View | `dashboard.routes.test.ts` |

---

## 28. Non-Goals (Explicitly Out of Scope)

The following features remain strictly **DEFERRED** and will not be implemented in Phase 7:
1. ❌ **Dedicated Travel Agent Portal**: Agent lead assignments and agent login workspaces (Deferred to Phase 2 roadmap). `[DOCUMENTED]`
2. ❌ **Live GDS Flight Ticketing Feeds**: Live Amadeus/Sabre/Skyscanner flight booking (Deferred to Phase 3 roadmap). `[DOCUMENTED]`
3. ❌ **Native Mobile Applications**: iOS & Android native apps (Deferred to Phase 3 roadmap). `[DOCUMENTED]`
4. ❌ **AI Chatbots & Recommendation Engines**: Machine learning itinerary matching (Deferred to Phase 3 roadmap). `[DOCUMENTED]`
5. ❌ **Multi-Vendor Marketplace & Escrow**: Vendor storefronts and automated split payouts (Strictly Out of Scope). `[DOCUMENTED]`
6. ❌ **Cryptocurrency & Web3 Payments**: Digital payments restricted to standard fiat rails. `[DOCUMENTED]`
7. ❌ **Customer Testimonials & Review Submission**: Review submission and moderation deferred to Phase 8. `[DOCUMENTED]`

---

## 29. Open Questions / UNKNOWN Items

1. **Static Media Uploads for Hero Sliders**: Should hero slider images use the existing S3/local storage upload abstraction or allow external image URL links?  
   - *Resolution*: Support both standard image URLs and direct S3 uploads via storage service. `[DECISION]`
2. **Audit Log Retention Period**: How long should administrative audit logs be retained?  
   - *Resolution*: Follow standard statutory compliance (7-year retention matching financial tax invoices). `[DECISION]`
3. **Automated Notification Dispatch**: Should admin actions trigger real-time Email/SMS notifications to customers?  
   - *Resolution*: Real-time transactional email infrastructure belongs to Phase 8 Notifications. Admin operations will record status in PostgreSQL for customer dashboard visibility. `[DECISION]`

---

## 30. Acceptance Criteria for Step 0

- [x] All authoritative Phase 7 requirements discovered and classified.
- [x] Existing Admin capabilities and backend routes thoroughly audited.
- [x] Existing RBAC and authorization guards analyzed.
- [x] Phase 7 domain boundaries established.
- [x] Package, Departure, Booking, Manifest, Cancellation, and CMS operations documented.
- [x] Database impact analysis completed without modifying production schemas.
- [x] API architecture and route definitions mapped.
- [x] Frontend Admin Console architecture structured.
- [x] Security threat model and concurrency invariants documented.
- [x] 8-step implementation sequence and dependency graph defined.
- [x] Traceability matrix and non-goals explicitly outlined.
- [x] Zero production code modified; planning document completed.

---

## 31. Proposed Next Step

**Phase 7 — Step 1: Admin & CMS Database Schema & Migrations**
- Create and execute migration `006_create_admin_and_cms_schema.sql` for `hero_sliders`, `cms_pages`, and `admin_audit_logs`.
- Implement unit tests for database schema constraints, foreign keys, and indexes.

---
_End of Phase 7 Step 0 Implementation Plan._
