@echo off
TITLE Deploy & Update Production GMS V6 (STRICT MODE)
SETLOCAL EnableDelayedExpansion
COLOR 0B

echo ==============================================================
echo       UPDATE DARI GIT & DEPLOY ULANG GMS V6 - STABLE PRODUCTION
echo ==============================================================
echo.

REM 1. Memeriksa keberadaan file .env di backend
if not exist backend\.env (
    echo ERROR: File backend\.env tidak ditemukan!
    echo Silakan buat file backend\.env berdasarkan backend\.env.example dengan credential produksi aman.
    pause
    exit /b 1
)

echo => [1/8] Memeriksa status repositori Git...
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
echo => [2/8] Sanitasi file .env (Menghapus tanda kutip)...
powershell -Command "$c = Get-Content backend/.env; $c = $c -replace '\"', ''; Set-Content backend/.env $c" >nul 2>&1
echo [+] File .env telah dibersihkan.

echo.
echo => [3/8] Memeriksa & Menyiapkan Sertifikat SSL TLS Nginx...
if not exist deploy\nginx\ssl\server.crt (
    echo [!] Sertifikat SSL belum ditemukan. Membuat SSL Self-Signed sementara...
    if not exist deploy\nginx\ssl mkdir deploy\nginx\ssl
    powershell -Command "New-SelfSignedCertificate -DnsName 'localhost', 'gms.local' -CertStoreLocation 'cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(5)" >nul 2>&1
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout deploy\nginx\ssl\server.key -out deploy\nginx\ssl\server.crt -subj "/C=ID/ST=Indonesia/L=Jakarta/O=GMS Enterprise/OU=IT/CN=localhost" >nul 2>&1
)
echo [+] Sertifikat SSL TLS terkonfigurasi.

echo.
echo => [4/8] Menghentikan service lama...
docker compose -f docker-compose.prod.yml down --remove-orphans >nul 2>&1

echo.
echo => [5/8] Membangun Images Produksi (No-Cache dengan --env-file)...
docker compose -f docker-compose.prod.yml --env-file backend\.env build --no-cache
if errorlevel 1 (
    echo [!] GAGAL: Proses build Docker image produksi gagal!
    pause
    exit /b 1
)

echo.
echo => [6/8] Menjalankan Service Produksi Baru (Nginx, Backend, Frontend, Postgres)...
docker compose -f docker-compose.prod.yml --env-file backend\.env up -d
if errorlevel 1 (
    echo [!] GAGAL: Gagal menjalankan container produksi.
    pause
    exit /b 1
)

echo.
echo => [7/8] Menjalankan Migrasi Database Prisma...
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
if errorlevel 1 (
    echo.
    echo [!] GAGAL: Migrasi database Prisma gagal! Deployment dibatalkan demi keamanan data.
    docker compose -f docker-compose.prod.yml stop
    pause
    exit /b 1
)

echo.
echo => [8/8] Membersihkan sampah Docker Image...
docker image prune -f >nul 2>&1

echo.
echo ==============================================================
echo  [+] GMS V6 PRODUKSI BERHASIL MENYALA & TERDEPLOY!
echo  [+] Web HTTPS Portal : https://localhost (atau IP Server)
echo  [+] Web HTTP Portal  : http://localhost (Auto Redirect to HTTPS)
echo  [+] Gunakan perintah: 'docker compose -f docker-compose.prod.yml logs -f' untuk melacak log
echo ==============================================================
echo.
pause
