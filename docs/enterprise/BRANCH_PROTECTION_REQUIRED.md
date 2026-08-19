# Enterprise GitHub Branch Protection & Repository Governance

> **STATUS**: `HUMAN ACTION REQUIRED` (Must be configured via GitHub Repository Settings by Organization / Repository Admin).

---

## 1. Branch Protection Rules for `master` / `main`

To maintain production security standards and enforce continuous quality gating, the repository administrator must configure the following rules on the default branch (`master` / `main`):

### A. Require Pull Request Before Merging
- **Require approvals**: Minimum **1 approval** from designated Codeowners.
- **Dismiss stale pull request approvals when new commits are pushed**: **ENABLED**.
- **Require review from Code Owners**: **ENABLED** (enforces `.github/CODEOWNERS`).
- **Restrict who can dismiss pull request reviews**: Restricted to Repository Admins.

### B. Require Status Checks to Pass Before Merging
- **Require branches to be up to date before merging**: **ENABLED**.
- **Required Status Checks**:
  1. `Backend Test, Coverage, Build & Schema Validation (fresh)`
  2. `Backend Test, Coverage, Build & Schema Validation (upgraded)`
  3. `Frontend Build & Bundle Verification`
  4. `Dependency Security & Secret Scan`
  5. `Historical Migration Rehearsal Gate (P0-01)`
  6. `Production Database Restore Failure Drill Gate (P0-02)`
  7. `Post-Migration Rollback & Forward Compatibility Drill (P0-03)`
  8. `Production Compose Quality Gate`
  9. `Staging Environment Fullstack Deployment Smoke Gate`

### C. Enterprise Enforcement Invariants
- **Require conversation resolution before merging**: **ENABLED**.
- **Require signed commits**: **ENABLED**.
- **Require linear history**: **ENABLED** (or Squash and Merge only).
- **Do not allow bypassing the above settings**: **ENABLED** (enforce on Administrators).
- **Allow force pushes**: **DISABLED** (Never allowed on production branches).
- **Allow deletions**: **DISABLED**.

---

## 2. Release & Secret Governance Rules
- GitHub Actions workflow write permissions: `read-all` by default.
- Environments with restricted secrets (`production`, `staging`):
  - Deployment protection rules enabled for `production`.
  - Production secrets (`POSTGRES_PASSWORD`, `GMS_OWNER_PASSWORD`, `GMS_APP_PASSWORD`, `GMS_BACKUP_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `BACKUP_SIGNATURE_SECRET`) must never be configured as plain repository variables.
