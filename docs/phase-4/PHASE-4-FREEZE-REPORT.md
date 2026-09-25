# Phase 4 — Search, Filters, Departures & Availability Freeze Report

**Project:** Young Tours & Travels  
**Phase:** 4 — Search, Filters, Departures & Inventory Availability  
**Status:** **FROZEN AND READY FOR PHASE 5** [DOCUMENTED]  
**Date:** 2026-09-26

---

## 1. Executive Summary & Objective

Phase 4 establishes high-performance tour package search, multi-dimensional filtering, dynamic sorting, scheduled departure management, and real-time derived seat availability.

The core engineering objective was to provide an authoritative, zero-double-booking inventory foundation without prematurely implementing checkout holds or booking execution, maintaining strict encapsulation between Phase 4 (Search & Availability Reads/Admin Scheduling) and Phase 5 (Booking Engine & Checkout).

All 7 implementation steps have been executed, verified, audited, and tested. The entire codebase is 100% green across unit tests, database integration tests, Fastify route suites, security matrices, and TypeScript typechecking.

---

## 2. Scope & Boundaries

### In Scope [DOCUMENTED]

- **PostgreSQL Database Schema:** `departure_schedules` table with strict date and capacity constraints; `inventory_holds` schema designed for Phase 5.
- **Shared Contracts:** Zod schemas, TypeScript DTOs, and canonical query contracts for package search, departures, and seat availability.
- **Data Access Layer:** Parameterized, SQL-injection-immune repositories with FOR UPDATE concurrency primitives (`PackageSearchRepository`, `DepartureRepository`, `InventoryHoldRepository`).
- **Domain Service Layer:** Orchestration of business rules for search filtering, departure scheduling, pricing resolution, and real-time seat availability (`PackageSearchService`, `DepartureService`, `AvailabilityService`).
- **REST Transport Layer:** Fastify public storefront endpoints (`/packages/search`, `/packages/:slug/departures`, `/departures/:id/availability`) and RBAC-protected admin endpoints (`/admin/packages/:packageId/departures`, `/admin/departures/:id`).
- **Frontend Consumer Layer:** Vanilla HTML5/CSS3/ES6 integration supporting keyword debounce, multi-criteria filters, sorting, backend pagination, next departure chips, detail modal live departure selection, and party-size eligibility inspection.

### Out of Scope (Deferred to Phase 5) [DECISION]

- ❌ Booking creation & state machine (`bookings` table)
- ❌ Passenger records & manifests (`booking_passengers` table)
- ❌ Checkout session & hold execution / commitment (`POST /api/v1/bookings/holds`)
- ❌ Payment authorization & capture (Razorpay/Stripe gateways)
- ❌ Payment webhook processing & asynchronous signature validation
- ❌ E-ticket & Tax invoice PDF generation
- ❌ Redis distributed lock acquisition for checkout
- ❌ Background hold expiry worker (BullMQ hold cleanup)

---

## 3. Phase 4 Implementation Timeline & Step Baseline

| Step       | Scope                            | Baseline Commit | Status     |
| :--------- | :------------------------------- | :-------------- | :--------- |
| **Step 0** | Architecture, Constraints & Plan | `169d47e`       | **FROZEN** |
| **Step 1** | Database Schema & Constraints    | `3ce2a90`       | **FROZEN** |
| **Step 2** | Shared Contracts & Schemas       | `b484d54`       | **FROZEN** |
| **Step 3** | Repositories & Data Access       | `338e960`       | **FROZEN** |
| **Step 4** | Domain Services & Business Rules | `beb27b2`       | **FROZEN** |
| **Step 5** | REST APIs & Fastify Routes       | `112c28b`       | **FROZEN** |
| **Step 6** | Storefront Frontend Integration  | `c88083c`       | **FROZEN** |
| **Step 7** | Audit, Hardening & Freeze        | _Current_       | **FROZEN** |

---

## 4. Architecture Summary & Core Mechanisms

