# Phase 0.4.3 — Security & Data Protection Architecture

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Blueprint  
**Upstream Authority:** [docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) (v3.0.0 Canonical Frozen Baseline)  
**Supporting Baselines:**

- [docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_1_ARCHITECTURE_CONSTRAINTS.md)
- [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md)

---

## 1. Document Control

| Property            | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| **Document ID**     | `DOC-ARCH-0.4.3`                                                        |
| **Document Title**  | Security & Data Protection Architecture                                 |
| **Current Version** | `1.0.0` (Technical Architecture Baseline)                               |
| **Author Roles**    | Lead Security Architect, Application Security Engineer, Systems Analyst |
| **Target Audience** | Engineering Team, Security Auditors, DevOps Engineers                   |

---

## 2. Security Architecture Principles

The security architecture of the Young Tours & Travels platform adheres to five fundamental principles:

1. **Defense in Depth:** Multiple independent validation layers (Network, Gateway, Controller, Domain, Database).
2. **Zero Trust for Clients:** The client frontend is treated as untrusted; all pricing, seat capacity, authorization claims, and input payloads are strictly validated server-side.
3. **Least Privilege:** Public users, registered customers, background workers, and administrators operate with the minimal permissions necessary.
4. **PCI-DSS Cardholder Isolation:** Zero cardholder data (PAN, CVV, PIN) enters or traverses the platform's infrastructure (`NFR-SEC-008`).
5. **Immutable Auditability:** Every financial state mutation and administrative change produces an indelible audit trail (`NFR-AUDIT-001..002`).

---

## 3. Threat Model & Mitigation Strategy (STRIDE)

