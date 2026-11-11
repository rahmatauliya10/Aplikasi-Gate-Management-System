# GMS PR #27 — Master Final Integrated Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a unified, production-grade implementation of all remaining GMS requirements for PR #27: GBJ Multi Product Type (1-2 products per shipment), Global Daily Arrival Sequence Numbering (001 reset daily WIB), Pending Transaction Reminder System (header bell, login prompt, role-scoped actions, unsaved warning), and comprehensive Full Analysis / PDF parity while preserving all previously verified GSP Chemical & Coal remediations.

**Architecture:**
1. **GBJ Multi Product Type**: Update Prisma schema to persist structured `deliveryChecklist` and `productTypes` array on `Transaction` and `WarehouseProcess`, validate in `CompleteWarehouseDto` (1-2 items, no duplicates, valid catalog), and render dynamically across GBJ form, history, detail modal, and PDF.
2. **Daily Arrival Sequence Number**: Implement a dedicated `DailyArrivalCounter` atomic table in PostgreSQL and an integer field `dailySequence` on `Transaction`. Gate In atomically increments and formats sequence as a 3-digit number (`001`, `002`), reset at 00:00 WIB, with immutability across status changes and no retroactive guessing.
3. **Pending Transaction Reminder System**: Implement `@Get('transactions/pending-reminders')` with role-based scoping (Security, Weighbridge, QC, Warehouse GBB/GBJ/GSP, Admin), categorization (`NEED_ACTION`, `IN_PROGRESS`, `WAITING_OTHER_PROCESS`, `OVERDUE`), non-spamming persistent state, header bell dropdown, login modal prompt, and unsaved form leave guards.
4. **Integration & Parity**: Update `TruckDetailsModal.vue` and `pdfGenerator.js` to ensure complete parity across all 15 operational data dimensions.

**Tech Stack:** NestJS 10, Prisma ORM, PostgreSQL, Vue 3, Pinia, TailwindCSS/Vanilla CSS, Vitest, Jest.

## Global Constraints
- Target Branch PR: `fix/gsp-process-audit-improvements` against approved remote HEAD `cc93dd3d54f57e288a7aaee1393af4a720b729d5`.
- Release Gates: `COMMIT / PUSH`: **HOLD** (pending user approval), `MERGE`: **NOT AUTHORIZED**, `PRODUCTION DEPLOY`: **NOT AUTHORIZED**.
- Preserve all existing GSP Chemical (PAC, Rapid Klen), Coal, Solar exemptions, pre-unload checklist popup (9 items), and concession disposition workflows.
- No dummy/fictitious measurements or unverified assumptions; UOM safety (KG vs LITER) strictly preserved.

---

### Task 1: Database Migration for Daily Arrival Counter & Multi-Product Delivery Checklist

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261015010000_add_arrival_seq_and_delivery_checklist/migration.sql`
- Test: `backend/test/schema-migration.spec.ts`

**Interfaces:**
- Produces:
  - Model `DailyArrivalCounter` with fields `dateKey String @id`, `lastSeq Int @default(0)`, `updatedAt DateTime @updatedAt`
  - Field `Transaction.dailySequence Int?`
  - Field `Transaction.deliveryChecklist Json?`

- [ ] **Step 1: Write migration test for schema additions**
  Verify that Prisma Client exposes `dailyArrivalCounter`, `transaction.dailySequence`, and `transaction.deliveryChecklist`.

- [ ] **Step 2: Update `backend/prisma/schema.prisma`**
  Add `dailySequence Int?` and `deliveryChecklist Json?` to `model Transaction`.
  Add `model DailyArrivalCounter`.

- [ ] **Step 3: Create and apply migration SQL**
  Apply migration on both local and Docker UAT PostgreSQL (`gate-system-uat-postgres`).

- [ ] **Step 4: Run `prisma generate` and test migration**
  Ensure Prisma Client is regenerated and compiles cleanly.

---

### Task 2: Prioritas 1 — GBJ Multi Product Type (Backend)

**Files:**
- Modify: `backend/src/warehouse/dto/complete-warehouse.dto.ts`
- Modify: `backend/src/warehouse/warehouse.service.ts`
- Create: `backend/src/warehouse/gbj-multi-product.spec.ts`

**Interfaces:**
- Consumes: `CompleteWarehouseDto.deliveryChecklist`
- Produces: Validated `productTypes` array (length 1 or 2, distinct items from valid GBJ catalog: `['SIC 18 T', 'SIC 01 PC', 'SIC 25 BR', 'SIC 8590 SD', 'SIC 9010 M3', 'SIC 18 C1']`). Backwards compatible with legacy single `productType` string.

- [ ] **Step 1: Write unit tests in `gbj-multi-product.spec.ts`**
  - Test valid single product `['SIC 18 T']`
  - Test valid two distinct products `['SIC 18 T', 'SIC 01 PC']`
  - Test rejection when empty or > 2 products
  - Test rejection on duplicate products `['SIC 18 T', 'SIC 18 T']`
  - Test rejection on invalid product code `['UNKNOWN_XYZ']`
  - Test backward compatibility: accepts `{ productType: 'SIC 18 T' }` and normalizes to `{ productTypes: ['SIC 18 T'] }`

- [ ] **Step 2: Update `CompleteWarehouseDto` with strict class-validator decorators**
  Validate `productTypes` array, customer, productCondition, documentAvailability.

- [ ] **Step 3: Update `WarehouseService.completeWarehouse`**
  Store structured `deliveryChecklist` on both `Transaction.deliveryChecklist` and `WarehouseProcess.checklistItems`.

- [ ] **Step 4: Run tests and verify PASS**
  Run: `npm test -- gbj-multi-product.spec.ts`

---

### Task 3: Prioritas 1 — GBJ Multi Product Type (Frontend UI & Details/PDF)

**Files:**
- Modify: `frontend/src/views/GBJProcess.vue`
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/utils/pdfGenerator.js`
- Create/Modify: `frontend/src/__tests__/gbj-process.spec.js`

