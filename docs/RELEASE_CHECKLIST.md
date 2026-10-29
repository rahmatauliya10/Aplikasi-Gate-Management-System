# GMS Production Release Governance, Checklist & Proof Framework

**Standard:** NIST SP 800-64 Release Governance & ISO/IEC/IEEE 12207 Software Life Cycle Processes  
**Target Application:** Gate Management System (GMS)  
**Version:** Production Standard v1.0.0  

---

## 1. The Three Core Production Questions (Prinsip Tiga Jawaban Mutlak)

Setiap versi yang dirilis ke production **WAJIB** mampu menjawab tiga pertanyaan ini dalam waktu < 2 menit:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. KODE APA YANG SEDANG BERJALAN?                                           │
│    Git Commit SHA, Release Tag, dan Image Digest SHA-256 (@sha256:...)     │
│                                                                             │
│ 2. DATABASE BERADA DI SKEMA / VERSI APA?                                    │
│    Urutan migrasi Prisma aktif, migration checksum inventory, & count.      │
│                                                                             │
│ 3. BAGAIMANA CARA MENGEMBALIKANNYA JIKA TERJADI KEGAGALAN (ROLLBACK)?      │
│    ID Backup Pre-Deploy, script rollback teruji, & durasi RTO target.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Standard Pre-Flight Release Checklist

Petugas rilis (Release Engineer / SRE / Lead Dev) wajib mencentang seluruh gerbang sebelum deployment:

### Tahap 1: Persiapan & Source Gate
- [ ] **Branch Protection:** Kode berasal dari branch `main` / `master` yang terlindungi (wajib PR + review).
- [ ] **CI Pipeline Green:** Seluruh job GitHub Actions (`ci.yml`) lulus 100% pada **exact commit SHA** rilis.
- [ ] **Dependency Security Audit:** `npm audit --omit=dev --audit-level=high` menghasilkan **0 High / Critical Vulnerability**.
- [ ] **Supply Chain Provenance:** Checksums rilis dihasilkan (`RELEASE_CHECKSUMS.sha256` & `release_manifest_provenance.json`).

### Tahap 2: Staging & UAT Validation
- [ ] **UAT Sign-Off:** Lembar pengesahan UAT (`docs/UAT_TEST_PROTOCOL.md`) telah ditandatangani oleh PIC Operasional.
- [ ] **Correction & Reopen Test:** Skenario koreksi data dan reopen workflow telah diverifikasi.
- [ ] **DR Restore Drill Evidence:** Drill pemulihan NAS (`run-nas-restore-drill.ps1`) lulus dengan RTO target (Target Operasional: ≤ 30 Menit [PENDING IT APPROVAL]; Target default drill script: 600 detik / 10 menit).

### Tahap 3: Eksekusi Deployment (Unified Zero-Rebuild Orchestrator)
> [!IMPORTANT]
> Seluruh eksekusi deployment diwajibkan melalui satu orchestrator resmi: `deploy-with-rollback.ps1`.
> Dilarang menjalankan perintah migrasi atau backup secara manual terpisah pada saat deployment aktif untuk mencegah 'dual deployment paths'.

- [ ] **Deployment Preflight & Execution:**
  Jalankan orchestrator deployment resmi:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
    -TargetReleaseTag "v1.0.0" `
    -PreviousReleaseTag "stable" `
    -PreviousBackendDigest "sha256:<digest_lama>" `
    -PreviousFrontendDigest "sha256:<digest_lama>" `
    -PreviousMigratorDigest "sha256:<digest_lama>" `
    -ComposeFile "docker-compose.prod.yml" `
    -RequireDigest
  ```
  *Langkah internal yang diverifikasi secara otomatis oleh orchestrator:*
  1. Validasi identitas target (`AppSetting` DB ID `GMS-PROD-SJA-01`, Installation UUID).
  2. Pembuatan snapshot pre-deploy database & lampiran ke `backups/local/pre_deploy_backup_<ID>`.
  3. Verifikasi exact migration checksum reconciliation.
  4. Eksekusi database migration melalui container migrator terisolasi.
  5. Deployment container aplikasi dengan image digest terverifikasi (`--no-build`).
  6. Eksekusi smoke test otomatis pasca-boot.

### Tahap 4: Post-Deployment Smoke & Health Verification
- [ ] **API Health Readiness:** Akses `https://<FQDN>/api/health/readiness` -> HTTP `200 OK`.
- [ ] **Production Non-Mutating Smoke Test:**
  ```bash
  node scripts/prod-smoke-readonly.js
  ```
