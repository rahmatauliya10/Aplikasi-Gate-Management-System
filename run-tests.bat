@echo off
echo ===================================================
echo   GATE MANAGEMENT SYSTEM - RUN TESTS
echo ===================================================
echo.

if defined DATABASE_URL set "DATABASE_URL=%DATABASE_URL:"=%"
if defined DATABASE_URL_TEST set "DATABASE_URL_TEST=%DATABASE_URL_TEST:"=%"

REM Load .env variables if .env exists
if exist backend\.env (
    for /f "usebackq tokens=*" %%i in (`findstr /v "^#" backend\.env`) do (
        set %%i
    )
)

REM Save original environment
set "ORIGINAL_DATABASE_URL=%DATABASE_URL%"
set "ORIGINAL_NODE_ENV=%NODE_ENV%"

REM Configure environment for verification
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
echo [1/4] Menyiapkan database test dengan migrasi bersih...
REM Overwrite DATABASE_URL to DATABASE_URL_TEST for running migrations and tests
set "DATABASE_URL=%DATABASE_URL_TEST%"

call npx prisma migrate reset --force --skip-seed
if %errorlevel% neq 0 (
    echo ERROR: Gagal meriset database test.
    set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
    set "NODE_ENV=%ORIGINAL_NODE_ENV%"
    cd ..
    pause
    exit /b 1
)

echo.
echo [2/4] Melakukan seeding database test secara eksplisit...
call npx prisma db seed
if %errorlevel% neq 0 (
    echo ERROR: Gagal melakukan seeding database test.
    set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
    set "NODE_ENV=%ORIGINAL_NODE_ENV%"
    cd ..
    pause
    exit /b 1
)

echo.
echo [3/4] Menjalankan Unit Tests...
call npm run test
if %errorlevel% neq 0 (
    echo ERROR: Unit tests gagal.
)

echo.
echo [4/4] Menjalankan E2E Tests...
call npm run test:e2e
if %errorlevel% neq 0 (
    echo ERROR: E2E tests gagal.
)

REM Restore original database URL and NODE_ENV
set "DATABASE_URL=%ORIGINAL_DATABASE_URL%"
set "NODE_ENV=%ORIGINAL_NODE_ENV%"
cd ..
echo.
echo ===================================================
echo   TEST RUN SELESAI
echo ===================================================
pause
