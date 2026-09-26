# Phase 6 — Payments, Invoicing & Document Fulfillment Architecture & Implementation Plan

**Project:** Young Tours & Travels  
**Phase:** 6 — Payments, Webhook Processing, Invoicing & Document Fulfillment  
**Document:** Master Architecture & Engineering Implementation Plan  
**Status:** **STEP 0 — DISCOVERY & ARCHITECTURE PLAN (DOCUMENTATION-ONLY • NO CODE)** [DECISION]  
**Baseline Commit:** `9583cfc` (`feat(frontend): integrate customer booking checkout flow`)

---

## 1. Executive Summary & Objective

Phase 6 introduces the core **Payment Processing, Webhook Ingestion, Invoicing, and Travel Voucher Fulfillment Engine** for Young Tours & Travels. Building on the frozen Phase 5 Booking Engine baseline (`64c168f` / `9583cfc`), Phase 6 establishes:

1. **Provider-Agnostic Payment Adapter Architecture (`ADR-007`)**: Standardized `PaymentGatewayAdapter` domain interface decoupling business logic from external gateway SDKs (Razorpay, Stripe, Mock/Sandbox).
2. **Payment Lifecycle & State Machine**: Isolated payment transactional tracking (`INITIATED`, `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`) linked to the canonical Booking State Machine (`AWAITING_PAYMENT` -> `CONFIRMED` / `EXPIRED`).
3. **Cryptographic Webhook Ingestion & Deduplication**: High-throughput HMAC SHA-256 signature verification and unique event ledger (`payment_events(provider, event_id)`) providing mathematical idempotency against duplicate delivery (`NFR-REL-002`, `RSK-02`).
4. **Resilient Booking Confirmation Integration**: Seamless handoff to Phase 5 `bookingService.confirmBooking()` under strict pessimistic lock ordering (`departure_schedules -> bookings -> inventory_holds`).
5. **Late Payment & Expired Hold Defense**: Deterministic rejection of late payments against expired holds (`INVENTORY_HOLD_EXPIRED`) with automated orphan settlement/refund workflows, preventing overbooking.
6. **Asynchronous PDF Document Generation (`ADR-010`)**: Puppeteer-based worker compilation for statutory GST Tax Invoices (`INV-YYYYMM-XXXX`) and E-Ticket Vouchers (`VCH-YYYYMMDD-XXXX`).
7. **Secure Document Archival & Signed Access (`ADR-008`)**: Private object storage persistence with authenticated, time-limited 15-minute pre-signed download URLs.
8. **Statutory Tax Compliance**: 7-year immutable audit retention for tax invoices and financial settlement ledgers.

---

## 2. Hard Architectural Constraints & Scope Boundaries

```
+-----------------------------------------------------------------------------+
|                      PHASE 5: BOOKING ENGINE (FROZEN)                       |
|  - Booking creation in AWAITING_PAYMENT status                              |
|  - 15-minute temporary inventory holds (SELECT ... FOR UPDATE)              |
|  - Passenger manifest generation & self-service cancellation                |
|  - Authoritative booking state machine (AWAITING_PAYMENT, CONFIRMED, ...)   |
+-----------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------+
|                   PHASE 6: PAYMENTS & INVOICING (CURRENT)                   |
|  - Provider-agnostic PaymentGatewayAdapter interface                        |
|  - Razorpay / Stripe / Mock gateway driver implementations                  |
|  - Payment initiation (POST /api/v1/payments/initiate)                      |
|  - Webhook ingestion (POST /api/v1/webhooks/payment) + HMAC verification     |
|  - Idempotent payment event logging (payment_events)                        |
|  - Booking confirmation execution via bookingService.confirmBooking()       |
|  - Late payment handling & refund settlement workflow                       |
|  - BullMQ async document generation workers (Invoices & Vouchers)           |
|  - Private S3-compatible storage with 15-min signed download URLs           |
|  - Frontend payment gateway checkout modal integration                      |
+-----------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------+
|              PHASE 7+: POST-BOOKING REVIEWS, CMS & NOTIFICATIONS            |
|  - Tour reviews & moderation (POST /api/v1/reviews)                         |
|  - CMS content administration & marketing banners                           |
|  - Production SMS transport adapters (Twilio / Gupshup)                     |
+-----------------------------------------------------------------------------+
```

---

## 3. Authoritative Architectural Traceability

