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
- [ ] **DR Restore Drill Evidence:** Drill pemulihan NAS (`run-nas-restore-drill.ps1`) lulus dengan RTO ≤ 30 menit.

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
- [ ] **Cross-Stack Smoke Test:**
  ```bash
  node scripts/ci-e2e-smoke.js
  ```
- [ ] **Health Monitor Registration:** Task Scheduler `GMS_Production_HealthMonitor` aktif setiap 5 menit.
- [ ] **Release Evidence Archiving:** Berkas manifest dan log rilis diarsipkan ke `artifacts/release-proof/`.

---

## 3. Standard Rollback Runbook (Rencana Kontingensi)

Jika deployment mengalami kegagalan pada tahap migrasi, health probe, atau smoke test:

1. **Aktifkan Maintenance Mode (Write-Freeze):**
   ```bash
   touch maintenance.flag
   ```
2. **Kembalikan Skema Database dari Pre-Deploy Backup:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\run-deployment-rollback-drill.ps1
   ```
3. **Kembalikan Container Image ke Versi Stabil Sebelumnya:**
   ```powershell
   docker compose -f docker-compose.prod.yml up -d --no-build
   ```
4. **Hapus Maintenance Mode & Jalankan Smoke Test Ulang:**
   ```bash
   rm maintenance.flag
   node scripts/ci-e2e-smoke.js
   ```
