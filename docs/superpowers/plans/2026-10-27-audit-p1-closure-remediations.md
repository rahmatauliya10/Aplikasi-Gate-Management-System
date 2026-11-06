# GMS Audit P1 Closure Implementation Plan — 27 Oktober 2026

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the 4 specific P1 audit findings identified in the 27 October 2026 independent audit report to achieve full production & merge readiness:
1. Make `-TargetReleaseTag` optional in `-RollbackOnly` mode in `deploy-with-rollback.ps1` and align with runbook.
2. Enforce strict, fail-closed 64-char hex SHA-256 checksum validation for all migrations during image-only rollback.
3. Test all target guard negative scenarios against a real, running PostgreSQL container fixture with verified pre/post fingerprint invariants.
4. Align `RELEASE_CHECKLIST.md` to remove manual `maintenance/active` removal, document `SMOKE_ACCESS_TOKEN` provisioning via `generate-smoke-token.js`, and clarify UAT baseline vs local server pilot status.

**Architecture:** PowerShell DR orchestrator + Node.js smoke/token utilities + Isolated Docker PostgreSQL fixture + Markdown operational runbooks.

**Tech Stack:** PowerShell 5.1/7+, Node.js, Docker, PostgreSQL 15, Prisma.

## Global Constraints
- Strictly NO merge to `master`. Work on branch `fix/gsp-process-audit-improvements`.
- Strictly NO direct modification to production servers.
- Maintain zero-mutation guarantees for all smoke probes.
- Fail-closed security architecture: missing data, missing checksums, or missing tokens must fail safely.
- All documentation and audit reports in formal Indonesian.

---

### Task 1: Fix `TargetReleaseTag` Optionality in Rollback Mode
**Files:**
- Modify: `scripts/deploy-with-rollback.ps1:13-16`
- Create/Test: `scripts/test-cli-rollback-syntax.ps1`

- [ ] **Step 1: Write CLI syntax verification script**
Create `scripts/test-cli-rollback-syntax.ps1` to test parameter binding of `deploy-with-rollback.ps1` with `-RollbackOnly` and without `-TargetReleaseTag`.
- [ ] **Step 2: Run verification script to confirm current failure**
Run: `pwsh -File scripts/test-cli-rollback-syntax.ps1`
Expected: FAIL because `TargetReleaseTag` is currently mandatory.
- [ ] **Step 3: Update `scripts/deploy-with-rollback.ps1` param block and validation**
Change `[Parameter(Mandatory=$true)] [string]$TargetReleaseTag` to `[Parameter(Mandatory=$false)] [string]$TargetReleaseTag = ""`.
Add runtime check: `if (-not $RollbackOnly -and [string]::IsNullOrWhiteSpace($TargetReleaseTag)) { throw "Parameter -TargetReleaseTag is required for normal deployment." }`.
Support optional `[string]$SmokeAccessToken = ""` parameter.
- [ ] **Step 4: Re-run CLI verification script**
Run: `pwsh -File scripts/test-cli-rollback-syntax.ps1`
Expected: PASS.

---

### Task 2: Strict Fail-Closed Migration Checksum Verification in Image-Only Rollback
**Files:**
- Modify: `scripts/deploy-with-rollback.ps1:375-465`
- Create/Update: `deploy/releases/stable.json` and `deploy/release_manifest.json`

- [ ] **Step 1: Create authoritative migration inventory generator**
Generate `deploy/releases/stable.json` containing the authoritative 30-migration inventory with valid 64-char hex SHA-256 checksums matching `backend/prisma/migrations`.
- [ ] **Step 2: Update checksum validation in `scripts/deploy-with-rollback.ps1`**
1. Require that every migration in manifest has a valid 64-char hex SHA-256 checksum. If any migration lacks checksum, throw error.
2. Require that every migration in live database `_prisma_migrations` has a valid 64-char hex SHA-256 checksum. If empty/missing/invalid, throw error.
3. Assert that counts match exactly (`$expectedMigrations.Count -eq $appliedMigrations.Count`).
4. Assert that every migration checksum matches 100% (`$expectedCk -eq $actualCk`).
5. Assert that `$checksumsVerified -eq $expectedMigrations.Count`.
- [ ] **Step 3: Test checksum validation in unit/integration script**
Verify that altered or missing checksum triggers fail-closed error with exact violation keyword.

