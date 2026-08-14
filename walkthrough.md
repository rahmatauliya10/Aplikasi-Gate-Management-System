# Walkthrough — Remediasi P0 Blocker & Kesiapan Produksi (v1.0.0)

Dokumentasi ini merangkum seluruh perbaikan kode, penambahan CI quality gate, dan status artefak bukti verifikasi yang diimplementasikan pada codebase untuk menutup temuan audit data-safety menuju target **Level 9 (91+/100)** Production Ready Gate.

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

### 2. Paket B — DR Failure-Injection & Operator Restore Hardening (P0-02)
- **[scripts/gms-production-restore.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-production-restore.ps1)**:
  - Menambahkan parameter `-FaultInjectionPhase` / environment variable `$env:GMS_FAULT_INJECTION_PHASE` (`POST_DB_COMMIT`, `ATTACHMENT_SWAP`, `LIVE_VERIFICATION`) untuk mendukung automated DR fault testing.
  - Memastikan kompensasi rollback otomatis dieksekusi saat kegagalan promosi terdeteksi dan traffic tetap terkunci dalam mode maintenance (`maintenance/active`).
- **[scripts/run-restore-failure-drill.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/run-restore-failure-drill.ps1)**:
  - Diharden untuk production/staging environment: menghapus seluruh fallback soft PASS; kegagalan fixture atau fault rejection wajib hard-fail.
  - Menghitung RPO dan RTO nyata dari durasi dan timestamp backup.
- **[scripts/ci-restore-failure-drill.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/ci-restore-failure-drill.js)**:
  - Menghapus silent error swallowing (`catch -> 0`). Query SQL yang gagal atau non-numeric melempar hard error.
  - Memvalidasi pemulihan **100% dari seluruh 16 entitas database** setelah compensating rollback pada Fase 2.
  - Memvalidasi rekonsiliasi hash rekursif seluruh pohon direktori lampiran pada Fase 3.
  - Mengukur RPO dan RTO riil secara komputasi.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Job `restore-failure-drill-gate` mengeksekusi `scripts/ci-restore-failure-drill.js` dan mengunggah artefak bukti `restore-failure-drill-evidence`.

---

### 3. Paket C — Post-Migration Coordinated Rollback & Deploy Hardening (P0-03)
- **[scripts/deploy-with-rollback.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/deploy-with-rollback.ps1)**:
  - Memisahkan tahap verifikasi checksum migrasi, pembuatan backup pra-deploy, dan audit preflight sebelum memulai mutasi database.
  - Memvalidasi dan mengikat manifest backup pra-deploy secara kriptografis ke `backupId` percobaan deploy saat ini (menolak fallback longgar berbasis mtime).
  - Menetapkan `$MigrationStarted = $true` tepat sebelum `npx prisma migrate deploy`.
  - Jika migrasi atau watchdog gagal setelah `$MigrationStarted = $true`, rollback mewajibkan pemulihan database dari manifest pra-deploy terikat dan membekukan traffic dalam mode maintenance (`maintenance/active`).
  - Mode `-RollbackOnly` wajib menyertakan `-RollbackManifestPath` atau `-NoSchemaChangeVerified`.
- **[scripts/ci-rollback-drill.js](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/ci-rollback-drill.js)**:
  - Menghapus silent error swallowing (`catch -> 0`).
  - Memvalidasi pemulihan skema kembali ke 6 migrasi, serta memastikan **100% retensi seluruh 16 entitas data**, zero duplicate `isCurrent`, dan zero orphan foreign key.
  - Menghitung RPO riil dalam menit dari timestamp manifest backup.
- **[.github/workflows/ci.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/.github/workflows/ci.yml)**:
  - Job `post-migration-rollback-drill-gate` mengeksekusi `scripts/ci-rollback-drill.js` dan mengunggah artefak bukti `post-migration-rollback-evidence`.

---

### 4. Paket D — Quality, Governance & Infrastructure Hygiene (P1 & P2)
- **[scripts/gms-autostart-watchdog.ps1](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/scripts/gms-autostart-watchdog.ps1)**:
  - Memperbaiki lookup service Nginx dari `nginx` menjadi `nginx-proxy` (sesuai nama service pada `docker-compose.prod.yml`).
- **[docker-compose.prod.yml](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/docker-compose.prod.yml)**:
  - Menghapus deklarasi volume tidak terpakai `uploads:` dan `backups_local:` pada bagian bawah compose file.
