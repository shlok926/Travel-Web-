# Phase 0.4.5 — API Architecture & Interface Specification

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

| Property            | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.5`                                               |
| **Document Title**  | API Architecture & Interface Specification                     |
| **Current Version** | `1.0.0` (Technical Architecture Baseline)                      |
| **Author Roles**    | Lead API Architect, Backend Systems Architect                  |
| **Target Audience** | Backend Engineers, Frontend Engineers, QA Automation Engineers |

---

## 2. API Design Principles & Standards

The Young Tours & Travels REST API adheres to strict architectural conventions:

1. **Resource-Oriented REST:** Nouns represent resources (e.g. `/packages`, `/bookings`), standard HTTP verbs define operations (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
2. **Explicit URI Versioning:** All endpoints are versioned under the `/api/v1/` prefix.
3. **Stateless Communication:** No server-side session affinity; every request carries required authorization headers.
4. **Uniform Envelopes:** Standardized JSON structure for both successful responses and error payloads.
5. **Idempotent Mutations:** State-changing endpoints (e.g. checkout, payment callbacks) require an `Idempotency-Key` header.
6. **Authoritative Calculation:** Client inputs specify desired parameters (dates, guests, tiers); server computes and returns authoritative financial and capacity values.

---

## 3. Standard Request & Response Envelopes

### 3.1 Standard Success Envelope

```json
{
  "success": true,
  "data": {
    "bookingReference": "BK-20261015-8842",
    "status": "AWAITING_PAYMENT",
    "totalPrice": 45000.0,
    "currency": "INR",
    "holdExpiresAt": "2026-10-15T14:45:00Z"
  },
  "meta": {
    "timestamp": "2026-10-15T14:30:00Z",
    "requestId": "req_8f7b2a9c1e"
  }
}
```

### 3.2 Standard Paginated List Envelope

```json
{
  "success": true,
  "data": [{ "id": "pkg_01", "title": "Golden Triangle Tour", "basePrice": 18500.0 }],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 45,
    "totalPages": 3
  }
}
```

### 3.3 Standard Error Envelope (Mapped to RFC 7807)

```json
{
  "success": false,
  "error": {
    "code": "INVENTORY_HOLD_EXPIRED",
    "message": "The 15-minute checkout hold window for this booking has expired. Please reselect your departure date.",
    "details": [
      {
        "field": "holdSessionToken",
        "issue": "Token expired at 2026-10-15T14:45:00Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-10-15T14:46:12Z",
    "requestId": "req_99b41e8c71"
  }
}
```

---

## 4. Standard Error Code Registry

Mapped directly to Phase 0.3 Section 15 Failure Modes (`ERR-001` through `ERR-010`):

| Error Code                          | HTTP Status              | Mapped Spec ID | Description                                                        |
| ----------------------------------- | ------------------------ | -------------- | ------------------------------------------------------------------ |
| `VALIDATION_FAILED`                 | 400 Bad Request          | `ERR-001`      | Request payload failed schema validation.                          |
| `AUTHENTICATION_FAILED`             | 401 Unauthorized         | `ERR-002`      | Invalid credentials or expired access token.                       |
| `ACCESS_FORBIDDEN`                  | 403 Forbidden            | `ERR-002`      | Insufficient role privilege or object-level authorization failure. |
| `RESOURCE_NOT_FOUND`                | 404 Not Found            | `ERR-001`      | Requested package, destination, or booking not found.              |
| `INVENTORY_CAPACITY_EXCEEDED`       | 409 Conflict             | `ERR-003`      | Requested party size exceeds remaining departure seats.            |
| `INVENTORY_HOLD_EXPIRED`            | 410 Gone                 | `ERR-004`      | 15-minute reservation hold window elapsed without payment.         |
| `PAYMENT_GATEWAY_REJECTED`          | 402 Payment Required     | `ERR-005`      | External payment provider declined transaction.                    |
| `PAYMENT_WEBHOOK_SIGNATURE_INVALID` | 401 Unauthorized         | `ERR-006`      | Inbound gateway callback signature verification failed.            |
| `CANCELLATION_INELIGIBLE`           | 422 Unprocessable Entity | `ERR-007`      | Booking status or departure date violates cancellation policy.     |
| `DOCUMENT_GENERATION_FAILED`        | 500 Internal Error       | `ERR-008`      | PDF rendering engine timeout or template compilation failure.      |
| `RATE_LIMIT_EXCEEDED`               | 429 Too Many Requests    | `ERR-009`      | IP or user request threshold exceeded.                             |
| `CONCURRENT_MUTATION_CONFLICT`      | 409 Conflict             | `ERR-010`      | Optimistic lock collision during admin update.                     |

---

## 5. API Surface & Endpoint Mapping

```
+-----------------------------------------------------------------------------------+
|                            API SURFACE TAXONOMY                                   |
+-----------------------------------------------------------------------------------+
| Public Storefront & Catalog  --> /api/v1/destinations, /themes, /packages, /search|
| Identity & Customer Portal   --> /api/v1/auth, /users, /bookings, /documents      |
| Payment & Checkout Engine    --> /api/v1/checkout, /payments, /webhooks/payment   |
| Administrative Operations    --> /api/v1/admin/* (RBAC Protected Console APIs)    |
+-----------------------------------------------------------------------------------+
```

### 5.1 Public Storefront & Discovery APIs

- `GET /api/v1/storefront/homepage` — Aggregated hero banners, featured destinations, popular themes, and verified testimonials (`FR-STOREFRONT-001..004`).
- `GET /api/v1/destinations` — List all published destinations with thumbnail images (`FR-DEST-001`).
- `GET /api/v1/destinations/:slug` — Destination details and associated packages (`FR-DEST-002`).
- `GET /api/v1/themes` — List all tour theme categories (`FR-THEME-001`).
- `GET /api/v1/packages` — Paginated catalog of packages with multi-criteria filtering (`FR-PACKAGE-001`).
- `GET /api/v1/packages/:slug` — Full package details: day-wise itinerary, inclusions, exclusions, accommodation/meal tiers (`FR-PACKAGE-002..004`, `FR-ITIN-001`).
- `GET /api/v1/packages/:id/availability` — Calendar departure dates with remaining seat counts (`FR-INVENT-001..002`).
- `POST /api/v1/packages/:id/calculate-price` — Authoritative price calculation based on party size, tiers, and date (`FR-CONFIG-002`).
- `GET /api/v1/search` — Multi-criteria search query across destinations, themes, durations, and budgets (`FR-SEARCH-001..004`).

### 5.2 Authentication & Customer Identity APIs

- `POST /api/v1/auth/register` — Register a new customer account (`FR-AUTH-001..002`).
- `POST /api/v1/auth/login` — Authenticate customer or administrator credentials; return JWT + refresh cookie (`FR-AUTH-003..004`).
- `POST /api/v1/auth/refresh` — Issue new short-lived access token using secure refresh cookie.
- `POST /api/v1/auth/logout` — Revoke active session tokens.
- `POST /api/v1/auth/forgot-password` — Trigger password reset email workflow (`FR-AUTH-007`).
- `POST /api/v1/auth/reset-password` — Finalize password reset using secure verification token.
- `GET /api/v1/users/profile` — Get authenticated customer profile (`FR-AUTH-006`).
- `PUT /api/v1/users/profile` — Update customer profile details.
- `GET /api/v1/users/data-export` — Download GDPR/DPDP personal data export JSON (`NFR-PRIV-002`).

### 5.3 Booking & Checkout APIs

- `POST /api/v1/bookings/checkout` — Initiate booking, validate capacity, lock temporary 15-minute seat hold, create booking record in `AWAITING_PAYMENT`, snapshot package/price, provision guest account if needed (`FR-BOOK-001..004`, `FR-INVENT-004`, `DEC-009`).
- `GET /api/v1/bookings/:bookingReference` — Retrieve booking summary and payment status (Customer or Admin access).
- `GET /api/v1/bookings/customer/my-bookings` — List all active and historical bookings for logged-in customer (`FR-DASH-001`).
- `POST /api/v1/bookings/:bookingReference/cancel` — Submit cancellation request; computes eligible refund (`FR-DASH-004`, `FR-CANCEL-001..002`).

### 5.4 Payment & Webhook APIs

- `POST /api/v1/payments/initiate` — Initialize payment gateway session/order ID for active booking hold (`FR-PAY-001`).
- `POST /api/v1/webhooks/payment` — Inbound payment gateway webhook handler; verifies HMAC signature, executes idempotent state transition to `PAID`/`CONFIRMED`, enqueues documents and email notifications (`FR-PAY-002..003`, `FR-CONFIRM-001`, `BR-PAY-001`).
- `GET /api/v1/payments/:bookingReference/status` — Polling fallback for payment verification.

### 5.5 Document Generation & Download APIs

- `GET /api/v1/documents/invoice/:bookingReference/download` — Authenticated request returning signed, time-limited URL for PDF Tax Invoice (`FR-DOC-001..002`, `BR-DOC-001`).
- `GET /api/v1/documents/voucher/:bookingReference/download` — Authenticated request returning signed, time-limited URL for PDF E-Ticket Voucher (`FR-DOC-003..004`, `BR-DOC-001`).

### 5.6 Reviews & Ratings APIs

- `GET /api/v1/reviews/package/:packageId` — Public list of approved reviews and aggregate star ratings (`FR-REVIEW-003`).
- `POST /api/v1/reviews` — Submit tour review; enforces verified completed booking check (`FR-REVIEW-001`, `BR-REVIEW-001`).

### 5.7 Administrative Operations APIs (`/api/v1/admin/*` — RBAC Protected)

- `GET /api/v1/admin/dashboard/kpis` — Operational dashboard metrics (Revenue, Active Bookings, Packages, Users) (`FR-ADMIN-001`).
- `GET /api/v1/admin/packages` | `POST` | `PUT` | `DELETE` — Complete package catalog management (`FR-PACKAGE-005`).
- `POST /api/v1/admin/packages/:id/itineraries` | `PUT` — Day-by-day itinerary editor (`FR-ITIN-002`).
- `GET /api/v1/admin/destinations` | `POST` | `PUT` | `DELETE` — Destination catalog management (`FR-DEST-003`).
- `GET /api/v1/admin/themes` | `POST` | `PUT` | `DELETE` — Tour theme management (`FR-THEME-002`).
- `GET /api/v1/admin/inventory/departures` | `POST` | `PUT` — Departure schedule & seat quota manager (`FR-INVENT-001`).
- `GET /api/v1/admin/inventory/departures/:id/manifest` — Export passenger manifest roster (`FR-ADMIN-004`).
- `GET /api/v1/admin/bookings` — Filterable booking management queue (`FR-ADMIN-002`).
- `POST /api/v1/admin/cancellations/:id/authorize` — Authorize cancellation and trigger financial refund settlement (`FR-CANCEL-003..004`).
- `GET /api/v1/admin/reviews` | `POST /:id/approve` | `POST /:id/reject` — Review moderation console (`FR-REVIEW-002`).
- `GET /api/v1/admin/cms/banners` | `PUT` — Homepage slider CMS editor (`FR-CMS-001`).
- `GET /api/v1/admin/cms/metadata` | `PUT` — Agency legal metadata & contact editor (`FR-CMS-002`).
- `GET /api/v1/admin/cms/pages` | `PUT` — About Us & Terms static page editor (`FR-CMS-003`).
- `GET /api/v1/admin/reports/revenue` — Aggregate financial and revenue reporting (`FR-REPORT-001`).
- `GET /api/v1/admin/audit-logs` — Immutable administrative and financial audit log viewer (`NFR-AUDIT-001`).

---

## 6. Webhook Protocol & Security Specification

```
[External Gateway] ──(POST /api/v1/webhooks/payment)──► [API Server]
   Headers:
     X-Razorpay-Signature / Stripe-Signature: <HMAC-SHA256>
   Payload:
     {
       "event": "payment.captured",
       "id": "evt_1092837482",
       "data": {
         "order_id": "order_9921",
         "payment_id": "pay_882910",
         "amount": 4500000,
         "currency": "INR",
         "status": "captured"
       }
     }
```

1. **Signature Verification:** Backend computes `HMAC_SHA256(raw_body, webhook_secret)` and performs constant-time comparison against header signature.
2. **Idempotency Guard:** Queries `payment_events` table for `event_id`. If exists, returns HTTP 200 immediately.
3. **Transaction Execution:** Atomically records payment success, advances booking state, unlocks confirmation documents, and emits domain events.

---

_End of Document DOC-ARCH-0.4.5 (API Architecture & Interface Specification)._
