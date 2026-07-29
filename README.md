# Gate Management System (GMS V6) — Production Ready

Sistem Informasi Gate Management System (GMS V6) berbasis NestJS (Backend), Vue 3 (Frontend), Prisma ORM, dan PostgreSQL untuk pengelolaan alur transaksi truk (Gate-In, Timbangan, Quality Control, Gudang, hingga Gate-Out).

---

## 📁 Struktur & Peta Kelompok File Repositori

Agar tidak membingungkan, seluruh file dalam repositori ini dikelompokkan berdasarkan fungsinya:

### 🚀 1. Kelompok Script Peluncur (Batch Scripts)

| File Script | Peruntukan & Cara Penggunaan |
| :--- | :--- |
| **`run-production-gms.bat`** | **[PRODUKSI]** Peluncur otomatis mode produksi di Windows Server (Rancher Desktop / WSL2). Otomatis membuat SSL, memvalidasi `.env`, dan menyalakan Nginx Proxy TLS. |
| **`rebuild-run-gms.bat`** | **[DEVELOPMENT]** Membangun ulang dan menyalakan kontainer mode pengembang lokal di Rancher Desktop. |
| **`provision-gms.bat`** | **[INITIAL SEED]** Membuat akun Administrator pertama pada database kosong secara aman tanpa risiko overwrite. |
| **`run-tests.bat`** | **[TESTING]** Menjalankan validasi database test (`verify-test-db.ts`), Prisma seed test, Unit test, dan E2E test. |
| **`run-restore-drill.bat`** | **[DISASTER RECOVERY]** Simulasi otomatis pemulihan data dari backup ke database test untuk membuktikan DR 100%. |

---

### 🐳 2. Kelompok Konfigurasi Docker & Deployment

| File / Folder | Peruntukan |
| :--- | :--- |
| **`docker-compose.prod.yml`** | Konfigurasi Docker Compose khusus **Mode Produksi** (Port DB diisolasi total, SSL Nginx Proxy aktif, resource limit diset). |
| **`docker-compose.yml`** | Konfigurasi Docker Compose khusus **Mode Pengembang Lokal** (Port DB 5433 terekspos untuk debugging). |
| **`deploy/nginx/`** | Konfigurasi Nginx TLS SSL Reverse Proxy (Port 443 HTTPS, Rate Limiting, Security Headers). |
| **`deploy/wsl-autostart-guide.md`** | Panduan setup **Windows Task Scheduler** agar aplikasi otomatis menyala saat Windows Server di-reboot. |

---

### 📚 3. Kelompok Dokumen Laporan & Walkthrough

| File Dokumen | Isi & Kegunaan |
| :--- | :--- |
| **`GMS_V6_Full_Production_Readiness_Audit_2026-07-29.md`** | Laporan Resmi Hasil Audit Kesiapan Produksi 27 Bab (Status: **GO - PRODUCTION READY 94.2/100**). |
| **`walkthrough.md`** | Ringkasan teknis seluruh perbaikan keamanan, Nginx SSL, account lockout, dan disaster recovery yang telah selesai. |

---

### 📦 4. Struktur Folder Aplikasi Utama

```
Aplikasi Gate Management System/
├── backend/                  # NestJS API Backend (Node 20, Prisma ORM, Argon2, JWT)
│   ├── prisma/               # Schema Prisma, Migrasi Database, & Verify Scripts
│   ├── src/                  # Source Code Modules (Auth, Transactions, Gate, Weighbridge, QC, Warehouse, Settings)
│   └── Dockerfile            # Multi-stage production build container backend
│
├── frontend/                 # Vue 3 Frontend (Vite 7, Pinia, TailwindCSS)
│   ├── src/                  # Views, Components, Stores, & Services
│   └── Dockerfile            # Multi-stage Nginx container frontend
│
└── deploy/                   # File Konfigurasi Deployment Produksi
    ├── nginx/                # Nginx Proxy Configuration & SSL Certificates
    └── wsl-autostart-guide.md # Panduan Auto-Start Windows Server
```

---

## ⚡ Panduan Cepat Menjalankan Aplikasi

### A. Menjalankan di Server Produksi (Windows Server / Rancher Desktop)
Double-click atau jalankan via PowerShell Admin:
```cmd
.\run-production-gms.bat
```
Akses Portal: **`https://localhost`** (Auto SSL / HTTP Redirect)

### B. Menjalankan untuk Development Lokal
```cmd
.\rebuild-run-gms.bat
```
Akses Frontend: `http://localhost:8081`  
Akses API Backend: `http://localhost:3001/api`

### C. Menjalankan Simulasi Restore Disaster Recovery
```cmd
.\run-restore-drill.bat
```

---
*Gate Management System V6 — Production Hardened Edition.*
