# Phase 0.4.6 — Data Architecture & Persistence Design

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

| Property            | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.6`                                              |
| **Document Title**  | Data Architecture & Persistence Design                        |
| **Current Version** | `1.0.0` (Technical Architecture Baseline)                     |
| **Author Roles**    | Lead Data Architect, Database Systems Engineer                |
| **Target Audience** | Backend Engineers, Database Administrators, Security Analysts |

---

## 2. Data Architecture Principles

The Young Tours & Travels persistence tier is architected around core engineering principles:

1. **Relational ACID Consistency:** Critical transactional entities (Inventory allocations, Booking lifecycles, Payment logs) enforce full ACID guarantees via PostgreSQL.
2. **Immutable Price & Package Snapshots (`FR-BOOK-003`):** Modifying a package catalog item in the future must NEVER alter historical booking details, prices, or itineraries of past bookings.
3. **Pessimistic Concurrency for Inventory (`NFR-REL-001`):** Seat reservation is governed by row-level pessimistic locks and temporary hold ledgers to prevent overbooking.
4. **Separation of Operational and Audit Ledgers:** Financial transactions and administrative actions are logged in append-only tables that are physically isolated from mutable entity records.
5. **Human-Readable Business References:** Unique, customer-facing business identifiers (`BK-YYYYMMDD-XXXX` for bookings, `INV-YYYYMM-XXXX` for invoices).

---

## 3. Conceptual Entity-Relationship (ER) Model

```
+---------------+        1:N         +-------------------+        1:N         +-------------------+
|  DESTINATION  | -----------------> |    TOUR PACKAGE   | -----------------> |   ITINERARY DAY   |
|   (DR-002)    |                    |     (DR-004)      |                    |     (DR-005)      |
+---------------+                    +-------------------+                    +-------------------+
        ^                                      | 1:N
        | N:1                                  v
+---------------+                    +-------------------+        1:N         +-------------------+
|  TOUR THEME   |                    | DEPARTURE SCHEDULE| -----------------> |  INVENTORY HOLD   |
|   (DR-003)    |                    |     (DR-006)      |                    | (Temp 15m Lock)   |
+---------------+                    +-------------------+                    +-------------------+
                                               | 1:N
                                               v
+---------------+        1:N         +-------------------+        1:1         +-------------------+
|  USER ACCOUNT | -----------------> |  BOOKING RECORD   | -----------------> |  PAYMENT RECORD   |
|   (DR-001)    |                    |     (DR-007)      |                    |     (DR-008)      |
+---------------+                    +-------------------+                    +-------------------+
        |                                      |                                        |
        | 1:N                                  | 1:1                                    | 1:N
        v                                      +------------------+                     v
+---------------+                              |                  |           +-------------------+
|  TOUR REVIEW  |                              v                  v           |   PAYMENT EVENT   |
|   (DR-013)    |                    +-------------------+ +----------------+ | (Idempotent Logs) |
+---------------+                    |    TAX INVOICE    | |E-TICKET VOUCHER| +-------------------+
                                     |     (DR-009)      | |    (DR-010)    |
                                     +-------------------+ +----------------+
                                               | 1:1
                                               v
                                     +-------------------+        1:1         +-------------------+
                                     |   CANCELLATION    | -----------------> | REFUND SETTLEMENT |
                                     |     (DR-011)      |                    |     (DR-012)      |
                                     +-------------------+                    +-------------------+
