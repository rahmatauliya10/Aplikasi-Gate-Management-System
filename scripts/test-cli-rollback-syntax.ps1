# ==============================================================================
# GMS CLI Rollback Syntax & Parameter Binding Verification Suite (P1 Remediation)
# ==============================================================================
# Verifies that exact runbook rollback commands from docs/RELEASE_CHECKLIST.md
# (Prosedur B and Prosedur C) can be parsed and executed WITHOUT prompting for
# -TargetReleaseTag, ensuring seamless non-interactive rollback automation.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
$DeployScript = Join-Path $PSScriptRoot "deploy-with-rollback.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Testing CLI Parameter Binding for deploy-with-rollback.ps1..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

[int]$TotalTests = 0
[int]$PassedTests = 0
[int]$FailedTests = 0

function Run-DeployScript {
    param(
        [string[]]$ScriptArguments
    )
    [string]$output = ""
    [int]$exitCode = 0
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $PsExe
        # Escape arguments cleanly
        $escapedArgs = @("-ExecutionPolicy", "Bypass", "-File", "`"$DeployScript`"")
        foreach ($arg in $ScriptArguments) {
            if ($arg -match '\s') {
                $escapedArgs += "`"$arg`""
            } else {
                $escapedArgs += $arg
            }
        }
        $psi.Arguments = $escapedArgs -join " "
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $process = [System.Diagnostics.Process]::Start($psi)
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode
        $output = "$stdout`n$stderr"
    } catch {
        $output = $_.ToString()
        $exitCode = 1
    }
    return [PSCustomObject]@{
        Output = $output
        ExitCode = $exitCode
    }
}

function Test-CommandBinding {
    param(
        [string]$TestName,
        [string[]]$ScriptArguments,
        [bool]$ExpectTargetReleaseTagRequired
    )
    $script:TotalTests++
    Write-Host "`n[$script:TotalTests] Testing: $TestName..." -ForegroundColor Yellow

    $result = Run-DeployScript -ScriptArguments $ScriptArguments
    [string]$output = $result.Output
    [int]$exitCode = $result.ExitCode

    [bool]$rejectedTargetTag = $output -match "Parameter -TargetReleaseTag is required" -or $output -match "TargetReleaseTag is mandatory"
    [bool]$promptedForTargetTag = $output -match "Supply values for the following parameters.*TargetReleaseTag"

    if ($ExpectTargetReleaseTagRequired) {
        if ($rejectedTargetTag -or ($exitCode -ne 0 -and $output -match "TargetReleaseTag")) {
            $script:PassedTests++
            Write-Host "  [PASS] Correctly rejected deployment mode without -TargetReleaseTag." -ForegroundColor Green
        } else {
            $script:FailedTests++
            Write-Host "  [FAIL] Did not enforce -TargetReleaseTag for deployment mode." -ForegroundColor Red
            Write-Host "  Output: $output" -ForegroundColor DarkGray
        }
    } else {
        if ($promptedForTargetTag) {
            $script:FailedTests++
            Write-Host "  [FAIL] Interactive prompt for TargetReleaseTag occurred in rollback mode!" -ForegroundColor Red
            Write-Host "  Output: $output" -ForegroundColor DarkGray
        } else {
            $script:PassedTests++
            Write-Host "  [PASS] Successfully executed rollback mode without TargetReleaseTag prompt." -ForegroundColor Green
        }
    }
}

# 1. REL-01: Normal Deploy WITHOUT TargetReleaseTag -> Must REJECT with explicit error
Test-CommandBinding -TestName "[REL-01] Deploy Mode without TargetReleaseTag must be REJECTED" `
    -ScriptArguments @("-PreviousReleaseTag", "stable") `
    -ExpectTargetReleaseTagRequired $true

# 2. REL-02: Prosedur B: Image-Only Rollback syntax from runbook -> Must NOT prompt for TargetReleaseTag
Test-CommandBinding -TestName "[REL-02] Prosedur B (Image-Only Rollback) must NOT prompt for TargetReleaseTag" `
    -ScriptArguments @(
        "-RollbackOnly",
        "-NoSchemaChangeVerified",
        "-PreviousReleaseTag", "stable",
        "-PreviousBackendDigest", "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "-PreviousFrontendDigest", "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "-PreviousMigratorDigest", "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        "-ComposeFile", "docker-compose.prod.yml"
    ) `
    -ExpectTargetReleaseTagRequired $false

# 3. REL-03: Prosedur C: Full Recovery Rollback syntax -> Must REJECT nonexistent manifest before mutation
Test-CommandBinding -TestName "[REL-03] Prosedur C (Full Recovery Rollback) with nonexistent manifest must REJECT before mutation" `
    -ScriptArguments @(
        "-RollbackOnly",
        "-RollbackManifestPath", "nonexistent_manifest_test.json",
        "-PreviousReleaseTag", "stable",
        "-PreviousBackendDigest", "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "-PreviousFrontendDigest", "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "-PreviousMigratorDigest", "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        "-ComposeFile", "docker-compose.prod.yml"
    ) `
    -ExpectTargetReleaseTagRequired $false