- [ ] **Health Monitor Registration:** Task Scheduler `GMS_Production_HealthMonitor` aktif setiap 5 menit.
- [ ] **Release Evidence Archiving:** Berkas manifest dan log rilis diarsipkan ke `artifacts/release-proof/`.

---

## 3. Standard Operational Recovery Runbook (Pemisahan 4 Prosedur)

> [!CAUTION]
> **DILARANG** menjalankan script drill / fault-injection (`run-deployment-rollback-drill.ps1` atau `run-restore-failure-drill.ps1`) pada server produksi aktif! Script drill hanya boleh dijalankan di environment staging / test harness terisolasi.

### Prosedur A: Deployment Normal Terkoordinasi
Gunakan script deployment resmi yang otomatis membuat snapshot backup pre-deploy dan mengelola rollback bila startup container gagal:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
  -TargetReleaseTag "v1.0.0" `
  -PreviousReleaseTag "stable" `
  -PreviousBackendDigest "sha256:<digest_lama>" `
  -PreviousFrontendDigest "sha256:<digest_lama>" `
  -PreviousMigratorDigest "sha256:<digest_lama>" `
  -ComposeFile "docker-compose.prod.yml" `
  -RequireDigest
```

### Prosedur B: Rollback Versi Aplikasi (Image-Only — Terbukti Skema Kompatibel)
Gunakan prosedur ini HANYA jika release manifest membuktikan tidak ada migrasi skema baru sejak versi sebelumnya:

1. **Siapkan Token Autentikasi Read-Only untuk Smoke Test (Administrative Provisioning):**
   > [!NOTE]
   > `prod-smoke-readonly.js` adalah runner uji 100% non-mutatif (GET/HEAD/OPTIONS).
   > Memanggil endpoint login backend memperbarui `lastLoginAt`, `refreshTokenHash`, dan menambahkan audit log `LOGIN_SUCCESS`. Oleh karena itu, penerbitan token dipisahkan sebagai langkah provisioning administratif oleh operator/IT:
   ```powershell
   # Sediakan kredensial akun khusus read-only (tanpa fallback hardcoded):
   $env:SMOKE_OPERATOR_USER = "operator_readonly"
   $env:SMOKE_OPERATOR_PASSWORD = "PasswordKhususReadOnly123!"
   $env:SMOKE_ACCESS_TOKEN = (node scripts/generate-smoke-token.js)
   ```
   *(Atau masukkan token JWT operator read-only yang valid dan telah disetujui IT secara langsung ke `$env:SMOKE_ACCESS_TOKEN`)*

2. **Jalankan Rollback Container ke Image Digest Stabil Sebelumnya:**
   Eksekusi orchestrator pemulihan tunggal:
   ```powershell
   # Script secara ketat memvalidasi inventori migrasi database terhadap previous release manifest
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
     -RollbackOnly `
     -NoSchemaChangeVerified `
     -PreviousReleaseTag "stable" `
     -PreviousBackendDigest "sha256:<digest_lama>" `
     -PreviousFrontendDigest "sha256:<digest_lama>" `
     -PreviousMigratorDigest "sha256:<digest_lama>" `
     -ComposeFile "docker-compose.prod.yml"
   ```

3. **Otomatisasi Pembukaan Trafik (DILARANG Menghapus Flag Manual):**
   - Orchestrator secara otomatis mengaktifkan write-freeze `maintenance/active`, menukar image container, menjalankan watchdog, dan mengeksekusi smoke test ketat (`node scripts/prod-smoke-readonly.js --require-passed`).
   - File `maintenance/active` dan `maintenance.flag` **dihapus secara otomatis oleh orchestrator HANYA JIKA** smoke test membuktikan verdict `PASSED` (100% uji lulus termasuk authenticated session probe).
   - > [!CAUTION]
     > **DILARANG KERAS** menghapus file `maintenance/active` secara manual (`rm -f maintenance/active`). Jika smoke test menghasilkan verdict `PARTIAL` atau `FAILED`, pemeliharaan tetap aktif secara fail-closed untuk melindungi integritas transaksi dan data gudang pabrik.

---

### Prosedur C: Pemulihan Skema Database & Lampiran Fisik (Post-Migration Recovery)
Gunakan prosedur ini jika migrasi forward telah terjadi dan skema database harus dikembalikan ke snapshot pre-deploy:

> [!IMPORTANT]
> **SINGLE ORCHESTRATOR MANDATE:** Seluruh pemulihan skema dan container versi stabil dieksekusi melalui **satu orchestrator pemulihan tunggal** (`deploy-with-rollback.ps1 -RollbackOnly`).
> Operator **DILARANG** menjalankan `gms-production-restore.ps1` secara manual sebelum `deploy-with-rollback.ps1`. Orchestrator `deploy-with-rollback.ps1` secara otomatis memanggil restore database tepat satu kali pada fase `RESTORE_REQUIRED` dan secara ketat menolak restore ganda (`RESTORE_DONE`).

1. **Set Izin Restore pada Database Target (Otorisasi Khusus PIC):**
   ```powershell
   docker exec gate-system-postgres psql -U postgres -d gms -c "UPDATE \"AppSetting\" SET value = 'TRUE' WHERE key = 'GMS_RESTORE_ALLOWED';"
   ```

2. **Siapkan Token Autentikasi Read-Only untuk Smoke Test:**
   ```powershell
   $env:SMOKE_OPERATOR_USER = "operator_readonly"
   $env:SMOKE_OPERATOR_PASSWORD = "PasswordKhususReadOnly123!"
   $env:SMOKE_ACCESS_TOKEN = (node scripts/generate-smoke-token.js)
   ```

3. **Eksekusi Pemulihan Terpadu (Single Orchestrator):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
     -RollbackOnly `
     -RollbackManifestPath "backups\local\pre_deploy_backup_<ID>\manifest.json" `
     -PreviousReleaseTag "stable" `
     -PreviousBackendDigest "sha256:<digest_lama>" `
     -PreviousFrontendDigest "sha256:<digest_lama>" `
     -PreviousMigratorDigest "sha256:<digest_lama>" `
     -ComposeFile "docker-compose.prod.yml"
   ```
   *Alur Otomatis yang Dilakukan Orchestrator:*
   - `PRECHECK`: Memvalidasi integritas file backup, manifest, dan kesesuaian target environment.
   - `FREEZE`: Mengaktifkan write-freeze `maintenance/active` dan menghentikan seluruh proses penulis data (`backend` & `migrator`).
   - `RESTORE_REQUIRED`: Memanggil `gms-production-restore.ps1` tepat satu kali. Menolak restore kedua jika dipanggil ulang.
   - `IMAGE_SWITCH`: Menghidupkan kembali container aplikasi dengan image digest stabil sebelumnya.
   - `HEALTH_VERIFIED`: Menjalankan watchdog dan smoke test read-only (`node scripts/prod-smoke-readonly.js --require-passed`).

4. **Pembukaan Trafik Otomatis Berbasis Bukti:**
   Trafik dibuka (`maintenance/active` dicabut) **secara otomatis oleh orchestrator** HANYA setelah smoke test membuktikan verdict `PASSED`. Dilarang menghapus flag secara manual.

> [!NOTE]
> Prosedur `gms-production-restore.ps1` standalone hanya digunakan untuk skenario Disaster Recovery murni (misal: kerusakan disk data saat image aplikasi tidak mengalami perubahan/rollback).


### Prosedur D: Disaster Recovery Simulation & Rollback Drill (STAGING ONLY)
Pengujian simulasi kegagalan dan fault injection HANYA diizinkan pada container pengujian terisolasi:
```powershell
# HANYA PADA ENVIRONMENT STAGING / TEST HARNESS DEDIKASI
powershell -ExecutionPolicy Bypass -File .\scripts\run-deployment-rollback-drill.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-restore-failure-drill.ps1
```
