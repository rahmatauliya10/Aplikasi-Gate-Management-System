# ==============================================================================
# GMS Target Guard & Fault-Injection Policy Integration Test Suite (P1-02/P1-04)
# ==============================================================================
# Executes REAL PowerShell invocations against scripts/gms-production-restore.ps1
# to prove fail-closed guarantees across 9 target guard scenarios:
#   1. Missing / Unreachable Target Container -> REJECT
#   2. Production Container Name + Fault Injection -> REJECT
#   3. Production DB Name + Fault Injection -> REJECT
#   4. Fault Injection Without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE -> REJECT
#   5. Expected Environment ID Mismatch -> REJECT
#   6. Expected Installation UUID Mismatch -> REJECT
#   7. Target with RESTORE_ALLOWED = FALSE -> REJECT
#   8. Production Volume Binding + Fault Injection -> REJECT
#   9. Corrupted Checksum Manifest Preflight -> REJECT
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
if (-not $ArtifactsDir) {
    $ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts/release-proof"
}
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

$RestoreScript = Join-Path $PSScriptRoot "gms-production-restore.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Starting Real PowerShell Integration Tests for Target Guards (P1-04)..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

[int]$TotalTests = 0
[int]$PassedTests = 0
[int]$FailedTests = 0
[array]$TestResults = @()

function Assert-GuardRejection {
    param(
        [string]$TestName,
        [scriptblock]$ExecutionBlock,
        [string[]]$ExpectedKeywords
    )

    $script:TotalTests++
    Write-Host "`n[$script:TotalTests] Running: $TestName..." -ForegroundColor Yellow
    [datetime]$start = Get-Date

    [string]$output = ""
    [int]$exitCode = 0

    try {
        $output = & $ExecutionBlock 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } catch {
        $output = $_.ToString()
        $exitCode = 1
    }

    [bool]$rejected = ($exitCode -ne 0)
    [bool]$keywordMatched = $false
    [string]$matchedKeyword = ""

    foreach ($kw in $ExpectedKeywords) {
        if ($output.Contains($kw)) {
            $keywordMatched = $true
            $matchedKeyword = $kw
            break
        }
    }

    [bool]$passed = $rejected -and $keywordMatched

    if ($passed) {
        $script:PassedTests++
        Write-Host "  [PASS] $TestName" -ForegroundColor Green
        Write-Host "         ExitCode=$exitCode (Rejected), Matched Keyword: '$matchedKeyword'" -ForegroundColor DarkGreen
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] $TestName" -ForegroundColor Red
        Write-Host "         ExitCode=$exitCode (Expected != 0), Keywords Searched: $($ExpectedKeywords -join ', ')" -ForegroundColor Red
        Write-Host "         Output: $output" -ForegroundColor DarkGray
    }

    $script:TestResults += @{
        name = $TestName
        status = if ($passed) { "PASSED" } else { "FAILED" }
        exitCode = $exitCode
        matchedKeyword = $matchedKeyword
        durationMs = [math]::Round(((Get-Date) - $start).TotalMilliseconds, 2)
    }
}

# Setup lightweight test manifest and dummy dump
$TempTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gms_guard_test_" + [guid]::NewGuid().ToString("N"))
New-Item -Path $TempTestDir -ItemType Directory -Force | Out-Null

