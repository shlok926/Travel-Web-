# Phase 0.3 — Requirements Specification (Canonical Frozen Baseline)

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Author Roles:** Senior Business Analyst, Product Requirements Architect, Systems Analyst, QA/Test Architect, Security Requirements Analyst  
**Document Status:** Canonical Frozen Specification Baseline  
**Upstream Baselines:**

- [docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_1_EXISTING_SYSTEM_AUDIT.md)
- [docs/PHASE_0_2_PRODUCT_DEFINITION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_2_PRODUCT_DEFINITION.md)
- [docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md)
- [docs/PHASE_0_3_FINAL_AUDIT.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_FINAL_AUDIT.md)

---

## 1. Document Control

| Property                    | Value                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| **Document Title**          | Phase 0.3 — Implementation-Independent Requirements Specification       |
| **Document ID**             | `DOC-REQ-SPEC-0.3`                                                      |
| **Current Version**         | `3.0.0` (Canonical Frozen Baseline)                                     |
| **Document Classification** | Engineering Requirements & Verification Baseline                        |
| **Upstream Baseline**       | `PHASE_0_2_PRODUCT_DEFINITION.md` (Product Vision & Domain Definition)  |
| **Audit Companion**         | `PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md` & `PHASE_0_3_FINAL_AUDIT.md` |
| **Downstream Target**       | Phase 0.4 (System Architecture, API Contracts & Technical Design)       |

---

## 2. Purpose

The objective of this document is to establish a **precise, implementation-independent, testable, and internally consistent Requirements Specification** for the Young Tours & Travels platform.

This specification answers:

> **"What exactly must the product do, for whom, under which business rules, with what measurable acceptance conditions?"**

It defines functional behaviors across 20 product domains, non-functional quality constraints (performance, security, reliability, auditability, accessibility), conceptual data requirements, error/failure behaviors, use cases, formal Given/When/Then acceptance criteria covering 100% of MUST functional requirements, and full end-to-end requirement traceability.

This specification strictly avoids prematurely prescribing programming languages, frameworks, database schemas, ORMs, cloud platforms, background queues, or physical architecture patterns.

---

## 3. Scope

- **In Scope for Specification:** All functional and quality requirements necessary to support the complete Customer Booking and Administrator Operations lifecycle for the initial product release (MVP-1), along with explicitly partitioned roadmap enhancements (MVP-1.1, Phase 2, Phase 3).
- **Out of Scope for Specification:** Physical database schema designs (DDL), API route paths (`/api/v1/...`), network topology, hosting infrastructure choices, and third-party vendor SDK selections.

---

## 4. Product Context & Operational Baseline

The platform operates as a centralized web portal enabling travellers to discover, evaluate, configure, book, and pay for curated tour packages, while empowering agency administrators to manage the catalog, schedule departure capacities, oversee booking fulfillment, and maintain public CMS content.

The system enforces strict operational integrity between **inventory capacity**, **customer booking state**, and **financial payment state**.

---

## 5. Actors

```
                                  +-------------------+
                                  |    ACTOR MODEL    |
                                  +-------------------+
                                            |
         +----------------------------------+---------------------------------+
         |                                  |                                 |
         v                                  v                                 v
+------------------+              +-------------------+             +-------------------+
|   HUMAN ACTORS   |              |   SYSTEM ACTORS   |             | EXTERNAL SERVICES |
+------------------+              +-------------------+             +-------------------+
| - ACT-GUEST      |              | - ACT-SYS-TIMER   |             | - ACT-EXT-PAY     |
| - ACT-CUST       |              | - ACT-SYS-DOCGEN  |             | - ACT-EXT-MAIL    |
| - ACT-ADMIN      |              | - ACT-SYS-INVENT  |             | - ACT-EXT-SMS     |
| - ACT-AGENT (P2) |              +-------------------+             +-------------------+
+------------------+
```

| Actor ID           | Name                 | Role Classification          | Scope & Responsibilities                                                                                                               | In MVP-1?          | Evidence                                                            |
| ------------------ | -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| **ACT-GUEST**      | Guest User           | Human Actor                  | Unauthenticated visitor browsing public storefront, discovering packages, viewing destinations and itineraries.                        | **YES**            | `[DOCUMENTATION]` Synopsis L4, `[REPOSITORY]` `frontend/index.html` |
| **ACT-CUST**       | Registered Customer  | Human Actor                  | Authenticated traveller managing profile, configuring bookings, paying online, accessing e-tickets/invoices, requesting cancellations. | **YES**            | `[DOCUMENTATION]` Synopsis L28-31, Document §1.2                    |
| **ACT-ADMIN**      | Administrator        | Human Actor                  | Authenticated business operator managing packages, itineraries, seat capacity, booking approvals, revenue, and CMS content.            | **YES**            | `[DOCUMENTATION]` Synopsis L22-27, Document §6                      |
| **ACT-AGENT**      | Travel Agent         | Human Actor (Phase 2)        | Assigned tour guide/agent coordinating customer logistics and managing group itineraries.                                              | **NO (Phase 2)**   | `[DOCUMENTATION]` Document §1.3, §1012                              |
| **ACT-SYS-TIMER**  | Expiration Timer     | System Actor                 | Background business process releasing temporary seat holds when checkout sessions exceed configured duration.                          | **YES**            | `[INFERENCE]` Inventory protection mechanism                        |
| **ACT-SYS-DOCGEN** | Document Generator   | System Actor                 | Engine responsible for rendering immutable Tax Invoices and E-Ticket Vouchers upon confirmation.                                       | **YES**            | `[DOCUMENTATION]` Synopsis L50-52                                   |
| **ACT-SYS-INVENT** | Inventory Controller | System Actor                 | System entity validating departure seat capacity and managing atomic seat allocation.                                                  | **YES**            | `[DOCUMENTATION]` Document L149                                     |
| **ACT-EXT-PAY**    | Payment Provider     | External Service             | External payment gateway processing digital transactions (UPI, Cards, Net Banking, Wallets).                                           | **YES**            | `[DOCUMENTATION]` Synopsis L46-49                                   |
| **ACT-EXT-MAIL**   | Email Service        | External Service             | External transactional email delivery service for booking confirmations and receipts.                                                  | **YES**            | `[DOCUMENTATION]` Synopsis L64                                      |
| **ACT-EXT-SMS**    | SMS Service          | External Service (Phase 1.1) | External SMS service for instant booking alerts.                                                                                       | **NO (Phase 1.1)** | `[DOCUMENTATION]` Synopsis L64                                      |

---

## 6. Personas

- **Customer Persona (The Leisure Traveller):** Aarav Mehta — Seeking transparent package pricing, clear day-by-day itineraries, explicit accommodation/meal tiers, frictionless checkout, and instant access to downloadable vouchers.
- **Administrator Persona (Tour Operations Manager):** Priya Sharma — Managing package CRUD, scheduling departure dates, monitoring seat allocations to prevent double-booking, reviewing transaction reports, and processing policy-compliant cancellations.

---

## 7. Business Goals

- **BG-01:** Enable 24/7 self-service digital discovery, exploration, and booking of curated tour packages.
- **BG-02:** Eliminate manual double-booking errors and capacity scheduling conflicts through real-time inventory validation.
- **BG-03:** Provide 100% transparent pricing with detailed itinerary, accommodation, meal, and inclusion breakdowns.
- **BG-04:** Secure digital revenue collection with automated payment reconciliation and legal tax invoicing.
- **BG-05:** Streamline operational administration for package maintenance, content management, and customer support.

---

## 8. Business Capabilities

- **CAP-STOREFRONT:** Public Storefront & Destination Discovery
- **CAP-AUTH:** Identity, Authentication & Role Access
- **CAP-CATALOG:** Tour Package & Itinerary Management
- **CAP-INVENTORY:** Departure Scheduling & Capacity Protection
- **CAP-SEARCH:** Multi-Criteria Search & Filtering
- **CAP-BOOKING:** Reservation, Party Configuration & Price Locking
- **CAP-PAYMENT:** Multi-Mode Digital Payment Processing
- **CAP-CONFIRM:** Booking State Transitions & Confirmation Workflows
- **CAP-DOCGEN:** Automated Legal Invoicing & E-Ticket Voucher Generation
- **CAP-DASHBOARD:** Customer Self-Service "My Bookings" Portal
- **CAP-CANCEL:** Policy-Driven Cancellation & Refund Queues
- **CAP-REVIEWS:** Post-Trip Verified Reviews & Testimonial Moderation
- **CAP-ADMIN:** Operations Console, Revenue Tracking & User Management
- **CAP-CMS:** Content Management (Sliders, Banners, Static Pages, Agency Details)
- **CAP-NOTIFY:** Transactional Communications (Email / SMS)
- **CAP-REPORTING:** Financial & Operations Reporting

---

## 9. MVP-1 Scope

The initial production release (MVP-1) encompasses the full, closed **Customer Booking + Administrator Operations** loop:

1. Public storefront browsing, destination grid, theme categorization, and static informational pages.
2. Dynamic package catalog with day-by-day itineraries, hotel tiers (Budget, Standard, Luxury), meal options, and inclusion/exclusion lists.
3. Customer authentication (registration, login, profile management, and guest checkout with automatic account association).
4. Real-time departure availability checking with temporary reservation holds during checkout.
5. Self-service party configuration, option selection, and price calculation with snapshot locking.
6. Digital payment integration with transaction state logging and idempotency protection.
7. Automated booking confirmation with 1-click downloadable PDF Tax Invoices and E-Ticket Vouchers.
8. Customer self-service dashboard ("My Bookings") with status tracking and cancellation submission.
9. Administrator console with operational metrics, package CRUD, departure scheduling, booking queues, and testimonial moderation.
10. Automated transactional email notifications on key booking lifecycle milestones.

---

## 10. Out-of-Scope

- Live GDS / airline flight seat selection and live PNR ticketing.
- Multi-vendor marketplace escrow, supplier onboarding portals, and automated split commissions.
- Cryptocurrency or decentralized Web3 payments.
- Public social networking discussion boards and community chat forums.

---

## 11. Functional Requirements

### 11.1 Public Storefront (`FR-STOREFRONT`)

| Req ID                | Requirement Statement                                                                                                                                        | Priority | Status    | Source                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- | ------------------------------------------------------------------------- |
| **FR-STOREFRONT-001** | The system shall display a responsive public homepage accessible to unauthenticated guest users.                                                             | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L4, `[REPOSITORY]` `frontend/index.html`       |
| **FR-STOREFRONT-002** | The homepage shall render a top navigation bar providing access to Destinations, Packages, About Us, Contact Us, and Account Login/Register actions.         | MUST     | CONFIRMED | `[REPOSITORY]` `frontend/index.html:19-29`                                |
| **FR-STOREFRONT-003** | The homepage shall feature an interactive Hero section containing visual banners and a prominent destination search input.                                   | MUST     | CONFIRMED | `[REPOSITORY]` `frontend/index.html:32-42`                                |
| **FR-STOREFRONT-004** | The storefront shall display a curated grid of Featured Destinations including destination imagery, city name, country, and a "View Details" call-to-action. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6, `[REPOSITORY]` `frontend/index.html:45-88` |
| **FR-STOREFRONT-005** | The storefront shall display published Tour Themes allowing users to discover packages by category.                                                          | SHOULD   | CONFIRMED | `[DOCUMENTATION]` Document §5.2                                           |
| **FR-STOREFRONT-006** | The storefront shall render a global footer displaying official company copyright, agency contact information, and links to static legal pages.              | MUST     | CONFIRMED | `[REPOSITORY]` `frontend/index.html:91-93`                                |

### 11.2 Authentication & Account Management (`FR-AUTH`)

