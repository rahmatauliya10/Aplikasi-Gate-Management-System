# GMS Strict Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve critical P0 regressions and open audit findings to elevate GMS production readiness score from 66/100 to GO Production status.

**Architecture:**
- Route Aliasing: Support both `/vehicle-result/:transactionId` & `/vehicle-check/:transactionId` as well as `/incoming-result/:transactionId` & `/incoming-check/:transactionId`.
- Hard-gate Preflight: Fail-closed on information_schema query/permission errors in `checkTableExists` and `checkColumnExists`.
- REOPEN Matrix: Require `reopenTargetStatus`, reject mixing reopen with field corrections, and synthesize active `WarehouseProcess` when reopening to `WAREHOUSE_IN_PROGRESS`.
- Attachment Security: Enforce `AuthorizationScopeService` transaction scope check directly in `AttachmentsService.processQuarantineUpload()`.
- Frontend Fail-Closed: Require explicit `GBJ` match in `Weighbridge.vue` rather than fallback `else`.

**Tech Stack:** NestJS, TypeScript, Vue 3, Prisma ORM, Jest.

---

## Global Constraints

- No breaking changes to existing valid frontend API calls.
- Strict fail-closed error handling on security and migration preflight gates.
- Complete TDD verification with Jest unit and controller integration tests.

---

### Task 1: Fix QC API Contract Route Mismatch (PR-33)

**Files:**
- Modify: `backend/src/qc/qc.controller.ts`
- Test: `backend/src/qc/qc.controller.spec.ts`

- [ ] **Step 1: Write failing controller route alias tests**
- [ ] **Step 2: Run test to confirm failure**
- [ ] **Step 3: Update `@Post` route decorators to accept array of paths**
- [ ] **Step 4: Run test to verify pass**

---

### Task 2: Preflight Query Error Fail-Closed Hard Gate (PR-28)

**Files:**
- Modify: `backend/prisma/production-migration-preflight.ts`
- Test: `backend/prisma/production-migration-preflight.spec.ts`

- [ ] **Step 1: Write failing unit test for DB/permission error handling in preflight**
- [ ] **Step 2: Update `checkTableExists` & `checkColumnExists` to record failure and set `isReadyForMigration = false` on query error**
- [ ] **Step 3: Run test to verify pass**

---

### Task 3: Enforce REOPEN Workflow Integrity & Target Validation (PR-30)

**Files:**
- Modify: `backend/src/transactions/dto/create-operation-log-correction.dto.ts`
- Modify: `backend/src/transactions/operation-log-correction.service.ts`
- Test: `backend/src/transactions/operation-log-correction.service.spec.ts`

- [ ] **Step 1: Write failing unit tests for missing `reopenTargetStatus`, combined items, and missing `WarehouseProcess` on REOPEN**
- [ ] **Step 2: Update `operation-log-correction.service.ts` validation and state handling**
- [ ] **Step 3: Run tests to verify pass**

---

### Task 4: Legacy Attachment Upload Authorization & Scope Check

**Files:**
- Modify: `backend/src/attachments/attachments.service.ts`
- Modify: `backend/src/qc/qc.controller.ts`
- Modify: `backend/src/warehouse/warehouse.controller.ts`

- [ ] **Step 1: Write failing unit test for transaction scope mismatch in `processQuarantineUpload`**
- [ ] **Step 2: Implement transaction scope check in service & add guard on legacy endpoints**
- [ ] **Step 3: Run tests to verify pass**

---

### Task 5: Frontend Process Type Fail-Closed Check in Weighbridge

**Files:**
- Modify: `frontend/src/views/Weighbridge.vue`

- [ ] **Step 1: Replace generic `else` block with explicit `else if (pType === 'GBJ')` check**
- [ ] **Step 2: Run frontend tests**
