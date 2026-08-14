# Walkthrough — Remediasi Audit Gate Management System v1.0.0

Seluruh temuan blocker **P0 (P0-01, P0-02, P0-03)** serta temuan prioritas **P1 (P1-07, P1-08)** dan **P2 (P2-04, P2-06)** telah berhasil diperbaiki secara komprehensif mengikuti standar rekayasa perangkat lunak yang ketat dan fail-closed.

---

## 🛠️ Ringkasan Perubahan per Wave & File

### 1. Wave 1 — Integritas Historical Rehearsal & CI Evidence (P0-01)
- **[scripts/rehearse-historical-db.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/rehearse-historical-db.ps1)**:
  - Companion manifest pairing diubah menjadi **exact deterministik** (`${dumpBaseName}_manifest.json`), menggantikan pemilihan acak file pertama.
  - Checksum mismatch pada dump atau manifest diubah dari sekadar `WARN` menjadi **Hard Fail** (`exit 1`) dengan pembuatan failure report autentik.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Menghapus seluruh blok pembuatan file JSON statis hardcoded dengan status `PASSED` dan angka buatan.
  - Mengintegrasikan pembacaan metrik dinamis langsung dari database test aktual kontainer Docker staging.

### 2. Wave 2 — Fail-Closed Production Restore & Pre-Deploy Backup (P0-02 & P1-07)
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - Fungsi `createNativePgDumpBackup` kini mengisolasi query pembacaan model Prisma dengan wrapper `safeFetch`. Hal ini menjamin bahwa database legacy (sebelum migrasi skema baru diterapkan) tetap dapat di-backup menggunakan native `pg_dump` tanpa risiko crash.
  - `ActivityLog` kini mencatat status `FAILED` jika backup lokal atau offsite gagal (P1-07).
- **[scripts/gms-production-restore.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-production-restore.ps1)**:
  - `EntityTableMap` diperluas dari 8 entitas menjadi **16 entitas manifest lengkap**.
  - Parsing count query diubah menjadi hard fail (`throw` jika query error / unparseable).
  - Snapshot live pra-restore diubah menjadi **MANDATORY** (proses promosi langsung dibatalkan jika snapshot gagal).
  - Verifikasi pasca-promosi diarahkan langsung ke `$LiveContainer`.
  - Penanganan error pada kompensasi rollback kini memeriksa `$LASTEXITCODE`.

### 3. Wave 3 — Schema-Aware Rollback & Multi-Service Watchdog (P0-03 & P1-04)
- **[scripts/deploy-with-rollback.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/deploy-with-rollback.ps1)**:
  - `ReleaseManifest` kini mencatat `schemaVersion: "1.0.0"`, `migrationChecksumsVerified: true`, dan `preDeployBackupId`.
  - Parser manifest kini mendukung `ciLocalImageId` maupun `digest` image.
- **[scripts/gms-autostart-watchdog.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-autostart-watchdog.ps1)**:
  - Ditambahkan pemeriksaan kesiapan kontainer frontend.
  - Ditambahkan probe HTTP aktual ke endpoint `/api/health`.

### 4. Wave 4 — Validasi Evidence, Atribusi createdBy, & Health Metrics (P1-08, P2-04, P2-06)
- **[backend/src/transactions/operation-log-correction.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/operation-log-correction.service.ts)**:
  - Validasi kepemilikan dan integritas `evidenceAttachmentId` per transaksi sebelum koreksi disimpan.
  - Atribusi `originalCreatedBy` memprioritaskan relasi `Transaction.createdBy`.
  - Normalisasi IP parser mendukung format IPv4 dan IPv6 (P2-04).
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - `lastBackupAgeHours` mengembalikan `null` (bukan 0) saat belum ada backup terverifikasi (P2-06).

---

## 🧪 Validasi Pengujian (Automated Unit Tests)

1. **[operation-log-correction.service.spec.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/operation-log-correction.service.spec.ts)**:
   - `should reject correction if evidenceAttachmentId does not belong to the transaction (P1-08)`: ✅ PASS
   - `should correctly attribute originalCreatedBy to Transaction.createdBy (P1-08)`: ✅ PASS
2. **[database-backup.service.spec.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.spec.ts)**:
   - `should return null for lastBackupAgeHours when no verified backup exists (P2-06)`: ✅ PASS
   - `should create native pg_dump backup even if legacy schema tables are missing (P0-02)`: ✅ PASS