| Req ID          | Requirement Statement                                                                                                                                                    | Priority | Status                | Source                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------- | ------------------------------------- |
| **FR-AUTH-001** | The system shall allow new customers to register an account by providing Full Name, Email Address, Password, Mobile Contact, Address, Gender, and Date of Birth.         | MUST     | CONFIRMED             | `[DOCUMENTATION]` Document §4.1, §5.2 |
| **FR-AUTH-002** | The system shall enforce email address uniqueness during customer registration and prevent duplicate accounts with the same email.                                       | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L62        |
| **FR-AUTH-003** | The system shall authenticate registered customers via Email and Password credentials.                                                                                   | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L28-29     |
| **FR-AUTH-004** | The system shall authenticate administrators via a separate secure admin login interface with elevated privilege verification.                                           | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L22-23     |
| **FR-AUTH-005** | The system shall protect stored authentication credentials using an industry-accepted secure password protection mechanism and shall never store passwords in plaintext. | MUST     | CONFIRMED             | `[DOCUMENTATION]` Document §8, §1009  |
| **FR-AUTH-006** | The system shall allow authenticated customers to view and update their personal profile details (Name, Contact, Address, Profile Avatar).                               | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L30        |
| **FR-AUTH-007** | The system shall provide a password reset workflow allowing users to securely reset forgotten credentials.                                                               | SHOULD   | CONFIRMED             | `[DOCUMENTATION]` Synopsis L31        |
| **FR-AUTH-008** | The system shall support guest checkout by creating or associating a customer profile record from the provided checkout contact information upon booking submission.     | MUST     | CONDITIONAL — DEC-009 | `[PHASE-0.2]` Section 34              |

### 11.3 Destination Catalog (`FR-DEST`)

| Req ID          | Requirement Statement                                                                                                                                         | Priority | Status    | Source                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------- |
| **FR-DEST-001** | The system shall maintain a catalog of travel Destinations and Cities including City Name, Country, Geographic Coordinates, Description, and Thumbnail Image. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2 |
| **FR-DEST-002** | The system shall allow users to view a Destination Detail page showcasing all published tour packages associated with that city/region.                       | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L34  |
| **FR-DEST-003** | The system shall allow administrators to create, update, and publish/unpublish destinations in the catalog.                                                   | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6   |

### 11.4 Tour Themes (`FR-THEME`)

| Req ID           | Requirement Statement                                                                                                              | Priority | Status    | Source                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------- |
| **FR-THEME-001** | The system shall categorize tour packages under structured Themes (e.g., Adventure, Heritage, Luxury, Beach, Honeymoon, Wildlife). | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2 |
| **FR-THEME-002** | The system shall allow administrators to create, edit, and delete travel theme categories without requiring code modifications.    | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6   |

### 11.5 Tour Package Catalog (`FR-PACKAGE`)

| Req ID             | Requirement Statement                                                                                                                                                                                | Priority | Status    | Source                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------ |
| **FR-PACKAGE-001** | The system shall display a public catalog of published tour packages showing Package Title, Hero Thumbnail, Destination, Duration (Days/Nights), Theme, and Starting Base Price.                     | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2                  |
| **FR-PACKAGE-002** | The system shall render a comprehensive Package Detail page containing full package description, distance covered, origin city, destination city, highlights, photo gallery, and cancellation terms. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L32-37, Document §5.2 |
| **FR-PACKAGE-003** | The package detail page shall clearly present an explicit list of Package Inclusions and Package Exclusions.                                                                                         | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2                  |
| **FR-PACKAGE-004** | The package detail page shall display available Accommodation Tiers (Budget, Standard, Luxury) and Meal Plans (Breakfast, Half-Board, Full-Board).                                                   | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L54-56                |
| **FR-PACKAGE-005** | The system shall provide administrators with a Package Management console supporting full Create, Read, Update, and Delete (CRUD) operations for packages.                                           | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L24, Document §6      |
| **FR-PACKAGE-006** | The system shall prevent the publication of a package if it lacks a valid title, destination, base price, banner image, or at least one day-wise itinerary entry.                                    | MUST     | CONFIRMED | `[INFERENCE]` BR-PKG-001                         |

### 11.6 Itinerary Planning (`FR-ITIN`)

| Req ID          | Requirement Statement                                                                                                                                              | Priority | Status    | Source                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- | --------------------------------------------- |
| **FR-ITIN-001** | The system shall display a sequential Day-by-Day Itinerary on the package detail page, specifying Day Number, Itinerary Title, and Detailed Activity Descriptions. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L52, Document §5.2 |
| **FR-ITIN-002** | The system shall allow administrators to add, edit, reorder, and remove day-wise itinerary entries for any package.                                                | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6                 |

### 11.7 Availability & Inventory Scheduling (`FR-INVENT`)

| Req ID            | Requirement Statement                                                                                                                                          | Priority | Status    | Source                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------- |
| **FR-INVENT-001** | The system shall maintain departure schedules for packages, associating specific calendar Departure Dates with a Total Seat Capacity and Booked Seat Count.    | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §1.3, §1.4 |
| **FR-INVENT-002** | The system shall dynamically calculate Remaining Seat Capacity based on total capacity, confirmed bookings, and active temporary holds.                        | MUST     | CONFIRMED | `[INFERENCE]` BR-INVENT-001           |
| **FR-INVENT-003** | The system shall prevent customers from initiating a booking for departure dates where Remaining Seat Capacity is less than the requested party size.          | MUST     | CONFIRMED | `[DOCUMENTATION]` Document L149       |
| **FR-INVENT-004** | The system shall place a temporary hold on requested seats for the configured checkout window duration when a customer initiates checkout.                     | MUST     | PROPOSED  | `[PHASE-0.2]` Section 15              |
| **FR-INVENT-005** | The system shall automatically release temporary seat holds back to available inventory if checkout payment is not verified within the configured hold window. | MUST     | PROPOSED  | `[PHASE-0.2]` Section 15              |

### 11.8 Search & Multi-Criteria Filtering (`FR-SEARCH`)

| Req ID            | Requirement Statement                                                                                                        | Priority | Status    | Source                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------------------------------------------- |
| **FR-SEARCH-001** | The system shall allow users to search packages by destination keyword or package title.                                     | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L38, `[REPOSITORY]` `frontend/index.html:37-40` |
| **FR-SEARCH-002** | The system shall allow users to filter search results by Destination City, Travel Theme, Duration range, and Maximum Budget. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L38-39                                          |
| **FR-SEARCH-003** | The system shall display a helpful empty state with reset suggestions when search criteria yield zero records.               | MUST     | CONFIRMED | `[INFERENCE]`                                                              |
| **FR-SEARCH-004** | The system shall support sorting search results by Price and Duration.                                                       | SHOULD   | CONFIRMED | `[INFERENCE]`                                                              |

### 11.9 Package Configuration & Pricing (`FR-CONFIG`)

| Req ID            | Requirement Statement                                                                                                                                                                 | Priority | Status    | Source                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------- |
| **FR-CONFIG-001** | The system shall allow customers on the package booking page to select a Departure Date, specify Number of Adults and Children, select an Accommodation Tier, and choose a Meal Plan. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L39-40             |
| **FR-CONFIG-002** | The system shall calculate an itemized price summary in real time based on base adult prices, child prices, accommodation/meal tier surcharges, and applicable taxes.                 | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L35, Document §1.3 |
| **FR-CONFIG-003** | The system shall display the itemized pricing breakdown (Base Fare, Surcharges, Taxes, Total Payable) clearly to the customer before payment initiation.                              | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L12                |

### 11.10 Booking Engine (`FR-BOOK`)

| Req ID          | Requirement Statement                                                                                                                                                  | Priority | Status    | Source                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------- |
| **FR-BOOK-001** | The system shall generate a unique alphanumeric Booking Reference Code upon checkout submission.                                                                       | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §4.1 |
| **FR-BOOK-002** | The system shall collect primary contact information and individual passenger names, age, and gender for all travellers in the party.                                  | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §4.1 |
| **FR-BOOK-003** | The system shall preserve an immutable historical record of package details, itinerary, selected options, and calculated price in the booking record at creation time. | MUST     | CONFIRMED | `[PHASE-0.2]` BR-004            |
| **FR-BOOK-004** | The system shall initialize new bookings in an awaiting-payment state with an active checkout timer.                                                                   | MUST     | CONFIRMED | `[PHASE-0.2]` Section 16        |
| **FR-BOOK-005** | The system shall transition a booking to a cancelled/expired state and release seat inventory if payment is not successfully verified within the checkout window.      | MUST     | CONFIRMED | `[PHASE-0.2]` Section 16        |

### 11.11 Payment Integration (`FR-PAY`)

