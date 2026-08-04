# GBB 7-Stage Workflow & 10-Item Vehicle Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 7-stage GBB workflow with strict Segregation of Duties (SoD) between QC and Gudang GBB, embedding the 10-item GBB vehicle inspection in `GBBProcess.vue` prior to unloading and reserving `QCVerification.vue` for initial sampling and final lab analysis.

**Architecture:** Separate QC Sampling Awal (Stage 3) from GBB Warehouse Vehicle Inspection (Stage 4) and QC Incoming Check (Stage 5). Ensure state transitions (`QC_VEHICLE_PENDING` ➔ `QC_VEHICLE_PASSED` ➔ `WAREHOUSE_IN_PROGRESS` ➔ `INCOMING_CHECK_PENDING` ➔ `INCOMING_CHECK_PASSED`) operate smoothly without schema changes.

**Tech Stack:** Vue 3, Pinia, Tailwind CSS, NestJS, Prisma ORM.

## Global Constraints

- **No DB Schema Changes**: Rely on existing Prisma `TransactionStatus` and `CheckResult` enums.
- **Strict Role Separation**: 10-item vehicle inspection is performed exclusively by Gudang GBB in `GBBProcess.vue`.
- **Zero Console Errors**: Maintain non-breaking UI components and reactive Vue props.

---

### Task 1: Refactor `QCVerification.vue` for Stage 3 Sampling Awal & Stage 5 QC Lab Analysis

**Files:**
- Modify: `frontend/src/views/QCVerification.vue`

**Interfaces:**
- Consumes: `truckStore.trucks`, `qcStore.submitVehicleResult`, `qcStore.submitIncomingResult`
- Produces: Updated transaction status for Stage 3 (`QC_VEHICLE_PASSED`) and Stage 5 (`INCOMING_CHECK_PASSED` / `REJECTED`)

- [ ] **Step 1: Update Stage 3 Action Button and Modal Form in `QCVerification.vue`**

Modify Stage 3 button for `QC_VEHICLE_PENDING` / `QC_VEHICLE_IN_PROGRESS` to state `🧪 Input QC Sampling Awal (Pre-Unloading)`. Add a dedicated modal/fields for initial physical sampling (Visual Sample, Odor, Moisture Est %, Notes) instead of the 5-item vehicle checklist.

- [ ] **Step 2: Update Stage 5 Action Bar in `QCVerification.vue`**

Ensure Stage 5 (`INCOMING_CHECK_PENDING` / `INCOMING_CHECK_IN_PROGRESS`) displays full lab analysis inputs (Kadar Air, FM, Biji OK, Bau, Warna, Note) with the 3-Way Decision Bar (Reject, Approve with Note, Approve Clean).

- [ ] **Step 3: Test and Commit**

Verify that QC Verification opens the correct modal for Stage 3 and Stage 5 respectively.

---

### Task 2: Implement 10-Item GBB Vehicle Inspection & Unloading in `GBBProcess.vue`

**Files:**
- Modify: `frontend/src/views/GBBProcess.vue`

**Interfaces:**
- Consumes: `warehouseStore.startProcess`, `warehouseStore.completeProcess`
- Produces: `deliveryChecklist` payload (JSON) containing the 10 GBB inspection items before unlocking Timbangan Roll input.

- [ ] **Step 1: Add 10-Item Vehicle Inspection Modal in `GBBProcess.vue`**

Embed the 10 GBB vehicle inspection items:
1. Vehicle is clean
2. Vehicle door seal is intact
3. Vehicle & goods have no abnormal odor
4. Goods are neatly arranged
5. No pests/animals or traces of living or dead animals found
6. No foreign objects present
7. Packaging is intact and complete
8. CoA is available and matches batch
9. Goods quantity matches delivery note
10. Vehicle has no leaks / in good condition

- [ ] **Step 2: Lock WeightInput Until 10-Item Inspection is Complete**

Ensure the Timbangan Roll GBB input form is locked until all 10 items are marked OK/NOT OK. Upon completion of checklist and roll weight entry, submit warehouse completion to move transaction status to `INCOMING_CHECK_PENDING`.

- [ ] **Step 3: Test and Commit**

Verify that GBB Operator sees the Passport Card, runs the 10-item checklist, inputs roll weight, and transitions status.

---

### Task 3: Align `StepTimeline.vue` and `TruckDetailsModal.vue`

**Files:**
- Modify: `frontend/src/components/StepTimeline.vue`
- Modify: `frontend/src/components/TruckDetailsModal.vue`

**Interfaces:**
- Consumes: `transaction.status`, `qcVehicleChecks`, `warehouseProcesses`
- Produces: Visual 7-step sequence and accurate audit history display.

- [ ] **Step 1: Update 7-Step Sequence Labels in `StepTimeline.vue`**

Ensure step labels clearly read: `1. Gate Check-In`, `2. Timbang Gross`, `3. QC Sampling Awal (Approved)`, `4. Bongkar GBB (10-Checklist & Roll)`, `5. QC Lab Incoming Check`, `6. Timbang Tare`, `7. Truk Keluar`.

- [ ] **Step 2: Update `TruckDetailsModal.vue` to Display Both Inspections**

Ensure `TruckDetailsModal.vue` renders QC Sampling Awal data, GBB 10-Item Vehicle Inspection results, GBB Roll Weights, and QC Lab Incoming Check results with Amber Warning Badge for concession notes (`⚠️ APPROVED WITH NOTE (KONSESI MUTU)`).

- [ ] **Step 3: Test and Commit**

Verify modal and timeline views.

---

### Task 4: Final Verification Build & Walkthrough Update

**Files:**
- Modify: `docs/flowchart_bisnis_gms.md`
- Modify: `walkthrough.md`

- [ ] **Step 1: Perform full build checks**
- [ ] **Step 2: Update `flowchart_bisnis_gms.md` & `walkthrough.md`**