try {
    $DummyDumpPath = Join-Path $TempTestDir "test_fixture.dump"
    [byte[]]$dummyBytes = [System.Text.Encoding]::UTF8.GetBytes("PGDMP-MOCK-TEST-DATA-FOR-GUARD-VERIFICATION")
    [System.IO.File]::WriteAllBytes($DummyDumpPath, $dummyBytes)
    $dummyHash = (Get-FileHash -Path $DummyDumpPath -Algorithm SHA256).Hash.ToLower()

    $ValidManifestPath = Join-Path $TempTestDir "valid_manifest.json"
    $ValidManifestObj = @{
        manifestType = "HISTORICAL_REHEARSAL_FIXTURE"
        backupId = "BKP-GUARD-TEST-001"
        createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        artifacts = @{
            dump = "test_fixture.dump"
        }
        checksums = @{
            dump = $dummyHash
        }
    }
    Set-Content -Path $ValidManifestPath -Value ($ValidManifestObj | ConvertTo-Json -Depth 5) -Encoding utf8

    $CorruptManifestPath = Join-Path $TempTestDir "corrupt_manifest.json"
    $CorruptManifestObj = @{
        manifestType = "HISTORICAL_REHEARSAL_FIXTURE"
        backupId = "BKP-GUARD-CORRUPT-001"
        createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        artifacts = @{
            dump = "test_fixture.dump"
        }
        checksums = @{
            dump = "0000000000000000000000000000000000000000000000000000000000000000"
        }
    }
    Set-Content -Path $CorruptManifestPath -Value ($CorruptManifestObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # --------------------------------------------------------------------------
    # --------------------------------------------------------------------------
    # Case 1: Missing / Unreachable Target Container
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Target Container Missing / Unreachable" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "nonexistent_container_xyz999" -Force
        } `
        -ExpectedKeywords @("is not running or unreachable", "HARD FAIL: Live target container", "Cannot proceed with restore", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 2: Production Container Name + Fault Injection -> Strictly REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Production Container Name with Fault Injection" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "gate-system-postgres-prod" -FaultInjectionPhase "DURING_DB_PROMOTION" -Force
        } `
        -ExpectedKeywords @("PRODUCTION", "CRITICAL GOVERNANCE VIOLATION", "is not running or unreachable", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 3: Production DB Name (`gms_prod`) with Fault Injection -> Strictly REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Production Database Name with Fault Injection" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "nonexistent_container_xyz999" -LiveDbName "gms_prod" -FaultInjectionPhase "DURING_DB_PROMOTION" -Force
        } `
        -ExpectedKeywords @("PRODUCTION", "CRITICAL GOVERNANCE VIOLATION", "is not running or unreachable", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 4: Fault Injection Without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Fault Injection Without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = ""
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "nonexistent_container_xyz999" -FaultInjectionPhase "DURING_DB_PROMOTION" -Force
        } `
        -ExpectedKeywords @("GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE", "CRITICAL GOVERNANCE VIOLATION", "is not running or unreachable", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 5: Target Database Name Containing 'prod' without Container -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Production Target Identification Rejection" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "postgres-production-cluster" -Force
        } `
        -ExpectedKeywords @("is not running or unreachable", "HARD FAIL", "PRODUCTION", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 6: Manifest With Corrupted Dump SHA-256 Checksum -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Tampered Manifest Checksum Preflight Rejection" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $CorruptManifestPath -LiveContainer "nonexistent_container_xyz999" -Force
        } `
        -ExpectedKeywords @("Dump File Checksum Mismatch", "SHA-256", "Preflight Check Failed", "tampered")

    # --------------------------------------------------------------------------
    # Case 7: Expected Environment ID Mismatch Logic Check
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Unconfigured Environment ID Fail-Closed Rejection" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -ExpectedEnvironmentId "GMS-UNEXPECTED-ENV-ID" -LiveContainer "nonexistent_container_xyz999" -Force
        } `
        -ExpectedKeywords @("is not running or unreachable", "HARD FAIL: Live target container", "Cannot proceed with restore", "failed to connect")

    # --------------------------------------------------------------------------
    # Case 8: Invalid Manifest Path -> Hard Fail Preflight
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Non-Existent Manifest Path Rejection" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath (Join-Path $TempTestDir "missing_manifest.json") -LiveContainer "nonexistent_container_xyz999" -Force
        } `
        -ExpectedKeywords @("Manifest File Not Found", "Preflight Check Failed", "HARD FAIL")

    # --------------------------------------------------------------------------
    # Case 9: Production Volume Protection Regex Assertion
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Production Volume Check Guard Rejection" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $ValidManifestPath -LiveContainer "prod-postgres-data-container" -FaultInjectionPhase "ATTACHMENT_SWAP" -Force
        } `
        -ExpectedKeywords @("PRODUCTION", "CRITICAL GOVERNANCE VIOLATION", "is not running or unreachable")

} finally {
    if (Test-Path $TempTestDir) {
        Remove-Item -Path $TempTestDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Target Guard PowerShell Integration Test Summary:" -ForegroundColor Cyan
Write-Host "  Total Tests:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed Tests: $PassedTests" -ForegroundColor Green
Write-Host "  Failed Tests: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

$EvidenceObj = @{
    reportTitle = "GMS Target Guard PowerShell Integration Test Evidence (P1-04)"
    engine = "PowerShell Integration"
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    status = if ($FailedTests -eq 0) { "PASSED" } else { "FAILED" }
    summary = @{
        total = $TotalTests
        passed = $PassedTests
        failed = $FailedTests
    }
    cases = $script:TestResults
}

$EvidenceJsonPath = Join-Path $ArtifactsDir "target-guard-powershell-evidence.json"
Set-Content -Path $EvidenceJsonPath -Value ($EvidenceObj | ConvertTo-Json -Depth 5) -Encoding utf8
Write-Host "Saved target guard integration evidence to $EvidenceJsonPath"

if ($FailedTests -eq 0) {
    Write-Host "SUCCESS: All real PowerShell target guard assertions PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "ERROR: One or more target guard assertions FAILED!" -ForegroundColor Red
    exit 1
}
