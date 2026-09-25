# PHASE 4 — STEP 0: SEARCH, FILTERS & AVAILABILITY
## DISCOVERY, REQUIREMENTS RECONCILIATION & IMPLEMENTATION PLAN

**Project:** Travel-Web / Young Tours & Travels  
**Module:** Search Engine, Multi-Criteria Filters, Departure Scheduling & Inventory Availability  
**Document Status:** Canonical Engineering Architecture & Implementation Plan  
**Upstream Frozen Baselines:**  
- Phase 0: Requirements Specification (`docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md` v3.0.0), System Architecture (`docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md`), Data Architecture (`docs/PHASE_0_4_6_DATA_ARCHITECTURE.md`)  
- Phase 1: Foundation Baseline (`docs/PHASE_1_FINAL_REVIEW.md`)  
- Phase 2: Authentication & RBAC (`docs/phase-2/README.md`)  
- Phase 3: Destinations & Package Catalogue (`docs/phase-3/PHASE-3-FINAL-INTEGRATION-AUDIT.md` — Commit `df3dd7d`)  

---

## 1. Executive Summary

Phase 4 transitions the platform from a static browsing catalogue (established in Phase 3) to an interactive, inventory-aware discovery platform. It enables customers to search and filter published tour packages, discover upcoming operational departures, and inspect real-time seat availability before entering checkout.

This document establishes the reconciled architectural blueprint for Phase 4. It resolves all requirement mappings, schema models, status lifecycles, and concurrency boundaries. In strict accordance with the Step 0 governance rules, **no application code, database migrations, or schema mutations are executed in this step**.

$$\text{Storefront Keyword / Multi-Criteria Search} \longrightarrow \text{Filtered Package Results} \longrightarrow \text{Departure Calendar Schedules} \longrightarrow \text{Real-Time Availability Validation}$$

---

## 2. Current Architecture Baseline

The platform operates on a Modular Monolith architecture backed by PostgreSQL and an asynchronous worker tier:
- **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript. Componentized architecture (`catalogueSection.js`, `packageDetailModal.js`, `packageCard.js`, `destinationCard.js`, `navbar.js`, `authModal.js`), unified API client (`api/client.js`), and centralized auth state (`state/authStore.js`).
- **Backend:** Node.js, TypeScript, Fastify 5.x. Layered architecture: Controllers $\to$ Services $\to$ Repositories $\to$ Database.
- **Database Access:** PostgreSQL 15+ accessed via `DatabaseService` (`backend/src/infrastructure/database/index.ts`) wrapping `pg.Pool`. Parameterized SQL statements with positional parameters (`$1, $2`), explicit transaction helper (`withTransaction`), and raw SQL migration runner (`migrator.ts`). Query builders like Knex or ORMs are strictly prohibited.
- **Cache & Worker:** Redis + BullMQ (asynchronous job scheduling and TTL caching).
- **Authentication & RBAC:** RS256 JWT access tokens, HttpOnly refresh cookies, Argon2id password hashing, and role verification (`GUEST`, `CUSTOMER`, `ADMIN`).
- **Monetary Convention:** Strict integer minor units (`BIGINT` paise for INR, cents for USD) via `MoneyUtil`. Zero floating-point arithmetic.
- **Canonical API Response Envelopes:**
  - Success: `{ "success": true, "data": T, "meta"?: { ... } }`
  - Failure: `{ "success": false, "error": { "code": string, "message": string, "details"?: unknown[] }, "meta": { "timestamp": string, "requestId": string } }`

---

## 3. Phase 0 Requirement References

The authoritative, canonical requirement IDs extracted directly from `docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md`:

| Requirement ID | Exact Requirement Statement | Priority | Phase 4 Responsibility | Evidence Source |
|---|---|---|---|---|
| **FR-SEARCH-001** | The system shall allow users to search packages by destination keyword or package title. | MUST | Implement tokenized text search and partial matching on package title, short description, destination city, and country. | `[DOCUMENTATION]` Synopsis L38, `frontend/index.html:37-40` |
| **FR-SEARCH-002** | The system shall allow users to filter search results by Destination City, Travel Theme, Duration range, and Maximum Budget. | MUST | Parameterized multi-criteria SQL query filtering across destination, theme, duration, and price in minor units. | `[DOCUMENTATION]` Synopsis L38-39 |
| **FR-SEARCH-003** | The system shall display a helpful empty state with reset suggestions when search criteria yield zero records. | MUST | Empty-state rendering in UI with a single-click "Reset Filters" action. | `[INFERENCE]` UX Standard |
| **FR-SEARCH-004** | The system shall support sorting search results by Price and Duration. | SHOULD | Safe allowlist-based sorting (`price_asc`, `price_desc`, `duration_asc`, `duration_desc`, `newest`, `featured`). | `[INFERENCE]` Sorting Standard |
| **FR-INVENT-001** | The system shall maintain departure schedules for packages, associating specific calendar Departure Dates with a Total Seat Capacity and Booked Seat Count. | MUST | Relational `departure_schedules` table with date boundaries, total capacity, and confirmed booked seats. | `[DOCUMENTATION]` Document §1.3, §1.4 |
| **FR-INVENT-002** | The system shall dynamically calculate Remaining Seat Capacity based on total capacity, confirmed bookings, and active temporary holds. | MUST | Real-time SQL availability computation aggregating unexpired active holds: $S_{\text{available}} = C_{\text{total}} - S_{\text{booked}} - S_{\text{held}}$. | `[INFERENCE]` BR-INVENT-001 |
| **FR-INVENT-003** | The system shall prevent customers from initiating a booking for departure dates where Remaining Seat Capacity is less than the requested party size. | MUST | Capacity validation endpoint and pre-checkout availability gate. | `[DOCUMENTATION]` Document L149 |
| **FR-INVENT-004** | The system shall place a temporary hold on requested seats for the configured checkout window duration when a customer initiates checkout. | MUST | **Design** `inventory_holds` schema in Phase 4; **Execute** checkout hold creation in Phase 5. | `[PHASE-0.2]` Section 15 |
| **FR-INVENT-005** | The system shall automatically release temporary seat holds back to available inventory if checkout payment is not verified within the configured hold window. | MUST | **Design** hold status and timestamp filters in Phase 4; **Execute** BullMQ expiration cleaner in Phase 5. | `[PHASE-0.2]` Section 15 |
| **FR-CONFIG-001** | The system shall allow customers on the package booking page to select a Departure Date, specify Number of Adults and Children, select an Accommodation Tier, and choose a Meal Plan. | MUST | Departure date selection UI and real-time departure inspection API. | `[DOCUMENTATION]` Synopsis L39-40 |
| **FR-ADMIN-004** | The system shall allow administrators to manage departure dates, update seat capacities, and view passenger manifests per departure. | MUST | Admin REST APIs for departure CRUD, capacity management, and status updates under `ROLE_ADMIN`. | `[DOCUMENTATION]` Synopsis L24, Document §6 |
| **NFR-PERF-002** | **Search Query Latency:** The package search and filter query shall return matching results in less than 500 milliseconds across a catalog of up to 10,000 packages. | MUST | PostgreSQL composite B-tree & GIN trigram indexes, pagination limits. | `[DOCUMENTATION]` Synopsis L12 |
| **NFR-REL-001** | **Zero Double-Bookings:** The system shall enforce atomic seat allocation to ensure that concurrent checkout attempts cannot result in confirmed bookings exceeding available inventory. | MUST | Row-level locking (`SELECT ... FOR UPDATE`) design and transactional boundary specifications. | `[DOCUMENTATION]` Core NFR |
| **DR-006** | **Departure Schedule Domain Entity:** `departure_schedules` and `inventory_holds` schemas. | MUST | Relational database schema specification in Step 1. | `[DOCUMENTATION]` Data Architecture §4.6 |

---

## 4. Phase 3 Integration Baseline

Phase 4 builds directly upon the frozen Phase 3 catalogue database schema and modules without altering any Phase 3 business logic:
- `destinations` table (`id`, `slug`, `city_name`, `country`, `description`, `thumbnail_url`, `hero_image_url`, `is_featured`, `is_published`, `created_at`, `updated_at`). *(Note: Column is `city_name`, not `name`)*.
- `themes` table (`id`, `slug`, `title`, `description`, `icon_url`, `created_at`).
- `tour_packages` table (`id`, `destination_id`, `theme_id`, `slug`, `title`, `short_description`, `description`, `duration_days`, `duration_nights`, `origin_city`, `destination_city`, `base_adult_price`, `base_child_price`, `currency`, `hero_image_url`, `gallery_urls`, `inclusions`, `exclusions`, `accommodation_tiers`, `meal_plans`, `is_published`, `is_featured`, `created_at`, `updated_at`).
- `itinerary_days` table (`id`, `package_id`, `day_number`, `title`, `activity_description`, `meals_included`, `accommodation_notes`, `created_at`, `updated_at`).
- **Publication Invariant (`BR-PKG-001`):** Public search and departure queries strictly enforce `tour_packages.is_published = TRUE AND destinations.is_published = TRUE`.

---

## 5. Phase 4 Business Objective & Scope

### In-Scope:
1. **Keyword Search Engine:** Search by package title, short description, destination city name, and country using PostgreSQL text search and trigram indexes.
2. **Multi-Criteria Filter Engine:** Filtering by destination slug, theme slug, duration min/max days, price min/max (in minor units), departure date range (`YYYY-MM-DD`), and featured flag.
3. **Deterministic Allowlisted Sorting:** Sorting by price (asc/desc), duration (asc/desc), creation date (`newest`), and featured status, with deterministic secondary tie-breakers (`id ASC`).
4. **Pagination Contract:** Standardized page, limit, offset pagination with metadata envelopes.
5. **Operational Departure Management (`departure_schedules`):** Admin creation, updates, and status transitions for tour departures.
6. **Real-Time Availability Computation:** Live computation of available seats ($C_{\text{total}} - S_{\text{booked}} - S_{\text{held}}$) without dual-write race conditions.
7. **Departure Discovery APIs:** Public endpoints to discover open departures for a package and check real-time availability for a specific departure.
8. **Frontend Storefront Enhancements:** Connecting search inputs, filter controls, sort dropdowns, departure calendar pickers, and live availability badges into existing frontend components.

---

## 6. Non-Goals (Strict Phase Boundaries)

