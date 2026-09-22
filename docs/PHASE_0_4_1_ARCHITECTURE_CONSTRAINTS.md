# Phase 0.4.1 — Architecture Constraint Analysis

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Blueprint  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md)
- [docs/PHASE_0_3_FINAL_AUDIT.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_FINAL_AUDIT.md)
- [docs/PHASE_0_2_PRODUCT_DEFINITION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_2_PRODUCT_DEFINITION.md)
- [docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md)

---

## 1. Document Control

| Property            | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.1`                                                          |
| **Document Title**  | Architecture Constraint Analysis                                          |
| **Current Version** | `1.0.0` (Technical Architecture Baseline)                                 |
| **Author Roles**    | Lead System Architect, Enterprise Solutions Architect, Security Architect |
| **Target Audience** | Engineering Team, Solution Architects, DevOps/Platform Engineers          |

---

## 2. Purpose & Context

The purpose of this document is to analyze and derive all **technical and architectural constraints** directly from the frozen [Phase 0.3 Requirements Specification](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md).

By establishing explicit business, functional, non-functional, integration, and operational boundaries before selecting specific technologies, the architecture guarantees that:

1. Every architectural mechanism traces directly to verified product requirements.
2. The architecture is production-oriented and robust without suffering from premature over-engineering.
3. System boundaries (Frontend, Backend, Database, Document Generation, Notifications, External Providers) remain decoupled, testable, and evolvable.

---

## 3. Business Constraints

Derived from Phase 0.2 Product Definition and Phase 0.3 Canonical Decision Register:

| ID        | Canonical Decision                | Business Constraint Statement                                                                                                                            | Architectural Implication                                                                                                                                           |
| --------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BC-01** | `DEC-001` (Branding)              | The system must operate under the canonical brand name "Young Tours & Travels" (working code: `Travel-Web`).                                             | Application metadata, UI headers/footers, and legal invoice headers must be centrally parameterized.                                                                |
| **BC-02** | `DEC-002` (Business Model)        | The platform is a **Direct Tour Operator Platform**, not an open multi-vendor marketplace.                                                               | The system manages agency-owned packages and inventory. Multi-vendor seller dashboards and split-escrow payouts are strictly out of scope for MVP-1.                |
| **BC-03** | `DEC-003` (Confirmation Paradigm) | Automated booking confirmation upon successful payment callback is the primary baseline; manual admin approval must remain architecturally configurable. | The booking state machine must support both instant confirmation (`PAID` → `CONFIRMED`) and conditional manual review (`PAID` → `AWAITING_APPROVAL` → `CONFIRMED`). |
| **BC-04** | `DEC-004` (Agent Scope)           | Dedicated Travel Agent workspace is deferred to Phase 2 (`ACT-AGENT`).                                                                                   | Architecture must enforce clean Role-Based Access Control (RBAC) so an Agent role can be introduced in Phase 2 without altering core domain entities.               |
| **BC-05** | `DEC-005` (Base Currency)         | Base operating currency is parameterized (Default: `INR ₹`, alternative: `USD $`).                                                                       | All monetary values must be stored in exact integer base currency units (e.g., minor units / paise or high-precision decimal) with localized formatting utilities.  |
| **BC-06** | `DEC-006` (Payment Semantics)     | MVP-1 enforces 100% full upfront digital payment for booking confirmation.                                                                               | Booking confirmation requires 100% verified settlement before seat allocation is finalized.                                                                         |
| **BC-07** | `DEC-007` (Cancellation Policy)   | Cancellation refunds follow dynamic, policy-driven tiered schedules.                                                                                     | The cancellation module must evaluate rules dynamically against booking-associated policies rather than hardcoding business logic.                                  |
| **BC-08** | `DEC-008` (Transport Scope)       | MVP-1 utilizes descriptive transport inclusions (Flight/Train/Bus details in itinerary).                                                                 | Live GDS flight booking integration is partitioned to Phase 3; data model stores rich descriptive transport inclusions.                                             |
| **BC-09** | `DEC-009` (Customer Account)      | Frictionless Guest Checkout with automated customer account creation is required.                                                                        | The checkout service must seamlessly bind guest contact info to an auto-provisioned or existing customer account record.                                            |
| **BC-10** | `DEC-010` (Legacy Scrubbing)      | Obsolete 2001-era legacy templates (Java/WinXP/IE6) are deprecated.                                                                                      | Zero legacy architecture or tooling constraints apply; system must target modern cloud-native standards.                                                            |

---

## 4. Functional Constraints

Mapping the 20 Functional Requirement groups from Phase 0.3 Section 11 to core architectural constraints:

```
+-------------------------------------------------------------------------------+
|                       FUNCTIONAL ARCHITECTURE CONSTRAINTS                     |
+-------------------------------------------------------------------------------+
| Storefront & Discovery  --> Public Stateless Caching, SEO Prerendering        |
| Auth & Identity         --> Token/Session Based RBAC, Salted Password Hashing |
| Catalog & Itineraries   --> Structured Relational Hierarchies, Rich Media CDN |
| Inventory Scheduling    --> Atomic Quota Tracking, Temporary Reservation Locks |
| Configuration & Pricing --> Dynamic Server-Side Price Calculation & Snapshots |
| Booking Engine          --> Transactional State Machine, Reference Codes      |
| Payment Processing      --> Idempotent Webhook Callbacks, External Isolation  |
| Document Generation     --> Asynchronous PDF Rendering, Immutable Archiving   |
| Customer Portal         --> Self-Service History, Secure 1-Click Downloads    |
| Cancellation / Refund   --> Policy Rule Engine, Financial Audit Trail         |
| Administration & CMS    --> RBAC Privilege Isolation, Manifest Exports        |
| Notifications           --> Event-Driven Asynchronous Dispatch Pipeline       |
+-------------------------------------------------------------------------------+
```

| Functional Domain               | Key Requirement IDs                       | Architectural Constraints & Requirements                                                                                                                                           |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public Storefront**           | `FR-STOREFRONT-001..006`                  | Public read access without authentication; fast CDN-friendly response times; responsive layout; metadata parameterized from CMS.                                                   |
| **Authentication & Accounts**   | `FR-AUTH-001..008`                        | Secure password hashing; unique email constraint; role separation (`Customer` vs. `Administrator`); guest account auto-provisioning.                                               |
| **Destinations & Themes**       | `FR-DEST-001..003`, `FR-THEME-001..002`   | Relational categorization; admin CRUD capabilities; slug-based routing for SEO.                                                                                                    |
| **Package & Itinerary Catalog** | `FR-PACKAGE-001..006`, `FR-ITIN-001..002` | Master-detail relationship (Package → Itinerary Days, Inclusions, Accommodation Tiers, Departure Dates); immutable publication gate (`BR-PKG-001`).                                |
| **Availability & Inventory**    | `FR-INVENT-001..005`                      | Departure seat capacity quotas; atomic seat decrementing; 15-minute temporary reservation hold mechanism (`BR-INVENT-002`); automated hold expiration timer.                       |
| **Search & Filtering**          | `FR-SEARCH-001..004`                      | Multi-criteria indexing (destination, theme, budget, duration); case-insensitive substring search; sub-500ms query execution.                                                      |
| **Pricing & Configuration**     | `FR-CONFIG-001..003`                      | Real-time server-validated price calculation based on party size and tier selections; complete price transparency before payment (`BR-PRICE-001`).                                 |
| **Booking Engine**              | `FR-BOOK-001..005`                        | Unique booking reference generation (`BK-YYYYMMDD-XXXX`); passenger roster persistence; immutable historical snapshot of package & price (`FR-BOOK-003`); state machine lifecycle. |
| **Payment Processing**          | `FR-PAY-001..003`                         | External payment gateway abstraction; cryptographic signature verification for webhooks; transaction idempotency keys (`BR-PAY-001`); PCI card data isolation.                     |
| **Booking Confirmation**        | `FR-CONFIRM-001..003`                     | State transition triggered by verified payment callback; generation of immutable document records; confirmation UX screen with download links.                                     |
| **Document Generation**         | `FR-DOC-001..004`                         | Automated rendering of legal Tax Invoices (`DR-009`) and E-Ticket Vouchers (`DR-010`) into standard PDF format; secure authenticated download URLs (`BR-DOC-001`).                 |
| **Customer Dashboard**          | `FR-DASH-001..004`                        | Customer-isolated query boundary (customers view only their own bookings); direct voucher download; self-service cancellation initiation.                                          |
| **Cancellation & Refund**       | `FR-CANCEL-001..004`                      | Rule-based refund calculation (`DEC-007`); admin review/authorization queue; financial refund settlement record (`DR-012`); inventory seat restoration upon cancellation.          |
| **Reviews & Testimonials**      | `FR-REVIEW-001..003`                      | Completed booking verification gate (`BR-REVIEW-001`); admin moderation workflow (`PENDING` → `APPROVED`); public display of approved ratings.                                     |
| **Admin Operations**            | `FR-ADMIN-001..004`                       | Elevated privilege isolation; aggregate KPI computation; booking filtering; passenger departure manifest generation and export.                                                    |
| **CMS Management**              | `FR-CMS-001..003`                         | Admin maintenance of homepage hero banners, agency metadata, and static policy pages without redeployment.                                                                         |
| **Transactional Notifications** | `FR-NOTIFY-001..003`                      | Asynchronous event dispatching; decoupling of notification triggers from email delivery provider (`ACT-EXT-MAIL`); template rendering.                                             |
| **Reporting**                   | `FR-REPORT-001..002`                      | Aggregated analytics across bookings, revenue, destinations, and themes; date-range filtering.                                                                                     |

---

## 5. Non-Functional Constraints

Derived from Phase 0.3 Section 12 Quality Constraints:

```
+-----------------------------------------------------------------------------------+
|                        NON-FUNCTIONAL QUALITY CONSTRAINTS                         |
+-----------------------------------------------------------------------------------+
| Performance   | Homepage < 2.0s TTFB/FCP, Search < 500ms, Document Gen < 3.0s     |
| Scalability   | 100 concurrent checkout sessions without quota overselling        |
| Availability  | 99.5% operational uptime; graceful degradation on 3rd party outage |
| Reliability   | Strict ACID transactions for seats/payments; webhook idempotency  |
| Security      | 8 SEC domains: TLS, Hashing, SQLi/XSS/CSRF defense, RBAC, PCI-DSS  |
| Privacy       | PII segregation, customer data deletion/export capability         |
| Auditability  | Immutable financial ledger & administrative action audit logging   |
| Accessibility | WCAG 2.1 Level AA compliant semantic HTML & keyboard navigation   |
| Compatibility | Modern evergreen browsers (Chrome, Edge, Safari, Firefox, Mobile) |
| Maintainability| Modular decoupling, 100% traceable tests, clean architecture       |
+-----------------------------------------------------------------------------------+
```

### 5.1 Performance & Latency Constraints (`NFR-PERF-001..003`)

- **Storefront Pages:** Initial page load and catalog rendering must complete within `< 2.0 seconds` under standard broadband connections.
- **Search Execution:** Multi-criteria search and filter queries must return in `< 500 milliseconds`.
- **Document Rendering:** PDF Tax Invoice and E-Ticket generation must complete within `< 3.0 seconds` post-confirmation.

### 5.2 Scalability & Concurrency Constraints (`NFR-SCALE-001..002`)

- The architecture must support at least **100 concurrent checkout sessions** without inventory race conditions or double-booking.
- Catalog browsing and read operations must scale horizontally via caching without degrading transactional checkout throughput.

### 5.3 Availability & Fault Tolerance Constraints (`NFR-AVAIL-001..002`)

- **Uptime Target:** 99.5% scheduled operational availability.
- **Resilience:** Unavailability of non-critical third-party services (e.g. Email delivery or SMS) must not block core booking persistence or payment processing.

### 5.4 Data Integrity & Reliability Constraints (`NFR-REL-001..003`)

- **Atomic Seat Quotas:** Inventory deduction must be strictly atomic (`NFR-REL-001`). No two concurrent requests may allocate the same physical seat.
- **Payment Idempotency:** Webhook processing must use unique payment transaction IDs (`NFR-REL-002`) to guarantee that duplicate callbacks do not produce duplicate confirmations or charges.
- **Data Durability:** Point-in-time database recovery with zero loss of confirmed financial transactions (`NFR-REL-003`).

### 5.5 Security & Privacy Constraints (`NFR-SEC-001..008`, `NFR-PRIV-001..002`)

- **Encryption in Transit:** All communications must enforce modern transport layer encryption (`NFR-SEC-001`).
- **Credential Protection:** Passwords hashed with salted, adaptive cryptographic algorithms (`NFR-SEC-002`).
- **Application Defenses:** Strict defense against SQL Injection (`NFR-SEC-003`), Cross-Site Scripting (`NFR-SEC-004`), and Cross-Site Request Forgery (`NFR-SEC-005`).
- **Role-Based Privilege Isolation:** Complete architectural separation between public customer routes and administrative endpoints (`NFR-SEC-006`).
- **Abuse Prevention:** Rate limiting on authentication, search, and checkout endpoints (`NFR-SEC-007`).
- **PCI-DSS Cardholder Isolation:** The platform must never ingest, store, or process raw credit card numbers, CVVs, or bank PINs (`NFR-SEC-008`). External payment tokenization only.
- **PII Protection & Retention:** Customer personal data must be protected, exportable, and subject to statutory retention limits (`NFR-PRIV-001..002`).

### 5.6 Auditability Constraints (`NFR-AUDIT-001..002`)

- Every financial transaction state change (initiated, paid, failed, refunded) and administrative CRUD mutation must produce an append-only, immutable audit log entry recording timestamp, actor, IP address, and payload delta.

---

## 6. Integration Constraints

```
+--------------------------------------------------------------------------------+
|                             INTEGRATION TOPOLOGY                               |
+--------------------------------------------------------------------------------+
|  [Young Tours & Travels System]                                                |
|       |                                                                        |
|       +--- (HTTPS Webhook / REST) ---> [External Payment Gateway: ACT-EXT-PAY] |
|       |                                                                        |
|       +--- (SMTP / REST API) --------> [Transactional Email: ACT-EXT-MAIL]     |
|       |                                                                        |
|       +--- (Asynchronous Engine) ----> [PDF Document Generator: ACT-SYS-DOCGEN]|
|       |                                                                        |
|       +--- (Future Phase 1.1 / 3) ---> [SMS Gateway & Flight GDS Services]     |
+--------------------------------------------------------------------------------+
```

1. **Payment Gateway Provider (`ACT-EXT-PAY`):**
   - Communication via TLS REST API for order creation and checkout session initialization.
   - Inbound asynchronous HTTPS webhooks for payment verification.
   - Mandatory cryptographic signature validation on all inbound callbacks.
   - Provider-agnostic adapter layer to avoid tight coupling to a single vendor.
2. **Transactional Email Service (`ACT-EXT-MAIL`):**
   - Asynchronous dispatch of booking confirmations, invoices, and password resets.
   - Decoupled from HTTP request-response cycle to prevent API latency degradation.
3. **PDF Document Generation Engine (`ACT-SYS-DOCGEN`):**
   - Capability to render styled HTML templates into pixel-perfect, compliant PDF documents for Tax Invoices and E-Tickets.
   - Secure storage in private object storage with signed time-limited download URLs.
4. **Future External Providers (Phase 1.1 SMS, Phase 3 Flight GDS):**
   - Clean interface boundaries allowing future adapter plugins without modifying core booking logic.

---

## 7. Architectural Assumptions & Boundaries

### What the Architecture MUST Assume

1. **Relational Consistency:** Booking inventory, financial transactions, customer accounts, and catalog hierarchies require ACID guarantees and relational foreign key constraints.
2. **Stateless Application Tier:** Backend API application servers must remain stateless to enable trivial horizontal scaling and zero-downtime rolling updates.
3. **Centralized Authority:** The backend API server is the single source of truth for pricing calculations, seat capacity, authentication tokens, and state transitions. The client UI is untrusted.

### What the Architecture MUST NOT Assume

1. **Client-Side Pricing Trust:** The architecture must NEVER accept price values or discounts submitted directly by the client browser.
2. **Synchronous Webhook Guarantee:** The architecture must NOT assume webhooks will arrive immediately or in exact chronological order; state machines must handle out-of-order and duplicate events idempotently.
3. **Vendor Lock-In:** Core business logic must NOT directly depend on vendor-specific proprietary SDKs; all external interactions must be mediated by abstract interface adapters.

---

_End of Document DOC-ARCH-0.4.1 (Architecture Constraint Analysis)._
