# Plan Implementasi: Penyempurnaan Final Modul GSP & Pre-Unload Checklist Concession

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelesaikan 3 gap utama modul GSP:
1. Menampilkan seluruh parameter uji laboratorium secara lengkap (PAC: visual, foreign matters, kemasan, pH, density; Rapid Klen: visual, foreign matters, kemasan, Na2O, NaOH, pH, density; Batubara: kondisi, warna, level rank, kilap, pengotor, target kalori, total moisture, hasil ronde) di View Full Analysis, History Card, dan PDF Cetak.
2. Mengubah checklist kendaraan & dokumen pra-bongkar menjadi popup / modal pemeriksaan khusus ("Pemeriksaan Pra-Bongkar GSP") dengan upload/link foto bukti dan catatan wajib jika `NOT_OK`.
3. Mengganti logika auto-reject checklist NOT_OK dengan jalur keputusan / konsesi terpisah (Disposisi Pra-Bongkar: Terima dengan Catatan / Tolak) yang diaudit lengkap, tanpa merusak alur GBB, GBJ, maupun Disposisi Mutu Lab PA.

**Tech Stack:** NestJS, TypeScript, Prisma ORM, PostgreSQL, Vue 3, Pinia, Tailwind CSS, Chrome DevTools Protocol (CDP).

---

## Global Constraints
- HEAD Git basis tetap `cc93dd3d54f57e288a7aaee1393af4a720b729d5`.
- Release Gates: COMMIT/PUSH: HOLD, MERGE: NOT AUTHORIZED, DEPLOY: NOT AUTHORIZED.
- GBB dan GBJ roadmap dan alur operasional tetap 100% normal dan tidak boleh berubah.
- Semua tes backend Jest (618+) dan frontend Vitest (125+) harus tetap 100% PASS.

---

### Task 1: Database Schema & State Machine Enum Update
**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261015000000_add_waiting_gsp_checklist_disposition/migration.sql`
- Modify: `backend/src/common/state-machine/workflow-state-machine.ts`

- [ ] **Step 1: Update Prisma schema with `WAITING_GSP_CHECKLIST_DISPOSITION`**
- [ ] **Step 2: Create SQL migration idempotent (`ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'WAITING_GSP_CHECKLIST_DISPOSITION';`)**
- [ ] **Step 3: Apply migration to PostgreSQL database (`gate-system-postgres` & `gate-system-uat-postgres`)**
- [ ] **Step 4: Update `workflow-state-machine.ts` transitions for `WAITING_GSP_CHECKLIST_DISPOSITION`**

---

### Task 2: Backend Checklist Concession & Disposition API
**Files:**
- Modify: `backend/src/warehouse/dto/start-warehouse.dto.ts`
- Modify: `backend/src/warehouse/warehouse.service.ts`
- Modify: `backend/src/warehouse/warehouse.controller.ts`
- Test: `backend/src/warehouse/gsp-workflow.spec.ts`

- [ ] **Step 1: Update DTOs to support `photoUrl`, mandatory notes for NOT_OK, and checklist disposition**
- [ ] **Step 2: Update `warehouse.service.ts` to support NOT_OK checklist submission with transition to `WAITING_GSP_CHECKLIST_DISPOSITION` or immediate concession**
- [ ] **Step 3: Implement `POST /warehouse/:transactionId/checklist-disposition` endpoint (`ACCEPT_WITH_NOTE` / `REJECT`)**
- [ ] **Step 4: Write Jest tests in `gsp-workflow.spec.ts` covering NOT_OK validation, concession, and rejection**
- [ ] **Step 5: Run backend tests to verify 100% pass**

---

### Task 3: Full Parameter Formatting in Full Analysis Modal & History
**Files:**
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/utils/statusLabel.js`
- Modify: `frontend/src/components/StatusBadge.vue`

- [ ] **Step 1: Expand `getFormattedPaParameters` to parse and display all parameters for PAC, Rapid Klen, and Batubara**
- [ ] **Step 2: Add Block for Checklist Pra-Bongkar with 9 items, OK/NOT_OK badge, notes, and photo thumbnails**
- [ ] **Step 3: Add Block for Disposisi Pra-Bongkar (jika ada NOT OK / konsesi)**
- [ ] **Step 4: Update GSP operational roadmap to 10 distinct stages (including Disposisi Pra-Bongkar with `NOT APPLICABLE` handling)**

---

### Task 4: Popup / Modal Pemeriksaan Pra-Bongkar di GSPProcess.vue
**Files:**
- Modify: `frontend/src/views/GSPProcess.vue`

- [ ] **Step 1: Convert inline checklist card into a dedicated modal popup: "Pemeriksaan Pra-Bongkar GSP"**
- [ ] **Step 2: Implement mandatory notes and photo proof upload/URL for each NOT_OK item**
- [ ] **Step 3: Implement Modal Keputusan Penerimaan GSP ("Terima dengan Catatan" vs "Tolak") when NOT_OK items exist**
- [ ] **Step 4: Integrate with backend checklist disposition API**

---

### Task 5: PDF Generator Enhancement for GSP Analysis & Checklist
**Files:**
- Modify: `frontend/src/utils/pdfGenerator.js`

- [ ] **Step 1: Render complete parameters table for PAC (visual, foreign matters, kemasan, pH, density)**
- [ ] **Step 2: Render complete parameters table for Rapid Klen (visual, foreign matters, kemasan, Na2O, NaOH, pH, density)**
- [ ] **Step 3: Render complete parameters table for Batubara (kondisi, warna, rank, kilap, pengotor, kalori, moisture)**
- [ ] **Step 4: Include Pre-Unloading Checklist 9 items & Disposition in PDF**

---

### Task 6: Verification, Vitest Tests, & Automated Browser CDP Screenshots
**Files:**
- Modify: `frontend/src/__tests__/gsp-chemical-disposition.spec.js`
- Modify: `scratch/run_checkpoint_verification.mjs`

- [ ] **Step 1: Update Vitest tests to verify all parameter displays, popup checklist, and concession**
- [ ] **Step 2: Run all backend Jest tests and frontend Vitest tests**
- [ ] **Step 3: Rebuild frontend container in Docker**
- [ ] **Step 4: Execute CDP script to capture updated screenshots (Popup Checklist, NOT OK Concession modal, and Full Analysis)**
- [ ] **Step 5: Verify Git status, export fresh patch, and present final report**