The following capabilities belong to subsequent phases and are **NOT** implemented in Phase 4:
- ❌ **Booking State Machine & Booking Records:** Belongs to Phase 5 (`FR-BOOK-001` through `FR-BOOK-005`).
- ❌ **Checkout Session & Hold Creation Execution:** Belongs to Phase 5 (`FR-INVENT-004`).
- ❌ **Payment Gateway Integration & Webhooks:** Belongs to Phase 6 (`FR-PAY-001` through `FR-PAY-003`).
- ❌ **Invoicing & PDF E-Ticket Voucher Generation:** Belongs to Phase 6 (`FR-DOC-001` through `FR-DOC-004`).
- ❌ **Customer "My Bookings" Dashboard:** Belongs to Phase 5 (`FR-DASH-001` through `FR-DASH-004`).
- ❌ **Cancellations & Refund Queues:** Belongs to Phase 5 & Phase 6 (`FR-CANCEL-001` through `FR-CANCEL-004`).
- ❌ **Verified Reviews & Testimonials:** Belongs to Phase 7 (`FR-REVIEW-001` through `FR-REVIEW-003`).
- ❌ **Elasticsearch / Solr / External Search Infrastructure:** Prohibited by frozen technology stack constraints.

---

## 7. Search Architecture Design

### 7.1 Searchable Target Fields
A keyword search query (`q` parameter) evaluates:
1. `tour_packages.title` (Weight A)
2. `tour_packages.short_description` (Weight B)
3. `destinations.city_name` (Weight A)
4. `destinations.country` (Weight B)

### 7.2 Matching Strategy
- **Primary Matching:** PostgreSQL Full-Text Search using `to_tsvector('simple', ...)` and `plainto_tsquery('simple', ...)` across package textual fields.
- **Secondary / Substring Matching:** Case-insensitive `ILIKE` and trigram similarity (`pg_trgm`) on destination `city_name` and `country`.
- **Query Normalization:**
  - Strip SQL wildcards (`%`, `_`).
  - Trim leading and trailing whitespace.
  - Enforce minimum length of 2 characters, maximum length of 100 characters.
  - Whitespace-separated tokens combined using `AND` semantics in tsquery.
- **Index Plan (Single-Table Expressions):**
  - GIN trigram index on `tour_packages.title` (`gin_trgm_ops`).
  - GIN trigram index on `destinations.city_name` (`gin_trgm_ops`).
  - GIN trigram index on `destinations.country` (`gin_trgm_ops`).
  - Functional B-Tree index on `tour_packages(is_published, base_adult_price)`.

---

## 8. Filter Architecture Design

### 8.1 Supported Filters

| Filter Parameter | Input Type | Validation Rule | Target SQL Field | Query Strategy | Default Behavior |
|---|---|---|---|---|---|
| `q` | `string` | Min 2, max 100 chars | Title / Description / City / Country | FTS + Trigram ILIKE | Ignored if empty |
| `destinationSlug` | `string` | Alphanumeric kebab-case | `destinations.slug` | `JOIN destinations d ON tp.destination_id = d.id WHERE d.slug = $1` | All destinations |
| `themeSlug` | `string` | Alphanumeric kebab-case | `themes.slug` | `JOIN themes t ON tp.theme_id = t.id WHERE t.slug = $1` | All themes |
| `minDuration` | `integer` | Integer $\ge 1$ | `tour_packages.duration_days` | `tp.duration_days >= $1` | No minimum |
| `maxDuration` | `integer` | Integer $\ge$ `minDuration` | `tour_packages.duration_days` | `tp.duration_days <= $1` | No maximum |
| `minPrice` | `integer` | Integer $\ge 0$ (minor units) | `tour_packages.base_adult_price` | `tp.base_adult_price >= $1` | No minimum |
| `maxPrice` | `integer` | Integer $\ge$ `minPrice` (minor units)| `tour_packages.base_adult_price` | `tp.base_adult_price <= $1` | No maximum |
| `currency` | `enum` | `'INR'` or `'USD'` | `tour_packages.currency` | `tp.currency = $1` | Default `'INR'` |
| `departureDateFrom` | `string (ISO Date)`| `YYYY-MM-DD` | `departure_schedules.departure_date` | `EXISTS (SELECT 1 FROM departure_schedules ds WHERE ds.package_id = tp.id AND ds.departure_date >= $1 AND ds.status = 'OPEN')` | All future dates |
| `departureDateTo` | `string (ISO Date)`| `YYYY-MM-DD` | `departure_schedules.departure_date` | `EXISTS (SELECT 1 FROM departure_schedules ds WHERE ds.package_id = tp.id AND ds.departure_date <= $1 AND ds.status = 'OPEN')` | All future dates |
| `isFeatured` | `boolean` | `true \| false` | `tour_packages.is_featured` | `tp.is_featured = $1` | All packages |

### 8.2 Combination Semantics
- All active filters are joined with **Boolean `AND`**.
- Multi-select within the same category (e.g. comma-separated theme slugs) utilizes **Boolean `IN (...)`**.
- If no filters are provided, all published packages are returned in paginated order.

---

## 9. Sorting Strategy

### 9.1 Allowlisted Sort Keys

| Sort Key Parameter | Primary SQL ORDER BY Clause | Secondary Deterministic Tie-Breaker |
|---|---|---|
| `price_asc` | `tp.base_adult_price ASC` | `tp.created_at DESC, tp.id ASC` |
| `price_desc` | `tp.base_adult_price DESC` | `tp.created_at DESC, tp.id ASC` |
| `duration_asc` | `tp.duration_days ASC` | `tp.created_at DESC, tp.id ASC` |
| `duration_desc` | `tp.duration_days DESC` | `tp.created_at DESC, tp.id ASC` |
| `newest` | `tp.created_at DESC` | `tp.id ASC` |
| `featured` (Default)| `tp.is_featured DESC, tp.created_at DESC` | `tp.id ASC` |

