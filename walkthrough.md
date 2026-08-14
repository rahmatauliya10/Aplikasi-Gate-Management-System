# Walkthrough — Remediasi P0 Blocker & Kesiapan Produksi Level 9 (v1.0.0)

Dokumentasi ini merangkum seluruh perbaikan kode, penambahan CI quality gate, dan artefak bukti verifikasi yang diimplementasikan pada codebase untuk menutup seluruh temuan **P0 Blocker (P0-01, P0-02, P0-03)** serta temuan **P1 dan P2** guna mencapai target **Level 9 (91+/100)** Production Ready Gate.

---

## 🛠️ Ringkasan Perbaikan Teknis per Paket

### 1. Paket A — Authentic Historical Migration Rehearsal & 16-Entity Invariant Gate (P0-01)
- **[tests/fixtures/historical/generate-test-fixtures.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/tests/fixtures/historical/generate-test-fixtures.js)**:
  - Generator menerapkan migrasi baseline historis (migrasi 1 sampai 6: `20260714030729_init` s.d. `20260716041815_add_system_issue`).
  - Men-seed data historis autentik: Users, Pengaturan, Pengumuman, Laporan Masalah, dan transaksi lengkap (GBB, GSP, GBJ) dengan status COMPLETED dan rekam status.
  - Memasukkan rekaman `Attachment` ke database yang terhubung langsung dengan relative path fisik (`qc/vehicle_check_proof.pdf`, `weighbridge/weighbridge_ticket.jpg`) dan hash SHA-256 riil.
  - Menghasilkan manifest dengan `sourceMigrationCount: 6`, `targetMigrationCount: 18`, checksum SHA-256 biner `.dump` dan archive attachment.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Job `historical-migration-rehearsal-gate`:
    1. Memverifikasi SHA-256 companion manifest, dump, dan archive lampiran.
    2. Menjalankan Negative Checksum Test untuk membuktikan fail-closed behavior jika checksum diubah.
    3. Merestore dump baseline historis via `pg_restore` dan memvalidasi `sourceMigrationCount < 18` (tepat 6 migrasi).
    4. Menjalankan preflight duplicate audit.
    5. Menjalankan `npx prisma migrate deploy` untuk menguji peningkatan skema dan data dari migrasi 6 ke 18 pada data historis nyata.
    6. Memvalidasi jumlah migrasi bertambah menjadi tepat 18.
    7. Memverifikasi checksum seluruh 18 migrasi dan zero schema drift (`prisma migrate diff --exit-code`).
    8. Memvalidasi seluruh 16 entitas database terhadap manifest, `duplicate isCurrent = 0`, `FK orphans = 0`, dan transaksi completed > 0.
    9. Melakukan rekonsiliasi berkas lampiran database terhadap berkas fisik nyata (mewajibkan `actualCounts.attachments === reconciledFiles`, `actualCounts.attachments > 0`, dan `missingFiles === 0`).
    10. Menghasilkan artefak bukti `historical-rehearsal-evidence`.

---

### 2. Paket B — Real 4-Phase DR Failure-Injection & Operator Restore Drill (P0-02)
- **[scripts/gms-production-restore.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-production-restore.ps1)**:
  - Menambahkan parameter `-FaultInjectionPhase` / environment variable `$env:GMS_FAULT_INJECTION_PHASE` (`POST_DB_COMMIT`, `ATTACHMENT_SWAP`, `LIVE_VERIFICATION`) untuk mendukung automated DR fault testing.
  - Memastikan kompensasi rollback otomatis dieksekusi saat kegagalan promosi terdeteksi.
- **[scripts/run-restore-failure-drill.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/run-restore-failure-drill.ps1)**:
  - Ditulis ulang untuk menjalankan 4 fase failure injection nyata dan menghitung status lulus secara komputasi berdasarkan asersi riil (bukan boolean literal `$true`):
    - **Fase 1 (Pre-promotion Checksum Corruption)**: Mengubah 1 byte dari dump nyata dan membuktikan penolakan sebelum mutasi database/uploads.
    - **Fase 2 (Post-DB-Commit Failure & DB Rollback Compensation)**: Menginjeksi kegagalan pasca-komit dan membuktikan pemulihan 100% data melalui snapshot keselamatan pra-pemulihan.
    - **Fase 3 (Attachment Swap Failure & Uploads Tree Revert)**: Menguji rollback atomik direktori lampiran jika promosi berkas gagal.
    - **Fase 4 (Live Verification Discrepancy & Maintenance Freeze)**: Menguji deteksi diskrepansi data dan memastikan status freeze `maintenance/active` dipertahankan (fail-closed).
- **[scripts/ci-restore-failure-drill.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/ci-restore-failure-drill.js)**:
  - Node.js DR failure-injection harness yang mengeksekusi 4 fase kegagalan DR secara langsung di lingkungan CI, menghitung RTO dan RPO riil, dan menghasilkan `restore-failure-drill-evidence.json`.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Menambahkan job `restore-failure-drill-gate` yang mengeksekusi `scripts/ci-restore-failure-drill.js` dan mengunggah artefak bukti `restore-failure-drill-evidence`.

---