**Interfaces:**
- Dynamic UI allowing 1 or 2 product types:
  - Product 1: required dropdown
  - Product 2: optional dropdown with "Tambah Jenis Produk" / "Hapus Produk 2", preventing selecting the same product as Product 1
- Full Analysis Modal & PDF: Displays all selected product types (e.g., `SIC 18 T, SIC 01 PC`).

- [ ] **Step 1: Write frontend test in `gbj-process.spec.js`**
  Assert that selecting 2 products includes both in the payload `deliveryChecklist.productTypes`.

- [ ] **Step 2: Update `GBJProcess.vue` template & reactive state**
  Support `productType1` and `productType2`, enforce distinct selections, format payload as `productTypes: [productType1, ...(productType2 ? [productType2] : [])]`.

- [ ] **Step 3: Update `TruckDetailsModal.vue` & `pdfGenerator.js`**
  Parse and display `productTypes` list in GBJ vehicle and goods inspection section and PDF Delivery Note section.

- [ ] **Step 4: Run frontend tests**
  Run: `npm test -- gbj-process.spec.js`

---

### Task 4: Prioritas 2 — Global Daily Arrival Sequence Number (Backend)

**Files:**
- Modify: `backend/src/gate/gate.service.ts`
- Create: `backend/src/gate/arrival-sequence.spec.ts`

**Interfaces:**
- Consumes: `now: Date` with WIB plant day calculation via `getPlantDay(now)`
- Produces: `dailySequence: number` allocated atomically on `DailyArrivalCounter` table and assigned to `Transaction.dailySequence`.

- [ ] **Step 1: Write unit tests in `arrival-sequence.spec.ts`**
  - Test sequence starts at 1 (`001`) for a fresh day.
  - Test sequential check-ins produce 1, 2, 3 (`001`, `002`, `003`).
  - Test sequence is global across GBB, GBJ, and GSP transactions.
  - Test concurrent check-ins allocate unique numbers without duplicates.
  - Test next WIB calendar day resets counter to 1 (`001`).

- [ ] **Step 2: Implement atomic sequence allocation in `GateService.checkIn`**
  Inside Prisma transaction:
  ```typescript
  const counter = await tx.dailyArrivalCounter.upsert({
    where: { dateKey },
    create: { dateKey, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  const dailySequence = counter.lastSeq;
  ```
  Set `dailySequence` on the created `Transaction`.

- [ ] **Step 3: Run backend arrival sequence tests**
  Run: `npm test -- arrival-sequence.spec.ts`

---

### Task 5: Prioritas 2 — Global Daily Arrival Sequence Number (Frontend UI & Parity)

