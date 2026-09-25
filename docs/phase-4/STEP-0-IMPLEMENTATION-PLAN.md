# PHASE 4 — STEP 0: SEARCH, FILTERS & AVAILABILITY
## DISCOVERY, REQUIREMENTS MAPPING & IMPLEMENTATION PLAN

**Project:** Travel-Web / Young Tours & Travels  
**Module:** Search Engine, Dynamic Filters, Departure Scheduling & Inventory Availability  
**Document Status:** Canonical Engineering Architecture & Implementation Plan  
**Upstream Frozen Baselines:**  
- Phase 0: Requirements Specification (`DOC-REQ-SPEC-0.3`), System Architecture (`DOC-ARCH-0.4.2`), Data Architecture (`DOC-ARCH-0.4.6`)  
- Phase 1: Foundation Baseline (`PHASE_1_FINAL_REVIEW.md`)  
- Phase 2: Authentication & RBAC (`docs/phase-2/README.md`)  
- Phase 3: Destinations & Package Catalogue (`docs/phase-3/PHASE-3-FINAL-INTEGRATION-AUDIT.md` — Commit `df3dd7d`)  

---

## 1. Executive Summary

Phase 4 bridges the static/browsing catalogue established in Phase 3 with the operational booking engine to be built in Phase 5. It empowers customers to discover travel packages using full-text and multi-criteria filters, evaluate real-time departure calendar schedules, and inspect remaining seat capacities without concurrency race conditions or overbooking risks.

This document establishes the implementation blueprint for Phase 4 without introducing application code, migrations, or database changes in Step 0.

$$\text{Storefront Keyword / Multi-Criteria Search} \longrightarrow \text{Filtered Package Cards} \longrightarrow \text{Calendar Departure Discovery} \longrightarrow \text{Real-time Remaining Capacity Gate}$$

---

## 2. Current Architecture Baseline

