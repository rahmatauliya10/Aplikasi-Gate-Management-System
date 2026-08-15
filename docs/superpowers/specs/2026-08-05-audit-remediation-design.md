# GMS GO-LIVE Audit Remediation Design Specification

Date: August 5, 2026  
Repository: rahmatauliya10/Aplikasi-Gate-Management-System  
Target Commit: HEAD (7be097903efb890bcf947967d57a81af7d19090b)  

---

## Executive Summary & Objectives

The recent audit raised 7 critical/high findings blocking production GO-LIVE readiness. This design document establishes the concrete technical specs for resolving all 7 findings with zero compromise on system integrity, reliability, and security.

---

## 1. Subsystem Technical Designs

### Component 1: Database Backup Timestamp & Payload Binding (RA-7BE-P0-01)
- **Problem**: `createNativePgDumpBackup()` creates backup files using an initial timestamp string (`const timestamp = new Date().toISOString()...`), but writes a new ISO timestamp into `manifest.createdAt` (`new Date().toISOString()`). `generateBackup()` attempts to find the JSON snapshot by re-formatting `manifest.createdAt`, resulting in a timestamp mismatch (e.g. `.219Z` vs `.234Z`). When `pg_dump` succeeds, the dump file is binary `PG_CUSTOM`, causing `generateBackup()` to fail snapshot reading and return empty payload `{}` with `backup.data.users = undefined`.
- **Solution**:
  1. **Single Timestamp Initialization**: Define `createdAt = new Date().toISOString()` once at function start and derive `timestamp = createdAt.replace(/[:.]/g, '-')`. Reuse this exact string across all filenames, `manifest.createdAt`, and `manifest.backupId`.
  2. **Manifest Snapshot Property**: Add `snapshot` to `manifest.artifacts` (`manifest.artifacts.snapshot = snapshotFileName`).
  3. **Explicit Lookup**: In `generateBackup()`, look up the snapshot filename directly via `manifest.artifacts.snapshot` or `manifest.backupId`.
  4. **Dual Format Generation**: Even when `pg_dump` succeeds (`PG_CUSTOM`), write both the `.dump` file and the `.json` snapshot file so payload extraction and instant JSON restores remain fully functional.
  5. **Jest Verification**: Update `database-backup.service.spec.ts` to test both `PG_CUSTOM` native mode and `JSON_SNAPSHOT` fallback mode.

### Component 2: Preflight Duplicate Audit & Migration Sequence (RA-7BE-P0-02)
- **Problem**: Unique migration `20260804170000_add_unique_constraints_and_corrections` adds unique constraints. `start:prod`, `run-production-gms.bat`, and `ci.yml` execute `npx prisma migrate deploy` BEFORE running preflight audit. Legacy databases containing duplicates fail migration immediately. Additionally, legacy script `preflight-duplicate-cleanup.ts` exists and deletes data destructively without dry-run/backup.
- **Solution**:
  1. **Script Cleanup**: Delete `backend/prisma/preflight-duplicate-cleanup.ts`. Retain `preflight-duplicate-cleanup.js` as the sole preflight script.
  2. **Re-order Pipeline**: Change execution order in `ci.yml`, `package.json`, and `run-production-gms.bat`:
     - Step A: `npm run prisma:preflight -- --report-only` (Checks duplicates).
     - Step B: `npx prisma migrate deploy` (Runs schema migration).
  3. **Safe Preflight Gate**: If preflight finds duplicates during deployment, it exits with error code 1 and outputs instructions to run manual/approved cleanup: `npm run prisma:preflight -- --execute-cleanup --approve`. This cleanup automatically generates a pre-cleanup backup before removing duplicates inside a database transaction.

### Component 3: CI ESLint Check (RA-7BE-P0-03)
- **Problem**: `npm run lint:check` fails with 2 `no-unnecessary-type-assertion` errors in `transactions.service.ts:418:55` and `419:29`.
- **Solution**: Remove redundant `(tx as any)[field]` assertions in `transactions.service.ts` and use type-safe lookup `tx[field as keyof typeof tx]`. Ensure `npm run lint:check` passes cleanly.

### Component 4: Autostart Task Scheduler & Unattended Boot (RA-7BE-P0-04)
- **Problem**: Default script registers `AtLogOn` task for interactive user sessions. `-UnattendedMode` with `SYSTEM`/`AtStartup` issues warnings about WSL2 / Rancher Desktop limitations.
- **Solution**:
  1. Refactor `register-gms-autostart-task.ps1` to cleanly support dual modes with clear logs:
     - Interactive User Mode (`AtLogOn`): Default for Rancher Desktop / WSL2 rootless setups.
     - Dedicated Unattended Mode (`SYSTEM` / `AtStartup`): For production Windows Server with native Docker Engine.
  2. Add settings verification to guarantee task resilience (`StartWhenAvailable`, `AllowStartIfOnBatteries`, `DontStopIfGoingOnBatteries`).

### Component 5: Optimistic Concurrency Control (OCC) & Atomic Audit (RA-7BE-P1-01)
- **Problem**: `expectedUpdatedAt` was optional; updates used non-atomic `prisma.transaction.update({ where: { id } })` after separate SELECT; pre-checks returned 400 instead of 409; `ActivityLogsService` swallowed errors during transactions allowing un-audited commits.
- **Solution**:
  1. Require `expectedUpdatedAt` in `CorrectTransactionDto`.
  2. Implement atomic conditional update in `transactions.service.ts`:
     `const updated = await prismaTx.transaction.updateMany({ where: { id, updatedAt: new Date(dto.expectedUpdatedAt) }, data: updateData });`
     If `updated.count === 0`, throw `ConflictException` (HTTP 409).
  3. Ensure all stale timestamp checks return `ConflictException` (409 Conflict).
  4. In `ActivityLogsService`, add error rethrowing when executing within a `prismaTx` client, ensuring audit log failure causes transaction rollback.

### Component 6: Deployment Immutability & Rollback Orchestration (RA-7BE-P1-02)
- **Problem**: Builds occurred on dirty worktrees; deployment health failure in `run-production-gms.bat` invoked `deploy-with-rollback.ps1` targeting the failing release tag again.
- **Solution**:
  1. Add git clean-tree check in `run-production-gms.bat` (`git status --porcelain`) before building.
  2. In `run-production-gms.bat`, pass the existing active tag (read from `deploy/current_release.txt` or `stable`) as `-PreviousReleaseTag` when invoking `deploy-with-rollback.ps1`.
  3. In `deploy-with-rollback.ps1`, ensure rollback directly switches to `$PreviousReleaseTag` without re-attempting a broken build.

### Component 7: Git Repository Hygiene & Backup Ignore (RA-7BE-P1-03)
- **Problem**: 40 runtime backup files were tracked in git under `backend/backups/local` and `backend/backups/nas`.
- **Solution**:
  1. Add `backend/backups/local/*`, `backend/backups/nas/*`, `!**/local/.gitkeep`, `!**/nas/.gitkeep` to `.gitignore`.
  2. Execute `git rm -r --cached backend/backups/local backend/backups/nas`.
  3. Configure Jest tests to write test backup artifacts to OS temporary directory (`os.tmpdir()`).

---

## 2. Verification & Testing Strategy
- **Unit Tests**: Run `npm run test` in backend (expect all suites to pass).
- **Lint Gate**: Run `npm run lint:check` (expect 0 errors, 0 warnings).
- **Prisma Validation**: Run `npx prisma validate`.
- **Preflight Check**: Run `npm run prisma:preflight -- --report-only`.
- **Backend Build**: Run `npm run build`.
- **Frontend Build**: Run `npm run build` in frontend.
