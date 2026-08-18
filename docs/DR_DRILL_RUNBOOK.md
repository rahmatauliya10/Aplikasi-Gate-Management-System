# GMS Disaster Recovery (DR) & Rollback Drill Runbook

## Overview
Dokumen ini menjelaskan prosedur resmi pelaksanaan Disaster Recovery (DR) Drill dan Deployment Rollback Drill pada lingkungan Windows Server dengan Rancher Desktop (Moby Engine) sesuai standar NIST SP 800-34 Rev.1.

---

## Prasyarat Operasional
1. **Sistem Operasi**: Windows Server 2022 / Windows 11 Pro dengan PowerShell 5.1+ atau PowerShell 7+.
2. **Container Runtime**: Rancher Desktop (Moby Engine) aktif dan responsif.
3. **Database Backup**: Minimal terdapat 1 file backup `.dump` dan manifest `_manifest.json` yang valid di direktori `backups/local/`.
4. **Izin Eksekusi**: PowerShell dijalankan dengan hak administrator (`Run as Administrator`).

---

## Prosedur Eksekusi Otomatis

Jalankan perintah berikut pada terminal PowerShell:

```powershell
Set-Location "d:\Data Kacong\Antigravity Project\Aplikasi Gate Management System"
powershell -ExecutionPolicy Bypass -File scripts/run-full-dr-evidence-drill.ps1
```

---

## Langkah-Langkah Verifikasi Internal
Orchestrator akan menjalankan verifikasi bertahap:

1. **Host & Platform Discovery**:
   - Mendeteksi Git Commit SHA, versi Windows, hostname, dan versi Docker/Rancher.
   - Mengambil digest immutable dari container aktif (`gms-backend`, `gms-frontend`).

2. **Actual Restore Drill (`run-actual-restore-drill.ps1`)**:
   - Menjalankan container PostgreSQL terisolasi (`gms-dr-postgres-*`) pada port 5434.
   - Melakukan `pg_restore` fisik dari snapshot backup terbaru.
   - Memvalidasi 16 entitas database terhadap manifest (100% exact row count match).
   - Memvalidasi data invariant (0 duplikasi `isCurrent=true`, 0 orphan FK).
   - Membongkar dan merekonsiliasi berkas fisik lampiran (SHA-256 integrity match).
   - Menghancurkan container sementara secara bersih.

3. **Deployment Rollback Drill (`run-deployment-rollback-drill.ps1`)**:
   - Melakukan simulasi kegagalan setelah migrasi forward (`AFTER_MIGRATION`).
   - Membekukan transaksi (`maintenance mode`).
   - Mengembalikan skema database dan physical uploads ke baseline pre-deploy.
   - Memverifikasi kesehatan container (`Backend`, `Frontend`, `Nginx` = healthy).
   - Memastikan Nginx fail-closed verdict gate aktif.

4. **Cross-Stack Business Smoke (`ci-e2e-smoke.js`)**:
   - Menguji alur otentikasi login.
   - Menguji transaksi penuh GBB, GSP, GBJ.
   - Menguji operasi koreksi log (happy-path).

---

## Bukti Audit (Evidence Artifacts)
Setelah drill selesai, artefak bukti akan disimpan di:
- `artifacts/release-proof/full-dr-launch-evidence.json`
- `artifacts/release-proof/deployment-rollback-operator-evidence.json`
- `C:\GMS_Logs\full_dr_evidence_drill.log`

---

## Penanganan Masalah (Troubleshooting)
- Jika Docker Daemon tidak merespons: Jalankan `rdctl start --container-engine moby` dan tunggu 30 detik.
- Jika checksum dump mismatch: Periksa apakah ada perubahan manual pada file `.dump` atau perbarui manifest menggunakan script backup resmi.
- Jika port 5434 konflik: Ubah parameter `-DrillPort` ke port kosong lain.