### 9.2 Security & Determinism
- User-supplied sort parameters are strictly validated against the allowlist enum in Zod.
- Unrecognized sort parameters default safely to `featured`.
- Raw strings are **never** interpolated into SQL `ORDER BY` identifiers.
- Secondary tie-breakers guarantee deterministic pagination across multiple pages.

---

## 10. Pagination Strategy

Reuses the Phase 3 canonical pagination contract:
- `page` (default: 1, minimum: 1)
- `limit` (default: 12, minimum: 1, maximum: 50)
- `offset = (page - 1) * limit`
- Response metadata structure:
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

## 11. Departure Model & Status Lifecycle

### 11.1 Canonical Departure Lifecycle (`DepartureStatus`)
Stored as a PostgreSQL enum column `departure_schedules.status`:
- `OPEN`: Departure is scheduled, active, and open for customer booking.
- `CLOSED`: Departure is closed to further bookings (manually by admin or because departure booking cutoff date has passed).
- `CANCELLED`: Departure has been cancelled by the operator (triggers booking cancellations/refunds in Phase 5).
- `COMPLETED`: Tour departure date has elapsed and the tour is finished.

### 11.2 State Transition Invariants
```
               ┌──────────────┐
               │     OPEN     │ ◄─── (Created by Admin)
               └──────┬───────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
    ┌──────────┐┌───────────┐┌───────────┐
    │  CLOSED  ││ CANCELLED ││ COMPLETED │
    └────┬─────┘└───────────┘└───────────┘
         │
         ▼ (Admin Reopen)
    ┌──────────┐
    │   OPEN   │
    └──────────┘
```
- A departure can transition from `OPEN` to `CLOSED` or `CANCELLED`.
- A departure in `CLOSED` state can be reopened to `OPEN` by an admin if the departure date is still in the future.
- A departure in `CANCELLED` or `COMPLETED` state cannot be transitioned back to `OPEN`.

---

## 12. Availability Model & Calculation

### 12.1 Authoritative Mathematical Formula
For any departure schedule $d$:
$$S_{\text{available}} = \max\left(0, \; C_{\text{total}} - \left(S_{\text{booked}} + S_{\text{held}}\right)\right)$$

Where:
- $C_{\text{total}}$: `departure_schedules.total_seat_capacity` (Total physical seats).
- $S_{\text{booked}}$: `departure_schedules.booked_seats` (Confirmed/paid seats).
- $S_{\text{held}}$: Dynamic sum of active, unexpired holds from `inventory_holds`:
  $$\sum_{\substack{\text{status} = \text{'ACTIVE'} \\ \text{expires\_at} > \text{NOW()}}} \text{held\_seats}$$

### 12.2 Structural Separation of Holds & Departures
- **`departure_schedules` does NOT store a mutable `held_seats` column.**
- `inventory_holds` is the single authoritative ledger for temporary holds.
- This eliminates dual-write race conditions, drift, and hold double-counting.

### 12.3 Computed Availability Status Taxonomy (`AvailabilityStatus`)
Computed dynamically in memory / API responses (never stored as a table column):
- `AVAILABLE`: `DepartureStatus === 'OPEN'` AND $S_{\text{available}} \ge 5$.
- `FEW_SEATS_LEFT`: `DepartureStatus === 'OPEN'` AND $1 \le S_{\text{available}} < 5$ (UI renders urgency badge).
- `SOLD_OUT`: `DepartureStatus === 'OPEN'` AND $S_{\text{available}} = 0$.
- `CLOSED`: `DepartureStatus === 'CLOSED'` OR departure date is in the past.
- `CANCELLED`: `DepartureStatus === 'CANCELLED'`.

---

## 13. Inventory Authority & Concurrency Model

### 13.1 PostgreSQL as Authoritative Source of Truth
- PostgreSQL is the sole authoritative source of truth for seat capacity, bookings, and holds.
- Redis serves strictly as an operational cache and async worker queue; Redis is **never** the authority for inventory state.

### 13.2 Atomic Reservation Invariant (`NFR-REL-001`)
To prevent overbooking under high concurrency, seat reservation follows this strict transaction flow:
1. `BEGIN TRANSACTION;`
2. Acquire exclusive row-level lock on the departure:
   ```sql
   SELECT id, package_id, total_seat_capacity, booked_seats, status
   FROM departure_schedules
   WHERE id = $departure_id
   FOR UPDATE;
   ```
3. Aggregate active unexpired holds:
   ```sql
   SELECT COALESCE(SUM(held_seats), 0)::integer AS active_held_seats
   FROM inventory_holds
   WHERE departure_id = $departure_id
     AND status = 'ACTIVE'
     AND expires_at > NOW();
   ```
4. Evaluate invariant:
   $$\text{total\_seat\_capacity} - (\text{booked\_seats} + \text{active\_held\_seats}) \ge \text{requested\_seats}$$
5. If valid, proceed with hold insertion or booking commit; otherwise `ROLLBACK` and raise `INSUFFICIENT_SEATS` error (`ERR-003`).

---

## 14. Temporary Hold Boundary (Phase 4 vs Phase 5)

