# Contributing to Young Tours & Travels

Thank you for contributing to the **Young Tours & Travels (`Travel-Web`)** platform!

To maintain our high engineering standards and strict architectural integrity, please adhere to the following guidelines.

---

## 🏛️ Engineering Lifecycle & Architectural Governance

This project follows a strict phase-based engineering model:
1. **Requirements & Architecture First:** All features must trace back to the frozen [Phase 0.3 Requirements Specification](docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md) and [Phase 0.4 Architecture Decision Records](docs/PHASE_0_4_8_ARCHITECTURE_DECISION_RECORDS.md).
2. **Layered Architecture:** 
   - HTTP routes handle only deserialization, validation, and responses.
   - Business invariants belong exclusively to Domain Entities and Services.
   - Database queries belong exclusively to Repository classes.
3. **Monetary Safety:** Never use floating-point numbers for money. Always use `MoneyUtil` and integer minor units (paise/cents).
4. **Security by Design:** Never log sensitive credentials (passwords, tokens, card data). Passwords must use Argon2id.

---

## 🚀 Development Workflow

### 1. Branching Strategy
* `main` — Production-ready, protected branch.
* `feature/<phase>-<description>` — Feature development branches (e.g., `feature/phase-2-auth`).
* `fix/<description>` — Bugfix branches.

### 2. Local Setup
Follow the [Local Development Guide](docs/PHASE_1_3_LOCAL_DEVELOPMENT.md):
```bash
git clone https://github.com/utkarshdaule11/Travel-Web-.git
cd Travel-Web-
npm install
cp .env.example .env
docker compose up -d postgres redis minio
npm run dev
```

---

## 🧪 Pre-Commit Quality Checks

Before submitting a pull request, verify that all quality gates pass:

```bash
# 1. Format code
npm run format

# 2. Check lint rules
npm run lint

# 3. Static type validation
npm run typecheck

# 4. Run test suite
npm test

# 5. Build bundles
npm run build
```

---

## 📝 Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

* `feat(auth): add customer registration endpoint`
* `fix(inventory): resolve race condition on hold expiration`
* `docs(arch): update ADR-003 with Fastify rationale`
* `test(booking): add integration test for price calculation`
* `refactor(storage): streamline S3 pre-signed URL generator`

---

## 📬 Pull Request Process

1. Ensure all CI checks pass (`.github/workflows/ci.yml`).
2. Provide a clear summary of changes, linked Phase requirements, and test verification results.
3. Obtain code review approval before merging into `main`.