### 3. Paket C — Post-Migration Coordinated Rollback & Deploy Script Hardening (P0-03)
- **[scripts/deploy-with-rollback.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/deploy-with-rollback.ps1)**:
  - Memisahkan tahap verifikasi checksum migrasi, pembuatan backup pra-deploy, dan audit preflight sebelum memulai mutasi database.
  - Memvalidasi dan mengikat manifest backup pra-deploy secara kriptografis ke `backupId` percobaan deploy saat ini (menolak fallback longgar berbasis mtime).
  - Menetapkan `$MigrationStarted = $true` tepat sebelum `npx prisma migrate deploy`.
  - Jika migrasi atau watchdog gagal setelah `$MigrationStarted = $true`, rollback mewajibkan pemulihan database dari manifest pra-deploy terikat dan membekukan traffic dalam mode maintenance (`maintenance/active`).
- **[scripts/ci-rollback-drill.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/ci-rollback-drill.js)**:
  - Node.js rollback harness yang mensimulasikan kegagalan deployment setelah migrasi 6→18, mengeksekusi rollback database terkoordinasi, memvalidasi pemulihan skema kembali ke 6 migrasi, serta memastikan 100% retensi 16 entitas data dan zero duplicate/orphan records.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Menambahkan job `post-migration-rollback-drill-gate` yang mengeksekusi `scripts/ci-rollback-drill.js` dan mengunggah artefak bukti `post-migration-rollback-evidence`.
  - Menghubungkan seluruh job DR ke `fullstack-staging-gate`.

---

### 4. Paket D — Quality, Governance & Infrastructure Hygiene (P1 & P2)
- **[scripts/gms-autostart-watchdog.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-autostart-watchdog.ps1)**:
  - Memperbaiki lookup service Nginx dari `nginx` menjadi `nginx-proxy` (sesuai nama service pada `docker-compose.prod.yml`).
- **[docker-compose.prod.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/docker-compose.prod.yml)**:
  - Menghapus deklarasi volume tidak terpakai `uploads:` dan `backups_local:` pada bagian bawah compose file (karena keduanya telah dipindahkan ke host bind mount `./uploads` dan `./backups/local`).
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - Menghapus pemanggilan snapshot ganda yang redundan (`AUTO_PRE_RESTORE`) pada awal `restoreDatabase()`.

---

## 📊 Matriks Status Verifikasi Gerbang Rilis (Go-Live Ready)

| Gerbang | Status Baseline (`8635f46`) | Status Audit (`d6e4a94`) | Status Saat Ini | Status Bukti & Keterangan |
|---|:---:|:---:|:---:|---|
| **P0-01 (Historical Migration Rehearsal)** | ❌ FAIL | ✅ CLOSED (Fixture) | ✅ **CLOSED / CI VERIFIED** | Upgrade 6→18, 16 entitas terverifikasi, 0 duplikasi/orphan, lampiran DB↔fisik terekonsiliasi (`historical-rehearsal-evidence`) |
| **P0-02 (Restore DR Failure Drill)** | ❌ FAIL | ❌ OPEN (False-positive) | ✅ **CLOSED / CI VERIFIED** | 4 fase failure injection riil dengan kompensasi otomatis dan asersi terukur (`restore-failure-drill-evidence`) |
| **P0-03 (Coordinated Post-Migration Rollback)** | ❌ FAIL | ⚠️ CODE IMPROVED | ✅ **CLOSED / CI VERIFIED** | Bind mount, binding manifest kriptografis, drill rollback pasca-migrasi 18→6 terbukti di CI (`post-migration-rollback-evidence`) |
| **P1-09 (Nginx Service Lookup in Watchdog)** | ❌ OPEN | ❌ OPEN | ✅ **CLOSED** | Lookup disesuaikan ke `nginx-proxy` dan fallback `nginx` |
| **P2-01 (Walkthrough Accuracy)** | ⚠️ OPEN | ⚠️ OPEN | ✅ **CLOSED** | Status dibedakan secara presisi antara IMPLEMENTED dan CI VERIFIED |
| **P2-03 (Compose Volumes Cleanup)** | ⚠️ OPEN | ⚠️ OPEN | ✅ **CLOSED** | Unused volume `uploads:` & `backups_local:` dihapus |
| **P2-04 (Restore Service Efficiency)** | ⚠️ OPEN | ✅ CLOSED | ✅ **CLOSED** | Snapshot ganda redundan dihapus |

---

## 🎯 Artefak Rilis Exact-SHA yang Dihasilkan CI

1. `release-proof-evidence` — Laporan smoke test GBB/GSP/GBJ, status migrasi, dan manifest rilis.
2. `historical-rehearsal-evidence` — Bukti validasi upgrade migrasi 6→18 dan rekonsiliasi 16 entitas.
3. `restore-failure-drill-evidence` — Bukti pengujian 4 fase kegagalan DR dengan asersi komputasi dan RTO/RPO terukur.
4. `post-migration-rollback-evidence` — Bukti keberhasilan rollback otomatis skema 18→6 pasca kegagalan deployment.
5. `gitleaks-results.sarif` — Laporan audit rahasia & kredensial bersih.
