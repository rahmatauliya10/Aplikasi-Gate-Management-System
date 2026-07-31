# Dokumentasi Keamanan & Pemulihan Otomatis GMS Production (Rancher Desktop)

## 1. Ikhtisar Arsitektur
Sistem pemulihan otomatis (*Auto-Start & Auto-Recovery*) Aplikasi Gate Management System (GMS) dirancang untuk memastikan Rancher Desktop (Engine Docker Moby), daemon Docker, dan seluruh container production dapat pulih secara mandiri dan aman setelah komputer Server Windows mengalami reboot atau mati listrik (*blackout*).

---

## 2. Prinsip Keamanan Utama (Hardening & Non-Privilege Escalation)

1. **Konteks Akun Runtime (Non-SYSTEM Execution)**:
   - Rancher Desktop GUI dan `rdctl start` **TIDAK DIJALANKAN** menggunakan akun `NT AUTHORITY\SYSTEM`.
   - Task Scheduler dikonfigurasi dengan pemicu `At Log On` khusus untuk akun runtime pengguna (misalnya `GMSRuntime` atau akun Windows pemilik registrasi Rancher Desktop).

2. **Keterisolasian Database & Network Hardening**:
   - Port PostgreSQL (5432/5433) dan Redis **TIDAK MEM-PUBLISH PORT** ke jaringan host external. PostgreSQL dan Redis hanya dapat diakses secara internal antar-container melalui Docker Bridge Network (`gate-system-backend`).
   - Port TCP Docker 2375 **TIDAK DIBUKA**. Komunikasi Docker CLI terbatas pada Windows Named Pipe (`//./pipe/docker_engine`) atau Unix socket lokal.

3. **Perlindungan Secrets & Log Sanitization**:
   - Tidak ada kata sandi, token JWT, API key, atau URL koneksi database yang di-hardcode dalam skrip `.ps1` atau `.bat`.
   - Log eksekusi pada `C:\GMS_Logs\autostart.log` secara otomatis menyaring teks sensitif sebelum ditulis ke disk.
   - Rotasi log otomatis aktif apabila file log melebihi 10MB (`max-size: 10m`).

4. **Keteletakan Perintah & Pemulihan Non-Destruktif**:
   - Skrip watchdog **TIDAK PERNAH** menjalankan `docker system prune`, `docker volume prune`, `docker compose down -v`, atau penghapusan volume database dan file attachment.
   - Menggunakan `docker compose up -d --no-build` tanpa melakukan pull atau rebuild otomatis saat boot.

---

## 3. Durabilitas PostgreSQL (Blackout Recovery)

- Memastikan atribut PostgreSQL pada `docker-compose.prod.yml`:
  - `fsync = on`
  - `full_page_writes = on`
  - `synchronous_commit = on`
  - `restart_after_crash = on`
- Volume `pgdata` berada pada direktori persisten host (`/var/lib/postgresql/data`).

---

## 4. Panduan Perintah Operasional

### Cara Mendaftarkan Task Auto-Start:
Jalankan file batch dengan Klik Kanan -> **Run as Administrator**:
```cmd
setup-gms-autostart.bat
```

### Cara Menghapus Task Auto-Start:
Jalankan perintah PowerShell berikut:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-gms-autostart.ps1
```

### Cara Menguji Verifikasi Otomatis:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-gms-autostart.ps1
```
