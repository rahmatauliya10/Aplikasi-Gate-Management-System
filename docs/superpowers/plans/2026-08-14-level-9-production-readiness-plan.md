# Level 9 Production Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve P0-01 (Historical Rehearsal), P0-02 (Production Restore Drill), P0-03 (Coordinated Rollback), and related P1/P2 audit defects to elevate GMS v1.0.0 audit score from 87 to Level 9 (90+/100) Production Ready.

**Architecture:** 
1. Build an authentic historical baseline fixture (migrations 1..6 + seeded GBB/GSP/GBJ transactions + DB-backed attachments) to test real schema migration advancement (6→18) in CI with 16-entity counts and DB attachment reconciliation.
2. Bind-mount `./backups/local` in Compose, emit machine-readable pre-deploy backup info, and enforce mandatory DB restore on post-migration rollback.
3. Provide automated DR failure-injection drill script covering 4 failure phases, remove redundant backup calls in service, and ensure honest walkthrough documentation.

**Tech Stack:** NestJS, TypeScript, Prisma ORM, PostgreSQL 15, Docker Compose, PowerShell Core, GitHub Actions CI.

---

### Task 1: Paket A — Authentic Historical Fixture Generator & CI Rehearsal Gate (P0-01)

**Files:**
- Modify: `tests/fixtures/historical/generate-test-fixtures.js`
- Modify: `.github/workflows/ci.yml:160-390`
- Test: `tests/fixtures/historical/generate-test-fixtures.js`

- [ ] **Step 1: Update `generate-test-fixtures.js` to seed genuine historical baseline (migrations 1..6) with DB-linked attachments**
- [ ] **Step 2: Update `.github/workflows/ci.yml` historical rehearsal gate to assert source migrations < 18, apply remaining migrations, check 16 entity invariant counts, and reconcile DB attachments against physical files**
- [ ] **Step 3: Test fixture generator syntax and verify checksums**

---

### Task 2: Paket B — Reachable Coordinated Rollback & Fail-Closed Migration Recovery (P0-03)

**Files:**
- Modify: `docker-compose.prod.yml:70-90`
- Modify: `backend/scripts/run-predeploy-backup.js`
- Modify: `scripts/deploy-with-rollback.ps1`

- [ ] **Step 1: Configure bind mount `./backups/local:/app/backups/local` in `docker-compose.prod.yml`**
- [ ] **Step 2: Update `run-predeploy-backup.js` to output structured JSON metadata**
- [ ] **Step 3: Update `deploy-with-rollback.ps1` to capture pre-deploy manifest on host, set `$MigrationStarted = $true`, enforce mandatory DB restore on rollback, and freeze traffic via `./maintenance/active`**

---

### Task 3: Paket C — Restore Failure-Injection Drills & Service Cleanup (P0-02 & P1/P2)

**Files:**
- Modify: `backend/src/settings/database-backup.service.ts:1110-1140`
- Create: `scripts/run-restore-failure-drill.ps1`
- Modify: `walkthrough.md`

- [ ] **Step 1: Remove redundant duplicate `AUTO_PRE_RESTORE` call in `database-backup.service.ts`**
- [ ] **Step 2: Create automated failure-injection drill script `scripts/run-restore-failure-drill.ps1` simulating 4 failure phases**
- [ ] **Step 3: Update `walkthrough.md` to reflect verified statuses and close P0 blockers**

---

### Task 4: Comprehensive Test & CI Verification

**Files:**
- Test: Backend unit & E2E tests
- Test: Migration checksums verification

- [ ] **Step 1: Run migration checksums verification**
- [ ] **Step 2: Run backend unit tests (`npm test`)**
- [ ] **Step 3: Run git diff checks and verify zero lint errors**
