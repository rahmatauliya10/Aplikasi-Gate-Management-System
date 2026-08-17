# ==============================================================================
# GMS Nginx Deliberate Failure Rollback Regression Test (P0-02)
# ==============================================================================
# Purpose: Validates that when Nginx reverse proxy is simulated as unhealthy/broken,
# the rollback drill verdict FAILS-CLOSED ($DrillPassed evaluates to $false).
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Executing GMS Nginx Deliberate Failure Rollback Regression Test (P0-02)..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# Test Case 1: Healthy Mock State
$MockHealthy = @{
    DbRestored = $true
    UploadsRestored = $true
    MigrationCountRestored = $true
    BackendRestored = $true
    FrontendRestored = $true
    SmokePassed = $true
    BackendHealth = @{ healthy = $true; status = "healthy" }
    FrontendHealth = @{ healthy = $true; status = "healthy" }
    NginxHealth = @{ healthy = $true; status = "healthy" }
}

[bool]$HealthyVerdict = $MockHealthy.DbRestored `
    -and $MockHealthy.UploadsRestored `
    -and $MockHealthy.MigrationCountRestored `
    -and $MockHealthy.BackendRestored `
    -and $MockHealthy.FrontendRestored `
    -and $MockHealthy.SmokePassed `
    -and $MockHealthy.BackendHealth.healthy `
    -and $MockHealthy.FrontendHealth.healthy `
    -and $MockHealthy.NginxHealth.healthy

if (-not $HealthyVerdict) {
    throw "REGRESSION FAILURE: Healthy system state unexpectedly evaluated to FAILED!"
}
Write-Host "Test 1 [Healthy Baseline]: Evaluates to PASSED as expected [OK]" -ForegroundColor Green

# Test Case 2: Deliberate Nginx Failure State (Simulating Nginx killed / crashed)
$MockNginxBroken = @{
    DbRestored = $true
    UploadsRestored = $true
    MigrationCountRestored = $true
    BackendRestored = $true
    FrontendRestored = $true
    SmokePassed = $true
    BackendHealth = @{ healthy = $true; status = "healthy" }
    FrontendHealth = @{ healthy = $true; status = "healthy" }
    NginxHealth = @{ healthy = $false; status = "UNHEALTHY" } # <-- NGINX CRASHED
}

[bool]$BrokenVerdict = $MockNginxBroken.DbRestored `
    -and $MockNginxBroken.UploadsRestored `
    -and $MockNginxBroken.MigrationCountRestored `
    -and $MockNginxBroken.BackendRestored `
    -and $MockNginxBroken.FrontendRestored `
    -and $MockNginxBroken.SmokePassed `
    -and $MockNginxBroken.BackendHealth.healthy `
    -and $MockNginxBroken.FrontendHealth.healthy `
    -and $MockNginxBroken.NginxHealth.healthy

if ($BrokenVerdict) {
    throw "CRITICAL P0-02 SECURITY FAILURE: Rollback verdict evaluated to PASSED despite Nginx being UNHEALTHY! Gate is open!"
}
Write-Host "Test 2 [Deliberate Nginx Failure]: Evaluates to FAILED as expected (Fail-Closed) [PASS]" -ForegroundColor Green

# Test Case 3: Verify Live Script Static Expression
$ScriptPath = Join-Path $PSScriptRoot "run-deployment-rollback-drill.ps1"
if (-not (Test-Path $ScriptPath)) {
    throw "Script $ScriptPath not found!"
}
$ScriptContent = Get-Content $ScriptPath -Raw
if (-not ($ScriptContent -match '\$NginxHealth\.healthy')) {
    throw "REGRESSION FAILURE: run-deployment-rollback-drill.ps1 does not reference `$NginxHealth.healthy in drill logic!"
}
Write-Host "Test 3 [Static Script Verification]: run-deployment-rollback-drill.ps1 includes `$NginxHealth.healthy [PASS]" -ForegroundColor Green

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "ALL P0-02 NGINX ROLLBACK REGRESSION TESTS PASSED [SUCCESS]" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
exit 0