| Req ID         | Requirement Statement                                                                                                                                                                                                                                            | Priority | Status                | Source                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- | --------------------------------- |
| **FR-PAY-001** | The system shall interface with a digital payment service to process full upfront payments supporting digital payment methods (UPI, Cards, Net Banking, Wallets).                                                                                                | MUST     | CONDITIONAL — DEC-006 | `[DOCUMENTATION]` Synopsis L46-47 |
| **FR-PAY-002** | The system shall maintain payment transaction records as independent financial entities tracking Payment ID, Provider Transaction Reference, Booking ID, Amount, Currency, Mode, Timestamp, and Financial Status (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`). | MUST     | CONFIRMED             | `[PHASE-0.2]` Section 17          |
| **FR-PAY-003** | The system shall handle payment notifications idempotently to prevent duplicate payment processing or duplicate credit allocations.                                                                                                                              | MUST     | CONFIRMED             | `[INFERENCE]` NFR-REL-002         |

### 11.12 Booking Confirmation (`FR-CONFIRM`)

| Req ID             | Requirement Statement                                                                                                                                                                             | Priority | Status                           | Source                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------- | ------------------------------ |
| **FR-CONFIRM-001** | **[Instant Confirmation Branch]:** The system shall automatically transition a booking to confirmed status immediately upon verified payment success.                                             | MUST     | CONDITIONAL — DEC-003 (Option A) | `[DOCUMENTATION]` Synopsis L48 |
| **FR-CONFIRM-002** | **[Manual Approval Branch]:** The system shall place paid bookings into an administrative review state and require an administrator to manually approve before transitioning to confirmed status. | MUST     | CONDITIONAL — DEC-003 (Option B) | `[DOCUMENTATION]` Synopsis L43 |
| **FR-CONFIRM-003** | The system shall display a dedicated Booking Confirmation success screen upon confirmed booking, detailing the booking reference, trip summary, and download actions.                             | MUST     | CONFIRMED                        | `[DOCUMENTATION]` Synopsis L44 |

### 11.13 Invoicing & E-Ticket Issuance (`FR-DOC`)

| Req ID         | Requirement Statement                                                                                                                                                                                                        | Priority | Status    | Source                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ----------------------------------- |
| **FR-DOC-001** | The system shall automatically generate a legally compliant, downloadable Tax Invoice for every confirmed or paid booking.                                                                                                   | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L41, L49 |
| **FR-DOC-002** | The Tax Invoice shall display Invoice Number, Invoice Date, Agency Name, Tax Registration Number, Customer Details, Itemized Tour Charges, Tax Breakdown, Total Paid, and Payment Reference.                                 | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §1.3     |
| **FR-DOC-003** | The system shall automatically generate a downloadable E-Ticket Travel Voucher displaying Booking Code, Traveller Names, Tour Dates, Day-wise Itinerary, Accommodation Details, Emergency Contacts, and Boarding Guidelines. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L50-52   |
| **FR-DOC-004** | The system shall make generated Invoices and E-Tickets permanently accessible for customer download within the "My Bookings" dashboard.                                                                                      | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L51      |

### 11.14 Customer Self-Service Dashboard (`FR-DASH`)

| Req ID          | Requirement Statement                                                                                                                                | Priority | Status    | Source                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ---------------------------------- |
| **FR-DASH-001** | The system shall provide authenticated customers with a "My Bookings" dashboard listing all historical and active reservations.                      | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L4, L30 |
| **FR-DASH-002** | The dashboard shall display live booking status indicators (`Awaiting Payment`, `Confirmed`, `Cancellation Under Review`, `Cancelled`, `Completed`). | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L44     |
| **FR-DASH-003** | The dashboard shall provide 1-click download actions for Invoices and E-Tickets on all confirmed bookings.                                           | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L51     |
| **FR-DASH-004** | The dashboard shall allow customers to initiate a cancellation request for eligible active bookings according to the applicable cancellation policy. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L45     |

### 11.15 Cancellations & Refund Queues (`FR-CANCEL`)

| Req ID            | Requirement Statement                                                                                                                                                     | Priority | Status                | Source                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- | ------------------------------ |
| **FR-CANCEL-001** | The system shall allow customers to submit a cancellation request for an active confirmed booking in accordance with the applicable cancellation policy.                  | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L45 |
| **FR-CANCEL-002** | The system shall calculate the applicable refund amount and cancellation penalty according to the configured cancellation policy applicable to the booking.               | MUST     | CONDITIONAL — DEC-007 | `[PHASE-0.2]` Section 19       |
| **FR-CANCEL-003** | The system shall queue cancellation requests in the Admin Console for operational review and refund disbursement authorization where required by policy.                  | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L25 |
| **FR-CANCEL-004** | Upon refund completion, the system shall record a refund transaction entity, update the booking status to refunded, and restore seat inventory to the departure schedule. | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L25 |

### 11.16 Reviews & Testimonials (`FR-REVIEW`)

| Req ID            | Requirement Statement                                                                                                                    | Priority | Status    | Source                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------ |
| **FR-REVIEW-001** | The system shall allow registered customers who have completed a tour to submit a Star Rating (1–5) and written Review for that package. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2, §8  |
| **FR-REVIEW-002** | The system shall hold submitted reviews in a pending state until moderated and approved by an administrator.                             | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6, §1035 |
| **FR-REVIEW-003** | Approved testimonials shall be rendered publicly on the relevant package detail page and homepage testimonial showcase.                  | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2, §6  |

### 11.17 Administrative Operations Console (`FR-ADMIN`)

| Req ID           | Requirement Statement                                                                                                                                                                           | Priority | Status    | Source                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------- |
| **FR-ADMIN-001** | The system shall provide administrators with a centralized Dashboard displaying operational KPIs: Total Gross Revenue, Total Active Bookings, Total Registered Users, and Active Package Count. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L66, Document §6 |
| **FR-ADMIN-002** | The system shall provide an Admin Booking Management view with search, status filtering, customer contact inspection, manual confirmation override, and cancellation processing.                | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L25, Document §6 |
| **FR-ADMIN-003** | The system shall provide an Admin User Management view listing registered customer accounts with search, view details, and account disablement capabilities.                                    | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §6               |
| **FR-ADMIN-004** | The system shall allow administrators to manage departure dates, update seat capacities, and view passenger manifests per departure.                                                            | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L24, Document §6 |

### 11.18 Content Management System (`FR-CMS`)

| Req ID         | Requirement Statement                                                                                                                                      | Priority | Status    | Source                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ----------------------------------- |
| **FR-CMS-001** | The system shall allow administrators to configure Homepage Banner Sliders (Image, Headline, Subtitle, Redirect URL) dynamically without redeploying code. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2, §6 |
| **FR-CMS-002** | The system shall allow administrators to update Agency Master Details (Agency Name, Tagline, Contact Phone, Support Email, Office Address, Logo).          | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2, §6 |
| **FR-CMS-003** | The system shall allow administrators to edit static CMS Page contents (About Us, Contact Us, Privacy Policy, Terms & Conditions).                         | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §5.2, §6 |

### 11.19 Transactional Notifications (`FR-NOTIFY`)

| Req ID            | Requirement Statement                                                                                                                            | Priority | Status    | Source                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- | ------------------------------ |
| **FR-NOTIFY-001** | The system shall trigger an automated Transactional Email containing booking details and receipt link to the customer upon booking confirmation. | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L64 |
| **FR-NOTIFY-002** | The system shall trigger an automated Transactional Email notifying the customer when a cancellation request is approved and refund initiated.   | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L64 |
| **FR-NOTIFY-003** | The system shall send SMS notification alerts for booking confirmations.                                                                         | SHOULD   | CONFIRMED | `[DOCUMENTATION]` Synopsis L64 |

### 11.20 Financial & Operations Reporting (`FR-REPORT`)

| Req ID            | Requirement Statement                                                                                                            | Priority | Status    | Source                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------- |
| **FR-REPORT-001** | The system shall generate booking and revenue summary reports filterable by date range, destination city, and package theme.     | MUST     | CONFIRMED | `[DOCUMENTATION]` Synopsis L26, Document §1.3 |
| **FR-REPORT-002** | The system shall allow administrators to export booking transaction logs and passenger manifests to standard spreadsheet format. | SHOULD   | CONFIRMED | `[PHASE-0.2]` Section 29                      |

---

## 12. Business Rules Catalogue

| Rule ID           | Domain       | Business Rule Statement                                                                                                                                                              | Priority | Status                | Source & Rationale                                                           |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------- | ---------------------------------------------------------------------------- |
| **BR-AUTH-001**   | Auth         | A booking cannot be confirmed without an associated, verified Customer profile record.                                                                                               | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L28-31. Prevents unassociated bookings.           |
| **BR-AUTH-002**   | Auth         | Administrator accounts shall not execute public customer bookings; customer accounts shall not access administrative operations.                                                     | MUST     | CONFIRMED             | `[DOCUMENTATION]` Document §8. Role privilege separation.                    |
| **BR-INVENT-001** | Inventory    | A booking shall never be confirmed if requested party size exceeds available remaining capacity on the selected departure date.                                                      | MUST     | CONFIRMED             | `[DOCUMENTATION]` Document L149. Anti-overbooking invariant.                 |
| **BR-INVENT-002** | Inventory    | A temporary seat reservation hold shall strictly expire after the configured checkout hold duration if payment verification is not completed.                                        | MUST     | PROPOSED              | `[PHASE-0.2]` Section 15. Prevents indefinite seat locking.                  |
| **BR-PRICE-001**  | Pricing      | The agreed booking price and itinerary details must remain permanently locked as contracted at the moment of checkout creation, unaffected by subsequent catalog edits.              | MUST     | CONFIRMED             | `[PHASE-0.2]` Section 15. Legal consumer protection invariant.               |
| **BR-PAY-001**    | Payment      | A booking status shall not transition to confirmed unless a verified matching payment transaction record with status `SUCCESS` exists (or formal administrative override is logged). | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L46-49. Financial reconciliation integrity.       |
| **BR-DOC-001**    | Documents    | Official Tax Invoices and E-Ticket Vouchers shall only be generated for bookings in confirmed or paid states.                                                                        | MUST     | CONFIRMED             | `[DOCUMENTATION]` Synopsis L50-52. Prevents invalid travel voucher issuance. |
| **BR-CANCEL-001** | Cancellation | Cancellation eligibility and applicable refund calculations shall be determined strictly according to the approved cancellation policy applicable to the booking.                    | MUST     | CONDITIONAL — DEC-007 | `[PHASE-0.2]` Section 19. Policy-driven cancellation governance.             |
| **BR-REVIEW-001** | Reviews      | A customer can only submit a testimonial/review for a package if they possess a verified booking in completed state for that package.                                                | MUST     | CONFIRMED             | `[INFERENCE]`. Prevents unverified or spam reviews.                          |
| **BR-PKG-001**    | Catalog      | A package cannot be marked published unless it contains a title, destination, base price, banner image, and at least one day-wise itinerary entry.                                   | MUST     | CONFIRMED             | `[INFERENCE]`. Data completeness invariant.                                  |

---

## 13. Non-Functional Requirements

### 13.1 Performance (`NFR-PERF`)

| Req ID           | Quality Requirement Statement                                                                                                                                                        | Priority | Status    | Measurable Target Condition                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- | -------------------------------------------------------------- |
| **NFR-PERF-001** | **Page Load Latency:** The system shall render public storefront pages within 2.0 seconds under standard broadband conditions.                                                       | MUST     | CONFIRMED | `< 2.0s DOM Load under standard network profile`               |
| **NFR-PERF-002** | **Search Query Latency:** The package search and filter query shall return matching results in less than 500 milliseconds across a catalog of up to 10,000 packages.                 | MUST     | CONFIRMED | `< 500ms query response time` (`[DOCUMENTATION]` Synopsis L12) |
| **NFR-PERF-003** | **Checkout Concurrency:** The booking and seat reservation engine shall handle at least 100 concurrent checkout sessions without data corruption or seat allocation race conditions. | MUST     | CONFIRMED | `100 concurrent checkouts without overbooking`                 |
| **NFR-PERF-004** | **Document Generation Speed:** The document generator shall generate downloadable PDF Invoices and E-Tickets in less than 3.0 seconds per request.                                   | SHOULD   | CONFIRMED | `< 3.0s per document generation request`                       |

### 13.2 Scalability (`NFR-SCALE`)

| Req ID            | Quality Requirement Statement                                                                                                                         | Priority | Status    | Target Scope                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------------------- |
| **NFR-SCALE-001** | The system design shall support growth to at least 100,000 registered users and 50,000 annual bookings without requiring architectural restructuring. | MUST     | CONFIRMED | `100,000 registered users; 50,000 bookings/year`          |
| **NFR-SCALE-002** | The system shall support multi-year historical booking and payment transaction archiving without degrading active operational query performance.      | SHOULD   | CONFIRMED | `Multi-year archive querying without latency degradation` |

### 13.3 Availability (`NFR-AVAIL`)

| Req ID            | Quality Requirement Statement                                                                                                                                     | Priority | Status    | Target Metric                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------- |
| **NFR-AVAIL-001** | The system shall maintain an operational service availability of at least 99.5% uptime during standard operations, excluding scheduled maintenance.               | MUST     | CONFIRMED | `99.5% service uptime`                            |
| **NFR-AVAIL-002** | In the event of a temporary external payment provider outage, the system shall gracefully display user-friendly error notices and preserve intact booking drafts. | MUST     | CONFIRMED | `Graceful error messaging; intact booking drafts` |

### 13.4 Reliability & Data Integrity (`NFR-REL`)

| Req ID          | Quality Requirement Statement                                                                                                                                                                                     | Priority | Status    | Target Metric                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------------- |
| **NFR-REL-001** | **Zero Double-Bookings:** The system shall enforce atomic seat allocation to ensure that concurrent checkout attempts cannot result in confirmed bookings exceeding available inventory.                          | MUST     | CONFIRMED | `0.0% double-booking occurrence`                    |
| **NFR-REL-002** | **Financial Idempotency:** The system shall enforce payment transaction idempotency to guarantee that duplicate payment processing attempts cannot create duplicate financial charges.                            | MUST     | CONFIRMED | `Zero duplicate financial charges on retries`       |
| **NFR-REL-003** | **Transaction Recovery:** If payment succeeds but the customer client disconnects before confirmation view, the asynchronous payment callback must guarantee automatic booking confirmation and receipt dispatch. | MUST     | CONFIRMED | `100% confirmation of verified successful payments` |

### 13.5 Security Requirements (`NFR-SEC`)

| Req ID          | Security Requirement Statement                                                                                                                                                                                      | Priority | Status    | Source / Standard                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ----------------------------------- |
| **NFR-SEC-001** | **Transport Encryption:** All web traffic and API communications shall be strictly encrypted in transit using industry-standard modern transport encryption protocols.                                              | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §8       |
| **NFR-SEC-002** | **Password Hashing:** Passwords must be protected using an industry-accepted salted, adaptive cryptographic hashing mechanism before persistence.                                                                   | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §8       |
| **NFR-SEC-003** | **Injection Defense:** All database interactions must use parameterized queries or abstraction layers to prevent SQL Injection vulnerabilities.                                                                     | MUST     | CONFIRMED | `[DOCUMENTATION]` Document L1049    |
| **NFR-SEC-004** | **Cross-Site Scripting (XSS) Defense:** All user-supplied inputs must be sanitized and contextual encoding applied before rendering in web interfaces.                                                              | MUST     | CONFIRMED | `[DOCUMENTATION]` Document L1049    |
| **NFR-SEC-005** | **CSRF Protection:** State-changing requests must enforce anti-forgery protection mechanisms.                                                                                                                       | MUST     | CONFIRMED | `[INFERENCE]` Standard Web Security |
| **NFR-SEC-006** | **Role-Based Access Control (RBAC):** Administrative interfaces and operations must strictly validate administrative credentials and deny unauthorized customer access.                                             | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §8       |
| **NFR-SEC-007** | **Rate Limiting:** Public authentication endpoints must enforce rate limiting to mitigate automated credential-guessing attacks.                                                                                    | MUST     | CONFIRMED | `[INFERENCE]` Abuse prevention      |
| **NFR-SEC-008** | **Payment Data Isolation:** The platform shall never store raw credit/debit card numbers or sensitive payment authentication codes on its servers, delegating card capture entirely to certified payment providers. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §3.3     |

### 13.6 Privacy & Compliance (`NFR-PRIV`)

| Req ID           | Privacy Requirement Statement                                                                                                                                     | Priority | Status    | Standard / Guideline                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------- |
| **NFR-PRIV-001** | **Customer Data Protection:** Customer personal identification details (contact mobile, address, date of birth) must be restricted to authorized operational use. | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §3.3, §1050 |
| **NFR-PRIV-002** | **Privacy Policy:** The platform must display a clear, accessible Privacy Policy explaining data collection, storage, and retention practices.                    | MUST     | CONFIRMED | `[DOCUMENTATION]` Document §3.3        |

### 13.7 Auditability & Traceability (`NFR-AUDIT`)

| Req ID            | Audit Requirement Statement                                                                                                                                                                                                     | Priority | Status    | Purpose                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------- |
| **NFR-AUDIT-001** | The system shall maintain an immutable audit log of administrative actions (package creation, price edits, booking cancellations, manual confirmation overrides, refund approvals) with Actor ID, Timestamp, Action, and Diffs. | MUST     | CONFIRMED | `Operational accountability`      |
| **NFR-AUDIT-002** | Payment transaction logs must remain immutable and permanently retained for financial audit compliance.                                                                                                                         | MUST     | CONFIRMED | `Financial regulatory compliance` |

### 13.8 Accessibility (`NFR-ACCESS`)

| Req ID             | Accessibility Requirement Statement                                                                                                                                             | Priority | Status    | Target Standard                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------ |
| **NFR-ACCESS-001** | The public web user interface shall conform to WCAG 2.1 Level AA guidelines, ensuring adequate color contrast, keyboard navigability, and screen-reader accessible form labels. | MUST     | CONFIRMED | `WCAG 2.1 Level AA compliance` |

### 13.9 Compatibility (`NFR-COMPAT`)

| Req ID             | Compatibility Requirement Statement                                                                                                                | Priority | Status    | Target Platform                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------- |
| **NFR-COMPAT-001** | The web application shall be fully responsive across Desktop, Tablet, and Mobile viewport dimensions.                                              | MUST     | CONFIRMED | `Responsive multi-device layout` |
| **NFR-COMPAT-002** | The web application shall function seamlessly across modern evergreen web browsers (Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge). | MUST     | CONFIRMED | `[DECISION REQUIRED — DEC-010]`  |

### 13.10 Maintainability (`NFR-MAINT`)

| Req ID            | Maintainability Requirement Statement                                                                                                          | Priority | Status    | Constraint                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------- |
| **NFR-MAINT-001** | The system architecture shall enforce clean modular separation between presentation, domain business logic, and persistence layers.            | MUST     | CONFIRMED | `Modular architecture baseline`        |
| **NFR-MAINT-002** | All core business rules and calculations (pricing, hold expiration, refund percentages) must be covered by automated verification test suites. | MUST     | CONFIRMED | `Automated test verification baseline` |

---

## 14. Conceptual Data Requirements

| Entity ID  | Entity Name               | Information Content & Business Purpose                                                                                                                                                                                                                                                                                                                                           | Sensitivity & Retention Relevance                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **DR-001** | **Customer Account**      | User ID, Email, Credential Hash, Full Name, Contact Mobile, Address, Gender, Date of Birth, Avatar Reference, Role (`Customer`/`Admin`), Status (`Active`/`Disabled`), Creation Timestamp.                                                                                                                                                                                       | High (Personal Data) — Retained during account lifecycle.                          |
| **DR-002** | **Destination / City**    | Destination ID, City Name, State/Region, Country, Geographic Coordinates, Descriptive Overview, Imagery References, Status (`Published`/`Draft`).                                                                                                                                                                                                                                | Low (Public Master Data).                                                          |
| **DR-003** | **Tour Theme**            | Theme ID, Theme Name, Slug, Description, Visual Icon/Image Reference.                                                                                                                                                                                                                                                                                                            | Low (Public Master Data).                                                          |
| **DR-004** | **Tour Package**          | Package ID, Slug, Title, Short Summary, Destination Reference, Theme Reference, Duration Days/Nights, Distance Covered, Origin City, Base Pricing, Child Pricing, Inclusions, Exclusions, Status (`Draft`/`Published`).                                                                                                                                                          | Low (Public Commercial Data).                                                      |
| **DR-005** | **Itinerary Entry**       | Itinerary ID, Package Reference, Day Number, Day Title, Detailed Description, Meal Inclusions, Overnight Location.                                                                                                                                                                                                                                                               | Low (Public Itinerary Data).                                                       |
| **DR-006** | **Departure Schedule**    | Schedule ID, Package Reference, Departure Date, Return Date, Total Seat Capacity, Booked Seats, Active Held Seats, Status (`Open`/`Closed`/`SoldOut`).                                                                                                                                                                                                                           | Medium (Operational Inventory Data).                                               |
| **DR-007** | **Booking Record**        | Booking ID, Alphanumeric Reference Code, Customer Reference, Schedule Reference, Contracted Package Details Snapshot, Selected Tiers, Party Size (Adults/Children), Passenger Names Roster, Itemized Financial Snapshot (Base, Taxes, Total), Hold Expiration Timestamp, Booking Status (`AWAITING_PAYMENT`, `PAID`, `CONFIRMED`, `CANCELLED`, `COMPLETED`), Creation Timestamp. | High (Financial & Personal Contract) — Retained for regulatory tax audit duration. |
| **DR-008** | **Payment Transaction**   | Transaction ID, Booking Reference, External Provider Transaction ID, Amount, Currency, Payment Mode, Status (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`), Provider Callback Metadata, Creation Timestamp.                                                                                                                                                                      | High (Financial Record) — Immutable retention.                                     |
| **DR-009** | **Tax Invoice**           | Invoice ID, Unique Invoice Number, Booking Reference, Customer Reference, Taxable Value, Tax Breakdown, Total Paid, Document Reference, Generation Timestamp.                                                                                                                                                                                                                    | High (Legal Tax Document) — Retained for statutory audit period.                   |
| **DR-010** | **E-Ticket Voucher**      | Voucher ID, Unique Voucher Number, Booking Reference, Verification Code, Document Reference, Generation Timestamp.                                                                                                                                                                                                                                                               | High (Travel Operational Document).                                                |
| **DR-011** | **Refund Record**         | Refund ID, Booking Reference, Payment Transaction Reference, Request Timestamp, Approved Refund Amount, Applied Penalty, Approving Admin Reference, External Refund ID, Status (`REQUESTED`, `PROCESSED`, `REJECTED`).                                                                                                                                                           | High (Financial Audit Record).                                                     |
| **DR-012** | **Testimonial / Review**  | Review ID, Package Reference, Booking Reference, Customer Reference, Rating (1–5), Written Review Text, Moderation Status (`PENDING`, `APPROVED`, `REJECTED`), Timestamp.                                                                                                                                                                                                        | Low (Public Review Data).                                                          |
| **DR-013** | **Banner Slider**         | Slider ID, Title, Headline, Image Reference, Redirect Target, Display Sequence, Status (`Active`/`Inactive`).                                                                                                                                                                                                                                                                    | Low (Public CMS Data).                                                             |
| **DR-014** | **Agency Master Details** | Agency Legal Name, Tagline, Helpline Phone, Support Email, Registered Office Address, Tax Registration Number, Logo Reference.                                                                                                                                                                                                                                                   | Low (Public Agency Master Data).                                                   |
| **DR-015** | **Audit Log**             | Log ID, Actor Reference, Actor Role, Action Category, Target Entity, Target Identifier, Change Detail Snapshot, IP Origin, Timestamp.                                                                                                                                                                                                                                            | High (Security Audit Record) — Immutable retention.                                |

