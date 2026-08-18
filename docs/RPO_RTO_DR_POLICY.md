# GMS Production Disaster Recovery Policy, RPO/RTO SLAs & Drill Schedule

**Document Version:** 1.0.0  
**Effective Date:** August 2026  
**Classification:** Internal Restricted / SRE & Production Operations  
**Standards Compliance:** NIST SP 800-34 Rev. 1 (Contingency Planning) & ISO/IEC 27031 (Business Continuity)  

---

## 1. Executive Summary & Core Objectives

Kebijakan ini menetapkan batas toleransi kehilangan data (*Recovery Point Objective* - **RPO**), target waktu pemulihan layanan (*Recovery Time Objective* - **RTO**), jadwal resmi pengujian pemulihan (*Disaster Recovery Drills*), dan tata kelola bukti audit (*audit evidence*) untuk sistem **Gate Management System (GMS)**.

---

## 2. Definisi SLA RPO & RTO

| Parameter SLA | Target Resmi | Mekanisme Penjaminan Teknis | Eskalasi Pelanggaran SLA |
|:---|:---:|:---|:---|
| **RPO (Recovery Point Objective)** | **≤ 6 Jam** | - Jadwal backup otomatis setiap 6 jam via `DatabaseBackupService`<br>- Backup snapshot manual sebelum setiap migrasi/deployment (`MANUAL_PRE_UPDATE`)<br>- Replikasi ganda: Local Storage + Remote NAS Offsite Storage | Jika backup terakhir > 6 jam, `gms-health-monitor.ps1` memicu alert **HIGH/CRITICAL**. |
| **RTO (Recovery Time Objective)** | **≤ 30 Menit** | - Script pemulihan terotomatisasi `run-nas-restore-drill.ps1`<br>- Arsitektur containerized Docker Compose (zero external dependency compile)<br>- Prosedur otomatis *Cold-Boot Recovery* pasca mati listrik | Jika waktu pemulihan > 30 menit, status kesiapan DR dinyatakan **DEGRADED**. |

---

## 3. Jadwal & Protokol Disaster Recovery Drill

Pengujian pemulihan bencana wajib dilaksanakan secara berkala, bukan hanya satu kali sebelum go-live:

| Frekuensi | Jenis Pengujian | Penanggung Jawab | Prosedur Eksekusi |
|:---|:---|:---|:---|
| **Setiap Release / Deployment** | Deployment Rollback Drill | SRE / Release Engineer | `scripts/run-deployment-rollback-drill.ps1` |
| **Bulanan (Monthly)** | Automated Failure-Injection Drill | DevOps / SRE | `scripts/run-restore-failure-drill.ps1` |
| **Kuartalan (Quarterly)** | Actual NAS Physical Restore Drill | Database Admin & IT Sec | `scripts/run-nas-restore-drill.ps1` |
| **Semesteran (Semi-Annual)** | Blackout & Cold-Boot Power-Cut Test | Plant IT & Infrastructure | `scripts/run-cold-boot-test.ps1` |

---

## 4. Standar Penyimpanan Bukti Audit (Evidence Artifacts)

Setiap pelaksanaan drill wajib mendokumentasikan dan mengarsipkan berkas bukti audit pada direktori `artifacts/release-proof/` dengan atribut lengkap:
1. **Tanggal & Waktu Eksekusi** (UTC & Asia/Jakarta).
2. **Git Commit SHA** yang sedang aktif.
3. **Identifier Backup** (Nama file `.dump` dan hash SHA-256).
4. **Durasi Pemulihan Aktual** (dalam detik, diuji terhadap target RTO).
5. **Hasil Rekonsiliasi 16 Entitas Database** (Match 100%).
6. **Integritas Lampiran Fisik** (SHA-256 Byte Verification 100%).
7. **Verdict Final** (`PASSED` / `FAILED`).

---

## 5. Matriks Eskalasi Insiden & Tim Tanggap Darurat

```
[Insiden Terdeteksi] ──► Level 1: Operator On-Call (Response < 5 menit)
                              │
                              ▼
                         Level 2: SRE / Database Engineer (Response < 15 menit)
                              │
                              ▼
                         Level 3: IT Lead & Factory Operations Manager
```

### Kontak Darurat (Emergency Response Matrix)
- **IT Infrastructure On-Call:** `it-ops@plant.company.local` / Hotline Ekstensi 1101
- **Database Administrator:** `dba-team@plant.company.local` / Hotline Ekstensi 1102
- **Lead Application Security:** `appsec@plant.company.local` / Hotline Ekstensi 1103