| Requirement ID       | Type | Component          | Architecture Reference         | API Endpoint                                     | Domain Invariant                                                          | Verification Test  |
| :------------------- | :--- | :----------------- | :----------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------ | :----------------- |
| **`FR-PAY-001`**     | MUST | Payment Adapter    | `DR-008` (Payments), `ADR-007` | `POST /api/v1/payments/initiate`                 | Server-authoritative amount in minor units; order tokenization            | `TEST-PAY-001`     |
| **`FR-PAY-002`**     | MUST | Webhook Controller | `DR-008`, `NFR-SEC-004`        | `POST /api/v1/webhooks/payment`                  | Cryptographic HMAC SHA-256 raw body signature check                       | `TEST-PAY-002`     |
| **`FR-PAY-003`**     | MUST | Webhook Controller | `payment_events` table         | `POST /api/v1/webhooks/payment`                  | Unique constraint `(provider, event_id)` idempotency guard                | `TEST-PAY-003`     |
| **`FR-CONFIRM-001`** | MUST | Booking Domain     | `booking.service.ts`           | Internal Hook / Webhook                          | Atomic transition `AWAITING_PAYMENT -> CONFIRMED` + `ACTIVE -> COMMITTED` | `TEST-CONFIRM-001` |
| **`FR-DOC-001`**     | MUST | Document Worker    | `DR-009` (Invoices), `ADR-010` | BullMQ Document Queue                            | Decoupled asynchronous PDF generation via Puppeteer                       | `TEST-DOC-001`     |
| **`FR-DOC-002`**     | MUST | Invoice Template   | `DR-009`, `DR-014`             | Worker PDF Engine                                | Statutory GST compliance, itemized tax, HSN/SAC codes                     | `TEST-DOC-002`     |
| **`FR-DOC-003`**     | MUST | Voucher Worker     | `DR-010` (Vouchers)            | BullMQ Document Queue                            | E-Ticket voucher rendering with QR/booking reference                      | `TEST-DOC-003`     |
| **`FR-DOC-004`**     | MUST | Backend API        | `DR-009`, `DR-010`, `ADR-008`  | `GET /api/v1/documents/:type/:ref/download`      | Object-level ownership check + 15-min signed S3 URL                       | `TEST-DOC-004`     |
| **`FR-CANCEL-004`**  | MUST | Refund Settlement  | `DR-012` (Refunds)             | `POST /api/v1/admin/cancellations/:id/authorize` | Gateway refund execution + database settlement audit                      | `TEST-CANCEL-004`  |

---

## 4. Payment Lifecycle & State Machine

```
               [Customer Initiates Payment]
                            │
                            ▼
                     ┌──────────────┐
                     │  INITIATED   │
                     └──────┬───────┘
                            │
               [Provider Order / Session Created]
                            │
                            ▼
                     ┌──────────────┐
                     │   PENDING    │
                     └──────┬───────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
  [Webhook: Payment Success]      [Webhook: Payment Failed / Expired]
            │                               │
            ▼                               ▼
     ┌──────────────┐                ┌──────────────┐
     │   SUCCESS    │                │    FAILED    │
     └──────┬───────┘                └──────────────┘
            │
  [Cancellation / Refund Authorized]
            │
            ▼
     ┌──────────────┐
     │   REFUNDED   │ (Full or Partial Settlement)
     └──────────────┘
```

### State Mapping: Booking vs. Payment