---

## 15. Error & Failure Requirements

| Error ID    | Failure Trigger                               | Expected System Behavior & Invariant                                                           | Customer-Facing Outcome                                                              | Administrative Outcome                                          |
| ----------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **ERR-001** | Invalid credentials submitted.                | Increment security failure counter; deny session token generation.                             | Display: _"Invalid email or password."_                                              | Log security attempt; apply rate limiter if threshold breached. |
| **ERR-002** | Duplicate registration email.                 | Reject registration; prevent duplicate record creation.                                        | Display: _"An account with this email already exists. Please log in."_               | None.                                                           |
| **ERR-003** | Requested seats exceed remaining capacity.    | Reject checkout initialization; prevent seat hold placement.                                   | Display: _"Sorry, insufficient seats remain on this departure date."_                | Log high-demand departure for inventory review.                 |
| **ERR-004** | Checkout hold timer expires.                  | Release temporary held seats back to departure schedule; mark booking expired/cancelled.       | Display: _"Your session has expired. Please select your travel dates again."_        | Automated timer execution.                                      |
| **ERR-005** | Payment provider returns failure.             | Record failed transaction; keep checkout session alive if within hold window.                  | Display: _"Payment was unsuccessful. Please retry with a different payment method."_ | Log provider failure code for reconciliation.                   |
| **ERR-006** | Payment succeeds but client disconnects.      | Webhook processes provider success; updates booking to confirmed; triggers email notification. | Upon re-login, "My Bookings" displays confirmed status with document downloads.      | Asynchronous handler ensures zero lost paid bookings.           |
| **ERR-007** | Duplicate payment submission.                 | Idempotency guard blocks concurrent payment attempts for the same booking session.             | Disable button on click; process single transaction.                                 | Prevent duplicate financial charges.                            |
| **ERR-008** | Cancellation requested outside policy window. | Reject cancellation request in accordance with business rule BR-CANCEL-001.                    | Display: _"Cancellation is not permitted for this booking according to policy."_     | None.                                                           |
| **ERR-009** | Payment refund execution fails.               | Record refund state as failed; maintain booking in cancellation queue.                         | Display: _"Refund processing delayed. Our support team is handling your request."_   | Trigger alert in Admin Console for manual financial resolution. |
| **ERR-010** | Document generation failure.                  | Queue background retry; record generation failure log.                                         | Display: _"Your travel voucher is being generated. It will appear shortly."_         | Asynchronous worker regenerates document.                       |

---