| Responsibility | Phase 4 (Current) | Phase 5 (Booking Engine) |
|---|---|---|
| **Data Schema** | Create `inventory_holds` table & indexes | Consume existing table |
| **Availability Calculation** | Query active unexpired holds in $S_{\text{available}}$ | Rely on Phase 4 calculation engine |
| **Hold Creation** | Define DTOs & Repository interfaces | Instantiate 15-min hold on checkout start (`FR-INVENT-004`) |
| **Hold Expiration Worker** | Specify status & timestamp criteria | Execute BullMQ delayed job cleaner (`FR-INVENT-005`) |
| **Hold Conversion** | None | Transition hold to `COMMITTED` on payment |

---

## 15. Price Overrides Model

`departure_schedules` supports optional departure-specific pricing overrides:
- `price_override_adult` (`BIGINT`, nullable minor units)
- `price_override_child` (`BIGINT`, nullable minor units)
- `currency` (`VARCHAR(3)`, matches package currency)

**Pricing Resolution Rule:**
- If `price_override_adult` is `NOT NULL`, departure adult price = `price_override_adult`. Otherwise fallback to `tour_packages.base_adult_price`.
- If `price_override_child` is `NOT NULL`, departure child price = `price_override_child`. Otherwise fallback to `tour_packages.base_child_price`.

---

## 16. Proposed Database Design (Step 1 Migration Plan)

```sql
-- Migration: 003_create_departures_and_inventory_schema.sql

-- 1. Departure Status Enum
DO $$ BEGIN
    CREATE TYPE departure_status AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED');
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
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status departure_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_departure_return_dates CHECK (return_date >= departure_date),
    CONSTRAINT chk_departure_capacity_bounds CHECK (booked_seats <= total_seat_capacity),
    UNIQUE (package_id, departure_date)
);

-- 4. Inventory Holds Table (DR-006 Temporary 15-Minute Locks)
CREATE TABLE IF NOT EXISTS inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    departure_id UUID NOT NULL REFERENCES departure_schedules(id) ON DELETE CASCADE,
    checkout_session_token VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    held_seats INTEGER NOT NULL CHECK (held_seats > 0),
    status inventory_hold_status NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_departures_pkg_date ON departure_schedules (package_id, departure_date);
CREATE INDEX IF NOT EXISTS idx_departures_status_date ON departure_schedules (status, departure_date);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_active ON inventory_holds (departure_id, status, expires_at);

-- 6. Search Trigram Indexes (pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tour_packages_title_trgm ON tour_packages USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_destinations_city_trgm ON destinations USING gin (city_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_destinations_country_trgm ON destinations USING gin (country gin_trgm_ops);
```

---

## 17. Shared Contract Proposal (Step 2 Plan)

### Proposed Enums & Types (`shared/src/types/inventory.ts`):
- `DepartureStatus`: `'OPEN' | 'CLOSED' | 'CANCELLED' | 'COMPLETED'`
- `AvailabilityStatus`: `'AVAILABLE' | 'FEW_SEATS_LEFT' | 'SOLD_OUT' | 'CLOSED' | 'CANCELLED'`
- `PackageSortOption`: `'price_asc' | 'price_desc' | 'duration_asc' | 'duration_desc' | 'newest' | 'featured'`
- `DepartureDto`: Full departure data model.
- `DepartureAvailabilityDto`: Departure availability details ($C_{\text{total}}, S_{\text{booked}}, S_{\text{available}}$, badge).
- `PackageSearchQueryDto`: Filter and pagination query parameters.
- `PackageSearchResultDto`: Paginated search results with next available departure metadata.

### Proposed Zod Schemas (`shared/src/schemas/inventory.schema.ts`):
- `PackageSearchQuerySchema`: Validates `q`, `destinationSlug`, `themeSlug`, `minDuration`, `maxDuration`, `minPrice`, `maxPrice`, `currency`, `departureDateFrom`, `departureDateTo`, `sortBy`, `page`, `limit`.
- `CreateDepartureSchema`: Validates admin departure creation payload.
- `UpdateDepartureSchema`: Validates admin departure update payload.
- `DepartureAvailabilityQuerySchema`: Validates party size and departure availability lookup.

---

## 18. Repository Plan (Step 3 Plan)

All repositories directly use `DatabaseService` (`this.db.query`, `this.db.withTransaction`):
1. **`DepartureRepository`:**
   - `create(data: CreateDepartureData, client?: PoolClient): Promise<DepartureEntity>`
   - `findById(id: string, client?: PoolClient): Promise<DepartureEntity | null>`
   - `findByIdForUpdate(id: string, client: PoolClient): Promise<DepartureEntity | null>`
   - `listByPackageId(packageId: string, options?: DepartureListOptions): Promise<DepartureEntity[]>`
   - `listUpcomingForPackage(packageId: string, fromDate?: string): Promise<DepartureEntity[]>`
   - `update(id: string, data: UpdateDepartureData, client?: PoolClient): Promise<DepartureEntity | null>`
   - `delete(id: string, client?: PoolClient): Promise<boolean>`
2. **`InventoryHoldRepository`:**
   - `getActiveHoldCount(departureId: string, client?: PoolClient): Promise<number>`
   - `createHold(data: CreateHoldData, client?: PoolClient): Promise<InventoryHoldEntity>`
   - `releaseHold(holdId: string, client?: PoolClient): Promise<boolean>`
3. **`PackageSearchRepository`:**
   - `searchPackages(filters: PackageSearchFilters, pagination: PaginationOptions, sort: PackageSortOption): Promise<{ items: PackageSearchResultEntity[]; total: number }>`

