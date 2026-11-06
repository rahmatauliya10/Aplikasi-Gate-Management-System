# Independent Code Review Package — PR #27 (TASK-06)

**PR:** [#27 — feat(gsp): process-scoped master data, PA workflow, and registration flow lock](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/pull/27)  
**Branch:** `fix/gsp-process-audit-improvements` -> `master`  
**Base Commit:** `3147bfd` | **Head Commit:** Current HEAD  
**Total Perubahan:** ~287 file dimodifikasi / ditambahkan  
**Status CI Gate:** 10/10 PASS  
**Target Reviewer:** Independent Senior Software Engineer / Security Auditor  

---

## 1. Ringkasan Eksekutif PR #27

PR #27 menyelesaikan audit menyeluruh pada alur GSP (General Supplies / Chemicals), pemisahan hak akses gudang per proses bisnis (GBB, GSP, GBJ), penegakan matriks koreksi transaksi dan audit trail revisi, perbaikan keamanan CORS production, serta penguatan Disaster Recovery operator tooling.

---

## 2. Pengelompokan Perubahan per Domain Teknis

| No | Domain Teknis | Komponen Utama | Perubahan Kunci | Tingkat Risiko |
|---|---|---|---|:---:|
| 1 | **Auth & Session Security** | `backend/src/auth/*` | HttpOnly + Secure + SameSite=Strict cookies untuk refresh token, lockout proteksi brute force | Sedang |
| 2 | **RBAC & Process Scope** | `backend/src/common/guards/*` | Penegakan scope gudang: Petugas gudang hanya dapat mengakses proses bisnis yang diotorisasi (GBB/GSP/GBJ) | Tinggi |
| 3 | **QC Evaluation Engine** | `backend/src/qc/*` | Evaluasi otomatis spesifikasi kimia PAC & Rapid Klen, isolasi test fixture vs aturan aktif | Tinggi |
| 4 | **PA Workflow & Lock** | `backend/src/transactions/*` | Lock alur registrasi jika terdapat pending action yang belum diselesaikan | Tinggi |
| 5 | **Weighbridge & Tolerance** | `backend/src/weighbridge/*` | Kalkulasi otomatis Netto (GBB/GSP: In Gross - Out Tare; GBJ: Out Gross - In Tare), toleransi deviasi timbang | Kritis |
| 6 | **Warehouse Processing** | `backend/src/warehouse/*` | Checklist penerimaan / pembongkaran material, pencatatan waktu mulai & selesai bongkar | Sedang |
| 7 | **Database & Migrations** | `backend/prisma/*` | Penambahan tabel `TransactionCorrectionItem`, field `revision` pada `Transaction`, index unik | Kritis |
| 8 | **Audit Log & Immutability** | `backend/src/reports/*` | Enforce immutability pada `ActivityLog` dan `TransactionStatusHistory` via trigger database | Tinggi |
| 9 | **CORS & Network Security** | `backend/src/app.config.ts` | **CORS Hardening**: Menghapus regex subnet LAN blanket di production; hanya menerima origin resmi terdaftar | Kritis |
| 10 | **Deployment & Recovery** | `scripts/*`, `docs/*` | Pemisahan tegas antara DEPLOY, ROLLBACK, RESTORE, dan DRILL; isolasi fault injection | Kritis |

---

## 3. Detail Perubahan Berisiko Tinggi & Mitigasi Pengujian

### A. CORS Production Hardening (`backend/src/app.config.ts`)
- **Alasan Perubahan:** Sebelumnya regex mengizinkan seluruh IP privat (`10.x`, `192.168.x`, `172.16-31.x`) di mode produksi tanpa allowlist spesifik.
- **Implementasi:** Mengekstrak fungsi murni `isOriginAllowed()`. Di mode produksi, hanya origin eksplisit di `CORS_ORIGIN` yang diterima.
- **Bukti Pengujian:** 
  - Unit test `backend/src/app.config.spec.ts` (11/11 PASS)
  - HTTP e2e test `backend/test/cors-http.e2e-spec.ts` (7/7 PASS)
- **Risiko Regresi:** Operator di workstation LAN baru tidak dapat mengakses API jika IP/origin-nya belum didaftarkan di `CORS_ORIGIN`. Mitigasi: Daftarkan seluruh host/port resmi pada `.env` server.

### B. Migrasi Skema Database (`backend/prisma/migrations/*`)
- **Alasan Perubahan:** Kebutuhan pencatatan koreksi transaksi detail per field (`TransactionCorrectionItem`) dan pelacakan revisi transaksi.
- **Implementasi:** Kolom `revision` default 1, tabel `TransactionCorrectionItem` dengan foreign key ke `TransactionCorrection`.
- **Bukti Pengujian:** 
  - CI job `historical-migration-rehearsal-gate` (PASS)
  - CI job `backend-test-upgraded` (PASS)
- **Risiko Regresi:** Kegagalan migrasi pada database lama. Mitigasi: Checksum verification dan preflight duplicate check sebelum migrasi.

### C. Pemisahan Recovery Runbook & Guard Fault Injection (`scripts/*`)
- **Alasan Perubahan:** Mencegah script fault injection dijalankan saat insiden produksi nyata.
- **Implementasi:** Guard ketat di `gms-production-restore.ps1` dan `deploy-with-rollback.ps1` yang menolak `-FaultInjectionPhase` di luar environment staging drill yang terisolasi.
- **Bukti Pengujian:** Validasi syntax PowerShell dan drill harness.

---

## 4. Checklist Peninjauan untuk Independent Reviewer

- [ ] Kode mematuhi prinsip least privilege dan arsitektur modular NestJS/Vue.js.
- [ ] Tidak ada hardcoded credentials, secret, atau token yang terekspos.
- [ ] Seluruh endpoint mutatif dilindungi authentication guard dan role guard.
- [ ] Penanganan CORS aman dan terverifikasi fail-closed pada origin tidak sah.
- [ ] Perubahan skema database backward-compatible atau memiliki jalur migrasi teruji.
- [ ] Prosedur pemulihan bencana (DR) dan runbook operasional terbukti aman dari fault-injection.

---

## 5. Lembar Persetujuan Reviewer Independen

| Nama Reviewer | Organisasi / Afiliasi | Tanggal Review | Keputusan | Tanda Tangan / Link GitHub |
|---|---|:---:|:---:|:---:|
| ________________________ | Independent Technical Reviewer | ____/____/2026 | [ ] APPROVE PR #27<br>[ ] REQUEST CHANGES | ________________________ |
