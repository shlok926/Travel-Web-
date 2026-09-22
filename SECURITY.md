# Security Policy

## 🔒 Supported Versions

The following versions of the **Young Tours & Travels Platform** are currently supported with security updates:

| Version | Supported | Status |
|---|---|---|
| `1.0.x` (Phase 1 Baseline) | :white_check_mark: | Active Development |
| `< 1.0.0` (Prototype) | :x: | Deprecated |

---

## 🚨 Reporting a Vulnerability

We take the security of the Young Tours & Travels platform very seriously.

If you discover a security vulnerability, **please do not open a public GitHub issue.** Instead, follow our responsible disclosure process:

1. **Email:** Send a detailed report to `security@youngtours.local` (or the authorized project maintainer).
2. **Details to Include:**
   - Type of issue (e.g., authentication bypass, injection, IDOR, SSRF, secret exposure).
   - Step-by-step instructions or proof-of-concept (PoC) to reproduce the issue.
   - Affected endpoints, files, or components.
   - Potential impact of the vulnerability.
3. **Response Window:** Our security team will acknowledge receipt of the report within **24 hours** and provide an estimated timeline for remediation.

---

## 🛡️ Engineering Security Standards

All contributions must adhere to the [Phase 1.8 Security Baseline](docs/PHASE_1_8_SECURITY_BASELINE.md):

* **Password Security:** Mandatory Argon2id hashing with minimum 64MB memory cost and 3 iterations (`NFR-SEC-002`). Zero plaintext storage.
* **Token Security:** Short-lived JWT access tokens (15 minutes) paired with `HttpOnly`, `SameSite=Strict`, `Secure` refresh cookies.
* **Input Validation & Sanitization:** Strict JSON Schema (AJV) validation on all request payloads (`NFR-SEC-003`).
* **Injection Defense:** 100% parameterized SQL queries via PostgreSQL pool. Raw string concatenation in SQL is prohibited.
* **PCI-DSS Cardholder Isolation:** The platform must never ingest, store, or process raw credit card numbers or CVVs (`NFR-SEC-008`).
* **Log Redaction:** Sensitive headers (`Authorization`, `Cookie`) and request fields (`password`, `cardNumber`, `cvv`) are automatically redacted from logs.