---

## 19. Service / Business Rule Plan (Step 4 Plan)

1. **`PackageSearchService`:**
   - Sanitizes and normalizes query tokens.
   - Enforces `is_published = TRUE` catalogue boundaries.
   - Attaches next upcoming available departure summary to each result card.
2. **`DepartureService`:**
   - Validates that parent `tour_packages` exists and is published before scheduling.
   - Enforces `departure_date >= CURRENT_DATE` and `return_date >= departure_date`.
   - Admin status transition management.
3. **`AvailabilityService`:**
   - Calculates real-time $S_{\text{available}}$ using $C_{\text{total}} - S_{\text{booked}} - S_{\text{held}}$.
   - Evaluates party size availability validation gates.

---

## 20. API Design (Step 5 Plan)

### Public REST Endpoints:
1. `GET /api/v1/packages/search`
   - Description: Search and filter tour packages with pagination and sorting.
   - Auth: Public (No token required).
   - Query: `PackageSearchQuerySchema`.
   - Response: `PaginatedResponse<PackageSearchResultDto>`.
2. `GET /api/v1/packages/:slug/departures`
   - Description: List all upcoming scheduled departures with availability badges for a package.
   - Auth: Public.
   - Response: `SuccessResponse<DepartureAvailabilityDto[]>`.
3. `GET /api/v1/departures/:id/availability`
   - Description: Check exact remaining seat availability and pricing for a specific departure date.
   - Auth: Public.
   - Query: `partySize` (optional, default 1).
   - Response: `SuccessResponse<DepartureAvailabilityDto>`.

### Admin REST Endpoints:
1. `GET /api/v1/admin/packages/:packageId/departures`
   - Description: List all departures (including closed/past) for a package.
   - Auth: `ROLE_ADMIN` required.
2. `POST /api/v1/admin/packages/:packageId/departures`
   - Description: Create a new departure date schedule.
   - Auth: `ROLE_ADMIN` required.
   - Body: `CreateDepartureSchema`.
3. `PATCH /api/v1/admin/departures/:id`
   - Description: Update departure capacity, pricing overrides, or operational status.
   - Auth: `ROLE_ADMIN` required.
   - Body: `UpdateDepartureSchema`.
4. `DELETE /api/v1/admin/departures/:id`
   - Description: Delete departure if zero bookings exist.
   - Auth: `ROLE_ADMIN` required.

---

## 21. Frontend Integration Plan (Step 6 Plan)

Modifications integrate into existing Vanilla JS components in `frontend/src/`:
1. **`frontend/src/components/catalogueSection.js`:**
   - Connect hero and header search inputs to debounced `/api/v1/packages/search` queries.
   - Render multi-criteria filter controls (Destination dropdown, Theme chips, Price range inputs, Duration selector, Departure date picker).
   - Render sorting dropdown (`Featured`, `Price: Low to High`, `Price: High to Low`, `Duration`).
   - Connect pagination controls to search results metadata.
   - Render user-friendly empty state with a 1-click "Reset Filters" action.
2. **`frontend/src/components/packageCard.js`:**
   - Display starting price and next available departure date tag.
3. **`frontend/src/components/packageDetailModal.js`:**
   - Render interactive Departure Calendar / Date Selector.
   - Display live availability badges (`Available`, `Only X seats left!`, `Sold Out`).
   - Display itemized pricing per selected departure.
4. **`frontend/src/api/client.js`:**
   - Extend client with `searchPackages()`, `getPackageDepartures()`, `getDepartureAvailability()`, and admin departure CRUD methods.

---

## 22. Redis & BullMQ Role in Phase 4

- **Redis:**
  - Available for short TTL caching of hot destination/theme filter taxonomies.
  - Zero authoritative state for inventory.
- **BullMQ:**
  - Worker infrastructure remains active and verified.
  - Delayed jobs for 15-minute checkout hold expiration are designed in Phase 4 and executed in Phase 5.

---

## 23. Security Threat Model & Mitigations

| Threat | Attack Surface | Mitigation Strategy | Phase Owner |
|---|---|---|---|
| **SQL Injection** | Search query `q` and filter parameters | Parameterized SQL queries `$1, $2` via `DatabaseService`; Zod string validation | Phase 4 Step 3/5 |
| **SQL Injection via Sorting** | `sortBy` parameter | Strict allowlist mapping in repository; raw strings never interpolated | Phase 4 Step 3 |
| **Overbooking Race Condition** | Concurrent checkout requests | Pessimistic locking (`SELECT ... FOR UPDATE`) in PostgreSQL transaction | Phase 4 & Phase 5 |
| **Negative Inventory Injection** | Capacity update parameters | Database `CHECK (total_seat_capacity > 0)` + Zod positive integer validation | Phase 4 Step 1/2 |
| **IDOR on Departure Admin** | Admin departure endpoints | RS256 JWT Authentication + Fastify `ADMIN` RBAC guard | Phase 4 Step 5 |
| **Unpublished Package Leak** | Search and departure queries | Enforce `tour_packages.is_published = TRUE AND destinations.is_published = TRUE` | Phase 4 Step 3/4 |
| **Past Date Booking Tampering** | Departure creation/selection | Database constraint `chk_departure_return_dates` + Service validation `departure_date >= CURRENT_DATE` | Phase 4 Step 1/4 |

---

## 24. Performance Plan

