# GMS Audit Remediation & Hardening Plan (PR #27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all findings from the 6 November 2026 PR #27 external audit (P0-01, P0-02, P1-03, P1-04, P1-05, P1-06, P1-07, P2-09) to raise the PRAS audit score to >= 9.20/10 and achieve full production readiness certification.

**Architecture:** Enforce fail-closed guarantees across database restore (`pg_restore` non-zero exit code rejection), deployment preflight (immutable fresh backup ID binding, real transaction drain, preflight Git SHA provenance), crash-resilient recovery ledger state machine, hardened Docker host verification, and cross-version PostgreSQL 15/17 compatibility.

**Tech Stack:** PowerShell 7 / Windows PowerShell, Node.js 22/24, PostgreSQL 15/17, Docker Compose, NestJS, Vue 3, GitHub Actions CI.

## Global Constraints
- Zero breaking changes to existing passing tests (all 10 CI jobs must remain 100% green).
- Never allow mutations against operational databases (`gms`) or containers (`gate-system-postgres`).
- Every failure mode must fail-closed: abort before mutation and preserve maintenance mode flags.
- Evidence before assertions: write automated test cases for every finding before claiming resolution.

---

### Task 1: P0-01 — Strict `pg_restore` Exit Code & Error Handling (scripts/gms-production-restore.ps1)

**Files:**
- Modify: `scripts/gms-production-restore.ps1:385-392, 734-741, 987-992`
- Test: `scripts/test-target-guard.ps1`

**Interfaces:**
- `pg_restore`: treat any exit code != 0 as error unless explicitly identified as non-fatal `transaction_timeout` without any other error statements.
- Throw descriptive exception and maintain fail-closed state.

- [ ] **Step 1: Write failing test in `scripts/test-target-guard.ps1`**
  Add test simulating `pg_restore` returning exit code 1 (with syntax/schema error) and assert that restore throws and rejects with exit code != 0.

- [ ] **Step 2: Update `scripts/gms-production-restore.ps1`**
  Change `$StagingExitCode -gt 1` to `$StagingExitCode -ne 0` (with narrow exception only for `transaction_timeout` if target is PG < 17 and no other errors).
  Change `$LiveExitCode -gt 1` to `$LiveExitCode -ne 0`.
  Change `$RollbackExitCode -gt 1` to `$RollbackExitCode -ne 0`.

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-target-guard.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(dr): reject non-zero pg_restore exit codes and prevent partial restore promotion (P0-01)`

---

### Task 2: P0-02 — Immutable `freshBackupId` & Outdated Pointer Rejection (scripts/deploy-with-rollback.ps1)

**Files:**
- Modify: `scripts/deploy-with-rollback.ps1:645-705`
- Test: `scripts/test-cli-rollback-syntax.ps1`

**Interfaces:**
- Define `[string]$freshBackupId = $CapturedPreDeployBackupId` as immutable.
- Prohibit overwriting `$CapturedPreDeployBackupId` with an unverified pointer ID.
- Fallback pointer (`latest-predeploy.json`) is ONLY valid if `pointer.backupId -eq $freshBackupId`.

- [ ] **Step 1: Write failing test in `scripts/test-cli-rollback-syntax.ps1`**
  Test [REL-19]: Simulate deploy preflight where `latest-predeploy.json` points to an old backup ID (`BKP-OUTDATED-OLD`) while fresh ID was captured. Verify script REJECTS before migration.

- [ ] **Step 2: Implement immutable binding in `scripts/deploy-with-rollback.ps1`**
  Enforce `$freshBackupId` equality check and reject outdated pointers.

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-cli-rollback-syntax.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(deploy): enforce immutable fresh backup ID binding and reject stale pointer fallback (P0-02)`

---

### Task 3: P1-03 — Real Fail-Closed Transaction Drain (scripts/deploy-with-rollback.ps1)

**Files:**
- Modify: `scripts/deploy-with-rollback.ps1:618-636`
- Test: `scripts/test-cli-rollback-syntax.ps1`

**Interfaces:**
- Inspect PostgreSQL container dynamically (`docker compose ps -q postgres`).
- Query active and idle-in-transaction connections (`state IN ('active', 'idle in transaction', 'idle in transaction (aborted)')`).
- Retry loop up to timeout (e.g. 15s). If transactions remain or query fails, throw and abort before migration.

- [ ] **Step 1: Write failing test in `scripts/test-cli-rollback-syntax.ps1`**
  Test [REL-20]: Verify script aborts deployment if database transaction drain fails or times out.

