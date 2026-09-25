# Phase 3 — Destinations & Package Catalogue

## Step 0 Implementation Plan

**Document ID:** `DOC-PLAN-3.0`  
**Status:** Approved Discovery & Implementation Baseline  
**Target Branch:** `feature/phase-3-destinations-catalogue` (or current development baseline)  
**Authoritative Upstream Specifications:**

- [`docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) _(v3.0.0 Canonical Frozen Baseline)_
- [`docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)
- [`docs/PHASE_0_4_5_API_ARCHITECTURE.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_5_API_ARCHITECTURE.md)
- [`docs/PHASE_0_4_6_DATA_ARCHITECTURE.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_6_DATA_ARCHITECTURE.md)
- [`docs/PHASE_0_4_8_ARCHITECTURE_DECISION_RECORDS.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_8_ARCHITECTURE_DECISION_RECORDS.md)
- [`docs/phase-2/README.md`](file:///d:/Desktop/Travel-Web-/docs/phase-2/README.md) _(Phase 2 Frozen Baseline: `3f270a9`)_

---

## 1. Business Understanding

The business objective of Phase 3 is to establish the authoritative **Travel Product Catalogue** for **Young Tours & Travels (`Travel-Web`)**.

As a direct tour operator platform (`DEC-002`), the company curates, prices, and operates its own tour packages. The catalogue serves as the single source of truth for all destinations, multi-day tour itineraries, pricing tiers, accommodation options, meal plans, and inclusions that prospective travellers browse and that future booking engines snapshot.

### Business Understanding Concept Matrix

| Concept                   | Documented Meaning                                                                                                                                    | Repository Evidence                                 | Confidence     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------- |
| **Destination**           | Geographic location/city offered by the agency with metadata (coordinates, description, thumbnail, featured flag).                                    | `DR-002`, `FR-PACKAGE-001`, `PHASE_0_4_6` §4.2      | **DOCUMENTED** |
| **Tour Theme**            | Categorization taxonomy (e.g., Adventure, Honeymoon, Heritage, Wildlife, Pilgrimage).                                                                 | `DR-003`, `FR-PACKAGE-001`, `PHASE_0_4_6` §4.3      | **DOCUMENTED** |
| **Tour Package**          | Core product entity containing title, slug, duration (days/nights), origin/destination cities, base pricing, inclusions/exclusions, tiers, and media. | `DR-004`, `FR-PACKAGE-001..006`, `PHASE_0_4_6` §4.4 | **DOCUMENTED** |
| **Itinerary Day**         | Sequential day-by-day activity schedule attached to a package with titles, descriptions, meals, and hotel notes.                                      | `DR-005`, `FR-ITIN-001..002`, `PHASE_0_4_6` §4.5    | **DOCUMENTED** |
| **Accommodation Tier**    | Tiered lodging options (`BUDGET`, `STANDARD`, `LUXURY`) selectable during configuration.                                                              | `FR-PACKAGE-004`, `DR-004`, `PHASE_0_3` L207        | **DOCUMENTED** |
| **Meal Plan**             | Structured dining plans (`BREAKFAST`, `HALF_BOARD`, `FULL_BOARD`) attached to package configuration.                                                  | `FR-PACKAGE-004`, `DR-004`, `PHASE_0_3` L207        | **DOCUMENTED** |
| **Package Pricing**       | Minor-unit integer pricing (paise/cents) for base adult and child fares.                                                                              | `DEC-005`, `MoneyUtil`, `PHASE_0_4_6` §4.4          | **DOCUMENTED** |
| **Publication Gate**      | Invariant rule preventing publication if title, destination, price, hero image, or itinerary is missing (`BR-PKG-001`).                               | `BR-PKG-001`, `FR-PACKAGE-006`, `PHASE_0_3` L353    | **DOCUMENTED** |
| **Immutable Snapshot**    | Future booking engine requirement: package details & itinerary at booking time must be snapshot-frozen (`FR-BOOK-003`).                               | `FR-BOOK-003`, `BR-PRICE-001`, `DR-007`             | **DOCUMENTED** |
| **Direct Operator Model** | Young Tours & Travels owns inventory; no third-party vendor upload portals in MVP (`DEC-002`).                                                        | `DEC-002`, `PHASE_0_3` L1036                        | **DOCUMENTED** |

---

## 2. Scope

### In-Scope for Phase 3

- **Database Schema:** PostgreSQL tables for `destinations`, `themes`, `tour_packages`, and `itinerary_days` with indexes, foreign keys, and unique slug constraints.
- **Shared Contracts & DTOs:** Zod validation schemas, TypeScript interfaces, and response types for catalogue domain models.
- **Repositories:** Data access layer with parameterized SQL queries, transaction boundaries, and snake_case to camelCase entity mappers.
- **Domain Services:** `DestinationService`, `PackageService`, `ItineraryService` enforcing `BR-PKG-001` publication completeness gates and slug generation.
- **Public Catalogue APIs:** `GET /api/v1/destinations`, `GET /api/v1/destinations/:slug`, `GET /api/v1/packages`, `GET /api/v1/packages/:slug`, `GET /api/v1/themes`.
- **Admin Management APIs:** `POST/PATCH/DELETE` for destinations, tour packages, itinerary days, and publication status toggles protected by `fastify.authenticate` and `fastify.authorize(['ADMIN'])`.
- **Frontend Integration:** Transforming static HTML destination cards and package sections into dynamic, API-driven components using `ApiClient`.
- **Comprehensive Testing:** Unit, integration, authorization, concurrency, and validation test suites with zero regression to Phase 2.

### Explicitly Out-of-Scope for Phase 3 (Deferred to Later Phases)

- **Departure Dates & Seat Inventory:** `departure_schedules`, real-time seat quotas, and hold sweepers _(Phase 4)_.
- **Multi-Criteria Search & Filter Engine:** Full-text keyword search, price range sliders, duration filters _(Phase 4)_.
- **Booking Engine & Checkout:** Cart, passenger roster, booking records, guest checkout (`DEC-009`) _(Phase 5)_.
- **Payment Processing:** Razorpay/Stripe gateways, webhook handlers, refunds _(Phase 6)_.
- **PDF Document Generation:** Automated tax invoice and voucher rendering _(Phase 6)_.
- **Reviews & Ratings:** Customer testimonials submission & moderation _(Phase 7)_.

---

## 3. Existing Repository Architecture

```
Travel-Web-/
├── backend/
│   ├── src/
│   │   ├── config/env.ts              # Zod environment validation (RS256, DB pool, Rate Limits)
│   │   ├── infrastructure/
│   │   │   ├── database/              # pg.Pool, withTransaction, native SQL migrator
│   │   │   │   └── migrations/        # 001_create_identity_schema.sql
│   │   │   ├── redis/                 # Redis client for queues/caching
│   │   │   └── storage/               # Local/S3 storage abstraction (IStorageService)
│   │   ├── modules/
│   │   │   └── auth/                  # Phase 2 IAM (controllers, services, repositories, routes)
│   │   ├── plugins/                   # auth.ts (JWT/RBAC), errorHandler.ts, logging.ts, security.ts
│   │   ├── routes/                    # API v1 routes root (/health, /ready, /auth)
│   │   ├── app.ts                     # Fastify app factory
│   │   └── server.ts                  # Server entrypoint with graceful shutdown
├── frontend/
│   ├── index.html                     # Semantic HTML5 layout with auth modal container
│   ├── styles.css                     # Design system tokens, modal, responsive layout
│   └── src/
│       ├── api/client.js              # ApiClient with Bearer injection & 401 single-flight retry
│       ├── components/                # navbar.js, authModal.js
│       ├── state/auth.js              # In-memory AuthStore (zero-storage guarantee)
│       └── main.js                    # SPA bootstrap
├── shared/
│   ├── src/
│   │   ├── errors/                    # AppError, ErrorCodes
│   │   ├── schemas/                   # Zod schemas (auth.schema.ts)
│   │   ├── security/                  # Argon2id, RS256 JwtSecurity
│   │   ├── types/                     # api.ts (ApiSuccessResponse, ApiPaginatedResponse, ApiErrorResponse)
│   │   └── utils/money.ts             # MoneyUtil (Integer minor units arithmetic & formatting)
├── tests/                             # 20 suites, 226 tests (Unit, Integration, Attack Matrix, Resilience)
└── worker/                            # BullMQ worker bootstrap & queue smoke tests
```

---

## 4. Phase 2 Integration & Reuse Matrix

| Phase 2 Component                                             | Action in Phase 3  | Integration Rationale                                                                     |
| ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| **`fastify.authenticate`**                                    | **REUSE**          | Authenticates JWT Bearer tokens for all `/api/v1/admin/*` catalogue routes.               |
| **`fastify.authorize(['ADMIN'])`**                            | **REUSE**          | Enforces administrative RBAC on destination/package creation, editing, and publication.   |
| **`DatabaseService` / `withTransaction`**                     | **REUSE**          | Executes multi-table catalogue mutations (e.g. Package + Itinerary Days) atomically.      |
| **`migrator.ts` & `schema_migrations`**                       | **REUSE**          | Executes `002_create_catalogue_schema.sql` deterministically.                             |
| **`errorHandler.ts` & `AppError`**                            | **REUSE**          | Emits standard RFC 7807 error envelopes for validation errors, 404s, and slug conflicts.  |
| **`MoneyUtil`**                                               | **REUSE**          | Governs package `base_adult_price` and `base_child_price` in integer minor units (paise). |
| **`ApiClient` (`frontend/src/api/client.js`)**                | **REUSE / EXTEND** | Dispatches public `GET /packages` and admin management requests with Bearer injection.    |
| **`AuthStore` (`frontend/src/state/auth.js`)**                | **REUSE**          | Provides reactive `user.role` state to toggle Admin Catalogue Management UI controls.     |
| **`IStorageService` (`backend/src/infrastructure/storage/`)** | **REUSE**          | Resolves public URLs for hero banners, thumbnails, and gallery images.                    |

---

## 5. Current Database State & Analysis

### Existing Schema (Phase 2 Frozen Baseline)

- `schema_migrations` (id, migration_name, applied_at)
- `users` (id, email, password_hash, full_name, mobile_contact, role, is_active, last_login_at, timestamps)
- `refresh_tokens` (id, user_id, token_hash, expires_at, revoked_at, created_at)

### Findings

1. No destination or package tables currently exist in PostgreSQL.
2. The `pgcrypto` extension is already enabled (`gen_random_uuid()` is available).
3. Primary keys consistently use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
4. Timestamps use `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
5. Referential integrity uses `ON DELETE CASCADE` or `ON DELETE RESTRICT` with explicit secondary B-Tree indexes on foreign keys.

---

## 6. Proposed Domain Data Model

```
+─────────────────────────────────────────+
│               destinations              │
+─────────────────────────────────────────+
│ id (UUID, PK)                           │◄────────┐
│ slug (VARCHAR(100), UNIQUE)             │         │
│ city_name (VARCHAR(100))                │         │
│ country (VARCHAR(100))                  │         │ 1:N
│ description (TEXT)                      │         │
│ thumbnail_url (TEXT)                    │         │
│ hero_image_url (TEXT)                   │         │
│ is_featured (BOOLEAN, DEFAULT FALSE)    │         │
│ is_published (BOOLEAN, DEFAULT FALSE)   │         │
│ created_at (TIMESTAMPTZ)                │         │
│ updated_at (TIMESTAMPTZ)                │         │
+─────────────────────────────────────────+         │
                                                    │
+─────────────────────────────────────────+         │
│                 themes                  │         │
+─────────────────────────────────────────+         │
│ id (UUID, PK)                           │◄──┐     │
│ slug (VARCHAR(100), UNIQUE)             │   │     │
│ title (VARCHAR(100))                    │   │ 1:N │
│ description (TEXT)                      │   │     │
│ icon_url (TEXT)                         │   │     │
│ created_at (TIMESTAMPTZ)                │   │     │
+─────────────────────────────────────────+   │     │
                                              │     │
+─────────────────────────────────────────+   │     │
│              tour_packages              │   │     │
+─────────────────────────────────────────+   │     │
│ id (UUID, PK)                           │   │     │
│ destination_id (UUID, FK) ──────────────┼───┼─────┘
│ theme_id (UUID, FK) ────────────────────┼───┘
│ slug (VARCHAR(150), UNIQUE)             │◄────────┐
│ title (VARCHAR(255))                    │         │
│ short_description (VARCHAR(500))        │         │
│ description (TEXT)                      │         │
│ duration_days (INTEGER)                 │         │ 1:N
│ duration_nights (INTEGER)               │         │ Cascade Delete
│ origin_city (VARCHAR(100))              │         │
│ destination_city (VARCHAR(100))         │         │
│ base_adult_price (BIGINT)               │         │
│ base_child_price (BIGINT)               │         │
│ currency (VARCHAR(3), DEFAULT 'INR')    │         │
│ hero_image_url (TEXT)                   │         │
│ gallery_urls (JSONB)                    │         │
│ inclusions (JSONB)                      │         │
│ exclusions (JSONB)                      │         │
│ accommodation_tiers (JSONB)             │         │
│ meal_plans (JSONB)                      │         │
│ is_published (BOOLEAN, DEFAULT FALSE)   │         │
│ is_featured (BOOLEAN, DEFAULT FALSE)    │         │
│ created_at (TIMESTAMPTZ)                │         │
│ updated_at (TIMESTAMPTZ)                │         │
+─────────────────────────────────────────+         │
                                                    │
+─────────────────────────────────────────+         │
│             itinerary_days              │         │
+─────────────────────────────────────────+         │
│ id (UUID, PK)                           │         │
│ package_id (UUID, FK) ──────────────────┴─────────┘
│ day_number (INTEGER)                    │
│ title (VARCHAR(255))                    │
│ activity_description (TEXT)             │
│ meals_included (JSONB)                  │
│ accommodation_notes (TEXT)              │
│ created_at (TIMESTAMPTZ)                │
│ updated_at (TIMESTAMPTZ)                │
+─────────────────────────────────────────+
  UNIQUE CONSTRAINT: (package_id, day_number)
```

---

## 7. Entity Specifications & Field Rationale

### 7.1 Entity: `destinations` (`DR-002`)

- **Purpose:** Geographic focal points for package discovery.
- **Fields:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `slug`: `VARCHAR(100) UNIQUE NOT NULL` (URL-safe lowercase identifier, e.g. `paris-france`, `dubai-uae`)
  - `city_name`: `VARCHAR(100) NOT NULL` (e.g. `Paris`)
  - `country`: `VARCHAR(100) NOT NULL` (e.g. `France`)
  - `description`: `TEXT NOT NULL`
  - `thumbnail_url`: `TEXT NOT NULL` (Card image)
  - `hero_image_url`: `TEXT` (Banner image)
  - `is_featured`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `is_published`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `created_at` / `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Indexes:** `UNIQUE INDEX on (slug)`, `INDEX on (is_published, is_featured)`.

### 7.2 Entity: `themes` (`DR-003`)

- **Purpose:** Categorization taxonomy for packages.
- **Fields:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `slug`: `VARCHAR(100) UNIQUE NOT NULL` (e.g. `honeymoon-special`, `adventure-trekking`)
  - `title`: `VARCHAR(100) NOT NULL` (e.g. `Honeymoon Special`)
  - `description`: `TEXT`
  - `icon_url`: `TEXT`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Indexes:** `UNIQUE INDEX on (slug)`.

### 7.3 Entity: `tour_packages` (`DR-004`)

- **Purpose:** Core commercial tour product entity.
- **Fields:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `destination_id`: `UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT`
  - `theme_id`: `UUID REFERENCES themes(id) ON DELETE SET NULL`
  - `slug`: `VARCHAR(150) UNIQUE NOT NULL` (e.g. `romantic-paris-getaway-5d4n`)
  - `title`: `VARCHAR(255) NOT NULL`
  - `short_description`: `VARCHAR(500) NOT NULL`
  - `description`: `TEXT NOT NULL`
  - `duration_days`: `INTEGER NOT NULL CHECK (duration_days > 0)`
  - `duration_nights`: `INTEGER NOT NULL CHECK (duration_nights >= 0)`
  - `origin_city`: `VARCHAR(100) NOT NULL` (e.g. `Mumbai`)
  - `destination_city`: `VARCHAR(100) NOT NULL` (e.g. `Paris`)
  - `base_adult_price`: `BIGINT NOT NULL CHECK (base_adult_price >= 0)` (Minor units in paise)
  - `base_child_price`: `BIGINT NOT NULL DEFAULT 0 CHECK (base_child_price >= 0)`
  - `currency`: `VARCHAR(3) NOT NULL DEFAULT 'INR'`
  - `hero_image_url`: `TEXT NOT NULL`
  - `gallery_urls`: `JSONB NOT NULL DEFAULT '[]'::jsonb` (Array of image URL strings)
  - `inclusions`: `JSONB NOT NULL DEFAULT '[]'::jsonb` (Array of string items)
  - `exclusions`: `JSONB NOT NULL DEFAULT '[]'::jsonb` (Array of string items)
  - `accommodation_tiers`: `JSONB NOT NULL DEFAULT '["BUDGET","STANDARD","LUXURY"]'::jsonb`
  - `meal_plans`: `JSONB NOT NULL DEFAULT '["BREAKFAST","HALF_BOARD","FULL_BOARD"]'::jsonb`
  - `is_published`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `is_featured`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `created_at` / `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Indexes:** `UNIQUE INDEX on (slug)`, `INDEX on (destination_id)`, `INDEX on (theme_id)`, `INDEX on (is_published, is_featured)`, `INDEX on (base_adult_price)`.

### 7.4 Entity: `itinerary_days` (`DR-005`)

- **Purpose:** Day-wise chronological itinerary for a tour package.
- **Fields:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `package_id`: `UUID NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE`
  - `day_number`: `INTEGER NOT NULL CHECK (day_number > 0)`
  - `title`: `VARCHAR(255) NOT NULL` (e.g. `Arrival in Paris & Seine Cruise`)
  - `activity_description`: `TEXT NOT NULL`
  - `meals_included`: `JSONB NOT NULL DEFAULT '[]'::jsonb` (e.g. `["BREAKFAST", "DINNER"]`)
  - `accommodation_notes`: `TEXT` (e.g. `Overnight stay at Hotel Pullman Paris`)
  - `created_at` / `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Constraints:** `UNIQUE (package_id, day_number)`.

---

## 8. Package Publication Lifecycle & Completeness Gate (`BR-PKG-001`)

### State Machine

```
              ┌────────────────────────────────────────────────────────┐
              ▼                                                        │
         +─────────+          Admin initiates publish             +───────────+
  ───►   │  DRAFT  │ ───────────────────────────────────────────► │ PUBLISHED │
         +─────────+          Checks Completeness (BR-PKG-001)    +───────────+
              │               • title, destination, base price         │
              │               • hero_image_url                         │ Admin unpublishes
              │               • >= 1 itinerary_day                     │
              │                                                        ▼
              │                                                   +───────────+
              └─────────────────────────────────────────────────► │ ARCHIVED  │
                              Admin archives                      +───────────+
```

### Publication Completeness Rules Matrix

| Field / Rule       | Required for DRAFT      | Required for PUBLISHED                           | Traceability Evidence          |
| ------------------ | ----------------------- | ------------------------------------------------ | ------------------------------ |
| `title`            | Yes (min 3 chars)       | Yes (min 3 chars)                                | `BR-PKG-001`, `FR-PACKAGE-006` |
| `slug`             | Yes (Auto or explicit)  | Yes (Unique, URL safe)                           | `DR-004`                       |
| `destination_id`   | Yes                     | Yes (Must reference valid published destination) | `BR-PKG-001`                   |
| `duration_days`    | Yes ($>0$)              | Yes ($>0$)                                       | `FR-PACKAGE-001`               |
| `base_adult_price` | Yes ($\ge 0$)           | Yes ($> 0$ minor units)                          | `BR-PKG-001`, `DEC-005`        |
| `hero_image_url`   | No                      | Yes (Valid URL string)                           | `BR-PKG-001`                   |
| `inclusions`       | No                      | Yes ($\ge 1$ item recommended)                   | `FR-PACKAGE-003`               |
| `exclusions`       | No                      | Yes ($\ge 1$ item recommended)                   | `FR-PACKAGE-003`               |
| `itinerary_days`   | No (0 allowed in draft) | **Strictly $\ge 1$ Day Required**                | `BR-PKG-001`, `FR-PACKAGE-006` |

---

## 9. Role-Based Authorization Matrix

| Operation                                     | Public / Guest   | Customer         | Admin       |
| --------------------------------------------- | ---------------- | ---------------- | ----------- |
| `GET /api/v1/destinations` (Published)        | Allowed          | Allowed          | Allowed     |
| `GET /api/v1/destinations/:slug` (Published)  | Allowed          | Allowed          | Allowed     |
| `GET /api/v1/packages` (Published)            | Allowed          | Allowed          | Allowed     |
| `GET /api/v1/packages/:slug` (Published)      | Allowed          | Allowed          | Allowed     |
| `GET /api/v1/themes`                          | Allowed          | Allowed          | Allowed     |
| `GET /api/v1/admin/destinations` (All/Drafts) | **Denied (401)** | **Denied (403)** | **Allowed** |
| `POST /api/v1/admin/destinations`             | **Denied (401)** | **Denied (403)** | **Allowed** |
| `PATCH /api/v1/admin/destinations/:id`        | **Denied (401)** | **Denied (403)** | **Allowed** |
| `DELETE /api/v1/admin/destinations/:id`       | **Denied (401)** | **Denied (403)** | **Allowed** |
| `GET /api/v1/admin/packages` (All/Drafts)     | **Denied (401)** | **Denied (403)** | **Allowed** |
| `POST /api/v1/admin/packages`                 | **Denied (401)** | **Denied (403)** | **Allowed** |
| `PATCH /api/v1/admin/packages/:id`            | **Denied (401)** | **Denied (403)** | **Allowed** |
| `POST /api/v1/admin/packages/:id/publish`     | **Denied (401)** | **Denied (403)** | **Allowed** |
| `POST /api/v1/admin/packages/:id/unpublish`   | **Denied (401)** | **Denied (403)** | **Allowed** |
| `DELETE /api/v1/admin/packages/:id`           | **Denied (401)** | **Denied (403)** | **Allowed** |
| `PUT /api/v1/admin/packages/:id/itinerary`    | **Denied (401)** | **Denied (403)** | **Allowed** |

---

## 10. API Specification Proposal

### 10.1 Customer Public Endpoints

1. `GET /api/v1/destinations`
   - **Query:** `isFeatured?: boolean`, `limit?: number`, `page?: number`
   - **Response:** `ApiPaginatedResponse<DestinationDto>` (Filters strictly `is_published = true`)
2. `GET /api/v1/destinations/:slug`
   - **Response:** `ApiSuccessResponse<DestinationDetailDto>` (Includes associated packages count)
3. `GET /api/v1/packages`
   - **Query:** `destinationSlug?: string`, `themeSlug?: string`, `isFeatured?: boolean`, `page?: number`, `limit?: number`
   - **Response:** `ApiPaginatedResponse<PackageCardDto>` (Filters strictly `is_published = true`)
4. `GET /api/v1/packages/:slug`
   - **Response:** `ApiSuccessResponse<PackageDetailDto>` (Includes full package data + day-by-day `itinerary` array)
5. `GET /api/v1/themes`
   - **Response:** `ApiSuccessResponse<ThemeDto[]>`

### 10.2 Admin Management Endpoints (`fastify.authenticate` + `fastify.authorize(['ADMIN'])`)

1. `GET /api/v1/admin/destinations` — List all destinations with publication filters.
2. `POST /api/v1/admin/destinations` — Create new destination.
3. `PATCH /api/v1/admin/destinations/:id` — Update destination details.
4. `DELETE /api/v1/admin/destinations/:id` — Soft-delete / delete destination (guarded against active packages).
5. `GET /api/v1/admin/packages` — List all packages including drafts.
6. `POST /api/v1/admin/packages` — Create draft tour package.
7. `GET /api/v1/admin/packages/:id` — Get full package draft details.
8. `PATCH /api/v1/admin/packages/:id` — Update package fields.
9. `PUT /api/v1/admin/packages/:id/itinerary` — Upsert / reorder day-wise itinerary list atomically.
10. `POST /api/v1/admin/packages/:id/publish` — Validate completeness (`BR-PKG-001`) and set `is_published = true`.
11. `POST /api/v1/admin/packages/:id/unpublish` — Set `is_published = false`.
12. `DELETE /api/v1/admin/packages/:id` — Delete draft package.

---

## 11. Frontend Catalogue Integration Strategy

### 11.1 Current State Analysis

- `frontend/index.html` currently contains static hardcoded destination cards (Paris, Dubai, Venice).
- Package section currently lacks cards or dynamic rendering.
- `frontend/src/main.js` bootstraps `NavbarComponent` and `AuthModal`.

### 11.2 Integration Plan

1. **Dynamic Destination Grid:** Create `frontend/src/components/destinationGrid.js` to fetch `GET /api/v1/destinations` and render dynamic cards while preserving the existing modern CSS card styling.
2. **Dynamic Package Grid:** Create `frontend/src/components/packageGrid.js` to fetch `GET /api/v1/packages` and render rich tour package cards (Title, Thumbnail, Duration, Destination, Formatted Price via `MoneyUtil`).
3. **Package Detail View / Modal:** Create `frontend/src/components/packageDetailModal.js` or dedicated detail view for viewing full day-by-day itinerary, inclusions/exclusions, and accommodation tiers.
4. **Admin UI Indicators:** When `authStore.getUser()?.role === 'ADMIN'`, display admin quick-actions (e.g. "Manage Packages" CTA or badge indicators).
5. **Preserve Fallbacks:** Graceful offline/skeleton loading states when API is unreachable.

---

## 12. Future Booking & Availability Compatibility (`FR-BOOK-003`)

Phase 3 is deliberately architected to support future phases without schema breakage:

1. **Immutable Snapshot Structure:** The `tour_packages` entity contains clean, structured `inclusions`, `exclusions`, `accommodation_tiers`, `meal_plans`, and `itinerary_days` that can be directly serialized into `bookings.package_snapshot (JSONB)` in Phase 5.
2. **Clean Foreign Key Decoupling:** `departure_schedules (Phase 4)` will attach cleanly via `package_id -> tour_packages.id`.
3. **Stable Currency & Minor Units:** All prices are stored in `BIGINT` minor units, ensuring exact mathematical integrity when applying taxes, discounts, and party multipliers during Phase 5 checkout.

---

## 13. Security Threat Model & Attack Matrix

| Threat ID      | Threat Vector                                      | Impact                                 | Planned Mitigation in Phase 3                                                                     |
| -------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **SEC-CAT-01** | Unauthorized user creating/modifying packages      | High (Catalogue defacement)            | Enforce `fastify.authenticate` + `fastify.authorize(['ADMIN'])` on all mutation routes.           |
| **SEC-CAT-02** | Customer viewing unpublished draft package details | Medium (Business info leak)            | Public queries strictly enforce `WHERE is_published = TRUE`.                                      |
| **SEC-CAT-03** | Incomplete package published accidentally          | Medium (Broken checkout experience)    | `BR-PKG-001` publication gate validates all required fields before updating status.               |
| **SEC-CAT-04** | Duplicate slug collision on create/update          | Low (500 Server Error)                 | Unique database index + Zod slug generation with collision retry/error mapping to `409 Conflict`. |
| **SEC-CAT-05** | XSS payload stored in package title/description    | High (Customer session compromise)     | Strict HTML escaping on frontend rendering; schema string sanitization.                           |
| **SEC-CAT-06** | SQL Injection via catalogue filter parameters      | Critical (Database compromise)         | 100% Parameterized SQL queries via `DatabaseService.query(sql, params)`.                          |
| **SEC-CAT-07** | Deletion of destination with active packages       | High (Orphaned records / Broken links) | PostgreSQL `ON DELETE RESTRICT` constraint on `tour_packages.destination_id`.                     |
| **SEC-CAT-08** | Negative or fractional price injection             | Medium (Financial discrepancy)         | Database `CHECK (base_adult_price >= 0)` + Zod integer schema validation.                         |
| **SEC-CAT-09** | Out-of-order or duplicate itinerary days           | Low (Confusing itinerary sequence)     | `UNIQUE (package_id, day_number)` constraint + atomic transaction replacement.                    |
| **SEC-CAT-10** | Oversized payload attack on package creation       | Medium (Memory exhaustion DoS)         | Fastify body size limits + Zod `max()` string constraints.                                        |

---

## 14. File Modification Matrix

| File Path                                                                        | Action     | Responsibility                                                                             | Dependencies                          |
| -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `backend/src/infrastructure/database/migrations/002_create_catalogue_schema.sql` | **CREATE** | DDL for `destinations`, `themes`, `tour_packages`, `itinerary_days`, constraints & indexes | None                                  |
| `backend/src/infrastructure/database/seeds/seedCatalogue.ts`                     | **CREATE** | Initial seed data for featured destinations, themes, and tour packages                     | `002_create_catalogue_schema.sql`     |
| `shared/src/types/catalogue.ts`                                                  | **CREATE** | TypeScript interfaces for Destination, Theme, TourPackage, ItineraryDay, DTOs              | None                                  |
| `shared/src/schemas/catalogue.schema.ts`                                         | **CREATE** | Zod validation schemas for package/destination CRUD & queries                              | `catalogue.ts`                        |
| `shared/src/index.ts`                                                            | **MODIFY** | Export catalogue types and schemas                                                         | `catalogue.ts`, `catalogue.schema.ts` |
| `backend/src/modules/catalogue/repositories/destination.repository.ts`           | **CREATE** | SQL queries for destination entity                                                         | `DatabaseService`                     |
| `backend/src/modules/catalogue/repositories/package.repository.ts`               | **CREATE** | SQL queries for tour packages and itineraries                                              | `DatabaseService`                     |
| `backend/src/modules/catalogue/repositories/theme.repository.ts`                 | **CREATE** | SQL queries for tour themes                                                                | `DatabaseService`                     |
| `backend/src/modules/catalogue/services/destination.service.ts`                  | **CREATE** | Business logic & slug generation for destinations                                          | `DestinationRepository`               |
| `backend/src/modules/catalogue/services/package.service.ts`                      | **CREATE** | Business logic, `BR-PKG-001` publication gate, itinerary management                        | `PackageRepository`                   |
| `backend/src/modules/catalogue/controllers/destination.controller.ts`            | **CREATE** | Request handling for destination endpoints                                                 | `DestinationService`                  |
| `backend/src/modules/catalogue/controllers/package.controller.ts`                | **CREATE** | Request handling for package & itinerary endpoints                                         | `PackageService`                      |
| `backend/src/modules/catalogue/routes/catalogue.routes.ts`                       | **CREATE** | Public & admin route definitions under `/api/v1/`                                          | `auth.ts` plugin                      |
| `backend/src/routes/index.ts`                                                    | **MODIFY** | Register `catalogueRoutes` in API v1 router                                                | `catalogue.routes.ts`                 |
| `frontend/src/components/destinationGrid.js`                                     | **CREATE** | Dynamic destination cards renderer                                                         | `ApiClient`                           |
| `frontend/src/components/packageGrid.js`                                         | **CREATE** | Dynamic package cards renderer                                                             | `ApiClient`, `MoneyUtil`              |
| `frontend/src/components/packageDetailModal.js`                                  | **CREATE** | Day-by-day itinerary & package details modal                                               | `ApiClient`                           |
| `frontend/src/main.js`                                                           | **MODIFY** | Initialize destination and package grid components                                         | Component modules                     |
| `frontend/index.html`                                                            | **MODIFY** | Update package catalogue container                                                         | `styles.css`                          |
| `tests/unit/catalogueContracts.test.ts`                                          | **CREATE** | Unit tests for Zod schemas & slug validators                                               | `catalogue.schema.ts`                 |
| `tests/unit/catalogueRepositories.test.ts`                                       | **CREATE** | Unit tests for destination and package repositories                                        | Mock Database                         |
| `tests/unit/catalogueServices.test.ts`                                           | **CREATE** | Unit tests for `BR-PKG-001` publication gate & service logic                               | Service mocks                         |
| `tests/integration/catalogue.routes.test.ts`                                     | **CREATE** | Integration tests for public and admin catalogue routes                                    | Fastify test app                      |
| `tests/integration/catalogue.attack-matrix.test.ts`                              | **CREATE** | Security attack tests (RBAC bypass, draft leak, SQL injection)                             | Fastify test app                      |

---

## 15. Step-by-Step Implementation Sequence

```
Step 1: Database Schema & Migrations (002_create_catalogue_schema.sql + Migrator test)
  │
Step 2: Shared Catalogue Contracts, DTOs & Validation Schemas
  │
Step 3: Repositories (DestinationRepository, ThemeRepository, PackageRepository)
  │
Step 4: Domain Services & Publication Completeness Gate (BR-PKG-001)
  │
Step 5: Public Customer Catalogue REST APIs (/destinations, /packages, /themes)
  │
Step 6: Admin Catalogue Management REST APIs (/admin/destinations, /admin/packages)
  │
Step 7: Seed Data Engine & Initial Curated Packages
  │
Step 8: Frontend Dynamic Catalogue Integration (Destinations & Package Cards)
  │
Step 9: Frontend Package Detail View & Itinerary Modal
  │
Step 10: Security Attack Matrix & Concurrency Testing
  │
Step 11: Production Hardening & Rate Limiting
  │
Step 12: Documentation, Traceability & Phase 3 Freeze
```

### Detailed Step Specifications

#### **Step 1: Database Schema & Migrations**

- **Objective:** Define and apply native PostgreSQL schema for destinations, themes, packages, and itinerary days.
- **Key Files:** `backend/src/infrastructure/database/migrations/002_create_catalogue_schema.sql`, `tests/unit/catalogueSchema.test.ts`.
- **Verification:** `migrator.test.ts` and schema DDL syntax validation.

#### **Step 2: Shared Contracts & Validation**

- **Objective:** Define Zod schemas and TypeScript DTOs for catalogue domain models.
- **Key Files:** `shared/src/types/catalogue.ts`, `shared/src/schemas/catalogue.schema.ts`, `tests/unit/catalogueContracts.test.ts`.
- **Verification:** Unit tests verifying schema parsing, slug formatting, and price constraints.

#### **Step 3: Repositories Tier**

- **Objective:** Implement data access layer for destinations, themes, packages, and itineraries.
- **Key Files:** `DestinationRepository`, `ThemeRepository`, `PackageRepository`, `tests/unit/catalogueRepositories.test.ts`.
- **Verification:** Unit tests for CRUD operations, pagination queries, and transaction queries.

#### **Step 4: Domain Services & Business Rules**

- **Objective:** Implement `DestinationService` and `PackageService` with slug generation and `BR-PKG-001` publication validation.
- **Key Files:** `DestinationService`, `PackageService`, `tests/unit/catalogueServices.test.ts`.
- **Verification:** Unit tests asserting that draft packages lacking itineraries or hero images cannot be published.

#### **Step 5 & 6: REST APIs (Public & Admin)**

- **Objective:** Implement Fastify routes and controllers for public customer access and admin management.
- **Key Files:** `catalogue.routes.ts`, `destination.controller.ts`, `package.controller.ts`, `tests/integration/catalogue.routes.test.ts`.
- **Verification:** Integration tests verifying status codes, envelopes, and RBAC guards.

#### **Step 7: Seed Data Engine**

- **Objective:** Provide idempotent seed data with curated destinations and packages for local development and demos.
- **Key Files:** `backend/src/infrastructure/database/seeds/seedCatalogue.ts`.

#### **Step 8 & 9: Frontend Dynamic Integration**

- **Objective:** Connect frontend to `/api/v1/destinations` and `/api/v1/packages`, rendering cards and itinerary details.
- **Key Files:** `frontend/src/components/destinationGrid.js`, `frontend/src/components/packageGrid.js`, `frontend/src/components/packageDetailModal.js`.

#### **Step 10: Security Attack Matrix & Hardening**

- **Objective:** Verify defenses against unauthorized admin edits, draft leaks, IDOR, and injection.
- **Key Files:** `tests/integration/catalogue.attack-matrix.test.ts`.

#### **Step 11 & 12: Documentation & Final Phase-3 Freeze**

- **Objective:** Complete `docs/phase-3/` documentation suite, traceability matrix, and freeze baseline.

---

## 16. Proposed Phase 3 Acceptance Criteria

| Criterion                                                                                            | Verification Method     |
| ---------------------------------------------------------------------------------------------------- | ----------------------- |
| 1. `destinations`, `themes`, `tour_packages`, `itinerary_days` tables created with valid constraints | Database migration test |
| 2. Unique slug indexes enforced on destinations, themes, and tour packages                           | Constraint test         |
| 3. Monetary values stored exclusively as integer minor units (`BIGINT` paise)                        | Typecheck & schema test |
| 4. `BR-PKG-001` publication completeness gate enforced on package publication                        | Unit & integration test |
| 5. Public catalogue endpoints return only `is_published = true` items                                | Integration test        |
| 6. Admin catalogue endpoints strictly require `ADMIN` role JWT                                       | RBAC integration test   |
| 7. Master-detail day-wise itinerary management supported atomically                                  | Transaction test        |
| 8. Canonical RFC 7807 error envelopes returned on all error conditions                               | Integration test        |
| 9. Frontend dynamic components render live API data with fallback states                             | Frontend unit test      |
| 10. Security attack matrix passes all defined catalogue threat vectors                               | Attack matrix test      |
| 11. Zero regression to Phase 2 tests (all 226 Phase 2 tests pass)                                    | Full test suite run     |
| 12. Complete Phase 3 documentation and traceability matrix produced                                  | Documentation audit     |

---

## 17. Risk Register

| Risk                                               | Probability | Impact | Mitigation Strategy                                                                                              |
| -------------------------------------------------- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| **Data Model Incompatibility with Future Booking** | Low         | High   | Use structured JSONB for inclusions/tiers and reference integer minor units matching Phase 0.4 data design.      |
| **Orphaned Packages on Destination Deletion**      | Medium      | Medium | Enforce `ON DELETE RESTRICT` foreign key on `tour_packages.destination_id`.                                      |
| **Slug Collisions on Bulk Package Creation**       | Low         | Medium | Automatically append short random alphanumeric suffix or counter if slug exists.                                 |
| **Frontend Layout Shift during API Transition**    | Low         | Low    | Preserve exact existing CSS class hierarchy and card dimensions when switching from static to dynamic rendering. |
| **Draft Package Leaks in Public Catalogue**        | Low         | High   | SQL queries in public repositories hardcode `WHERE is_published = TRUE`.                                         |

---

## 18. Open Questions & Classifications

1. **[DOCUMENTED]** _What are the default accommodation tiers and meal plans?_  
   _Answer:_ `BUDGET`, `STANDARD`, `LUXURY` for lodging; `BREAKFAST`, `HALF_BOARD`, `FULL_BOARD` for meals (`FR-PACKAGE-004`).
2. **[DOCUMENTED]** _Are package prices fixed or seasonal in Phase 3?_  
   _Answer:_ Base pricing (`base_adult_price`, `base_child_price`) is defined at the package level in Phase 3. Specific seasonal date departure seat allocations belong to Phase 4.
3. **[REPOSITORY]** _How should package images be served?_  
   _Answer:_ URLs referencing public object storage keys or static asset CDNs via `IStorageService`.
4. **[ASSUMPTION]** _Should packages support multiple tour themes?_  
   _Answer:_ For Phase 3 MVP, each package has one primary `theme_id` (N:1), which fulfills `FR-PACKAGE-001`.
5. **[DOCUMENTED]** _Can an admin delete a destination that has active packages?_  
   _Answer:_ No. Foreign key constraint `ON DELETE RESTRICT` will block deletion until all associated packages are reassigned or removed.

---

## 19. Summary & Execution Readiness

Phase 3 planning is complete, fully aligned with Phase 0 requirements, Phase 1 foundations, and the frozen Phase 2 identity baseline.

**Execution is halted at Step 0. Ready for Step 1 upon approval.**
