# Phase 1.4 — Environment Configuration & Secrets Management

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Specification  
**Upstream Authority:** [docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_3_SECURITY_ARCHITECTURE.md) (v1.0.0 Frozen Baseline)

---

## 1. Document Control

| Property            | Value                                          |
| ------------------- | ---------------------------------------------- |
| **Document ID**     | `DOC-ENG-1.4`                                  |
| **Document Title**  | Environment Configuration & Secrets Management |
| **Current Version** | `1.0.0` (Production Baseline)                  |
| **Author Roles**    | DevSecOps Lead, Security Architect             |
| **Target Audience** | Platform Engineers, Backend Developers         |

---

## 2. Configuration Strategy & Schema Validation

The application utilizes **Zod** (`backend/src/config/env.ts` and `worker/src/config/workerEnv.ts`) to validate 100% of environment variables at startup. If any required variable is missing or malformed, the process immediately logs an error and exits with code 1.

```
+-----------------------------------------------------------------------------------+
|                        ENVIRONMENT VALIDATION LIFECYCLE                           |
+-----------------------------------------------------------------------------------+
| 1. Application Process Starts.                                                    |
| 2. `dotenv.config()` loads `.env` file (in local development).                    |
| 3. `loadEnv()` runs `zodSchema.safeParse(process.env)`.                           |
| 4. IF Parsing Fails: Logs schema validation errors -> `process.exit(1)`.          |
| 5. IF Parsing Passes: Returns typed, immutable `EnvConfig` object.                |
+-----------------------------------------------------------------------------------+
```

---

## 3. Comprehensive Variable Reference

| Variable Name            | Type    | Default Value           | Required in Prod?    | Description & Security Constraints                                  |
| ------------------------ | ------- | ----------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`               | String  | `development`           | **YES**              | Environment tier (`development`, `test`, `staging`, `production`).  |
| `PORT`                   | Integer | `3000`                  | **YES**              | HTTP server listening port.                                         |
| `HOST`                   | String  | `0.0.0.0`               | **YES**              | Network interface host binding.                                     |
| `LOG_LEVEL`              | String  | `info`                  | No                   | Pino logging level (`trace`, `debug`, `info`, `warn`, `error`).     |
| `CORS_ORIGIN`            | String  | `http://localhost:3000` | **YES**              | Allowed CORS origins (comma-separated or single domain).            |
| `DATABASE_URL`           | String  | `postgresql://...`      | **YES**              | PostgreSQL connection string with credentials and SSL settings.     |
| `DATABASE_POOL_MIN`      | Integer | `2`                     | No                   | Minimum connection pool size.                                       |
| `DATABASE_POOL_MAX`      | Integer | `10`                    | No                   | Maximum connection pool size.                                       |
| `REDIS_HOST`             | String  | `localhost`             | **YES**              | Redis server hostname.                                              |
| `REDIS_PORT`             | Integer | `6379`                  | **YES**              | Redis server port.                                                  |
| `REDIS_PASSWORD`         | String  | `""`                    | Optional             | Redis authentication password.                                      |
| `COOKIE_SECRET`          | String  | `super_secure_...`      | **YES**              | Secret key for signing session cookies (minimum 32 chars).          |
| `JWT_ACCESS_EXPIRES_IN`  | Integer | `900`                   | No                   | Access token expiration in seconds (15 minutes).                    |
| `JWT_REFRESH_EXPIRES_IN` | Integer | `604800`                | No                   | Refresh token expiration in seconds (7 days).                       |
| `JWT_PRIVATE_KEY`        | String  | RSA PEM Private Key     | **YES (RS256 Only)** | 2048-bit RSA Private Key for RS256 token signing.                   |
| `JWT_PUBLIC_KEY`         | String  | RSA PEM Public Key      | **YES (RS256 Only)** | 2048-bit RSA Public Key for RS256 token verification.               |
| `STORAGE_DRIVER`         | String  | `local` (dev) / `s3`    | **YES**              | Storage driver (`local` for dev/test; strictly `s3` in production). |
| `STORAGE_LOCAL_PATH`     | String  | `./uploads`             | No                   | Local filesystem path for file uploads (dev only).                  |
| `DEFAULT_CURRENCY`       | String  | `INR`                   | No                   | Base currency symbol (`INR` / `USD`).                               |
| `HOLD_DURATION_MINUTES`  | Integer | `15`                    | No                   | Temporary reservation hold window duration.                         |

---

## 4. Secrets Security Rules

1. **Zero Committed Secrets:** Real credentials, private keys, database passwords, and API tokens must NEVER be committed to Git.
2. **Automated Secret Redaction:** Structured logs automatically censor sensitive fields (`req.headers.authorization`, `password`, `cardNumber`, `cvv`).
3. **CI Environment Secrets:** Production and staging secrets are injected strictly via GitHub Actions Encrypted Secrets or cloud key vaults.

---

_End of Document DOC-ENG-1.4 (Phase 1.4 Environment Configuration & Secrets Management)._