**Files:**
- Create: `frontend/src/utils/arrivalSequence.js`
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/views/SecurityGate.vue`
- Modify: `frontend/src/views/WeighbridgeProcess.vue`
- Modify: `frontend/src/views/QCVerification.vue`
- Modify: `frontend/src/views/GBBProcess.vue`
- Modify: `frontend/src/views/GBJProcess.vue`
- Modify: `frontend/src/views/GSPProcess.vue`
- Modify: `frontend/src/views/Dashboard.vue`
- Modify: `frontend/src/views/OperationsLog.vue`
- Modify: `frontend/src/utils/pdfGenerator.js`

**Interfaces:**
- Helper: `formatArrivalSequence(seqOrTruck)` -> `#001` or `001` (or `-` if null).
- Displays arrival sequence badge clearly next to license plate or in header across all operation queues.

- [ ] **Step 1: Create `frontend/src/utils/arrivalSequence.js`**
  Format sequence as 3-digit string `#001` without guessing for null/historical data.

- [ ] **Step 2: Add arrival sequence badge across views**
  Display arrival badge on queue cards, table rows, and detail headers.

- [ ] **Step 3: Update `TruckDetailsModal.vue` & `pdfGenerator.js`**
  Include arrival sequence number in Identity & Security card and PDF header.

- [ ] **Step 4: Run frontend test suites**
  Run: `npm test`

---

### Task 6: Prioritas 3 — Pending Transaction Reminder System (Backend API)

**Files:**
- Modify: `backend/src/transactions/transactions.service.ts`
- Modify: `backend/src/transactions/transactions.controller.ts`
- Create: `backend/src/transactions/pending-reminders.spec.ts`

**Interfaces:**
- Endpoint: `GET /api/transactions/pending-reminders`
- Scopes:
  - `SECURITY`: `REGISTERED` (awaiting Weigh In) & `WEIGH_OUT_COMPLETED`/`REJECTED` (awaiting Gate Out).
  - `WEIGHBRIDGE`: `REGISTERED` (awaiting Weigh In) & `WAREHOUSE_DONE`/`REJECTED` (awaiting Weigh Out).
  - `QC`: `QC_VEHICLE_PENDING`, `QC_RETEST_REQUIRED`, `INCOMING_CHECK_PENDING`, `WAITING_GSP_DISPOSITION`.
  - `WAREHOUSE` (filtered by warehouseAccess processType): `QC_VEHICLE_PASSED`, `PA_NOT_REQUIRED`, `WAREHOUSE_IN_PROGRESS`, `WAITING_GSP_CHECKLIST_DISPOSITION`, `WAITING_GSP_DISPOSITION`.
  - `ADMIN`: All pending transactions across all scopes.
- Returns list of reminder objects with `id`, `transactionId`, `dailySequence`, `transactionNumber`, `plateNumber`, `processType`, `status`, `pendingTask`, `gateInAt`, `stageStartAt`, `waitingDurationMinutes`, `responsibleRole`, `category` (`NEED_ACTION`, `IN_PROGRESS`, `WAITING_OTHER_PROCESS`, `OVERDUE`), `targetUrl`.

- [ ] **Step 1: Write unit tests in `pending-reminders.spec.ts`**
  Test role filtering, warehouse scoping, categorization, SLA calculation, and exclusion of COMPLETED/CANCELLED/VOID.

- [ ] **Step 2: Implement `getPendingReminders` in `TransactionsService`**
  Query active transactions with current relations and categorize based on user role and elapsed time.

- [ ] **Step 3: Expose endpoint in `TransactionsController`**
  Add `@Get('pending-reminders')` protected with `JwtAuthGuard` and `RolesGuard`.

- [ ] **Step 4: Run backend reminder tests**
  Run: `npm test -- pending-reminders.spec.ts`

---

### Task 7: Prioritas 3 — Pending Transaction Reminder System (Frontend UI & Unsaved Warning)

**Files:**
- Create: `frontend/src/stores/reminderStore.js`
- Create: `frontend/src/components/PendingReminderBell.vue`
- Create: `frontend/src/components/LoginPendingReminderModal.vue`
- Create: `frontend/src/composables/useUnsavedWarning.js`
- Modify: `frontend/src/layouts/MainLayout.vue`
- Modify: `frontend/src/views/Login.vue`
- Modify: `frontend/src/views/GBJProcess.vue`
- Modify: `frontend/src/views/GSPProcess.vue`
- Modify: `frontend/src/views/QCVerification.vue`

**Interfaces:**
- `reminderStore.js`: Polls / fetches reminders on route transitions, stores read/snooze IDs in localStorage (persistent across refresh), provides count of active reminders.
- `PendingReminderBell.vue`: Replaces old activity icon in header with interactive bell, badge count, and slide-over/dropdown list with category tabs and "Buka Transaksi" navigation buttons.
- `LoginPendingReminderModal.vue`: Displays upon login when user has pending `NEED_ACTION` transactions with "Lihat Semua" and "Nanti" buttons.
- `useUnsavedWarning.js`: Intercepts `onBeforeRouteLeave` and `window.beforeunload` when form is dirty.

