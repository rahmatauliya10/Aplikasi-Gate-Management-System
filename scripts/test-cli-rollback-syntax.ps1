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

function Test-CommandBinding {
    param(
        [string]$TestName,
        [string[]]$ScriptArguments,
        [bool]$ExpectTargetReleaseTagRequired
    )
    $script:TotalTests++
    Write-Host "`n[$script:TotalTests] Testing: $TestName..." -ForegroundColor Yellow

    [string]$output = ""
    [int]$exitCode = 0

    try {
        $output = & $PsExe -ExecutionPolicy Bypass -File $DeployScript @ScriptArguments 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } catch {
        $output = $_.ToString()
        $exitCode = 1
    }

    [bool]$rejectedTargetTag = $output -match "Parameter -TargetReleaseTag is required" -or $output -match "TargetReleaseTag is mandatory"
    [bool]$promptedForTargetTag = $output -match "Supply values for the following parameters.*TargetReleaseTag"

    if ($ExpectTargetReleaseTagRequired) {
        if ($rejectedTargetTag) {
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

# 1. Normal Deploy WITHOUT TargetReleaseTag -> Must REJECT with explicit error
Test-CommandBinding -TestName "Deploy Mode without TargetReleaseTag must be REJECTED" `
    -ScriptArguments @("-PreviousReleaseTag", "stable") `
    -ExpectTargetReleaseTagRequired $true

# 2. Prosedur B: Image-Only Rollback syntax from runbook -> Must NOT prompt for TargetReleaseTag
Test-CommandBinding -TestName "Prosedur B (Image-Only Rollback) must NOT prompt for TargetReleaseTag" `
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

# 3. Prosedur C: Full Recovery Rollback syntax from runbook -> Must NOT prompt for TargetReleaseTag
Test-CommandBinding -TestName "Prosedur C (Full Recovery Rollback) must NOT prompt for TargetReleaseTag" `
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

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "CLI Syntax Verification Summary:" -ForegroundColor Cyan
Write-Host "  Total:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed: $PassedTests" -ForegroundColor Green
Write-Host "  Failed: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($FailedTests -eq 0) {
    exit 0
} else {
    exit 1
}
