# Technical Design Spec: Deep Audit Remediation & Quality Upgrade for GMS

## 1. Executive Summary
This design specification addresses all P0 critical migration gates, P1 high-severity data integrity/authorization defects, and P2 stability findings identified in the GMS Deep Audit.

Upon implementing these fixes, the system eliminates latent cross-module defects (GBJ weighbridge correction inversion, GSP warehouse SoD bypass, non-atomic warehouse completion, frontend token refresh failure, and weighbridge read scope leakage), upgrades migration/backup safety gates to fail-closed, and elevates the Production Readiness Score from **87/100** to **93+/100 (PRODUCTION RELEASE CANDIDATE - GO)**.

---

## 2. Technical Architecture & Module Specifications

### Module 1: Operation Log Correction — Process-Aware GBJ Weighbridge Adapter
**Target File**: `backend/src/transactions/operation-log-correction.service.ts`

- **Problem**: When correcting a `WeighbridgeRecord`, `rec.type === 'IN'` sets `grossWeight` and `rec.type === 'OUT'` sets `tareWeight`. This is valid for GBB and GSP, but inverted for GBJ (where IN = Tare, OUT = Gross).
- **Remediation**:
  1. Determine process type from `tx.processType`.
  2. If `tx.processType === 'GBJ'`:
     - `rec.type === 'IN'` → update `txUpdateData.tareWeight`
     - `rec.type === 'OUT'` → update `txUpdateData.grossWeight`
  3. If `tx.processType === 'GBB'` or `'GSP'`:
     - `rec.type === 'IN'` → update `txUpdateData.grossWeight`
     - `rec.type === 'OUT'` → update `txUpdateData.tareWeight`
  4. Automatically recalculate `netWeight = Math.max(0, Number((proposedGross - proposedTare).toFixed(2)))`.
  5. Add 4 test cases in `operation-log-correction.service.spec.ts`:
     - GBB IN weight correction → updates grossWeight
     - GBB OUT weight correction → updates tareWeight
     - GBJ IN weight correction → updates tareWeight
     - GBJ OUT weight correction → updates grossWeight

---

### Module 2: Warehouse Authorization & Flow Integrity
**Target Files**: 
- `backend/src/warehouse/warehouse.service.ts`
- `backend/src/warehouse/warehouse.controller.ts`

- **Problem 2.1 (GSP SoD Bypass)**:
  `submitIncomingCheck` in `WarehouseService` only checks `tx.processType === 'GBB' && user.role === 'WAREHOUSE'`. GSP transactions with `INCOMING_CHECK_PENDING` could be completed via Warehouse API by WAREHOUSE users.
  - **Remediation**: Expand SoD block to `['GBB', 'GSP'].includes(tx.processType) && user.role === 'WAREHOUSE'`.

- **Problem 2.2 (Completion Without Start Loading)**:
  `completeWarehouse` accepted `tx.status === 'QC_VEHICLE_PASSED'` alongside `'WAREHOUSE_IN_PROGRESS'`, creating fallback processes on the fly.
  - **Remediation**:
    1. Reject requests if `tx.status !== 'WAREHOUSE_IN_PROGRESS'`.
    2. Require active `WarehouseProcess` record where `startAt != null` and `endAt == null`.
    3. Remove fallback creation in standard operation path.

- **Problem 2.3 (Non-Atomic Complete Concurrency)**:
  `completeWarehouse` read transaction state and updated non-atomically.
  - **Remediation**:
    1. Execute atomic update via `prismaTx.transaction.updateMany`:
       ```ts
       const claimed = await prismaTx.transaction.updateMany({
         where: {
           id: transactionId,
           status: 'WAREHOUSE_IN_PROGRESS',
           warehouseEndAt: null
         },
         data: {
           status: nextStatus,
           warehouseEndAt: now,
           warehouseEndById: user.id,
           actualWeight: dto.actualWeight,
           actualQuantity: dto.actualQuantity,
           warehouseUnit: dto.unit,
           revision: { increment: 1 }
         }
       });
       if (claimed.count !== 1) {
         throw new ConflictException('Warehouse already completed or status changed concurrently');
       }
       ```
    2. Update active `WarehouseProcess` record within the same transaction.