```
+-------------------------------------------------------------------------+
|                        Vanilla Frontend Consumer                        |
|   (Search Bar, Filters, Sort Select, Pagination, Live Modal Badges)     |
+------------------------------------+------------------------------------+
                                     | (Clean HTTP JSON)
                                     v
+------------------------------------+------------------------------------+
|                         Fastify REST Layer                              |
|   GET /packages/search  |  GET /departures/:id/availability  | Admin    |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                        Domain Services Layer                            |
|     PackageSearchService  |  DepartureService  |  AvailabilityService   |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                      Data Access Repositories                           |
|  PackageSearchRepository  |  DepartureRepository  |  HoldRepository     |
+------------------------------------+------------------------------------+
                                     | (Parameterized SQL & Transactions)
                                     v
+------------------------------------+------------------------------------+
|                       PostgreSQL Database                               |
|        departure_schedules  |  inventory_holds  |  tour_packages        |
+-------------------------------------------------------------------------+
```

### 4.1 Real-Time Availability Derivation Formula [DR-006]

Availability is strictly derived and NEVER stored as a mutable static column:
$$\text{availableSeats} = \max\left(0, \text{totalSeatCapacity} - \text{bookedSeats} - \text{activeUnexpiredHeldSeats}\right)$$
Where:

- $\text{totalSeatCapacity} > 0$
- $\text{bookedSeats} \ge 0$ (enforced by DB check `booked_seats <= total_seat_capacity`)
- $\text{activeUnexpiredHeldSeats}$ is the sum of seats in `inventory_holds` where $\text{status} = \text{'ACTIVE'}$ AND $\text{expires\_at} > \text{NOW()}$.

### 4.2 Customer Availability Status Taxonomy

- **`AVAILABLE`**: Operational status is `OPEN` and $\text{availableSeats} \ge 5$.
- **`FEW_SEATS_LEFT`**: Operational status is `OPEN` and $1 \le \text{availableSeats} < 5$.
- **`SOLD_OUT`**: Operational status is `OPEN` and $\text{availableSeats} = 0$.
- **`CLOSED`**: Operational status is `CLOSED` OR $\text{departureDate} < \text{CURRENT\_DATE}$.
- **`CANCELLED`**: Operational status is `CANCELLED`.

### 4.3 Effective Pricing Resolution Order

1. If `departure.price_override_adult` is non-null $\rightarrow$ use `departure.price_override_adult`.
2. Otherwise $\rightarrow$ fallback to `package.base_adult_price`.
3. All money values remain 64-bit integer minor units (paise/cents).

---

## 5. Requirement Traceability Matrix

| Requirement ID    | Description                                                                  | Implementation Status                          | Evidence / Verification                                                                                               |
| :---------------- | :--------------------------------------------------------------------------- | :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **FR-SEARCH-001** | Tour package search by text query                                            | **IMPLEMENTED** [DOCUMENTED]                   | `GET /api/v1/packages/search?q=...` + trigram SQL matching on title, cities, short description.                       |
| **FR-SEARCH-002** | Filter by destination, theme, duration, and budget                           | **IMPLEMENTED** [DOCUMENTED]                   | Query parameters: `destinationSlug`, `themeSlug`, `minDuration`, `maxDuration`, `maxPrice`, `minPrice`.               |
| **FR-SEARCH-003** | Empty search result handling                                                 | **IMPLEMENTED** [DOCUMENTED]                   | Returns HTTP 200 with `{ items: [], meta: { total: 0 } }` and renders clean UI empty card with reset CTA.             |
| **FR-SEARCH-004** | Sorting options (`price_asc`, `price_desc`, `duration_asc`, `duration_desc`) | **IMPLEMENTED** [DOCUMENTED]                   | Allowlisted SQL sort ordering with deterministic tie-breaker (`created_at DESC, id ASC`).                             |
| **FR-INVENT-001** | Departure date schedule selection                                            | **IMPLEMENTED** [DOCUMENTED]                   | `GET /api/v1/packages/:slug/departures` returning upcoming scheduled dates with badges.                               |
| **FR-INVENT-002** | Real-time seat availability display                                          | **IMPLEMENTED** [DOCUMENTED]                   | `GET /api/v1/departures/:id/availability` evaluating authoritative derived seats.                                     |
| **FR-INVENT-003** | Party-size availability validation                                           | **IMPLEMENTED** [DOCUMENTED]                   | `partySize >= 1` query parameter returning authoritative `isAvailableForParty` boolean.                               |
| **FR-INVENT-004** | Temporary inventory hold reservation                                         | **DESIGNED / PREPARED FOR PHASE 5** [DECISION] | `inventory_holds` table, schema, and repository ready; checkout execution deferred to Phase 5.                        |
| **FR-INVENT-005** | Hold expiry & automatic release                                              | **DESIGNED / PREPARED FOR PHASE 5** [DECISION] | Expired holds naturally excluded from availability calculation; worker engine deferred to Phase 5.                    |
| **FR-CONFIG-001** | Package configuration & departure details                                    | **IMPLEMENTED** [DOCUMENTED]                   | Modal renders full package details alongside live upcoming departures.                                                |
| **FR-ADMIN-004**  | Admin departure schedule management                                          | **IMPLEMENTED** [DOCUMENTED]                   | Admin REST CRUD endpoints (`/admin/packages/:packageId/departures`, `/admin/departures/:id`) guarded by `ADMIN` RBAC. |
| **NFR-PERF-002**  | Sub-500ms package search query latency                                       | **PARTIALLY VERIFIED** [REPOSITORY]            | Indexed with B-trees and composite indices; query plan audited; 10k-record benchmark not executed.                    |
| **NFR-REL-001**   | High-availability derived inventory reads                                    | **IMPLEMENTED** [DOCUMENTED]                   | Derived calculation with transactional FOR UPDATE primitives preventing phantom overselling.                          |
| **DR-006**        | Derived seat availability architecture                                       | **IMPLEMENTED** [DECISION]                     | Strict non-persistent derived availability formula enforced across DB, services, and APIs.                            |