## 16. Use Cases

### UC-001: Discover & Search Tour Packages

- **Primary Actor:** Guest User / Customer (`ACT-GUEST`, `ACT-CUST`)
- **Goal:** Find tour packages matching travel preferences.
- **Preconditions:** Public storefront is online; packages are published.
- **Trigger:** User navigates to homepage or catalog.
- **Main Flow:**
  1. User inputs destination keyword or selects a Theme filter.
  2. System returns matching package cards showing hero image, duration, and base price.
  3. User selects a package card to inspect full details.
  4. System renders package page with day-by-day itinerary, inclusions, exclusions, and pricing.
- **Alternate Flow (Zero Results):** System displays empty state with filter reset action.
- **Related Requirements:** `FR-STOREFRONT-004`, `FR-PACKAGE-001`, `FR-SEARCH-001`, `FR-SEARCH-002`.

### UC-002: Book Tour Package & Complete Payment

- **Primary Actor:** Registered Customer (`ACT-CUST`), Payment Provider (`ACT-EXT-PAY`)
- **Goal:** Reserve tour seats and complete digital payment.
- **Preconditions:** Customer is on Package Detail page; package has available departures.
- **Trigger:** Customer clicks "Book Now".
- **Main Flow:**
  1. Customer selects Departure Date, specifies Party Size (Adults/Children), and chooses Accommodation/Meal options.
  2. System validates seat availability and calculates itemized price summary.
  3. Customer enters traveller names and proceeds to checkout.
  4. System places a temporary seat hold and initializes booking in awaiting-payment state.
  5. Customer executes digital payment via payment gateway.
  6. Payment provider returns verified success callback.
  7. System confirms booking, generates Tax Invoice and E-Ticket Voucher, and displays confirmation screen.
- **Failure Flow (Sold Out):** System blocks checkout if requested seats exceed remaining capacity (`ERR-003`).
- **Failure Flow (Payment Failed):** System prompts retry within remaining hold window (`ERR-005`).
- **Related Requirements:** `FR-CONFIG-001`, `FR-INVENT-003`, `FR-BOOK-001`, `FR-PAY-001`, `FR-CONFIRM-001`, `FR-DOC-001`.

### UC-003: Access & Download Travel Documents

- **Primary Actor:** Registered Customer (`ACT-CUST`)
- **Goal:** Retrieve and download Tax Invoice and E-Ticket Vouchers.
- **Preconditions:** Customer is logged in and possesses at least one confirmed booking.
- **Trigger:** Customer navigates to "My Bookings".
- **Main Flow:**
  1. Customer views active bookings list.
  2. Customer clicks "Download E-Ticket Voucher".
  3. System provides verified PDF travel voucher.
  4. Customer clicks "Download Tax Invoice".
  5. System provides legal PDF Tax Invoice.
- **Related Requirements:** `FR-DASH-001`, `FR-DASH-003`, `FR-DOC-001`, `FR-DOC-003`.

### UC-004: Admin Package Creation & Inventory Setup

- **Primary Actor:** Administrator (`ACT-ADMIN`)
- **Goal:** Launch a new tour package product with itinerary and departure calendar.
- **Preconditions:** Admin is authenticated in Admin Console.
- **Trigger:** Admin clicks "Create Package".
- **Main Flow:**
  1. Admin enters Title, Destination, Theme, Duration, Distance, Base Pricing, and Inclusions/Exclusions.
  2. Admin configures Day-by-Day Itinerary entries.
  3. Admin uploads hero banner imagery.
  4. Admin schedules Departure Dates with seat quotas.
  5. Admin clicks "Publish Package".
  6. System validates data completeness (BR-PKG-001) and publishes package to public catalog.
- **Related Requirements:** `FR-PACKAGE-005`, `FR-ITIN-002`, `FR-INVENT-001`, `FR-ADMIN-001`.

---

## 17. Acceptance Criteria (Given / When / Then)

_Every MUST Functional Requirement in this specification possesses an explicit, testable Given/When/Then acceptance criterion below._

### Domain 1: Public Storefront

- **AC-STOREFRONT-001 (`FR-STOREFRONT-001`):**  
  `Given` an unauthenticated guest user with a web browser  
  `When` the user accesses the base portal URL  
  `Then` the system shall render the public homepage within performance target limits without requiring authentication credentials.
- **AC-STOREFRONT-002 (`FR-STOREFRONT-002`):**  
  `Given` a user is on any public storefront page  
  `When` the top navigation bar renders  
  `Then` the system shall display operational navigation links to Destinations, Packages, About Us, Contact Us, and Account Login/Register.
- **AC-STOREFRONT-003 (`FR-STOREFRONT-003`):**  
  `Given` a user views the homepage Hero section  
  `When` the Hero component renders  
  `Then` the system shall display visual promotional banners and a functional destination search input field.
- **AC-STOREFRONT-004 (`FR-STOREFRONT-004`):**  
  `Given` published featured destinations exist in the catalog  
  `When` the homepage loads  
  `Then` the system shall render the featured destinations grid displaying destination image, title, country, and a "View Details" action.
- **AC-STOREFRONT-006 (`FR-STOREFRONT-006`):**  
  `Given` a user scrolls to the bottom of any storefront page  
  `When` the footer renders  
  `Then` the system shall display agency copyright, official contact helpline information, and links to Privacy Policy and Terms of Service.

### Domain 2: Authentication & Accounts

- **AC-AUTH-001 (`FR-AUTH-001`):**  
  `Given` a new user submits registration with valid Name, Email, Password, Mobile, Address, Gender, and DOB  
  `When` the registration request is processed  
  `Then` the system shall create an active customer account record and initialize an authenticated session.
- **AC-AUTH-002 (`FR-AUTH-002`):**  
  `Given` an existing account with email "traveller@example.com"  
  `When` a user attempts registration with "traveller@example.com"  
  `Then` the system shall reject registration and display an error stating that the email already exists.
- **AC-AUTH-003 (`FR-AUTH-003`):**  
  `Given` a registered customer enters correct email and password credentials  
  `When` login is submitted  
  `Then` the system shall authenticate the user and redirect to the account dashboard.
- **AC-AUTH-004 (`FR-AUTH-004`):**  
  `Given` an administrator enters valid admin credentials at the secure admin portal  
  `When` admin login is submitted  
  `Then` the system shall verify elevated administrative claims and grant access to the Admin Operations Console.
- **AC-AUTH-005 (`FR-AUTH-005`):**  
  `Given` a user or administrator registers or changes their password  
  `When` credentials are saved  
  `Then` the system shall hash the password using a salted adaptive cryptographic mechanism before persistence.
- **AC-AUTH-006 (`FR-AUTH-006`):**  
  `Given` an authenticated customer updates their contact phone or address  
  `When` profile changes are saved  
  `Then` the system shall update the profile record and reflect changes across subsequent session views.
- **AC-AUTH-008 (`FR-AUTH-008`):**  
  `Given` an unauthenticated guest enters contact details during booking checkout  
  `When` checkout is submitted  
  `Then` the system shall create or associate a customer profile from the provided details and link the booking record.

### Domain 3: Destinations

- **AC-DEST-001 (`FR-DEST-001`):**  
  `Given` a destination exists in the catalog  
  `When` catalog data is queried  
  `Then` the system shall provide destination city name, country, coordinates, description, and thumbnail image.
- **AC-DEST-002 (`FR-DEST-002`):**  
  `Given` a user selects a destination city  
  `When` the destination detail page loads  
  `Then` the system shall display all published tour packages associated with that destination.
- **AC-DEST-003 (`FR-DEST-003`):**  
  `Given` an administrator creates or edits a destination  
  `When` changes are published  
  `Then` the system shall update the public destination catalog immediately.

### Domain 4: Tour Themes

- **AC-THEME-001 (`FR-THEME-001`):**  
  `Given` tour packages categorized under Themes (e.g. Adventure, Luxury)  
  `When` a user filters by a theme  
  `Then` the system shall display all published packages matching that theme.
- **AC-THEME-002 (`FR-THEME-002`):**  
  `Given` an administrator adds a new theme in the Admin Console  
  `When` the theme is saved  
  `Then` it shall become immediately available for package categorization.

### Domain 5: Tour Package Catalog

- **AC-PACKAGE-001 (`FR-PACKAGE-001`):**  
  `Given` published packages exist  
  `When` a user views the packages catalog  
  `Then` the system shall display package cards showing title, hero thumbnail, destination, duration, theme, and starting base price.
- **AC-PACKAGE-002 (`FR-PACKAGE-002`):**  
  `Given` a user selects a package card  
  `When` the detail page loads  
  `Then` the system shall render full description, distance, origin, destination, gallery, and cancellation terms.
- **AC-PACKAGE-003 (`FR-PACKAGE-003`):**  
  `Given` a package detail view  
  `When` inclusions/exclusions render  
  `Then` the system shall display distinct bulleted lists of included amenities and excluded expenses.
- **AC-PACKAGE-004 (`FR-PACKAGE-004`):**  
  `Given` a package detail view  
  `When` accommodation and meal options render  
  `Then` the system shall display selectable hotel categories (Budget, Standard, Luxury) and meal plan options.
- **AC-PACKAGE-005 (`FR-PACKAGE-005`):**  
  `Given` an administrator in the Admin Console  
  `When` the administrator executes package CRUD actions  
  `Then` the system shall persist and reflect package modifications across public and admin views.
- **AC-PACKAGE-006 (`FR-PACKAGE-006`):**  
  `Given` a package draft lacking an itinerary or base price  
  `When` an administrator attempts to publish  
  `Then` the system shall block publication and display validation errors.

### Domain 6: Itineraries

- **AC-ITIN-001 (`FR-ITIN-001`):**  
  `Given` a published package  
  `When` the itinerary tab is viewed  
  `Then` the system shall display a day-by-day timeline with day numbers, titles, and activity descriptions.
- **AC-ITIN-002 (`FR-ITIN-002`):**  
  `Given` an administrator editing a package  
  `When` itinerary days are reordered or updated  
  `Then` the system shall save and display the revised sequence on the package page.

### Domain 7: Availability & Inventory

- **AC-INVENT-001 (`FR-INVENT-001`):**  
  `Given` a package schedule  
  `When` an administrator sets departure dates and seat quotas  
  `Then` the system shall track total capacity, booked count, and open seats per date.
- **AC-INVENT-002 (`FR-INVENT-002`):**  
  `Given` total capacity of 30 seats, 10 booked, and 2 held seats  
  `When` availability is queried  
  `Then` the system shall calculate Remaining Seat Capacity as exactly 18 seats.
- **AC-INVENT-003 (`FR-INVENT-003`):**  
  `Given` a departure date has 2 remaining seats  
  `When` a customer attempts to book 3 seats  
  `Then` the system shall block booking initiation and notify the customer of insufficient availability.
- **AC-INVENT-004 (`FR-INVENT-004`):**  
  `Given` available departure seats  
  `When` a customer initiates checkout  
  `Then` the system shall place a temporary hold on requested seats for the configured hold duration.
- **AC-INVENT-005 (`FR-INVENT-005`):**  
  `Given` an active seat hold  
  `When` the hold duration expires without payment completion  
  `Then` the system shall automatically release the held seats back to open inventory.

### Domain 8: Search & Filtering

- **AC-SEARCH-001 (`FR-SEARCH-001`):**  
  `Given` a catalog of packages  
  `When` a user enters a destination keyword (e.g. "Dubai")  
  `Then` the system shall return all published packages matching that destination.
- **AC-SEARCH-002 (`FR-SEARCH-002`):**  
  `Given` search results  
  `When` a user applies duration or budget filters  
  `Then` the system shall filter results matching all selected constraints.
