# Panduan Hardening Deployment Produksi: Windows Server + WSL2 + Rancher Desktop

Panduan ini mengatur agar **Rancher Desktop / Docker WSL2 di Windows Server** dapat berjalan secara otomatis saat server di-reboot tanpa membutuhkan user GUI login manual, serta mengamankan penyimpanan data persisten PostgreSQL.

---

## 1. Otomatisasi Startup Windows Server (Auto-Start Without GUI Login)

Secara default, Rancher Desktop memerlukan user Windows untuk login GUI. Untuk mengubahnya agar berjalan sebagai **Windows System Background Task (Daemon)**:

### Opsi A — Windows Task Scheduler (Rekomendasi Utama Termudah)
1. Buka **Task Scheduler** di Windows Server (`taskschd.msc`).
2. Pilih **Create Task** (bukan Create Basic Task).
3. Pada tab **General**:
   - Name: `GMS_Production_AutoStart`
   - Security options: Pilih `Run whether user is logged on or not`.
   - Centang `Run with highest privileges`.
4. Pada tab **Triggers**:
   - Select `At startup`.
5. Pada tab **Actions**:
   - Action: `Start a program`.
   - Program/script: `cmd.exe`
   - Add arguments: `/c "cd /d D:\Data Kacong\Antigravity Project\Aplikasi Gate Management System && run-production-gms.bat"`
6. Klik **OK** dan masukkan password administrator Windows Server.

---

## 2. Pengamanan Penyimpanan Data Persisten WSL2 (PostgreSQL Data Volume)

Secara default, volume Docker di WSL2 tersimpan di dalam disk virtual `.vhdx`. Untuk mencegah kehilangan data akibat reset WSL2:

1. **Jadwalkan Backup Otomatis 6 Jam:**
   GMS V6 telah memiliki fitur backup otomatis internal 6 jam yang menyimpan berkas dump dan snapshot JSON ke volume `./backups/local` dan `./backups/nas`.
2. **Mount Folder Khusus Windows:**
   Di `docker-compose.prod.yml`, volume backup secara otomatis dipetakan ke direktori fisik Windows sehingga berkas backup dapat dicopy langsung oleh skrip backup Windows/NAS perusahaan.

---

## 3. Menjalankan Aplikasi Produksi di Rancher Desktop

Cukup double click file:
`run-production-gms.bat`

Atau jalankan via PowerShell/CMD Admin:
```cmd
.\run-production-gms.bat
```

Sistem akan otomatis:
1. Memvalidasi koneksi Rancher Desktop / WSL2.
2. Memeriksa file `backend\.env` produksi.
3. Menyiapkan sertifikat TLS SSL untuk Nginx Proxy.
4. Menyalakan seluruh service produksi (Nginx, Frontend, Backend, PostgreSQL).
5. Menerapkan migrasi database Prisma.