---

## 6. Security Audit Findings & Verification

- **SQL Injection Defense:** All repository queries use strictly parameterized positional parameters (`$1`, `$2`, etc.). Dynamic sorting evaluates an immutable allowlist (`price_asc`, `price_desc`, `duration_asc`, `duration_desc`, `newest`, `featured`). Tested against SQL injection attack vectors with 100% pass.
- **Cross-Site Scripting (XSS) Defense:** All dynamic API data rendered in HTML templates is passed through `escapeHtml()`. Validated with `<script>`, `<img onerror>`, and attribute escape tests.
- **Role-Based Access Control (RBAC):** Public endpoints (`/packages/search`, `/packages/:slug/departures`, `/departures/:id/availability`) are publicly accessible without authentication tokens. Admin departure endpoints strictly require valid RS256 JWT tokens with `ADMIN` role claims (401 on missing/expired token, 403 on `CUSTOMER` role).
- **Publication Isolation Guard:** Public search and departure endpoints strictly query published packages with published destinations (`p.is_published = true AND d.is_published = true`). Unpublished packages are completely inaccessible to storefront users.
- **Canonical Phase 1 Error Envelope:** All errors return `{ success: false, error: { code, message, details }, meta }`. No database connection strings, SQL errors, or stack traces are leaked to clients.

---

## 7. Verification Results

```bash
npm test
# Result: 35 test files passed, 522 total tests passed (100% passing)

npm run typecheck
# Result: 0 TypeScript errors (tsc --noEmit clean)

npm run lint
# Result: 0 ESLint errors / warnings

npm run format:check
# Result: All matched files use Prettier code style!

npm run build
# Result: tsc -b builds cleanly
```

---

## 8. Defect Resolution Summary

- **Defect Count:** 0 unresolved defects.
- **Regression Status:** 0 regressions across Phase 1 (Foundation), Phase 2 (Authentication), Phase 3 (Catalogue), and Phase 4 (Search & Inventory).

---

## 9. Phase 5 Handover Boundary Confirmation

Phase 4 is complete, verified, and sealed. The following capabilities are explicitly deferred to **Phase 5 (Booking Engine & Checkout)**:

1. `POST /api/v1/bookings` (Booking creation & passenger collection)
2. `POST /api/v1/bookings/holds` (Checkout session hold execution)
3. Payment Gateway Integration (Razorpay/Stripe orders, signatures, webhooks)
4. BullMQ background hold expiry worker
5. E-Ticket & Tax invoice generation

---

## 10. Final Decision

**PHASE 4 — FROZEN AND READY FOR PHASE 5** [DOCUMENTED]