---

### Task 3: Real Staging Target Guard Tests with Fixture & Fingerprint Invariant
**Files:**
- Modify: `scripts/test-target-guard.ps1`
- Modify: `scripts/test-target-guard.js`

- [ ] **Step 1: Implement isolated Docker PostgreSQL fixture helper**
In `scripts/test-target-guard.ps1`, spawn a real container `gms-target-guard-fixture` (port 5437) with initialized `AppSetting` and `_prisma_migrations`.
- [ ] **Step 2: Execute all 9 negative guard scenarios against real target**
1. Container missing (`nonexistent_container_xyz999`) -> reject with container unreachable.
2. Wrong Environment ID against real container (`-ExpectedEnvironmentId 'GMS-WRONG-ENV'`) -> reject with `TARGET DATABASE FINGERPRINT MISMATCH`.
3. Wrong Installation UUID against real container (`-ExpectedInstallationUuid '00000000-...'`) -> reject with `TARGET DATABASE FINGERPRINT MISMATCH`.
4. `GMS_RESTORE_ALLOWED = 'FALSE'` against real container -> reject with `GMS_RESTORE_ALLOWED is set to 'FALSE'`.
5. Production Environment ID (`GMS-PROD-SJA-01`) + Fault Injection against real container -> reject with `UNCONDITIONALLY PROHIBITED on production targets`.
6. Fault Injection without `GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE` -> reject with `requires verified isolated drill environment`.
7. Production DB Name (`gms_prod`) + Fault Injection -> reject with `UNCONDITIONALLY PROHIBITED on production targets`.
8. Corrupted Dump Checksum in Manifest -> reject with `Dump File Checksum Mismatch`.
9. Missing Manifest Path -> reject with `Manifest File Not Found`.
- [ ] **Step 3: Verify Pre/Post Database Fingerprint Equality**
Assert that target DB fingerprint hash before and after all 9 negative tests is 100% identical (ZERO MUTATION).
- [ ] **Step 4: Clean up fixture container in `finally` block**
Ensure container is safely removed after tests complete.
- [ ] **Step 5: Run tests locally**
Run: `node scripts/test-target-guard.js`
Expected: PASS 100% on pure policy and real PowerShell integration.

---

### Task 4: Runbook Maintenance Consistency, Smoke Token Automation & UAT Alignment
**Files:**
- Create: `scripts/generate-smoke-token.js`
- Modify: `docs/RELEASE_CHECKLIST.md`
- Modify: `docs/uat-matrix.md`
- Update: `audit_closure_decision_report.md`

- [ ] **Step 1: Create `scripts/generate-smoke-token.js`**
Lightweight script that logs in or signs a valid read-only JWT token for smoke probes and prints to stdout.
- [ ] **Step 2: Update `docs/RELEASE_CHECKLIST.md`**
Remove all manual `rm -f maintenance/active` steps.
Document pre-generation of `SMOKE_ACCESS_TOKEN` via `generate-smoke-token.js`.
Clarify that the orchestrator is the sole authority for lifting maintenance freeze after verifying `--require-passed` = `PASSED`.
Ensure rollback commands match exact CLI arguments.
- [ ] **Step 3: Update `docs/uat-matrix.md`**
Explicitly distinguish:
1. Historical UAT baseline (Commit `a5f3423`): verified.
2. Automated regression CI gate (Exact HEAD `c7af35f`): 10/10 jobs verified green.
3. Local Physical Plant Server Pilot: dedicated pre-production milestone awaiting final on-site physical hardware execution.
- [ ] **Step 4: Update `audit_closure_decision_report.md`**
Summarize the 4 remediations, updated scores, and CI run readiness.