- [ ] **Step 1: Create `reminderStore.js` and tests in `frontend/src/__tests__/reminder-store.spec.js`**
  Test store actions: fetch, markAsRead, snooze, unreadCount.

- [ ] **Step 2: Build `PendingReminderBell.vue` and integrate into `MainLayout.vue`**
  Include badges, category filters, and direct action routing.

- [ ] **Step 3: Build `LoginPendingReminderModal.vue` and integrate into `Login.vue` / `MainLayout.vue`**
  Trigger on login if pending items > 0.

- [ ] **Step 4: Create `useUnsavedWarning.js` and attach to GSP, GBJ, and QC forms**
  Warn users when leaving uncommitted inputs.

- [ ] **Step 5: Run frontend test suites**
  Run: `npm test`

---

### Task 8: Full Analysis, Operational Roadmap, and PDF Parity Audit

**Files:**
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/utils/pdfGenerator.js`
- Modify: `frontend/src/components/StepTimeline.vue`

**Interfaces:**
- Ensure all 15 dimensions are fully rendered and consistent between Modal and PDF:
  1. Identity & Security (Plate, Driver, Vendor, Vehicle Type, SJ, PO)
  2. Nomor Urut Kedatangan (`dailySequence`)
  3. Product / Material Information & Multi Product Types for GBJ
  4. QC PA Results & Round History (PAC, Rapid Klen, Batubara)
  5. Actual parameters vs Specifications
  6. Chemical Quality Disposition (Accept with Note, Retest, Reject)
  7. GSP Pre-Unload Checklist (9 items)
  8. NOT OK notes and persistent photo thumbnails
  9. GSP Checklist Disposition (Concession vs Reject)
  10. Warehouse Realization & UOM (LITER vs KG)
  11. Weighbridge Gross / Tare / Net
  12. Operational Roadmap by Process Type (GBB, GBJ, GSP)
  13. Transaction Status History
  14. Admin Corrections & Audit Trail
  15. GBJ Multi Product Types list

- [ ] **Step 1: Audit and verify parity in `TruckDetailsModal.vue`**
  Verify that all 15 dimensions are correctly formatted and rendered.

- [ ] **Step 2: Audit and update `pdfGenerator.js`**
  Include arrival sequence number and multi-product delivery checklist in PDF export.

- [ ] **Step 3: Run comprehensive PDF generation test**
  Run: `npm test -- pdf-generator.spec.js`

---

### Task 9: Comprehensive Integration, Build & Live UAT Verification

**Files:**
- Create: `scratch/execute_master_final_uat.mjs`
- Create: `artifacts/screenshots_master_final_20261015/`

**Interfaces:**
- Automated end-to-end simulation across Docker UAT (127.0.0.1:8089):
  1. Scenario 1: GSP PAC Chemical (PA full parameters, 9-item checklist with defect + photo, concession disposition).
  2. Scenario 2: GSP Rapid Klen (PA full parameters).
  3. Scenario 3: GSP Batubara (8 PA parameters).
  4. Scenario 4: GBJ Multi Product Type (Checklist with 2 distinct products: SIC 18 T & SIC 01 PC).
  5. Scenario 5: Global Arrival Sequence (Sequential Gate In allocating 001, 002, 003).
  6. Scenario 6: Pending Transaction Reminder (Login popup, bell counter, role filtering, opening transaction).
  7. Capture all verification screenshots and verify database state.

- [ ] **Step 1: Run full Backend tests (`npm test` in `backend`)**
  Must pass 100% of test suites.

- [ ] **Step 2: Run full Frontend tests (`npm test` in `frontend`)**
  Must pass 100% of test files.

- [ ] **Step 3: Build backend and frontend bundles**
  Must complete with exit code 0.

- [ ] **Step 4: Sync build to Docker UAT containers and execute `scratch/execute_master_final_uat.mjs`**
  Capture pristine screenshot evidence for GBJ multi-product, arrival sequence, reminder bell, and login popup.

- [ ] **Step 5: Generate updated diff patch `audit_pr27_chemical_full_diff.patch`**
  Verify diff against `cc93dd3d54f57e288a7aaee1393af4a720b729d5`.

- [ ] **Step 6: Maintain strict HOLD on Commit/Push**
  Present complete evidence report to user without committing.
