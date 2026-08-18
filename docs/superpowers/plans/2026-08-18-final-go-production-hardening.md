# Final GO Production Hardening Plan (Level 9.7 - 9.8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 4 P0/P1 production blockers and 2 P1 operational audit findings in Gate Management System (GMS) to achieve Level 9.7/9.8 maturity and FULL GO Production release.

**Architecture:** 
1. Separate `gms-backend-runtime` (Alpine + Node 22 runtime without npm/npx, `CMD ["node", "dist/src/main"]`, least-privilege) and `gms-backend-migrator` (Prisma CLI + migration tooling for deployments/rehearsals).
2. Scan newly built containers directly with Trivy using `--ignorefile .trivyignore.yaml`. Populate `.trivyignore.yaml` only if genuine, unavoidable CVEs remain after scan.
3. Harden PowerShell restore operator (`gms-production-restore.ps1`) by fixing StrictMode variable uninitialized paths, enforcing strict pre-destructive target DB identity fingerprint (`GMS_ENVIRONMENT_ID`, `GMS_INSTALLATION_UUID`, `GMS_RESTORE_ALLOWED`), with zero `-Force` bypass, and restricting `-InitializeNewEnvironment` to 100% empty DBs.
4. Execute actual PowerShell operator drills across all 6 fault injection phases (including `DURING_DB_PROMOTION`), making paths cross-platform.
5. Split pipeline into read-only `ci.yml` for PR/testing and master-only `release.yml` triggered via `workflow_run` (after CI succeeds on master) or verified `workflow_dispatch`, capturing GHCR canonical `RepoDigest` for backend, migrator, and frontend, generating GitHub Artifact Attestation, and binding exact `SOURCE SHA = TESTED SHA = BUILT SHA = RELEASE SHA`.

**Tech Stack:** Node.js 22, NestJS, Prisma, PostgreSQL 15, Docker Compose, PowerShell 7+ (pwsh), GitHub Actions, Trivy, Syft SBOM, GitHub Artifact Attestations.

---

## Global Constraints

- Never use placeholder code or bypass security gates.
- Strict fail-closed on any verification mismatch or unauthenticated state.
- Zero-Force bypass on database identity fingerprint validation.
- Docker containers run under least-privilege non-root users (`USER node`, `USER postgres`).
- PowerShell scripts run under `Set-StrictMode -Version Latest` and `$ErrorActionPreference = "Stop"`.
- Production Git SHA = CI Passed SHA = Image Build SHA = Release Manifest SHA = Deployed SHA.
- Canonical GHCR image naming: `ghcr.io/rahmatauliya10/gms-backend`, `ghcr.io/rahmatauliya10/gms-backend-migrator`, `ghcr.io/rahmatauliya10/gms-frontend`.
- No feature creep (no timeline/date corrections or business process changes in this hardening scope).

---

### Task 1: Backend Dockerfile Multi-Stage Separation (Zero-npm Runtime) & Clean Trivy Scan

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Create: `.trivyignore.yaml`
- Delete: `.trivyignore`

- [ ] **Step 1: Multi-stage backend/Dockerfile (Builder, Migrator, Runtime without npm)**
Configure `backend/Dockerfile`:
```dockerfile
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Migrator Stage (Includes Prisma CLI and migration tooling)
FROM node:22-alpine AS migrator
RUN apk upgrade --no-cache && apk add --no-cache postgresql-client
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# Runtime Stage (Minimal Alpine Node container without npm or npx)
FROM alpine:3.21 AS runtime
RUN apk upgrade --no-cache && apk add --no-cache nodejs postgresql-client shadow \
    && groupadd -g 1000 node && useradd -u 1000 -g node -s /bin/sh -m node \
    && apk del shadow
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/uploads /app/backups/local /app/backups/nas /home/node/.cache /home/node/.npm && chown -R node:node /app /home/node
USER node
EXPOSE 3001
CMD ["node", "dist/src/main"]
```

- [ ] **Step 2: Update Compose files with migrator service**
Add `migrator` service in `docker-compose.yml` and `docker-compose.prod.yml` using `target: migrator`.

- [ ] **Step 3: Build images, verify npm absence, scan without suppression, and configure .trivyignore.yaml**
Delete legacy `.trivyignore`.
Build `gms-backend-runtime:test` and test:
`docker run --rm gms-backend-runtime:test node --version` -> PASS (v22.x)
`docker run --rm gms-backend-runtime:test npm --version` -> FAIL (Command not found)
Run Trivy scan with `--ignorefile .trivyignore.yaml`.
Only if actual unavoidable CVEs exist on the final images, write exact PURL and justification to `.trivyignore.yaml`.

