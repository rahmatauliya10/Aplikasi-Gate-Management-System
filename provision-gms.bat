@echo off
echo ===================================================
echo   GATE MANAGEMENT SYSTEM - PROVISIONING UTILITY
echo ===================================================
echo.

if defined DATABASE_URL set "DATABASE_URL=%DATABASE_URL:"=%"
if defined DATABASE_URL_TEST set "DATABASE_URL_TEST=%DATABASE_URL_TEST:"=%"

set COMPOSE_CMD=docker compose --env-file backend/.env

echo Memeriksa status kontainer database...
%COMPOSE_CMD% up -d postgres
if %errorlevel% neq 0 (
    echo ERROR: Gagal menyalakan PostgreSQL.
    pause
    exit /b 1
)

echo Menunggu PostgreSQL siap...
set DB_RETRY=0
set DB_MAX_RETRY=30

:WAIT_DATABASE
%COMPOSE_CMD% exec -T postgres sh -c "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"" >nul 2>&1
if %errorlevel%==0 (
    goto CHECK_ADMIN
)
set /a DB_RETRY+=1
if %DB_RETRY% GEQ %DB_MAX_RETRY% (
    echo ERROR: PostgreSQL tidak siap!
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto WAIT_DATABASE

:CHECK_ADMIN
echo Memeriksa apakah akun admin sudah terdaftar...
%COMPOSE_CMD% run --rm backend npx ts-node prisma/check-provisioned.ts >temp_check.txt 2>&1
findstr /C:"ADMIN_EXISTS" temp_check.txt >nul
if %errorlevel%==0 (
    echo.
    echo [Peringatan] Akun Admin aktif sudah ada di database.
    echo Seeding diabaikan untuk menghindari overwrite credential secara tidak sengaja.
    del temp_check.txt >nul 2>&1
    pause
    exit /b 0
)

findstr /C:"ADMIN_INACTIVE" temp_check.txt >nul
if %errorlevel%==0 (
    echo.
    echo [ERROR] Akun Admin ditemukan tetapi dalam status TIDAK AKTIF [Inactive].
    echo Silakan hubungi Administrator Database untuk memulihkan akun ini. Seeding dibatalkan.
    del temp_check.txt >nul 2>&1
    pause
    exit /b 1
)
del temp_check.txt >nul 2>&1

echo.
echo Melakukan seeding database dengan akun default...
cd backend
call npx prisma db seed
if %errorlevel% neq 0 (
    echo ERROR: Seeding database gagal!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ===================================================
echo   SEEDED BERHASIL SELESAI!
echo   Silakan catat password sementara di atas.
echo ===================================================
pause