---

### Module 3: Frontend Token Refresh & Auth Store
**Target Files**:
- `frontend/src/stores/authStore.js`
- `frontend/src/services/api.js`

- **Problem**: Response interceptor in `api.js` called `authStore.setToken(newToken)` upon successful `/auth/refresh`. `authStore.js` lacked `setToken()`, throwing a runtime error that wiped authentication.
- **Remediation**:
  1. Add `setToken(token)` action to `useAuthStore` in `authStore.js`:
     ```javascript
     setToken(token) {
       this.token = token
     }
     ```
  2. Add Vitest coverage verifying `setToken` updates Pinia state cleanly.

---

### Module 4: Weighbridge Read Scope Hardening
**Target File**: `backend/src/weighbridge/weighbridge.controller.ts`

- **Problem**: `WeighbridgeController` had `@Roles('ADMIN', 'SECURITY', 'QC', 'WAREHOUSE')` at class level. `getQueue` and `record/:transactionId` inherited this, exposing queue data to QC and WAREHOUSE without scope filters.
- **Remediation**:
  Change class-level role annotation to `@Roles('ADMIN', 'SECURITY')`. Security and Admin are the sole authorized roles for Weighbridge operations.

---

### Module 5: QC Duration & Dashboard KPI Accuracy
**Target File**: `backend/src/dashboard/dashboard.service.ts`

- **Problem**: Dashboard calculated `sumQc` from `tx.qcStartAt` to `tx.qcEndAt`, where `qcStartAt` was set when entering `QC_VEHICLE_PENDING` (queue arrival). This included queue wait time and warehouse processing in total QC time.
- **Remediation**:
  Calculate QC execution duration from actual child check timestamps (`QcVehicleCheck.startedAt` / `completedAt` and `IncomingMaterialCheck.startedAt` / `completedAt`) when available, giving an accurate representation of operational execution speed.

---

### Module 6: Hard-Gated Deployment & Migration Checksums
**Target Files**:
- `scripts/check-migration-checksums.js`
- `backend/package.json`

- **Problem**: `db:prepare:prod` ran `prisma migrate deploy` without verifying DB checksums first.
- **Remediation**:
  1. Update `scripts/check-migration-checksums.js` so that if `dbMigrations.length === 0` (fresh database), it prints a success message and exits 0 instead of failing.
  2. Add script `"db:verify:checksums": "node scripts/check-migration-checksums.js"` in `backend/package.json`.
  3. Update `"db:prepare:prod"` in `backend/package.json`:
     `"db:verify:checksums && npm run prisma:preflight -- --report-only --fail-on-duplicates && npx prisma migrate deploy"`

---

### Module 7: Offsite Disaster Recovery Artifact Integrity
**Target File**: `backend/src/backup/backup-verification.service.ts` (or backup service)

- **Problem**: Offsite verification marked status `VERIFIED` based only on DB dump checksum, ignoring `attachmentsArchive`.
- **Remediation**:
  Require both `dumpChecksum` and `attachmentsArchive` checksum (if attachments exist in manifest) to match before assigning `VERIFIED` status.

---

## 3. Verification & Testing Strategy
1. **Unit & Integration Tests**:
   - `npm run test` in backend (all 16+ test suites must pass, including 4 new GBJ/GBB correction tests and warehouse SoD/concurrency tests).
   - `npm run test:unit` in frontend (authStore setToken test).
2. **Migration Checksum Script Verification**:
   - Test `node scripts/check-migration-checksums.js` against database.
3. **Build & Quality Gates**:
   - `npm run build` in backend & frontend to ensure clean compilation.
