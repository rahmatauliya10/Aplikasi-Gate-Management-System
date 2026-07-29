@echo off
echo ===================================================
echo   GATE MANAGEMENT SYSTEM - REBUILD ^& RUN UTILITY
echo ===================================================
echo.

if defined DATABASE_URL set "DATABASE_URL=%DATABASE_URL:"=%"
if defined DATABASE_URL_TEST set "DATABASE_URL_TEST=%DATABASE_URL_TEST:"=%"

set COMPOSE_CMD=docker compose --env-file backend/.env

echo [1/5] Menghentikan dan membersihkan kontainer lama...
echo (Catatan: Data di database Anda aman karena disimpan di Docker volume khusus)
%COMPOSE_CMD% down
if %errorlevel% neq 0 (
    echo ERROR: Gagal menghentikan kontainer lama.
    exit /b 1
)

echo.
echo [2/5] Membangun ulang (rebuild) kontainer dengan kode baru...
%COMPOSE_CMD% build --no-cache
if %errorlevel% neq 0 (
    echo ERROR: Docker build gagal.
    exit /b 1
)

echo.
echo [3/5] Menyalakan PostgreSQL dan melakukan migrasi skema...
%COMPOSE_CMD% up -d postgres
if %errorlevel% neq 0 (
    echo ERROR: Gagal menyalakan PostgreSQL.
    exit /b 1
)

echo.
echo Menunggu PostgreSQL siap menerima koneksi...
set DB_RETRY=0
set DB_MAX_RETRY=30

:WAIT_DATABASE
%COMPOSE_CMD% exec -T postgres sh -c "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"" >nul 2>&1
if %errorlevel%==0 (
    echo PostgreSQL siap.
    goto RUN_MIGRATION
)
set /a DB_RETRY+=1
if %DB_RETRY% GEQ %DB_MAX_RETRY% (
    echo.
    echo ERROR: PostgreSQL tidak siap setelah 90 detik!
    %COMPOSE_CMD% logs --tail=200 postgres
    exit /b 1
)
timeout /t 3 /nobreak >nul
goto WAIT_DATABASE

:RUN_MIGRATION
echo.
echo Menjalankan migrasi skema database (npx prisma migrate deploy)...
%COMPOSE_CMD% run --rm backend npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Prisma migration gagal!
    %COMPOSE_CMD% logs --tail=200 postgres
    exit /b 1
)

echo.
echo Memeriksa status migrasi database (npx prisma migrate status)...
%COMPOSE_CMD% run --rm backend npx prisma migrate status
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Status Prisma migration tidak valid atau ada migrasi yang tertinggal!
    exit /b 1
)

echo.
echo [4/5] Menyalakan seluruh layanan GMS...
%COMPOSE_CMD% up -d
if %errorlevel% neq 0 (
    echo ERROR: Gagal menyalakan seluruh layanan GMS.
    exit /b 1
)

echo.
echo [5/5] Menunggu backend terhubung ke database dan siap...
set HEALTH_RETRY=0
set HEALTH_MAX_RETRY=30

:WAIT_BACKEND
powershell -NoProfile -Command ^
  "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3001); if ($c.Connected) { $c.Close(); exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel%==0 (
    echo Backend siap dan sehat.
    goto DEPLOYMENT_SUCCESS
)

set /a HEALTH_RETRY+=1
if %HEALTH_RETRY% GEQ %HEALTH_MAX_RETRY% (
    echo.
    echo ERROR: Backend tidak sehat setelah 90 detik!
    %COMPOSE_CMD% ps
    %COMPOSE_CMD% logs --tail=200 backend
    %COMPOSE_CMD% logs --tail=100 postgres
    exit /b 1
)
timeout /t 3 /nobreak >nul
goto WAIT_BACKEND

:DEPLOYMENT_SUCCESS
echo.
echo ===================================================
echo   REBUILD ^& RUN BERHASIL SELESAI!
echo.
echo   - Data database Anda telah DIJAGA sepenuhnya.
echo   - Seluruh pemeriksaan kesehatan utama LULUS.
echo   - Frontend: http://localhost:8081
echo   - Backend API: http://localhost:3001/api
echo ===================================================
pause
exit /b 0