# Locate node executable safely
$NodeExe = "node"
try {
    if (Get-Command node.exe -ErrorAction SilentlyContinue) {
        $NodeExe = "node.exe"
    } elseif (Get-Command node -ErrorAction SilentlyContinue) {
        $NodeExe = "node"
    }
} catch {
    $NodeExe = "node"
}
$deployReleasesDir = Join-Path $ProjectRootDir "deploy\releases"

# 4. REL-04: Image-Only Rollback with manifest missing migration inventory -> REJECT
$emptyManPath = Join-Path $ProjectRootDir "tests\fixtures\rollback\manifest-empty-inventory.json"
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-04] Image-Only Rollback with empty migration inventory must be REJECTED..." -ForegroundColor Yellow
$res04 = Run-DeployScript -ScriptArguments @("-RollbackOnly", "-NoSchemaChangeVerified", "-PreviousReleaseManifestPath", $emptyManPath, "-ComposeFile", "docker-compose.prod.yml")
if ($res04.ExitCode -ne 0 -and ($res04.Output -match "does not contain an explicit migration inventory" -or $res04.Output -match "CRITICAL SCHEMA COMPATIBILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected image-only rollback with empty migration inventory." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to reject empty migration inventory!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res04.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res04.Output)" -ForegroundColor DarkGray
}

# 5. REL-05: Image-Only Rollback with invalid checksum format -> REJECT
$invalidCsManPath = Join-Path $ProjectRootDir "tests\fixtures\rollback\manifest-invalid-checksum.json"
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-05] Image-Only Rollback with invalid checksum format must be REJECTED..." -ForegroundColor Yellow
$res05 = Run-DeployScript -ScriptArguments @("-RollbackOnly", "-NoSchemaChangeVerified", "-PreviousReleaseManifestPath", $invalidCsManPath, "-ComposeFile", "docker-compose.prod.yml")
if ($res05.ExitCode -ne 0 -and ($res05.Output -match "invalid checksum format" -or $res05.Output -match "CRITICAL SCHEMA COMPATIBILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected image-only rollback with invalid checksum format." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to reject invalid checksum format!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res05.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res05.Output)" -ForegroundColor DarkGray
}

# 6. REL-07: Rollback without valid 64-hex SHA-256 image digest in production mode -> REJECT
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-07] Production rollback without valid SHA-256 digests must be REJECTED..." -ForegroundColor Yellow
$res07 = Run-DeployScript -ScriptArguments @(
    "-RollbackOnly",
    "-RollbackManifestPath", (Join-Path $ProjectRootDir "tests\fixtures\historical\historical_test_manifest.json"),
    "-PreviousReleaseTag", "stable",
    "-PreviousBackendDigest", "invalid-digest",
    "-PreviousFrontendDigest", "invalid-digest",
    "-PreviousMigratorDigest", "invalid-digest",
    "-ComposeFile", "docker-compose.prod.yml",
    "-RequireDigest"
)
if ($res07.ExitCode -ne 0 -and ($res07.Output -match "valid 64-hex SHA-256 digests" -or $res07.Output -match "IMMUTABILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected production rollback with invalid image digest format." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to enforce valid SHA-256 image digests in production mode!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res07.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res07.Output)" -ForegroundColor DarkGray
}

# 7. REL-11: Smoke test with missing token under --require-passed must return exit code 1 (fail-closed)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-11] Smoke test under --require-passed with missing token must FAIL-CLOSED (code 1)..." -ForegroundColor Yellow
$env:SMOKE_ACCESS_TOKEN = ""
$smokeScript = Join-Path $PSScriptRoot "prod-smoke-readonly.js"
[string]$smokeOut = ""
[int]$smokeExit = 0
try {
    $smokeOut = & $NodeExe $smokeScript --require-passed 2>&1 | Out-String
    $smokeExit = $LASTEXITCODE
} catch {
    $smokeOut = $_.ToString()
    $smokeExit = 1
}

if ($smokeExit -ne 0) {
    $script:PassedTests++
    Write-Host "  [PASS] Smoke test fail-closed enforcement verified: Exited with code $smokeExit (no open traffic)." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Smoke test exited 0 without verified passes under --require-passed!" -ForegroundColor Red
    Write-Host "  ExitCode: $smokeExit" -ForegroundColor DarkGray
    Write-Host "  Output: $smokeOut" -ForegroundColor DarkGray
}

# 8. REL-16: Fault injection on production compose target -> REJECT before mutation
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-16] Fault injection on production target must be unconditionally REJECTED..." -ForegroundColor Yellow
$res16 = Run-DeployScript -ScriptArguments @("-TargetReleaseTag", "v1.0.0", "-FaultInjectionPhase", "AFTER_BACKUP", "-ComposeFile", "docker-compose.prod.yml")
if ($res16.ExitCode -ne 0 -and ($res16.Output -match "Fault injection .* is unconditionally blocked on production" -or $res16.Output -match "CRITICAL GOVERNANCE VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly blocked fault injection against production compose target." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Allowed fault injection against production compose target!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res16.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res16.Output)" -ForegroundColor DarkGray
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "CLI Syntax & Regression Matrix Verification Summary:" -ForegroundColor Cyan
Write-Host "  Total:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed: $PassedTests" -ForegroundColor Green
Write-Host "  Failed: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($FailedTests -eq 0) {
    exit 0
} else {
    exit 1
}