---

### Task 2: Production Restore Operator Hardening & Target DB Fingerprint Guard

**Files:**
- Modify: `scripts/gms-production-restore.ps1`
- Modify: `scripts/run-restore-failure-drill.ps1`
- Modify: `scripts/deploy-with-rollback.ps1`

- [ ] **Step 1: Fix uninitialized variables & StrictMode crash paths in gms-production-restore.ps1**
Declare `[string]$PreRestoreUploadsDir = ""` and `[string]$StagingUploadDir = ""` before `try`. Check with `-not [string]::IsNullOrWhiteSpace()` in `catch`.

- [ ] **Step 2: Implement Target Database Fingerprint Guard before DROP SCHEMA**
Verify target container, target DB, `_prisma_migrations`, `AppSetting`:
- `GMS_ENVIRONMENT_ID` matches `-ExpectedEnvironmentId` (default: `GMS-PROD-SJA-01`).
- `GMS_INSTALLATION_UUID` matches target system UUID.
- `GMS_RESTORE_ALLOWED` equals `"TRUE"`.
- `-Force` does NOT bypass fingerprint check.
- Parameter `-InitializeNewEnvironment` replaces `-SkipFingerprintCheck` and strictly fails if the target DB is not 100% empty.
- Automatically reset `GMS_RESTORE_ALLOWED = "FALSE"` after completion/failure.

- [ ] **Step 3: Refactor paths to cross-platform in PowerShell scripts**
Use `$IsWindows` to set log directory dynamically (`C:\GMS_Logs` on Windows, `artifacts/logs` on Linux/CI).

- [ ] **Step 4: Update run-restore-failure-drill.ps1 with DURING_DB_PROMOTION phase**
Implement and test all 6 explicit fault injection phases:
1. `CHECKSUM_CORRUPTION`
2. `DURING_DB_PROMOTION`
3. `POST_DB_COMMIT`
4. `ATTACHMENT_SWAP`
5. `LIVE_VERIFICATION`
6. `MAINTENANCE_WRITE_FREEZE`

---

### Task 3: CI vs Release Workflow Separation & Canonical RepoDigest Provenance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `scripts/generate-release-checksums.ps1`

- [ ] **Step 1: Configure read-only .github/workflows/ci.yml**
- Read-only permissions: `contents: read`, `pull-requests: read`.
- Trigger on PR & branch pushes.
- Add `pwsh scripts/run-restore-failure-drill.ps1` step.
- Update Trivy action to use `--ignorefile .trivyignore.yaml`.
- Pin third-party actions to full commit SHAs.

- [ ] **Step 2: Create master-only .github/workflows/release.yml**
- Trigger via `workflow_run` (after CI completes with `success` on `master`) or `workflow_dispatch` (with GitHub API verification of CI pass).
- Permissions: `contents: read`, `packages: write`, `id-token: write`, `attestations: write`.
- Actions:
  - Checkout exact `workflow_run.head_sha || RELEASE_SHA`.
  - Login to GHCR (`ghcr.io`).
  - Build & push 3 canonical images:
    - `ghcr.io/rahmatauliya10/gms-backend` (runtime)
    - `ghcr.io/rahmatauliya10/gms-backend-migrator` (migrator)
    - `ghcr.io/rahmatauliya10/gms-frontend` (frontend)
  - Capture real immutable `RepoDigest` outputs (`ghcr.io/rahmatauliya10/gms-...@sha256:...`).
  - Scan exact pushed RepoDigests with Trivy `--ignorefile .trivyignore.yaml`.
  - Generate CycloneDX SBOM with Syft for all 3 images.
  - Generate GitHub Artifact Attestations (`actions/attest-build-provenance`).
  - Generate versioned `release_manifest.json` binding exact `gitSha`, `buildSha`, `ciPassedSha`, and all 3 `repoDigest` entries.
  - Upload release proof artifacts.

- [ ] **Step 3: Sync generate-release-checksums.ps1**
Update checksum and provenance generator to bind canonical RepoDigest references and cross-platform paths.

---

### Task 4: End-to-End Verification & Walkthrough Artifact

- [ ] **Step 1: Execute test suites and DR drills**
Run:
- `pwsh -ExecutionPolicy Bypass -File scripts/run-restore-failure-drill.ps1`
- `node scripts/ci-restore-failure-drill.js`
- `npm --prefix backend run lint:check`
- `npm --prefix backend run test:cov`
- `npm --prefix backend run test:e2e`

- [ ] **Step 2: Generate Walkthrough artifact**
Document all test evidence, checksums, and verification metrics in `walkthrough.md`.