The platform operates on a Modular Monolith architecture with an asynchronous worker:
- **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript (No SPA framework, lightweight custom DOM components, XSS sanitization via `escapeHtml()`).
- **Backend:** Node.js, TypeScript, Fastify 5.x.
- **Database:** PostgreSQL 15+ (Authoritative persistence, connection pool, transactional rollback, strict foreign keys).
- **Cache / Async:** Redis + BullMQ (Background worker jobs, TTL expiry).
- **Security & Identity:** RS256 JWT access tokens, HttpOnly refresh cookies, Argon2id passwords, Role-Based Access Control (`GUEST`, `CUSTOMER`, `ADMIN`).
- **Monetary Convention:** Strict integer minor units (`BIGINT` paise for INR, cents for USD), zero floating-point math.
- **API Error Contract:**
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "User-facing message",
      "details": []
    },
    "meta": {
      "timestamp": "2026-09-25T18:40:00.000Z",
      "requestId": "req-xxx"
    }
  }
  ```

---

## 3. Phase 0 Requirement References

The authoritative requirements from `docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md` relevant to Phase 4:

| Requirement ID | Requirement Statement | Priority | Phase 4 Responsibility | Evidence Source |
|---|---|---|---|---|
| **FR-SEARCH-001** | The system shall allow users to search packages by destination keyword or package title. | MUST | Tokenized & partial matching search on title, summary, city, and country. | `[DOCUMENTATION]` Synopsis L38, `frontend/index.html:37-40` |
| **FR-SEARCH-002** | The system shall allow users to filter search results by Destination City, Travel Theme, Duration range, and Maximum Budget. | MUST | Parameterized multi-criteria filter composition in SQL with indexed queries. | `[DOCUMENTATION]` Synopsis L38-39 |
| **FR-SEARCH-003** | The system shall display a helpful empty state with reset suggestions when search criteria yield zero records. | MUST | Empty-state UI container with "Reset Filters" action. | `[INFERENCE]` UX standard |
| **FR-SEARCH-004** | The system shall support sorting search results by Price and Duration. | SHOULD | Safe allowlist-based sorting (`price_asc`, `price_desc`, `duration_asc`, `duration_desc`, `newest`, `featured`). | `[INFERENCE]` Sorting standard |
| **FR-INVENT-001** | The system shall maintain departure schedules for packages, associating specific calendar Departure Dates with a Total Seat Capacity and Booked Seat Count. | MUST | `departure_schedules` relational table with date range, capacity, and status. | `[DOCUMENTATION]` Document §1.3, §1.4 |
| **FR-INVENT-002** | The system shall dynamically calculate Remaining Seat Capacity based on total capacity, confirmed bookings, and active temporary holds (`BR-INVENT-001`). | MUST | Deterministic capacity calculation query and availability status derivation. | `[INFERENCE]` BR-INVENT-001 |
| **FR-INVENT-003** | The system shall prevent customers from initiating a booking for departure dates where Remaining Seat Capacity is less than the requested party size. | MUST | Availability inspection endpoint and capacity verification gate. | `[DOCUMENTATION]` Document L149 |
| **FR-INVENT-004** | The system shall place a temporary hold on requested seats for the configured checkout window duration when customer initiates checkout. | MUST | Design data model & holds ledger in Phase 4; execute in Phase 5. | `[PHASE-0.2]` Section 15 |
| **FR-INVENT-005** | The system shall automatically release temporary seat holds back to available inventory if checkout payment is not verified within window. | MUST | TTL expiry & cleanup design in Phase 4; execute in Phase 5. | `[PHASE-0.2]` Section 15 |
| **FR-ADMIN-004** | The system shall allow administrators to manage departure dates, update seat capacities, and view passenger manifests per departure. | MUST | Admin CRUD REST endpoints for departure dates and capacity management under RBAC. | `[DOCUMENTATION]` Synopsis L24, Document §6 |
| **FR-CONFIG-001** | The system shall allow customers on the package booking page to select a Departure Date. | MUST | Public departure list API and departure selection UI in detail modal. | `[DOCUMENTATION]` Synopsis L39-40 |
| **NFR-PERF-002** | **Search Query Latency:** Package search and filter query shall return matching results in less than 500 milliseconds across a catalog of up to 10,000 packages. | MUST | PostgreSQL composite B-tree & GIN/Trigram indexes, pagination offset/limit. | `[DOCUMENTATION]` Synopsis L12 |
| **NFR-REL-001** | **Zero Double-Bookings:** Atomic seat allocation to ensure concurrent attempts cannot exceed inventory. | MUST | Pessimistic row-level locking (`SELECT ... FOR UPDATE`) design. | `[DOCUMENTATION]` Core NFR |
| **DR-006** | **Departure Schedule:** Schedule ID, Package Reference, Departure Date, Return Date, Total Seat Capacity, Booked Seats, Status. | MUST | Relational table specification. | `[DOCUMENTATION]` Data Architecture §4.6 |

---

## 4. Phase 3 Integration Baseline

Phase 4 builds directly on top of the frozen Phase 3 catalogue entities:
- `destinations` table (`id`, `slug`, `city_name`, `country`, `is_published`, `is_featured`)
- `themes` table (`id`, `slug`, `title`)
- `tour_packages` table (`id`, `destination_id`, `theme_id`, `slug`, `title`, `duration_days`, `duration_nights`, `base_adult_price`, `currency`, `is_published`, `is_featured`)
- `itinerary_days` table (`id`, `package_id`, `day_number`, `title`, `activity_description`)
- `CataloguePublicationService` (BR-PKG-001 invariant: only published packages with published destinations are publicly searchable).

---

## 5. Phase 4 Business Objective & Scope

### In-Scope:
1. **Full-Text & Keyword Search:** Search by package title, short description, destination city, and destination country using PostgreSQL text search / trigram indexing.
2. **Multi-Criteria Filter Engine:** Filtering by destination slug/city, theme slug, duration min/max days, price min/max (minor units), currency (`INR`/`USD`), featured flag, and departure date range.
3. **Safe Sorting:** Allowlist sorting with deterministic secondary tie-breaker (`created_at DESC`, `id ASC`).
4. **Departure Scheduling Engine:** Relational `departure_schedules` table linking packages to specific travel dates, return dates, total seat capacities, and status (`OPEN`, `CLOSED`, `SOLD_OUT`, `CANCELLED`).
5. **Real-Time Availability Calculation:** Accurate computation of remaining seat capacity ($C_{\text{remaining}} = C_{\text{total}} - S_{\text{booked}} - S_{\text{held}}$).
6. **Public Departure Discovery APIs:** Endpoints to list available departure calendar dates for a package and inspect specific departure capacity.
7. **Admin Departure Management APIs:** Admin endpoints to create, update, close, cancel, and reopen departure dates with seat capacity controls.
8. **Frontend Search & Availability UI:** Hero search bar integration, multi-filter drawer/sidebar, sort dropdown, package availability badge, and calendar departure selector inside package detail view.

---

## 6. Non-Goals (Strict Phase Boundaries)

The following items are **NOT** part of Phase 4:
- ❌ **Booking State Machine & Checkout Creation:** Belong to Phase 5.
- ❌ **Payment Gateway Integration & Webhooks:** Belong to Phase 6.
- ❌ **Invoicing & PDF E-Ticket Generation:** Belong to Phase 6.
- ❌ **Customer "My Bookings" Dashboard:** Belong to Phase 5.
- ❌ **Cancellations & Refund Queues:** Belong to Phase 5 & 6.
- ❌ **Verified Reviews & Star Ratings:** Belong to Phase 7 / Future.
- ❌ **Live Airline GDS Integration / External PNRs:** Out of project scope.
- ❌ **Elasticsearch / Solr / OpenSearch:** Prohibited by engineering constraints; PostgreSQL is authoritative.

---

## 7. Search Architecture Design

### 7.1 Search Target Fields
Search queries (`q` parameter) must evaluate:
- `tour_packages.title`
- `tour_packages.short_description`
- `destinations.city_name`
- `destinations.country`

### 7.2 Matching Strategy
- Use PostgreSQL native capabilities:
  - `to_tsvector('simple', ...)` and `plainto_tsquery('simple', ...)` for multi-word token search.
  - Case-insensitive `ILIKE` / `pg_trgm` similarity for substring and partial match resilience.
- Search term normalization: trimmed, stripped of SQL special characters (`%`, `_`), min 2 characters.
- Query performance: Accelerated via GIN index on `to_tsvector('simple', title || ' ' || short_description)` and joined destination fields.

---

## 8. Filter Architecture Design

### 8.1 Supported Filters

| Filter Parameter | Input Type | Validation Rule | SQL Predicate Strategy | Default Behavior |
|---|---|---|---|---|
| `q` | `string` | Min 2, max 100 chars, sanitized | `tsvector @@ plainto_tsquery` OR `ILIKE` | Ignored if empty |
| `destinationSlug` | `string` | Alphanumeric kebab-case | `destinations.slug = $1` | All destinations |
| `themeSlug` | `string` | Alphanumeric kebab-case | `themes.slug = $1` | All themes |
| `minPrice` | `integer` | Minor units >= 0 | `tour_packages.base_adult_price >= $1` | No lower bound |
| `maxPrice` | `integer` | Minor units > 0, >= minPrice | `tour_packages.base_adult_price <= $1` | No upper bound |
| `currency` | `enum` | `'INR' \| 'USD'` | `tour_packages.currency = $1` | `'INR'` default or all |
| `minDuration` | `integer` | Days >= 1 | `tour_packages.duration_days >= $1` | No min days |
| `maxDuration` | `integer` | Days >= minDuration | `tour_packages.duration_days <= $1` | No max days |
| `isFeatured` | `boolean` | `true \| false` | `tour_packages.is_featured = $1` | All packages |
| `departureFrom` | `string (ISO Date)`| `YYYY-MM-DD` | Exists departure with `departure_date >= $1` | All future dates |
| `departureTo` | `string (ISO Date)`| `YYYY-MM-DD` | Exists departure with `departure_date <= $1` | All future dates |
| `hasAvailability`| `boolean` | `true \| false` | Exists departure with remaining seats > 0 | All statuses |

### 8.2 Combination Semantics
All active filters are combined using **Boolean `AND`** logic. If zero filters are provided, all published packages are returned with pagination.

---

## 9. Sorting Strategy

### 9.1 Allowlisted Sort Keys

| Sort Key Parameter | Primary SQL ORDER BY Clause | Secondary Deterministic Tie-Breaker |
|---|---|---|
| `price_asc` | `p.base_adult_price ASC` | `p.id ASC` |
| `price_desc` | `p.base_adult_price DESC` | `p.id ASC` |
| `duration_asc` | `p.duration_days ASC` | `p.id ASC` |
| `duration_desc` | `p.duration_days DESC` | `p.id ASC` |
| `newest` | `p.created_at DESC` | `p.id ASC` |
| `featured` (Default)| `p.is_featured DESC, p.created_at DESC` | `p.id ASC` |

### 9.2 Security Rule
User-supplied sort values are validated strictly against an allowlist enum in Zod (`SearchQuerySchema`). Unrecognized sort parameters are rejected with `400 VALIDATION_ERROR` or fallback to `featured`. Raw strings are never interpolated into SQL `ORDER BY`.

---

## 10. Pagination Strategy

Reuses Phase 3 canonical pagination contract:
- `page` (default 1, minimum 1)
- `limit` (default 12, minimum 1, maximum 50)
- `offset = (page - 1) * limit`
- Response contains pagination metadata:
  ```json
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 48,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPrevPage": false
  }
  ```

---

## 11. Departure Schedule & Inventory Model

### 11.1 Departure Entity
Each departure represents a concrete operational date for a tour package:
- `id` (UUIDv4)
- `package_id` (UUIDv4, Foreign Key referencing `tour_packages(id)` `ON DELETE CASCADE`)
- `departure_date` (`DATE`, e.g., `2026-11-15`)
- `return_date` (`DATE`, calculated as `departure_date + duration_days`)
- `total_seat_capacity` (`INTEGER`, strictly > 0, e.g., 20 seats)
- `booked_seats` (`INTEGER`, default 0, strictly >= 0, <= total_seat_capacity)
- `price_override_adult` (`BIGINT`, optional minor units; if null, uses package `base_adult_price`)
- `price_override_child` (`BIGINT`, optional minor units; if null, uses package `base_child_price`)
- `status` (`ENUM`: `'OPEN'`, `'CLOSED'`, `'SOLD_OUT'`, `'CANCELLED'`)
- `created_at`, `updated_at`

### 11.2 Invariants
1. `departure_date >= CURRENT_DATE` on creation.
2. `return_date >= departure_date`.
3. `total_seat_capacity >= 1`.
4. `booked_seats <= total_seat_capacity`.
5. Unique constraint: `UNIQUE (package_id, departure_date)` (prevents duplicate departure slots on same date for same package).

---

## 12. Availability Model & Calculation

### 12.1 Mathematical Formulation
For any given departure $d$:
$$S_{\text{available}} = C_{\text{total}} - (S_{\text{booked}} + S_{\text{held}})$$

Where:
- $C_{\text{total}}$: `departure_schedules.total_seat_capacity`
- $S_{\text{booked}}$: `departure_schedules.booked_seats` (confirmed bookings)
- $S_{\text{held}}$: Active unexpired temporary holds (from `inventory_holds` ledger where `status = 'ACTIVE'` and `expires_at > NOW()`)

### 12.2 Availability Status Taxonomy
- `AVAILABLE`: $S_{\text{available}} \ge 5$ seats remaining.
- `LIMITED`: $1 \le S_{\text{available}} < 5$ seats remaining (triggers "Only X seats left!" UI badge).
- `SOLD_OUT`: $S_{\text{available}} \le 0$ or status is `'SOLD_OUT'`.
- `CLOSED`: Admin closed departure for operational reasons.
- `CANCELLED`: Departure cancelled.

---

## 13. Inventory Authority & Concurrency Strategy

1. **PostgreSQL as Single Source of Truth:** Inventory is strictly managed inside PostgreSQL ACID transactions. Redis is not authoritative.
2. **Pessimistic Row-Level Locking:** During capacity modification or reservation, the database executes:
   ```sql
   SELECT id, total_seat_capacity, booked_seats, status
   FROM departure_schedules
   WHERE id = $1
   FOR UPDATE;
   ```
3. **No Overbooking Guarantee (`NFR-REL-001`):** Row-level lock guarantees that concurrent requests serialize at the database level, preventing race conditions.

---

## 14. Temporary Hold Boundary (Phase 4 vs Phase 5)

- **Phase 4 Role:**
  - Create `inventory_holds` schema definition and relational table.
  - Include unexpired active holds in availability queries ($S_{\text{available}}$ calculation).
  - Provide departure inspection API showing accurate remaining capacity.
- **Phase 5 Role:**
  - Create the 15-minute checkout session token and insert the active hold row when checkout starts (`FR-INVENT-004`).
  - Schedule Redis/BullMQ delayed job for 15-minute expiration (`FR-INVENT-005`).
  - Transition hold to `COMMITTED` upon successful payment verification.

---

## 15. Proposed Database Schema Changes (Step 1 Migration Plan)

```sql
-- Migration: 003_create_departures_and_inventory_schema.sql