- **[backend/src/settings/database-backup.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/settings/database-backup.service.ts)**:
  - Menghapus pemanggilan snapshot ganda yang redundan (`AUTO_PRE_RESTORE`) pada awal `restoreDatabase()`.

---

## 📊 Matriks Status Verifikasi Gerbang Rilis (Go-Live Ready)

| Gerbang | Status Audit Baseline | Status CI Component Gate | Status Operator Lapangan | Status Bukti & Keterangan |
|---|:---:|:---:|:---:|---|
| **P0-01 (Historical Migration Rehearsal)** | ❌ FAIL | ✅ **PASS** | ✅ **READY** | Upgrade 6→18, 16 entitas terverifikasi, 0 duplikasi/orphan, lampiran DB↔fisik terekonsiliasi (`historical-rehearsal-evidence`) |
| **P0-02 (Restore DR Failure Drill)** | ❌ OPEN | ✅ **COMPONENT PASS** | ⚠️ **OPEN (PROD DRILL)** | 4 fase failure injection riil pada PostgreSQL service; operator script siap dieksekusi di host staging/prod |
| **P0-03 (Coordinated Post-Migration Rollback)** | ⚠️ CODE IMPROVED | ✅ **COMPONENT PASS** | ⚠️ **OPEN (PROD DRILL)** | Rollback skema 18→6 & 16 entitas 100% terbukti di CI; deploy operator siap dieksekusi di host staging/prod |
| **P1-07 (Compensating Restore Architecture)** | ⚠️ OPEN | ✅ **CODE PASS** | ✅ **DOCUMENTED** | Model pemulihan didefinisikan sebagai Compensating Restore dengan Fail-Closed Maintenance Freeze |
| **P1-08 (Strict Query Execution)** | ❌ OPEN HIGH | ✅ **CLOSED** | ✅ **CLOSED** | Silent error swallowing (`catch -> 0`) dihilangkan dari seluruh test harness |
| **P1-09 (Nginx Service Lookup)** | ❌ OPEN | ✅ **CLOSED** | ✅ **CLOSED** | Lookup disesuaikan ke `nginx-proxy` dan fallback `nginx` |
| **P1-14 (RollbackOnly Governance)** | ❌ OPEN | ✅ **CLOSED** | ✅ **CLOSED** | `-RollbackOnly` mewajibkan `-RollbackManifestPath` atau `-NoSchemaChangeVerified` |
| **P2-01 (Walkthrough Accuracy)** | ⚠️ OPEN | ✅ **CLOSED** | ✅ **CLOSED** | Status dibedakan secara jujur antara Component Rehearsal Pass dan Production Operator Drill |
| **P2-02 (Trailing Whitespace)** | ⚠️ OPEN | ✅ **CLOSED** | ✅ **CLOSED** | Trailing whitespace dibersihkan pada seluruh delta skrip |

---

## 🚦 Status Kesiapan Rilis & Batas Penggunaan

| Mode Penggunaan | Keputusan | Persyaratan |
|---|:---:|---|
| **Local Development** | ✅ **BOLEH** | Siap digunakan |
| **Staging / UAT** | ✅ **BOLEH** | Menggunakan data sintetis / sanitized |
| **Pilot Internal Non-Critical** | ⚠️ **BERSYARAT** | Backup manual terverifikasi, maintenance window terjadwal, operator rollback standby |
| **Production System of Record** | 🛑 **NO-GO** | Ditunda hingga 2 drill operator end-to-end (`run-restore-failure-drill.ps1` dan `deploy-with-rollback.ps1`) dieksekusi pada target host release candidate |

**Skor Kesiapan Saat Ini:** **89/100 (Level 8.9)**.
Target **Level 9 (91+/100)** tercapai segera setelah pengujian operator PowerShell dieksekusi pada environment target rilis.

---

## 🎯 Artefak Rilis Exact-SHA yang Dihasilkan CI

1. `release-proof-evidence` — Laporan smoke test GBB/GSP/GBJ, status migrasi, dan manifest rilis.
2. `historical-rehearsal-evidence` — Bukti validasi upgrade migrasi 6→18 dan rekonsiliasi 16 entitas.
3. `restore-failure-drill-evidence` — Bukti pengujian 4 fase kegagalan DR dengan asersi komputasi 16 entitas dan RTO/RPO terukur.
4. `post-migration-rollback-evidence` — Bukti keberhasilan rollback otomatis skema 18→6 pasca kegagalan deployment dengan 100% retensi 16 entitas.
5. `gitleaks-results.sarif` — Laporan audit rahasia & kredensial bersih.
