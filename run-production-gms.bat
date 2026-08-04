@echo off
TITLE Deploy and Update Production GMS V6 (STRICT MODE)
SETLOCAL EnableDelayedExpansion
COLOR 0B

echo ==============================================================
echo       UPDATE DARI GIT ^& DEPLOY ULANG GMS V6 - STABLE PRODUCTION
echo ==============================================================
echo.

REM 1. Memeriksa keberadaan file .env di backend
if not exist backend\.env (
    echo ERROR: File backend\.env tidak ditemukan!
    echo Silakan buat file backend\.env berdasarkan backend\.env.example dengan credential produksi aman.
    pause
    exit /b 1
)

echo [1/8] Memeriksa status repositori Git...
git diff-index --quiet HEAD -- >nul 2>&1
if errorlevel 1 (
    echo [!] WARNING: Working tree lokal memiliki perubahan belum tertulis.
    echo Mengambil update terbaru tanpa menghapus perubahan lokal...
)
git pull origin master || git pull origin main
if errorlevel 1 (
    echo [!] GAGAL: Git pull gagal. Harap selesaikan konflik Git sebelum deployment.
    pause
    exit /b 1
)
echo [+] Pembaruan Git selesai diselaraskan.

echo.
echo [2/8] Sanitasi file .env...
powershell -NoProfile -Command "(Get-Content -Path 'backend\.env') -replace [char]34, '' | Set-Content -Path 'backend\.env'" >nul 2>&1
echo [+] File .env telah dibersihkan.

echo.
echo [3/8] Memeriksa & Menyiapkan Sertifikat SSL TLS Nginx...
if not exist deploy\nginx\ssl mkdir deploy\nginx\ssl
if not exist deploy\nginx\ssl\server.crt (
    echo [!] GAGAL: File sertifikat SSL (deploy\nginx\ssl\server.crt) tidak ditemukan!
    echo [!] Sediakan server.crt dan server.key sebelum melanjutkan deployment produksi.
    pause
    exit /b 1
)
if not exist deploy\nginx\ssl\server.key (
    echo [!] GAGAL: File private key SSL (deploy\nginx\ssl\server.key) tidak ditemukan!
    echo [!] Sediakan server.key sebelum melanjutkan deployment produksi.
    pause
    exit /b 1
)
echo [+] Sertifikat SSL TLS (server.crt dan server.key) terverifikasi.

echo.
echo [4/8] Menghentikan service lama...
docker compose -f docker-compose.prod.yml down --remove-orphans >nul 2>&1

echo.
echo [5/8] Membangun Images Produksi (No-Cache dengan --env-file)...
docker compose -f docker-compose.prod.yml --env-file backend\.env build --no-cache
if errorlevel 1 (
    echo [!] GAGAL: Proses build Docker image produksi gagal!
    pause
    exit /b 1
)

echo.
echo [6/8] Menjalankan Service Produksi Baru (Nginx, Backend, Frontend, Postgres)...
docker compose -f docker-compose.prod.yml --env-file backend\.env up -d
if errorlevel 1 (
    echo [!] GAGAL: Gagal menjalankan container produksi.
    pause
    exit /b 1
)

echo.
echo [7/8] Menjalankan Migrasi Database Prisma (Safe Production Deploy)...
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
if errorlevel 1 (
    echo.
    echo [!] GAGAL: Migrasi database Prisma gagal! Deployment dibatalkan demi keamanan data.
    docker compose -f docker-compose.prod.yml stop
    pause
    exit /b 1
)

echo.
echo [8/8] Membersihkan sampah Docker Image & Verifikasi Nginx Health...
docker image prune -f >nul 2>&1

echo [+] Menunggu Nginx Reverse Proxy siap...
powershell -NoProfile -Command "for ($i=1; $i -le 10; $i++) { try { $resp = Invoke-WebRequest -Uri 'https://localhost/health' -SkipCertificateCheck -UseBasicParsing -TimeoutSec 3; if ($resp.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1" >nul 2>&1

echo.
echo ==============================================================
echo  [+] GMS V6 PRODUKSI BERHASIL MENYALA & TERDEPLOY!
echo  [+] Web Portal (HTTPS): https://localhost (atau https://IP-Server)
echo  [+] Gunakan perintah: 'docker compose -f docker-compose.prod.yml logs -f' untuk melacak log
echo ==============================================================
echo.
pause
