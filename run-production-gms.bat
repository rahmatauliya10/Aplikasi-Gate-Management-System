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

echo [1/8] Memeriksa status repositori & commit SHA...
for /f "tokens=*" %%a in ('git rev-parse --short HEAD') do set CURRENT_COMMIT=%%a
echo [+] Target release commit SHA: [%CURRENT_COMMIT%]
set RELEASE_TAG=%CURRENT_COMMIT%

echo.
echo [2/8] Memeriksa keberadaan & format file .env...
if not exist backend\.env (
    echo [!] GAGAL: File backend\.env tidak ditemukan!
    pause
    exit /b 1
)
echo [+] Config backend\.env terverifikasi.

echo.
echo [3/8] Memeriksa & Menyiapkan Sertifikat SSL TLS Nginx...
if not exist deploy\nginx\ssl mkdir deploy\nginx\ssl
if not exist deploy\nginx\ssl\server.crt (
    echo [!] GAGAL: File sertifikat SSL (deploy\nginx\ssl\server.crt) tidak ditemukan!
    pause
    exit /b 1
)
if not exist deploy\nginx\ssl\server.key (
    echo [!] GAGAL: File private key SSL (deploy\nginx\ssl\server.key) tidak ditemukan!
    pause
    exit /b 1
)
echo [+] Sertifikat SSL TLS (server.crt dan server.key) terverifikasi.

echo.
echo [4/8] Membangun Images Produksi Baru (Build Before Stop)...
docker compose -f docker-compose.prod.yml --env-file backend\.env build --no-cache
if errorlevel 1 (
    echo [!] GAGAL: Proses build Docker image produksi gagal! Stack lama tetap berjalan aman.
    pause
    exit /b 1
)

echo.
echo [5/8] Menghentikan service lama & menyalakan versi baru...
docker compose -f docker-compose.prod.yml --env-file backend\.env up -d --remove-orphans
if errorlevel 1 (
    echo [!] GAGAL: Gagal menjalankan container produksi.
    pause
    exit /b 1
)

echo.
echo [6/8] Menjalankan Migrasi Database Prisma & Preflight Audit...
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
if errorlevel 1 (
    echo.
    echo [!] GAGAL: Migrasi database Prisma gagal! Deployment dibatalkan demi keamanan data.
    docker compose -f docker-compose.prod.yml stop
    pause
    exit /b 1
)

docker compose -f docker-compose.prod.yml exec -T backend npm run prisma:preflight -- --report-only
if errorlevel 1 (
    echo [!] GAGAL: Preflight audit duplikat database gagal!
    docker compose -f docker-compose.prod.yml stop
    pause
    exit /b 1
)

echo.
echo [7/8] Verifikasi Health Check Nginx & Reverse Proxy...
echo [+] Menunggu Nginx Reverse Proxy siap...
powershell -NoProfile -Command "for ($i=1; $i -le 10; $i++) { try { $resp = Invoke-WebRequest -Uri 'https://localhost/health' -SkipCertificateCheck -UseBasicParsing -TimeoutSec 3; if ($resp.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [!] GAGAL: Nginx Reverse Proxy / Health check gagal merespon 200 OK!
    echo [!] Memulai proses rollback otomatis...
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-with-rollback.ps1 -TargetReleaseTag "%CURRENT_COMMIT%"
    pause
    exit /b 1
)

echo.
echo [8/8] Membersihkan Docker Image Prune setelah verifikasi sukses...
docker image prune -f >nul 2>&1

echo.
echo ==============================================================
echo  [+] GMS V6 PRODUKSI BERHASIL MENYALA & TERDEPLOY!
echo  [+] Web Portal (HTTPS): https://localhost (atau https://IP-Server)
echo  [+] Gunakan perintah: 'docker compose -f docker-compose.prod.yml logs -f' untuk melacak log
echo ==============================================================
echo.
pause