- **AC-SEARCH-003 (`FR-SEARCH-003`):**  
  `Given` search criteria matching zero packages  
  `When` query executes  
  `Then` the system shall display an empty state notification with filter reset options.

### Domain 9: Package Configuration & Pricing

- **AC-CONFIG-001 (`FR-CONFIG-001`):**  
  `Given` a customer on the booking configuration screen  
  `When` the customer selects date, party size, hotel tier, and meal plan  
  `Then` the system shall record the selections as the active booking draft.
- **AC-CONFIG-002 (`FR-CONFIG-002`):**  
  `Given` selected package options and party size  
  `When` price is calculated  
  `Then` the system shall compute base fare, tier surcharges, and applicable taxes into a total payable sum.
- **AC-CONFIG-003 (`FR-CONFIG-003`):**  
  `Given` a calculated booking draft  
  `When` checkout review renders  
  `Then` the system shall display an itemized breakdown before payment authorization.

### Domain 10: Booking Engine

- **AC-BOOK-001 (`FR-BOOK-001`):**  
  `Given` a customer submits checkout details  
  `When` the booking is created  
  `Then` the system shall assign a unique alphanumeric Booking Reference Code.
- **AC-BOOK-002 (`FR-BOOK-002`):**  
  `Given` a booking for 2 travellers  
  `When` passenger details are entered  
  `Then` the system shall validate and capture individual names, ages, and genders.
- **AC-BOOK-003 (`FR-BOOK-003`):**  
  `Given` a created booking at price ₹25,000  
  `When` an administrator subsequently changes the package base price  
  `Then` the booking record's contracted price shall remain permanently locked at ₹25,000.
- **AC-BOOK-004 (`FR-BOOK-004`):**  
  `Given` a newly submitted booking  
  `When` initialized  
  `Then` its status shall be set to awaiting-payment with an active checkout timer.
- **AC-BOOK-005 (`FR-BOOK-005`):**  
  `Given` an awaiting-payment booking  
  `When` payment is not completed before timer expiration  
  `Then` the system shall transition booking status to cancelled/expired and release held seats.

### Domain 11: Payment Integration

- **AC-PAY-001 (`FR-PAY-001`):**  
  `Given` an awaiting-payment booking  
  `When` digital payment is authorized via payment provider  
  `Then` the system shall process full payment across supported payment modes (UPI, Card, Net Banking).
- **AC-PAY-002 (`FR-PAY-002`):**  
  `Given` a payment attempt on the gateway  
  `When` provider responds  
  `Then` the system shall record an independent transaction entity tracking payment ID, amount, currency, mode, and status.
- **AC-PAY-003 (`FR-PAY-003`):**  
  `Given` duplicate webhook notifications for the same transaction  
  `When` callbacks are processed  
  `Then` the system shall enforce idempotency and prevent duplicate credit or status transitions.

### Domain 12: Confirmation

- **AC-CONFIRM-001 (`FR-CONFIRM-001`):**  
  `Given` a booking in awaiting-payment status under Instant Confirmation mode  
  `When` verified payment success callback is received  
  `Then` the system shall transition booking status to confirmed, commit seats, and generate documents.
- **AC-CONFIRM-002 (`FR-CONFIRM-002`):**  
  `Given` a paid booking under Manual Approval mode  
  `When` an administrator clicks "Approve Booking"  
  `Then` the system shall transition status to confirmed and issue vouchers.
- **AC-CONFIRM-003 (`FR-CONFIRM-003`):**  
  `Given` a confirmed booking  
  `When` confirmation screen loads  
  `Then` the system shall display the booking code, itinerary summary, and document download links.

### Domain 13: Invoicing & E-Tickets

- **AC-DOC-001 (`FR-DOC-001`):**  
  `Given` a booking transitions to confirmed or paid  
  `When` document generation triggers  
  `Then` the system shall automatically generate a legal PDF Tax Invoice.
- **AC-DOC-002 (`FR-DOC-002`):**  
  `Given` a generated Tax Invoice  
  `When` inspected  
  `Then` it shall display invoice number, agency tax ID, customer details, itemized charges, taxes, and total paid.
- **AC-DOC-003 (`FR-DOC-003`):**  
  `Given` a confirmed booking  
  `When` travel voucher triggers  
  `Then` the system shall generate a downloadable PDF E-Ticket displaying booking code, passenger names, dates, and day-wise itinerary.
- **AC-DOC-004 (`FR-DOC-004`):**  
  `Given` an authenticated customer with confirmed trips  
  `When` visiting "My Bookings"  
  `Then` download links for Invoices and E-Tickets shall remain permanently accessible.

### Domain 14: Customer Dashboard

- **AC-DASH-001 (`FR-DASH-001`):**  
  `Given` an authenticated customer  
  `When` opening "My Bookings"  
  `Then` the system shall list all past and active booking reservations.
- **AC-DASH-002 (`FR-DASH-002`):**  
  `Given` bookings in various lifecycle stages  
  `When` listed in dashboard  
  `Then` the system shall display accurate status badges (`Awaiting Payment`, `Confirmed`, `Cancellation Under Review`, `Cancelled`, `Completed`).
- **AC-DASH-003 (`FR-DASH-003`):**  
  `Given` a confirmed booking card in dashboard  
  `When` customer clicks "Download Voucher" or "Download Invoice"  
  `Then` the system shall deliver the respective PDF document immediately.
- **AC-DASH-004 (`FR-DASH-004`):**  
  `Given` an active confirmed booking eligible for cancellation  
  `When` customer clicks "Request Cancellation"  
  `Then` the system shall prompt cancellation confirmation according to policy.

### Domain 15: Cancellations & Refunds

- **AC-CANCEL-001 (`FR-CANCEL-001`):**  
  `Given` an eligible confirmed booking  
  `When` customer submits a cancellation request  
  `Then` the system shall transition booking status to cancellation-under-review.
- **AC-CANCEL-002 (`FR-CANCEL-002`):**  
  `Given` a cancellation request  
  `When` refund is evaluated  
  `Then` the system shall compute allowable refund and cancellation fee according to configured policy.
- **AC-CANCEL-003 (`FR-CANCEL-003`):**  
  `Given` a submitted cancellation request  
  `When` administrator opens cancellation queue  
  `Then` the system shall display the request with customer notes and calculated refund for authorization.
- **AC-CANCEL-004 (`FR-CANCEL-004`):**  
  `Given` an authorized refund  
  `When` refund transaction completes  
  `Then` the system shall record a refund entity, mark booking refunded, and restore departure seats.

### Domain 16: Reviews & Testimonials

- **AC-REVIEW-001 (`FR-REVIEW-001`):**  
  `Given` a customer with a booking in completed state  
  `When` customer submits star rating and review text  
  `Then` the system shall record the review in pending status.
- **AC-REVIEW-002 (`FR-REVIEW-002`):**  
  `Given` pending reviews in Admin Console  
  `When` administrator approves a review  
  `Then` its status shall transition to approved.
- **AC-REVIEW-003 (`FR-REVIEW-003`):**  
  `Given` approved testimonials  
  `When` package page or homepage loads  
  `Then` the system shall display verified customer ratings and text.

### Domain 17: Administration

- **AC-ADMIN-001 (`FR-ADMIN-001`):**  
  `Given` an authenticated administrator  
  `When` Admin Dashboard opens  
  `Then` the system shall display operational KPIs: Gross Revenue, Active Bookings, User Count, and Package Count.
- **AC-ADMIN-002 (`FR-ADMIN-002`):**  
  `Given` the Admin Booking Management view  
  `When` administrator filters bookings by status or reference  
  `Then` the system shall display matching records with customer details and management actions.
- **AC-ADMIN-003 (`FR-ADMIN-003`):**  
  `Given` the Admin User Management view  
  `When` administrator inspects customer accounts  
  `Then` the system shall provide account details and status toggle controls.
- **AC-ADMIN-004 (`FR-ADMIN-004`):**  
  `Given` the Departure Inventory view  
  `When` administrator opens a departure date  
  `Then` the system shall display seat capacity, booked seats, and passenger manifest rosters.

### Domain 18: CMS Management

- **AC-CMS-001 (`FR-CMS-001`):**  
  `Given` an administrator updates homepage slider banners  
  `When` changes are published  
  `Then` the homepage Hero slider shall display the updated banners immediately.
- **AC-CMS-002 (`FR-CMS-002`):**  
  `Given` an administrator edits agency contact info or logo  
  `When` saved  
  `Then` updated agency metadata shall reflect on headers, footers, and invoices.
- **AC-CMS-003 (`FR-CMS-003`):**  
  `Given` an administrator edits About Us or legal page text  
  `When` published  
  `Then` public static pages shall render the revised content.

### Domain 19: Transactional Notifications

- **AC-NOTIFY-001 (`FR-NOTIFY-001`):**  
  `Given` a booking transitions to confirmed  
  `When` confirmation event fires  
  `Then` the system shall dispatch an automated confirmation email with booking details to the customer.
- **AC-NOTIFY-002 (`FR-NOTIFY-002`):**  
  `Given` an approved refund transaction  
  `When` refund completes  
  `Then` the system shall dispatch an automated refund notification email to the customer.

### Domain 20: Reporting

- **AC-REPORT-001 (`FR-REPORT-001`):**  
  `Given` an administrator selects date range and filters  
  `When` report is generated  
  `Then` the system shall render revenue and booking summaries categorized by destination and theme.

---

## 18. Decision Dependencies

The following matrix maps the canonical 10 product decisions from Phase 0.2 to affected specification requirements:

| Decision ID | Canonical Decision Subject         | Directly Affected Requirements                  | Directly Affected Business Rules | Affected Use Cases & Acceptance Criteria                   |
| ----------- | ---------------------------------- | ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| **DEC-001** | **Canonical Product Branding**     | `FR-STOREFRONT-001`, `FR-DOC-002`, `FR-CMS-002` | —                                | UI branding, footer copyright, and invoice headers.        |
| **DEC-002** | **Core Business Model**            | `FR-PACKAGE-005`, `FR-ADMIN-001`                | `BR-AUTH-002`                    | `UC-004`, `AC-ADMIN-001` (Admin inventory ownership).      |
| **DEC-003** | **Booking Confirmation Paradigm**  | `FR-CONFIRM-001`, `FR-CONFIRM-002`              | `BR-PAY-001`                     | `UC-002`, `AC-CONFIRM-001`, `AC-CONFIRM-002`.              |
| **DEC-004** | **Travel Agent Role Scope**        | `ACT-AGENT`, Section 24 (Roadmap)               | —                                | Travel agent workspaces deferred to Phase 2.               |
| **DEC-005** | **Operating Base Currency**        | `FR-CONFIG-002`, `FR-PAY-002`, `FR-DOC-002`     | `BR-PRICE-001`                   | Monetary formatting in pricing, checkout, and invoices.    |
| **DEC-006** | **Payment Model Semantics**        | `FR-PAY-001`                                    | `BR-PAY-001`                     | `UC-002`, `AC-PAY-001` (100% upfront payment vs. deposit). |
| **DEC-007** | **Cancellation & Refund Schedule** | `FR-CANCEL-002`, `FR-CANCEL-003`                | `BR-CANCEL-001`                  | `AC-CANCEL-001`, `AC-CANCEL-002` (Refund penalty tiers).   |
| **DEC-008** | **Transport Booking Integration**  | `FR-PACKAGE-002`, Section 10                    | —                                | Descriptive inclusions (MVP-1) vs. live GDS (Phase 3).     |
| **DEC-009** | **Customer Account Requirement**   | `FR-AUTH-008`                                   | `BR-AUTH-001`                    | `UC-002`, `AC-AUTH-008` (Guest checkout account creation). |
| **DEC-010** | **Legacy Documentation Scrubbing** | `NFR-COMPAT-002`                                | —                                | Deprecation of legacy Java/WinXP/IE6 references.           |

