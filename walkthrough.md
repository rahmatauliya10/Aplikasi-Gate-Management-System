# Walkthrough — Remediasi P0 Blocker & Hardening Gate Management System v1.0.0

Dokumentasi ini merangkum seluruh perubahan kode dan perbaikan struktural yang diimplementasikan pada codebase untuk menutup temuan **P0 Blocker (P0-01, P0-02, P0-03)**, serta temuan **P1 (P1-04, P1-07, P1-08)** dan **P2 (P2-04, P2-06)** berdasarkan hasil Re-Audit 14 Agustus 2026.

---

## 🛠️ Ringkasan Perbaikan Teknis per Wave & File

### 1. Wave 1 — Integritas Historical Rehearsal & CI Evidence (P0-01)
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Mengaktifkan `set -Eeuo pipefail` untuk mencegah penyembunyian error pada pipeline shell.
  - Memperbaiki query kolom SQL dari `"commodityType"` menjadi `"processType"` (sesuai skema Prisma `Transaction.processType`).
  - Mengganti heredoc statis dengan eksekutor Node.js terisolasi yang memvalidasi setiap metrik secara numerik dan mengevaluasi threshold assertion secara dinamis (`tableCount >= 10`, `migrationCount >= 1`, `userCount >= 1`, `transactionCount >= 1`, `gbbCompletedCount >= 1`, `gspCompletedCount >= 1`, `gbjCompletedCount >= 1`).
  - Status `PASSED` hanya dihasilkan jika seluruh threshold terpenuhi; jika gagal, script menghasilkan `exit 1` dan mencegah pembuatan release artifact palsu.
- **[scripts/rehearse-historical-db.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/rehearse-historical-db.ps1)**:
  - Menambahkan validasi SHA-256 overall attachment archive (`checksums.attachmentsArchive`) terhadap manifest. Mismatch hash memicu hard-fail (`exit 1`) dan failure artifact autentik.

### 2. Wave 2 — Fail-Closed Production Restore & SafeFetch Error Discrimination (P0-02 & P1-07)
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - Memperbaiki `safeFetch`: hanya menangkap error `undefined_table` (kode Postgres `42P01` / Prisma `P2021` / relasi tidak ditemukan) untuk kompatibilitas skema legacy. Error koneksi, timeout, authorization, atau permission akan dilempar (`throw`) agar tidak menghasilkan manifest snapshot bernilai 0 palsu.
  - Pada `restoreFromPortableBundle`, ditambahkan pengecekan eksplisit `preRestoreManifest.localStatus === 'VERIFIED'` sebelum mengeksekusi restorasi database.
- **[scripts/gms-production-restore.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-production-restore.ps1)**:
  - Memperbaiki Phase State Machine: segera setelah `pg_restore` berhasil commit, state beralih ke `DB_COMMITTED_PENDING_ATTACHMENT` lalu `DURING_LIVE_VERIFICATION`.
  - Jika terjadi kegagalan verifikasi, migrasi, atau penukaran direktori attachment setelah database commit, blok `catch` secara otomatis mengeksekusi compensating rollback dari snapshot `$PreRestoreDbDump` dan memulihkan direktori `$UploadDir`.
  - Menambahkan verifikasi komprehensif 16 entitas manifest, pengecekan pelanggaran duplicate `isCurrent`, dan foreign key orphan checks langsung terhadap target database live sebelum menyatakan status `PASSED`.

### 3. Wave 3 — Coordinated Release Rollback & Multi-Service Watchdog (P0-03 & P1-04)
- **[scripts/deploy-with-rollback.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/deploy-with-rollback.ps1)**:
  - Memperluas pencarian `preDeployBackupId` ke seluruh lokasi direktori backup potensial (`backups/local`, `deploy/backups`, `backups`).
  - Mengikat metadata rilis dengan actual schema version, migration verification, dan backup provenance.
- **[scripts/gms-autostart-watchdog.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-autostart-watchdog.ps1)**:
  - Memperbaiki target probe HTTP endpoint `/api/health` dari port `3000` ke `3001` (sesuai konfigurasi container backend di `docker-compose.prod.yml`).
  - Menambahkan pengecekan kesiapan container Nginx / reverse proxy.
  - Mengubah penanganan kegagalan probe HTTP dari warning menjadi hard failure (`throw`), sehingga kegagalan readiness pada saat deployment memicu rollback otomatis.

### 4. Wave 4 — Evidence Attachment Integrity & Test Hardening (P1-08, P2-04, P2-06)
- **[backend/src/transactions/operation-log-correction.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/operation-log-correction.service.ts)**:
  - Memperketat validasi `evidenceAttachmentId`: mewajibkan record berstatus `isCurrent: true` dan memiliki hash `sha256` terverifikasi (tidak boleh null atau orphan).
- **[backend/src/transactions/operation-log-correction.service.spec.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/operation-log-correction.service.spec.ts)**:
  - Menambahkan unit test untuk penolakan evidence attachment yang tidak current atau tidak memiliki checksum SHA-256.
- **[backend/src/settings/database-backup.service.spec.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.spec.ts)**:
  - Menambahkan unit test untuk memastikan `safeFetch` melempar error koneksi/timeout dan tidak menghasilkan snapshot valid palsu.

---

## 🧪 Validasi Pengujian Kode (Unit Tests)

```typescript
// backend/src/transactions/operation-log-correction.service.spec.ts
✓ should reject correction if evidenceAttachmentId does not belong to the transaction (P1-08)
✓ should reject correction if evidenceAttachmentId lacks verified sha256 checksum (P1-08)
✓ should correctly attribute originalCreatedBy to Transaction.createdBy (P1-08)

// backend/src/settings/database-backup.service.spec.ts
✓ should return null for lastBackupAgeHours when no verified backup exists (P2-06)
✓ should create native pg_dump backup even if legacy schema tables are missing (P0-02)
✓ should throw error and fail backup if snapshot error is a transient connection error rather than missing table (P0-02)
```

---

## 📌 Status Rilis & Next Steps

Semua perbaikan kode untuk Wave 0, Wave 1, Wave 2, Wave 3, dan Wave 4 telah diintegrasikan pada repository lokal. Sesuai prinsip *Verification Before Completion*, status akhir produksi akan divalidasi melalui eksekusi pipeline CI exact-SHA dan staging rehearsal drill.