```

---

## 4. Detailed Domain Entity Specifications

Mapped directly to Phase 0.3 Section 14 Conceptual Data Requirements (`DR-001` through `DR-015`):

### 4.1 User & Identity Domain (`DR-001`)

- **Entity:** `users`
- **Attributes:** `id` (UUIDv4), `full_name`, `email` (Unique Index), `password_hash` (Argon2id), `mobile_contact`, `physical_address`, `gender`, `date_of_birth`, `role` (`CUSTOMER`, `ADMIN`, `AGENT`), `is_active`, `created_at`, `updated_at`.
- **Sensitivity:** Classified as Confidential PII (`NFR-PRIV-001`).

### 4.2 Destination Catalog Domain (`DR-002`)

- **Entity:** `destinations`
- **Attributes:** `id` (UUIDv4), `slug` (Unique Index), `city_name`, `country`, `latitude`, `longitude`, `description`, `thumbnail_url`, `is_featured`, `is_published`, `created_at`, `updated_at`.

### 4.3 Tour Theme Domain (`DR-003`)

- **Entity:** `themes`
- **Attributes:** `id` (UUIDv4), `slug` (Unique Index), `title`, `description`, `icon_url`, `created_at`, `updated_at`.

### 4.4 Tour Package Catalog Domain (`DR-004`)

- **Entity:** `tour_packages`
- **Attributes:** `id` (UUIDv4), `slug` (Unique Index), `title`, `destination_id` (FK), `theme_id` (FK), `duration_days`, `duration_nights`, `distance_km`, `origin_city`, `destination_city`, `base_adult_price`, `base_child_price`, `hero_image_url`, `gallery_urls` (JSONB), `inclusions` (JSONB), `exclusions` (JSONB), `accommodation_tiers` (JSONB), `meal_plans` (JSONB), `is_published`, `created_at`, `updated_at`.

### 4.5 Day-by-Day Itinerary Domain (`DR-005`)

- **Entity:** `itinerary_days`
- **Attributes:** `id` (UUIDv4), `package_id` (FK), `day_number` (Integer), `title`, `activity_description`, `meals_included`, `accommodation_notes`, `created_at`.
- **Unique Constraint:** `(package_id, day_number)`.

### 4.6 Departure Schedule & Inventory Domain (`DR-006`, `DR-007`)

- **Entity:** `departure_schedules`
- **Attributes:** `id` (UUIDv4), `package_id` (FK), `departure_date` (Date), `return_date` (Date), `total_seat_capacity` (Integer), `booked_seats` (Integer, Default 0), `is_active` (Boolean), `version` (Optimistic Lock).
- **Entity:** `inventory_holds` (Temporary 15-Minute Reservation Locks)
- **Attributes:** `id` (UUIDv4), `departure_id` (FK), `checkout_session_token` (Unique Index), `reserved_seats` (Integer), `expires_at` (Timestamp Index), `status` (`ACTIVE`, `COMMITTED`, `EXPIRED`).

### 4.7 Booking Engine Domain (`DR-007`)

- **Entity:** `bookings`
- **Attributes:** `id` (UUIDv4), `booking_reference` (Unique Index: `BK-YYYYMMDD-XXXX`), `customer_id` (FK), `departure_id` (FK), `party_adults` (Integer), `party_children` (Integer), `selected_accommodation_tier`, `selected_meal_plan`, `total_price` (Decimal), `tax_amount` (Decimal), `currency` (`INR`/`USD`), `status` (`AWAITING_PAYMENT`, `PAID`, `AWAITING_APPROVAL`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `EXPIRED`), `package_snapshot` (JSONB — Immutable historical snapshot of package title, itinerary, inclusions at booking time), `passenger_roster` (JSONB — Array of Name, Age, Gender, Emergency Contact), `created_at`, `updated_at`.

### 4.8 Payment Processing Domain (`DR-008`)

- **Entity:** `payment_transactions`
- **Attributes:** `id` (UUIDv4), `booking_id` (FK), `provider` (`RAZORPAY`, `STRIPE`), `gateway_order_id`, `gateway_payment_id`, `amount` (Decimal), `currency`, `status` (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`), `idempotency_key` (Unique Index), `gateway_response_payload` (JSONB), `created_at`, `updated_at`.
- **Entity:** `payment_events` (Idempotent Webhook Log)
- **Attributes:** `id` (UUIDv4), `provider`, `event_id` (Unique Index), `event_type`, `payload` (JSONB), `processed_at`.

### 4.9 Document Storage Domain (`DR-009`, `DR-010`)

- **Entity:** `tax_invoices`
- **Attributes:** `id` (UUIDv4), `invoice_number` (Unique Index: `INV-YYYYMM-XXXX`), `booking_id` (FK), `customer_id` (FK), `gstin_number`, `taxable_amount` (Decimal), `gst_amount` (Decimal), `total_amount` (Decimal), `pdf_storage_key` (Private S3 Key), `created_at`.
- **Entity:** `ticket_vouchers`
- **Attributes:** `id` (UUIDv4), `voucher_code` (Unique Index: `VCH-YYYYMMDD-XXXX`), `booking_id` (FK), `pdf_storage_key` (Private S3 Key), `created_at`.

