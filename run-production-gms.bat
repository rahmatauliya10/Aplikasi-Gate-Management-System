@echo off
echo ===================================================
echo   GATE MANAGEMENT SYSTEM - PRODUCTION LAUNCHER
echo   (RANCHER DESKTOP / WSL2 / DOCKER WINDOWS SERVER)
echo ===================================================
echo.

REM 1. Memeriksa keberadaan file .env di backend
if not exist backend\.env (
    echo ERROR: File backend\.env tidak ditemukan!
    echo Silakan buat file backend\.env berdasarkan backend\.env.example dengan credential produksi aman.
    pause
    exit /b 1
)

REM Load .env variables
for /f "usebackq tokens=*" %%i in (`findstr /v "^#" backend\.env`) do (
    set %%i
)

REM 2. Memeriksa ketersediaan sertifikat SSL di deploy\nginx\ssl
if not exist deploy\nginx\ssl\server.crt (
    echo [Peringatan] File SSL deploy\nginx\ssl\server.crt belum ada.
    echo Membuat sertifikat TLS Self-Signed sementara untuk Nginx HTTPS...
    if not exist deploy\nginx\ssl mkdir deploy\nginx\ssl
    powershell -Command "New-SelfSignedCertificate -DnsName 'localhost', 'gms.local' -CertStoreLocation 'cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(5)" >nul 2>&1
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout deploy\nginx\ssl\server.key -out deploy\nginx\ssl\server.crt -subj "/C=ID/ST=Indonesia/L=Jakarta/O=GMS Enterprise/OU=IT/CN=localhost" >nul 2>&1
)

echo [1/3] Memeriksa koneksi Docker / Rancher Desktop / WSL2...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker Engine / Rancher Desktop belum berjalan!
    echo Silakan jalankan Rancher Desktop atau aktifkan integrasi WSL2 Docker.
    pause
    exit /b 1
)

echo.
echo [2/3] Membangun & Menyalakan kontainer produksi GMS V6...
docker compose -f docker-compose.prod.yml --env-file backend\.env up -d --build --remove-orphans
if %errorlevel% neq 0 (
    echo ERROR: Gagal menyalakan kontainer produksi GMS.
    pause
    exit /b 1
)

echo.
echo [3/3] Menjalankan migrasi skema Prisma di dalam kontainer backend...
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Migrasi database Prisma gagal! Deployment dibatalkan demi keamanan data.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   GMS V6 PRODUKSI BERHASIL MENYALA!
echo   - Web HTTPS Portal : https://localhost (atau IP Server)
echo   - Web HTTP Portal  : http://localhost (Auto Redirect to HTTPS)
echo   - Backend Status   : Running via Docker/Rancher Desktop WSL2
echo ===================================================
pause