- **NFR-PERF-002 Compliance:** Target latency $< 500\text{ms}$ at 10,000 packages.
- **Indexing Strategy:**
  - Composite B-Tree: `(is_published, base_adult_price)` on `tour_packages`.
  - Composite B-Tree: `(package_id, departure_date)` on `departure_schedules`.
  - Trigram GIN: `gin_trgm_ops` on `tour_packages(title)`, `destinations(city_name)`, and `destinations(country)`.
- **Query Strategy:** Single-query execution with window functions (`COUNT(*) OVER()`) to avoid separate count round-trips.

---

## 25. Test Strategy & Quality Assurance Plan

1. **Unit Tests:**
   - Zod schema validation tests (query parsing, date validation, allowlists).
   - Availability calculation formula unit tests.
   - Price override resolution tests.
2. **Repository Integration Tests:**
   - Complex SQL search and multi-filter combination tests.
   - Departure date range queries.
   - Pessimistic locking (`SELECT ... FOR UPDATE`) transactional behavior.
3. **Domain Service Tests:**
   - Publication gate enforcement on search results.
   - Departure creation invariants and date checks.
4. **API Integration Tests:**
   - Public search, departures, and availability endpoints.
   - Admin RBAC authorization checks.
   - Malformed filter parameter rejection (400 Bad Request).
5. **Concurrency & Race Condition Tests:**
   - Multi-threaded concurrent hold and availability inspection simulation.
6. **Frontend Component Tests:**
   - Filter state debouncing, query string synchronization, departure selector modal rendering.

---

## 26. Phase 4 $\to$ Phase 5 Boundary

- **Phase 4 Delivers:** Package discovery, keyword search, multi-criteria filtering, departure calendar listing, real-time remaining capacity calculation, and pre-booking departure selection.
- **Phase 5 Takes Over When:** The customer clicks "Book Now" with a selected departure and party size, initiating checkout session creation, 15-minute temporary seat hold registration, guest/customer details capture, and booking record lifecycle state transitions (`AWAITING_PAYMENT`).

---

## 27. Phase 4 $\to$ Phase 6 Boundary

- Phase 4 contains **zero** payment, invoice, or voucher logic.
- Payment processing, Razorpay/Stripe webhooks, GST invoicing, and PDF e-ticket generation belong strictly to Phase 6.

---

## 28. Traceability Matrix

| Requirement ID | Business Rule | Phase 4 Responsibility | Component / Layer | Future Test Target | Evidence Source |
|---|---|---|---|---|---|
| `FR-SEARCH-001` | BR-SEARCH-001 | Search packages by keyword / title / destination | `PackageSearchRepository`, `PackageSearchService` | Keyword FTS & trigram test suite | Synopsis L38 |
| `FR-SEARCH-002` | BR-SEARCH-002 | Multi-criteria filtering (Destination, Theme, Duration, Price) | `PackageSearchRepository` | Multi-filter combinatorics tests | Synopsis L38-39 |
| `FR-SEARCH-003` | BR-SEARCH-003 | Zero-results empty state with reset suggestions | `catalogueSection.js` | UI empty-state rendering test | UX Standard |
| `FR-SEARCH-004` | BR-SEARCH-004 | Allowlist-based sorting by Price & Duration | `PackageSearchRepository` | Sort allowlist order tests | Sorting Standard |
| `FR-INVENT-001` | BR-INVENT-001 | Maintain package departure schedules with seat capacity | `departure_schedules`, `DepartureRepository` | Departure persistence test suite | Document §1.3, §1.4 |
| `FR-INVENT-002` | BR-INVENT-002 | Dynamically calculate remaining seat capacity | `AvailabilityService`, `inventory_holds` | Remaining capacity calculation tests | BR-INVENT-001 |
| `FR-INVENT-003` | BR-INVENT-003 | Prevent booking initiation when remaining capacity < party size | `AvailabilityService.validateAvailability` | Party capacity rejection tests | Document L149 |
| `FR-INVENT-004` | BR-INVENT-002 | Design 15-minute temporary hold ledger schema | `inventory_holds` table (Step 1) | Hold schema constraint tests | Phase 0.2 §15 |
| `FR-INVENT-005` | BR-INVENT-002 | Hold status & timestamp expiration queries | `InventoryHoldRepository` | Unexpired hold aggregation tests | Phase 0.2 §15 |
| `FR-CONFIG-001` | BR-CONFIG-001 | Select Departure Date on package booking UI | `packageDetailModal.js` | Departure calendar selector tests | Synopsis L39-40 |
| `FR-ADMIN-004` | BR-ADMIN-001 | Admin departure scheduling & capacity management | `AdminDepartureController` | Admin RBAC & CRUD test suite | Synopsis L24, Doc §6 |
| `NFR-PERF-002` | NFR-PERF-002 | Search latency < 500ms at 10,000 packages | Trigram & B-Tree Indexes | Query execution benchmark | Synopsis L12 |
| `NFR-REL-001` | NFR-REL-001 | 0% double-booking under concurrency | Pessimistic locking `SELECT FOR UPDATE` | Concurrent stress test suite | NFR-REL-001 |
| `DR-006` | DR-006 | Relational schema for departures & holds | Migration `003` | Migration schema verification | Data Arch §4.6 |

---

## 29. Risk Register