- [ ] **Step 2: Implement fail-closed drain loop in `scripts/deploy-with-rollback.ps1`**
  Add retry loop and fail-closed termination.

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-cli-rollback-syntax.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(deploy): enforce strict fail-closed transaction drain with idle-in-transaction checks (P1-03)`

---

### Task 4: P1-04 — Crash-Resilient Recovery Ledger State Machine (scripts/gms-production-restore.ps1)

**Files:**
- Modify: `scripts/gms-production-restore.ps1:240-256, 740-745, 950-965`
- Test: `scripts/test-dr-isolation-guard.ps1`

**Interfaces:**
- State machine: `PREPARED` -> `RESTORING` -> `RESTORED` -> `VERIFIED`.
- Corrupted ledger -> throw `CRITICAL RECOVERY VIOLATION: Corrupted ledger`.
- Ambiguous state (`RESTORING`) -> throw `CRITICAL RECOVERY VIOLATION: Interrupted recovery, manual reconciliation required`.
- Completed state (`RESTORED`, `VERIFIED`) -> reject duplicate restore.

- [ ] **Step 1: Write failing test in `scripts/test-dr-isolation-guard.ps1`**
  Test GUARD-09: Interrupted `RESTORING` ledger must reject re-execution.
  Test GUARD-10: Corrupted ledger file must fail-closed.

- [ ] **Step 2: Implement persistent ledger state machine in `scripts/gms-production-restore.ps1`**
  Write state transitions at preflight, before DB drop/restore, after DB commit, and after final verification.

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-dr-isolation-guard.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(dr): implement crash-resilient 4-state recovery ledger with exactly-once guard (P1-04)`

---

### Task 5: P1-05 — Preflight Git SHA & Image Provenance Resolution (scripts/deploy-with-rollback.ps1)

**Files:**
- Modify: `scripts/deploy-with-rollback.ps1:580-605, 750-785`
- Test: `scripts/test-cli-rollback-syntax.ps1`

**Interfaces:**
- Resolve and validate 40-character Git SHA during Preflight (Step 1) before stopping services, freezing traffic, or applying migrations.
- Disallow fallback to `deploy/release_manifest.json` for new release source SHA.

- [ ] **Step 1: Write failing test in `scripts/test-cli-rollback-syntax.ps1`**
  Test [REL-21]: Verify deployment fails preflight if Git SHA cannot be resolved and no valid provenance is provided.

- [ ] **Step 2: Move SHA provenance resolution to preflight in `scripts/deploy-with-rollback.ps1`**

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-cli-rollback-syntax.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(deploy): enforce preflight source git sha resolution and disallow stale manifest fallback (P1-05)`

---

### Task 6: P1-06 — Docker Host & Daemon Endpoint Hardening (scripts/run-restore-failure-drill.ps1)

**Files:**
- Modify: `scripts/run-restore-failure-drill.ps1:130-150`
- Test: `scripts/test-dr-isolation-guard.ps1`

**Interfaces:**
- Check `$env:DOCKER_HOST`: reject non-loopback TCP or remote endpoints.
- Inspect `docker context inspect` endpoint: reject remote hosts / SSH.

- [ ] **Step 1: Write failing test in `scripts/test-dr-isolation-guard.ps1`**
  Test GUARD-11: Remote `$env:DOCKER_HOST` (e.g. `tcp://192.168.1.100:2375`) must be unconditionally rejected.

- [ ] **Step 2: Implement endpoint validation in `scripts/run-restore-failure-drill.ps1`**

- [ ] **Step 3: Run test and verify pass**
  Run `scripts/test-dr-isolation-guard.ps1` locally.

- [ ] **Step 4: Commit**
  `fix(dr): validate docker daemon endpoint and reject remote hosts and non-local docker context (P1-06)`

---

### Task 7: P1-07 — PostgreSQL 15 & 17 Cross-Version Support in `database-backup.service.ts`

**Files:**
- Modify: `backend/src/settings/database-backup.service.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `DatabaseBackupService.restoreDatabase` & `restoreFromPortableBundle`: if target PostgreSQL server rejects `transaction_timeout` (PG < 17), cleanly fallback to sanitized SQL execution via `psql -v ON_ERROR_STOP=1 --single-transaction`.

- [ ] **Step 1: Implement fallback in `database-backup.service.ts`**
  Catch `transaction_timeout` and execute sanitized SQL stream.

- [ ] **Step 2: Run backend tests locally**
  Run `npm run test` and `dr-portable-restore.e2e-spec.ts`.

- [ ] **Step 3: Commit**
  `fix(backup): add backward-compatible pg_restore fallback for postgres 15 target servers (P1-07)`

---

### Task 8: P2-09 — Frontend Prop & Warning Cleanups

**Files:**
- Modify: `frontend/src/components/StatusBadge.vue`
- Modify: `frontend/src/components/TruckDetailsModal.vue`

- [ ] **Step 1: Fix `StatusBadge.vue` props default and null safety**
- [ ] **Step 2: Run `npm test` in frontend and verify zero Vue warnings**
- [ ] **Step 3: Commit**
  `fix(frontend): provide default string prop in StatusBadge to eliminate console warning (P2-09)`
