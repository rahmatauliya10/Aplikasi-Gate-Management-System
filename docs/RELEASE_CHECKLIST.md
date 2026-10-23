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

### Tahap 3: Eksekusi Deployment (Zero-Rebuild)
- [ ] **Pre-Deployment Backup:** Jalankan backup snapshot sebelum rilis:
  ```bash
  npm run db:backup:pre-deploy
  ```
- [ ] **Migration Checksum Reconciliation:**
  ```bash
  node scripts/check-migration-checksums.js
  ```
- [ ] **Prisma Migration Deploy:**
  ```bash
  npx prisma migrate deploy
  ```
- [ ] **Deploy Containers by Image Digest:** Jalankan container tanpa rebuild lokal:
  ```powershell
  docker compose -f docker-compose.prod.yml up -d --no-build
  ```

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

### Prosedur B: Rollback Versi Aplikasi (Image-Only — Tanpa Perubahan Skema DB)
Gunakan prosedur ini HANYA jika migrasi forward belum dijalankan atau tidak ada perubahan skema database:
1. **Aktifkan Maintenance Mode (Write-Freeze):**
   ```bash
   touch maintenance.flag
   ```
2. **Jalankan Rollback Container ke Image Digest Stabil Sebelumnya:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
     -RollbackOnly `
     -NoSchemaChangeVerified `
     -PreviousReleaseTag "stable" `
     -PreviousBackendDigest "sha256:<digest_lama>" `
     -PreviousFrontendDigest "sha256:<digest_lama>" `
     -PreviousMigratorDigest "sha256:<digest_lama>" `
     -ComposeFile "docker-compose.prod.yml"
   ```
3. **Verifikasi Layanan & Nonaktifkan Maintenance Mode:**
   ```bash
   node scripts/prod-smoke-readonly.js
   rm maintenance.flag
   ```

### Prosedur C: Pemulihan Skema Database & Lampiran Fisik (Post-Migration Recovery)
Gunakan prosedur ini jika migrasi forward telah terjadi dan skema database harus dikembalikan ke snapshot pre-deploy:
1. **Aktifkan Maintenance Mode (Write-Freeze) & Hentikan Penulis Data:**
   ```bash
   touch maintenance.flag
   docker compose -f docker-compose.prod.yml stop backend
   ```
2. **Set Izin Restore pada Database Target:**
   ```powershell
   docker exec gate-system-postgres psql -U postgres -d gms -c "UPDATE \"AppSetting\" SET value = 'TRUE' WHERE key = 'GMS_RESTORE_ALLOWED';"
   ```
3. **Eksekusi Pemulihan Database & Lampiran melalui Operator Control Plane:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\gms-production-restore.ps1 `
     -ManifestPath "backups\local\pre_deploy_backup_<ID>\manifest.json" `
     -ExpectedEnvironmentId "GMS-PROD-SJA-01" `
     -ExpectedInstallationUuid "<UUID_TARGET>" `
     -LiveContainer "gate-system-postgres" `
     -LiveDbName "gms" `
     -Force
   ```
4. **Boot Container Versi Sebelumnya & Jalankan Smoke Test Aman:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-with-rollback.ps1 `
     -RollbackOnly `
     -RollbackManifestPath "backups\local\pre_deploy_backup_<ID>\manifest.json" `
     -PreviousReleaseTag "stable" `
     -PreviousBackendDigest "sha256:<digest_lama>" `
     -PreviousFrontendDigest "sha256:<digest_lama>" `
     -PreviousMigratorDigest "sha256:<digest_lama>" `
     -ComposeFile "docker-compose.prod.yml"

   node scripts/prod-smoke-readonly.js
   rm maintenance.flag
   ```

### Prosedur D: Disaster Recovery Simulation & Rollback Drill (STAGING ONLY)
Pengujian simulasi kegagalan dan fault injection HANYA diizinkan pada container pengujian terisolasi:
```powershell
# HANYA PADA ENVIRONMENT STAGING / TEST HARNESS DEDIKASI
powershell -ExecutionPolicy Bypass -File .\scripts\run-deployment-rollback-drill.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-restore-failure-drill.ps1
```