| Risk ID | Risk Description | Probability | Impact | Mitigation Strategy | Owner / Phase |
|---|---|---|---|---|---|
| **RSK-4-001** | Slow search performance on large text queries | Low | Medium | GIN Trigram indexes + Window function single-pass pagination | Phase 4 Step 1/3 |
| **RSK-4-002** | Double booking under high concurrency | Medium | Critical | Pessimistic locking `SELECT ... FOR UPDATE` + DB capacity check constraint | Phase 4 & Phase 5 |
| **RSK-4-003** | Timezone mismatch on departure dates | Medium | Medium | Store dates strictly as SQL `DATE` (`YYYY-MM-DD`) without UTC offset drift | Phase 4 Step 1/2 |
| **RSK-4-004** | Dual-write drift between departures and holds | Low | High | `held_seats` is NOT persisted in departures; dynamically calculated from holds ledger | Phase 4 Step 1/3 |
| **RSK-4-005** | Unpublished package visible via departure API | Low | High | Enforce package publication check in `DepartureService` | Phase 4 Step 4/5 |

---

## 30. Decision Register

| Decision ID | Question / Topic | Decision | Rationale | Affected Layers |
|---|---|---|---|---|
| **DEC-4-001** | Search Engine Implementation | PostgreSQL native FTS + Trigram GIN indexes (`pg_trgm`) | Fully satisfies $<500\text{ms}$ latency requirement without introducing external search cluster dependencies | Database, Repository |
| **DEC-4-002** | Departure Date Storage Format | SQL `DATE` (`YYYY-MM-DD`) | Departures are whole-day calendar events; eliminates timezone conversion errors between client and server | Database, Contracts |
| **DEC-4-003** | Inventory Authority & Hold Storage | PostgreSQL ACID single source of truth; dynamic hold aggregation | Eliminates dual-write anomalies; guarantees zero double-booking (`NFR-REL-001`) | Database, Repositories |
| **DEC-4-004** | Temporary Hold Execution Boundary | Schema & query design in Phase 4; checkout creation & BullMQ worker in Phase 5 | Preserves clean phase boundaries between catalogue discovery (Phase 4) and booking lifecycle (Phase 5) | Services, Jobs |
| **DEC-4-005** | Departure Status vs Availability Status | Decouple operational `DepartureStatus` (`OPEN`, `CLOSED`, `CANCELLED`, `COMPLETED`) from derived `AvailabilityStatus` (`AVAILABLE`, `FEW_SEATS_LEFT`, `SOLD_OUT`) | Separates operator administrative lifecycle from dynamic consumer UI badges | Database, Shared Contracts |

---

## 31. Implementation Sequence

The verified implementation sequence for Phase 4:
1. **Step 0:** Discovery, Requirements Reconciliation & Implementation Plan (**Current Step**)
2. **Step 1:** Database Schema & Migration (`003_create_departures_and_inventory_schema.sql`)
3. **Step 2:** Shared Contracts, DTOs & Zod Validation Schemas
4. **Step 3:** Repositories (`DepartureRepository`, `PackageSearchRepository`, `InventoryHoldRepository`)
5. **Step 4:** Domain Services & Availability Business Rules (`PackageSearchService`, `DepartureService`, `AvailabilityService`)
6. **Step 5:** Fastify REST APIs (Public Search & Departures + Admin Departure CRUD with RBAC)
7. **Step 6:** Dynamic Frontend Search, Filter Bar, Sort Dropdown & Departure Calendar Selector UI
8. **Step 7:** Deterministic Seed Data for Departures & Cross-Layer Verification
9. **Step 8:** Cross-Layer Integration Audit, Concurrency Verification & Phase 4 Freeze

---

## 32. Acceptance Criteria

- [x] Canonical Phase 0 search and filter requirements identified (`FR-SEARCH-001` through `FR-SEARCH-004`).
- [x] Canonical Phase 0 inventory and departure requirements identified (`FR-INVENT-001` through `FR-INVENT-005`, `FR-ADMIN-004`).
- [x] Search matching and multi-filter combination strategy defined using native PostgreSQL.
- [x] Safe allowlist sorting strategy defined with deterministic tie-breakers.
- [x] Departure schedule relational schema and status enums defined without dual-write `held_seats` column.
- [x] Real-time remaining seat capacity formula specified ($S_{\text{available}} = \max(0, C_{\text{total}} - S_{\text{booked}} - S_{\text{held}})$).
- [x] Inventory authority confirmed as PostgreSQL ACID row-locked transactions.
- [x] Phase 4 vs Phase 5 temporary hold boundary explicitly established.
- [x] Actual Phase 3 field names aligned (`destinations.city_name`, `tour_packages.base_adult_price`).
- [x] Frontend component alignment verified (`catalogueSection.js`, `packageDetailModal.js`).
- [x] Security threat model and mitigation controls documented.
- [x] Traceability matrix, risk register, and decision register created.
- [x] Zero application implementation code or migrations created in Step 0.

---

## 33. Open Questions / Unknowns

- **No blocking architectural contradictions remain.**
- Non-blocking design parameters:
  - Default search results page size is established at 12 items per page with a maximum limit of 50 items.
  - Price filter thresholds dynamically adapt to minimum and maximum prices present in the catalogue.

---

## 34. Phase 4 Step 0 Exit Criteria

Step 0 architectural discovery and reconciliation is complete. The system architecture, database models, API contracts, security controls, and frontend touchpoints are fully aligned with upstream baselines. All prerequisites are satisfied to proceed to **Phase 4 — Step 1 (Database Schema & Migrations)** upon approval.