---

## 19. Requirement Traceability Matrix

_The following matrix provides complete end-to-end traceability for all 72 MUST Functional Requirements down to atomic Acceptance Criteria and Future Test Identifiers._

| Business Goal                   | Product Capability | Functional Requirement | Business Rule   | Use Case | Acceptance Criteria | Future Test ID        |
| ------------------------------- | ------------------ | ---------------------- | --------------- | -------- | ------------------- | --------------------- |
| **BG-01: Public Discovery**     | `CAP-STOREFRONT`   | `FR-STOREFRONT-001`    | `BR-PKG-001`    | `UC-001` | `AC-STOREFRONT-001` | `TEST-STOREFRONT-001` |
| **BG-01: Public Discovery**     | `CAP-STOREFRONT`   | `FR-STOREFRONT-002`    | `BR-PKG-001`    | `UC-001` | `AC-STOREFRONT-002` | `TEST-STOREFRONT-002` |
| **BG-01: Public Discovery**     | `CAP-STOREFRONT`   | `FR-STOREFRONT-003`    | `BR-PKG-001`    | `UC-001` | `AC-STOREFRONT-003` | `TEST-STOREFRONT-003` |
| **BG-01: Public Discovery**     | `CAP-STOREFRONT`   | `FR-STOREFRONT-004`    | `BR-PKG-001`    | `UC-001` | `AC-STOREFRONT-004` | `TEST-STOREFRONT-004` |
| **BG-01: Public Discovery**     | `CAP-STOREFRONT`   | `FR-STOREFRONT-006`    | —               | `UC-001` | `AC-STOREFRONT-006` | `TEST-STOREFRONT-006` |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-001`          | `BR-AUTH-001`   | `UC-001` | `AC-AUTH-001`       | `TEST-AUTH-001`       |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-002`          | `BR-AUTH-001`   | `UC-001` | `AC-AUTH-002`       | `TEST-AUTH-002`       |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-003`          | `BR-AUTH-001`   | `UC-001` | `AC-AUTH-003`       | `TEST-AUTH-003`       |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-004`          | `BR-AUTH-002`   | `UC-004` | `AC-AUTH-004`       | `TEST-AUTH-004`       |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-005`          | `BR-AUTH-001`   | `UC-001` | `AC-AUTH-005`       | `TEST-SEC-002`        |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-006`          | `BR-AUTH-001`   | `UC-001` | `AC-AUTH-006`       | `TEST-AUTH-006`       |
| **BG-02: User Identity**        | `CAP-AUTH`         | `FR-AUTH-008`          | `BR-AUTH-001`   | `UC-002` | `AC-AUTH-008`       | `TEST-AUTH-008`       |
| **BG-01: Destinations**         | `CAP-CATALOG`      | `FR-DEST-001`          | `BR-PKG-001`    | `UC-001` | `AC-DEST-001`       | `TEST-DEST-001`       |
| **BG-01: Destinations**         | `CAP-CATALOG`      | `FR-DEST-002`          | `BR-PKG-001`    | `UC-001` | `AC-DEST-002`       | `TEST-DEST-002`       |
| **BG-05: Destination Admin**    | `CAP-CATALOG`      | `FR-DEST-003`          | `BR-AUTH-002`   | `UC-004` | `AC-DEST-003`       | `TEST-DEST-003`       |
| **BG-01: Themes**               | `CAP-CATALOG`      | `FR-THEME-001`         | `BR-PKG-001`    | `UC-001` | `AC-THEME-001`      | `TEST-THEME-001`      |
| **BG-05: Theme Admin**          | `CAP-CATALOG`      | `FR-THEME-002`         | `BR-AUTH-002`   | `UC-004` | `AC-THEME-002`      | `TEST-THEME-002`      |
| **BG-03: Package Catalog**      | `CAP-CATALOG`      | `FR-PACKAGE-001`       | `BR-PKG-001`    | `UC-001` | `AC-PACKAGE-001`    | `TEST-PACKAGE-001`    |
| **BG-03: Package Catalog**      | `CAP-CATALOG`      | `FR-PACKAGE-002`       | `BR-PKG-001`    | `UC-001` | `AC-PACKAGE-002`    | `TEST-PACKAGE-002`    |
| **BG-03: Package Catalog**      | `CAP-CATALOG`      | `FR-PACKAGE-003`       | `BR-PKG-001`    | `UC-001` | `AC-PACKAGE-003`    | `TEST-PACKAGE-003`    |
| **BG-03: Package Catalog**      | `CAP-CATALOG`      | `FR-PACKAGE-004`       | `BR-PKG-001`    | `UC-001` | `AC-PACKAGE-004`    | `TEST-PACKAGE-004`    |
| **BG-05: Package Admin**        | `CAP-CATALOG`      | `FR-PACKAGE-005`       | `BR-AUTH-002`   | `UC-004` | `AC-PACKAGE-005`    | `TEST-PACKAGE-005`    |
| **BG-03: Package Integrity**    | `CAP-CATALOG`      | `FR-PACKAGE-006`       | `BR-PKG-001`    | `UC-004` | `AC-PACKAGE-006`    | `TEST-PACKAGE-006`    |
| **BG-03: Itineraries**          | `CAP-CATALOG`      | `FR-ITIN-001`          | `BR-PKG-001`    | `UC-001` | `AC-ITIN-001`       | `TEST-ITIN-001`       |
| **BG-05: Itinerary Admin**      | `CAP-CATALOG`      | `FR-ITIN-002`          | `BR-AUTH-002`   | `UC-004` | `AC-ITIN-002`       | `TEST-ITIN-002`       |
| **BG-02: Inventory Scheduling** | `CAP-INVENTORY`    | `FR-INVENT-001`        | `BR-INVENT-001` | `UC-004` | `AC-INVENT-001`     | `TEST-INVENT-001`     |
| **BG-02: Capacity Calculation** | `CAP-INVENTORY`    | `FR-INVENT-002`        | `BR-INVENT-001` | `UC-002` | `AC-INVENT-002`     | `TEST-INVENT-002`     |
| **BG-02: Anti-Overbooking**     | `CAP-INVENTORY`    | `FR-INVENT-003`        | `BR-INVENT-001` | `UC-002` | `AC-INVENT-003`     | `TEST-INVENT-003`     |
| **BG-02: Hold Placement**       | `CAP-INVENTORY`    | `FR-INVENT-004`        | `BR-INVENT-002` | `UC-002` | `AC-INVENT-004`     | `TEST-INVENT-004`     |
| **BG-02: Hold Expiration**      | `CAP-INVENTORY`    | `FR-INVENT-005`        | `BR-INVENT-002` | `UC-002` | `AC-INVENT-005`     | `TEST-INVENT-005`     |
| **BG-01: Keyword Search**       | `CAP-SEARCH`       | `FR-SEARCH-001`        | —               | `UC-001` | `AC-SEARCH-001`     | `TEST-SEARCH-001`     |
| **BG-01: Filtering**            | `CAP-SEARCH`       | `FR-SEARCH-002`        | —               | `UC-001` | `AC-SEARCH-002`     | `TEST-SEARCH-002`     |
| **BG-01: Search UX**            | `CAP-SEARCH`       | `FR-SEARCH-003`        | —               | `UC-001` | `AC-SEARCH-003`     | `TEST-SEARCH-003`     |
| **BG-03: Party Configuration**  | `CAP-BOOKING`      | `FR-CONFIG-001`        | `BR-PRICE-001`  | `UC-002` | `AC-CONFIG-001`     | `TEST-CONFIG-001`     |
| **BG-03: Price Calculation**    | `CAP-BOOKING`      | `FR-CONFIG-002`        | `BR-PRICE-001`  | `UC-002` | `AC-CONFIG-002`     | `TEST-CONFIG-002`     |
| **BG-03: Price Transparency**   | `CAP-BOOKING`      | `FR-CONFIG-003`        | `BR-PRICE-001`  | `UC-002` | `AC-CONFIG-003`     | `TEST-CONFIG-003`     |
| **BG-04: Booking Reference**    | `CAP-BOOKING`      | `FR-BOOK-001`          | `BR-PRICE-001`  | `UC-002` | `AC-BOOK-001`       | `TEST-BOOK-001`       |
| **BG-04: Passenger Roster**     | `CAP-BOOKING`      | `FR-BOOK-002`          | `BR-AUTH-001`   | `UC-002` | `AC-BOOK-002`       | `TEST-BOOK-002`       |
| **BG-04: Price Locking**        | `CAP-BOOKING`      | `FR-BOOK-003`          | `BR-PRICE-001`  | `UC-002` | `AC-BOOK-003`       | `TEST-BOOK-003`       |
| **BG-04: Booking State**        | `CAP-BOOKING`      | `FR-BOOK-004`          | `BR-INVENT-002` | `UC-002` | `AC-BOOK-004`       | `TEST-BOOK-004`       |
| **BG-04: Booking Expiration**   | `CAP-BOOKING`      | `FR-BOOK-005`          | `BR-INVENT-002` | `UC-002` | `AC-BOOK-005`       | `TEST-BOOK-005`       |
| **BG-04: Digital Checkout**     | `CAP-PAYMENT`      | `FR-PAY-001`           | `BR-PAY-001`    | `UC-002` | `AC-PAY-001`        | `TEST-PAY-001`        |
| **BG-04: Payment Logging**      | `CAP-PAYMENT`      | `FR-PAY-002`           | `BR-PAY-001`    | `UC-002` | `AC-PAY-002`        | `TEST-PAY-002`        |
| **BG-04: Payment Idempotency**  | `CAP-PAYMENT`      | `FR-PAY-003`           | `BR-PAY-001`    | `UC-002` | `AC-PAY-003`        | `TEST-PAY-003`        |
| **BG-04: Instant Confirmation** | `CAP-CONFIRM`      | `FR-CONFIRM-001`       | `BR-PAY-001`    | `UC-002` | `AC-CONFIRM-001`    | `TEST-CONFIRM-001`    |
| **BG-04: Manual Approval**      | `CAP-CONFIRM`      | `FR-CONFIRM-002`       | `BR-PAY-001`    | `UC-002` | `AC-CONFIRM-002`    | `TEST-CONFIRM-002`    |
| **BG-04: Confirmation Screen**  | `CAP-CONFIRM`      | `FR-CONFIRM-003`       | `BR-PAY-001`    | `UC-002` | `AC-CONFIRM-003`    | `TEST-CONFIRM-003`    |
| **BG-04: Invoicing**            | `CAP-DOCGEN`       | `FR-DOC-001`           | `BR-DOC-001`    | `UC-003` | `AC-DOC-001`        | `TEST-DOC-001`        |
| **BG-04: Tax Invoice Content**  | `CAP-DOCGEN`       | `FR-DOC-002`           | `BR-DOC-001`    | `UC-003` | `AC-DOC-002`        | `TEST-DOC-002`        |
| **BG-04: E-Ticket Voucher**     | `CAP-DOCGEN`       | `FR-DOC-003`           | `BR-DOC-001`    | `UC-003` | `AC-DOC-003`        | `TEST-DOC-003`        |
| **BG-04: Document Access**      | `CAP-DOCGEN`       | `FR-DOC-004`           | `BR-DOC-001`    | `UC-003` | `AC-DOC-004`        | `TEST-DOC-004`        |
| **BG-01: Customer Portal**      | `CAP-DASHBOARD`    | `FR-DASH-001`          | `BR-AUTH-001`   | `UC-003` | `AC-DASH-001`       | `TEST-DASH-001`       |
| **BG-01: Status Visibility**    | `CAP-DASHBOARD`    | `FR-DASH-002`          | —               | `UC-003` | `AC-DASH-002`       | `TEST-DASH-002`       |
| **BG-01: 1-Click Downloads**    | `CAP-DASHBOARD`    | `FR-DASH-003`          | `BR-DOC-001`    | `UC-003` | `AC-DASH-003`       | `TEST-DASH-003`       |
| **BG-01: Self-Service Cancel**  | `CAP-DASHBOARD`    | `FR-DASH-004`          | `BR-CANCEL-001` | `UC-002` | `AC-DASH-004`       | `TEST-DASH-004`       |
| **BG-05: Cancellation Request** | `CAP-CANCEL`       | `FR-CANCEL-001`        | `BR-CANCEL-001` | `UC-002` | `AC-CANCEL-001`     | `TEST-CANCEL-001`     |
| **BG-05: Refund Calculation**   | `CAP-CANCEL`       | `FR-CANCEL-002`        | `BR-CANCEL-001` | `UC-002` | `AC-CANCEL-002`     | `TEST-CANCEL-002`     |
| **BG-05: Cancellation Queue**   | `CAP-CANCEL`       | `FR-CANCEL-003`        | `BR-AUTH-002`   | `UC-004` | `AC-CANCEL-003`     | `TEST-CANCEL-003`     |
| **BG-05: Refund Settlement**    | `CAP-CANCEL`       | `FR-CANCEL-004`        | `BR-AUTH-002`   | `UC-004` | `AC-CANCEL-004`     | `TEST-CANCEL-004`     |
| **BG-01: Review Submission**    | `CAP-REVIEWS`      | `FR-REVIEW-001`        | `BR-REVIEW-001` | `UC-001` | `AC-REVIEW-001`     | `TEST-REVIEW-001`     |
| **BG-05: Review Moderation**    | `CAP-REVIEWS`      | `FR-REVIEW-002`        | `BR-AUTH-002`   | `UC-004` | `AC-REVIEW-002`     | `TEST-REVIEW-002`     |
| **BG-01: Testimonial Showcase** | `CAP-REVIEWS`      | `FR-REVIEW-003`        | —               | `UC-001` | `AC-REVIEW-003`     | `TEST-REVIEW-003`     |
| **BG-05: Admin Dashboard**      | `CAP-ADMIN`        | `FR-ADMIN-001`         | `BR-AUTH-002`   | `UC-004` | `AC-ADMIN-001`      | `TEST-ADMIN-001`      |
| **BG-05: Booking Management**   | `CAP-ADMIN`        | `FR-ADMIN-002`         | `BR-AUTH-002`   | `UC-004` | `AC-ADMIN-002`      | `TEST-ADMIN-002`      |
| **BG-05: User Management**      | `CAP-ADMIN`        | `FR-ADMIN-003`         | `BR-AUTH-002`   | `UC-004` | `AC-ADMIN-003`      | `TEST-ADMIN-003`      |
| **BG-05: Departure Manifests**  | `CAP-ADMIN`        | `FR-ADMIN-004`         | `BR-AUTH-002`   | `UC-004` | `AC-ADMIN-004`      | `TEST-ADMIN-004`      |
| **BG-05: Slider CMS**           | `CAP-CMS`          | `FR-CMS-001`           | `BR-AUTH-002`   | `UC-004` | `AC-CMS-001`        | `TEST-CMS-001`        |
| **BG-05: Agency Metadata**      | `CAP-CMS`          | `FR-CMS-002`           | `BR-AUTH-002`   | `UC-004` | `AC-CMS-002`        | `TEST-CMS-002`        |
| **BG-05: Static Pages**         | `CAP-CMS`          | `FR-CMS-003`           | `BR-AUTH-002`   | `UC-004` | `AC-CMS-003`        | `TEST-CMS-003`        |
| **BG-04: Confirmation Email**   | `CAP-NOTIFY`       | `FR-NOTIFY-001`        | —               | `UC-002` | `AC-NOTIFY-001`     | `TEST-NOTIFY-001`     |
| **BG-05: Refund Email**         | `CAP-NOTIFY`       | `FR-NOTIFY-002`        | —               | `UC-004` | `AC-NOTIFY-002`     | `TEST-NOTIFY-002`     |
| **BG-05: Revenue Reporting**    | `CAP-REPORTING`    | `FR-REPORT-001`        | `BR-AUTH-002`   | `UC-004` | `AC-REPORT-001`     | `TEST-REPORT-001`     |

