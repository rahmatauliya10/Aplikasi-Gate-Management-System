@echo off
echo ===================================================
echo   GATE MANAGEMENT SYSTEM - DISASTER RECOVERY DRILL
echo ===================================================
echo.

REM Load .env variables if .env exists
if exist backend\.env (
    for /f "usebackq tokens=*" %%i in (`findstr /v "^#" backend\.env`) do (
        set %%i
    )
)

if defined DATABASE_URL set "DATABASE_URL=%DATABASE_URL:"=%"
if defined DATABASE_URL_TEST set "DATABASE_URL_TEST=%DATABASE_URL_TEST:"=%"
if not defined DATABASE_URL_TEST set "DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/gms_test?schema=public"

set "ORIGINAL_DATABASE_URL=%DATABASE_URL%"
set "ORIGINAL_NODE_ENV=%NODE_ENV%"

set "NODE_ENV=test"
set "ALLOW_TEST_DATABASE_RESET=YES"

echo Memvalidasi database pengujian...
cd backend
call npx ts-node prisma/verify-test-db.ts
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Validasi database pengujian gagal!
    set "NODE_ENV=%ORIGINAL_NODE_ENV%"
    cd ..
    pause
    exit /b 1
)

echo.
echo [1/2] Menerapkan migrasi skema bersih pada database pengujian...
set "DATABASE_URL=%DATABASE_URL_TEST%"

call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo ERROR: Gagal menerapkan migrasi skema.
    set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
    set "NODE_ENV=%ORIGINAL_NODE_ENV%"
    cd ..
    pause
    exit /b 1
)

echo.
echo [2/2] Menjalankan Simulasi Restore & Audit Integritas Data (DR Drill)...
call npx ts-node prisma/verify-restore-drill.ts
if %errorlevel% neq 0 (
    echo ERROR: Disaster Recovery Restore Drill Gagal!
    set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
    set "NODE_ENV=%ORIGINAL_NODE_ENV%"
    cd ..
    pause
    exit /b 1
)

set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
set "NODE_ENV=%ORIGINAL_NODE_ENV%"
cd ..
echo.
echo ===================================================
echo   SIMULASI RESTORE DISASTER RECOVERY LULUS 100%
echo ===================================================
pause
