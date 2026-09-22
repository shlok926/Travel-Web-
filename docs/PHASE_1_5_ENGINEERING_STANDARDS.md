# Phase 1.5 — Engineering Standards & Code Quality Guidelines

**Project:** Young Tours & Travels / Travel-Web  
**Repository:** `https://github.com/utkarshdaule11/Travel-Web-.git`  
**Date:** September 2026  
**Document Status:** Approved Engineering Standards  
**Upstream Authority:** [docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md](file:///d:/Desktop/Travel-Web-/docs/PHASE_0_4_2_SYSTEM_ARCHITECTURE.md) (v1.1.0 Frozen Baseline)

---

## 1. Document Control

| Property            | Value                                           |
| ------------------- | ----------------------------------------------- |
| **Document ID**     | `DOC-ENG-1.5`                                   |
| **Document Title**  | Engineering Standards & Code Quality Guidelines |
| **Current Version** | `1.0.0` (Production Baseline)                   |
| **Author Roles**    | Principal Engineer, QA Architect                |
| **Target Audience** | All Software Engineers, Code Reviewers          |

---

## 2. Core Code Quality Principles

1. **TypeScript Strictness:** Strict mode is mandatory (`"strict": true`, `"noImplicitReturns": true`, `"noUnusedLocals": true`). Explicit types are required for all function arguments and return values.
2. **Layered Decoupling:**
   - Fastify routes handle ONLY deserialization, schema validation, and HTTP responses.
   - Business rules reside exclusively in Application Services and pure Domain Entities.
   - Database queries reside exclusively in Repository / Persistence abstractions.
3. **Integer Minor Units for Money:** Floating-point arithmetic on prices or taxes is strictly prohibited. All monetary calculations must use `MoneyUtil` and integer minor units.
4. **Argon2id for Passwords:** Zero legacy hashing (no MD5, SHA-1, or bcrypt).
5. **Deterministic Error Responses:** All errors must use `AppError` or standard RFC 7807 error envelopes (`ApiErrorResponse`).

---

## 3. Toolchain & Enforcement

- **Linter:** ESLint with TypeScript ESLint parser (`npm run lint`).
- **Formatter:** Prettier with strict 100-character line width and single quotes (`npm run format`).
- **Static Type Checker:** `tsc --noEmit` (`npm run typecheck`).
- **Test Runner:** Vitest with native TypeScript execution (`npm test`).

---

_End of Document DOC-ENG-1.5 (Phase 1.5 Engineering Standards & Code Quality Guidelines)._
