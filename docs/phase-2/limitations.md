# Phase 2 — Limitations, Operational Gaps & Future Scope

This document defines the operational boundaries of the Phase 2 Identity & Access Management implementation, documenting current maintenance gaps, planned future security enhancements, and out-of-scope domain modules.

---

## 1. Current Operational Maintenance Items

### 1.1 Refresh-Token Database Pruning Worker

- **Classification:** Operational Maintenance (Non-Blocking / Post-Phase 2).
- **Description:** As users log in and refresh sessions, older refresh tokens are marked with `revoked_at = NOW()`. Additionally, tokens past their `expires_at` timestamp naturally expire. These revoked and expired rows remain in the `refresh_tokens` PostgreSQL table.
- **Impact Analysis:**
  - **Security Impact: None.** All lookup queries explicitly filter `revoked_at IS NULL AND expires_at > NOW()`, ensuring expired or revoked tokens are never accepted.
  - **Performance Impact: Minimal in near-term.** The unique index on `token_hash` maintains $O(1)$ lookup complexity.
- **Resolution Plan:** A recurring BullMQ background worker job (`prune-expired-tokens`) is scheduled for implementation during Phase 4 (Worker Infrastructure & Maintenance Jobs) to periodically execute `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days'`.

---

## 2. Deferred Future Features

The following capabilities are deliberately planned for subsequent phases and do not form part of the Phase 2 baseline:

### 2.1 Multi-Factor Authentication (MFA / TOTP)

- **Scope:** Time-based One-Time Password (TOTP) authenticator app integration (RFC 6238) for administrators and high-value customer accounts.
- **Scheduled:** Post-MVP Enterprise Hardening.

### 2.2 OAuth2 & Social Federated Login

- **Scope:** Single Sign-On (SSO) via Google and Apple OAuth2 providers.
- **Scheduled:** Phase 7 Growth & Conversion.

### 2.3 Password Reset & Account Recovery

- **Scope:** Time-limited cryptographic token generation and email dispatch for forgotten passwords (`POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password`).
- **Scheduled:** Phase 5 (Notifications & Email Workflows).

### 2.4 Mandatory Email Verification

- **Scope:** Email address verification loops upon initial registration prior to full account activation.
- **Scheduled:** Phase 5 (Notifications & Email Workflows).

### 2.5 User Profile Management & Avatar Upload

- **Scope:** Customer profile updates (`PUT /api/v1/users/profile`) and avatar image uploads via Object Storage.
- **Scheduled:** Phase 6 (User Portal & Bookings).

### 2.6 Administrative User Management

- **Scope:** Dedicated administrative panel to search, view, deactivate, or elevate user accounts.
- **Scheduled:** Phase 6 (Admin Operations).

---

## 3. Explicitly Out-of-Scope Domain Modules

The following domain modules belong to subsequent implementation phases and are entirely separate from Phase 2 Identity & Access:

- **Phase 3:** Destination Management & Tour Package Catalogue
- **Phase 4:** Departure Dates, Seat Inventory & Hold Sweeper Worker
- **Phase 5:** Booking Engine, Guest Checkout (`DEC-009`) & Notification Delivery
- **Phase 6:** Payment Gateway Integration, Webhooks & Automated Invoicing
- **Phase 7:** Analytics, Customer Portal & End-to-End Hardening