| Booking State      | Payment State | Trigger / Event                                  | Authoritative Outcome                                                                                                                                                   |
| :----------------- | :------------ | :----------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWAITING_PAYMENT` | `INITIATED`   | `POST /api/v1/payments/initiate`                 | Payment transaction row created; gateway order token issued to client.                                                                                                  |
| `AWAITING_PAYMENT` | `SUCCESS`     | Inbound Webhook verified + unexpired active hold | `bookingService.confirmBooking()` succeeds: Booking -> `CONFIRMED`, Hold -> `COMMITTED`, `departure.booked_seats` incremented.                                          |
| `AWAITING_PAYMENT` | `SUCCESS`     | Inbound Webhook verified + expired hold          | `bookingService.confirmBooking()` fails (`INVENTORY_HOLD_EXPIRED`): Booking remains `EXPIRED`. Payment flagged as `ORPHAN_UNALLOCATED` and queued for automatic refund. |
| `AWAITING_PAYMENT` | `FAILED`      | Inbound Webhook / Provider decline               | Payment marked `FAILED`. Booking remains `AWAITING_PAYMENT` until 15-min hold expiry.                                                                                   |
| `CONFIRMED`        | `SUCCESS`     | Duplicate Webhook delivered                      | Idempotent skip: `payment_events` unique constraint catches replay; returns HTTP 200 OK without re-running confirmation.                                                |
| `CONFIRMED`        | `REFUNDED`    | Admin authorizes cancellation refund             | `refund_settlements` row committed; gateway refund issued via adapter driver.                                                                                           |

---

## 5. Security & Trust Boundaries

1. **Client Untrusted for Payment Authority**:
   - The frontend NEVER confirms a booking.
   - Client-side callbacks (e.g. `handler(response)` in checkout SDK) are treated strictly as UI hints to initiate polling or show a pending spinner.
   - Confirmation is committed **ONLY** upon cryptographically verified backend webhook or authenticated server-to-server gateway verification.
2. **Cryptographic HMAC SHA-256 Verification**:
   - Inbound webhooks must validate signatures against the raw binary request payload before JSON parsing.
   - Secrets are managed via environment variables (`PAYMENT_WEBHOOK_SECRET`).
3. **Mathematical Webhook Idempotency**:
   - Table `payment_events` enforces a strict unique constraint on `(provider, event_id)`.
   - Replayed webhook requests are detected at the database layer and return an immediate idempotent HTTP 200 without duplicate execution.
4. **PCI-DSS Cardholder Data Isolation**:
   - The platform never stores, processes, or logs primary account numbers (PAN), CVVs, or cardholder credentials.
   - All card data is handled strictly within provider-hosted iframes / checkout modals.
5. **Monetary Integer Integrity**:
   - All amounts are computed and validated in integer minor units (e.g. paise, cents) using `shared/src/utils/money.ts`.
   - Client-supplied price values are completely ignored.

---

## 6. Document Generation & Storage Architecture

1. **Decoupled Asynchronous Processing (`ADR-010`)**:
   - Booking confirmation commits to PostgreSQL in `< 50ms`.
   - Confirmation never waits for PDF rendering.
   - Upon successful confirmation, an asynchronous job is dispatched to BullMQ queue `document-generation-queue`.
2. **Statutory Tax Invoice (`INV-YYYYMM-XXXX`)**:
   - Compiled using server-side HTML/CSS templates via headless Puppeteer.
   - Itemizes package base price, GST breakdown (CGST/SGST or IGST), customer details, SAC code `998555` (Tour Operator Services), and digital verification watermark.
3. **E-Ticket Voucher (`VCH-YYYYMMDD-XXXX`)**:
   - Contains departure schedule, verified passenger roster, emergency contact, itinerary snapshot, inclusions/exclusions, and booking reference QR code.
4. **Private Storage & Pre-Signed URL Access (`ADR-008`)**:
   - PDF files are uploaded to private S3-compatible object storage under keys: `invoices/{bookingRef}_{hash}.pdf` and `vouchers/{bookingRef}_{hash}.pdf`.
   - Downloads via `GET /api/v1/documents/:type/:bookingReference/download` enforce authenticated customer ownership and return 15-minute temporary signed URLs.

---

## 7. Step-by-Step Implementation Roadmap

```
Phase 6
 ├── Step 0: Discovery, Architecture Audit & Implementation Plan (Current)
 ├── Step 1: Database Migrations & Data Model (Payments, Events, Invoices, Vouchers, Refunds)
 ├── Step 2: Shared Contracts & Zod Schemas (@travel-web/shared)
 ├── Step 3: Payment, Event & Document Repositories
 ├── Step 4: Provider-Agnostic Payment Adapter Engine (Interface, Razorpay, Stripe, Mock)
 ├── Step 5: Payment Initiation & Polling APIs
 ├── Step 6: Webhook Processing & HMAC Cryptographic Ingestion
 ├── Step 7: Booking Confirmation & Expired Hold Race Hardening
 ├── Step 8: Puppeteer PDF Generation Worker & Private S3 Storage Integration
 ├── Step 9: Customer & Admin Document Download APIs (15-min Signed URLs)
 ├── Step 10: Cancellation Refund Processing & Financial Settlement Engine
 ├── Step 11: Frontend Payment Modal & Checkout Integration
 └── Step 12: End-to-End Concurrency, Webhook Replay & Security Hardening
```

---

_End of Phase 6 Master Implementation Plan._
