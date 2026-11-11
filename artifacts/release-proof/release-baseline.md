# Release Baseline & Scope Freeze Document (TASK-01)

**Tanggal:** 23 Oktober 2026  
**Status:** RELEASE CANDIDATE SCOPE FROZEN  
**Target Rilis:** GMS Production v1.0.0  
**PR:** [#27 — feat(gsp): process-scoped master data, PA workflow, and registration flow lock](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/pull/27)  
**Branch:** `fix/gsp-process-audit-improvements` -> `master`  

---

## 1. Identifikasi Baseline Rilis

| Parameter | Nilai Terverifikasi |
|---|---|
| **Repository** | `https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System` |
| **Branch Sumber** | `fix/gsp-process-audit-improvements` |
| **Target Branch** | `master` |
| **Baseline Audit SHA** | `596e06e74e45613d815ce31ac63f0af757ff4500` |
| **CI Terakhir** | Run #477 (`10/10 PASS`) |
| **Unit Test Coverage** | 969 / 969 PASS |
| **Backend E2E Tests** | 102 / 102 PASS |
| **CORS E2E Tests** | 7 / 7 PASS |

---

## 2. Pembekuan Cakupan Rilis (Release Scope Freeze)

1. **Kebijakan Pembekuan:**
   - Seluruh pengembangan fitur baru **DIHENTIKAN** (Scope Freeze).
   - Perubahan kode sejak baseline audit terakhir hanya terbatas pada:
     - Penutupan temuan keamanan CORS (`backend/src/app.config.ts`).
     - Penguatan safety guard restore & penutupan F7 (`scripts/gms-production-restore.ps1`).
     - Penyediaan smoke test non-mutatif (`scripts/prod-smoke-readonly.js`).
     - Pemisahan prosedur pemulihan pada runbook (`docs/RELEASE_CHECKLIST.md`).
2. **Klasifikasi Retest:**
   - Perubahan di atas tidak mengubah alur bisnis transaksi operasional yang telah diuji dalam UAT.
   - Retest yang diwajibkan adalah **Security & Safety Regression Test** (CORS HTTP test, safety guard validation, and automated CI 10/10 run).

---

## 3. Register Perubahan (Change Register) Pasca-Baseline

| No | File yang Dimodifikasi | Klasifikasi Perubahan | Kebutuhan Retest |
|---|---|---|:---:|
| 1 | `backend/src/app.config.ts` | CORS Hardening (Allowlist) | Security Regression (PASS) |
| 2 | `backend/src/app.config.spec.ts` | Unit tests untuk CORS | Unit Test Suite (PASS) |
| 3 | `backend/test/cors-http.e2e-spec.ts` | Supertest HTTP integration test CORS | E2E Integration Test (PASS) |
| 4 | `scripts/gms-production-restore.ps1` | F7 fix, installation UUID check, fault-injection block | Script Unit Check |
| 5 | `scripts/deploy-with-rollback.ps1` | Production fault-injection guard & rollback verify | Script Unit Check |
| 6 | `scripts/ci-e2e-smoke.js` | Production guard, remove hardcoded password fallback | CI Test Harness Check |
| 7 | `scripts/prod-smoke-readonly.js` | Non-mutating production smoke test script | Staging Verification |
| 8 | `docs/RELEASE_CHECKLIST.md` | Runbook recovery separation, RTO note update | Documentation Review |
| 9 | `docs/RPO_RTO_DR_POLICY.md` | DR drill staging-only restriction, RTO note | Documentation Review |
| 10 | `docs/DR_DRILL_RUNBOOK.md` | Restrict drills to staging only | Documentation Review |
| 11 | `docs/kpi-audit-report.md` | TASK-05 KPI & TAT Audit Report | Process Owner Review |
| 12 | `docs/qc-spec-matrix.md` | TASK-04 Chemical QC Specification Matrix | QC Approval Review |
| 13 | `docs/uat-matrix.md` | TASK-02 31 UAT Scenario Status Matrix | UAT Sign-Off Verification |
| 14 | `docs/review-package-pr27.md` | TASK-06 Independent Code Review Package | Independent Reviewer |
