# GMS Deep Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate all P0 migration safety gates, P1 data integrity/authorization defects, and P2 findings to achieve Production Release Candidate status with 93+/100 score.

**Architecture:** Modifies backend NestJS controllers and services (OperationLogCorrectionService, WarehouseService, WeighbridgeController, DashboardService), adds missing authStore method in Pinia frontend, updates migration checksum checking script, and adds automated tests.

**Tech Stack:** NestJS, TypeScript, Vue 3 (Pinia, Axios), Prisma, PostgreSQL, Node.js.

## Global Constraints
- All backend unit tests must pass via `npm run test`.
- All frontend unit tests must pass via `npm run test:unit`.
- Code changes must follow existing NestJS/Prisma patterns and maintain API contracts.

---

### Task 1: Fix Operation Log Correction GBJ Gross/Tare Sync
**Files:**
- Modify: `backend/src/transactions/operation-log-correction.service.ts`
- Modify: `backend/src/transactions/operation-log-correction.service.spec.ts`

**Interfaces:**
- Produces: Corrected GBJ Weighbridge record auto-sync to root transaction (IN -> tareWeight, OUT -> grossWeight, netWeight = grossWeight - tareWeight).

- [ ] **Step 1: Write tests for GBB and GBJ weighbridge corrections**

Add test cases in `backend/src/transactions/operation-log-correction.service.spec.ts`:
- GBB IN correction sets grossWeight and recalculates netWeight
- GBB OUT correction sets tareWeight and recalculates netWeight
- GBJ IN correction sets tareWeight and recalculates netWeight
- GBJ OUT correction sets grossWeight and recalculates netWeight

- [ ] **Step 2: Run backend tests to verify expected behavior**
Run: `npx jest backend/src/transactions/operation-log-correction.service.spec.ts`

- [ ] **Step 3: Update `OperationLogCorrectionService`**
In `backend/src/transactions/operation-log-correction.service.ts`:
```ts
if (item.fieldName === 'weight') {
  if (tx.processType === 'GBJ') {
    if (rec.type === 'IN') {
      txUpdateData.tareWeight = Number(item.newValue);
    } else {
      txUpdateData.grossWeight = Number(item.newValue);
    }
  } else {
    if (rec.type === 'IN') {
      txUpdateData.grossWeight = Number(item.newValue);
    } else {
      txUpdateData.tareWeight = Number(item.newValue);
    }
  }
}
```
And calculate `netWeight`:
```ts
if (proposedGross !== null && proposedTare !== null) {
  txUpdateData.netWeight = Math.max(0, Number((proposedGross - proposedTare).toFixed(2)));
}
```

- [ ] **Step 4: Run tests to verify pass**
Run: `npx jest backend/src/transactions/operation-log-correction.service.spec.ts`

---

