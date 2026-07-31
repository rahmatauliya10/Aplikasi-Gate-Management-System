@echo off
:: ==============================================================================
# GMS Production Auto-Start Setup Elevation Wrapper
# ==============================================================================
# Elevates to Administrator privileges and executes register-gms-autostart-task.ps1
:: ==============================================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrative Privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Starting GMS Production Auto-Start Task Registration...
powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\register-gms-autostart-task.ps1"

if %errorlevel% equ 0 (
    echo.
    echo ==============================================================================
    echo SUCCESS: GMS Production Auto-Start Task has been registered successfully!
    echo ==============================================================================
) else (
    echo.
    echo ==============================================================================
    echo ERROR: Failed to register GMS Production Auto-Start Task (Exit Code %errorlevel%).
    echo ==============================================================================
)

pause