```
+-----------------------------------------------------------------------------------+
|                        THREAT MODEL & MITIGATION MATRIX                           |
+-----------------------------------------------------------------------------------+
| STRIDE Threat     | Attack Vector & Target               | Architecture Mitigation|
+-------------------+--------------------------------------+------------------------+
| Spoofing          | Impersonating customer or admin      | Short-lived JWTs,      |
|                   | via stolen tokens or credentials.    | Argon2id, MFA (P2).    |
+-------------------+--------------------------------------+------------------------+
| Tampering         | Modifying checkout prices or         | Server-side pricing,   |
|                   | injecting malicious SQL/XSS payloads.| HMAC webhook verify.   |
+-------------------+--------------------------------------+------------------------+
| Repudiation       | Denying a booking or refund action.  | Append-only audit log, |
|                   |                                      | payment gateway refs.  |
+-------------------+--------------------------------------+------------------------+
| Information Leak  | Leaking customer PII or raw invoices.| Private S3 buckets,    |
|                   |                                      | signed time-bound URLs.|
+-------------------+--------------------------------------+------------------------+
| Denial of Service | Brute-force login or search flooding.| Distributed Rate       |
|                   |                                      | Limiter, query paging. |
+-------------------+--------------------------------------+------------------------+
| Elevation of      | Customer accessing `/api/v1/admin/*` | Mandatory RBAC auth    |
| Privilege         | endpoints directly.                  | middleware filters.    |
+-----------------------------------------------------------------------------------+
```

---

## 4. Security Control Domains

### 4.1 Transport Layer Security (`NFR-SEC-001`)

- **Protocol:** Mandatory TLS 1.3 / TLS 1.2 across all external and internal endpoints. Plain HTTP is automatically redirected to HTTPS (301 Permanent).
- **HTTP Security Headers:**
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### 4.2 Credential Protection & Password Security (`NFR-SEC-002`)

- **Hashing Mechanism:** Passwords hashed using **Argon2id** (memory cost: 64MB, time cost: 3 iterations, parallelism: 4) or **bcrypt** (work factor: 12).
- **Salt Generation:** Unique, cryptographically secure 128-bit salt per password.
- **Password Policy:** Minimum 8 characters, requiring uppercase, lowercase, numeric, and special character combinations.
- **Brute-Force Protection:** Account lockout or exponential delays after 5 consecutive failed authentication attempts within a 15-minute window.

### 4.3 Session & Token Security

- **Access Tokens:** Short-lived JSON Web Tokens (15-minute TTL) signed using asymmetric RSA-256 (RS256) or HMAC-SHA256 (HS256) with a 256-bit secret key.
- **Refresh Tokens:** Long-lived opaque tokens (7-day TTL) stored in encrypted server-side session stores and transmitted via `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
- **Token Invalidation:** Token revocation list (denylist) invoked immediately upon user logout or password reset.

### 4.4 Authorization & Object-Level Privilege Isolation (`NFR-SEC-006`)

- **Role-Based Access Control (RBAC):** Every API endpoint is guarded by a role authorization middleware enforcing strict permission checks (`GUEST`, `CUSTOMER`, `ADMIN`).
- **Object-Level Access Control (IDOR Defense):** Customer endpoints (e.g. `/api/v1/bookings/:id`) verify that the `customer_id` associated with the requested record matches the authenticated user ID extracted from the token, preventing Insecure Direct Object Reference vulnerabilities.

### 4.5 Injection & Input Defense (`NFR-SEC-003`, `NFR-SEC-004`, `NFR-SEC-005`)

- **SQL Injection Prevention:** 100% of database interactions execute via parameterized queries and typed Object-Relational/Repository abstractions. Raw string interpolation in SQL is strictly prohibited.
- **Cross-Site Scripting (XSS) Defense:** All user-supplied inputs (reviews, customer notes, contact forms) are sanitized on ingestion and contextually encoded upon rendering.
- **Cross-Site Request Forgery (CSRF) Defense:** SameSite cookie configuration combined with custom header verification (`X-Requested-With` or Anti-CSRF double-submit tokens) on all state-mutating requests.

### 4.6 Payment Gateway & Webhook Security (`NFR-SEC-008`, `NFR-REL-002`)

- **Zero Cardholder Data Storage:** The platform never collects, transmits, or stores credit card numbers, CVVs, or cardholder credentials. All payment capture occurs within the payment gateway's PCI-DSS compliant hosted fields or checkout redirection.
- **Cryptographic HMAC Signature Verification:** Inbound webhook payloads from `ACT-EXT-PAY` are verified using the gateway's shared secret signature before processing. Unsigned or invalid payloads are rejected with HTTP 401 Unauthorized.
- **Webhook Idempotency:** Webhook event IDs are stored with a unique database constraint. Replayed webhook events return HTTP 200 OK immediately without executing duplicate state transitions or refunds.

### 4.7 File Upload & Document Security

- **Media Uploads (Admin Banner / Gallery Images):**
  - Strict MIME-type whitelisting (`image/jpeg`, `image/png`, `image/webp`).
  - Magic-byte header verification to prevent disguised executable uploads.
  - File size capped at 5 MB per image.
  - Storage under randomized UUID filenames in a dedicated public CDN bucket with execution privileges disabled.
- **Generated Travel Documents (Tax Invoices / E-Tickets):**
  - Stored in a private, non-public object storage bucket.
  - Download access mediated via time-limited (15-minute) pre-signed URLs generated after verifying customer ownership (`BR-DOC-001`).

### 4.8 Abuse Prevention & Rate Limiting (`NFR-SEC-007`)

```
+-----------------------------------------------------------------------------------+
|                           RATE LIMITING POLICY MATRIX                             |
+-----------------------------------------------------------------------------------+
| Route Category                | Rate Limit Threshold         | Action on Breach   |
+-------------------------------+------------------------------+--------------------+
| `/api/v1/auth/login`          | 5 requests / minute / IP     | HTTP 429 + Lockout |
| `/api/v1/auth/register`       | 3 requests / minute / IP     | HTTP 429           |
| `/api/v1/search`              | 60 requests / minute / IP    | HTTP 429           |
| `/api/v1/bookings/checkout`   | 10 requests / minute / User  | HTTP 429           |
| `/api/v1/webhooks/payment`    | 120 requests / minute        | HTTP 429           |
| General Public API            | 120 requests / minute / IP   | HTTP 429           |
+-----------------------------------------------------------------------------------+
```

---

## 5. PII Protection & Data Privacy Architecture (`NFR-PRIV-001..002`)

- **PII Classification:** Full Names, Email Addresses, Mobile Numbers, Physical Addresses, and Dates of Birth are classified as **Confidential PII**.
- **Access Isolation:** PII fields are masked in administrative log files and omitted from standard telemetry.
- **Data Subject Rights:**
  - **Export Request:** Endpoint enabling customers to download all personal profile and booking history data in structured JSON format.
  - **Account Deletion / Anonymization:** Soft-deletion workflow anonymizing personal identifiable data while preserving immutable financial audit ledgers as mandated by statutory accounting regulations.

---

## 6. Audit Trail & Financial Logging (`NFR-AUDIT-001..002`)

- **Immutable Audit Ledger:** All critical events are written to an append-only `audit_logs` table.
- **Logged Event Types:**
  - Administrative CRUD mutations (Package creation, price modification, itinerary updates).
  - Booking state changes (`AWAITING_PAYMENT` → `PAID` → `CONFIRMED` → `CANCELLED`).
  - Payment transaction attempts, gateway callback results, and refund authorizations.
  - Authentication security events (Failed logins, password resets, privilege elevations).
- **Audit Record Schema:** `(id, timestamp_utc, actor_id, actor_role, action, entity_type, entity_id, ip_address, user_agent, payload_delta)`.

---

_End of Document DOC-ARCH-0.4.3 (Security & Data Protection Architecture)._
