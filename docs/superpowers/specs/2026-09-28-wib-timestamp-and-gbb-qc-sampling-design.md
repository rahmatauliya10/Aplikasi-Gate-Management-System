# Design Specification: WIB Timestamp Standardization & GBB/GSP QC Sampling Presentation

## 1. Overview
This specification details the remediation of two key operational findings identified on 2026-09-24:
1. **Timestamp Representation**: Inconsistent display times (12-hour AM/PM format, missing date, UTC vs browser local time drift) across Gate Check-In, Dashboard, QC, Weighbridge, Warehouses (GBB, GSP, GBJ), Truck Details Modal, and History. Standardize on **Asia/Jakarta (WIB, UTC+07:00), 24-hour format (`HH.mm` / `HH.mm.ss`)** with explicit date on registration lists and dashboard, and ensure WIB midnight (17:00:00 UTC) cleanly marks transaction sequence resets and History filter boundaries.
2. **QC Stage Semantics**: Preliminary QC check for raw material inbound warehouses (**GBB** and **GSP**) is **QC Sampling (pre-unloading)**, whereas finished goods (**GBJ**) remains **QC Vehicle Checklist**. Internal database enums and state machines remain `QC_VEHICLE_*` (zero schema migration, zero risk to historical data integrity), with presentation-layer mapping rendering `QC SAMPLING PASSED/REJECTED/PENDING` for GBB and GSP, and audit notes dynamically reflecting the inspection type.

---

## 2. Architectural Principles & Constraints

1. **Zero Database DDL Migration (Safety Gate)**:
   - Database schema uses PostgreSQL `DateTime` fields without changing enum definitions (`TransactionStatus.QC_VEHICLE_*` preserved).
   - No historical transaction records are altered or corrupted.
2. **Single Source of Truth for Plant Day**:
   - `backend/src/common/utils/plant-day.util.ts`: pure utility calculating plant day bounds (`start`, `end`, `dateKey`) based on Asia/Jakarta (UTC+07:00, constant offset, no DST).
   - Used in `GateService.generateTransactionNumber` to ensure transaction sequence numbers (`GMS-YYYYMMDD-XXXX`) rollover strictly at 00:00:00 WIB (17:00:00 UTC).
   - `dashboard-date-range.util.ts` remains intact as it already handles Asia/Jakarta boundaries for dashboard filters.
3. **Centralized Frontend Utilities**:
   - `frontend/src/utils/displayTime.js`: central Intl-based formatter for `Asia/Jakarta`, 24-hour format (`hourCycle: 'h23'`), returning standardized formatted strings (`formatPlantTime`, `formatPlantDate`, `formatPlantDateTime`, `plantDateKey`, `plantClockParts`).
   - `frontend/src/utils/statusLabel.js`: maps `QC_VEHICLE_*` status codes to `QC SAMPLING *` for GBB and GSP, while preserving `QC VEHICLE *` for GBJ and general views.
4. **Context-Aware Audit Trails**:
   - `QcService.checkVehicle`: sets status history notes to `Initial QC Sampling: ${result}` when `tx.processType !== 'GBJ'`, and `Vehicle Check: ${result}` for GBJ.
5. **Dynamic Administrative Reopen Options**:
   - In `TruckDetailsModal.vue`, `allowedReopenTargets` dynamically reflects `QC Sampling Pending (Menunggu Sampling Awal)` for GBB/GSP and `QC Vehicle Pending (Menunggu QC Kendaraan)` for GBJ based on the selected truck's `processType`.

---

## 3. Detailed Component & File Changes

### Backend
1. **`backend/src/common/utils/plant-day.util.ts`**:
   - Calculates `{ dateKey, start, end }` for a given `Date` (defaulting to `new Date()`) using `Asia/Jakarta` offset (+7 hours).
2. **`backend/src/common/utils/plant-day.util.spec.ts`**:
   - Tests boundary conditions: `2026-09-23T16:59:59.000Z` -> `dateKey: 20260923` vs `2026-09-23T17:00:00.000Z` -> `dateKey: 20260924`.
3. **`backend/src/gate/gate.service.ts`**:
   - Updates `generateTransactionNumber` to use `getPlantDay()`, querying `createdAt: { gte: start, lt: end }`.
4. **`backend/src/qc/qc.service.ts`**:
   - Updates `TransactionStatusHistory` notes for vehicle check to discriminate by `tx.processType`.

### Frontend
1. **`frontend/src/utils/displayTime.js`**:
   - `PLANT_TIME_ZONE = 'Asia/Jakarta'`
   - `formatPlantTime(date, withSeconds = false)`
   - `formatPlantDate(date)`
   - `plantDateKey(date)` -> `YYYY-MM-DD` in Asia/Jakarta
   - `formatPlantDateTime(date)` -> `${formatPlantDate(date)} ${formatPlantTime(date)} WIB`
   - `plantClockParts(date)` -> `{ hour, minute, second }` in 24h Asia/Jakarta
2. **`frontend/src/utils/statusLabel.js`**:
   - `getStatusLabel(status, processType)`
3. **`frontend/src/utils/__tests__/displayTime.spec.js`**:
   - Vitest unit tests for UTC to WIB conversion, midnight rollover, timezone resilience, and status label translation.
4. **Component Updates**:
   - `StatusBadge.vue`: use `getStatusLabel`
   - `TruckDetailsModal.vue`: use `formatPlantDateTime`, `formatPlantTime`, dynamic `allowedReopenTargets`
   - `TruckForm.vue`: use `formatPlantDate`, `formatPlantTime`
   - `MainLayout.vue`: clock uses `plantClockParts`, displays `WIB` badge
   - `Dashboard.vue`: table arrival column header `Registered (WIB)`, cells use `formatPlantDateTime`, status label uses `getStatusLabel`
   - `GateCheckIn.vue`: table arrival header `REGISTERED (WIB)`, cells use `formatPlantDateTime`, status uses `getStatusLabel`, date uses `formatPlantDate`
   - `History.vue`: filters use `plantDateKey`, timestamps use `formatPlantDateTime` / `formatPlantTime`, presets use `plantDateKey`
   - `QCVerification.vue`, `Weighbridge.vue`, `GBBProcess.vue`, `GSPProcess.vue`, `GBJProcess.vue`: replace ad-hoc `toLocaleTimeString` with `formatPlantTime`

---

## 4. Verification & Testing Strategy
1. **Unit Tests**:
   - Backend `plant-day.util.spec.ts` (Jest)
   - Frontend `displayTime.spec.js` (Vitest)
   - Existing suite regressions (backend `npm run test`, frontend `npm run test:unit`)
2. **Lint & Build**:
   - Backend: `npm run lint`, `npm run build`
   - Frontend: `npm run build`
   - Git hygiene: `git diff --check`
3. **UAT Validation**:
   - Validate live app behavior on Gate, Dashboard, Riwayat, and Truck Details.
