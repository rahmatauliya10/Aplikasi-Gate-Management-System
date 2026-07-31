# ==============================================================================
# GMS Production Auto-Start Automated Test Harness & Verification Suite
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir   = "d:\Data Kacong\Antigravity Project\Aplikasi Gate Management System"
[string]$ComposeFilePath  = Join-Path -Path $ProjectRootDir -ChildPath "docker-compose.prod.yml"
[string]$EnvFilePath      = Join-Path -Path $ProjectRootDir -ChildPath "backend\.env"
[string]$WatchdogPath     = Join-Path -Path $ProjectRootDir -ChildPath "scripts\gms-autostart-watchdog.ps1"
[string]$RegisterTaskPath = Join-Path -Path $ProjectRootDir -ChildPath "scripts\register-gms-autostart-task.ps1"

[int]$PassCount = 0
[int]$FailCount = 0

function Assert-Test {
    param (
        [string]$TestName,
        [scriptblock]$TestCondition
    )
    try {
        [bool]$Result = & $TestCondition
        if ($Result) {
            Write-Host "[PASS] $TestName" -ForegroundColor Green
            $script:PassCount++
        } else {
            Write-Host "[FAIL] $TestName" -ForegroundColor Red
            $script:FailCount++
        }
    } catch {
        Write-Host "[FAIL] $TestName (Exception: $_)" -ForegroundColor Red
        $script:FailCount++
    }
}

Write-Host "=============================================================================="
Write-Host "Running GMS Production Auto-Start Automated Verification Suite"
Write-Host "=============================================================================="

# Test 1: Verify file existence of critical scripts
Assert-Test -TestName "Test 1: Critical Files Existence Check" -TestCondition {
    return (Test-Path $ComposeFilePath) -and (Test-Path $EnvFilePath) -and (Test-Path $WatchdogPath) -and (Test-Path $RegisterTaskPath)
}

# Test 2: Static Analysis - Verify Strict Mode and ErrorActionPreference in Watchdog
Assert-Test -TestName "Test 2: Watchdog Strict Mode Analysis" -TestCondition {
    [string]$Content = Get-Content -Path $WatchdogPath -Raw
    return ($Content -match 'Set-StrictMode -Version Latest') -and ($Content -match '\$ErrorActionPreference\s*=\s*"Stop"')
}

# Test 3: Secret Leakage Scan in Watchdog Script
Assert-Test -TestName "Test 3: Secret Leakage Scan in Watchdog Script" -TestCondition {
    [string]$Content = Get-Content -Path $WatchdogPath -Raw
    return ($Content -notmatch 'POSTGRES_PASSWORD\s*=\s*"\w+"') -and ($Content -notmatch 'JWT_SECRET\s*=\s*"\w+"')
}

# Test 4: Docker Compose Production Syntax Validation
Assert-Test -TestName "Test 4: Compose Syntax Validation (Quiet Mode)" -TestCondition {
    & docker compose --env-file $EnvFilePath -f $ComposeFilePath config --quiet 2>&1
    return ($LASTEXITCODE -eq 0)
}

# Test 5: Verify Docker Runtime & Context
Assert-Test -TestName "Test 5: Docker Runtime Readiness" -TestCondition {
    $Info = & docker info 2>&1
    return ($LASTEXITCODE -eq 0)
}

# Test 6: Verify Container Health Checks in Compose File
Assert-Test -TestName "Test 6: Compose Healthcheck Configuration Check" -TestCondition {
    [string]$Content = Get-Content -Path $ComposeFilePath -Raw
    return ($Content -match 'restart:\s*unless-stopped') -and ($Content -match 'pg_isready') -and ($Content -match 'healthcheck:')
}

# Test 7: Verify Port Security (PostgreSQL port 5432/5433 NOT exposed in compose)
Assert-Test -TestName "Test 7: DB Isolation Security Check (No exposed DB ports in compose)" -TestCondition {
    [string]$Content = Get-Content -Path $ComposeFilePath -Raw
    [string]$PgSection = ($Content -split 'postgres:')[1]
    return ($PgSection -notmatch 'ports:')
}

Write-Host "=============================================================================="
Write-Host "TEST VERIFICATION SUMMARY: $PassCount PASSED, $FailCount FAILED"
Write-Host "=============================================================================="

if ($FailCount -eq 0) {
    exit 0
} else {
    exit 1
}
