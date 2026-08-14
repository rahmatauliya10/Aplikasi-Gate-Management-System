# Walkthrough — Remediasi P0 Blocker & Hardening Gate Management System v1.0.0 (Level 9 Production Ready)

Dokumentasi ini merangkum seluruh perubahan kode dan perbaikan struktural yang diimplementasikan pada codebase untuk menutup seluruh temuan **P0 Blocker (P0-01, P0-02, P0-03)**, **P1 (P1-04, P1-07, P1-08)**, serta temuan **P2 dan Code Hygiene** berdasarkan hasil Re-Audit 14 Agustus 2026.

---

## 🛠️ Ringkasan Perbaikan Teknis per Paket

### 1. Paket 1 — Historical Migration Rehearsal sebagai Release Gate CI (P0-01)
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Menambahkan job required `historical-migration-rehearsal-gate` yang berjalan setelah `backend-verification` dan menjadi dependency dari `fullstack-staging-gate`.
  - Mengintegrasikan pembuatan test fixture terisolasi (`tests/fixtures/historical/generate-test-fixtures.js`), validasi checksum manifest dump + attachment archive, negative test case (swapped/mismatched checksum hard-fail), restore via `pg_restore`, `prisma:preflight`, `prisma migrate deploy`, verifikasi migration checksums, zero schema drift (`prisma migrate diff`), validasi 16 entitas & invariant (`duplicate isCurrent = 0`, `FK orphans = 0`), serta rekonsiliasi berkas lampiran fisik.
  - Menghasilkan dan mengunggah 5 bukti artefak autentik ke `artifacts/release-proof/`.
- **[scripts/rehearse-historical-db.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/rehearse-historical-db.ps1)**:
  - Mewajibkan field `checksums.attachmentsArchive` pada companion manifest jika berkas archive lampiran diberikan; script melakukan hard-fail (`exit 1`) jika field tidak ada atau hash tidak cocok.
- **[tests/fixtures/historical/generate-test-fixtures.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/tests/fixtures/historical/generate-test-fixtures.js)**:
  - Generator otomatis untuk klon database `pg_dump` biner (`.dump`), companion manifest JSON dengan SHA-256 autentik, dan archive attachment JSON untuk rehearsal CI.

### 2. Paket 2 — Single Restore Control Plane & Fail-Closed Atomicity (P0-02 & P1-07)
- **[backend/src/settings/database-backup.controller.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.controller.ts)**:
  - Menolak akses langsung pada endpoint `POST /settings/database/restore` dan `POST /settings/database/restore-bundle` ketika `NODE_ENV=production` dengan melempar `ForbiddenException` (403), mewajibkan seluruh operasi pemulihan produksi melalui operator script `scripts/gms-production-restore.ps1`.
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - Mempersempit `isMissingTableError`: hanya mengenali kode error `42P01` / `P2021` atau relasi/tabel hilang; secara eksplisit mengecualikan error missing column (`42703` / `P2022`) agar tidak menyembunyikan inkonsistensi skema.
  - Menambahkan pengecekan arsip lampiran fail-closed pada `restoreDatabase`: jika manifest mencantumkan `attachmentsArchive` namun berkas tidak ditemukan di direktori backup (lokal/offsite/upload), proses langsung dibatalkan sebelum database tersentuh.
  - Menambahkan mandatory snapshot pra-pemulihan (`AUTO_PRE_RESTORE`) sebelum modifikasi DB, staging lampiran terisolasi, dan compensating DB rollback jika terjadi error selama promosi lampiran.
- **[scripts/gms-production-restore.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-production-restore.ps1)**:
  - Mengubah selisih jumlah attachment fisik (`RestoredPhysicalCount < LiveAttCount`) dari sekadar warning menjadi hard failure (`throw`).
  - Menambahkan asersi langsung terhadap 16 entitas manifest pada target database live setelah promosi.
  - Menghitung status `PASSED`/`FAILED` secara dinamis dari hasil asersi live.

### 3. Paket 3 — Coordinated DB Rollback & Watchdog Hardening (P0-03 & P1-04)
- **[scripts/deploy-with-rollback.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/deploy-with-rollback.ps1)**:
  - Menangkap `CapturedPreDeployBackupId` dan `CapturedManifestPath` secara deterministik langsung dari output log `db:prepare:prod`.
  - Memperbarui `Execute-Rollback`: jika terjadi kegagalan deployment pasca-migrasi, sistem mengaktifkan maintenance freeze, menjalankan pemulihan database terkoordinasi dari snapshot pra-deploy melalui operator restore plane, menaikkan image rilis stabil sebelumnya, lalu menjalankan watchdog verification.
- **[scripts/gms-autostart-watchdog.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-autostart-watchdog.ps1)**:
  - Menambahkan parameter `-RequireFrontend` dan `-RequireNginx`, mewajibkan container frontend berstatus running saat verifikasi.
  - Menghapus trailing whitespace pada probe health check Node.js untuk menjaga code hygiene (`git diff --check`).

### 4. Paket 4 — Quality Fixes & Test Suite Hardening (P1-08)
- **[backend/src/transactions/operation-log-correction.service.spec.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/operation-log-correction.service.spec.ts)**:
  - Memperbaiki payload pengujian dari `targetField` menjadi `fieldName` agar sesuai dengan `CorrectionItemDto` produksi.
  - Menambahkan unit test eksplisit untuk memverifikasi penolakan lampiran bukti yang berstatus stale / non-current (`isCurrent: false`).

---

## 🧪 Rekapitulasi Validasi Pengujian Unit

```typescript
// backend/src/transactions/operation-log-correction.service.spec.ts
✓ should reject correction if evidenceAttachmentId does not belong to the transaction (P1-08)
✓ should reject correction if evidence attachment is not current (isCurrent=false) (P1-08)
✓ should reject correction if evidenceAttachmentId lacks verified sha256 checksum (P1-08)
✓ should correctly attribute originalCreatedBy to Transaction.createdBy (P1-08)

// backend/src/settings/database-backup.service.spec.ts
✓ should return null for lastBackupAgeHours when no verified backup exists (P2-06)
✓ should create native pg_dump backup even if legacy schema tables are missing (P0-02)
✓ should throw error and fail backup if snapshot error is a transient connection error rather than missing table (P0-02)
```

---

## 📌 Status Rilis & Kesiapan Produksi (Level 9 Ready)

Seluruh 4 paket perbaikan telah diimplementasikan secara terstruktur dan konsisten di seluruh lapisan codebase (NestJS backend, PowerShell operator tools, CI workflow YAML, dan skrip Node.js). Codebase kini memenuhi seluruh kriteria penerimaan untuk rilis Level 9.