### 4.10 Cancellation & Refund Domain (`DR-011`, `DR-012`)

- **Entity:** `cancellation_requests`
- **Attributes:** `id` (UUIDv4), `booking_id` (FK), `requested_by` (FK), `cancellation_reason`, `calculated_refund_amount` (Decimal), `calculated_penalty_amount` (Decimal), `status` (`PENDING_APPROVAL`, `AUTHORIZED`, `REJECTED`, `COMPLETED`), `admin_notes`, `created_at`, `updated_at`.
- **Entity:** `refund_settlements`
- **Attributes:** `id` (UUIDv4), `cancellation_id` (FK), `payment_id` (FK), `gateway_refund_id`, `refund_amount` (Decimal), `settlement_status` (`PROCESSING`, `SETTLED`, `FAILED`), `processed_at`.

### 4.11 Reviews & Testimonials Domain (`DR-013`)

- **Entity:** `reviews`
- **Attributes:** `id` (UUIDv4), `package_id` (FK), `customer_id` (FK), `booking_id` (FK Unique), `rating_stars` (1 to 5), `review_text`, `status` (`PENDING`, `APPROVED`, `REJECTED`), `created_at`, `updated_at`.

### 4.12 CMS Content Domain (`DR-014`)

- **Entity:** `cms_content`
- **Attributes:** `id` (UUIDv4), `content_key` (Unique Index), `content_value` (JSONB), `updated_by` (FK), `updated_at`.

### 4.13 Audit Ledger Domain (`DR-015`)

- **Entity:** `audit_logs` (Append-Only Ledger)
- **Attributes:** `id` (BIGSERIAL), `timestamp_utc`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `ip_address`, `user_agent`, `payload_delta` (JSONB).

---

## 5. Concurrency & Concurrency Control Strategy

```
+-----------------------------------------------------------------------------------+
|                        ATOMIC SEAT ALLOCATION TRANSACTION                         |
+-----------------------------------------------------------------------------------+
| BEGIN TRANSACTION;                                                                |
|   -- 1. Acquire exclusive row lock on departure schedule                          |
|   SELECT total_seat_capacity, booked_seats                                        |
|   FROM departure_schedules                                                        |
|   WHERE id = $departure_id FOR UPDATE;                                           |
|                                                                                   |
|   -- 2. Aggregate active unexpired holds                                          |
|   SELECT COALESCE(SUM(reserved_seats), 0)                                         |
|   FROM inventory_holds                                                            |
|   WHERE departure_id = $departure_id                                              |
|     AND status = 'ACTIVE'                                                         |
|     AND expires_at > NOW();                                                       |
|                                                                                   |
|   -- 3. Invariant Verification                                                    |
|   IF (total_seat_capacity - (booked_seats + active_holds)) >= $requested_seats:   |
|       INSERT INTO inventory_holds (...) VALUES (...);                             |
|       COMMIT;                                                                     |
|   ELSE:                                                                           |
|       ROLLBACK;                                                                   |
|       RAISE EXCEPTION 'INVENTORY_CAPACITY_EXCEEDED';                              |
+-----------------------------------------------------------------------------------+
```

---

## 6. Data Lifecycle, Privacy & Statutory Retention

1. **Statutory Tax Retention:** Tax invoices (`tax_invoices`) and financial records (`payment_transactions`, `refund_settlements`) must be retained for a mandatory **7-year period** to comply with financial and tax regulations.
2. **Account Deletion & Anonymization (`NFR-PRIV-001`):** When a user requests account deletion, personal identifiers in `users` are scrambled/anonymized (`full_name = 'Deleted User'`, `email = 'deleted_XXXX@anonymized.local'`), while historic booking numbers and financial totals are preserved for ledger integrity.

---

_End of Document DOC-ARCH-0.4.6 (Data Architecture & Persistence Design)._