### Task 2: Fix GSP Warehouse SoD & Warehouse Completion Flow
**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts`
- Modify: `backend/src/warehouse/warehouse.service.spec.ts` (or integration spec)

**Interfaces:**
- Produces: Fail-closed SoD for GBB and GSP incoming checks in Warehouse service; strict `WAREHOUSE_IN_PROGRESS` requirement for completeWarehouse; atomic transaction claim for completeWarehouse.

- [ ] **Step 1: Update SoD check in `submitIncomingCheck`**
In `backend/src/warehouse/warehouse.service.ts`:
Change:
```ts
if (['GBB', 'GSP'].includes(tx.processType) && user.role === 'WAREHOUSE')
```

- [ ] **Step 2: Enforce strict `WAREHOUSE_IN_PROGRESS` in `completeWarehouse`**
In `backend/src/warehouse/warehouse.service.ts`:
Reject if `tx.status !== 'WAREHOUSE_IN_PROGRESS'`.
Ensure `tx.warehouseProcesses` contains an active process where `startAt !== null` and `endAt === null`.

- [ ] **Step 3: Implement atomic claim in `completeWarehouse`**
In `backend/src/warehouse/warehouse.service.ts`:
Use `prismaTx.transaction.updateMany` with:
```ts
where: {
  id: transactionId,
  status: 'WAREHOUSE_IN_PROGRESS',
  warehouseEndAt: null
}
```
Ensure `claimed.count === 1`.

- [ ] **Step 4: Run warehouse tests**
Run: `npx jest backend/src/warehouse`

---

### Task 3: Fix Frontend Pinia Auth Store & Refresh Interceptor
**Files:**
- Modify: `frontend/src/stores/authStore.js`
- Modify: `frontend/src/stores/__tests__/authStore.spec.js` (or unit test)

**Interfaces:**
- Produces: `authStore.setToken(token)` action updating state.token.

- [ ] **Step 1: Write test for `setToken` in authStore**
Add unit test for `authStore.setToken`.

- [ ] **Step 2: Add `setToken(token)` action in `authStore.js`**
```javascript
setToken(token) {
  this.token = token
}
```

- [ ] **Step 3: Run frontend tests**
Run: `npm --prefix frontend run test:unit` (or Vitest command)

---

### Task 4: Restrict Weighbridge GET Endpoint Authorization
**Files:**
- Modify: `backend/src/weighbridge/weighbridge.controller.ts`

**Interfaces:**
- Produces: `@Roles('ADMIN', 'SECURITY')` on class level or endpoints to prevent unauthorized read access by QC or WAREHOUSE.

- [ ] **Step 1: Update `WeighbridgeController` roles**
In `backend/src/weighbridge/weighbridge.controller.ts`:
Set class annotation: `@Roles('ADMIN', 'SECURITY')`.

- [ ] **Step 2: Run weighbridge controller tests**
Run: `npx jest backend/src/weighbridge`

---

### Task 5: Upgrade KPI QC Duration Logic in Dashboard
**Files:**
- Modify: `backend/src/dashboard/dashboard.service.ts`

**Interfaces:**
- Produces: Accurate average stage times in dashboard using child check timestamps.

- [ ] **Step 1: Update dashboard QC calculation**
In `backend/src/dashboard/dashboard.service.ts`, compute QC duration using child records `QcVehicleCheck` / `IncomingMaterialCheck` when present.

- [ ] **Step 2: Run dashboard tests**
Run: `npx jest backend/src/dashboard`

---

### Task 6: Migration Checksum Fail-Closed Hard Gate
**Files:**
- Modify: `scripts/check-migration-checksums.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `npm run db:prepare:prod` executing migration checksum check before `prisma migrate deploy`, with support for fresh databases.

- [ ] **Step 1: Update `scripts/check-migration-checksums.js`**
Support fresh DBs (0 rows in `_prisma_migrations`) without crashing.

- [ ] **Step 2: Add script and update `db:prepare:prod` in `backend/package.json`**
Add `"db:verify:checksums": "node scripts/check-migration-checksums.js"`
Update `"db:prepare:prod": "npm run db:verify:checksums && npm run prisma:preflight -- --report-only --fail-on-duplicates && npx prisma migrate deploy"`

- [ ] **Step 3: Verify script execution**
Run: `node scripts/check-migration-checksums.js`

---

### Task 7: Disaster Recovery Offsite Verification Enhancement
**Files:**
- Modify: `backend/src/backup/backup-verification.service.ts`

**Interfaces:**
- Produces: Requirement for attachments archive checksum match before setting offsiteStatus to `VERIFIED`.

- [ ] **Step 1: Update backup verification service**
Verify attachments checksum alongside dump checksum for offsite backups.

- [ ] **Step 2: Run backup unit tests**
Run: `npx jest backend/src/backup`

---

### Task 8: Full Verification & Quality Audit Score Check
- [ ] Run backend unit tests (`npm run test` inside backend)
- [ ] Run backend E2E tests (`npm run test:e2e` inside backend)
- [ ] Verify build status (`npm run build` in backend and frontend)