---

## 20. Requirement Dependency Matrix

- `FR-BOOK-001` (Booking) strictly depends on `FR-AUTH-001` (Customer Identity), `FR-PACKAGE-001` (Package Catalog), and `FR-INVENT-001` (Departure Capacity).
- `FR-PAY-001` (Payment) strictly depends on `FR-BOOK-001` (Active Booking Session) and `FR-CONFIG-002` (Calculated Price).
- `FR-CONFIRM-001` (Confirmation) strictly depends on `FR-PAY-001` (Payment Verification).
- `FR-DOC-001` & `FR-DOC-003` (Document Generation) strictly depend on `FR-CONFIRM-001` (Confirmed State) and `FR-CMS-002` (Agency Legal Metadata).
- `FR-REVIEW-001` (Testimonials) strictly depends on `FR-BOOK-001` reaching `COMPLETED` status.

---

## 21. Contradiction Register

| Conflict ID | Contradiction Statement                                           | Conflicting Sources                                      | Affected Open Decision    | Handling in Specification                                                     |
| ----------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| **CONF-01** | Instant Automated Confirmation vs. Manual Admin Confirmation Gate | Synopsis L48 (Instant) vs. Synopsis L43 (Admin approval) | `[CONDITIONAL — DEC-003]` | Both branches specified conditionally (`FR-CONFIRM-001` vs `FR-CONFIRM-002`). |
| **CONF-02** | Mandatory Pre-Registration vs. Frictionless Guest Checkout        | Document §4.1 vs. Synopsis L28                           | `[CONDITIONAL — DEC-009]` | Specified as Guest Checkout with automatic account creation (`FR-AUTH-008`).  |
| **CONF-03** | Descriptive Package Transport vs. Third-Party Flight GDS Booking  | Synopsis L37 vs. Document §9                             | `[CONDITIONAL — DEC-008]` | Descriptive transport specified for MVP-1; live GDS deferred to Phase 3.      |
| **CONF-04** | Operating Currency (INR ₹ vs. USD $)                              | Repo international styling vs. Indian agency context     | `[CONDITIONAL — DEC-005]` | Monetary formatting parameterized to active configuration.                    |

---

## 22. Assumption Register

| Assumption ID | Operational Baseline Assumption                                                 | Status    | Impact if Changed                                                                            |
| ------------- | ------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| **ASM-01**    | Standard checkout temporary seat reservation hold window is 15 minutes.         | PROPOSED  | Hold duration parameterized in configuration.                                                |
| **ASM-02**    | Standard booking payment model requires 100% full upfront digital payment.      | PROPOSED  | If partial deposit selected, payment state machine requires installment tracking.            |
| **ASM-03**    | English is the primary initial user interface and document generation language. | CONFIRMED | Multi-language localization deferred to Phase 3.                                             |
| **ASM-04**    | Itemized tax amounts (GST/VAT) are appended at checkout calculation.            | PROPOSED  | If tax-inclusive selected, price calculation logic adjusts without affecting booking schema. |

---

## 23. Open Decisions Register

The following 10 canonical product decisions from Phase 0.2 remain open awaiting formal stakeholder sign-off:

| Decision ID | Canonical Decision Subject         | Impacted Requirement IDs                          | Recommended Default Baseline                                  |
| ----------- | ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **DEC-001** | **Canonical Product Branding**     | `FR-STOREFRONT-001`, `FR-DOC-002`, `FR-CMS-002`   | **Young Tours & Travels** (working code: `Travel-Web`)        |
| **DEC-002** | **Core Business Model**            | `FR-PACKAGE-005`, `FR-ADMIN-001`                  | **Direct Tour Operator Platform** (Agency owns all inventory) |
| **DEC-003** | **Booking Confirmation Paradigm**  | `FR-CONFIRM-001`, `FR-CONFIRM-002`                | **Instant Automated Confirmation** on payment callback        |
| **DEC-004** | **Travel Agent Role Scope**        | `ACT-AGENT`, Section 24 (Roadmap)                 | **Deferred to Phase 2**                                       |
| **DEC-005** | **Operating Base Currency**        | `FR-CONFIG-002`, `FR-PAY-002`, `FR-DOC-002`       | **INR (₹)** or **USD ($)**                                    |
| **DEC-006** | **Payment Model Semantics**        | `FR-PAY-001`                                      | **100% Full Upfront Digital Payment**                         |
| **DEC-007** | **Cancellation & Refund Schedule** | `FR-CANCEL-002`, `FR-CANCEL-003`, `BR-CANCEL-001` | **Tiered Schedule (90% / 50% / 25% / 0%)**                    |
| **DEC-008** | **Transport Booking Integration**  | `FR-PACKAGE-002`, Section 10                      | **Descriptive Inclusions Only** in MVP-1                      |
| **DEC-009** | **Customer Account Requirement**   | `FR-AUTH-008`                                     | **Guest Checkout with Automatic Account Creation**            |
| **DEC-010** | **Legacy Documentation Scrubbing** | `NFR-COMPAT-002`                                  | **Formally Deprecate Java / WinXP / IE6 References**          |

---

## 24. Open Questions for Stakeholders

1. **Tax Model:** Is the displayed package price inclusive of all GST/taxes, or should a flat 5% / 18% GST be appended at checkout? _(Assumed: Appended itemized tax at checkout)._
2. **Offline Payment Option:** Should an option for "Bank Transfer / Cash at Office" with manual admin payment verification be provided alongside digital checkout? _(Assumed: 100% digital payment for MVP-1)._
3. **Helpline Contact Details:** What official agency phone number and support email address should be populated as default seed metadata?

---

## 25. Deferred Requirements (Phase 2 & Phase 3 Roadmap)

- **MVP-1.1:** `FR-NOTIFY-003` (SMS Gateway Integration), `FR-SEARCH-004` (Advanced sorting), `FR-REPORT-002` (Spreadsheet export).
- **Phase 2:** Dedicated Travel Agent login portal (`DEC-004`), lead assignment workspace, interactive map route elevation, seasonal surge pricing rules.
- **Phase 3:** Native iOS/Android mobile apps, AI chatbot for 24/7 package inquiries, third-party live flight GDS inventory synchronization (`DEC-008`).

---

## 26. Requirements Quality Checklist

- [x] **Implementation Independence:** Zero programming languages, frameworks, ORMs, database engines, or cloud hosting vendors prescribed.
- [x] **Evidence Classification:** All 77 functional requirements, 28 NFRs, and 10 business rules explicitly classified.
- [x] **Decision Independence:** Canonical Decision IDs (`DEC-001` through `DEC-010`) preserved without remapping or premature locking.
- [x] **Atomic & Testable:** 100% of the 72 MUST functional requirements have explicit Given/When/Then acceptance criteria.
- [x] **Traceability:** Complete bidirectional traceability from Business Goals down to Future Test IDs without phantom references.

---

## 27. Phase 0.3 Exit Criteria

- [x] Canonical implementation-independent Requirements Specification established.
- [x] Companion Quality Review Report synchronized in [`docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_QUALITY_REVIEW.md).
- [x] Companion Final Audit Report synchronized in [`docs/PHASE_0_3_FINAL_AUDIT.md`](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_FINAL_AUDIT.md).
- [x] Zero application code modified.
- [x] Zero technology stack selections made.
- [x] Specification formally **FROZEN** and approved for **Phase 0.4 (System Architecture & Technical Design)**.

---

_End of Phase 0.3 Requirements Specification Document._
