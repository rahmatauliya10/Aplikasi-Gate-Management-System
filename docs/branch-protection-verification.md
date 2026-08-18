# Master Branch Protection & Ruleset Verification Specification

## Overview
To enforce strict enterprise release governance, the `master` and `main` branches must be protected against direct commits, force pushes, and unverified pull requests. All 9 automated CI Quality Gates must execute and pass before any code can be merged into production.

---

## 9 Mandatory CI Status Checks for Ruleset Gate

When configuring Repository Rulesets in GitHub (`Settings -> Rules -> Rulesets -> New ruleset / Edit ruleset`), ensure the **"Require status checks to pass"** policy is enabled with **"Require branches to be up to date before merging"** checked, and add the following 9 exact job names:

1. `Backend Test, Coverage, Build & Schema Validation (fresh)`
2. `Backend Test, Coverage, Build & Schema Validation (upgraded)`
3. `Frontend Build & Bundle Verification`
4. `Dependency Security & Secret Scan`
5. `Historical Migration Rehearsal & DR Integrity Gate (P0-01)`
6. `Production Restore DR Failure-Injection Gate (P0-02)`
7. `Post-Migration Coordinated Rollback Drill Gate (P0-03)`
8. `Full-Stack Staging Stack & Cross-Stack E2E Gate (GBB / GSP / GBJ)`
9. `Container Vulnerability Scan & Software Bill of Materials (SBOM)`

---

## GitHub Ruleset Configuration Protocol

### 1. Target Branches
- **Include default branch**: `master`, `main`
- **Include release branches**: `release/*`, `update-v*`

### 2. Branch Protection Rules
- [x] **Restrict creations**: Only repo admins can create matching branches.
- [x] **Restrict updates**: Force pushes blocked (`--force` forbidden).
- [x] **Restrict deletions**: Deletion of `master` / `main` forbidden.
- [x] **Require a pull request before merging**:
  - Required approvals: `1` minimum (or CODEOWNERS review)
  - Dismiss stale pull request approvals when new commits are pushed: `Enabled`
  - Require review from Code Owners: `Enabled`
- [x] **Require status checks to pass**:
  - Require branches to be up to date before merging: `Enabled`
  - Strict status check list: (The 9 CI jobs listed above)
- [x] **Block force pushes**: `Enabled`
- [x] **Do not allow bypassing the above settings**: `Enabled` (Apply to administrators as well)

---

## Verification via GitHub CLI / API

```bash
# Verify branch ruleset status on master
gh api repos/:owner/:repo/rulesets
# Verify legacy branch protection status if used
gh api repos/:owner/:repo/branches/master/protection
```
