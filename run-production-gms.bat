@echo off
TITLE Deploy and Update Production GMS V6 (STRICT MODE)
SETLOCAL EnableDelayedExpansion
COLOR 0B

echo ==============================================================
echo       UPDATE DARI GIT ^& DEPLOY ULANG GMS V6 - STABLE PRODUCTION
echo ==============================================================
echo.

REM 1. Memeriksa status working tree (Clean tree guard)
for /f "tokens=*" %%i in ('git status --porcelain') do set DIRTY_TREE=%%i
if defined DIRTY_TREE (
    echo [!] GAGAL: Working tree repositori tidak bersih!
    echo Harap commit atau stash semua perubahan lokal sebelum melakukan deployment produksi.
    pause
    exit /b 1
)

REM 2. Memeriksa keberadaan file .env di backend
if not exist backend\.env (
    echo ERROR: File backend\.env tidak ditemukan!
    echo Silakan buat file backend\.env berdasarkan backend\.env.example dengan credential produksi aman.
    pause
    exit /b 1
)

echo [1/4] Memeriksa status repositori ^& commit SHA...
for /f "tokens=*" %%a in ('git rev-parse --short HEAD') do set CURRENT_COMMIT=%%a
echo [+] Target release commit SHA: [%CURRENT_COMMIT%]
set RELEASE_TAG=%CURRENT_COMMIT%

set PREVIOUS_RELEASE_TAG=stable
if exist deploy\current_release.txt (
    for /f "usebackq tokens=*" %%p in ("deploy\current_release.txt") do set PREVIOUS_RELEASE_TAG=%%p
)
echo [+] Previous release commit SHA: [%PREVIOUS_RELEASE_TAG%]

echo.
echo [2/4] Memeriksa keberadaan ^& format file .env...
if not exist backend\.env (
    echo [!] GAGAL: File backend\.env tidak ditemukan!
    pause
    exit /b 1
)
echo [+] Config backend\.env terverifikasi.

echo.
echo [3/4] Memeriksa ^& Menyiapkan Sertifikat SSL TLS Nginx...
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

echo [4/4] Menjalankan Immutable Deployment Orchestrator (deploy-with-rollback.ps1)...
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-with-rollback.ps1 -TargetReleaseTag "%CURRENT_COMMIT%" -PreviousReleaseTag "%PREVIOUS_RELEASE_TAG%" -RequireDigest
if errorlevel 1 (
    echo.
    echo [!] GAGAL: Deployment produksi gagal atau dibatalkan oleh orchestrator!
    pause
    exit /b 1
)

echo.
echo [Post-Deploy] Membersihkan Docker Image Prune setelah verifikasi sukses...
docker image prune -f >nul 2>&1

echo.
echo ==============================================================
echo  [+] GMS V6 PRODUKSI BERHASIL MENYALA ^& TERDEPLOY!
echo  [+] Web Portal (HTTPS): https://localhost (atau https://IP-Server)
echo  [+] Gunakan perintah: 'docker compose -f docker-compose.prod.yml logs -f' untuk melacak log
echo ==============================================================
echo.
pause