-- 1. Departure Status Enum
DO $$ BEGIN
    CREATE TYPE departure_status AS ENUM ('OPEN', 'CLOSED', 'SOLD_OUT', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Inventory Hold Status Enum
DO $$ BEGIN
    CREATE TYPE inventory_hold_status AS ENUM ('ACTIVE', 'COMMITTED', 'EXPIRED', 'RELEASED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Departure Schedules Table (DR-006)
CREATE TABLE IF NOT EXISTS departure_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
    departure_date DATE NOT NULL,
    return_date DATE NOT NULL,
    total_seat_capacity INTEGER NOT NULL CHECK (total_seat_capacity > 0),
    booked_seats INTEGER NOT NULL DEFAULT 0 CHECK (booked_seats >= 0),
    price_override_adult BIGINT CHECK (price_override_adult IS NULL OR price_override_adult >= 0),
    price_override_child BIGINT CHECK (price_override_child IS NULL OR price_override_child >= 0),
    status departure_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_departure_dates CHECK (return_date >= departure_date),
    CONSTRAINT chk_capacity_bounds CHECK (booked_seats <= total_seat_capacity),
    UNIQUE (package_id, departure_date)
);

-- 4. Inventory Holds Table (Temporary Checkout Locks)
CREATE TABLE IF NOT EXISTS inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    departure_id UUID NOT NULL REFERENCES departure_schedules(id) ON DELETE CASCADE,
    checkout_session_token VARCHAR(100) UNIQUE NOT NULL,
    reserved_seats INTEGER NOT NULL CHECK (reserved_seats > 0),
    status inventory_hold_status NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Performance & Search Indexes
CREATE INDEX IF NOT EXISTS idx_departures_package_date ON departure_schedules (package_id, departure_date);
CREATE INDEX IF NOT EXISTS idx_departures_status_date ON departure_schedules (status, departure_date);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_active ON inventory_holds (departure_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_packages_search_price ON tour_packages (base_adult_price);
CREATE INDEX IF NOT EXISTS idx_packages_search_duration ON tour_packages (duration_days);
CREATE INDEX IF NOT EXISTS idx_packages_title_trgm ON tour_packages USING gin (title gin_trgm_ops);
```

---

## 16. Shared Contracts & Validation Schemas (Step 2 Plan)

### Proposed DTOs (`shared/src/types/catalogue.ts` / `shared/src/types/inventory.ts`):
- `DepartureDto`
- `DepartureCardDto`
- `DepartureAvailabilityDto`
- `PackageSearchQueryDto`
- `PackageSearchResultDto`
- `CreateDepartureDto`
- `UpdateDepartureDto`

### Proposed Zod Schemas (`shared/src/schemas/inventory.schema.ts`):
- `PackageSearchQuerySchema`
- `CreateDepartureSchema`
- `UpdateDepartureSchema`
- `DepartureAvailabilityQuerySchema`

---

## 17. Repositories & Domain Services Plan (Steps 3 & 4)

### Repositories:
1. `DepartureRepository`:
   - `findById(id)`
   - `findByPackageId(packageId, options)`
   - `listAvailable(packageId, fromDate, toDate)`
   - `create(data)`
   - `update(id, data)`
   - `delete(id)`
   - `findForUpdate(id, client)` (Pessimistic lock)
2. `InventoryHoldRepository`:
   - `getActiveHoldsForDeparture(departureId, client)`
   - `createHold(data, client)`
   - `releaseHold(holdId, client)`
3. `TourPackageSearchRepository`:
   - `searchPackages(criteria, pagination, sorting)` (Complex dynamic SQL query builder)

### Domain Services:
1. `PackageSearchService`: Multi-criteria search orchestration, facet counts, sort validation.
2. `DepartureService`: Departure scheduling, capacity management, status transitions.
3. `AvailabilityService`: Dynamic remaining seat calculation, hold aggregation, validation gates (`validatePartyAvailability`).

---

## 18. REST API Design (Step 5 Plan)

### Public Endpoints:
1. `GET /api/v1/packages/search` — Search & filter packages with pagination and sorting.
2. `GET /api/v1/packages/:slug/departures` — List all upcoming open departures for a package.
3. `GET /api/v1/departures/:id/availability` — Inspect remaining seat count and pricing for a specific departure.

### Admin Endpoints (`role === 'ADMIN'`):
1. `GET /api/v1/admin/packages/:packageId/departures` — List all departures (including closed/past) for a package.
2. `POST /api/v1/admin/packages/:packageId/departures` — Schedule new departure date with seat capacity.
3. `PATCH /api/v1/admin/departures/:id` — Update seat capacity, price overrides, or status (`OPEN`/`CLOSED`/`CANCELLED`).
4. `DELETE /api/v1/admin/departures/:id` — Delete departure (blocked if bookings exist).

---

## 19. Frontend Search & Availability UI Plan (Step 6)

1. **Hero Search Bar:** Connect keyword search input on homepage to `/packages/search` query.
2. **Filter Drawer & Bar:**
   - Destination selector dropdown / theme pills.
   - Price range slider / min-max inputs.
   - Duration chips (e.g. 1-3 days, 4-7 days, 8+ days).
   - "Clear All Filters" button.
3. **Sort Control:** Dropdown for Price (Low-High, High-Low), Duration, and Featured.
4. **Departure Calendar Selector:** Inside `PackageDetailModal`, render interactive departure date selector showing date, price, and availability chip (`Available`, `5 seats left`, `Sold Out`).
5. **Loading & Empty States:** Shimmer cards during search; user-friendly empty results with "Reset Filters" suggestion.

---

## 20. Redis / BullMQ Role in Phase 4

- **Redis:**
  - Phase 4: Ready for optional caching of hot search queries if query volume demands it.
  - Phase 5: TTL keys for 15-minute checkout sessions.
- **BullMQ:**
  - Phase 4: Smoke queue active.
  - Phase 5: Scheduled delayed jobs for hold expiration cleanup (`releaseExpiredHoldsQueue`).

---

## 21. Security Threat Model & Mitigations

| Threat | Attack Surface | Mitigation Strategy | Phase Owner |
|---|---|---|---|
| **SQL Injection** | Search keyword & filter params | Parameterized SQL queries `$1, $2`, Zod string sanitization | Phase 4 Step 3/5 |
| **SQL Injection via Sort** | `sortBy` parameter | Strict allowlist mapping; never interpolate identifiers | Phase 4 Step 3 |
| **Overbooking Race Condition** | Concurrent checkout requests | Pessimistic locking `SELECT ... FOR UPDATE` + atomic transaction | Phase 4 & Phase 5 |
| **Negative Inventory Injection** | Departure capacity inputs | PostgreSQL `CHECK (total_seat_capacity > 0)` + Zod positive int | Phase 4 Step 1/2 |
| **IDOR on Departure Admin** | Admin departure endpoints | JWT RS256 Authentication + Fastify `ADMIN` RBAC guard | Phase 4 Step 5 |
| **Unpublished Package Leak** | Search results query | Join `tour_packages.is_published = true AND destinations.is_published = true` | Phase 4 Step 3/4 |
| **Stale Availability Cache** | Cached remaining seats | Compute availability dynamically from database; short TTL if cached | Phase 4 Step 4 |

---

## 22. Performance & Scaling Plan

- **NFR-PERF-002 Requirement:** Query latency `< 500ms` at 10,000 packages.
- **Database Index Strategy:**
  - Composite B-Tree index on `(is_published, base_adult_price)`
  - Composite B-Tree index on `(package_id, departure_date)`
  - GIN / Trigram index on `title` and `short_description`
- **Query Optimization:** Count queries executed in single round-trip using `COUNT(*) OVER()` window function to avoid double table scans.

---

## 23. Test Strategy & Quality Assurance

- **Unit Tests:** Filter schema validation, sort allowlists, price range boundaries, availability math formulas.
- **Repository Tests:** Dynamic SQL filter query builder, departure date range queries, pessimistic lock execution.
- **Service Tests:** Search service business rules, publication gate enforcement on search, departure creation invariants.
- **API Tests:** Public search routes, departure routes, admin RBAC guards, 400 validation error responses, canonical envelope checks.
- **Concurrency & Stress Tests:** Simulated concurrent requests against same departure checking remaining capacity consistency.
- **Frontend Tests:** Filter state reducer, search input debounce, departure selector rendering, empty states.

---

## 24. Traceability Matrix

| Requirement ID | Business Rule | Entity / Table | Service / API Component | Test Target |
|---|---|---|---|---|
| `FR-SEARCH-001` | BR-SEARCH-001 | `tour_packages`, `destinations` | `PackageSearchService` / `GET /api/v1/packages/search` | Search query matching tests |
| `FR-SEARCH-002` | BR-SEARCH-002 | `tour_packages`, `themes` | `TourPackageSearchRepository` / `GET /api/v1/packages/search` | Multi-filter combinatorics tests |
| `FR-SEARCH-003` | BR-SEARCH-003 | Frontend UI | `CatalogueSection` UI component | Zero-result empty state tests |
| `FR-SEARCH-004` | BR-SEARCH-004 | `tour_packages` | Allowlist sort mapper / `GET /api/v1/packages/search` | Sorting order tests |
| `FR-INVENT-001` | BR-INVENT-001 | `departure_schedules` | `DepartureService` / `POST /api/v1/admin/packages/:id/departures` | Departure scheduling tests |
| `FR-INVENT-002` | BR-INVENT-002 | `departure_schedules`, `inventory_holds` | `AvailabilityService` / `GET /api/v1/departures/:id/availability` | Capacity computation tests |
| `FR-INVENT-003` | BR-INVENT-003 | `departure_schedules` | `AvailabilityService.validatePartyAvailability` | Party size rejection tests |
| `FR-ADMIN-004` | BR-ADMIN-001 | `departure_schedules` | `AdminDepartureController` / `/api/v1/admin/departures/*` | Admin RBAC & CRUD tests |

---

## 25. Risk Register

| Risk ID | Risk Description | Probability | Impact | Mitigation Strategy | Phase Owner |
|---|---|---|---|---|---|
| **RSK-4-001** | Slow search response on large catalogs | Low | Medium | GIN indexes + Window function count queries + Pagination limits | Phase 4 Step 1/3 |
| **RSK-4-002** | Double booking under high concurrency | Medium | Critical | Pessimistic locking `SELECT FOR UPDATE` inside atomic transactions | Phase 4 & Phase 5 |
| **RSK-4-003** | Unpublished package visible via departure API | Low | High | Enforce package publication check in `DepartureService` | Phase 4 Step 4/5 |
| **RSK-4-004** | Timezone mismatches on departure dates | Medium | Medium | Store dates strictly as `DATE` (`YYYY-MM-DD`) without UTC offset drift | Phase 4 Step 1/2 |

---

## 26. Decision Register

| Decision ID | Question / Problem | Decision | Rationale | Affected Layers |
|---|---|---|---|---|
| **DEC-4-001** | Search Engine Implementation | PostgreSQL native TSVector + Trigram GIN indexes | Meets <500ms NFR without heavy external infrastructure dependencies | DB, Repository |
| **DEC-4-002** | Departure Date Storage Format | SQL `DATE` (`YYYY-MM-DD`) | Departures are full-day events; avoids timezone skew between server and customer | DB, Schemas, DTOs |
| **DEC-4-003** | Inventory Authority | PostgreSQL ACID transactional lock | Guaranteed zero overbooking (`NFR-REL-001`); Redis is non-authoritative | DB, Service |
| **DEC-4-004** | Temporary Hold Execution Boundary | Designed in Phase 4, executed in Phase 5 | Keeps Phase 4 focused on discovery/availability while preparing clean data structures for booking | DB, Service |

---

## 27. Proposed Phase 4 Implementation Sequence

1. **Step 0:** Discovery, Requirements Mapping & Implementation Plan (**Current Step**)
2. **Step 1:** Database Migrations (`003_create_departures_and_inventory_schema.sql`)
3. **Step 2:** Shared Contracts, DTOs & Zod Validation Schemas
4. **Step 3:** Repositories (`DepartureRepository`, `TourPackageSearchRepository`, `InventoryHoldRepository`)
5. **Step 4:** Domain Services & Availability Business Rules (`PackageSearchService`, `DepartureService`, `AvailabilityService`)
6. **Step 5:** Fastify REST APIs (Public Search & Departures + Admin Departure CRUD with RBAC)
7. **Step 6:** Frontend Search, Filter Bar, Sort Dropdown & Departure Calendar Selector UI
8. **Step 7:** Deterministic Seed Data for Departures & Cross-Layer Concurrency Verification
9. **Step 8:** Final Integration Audit & Phase 4 Freeze

---

## 28. Acceptance Criteria

- [x] Phase 0 search and filter requirements identified (`FR-SEARCH-001` through `FR-SEARCH-004`).
- [x] Phase 0 availability and departure requirements identified (`FR-INVENT-001` through `FR-INVENT-005`, `FR-ADMIN-004`).
- [x] Search matching and multi-filter combination strategy defined.
- [x] Safe allowlist sorting strategy defined.
- [x] Departure schedule relational schema and status enums defined.
- [x] Real-time remaining seat capacity formula specified ($S_{\text{available}} = C_{\text{total}} - S_{\text{booked}} - S_{\text{held}}$).
- [x] Inventory authority confirmed as PostgreSQL ACID row-locked transactions.
- [x] Phase 4 vs Phase 5 temporary hold boundary explicitly established.
- [x] Security threat model and mitigation controls documented.
- [x] Traceability matrix, risk register, and decision register created.
- [x] Zero application implementation code or migrations created in Step 0.

---

## 29. Phase 4 Step 0 Exit Criteria

Step 0 is complete. No implementation code has been written. All requirements, schemas, DTOs, APIs, and UI integrations are planned and ready for execution starting in Step 1.
