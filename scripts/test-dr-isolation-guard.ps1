# ==============================================================================
# GMS DR Isolation Guard & Ephemeral Fixture Governance Test Suite (FIX-01 / FIX-02 / FIX-05)
# ==============================================================================
# Verifies zero-operational-mutation guarantees and fail-closed isolation guards
# across disaster recovery drill protocols and restore procedures:
#
# Scenarios Tested:
#   1. Rejection of operational container ('gate-system-postgres') when drill mode active
#   2. Rejection of operational database ('gms') when drill mode active
#   3. Rejection of operational uploads directory ($ProjectRootDir/uploads)
#   4. Rejection of operational maintenance flag path ($ProjectRootDir/maintenance.flag)
#   5. Rejection of fault injection against production identifiers ('prod')
#   6. Rejection of fault injection without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE
#   7. Rejection of operational fixture prefix in run-restore-failure-drill.ps1
#   8. Rejection of duplicate database restore for same RecoveryOperationId (FIX-05)
#
# Generates evidence: artifacts/release-proof/dr-isolation-guard-evidence.json
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = "",

    [Parameter(Mandatory=$false)]
    [switch]$AllowSkipIfDockerUnavailable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

[string]$ProjectRootDir = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
if (-not $ArtifactsDir) {
    $ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts/release-proof"
}
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

$RestoreScript = Join-Path $PSScriptRoot "gms-production-restore.ps1"
$DrillScript = Join-Path $PSScriptRoot "run-restore-failure-drill.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Starting DR Isolation Guard & Ephemeral Governance Test Suite (FIX-01/FIX-02)..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

[int]$TotalTests = 0
[int]$PassedTests = 0
[int]$FailedTests = 0
$script:TestResults = @()

function Assert-GuardFailure {
    param(
        [string]$ScenarioId,
        [string]$Description,
        [scriptblock]$Action,
        [string[]]$ExpectedKeywords
    )

    $script:TotalTests++
    Write-Host "`n[$ScenarioId] Testing: $Description..." -ForegroundColor Yellow
    [datetime]$startTime = Get-Date

    [string]$rawOutput = ""
    [int]$exitCode = 0
    [bool]$threwException = $false

    try {
        $rawOutput = & $Action 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } catch {
        $threwException = $true
        $rawOutput = $_.ToString()
        $exitCode = 1
    }

    [bool]$hasAllKeywords = $true
    [array]$missingKeywords = @()
    foreach ($kw in $ExpectedKeywords) {
        if ($rawOutput -notmatch [regex]::Escape($kw)) {
            $hasAllKeywords = $false
            $missingKeywords += $kw
        }
    }

    [bool]$passed = ($exitCode -ne 0 -or $threwException) -and $hasAllKeywords
    [double]$duration = ((Get-Date) - $startTime).TotalSeconds

    if ($passed) {
        $script:PassedTests++
        Write-Host "  [PASS] Successfully rejected ($([math]::Round($duration, 2))s)" -ForegroundColor Green
        Write-Host "         Matched expected governance keywords: $($ExpectedKeywords -join ', ')" -ForegroundColor DarkGreen
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] Guard violation! ExitCode=$exitCode, Threw=$threwException" -ForegroundColor Red
        if ($missingKeywords.Count -gt 0) {
            Write-Host "         Missing expected keywords: $($missingKeywords -join ', ')" -ForegroundColor Red
        }
        Write-Host "         Captured Output: `n$rawOutput" -ForegroundColor DarkRed
    }

    $script:TestResults += @{
        scenarioId = $ScenarioId
        description = $Description
        status = if ($passed) { "PASSED" } else { "FAILED" }
        exitCode = $exitCode
        durationSeconds = [math]::Round($duration, 2)
        expectedKeywords = $ExpectedKeywords
        missingKeywords = $missingKeywords
    }
}

# Create temporary scratch directory for isolated fixtures
[string]$TempTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gms_dr_guard_test_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -Path $TempTestDir -ItemType Directory -Force | Out-Null
[string]$TempMaintDir = Join-Path $TempTestDir "maintenance"
[string]$TempUploadsDir = Join-Path $TempTestDir "uploads"
[string]$TempLogsDir = Join-Path $TempTestDir "logs"
New-Item -Path $TempMaintDir -ItemType Directory -Force | Out-Null
New-Item -Path $TempUploadsDir -ItemType Directory -Force | Out-Null
New-Item -Path $TempLogsDir -ItemType Directory -Force | Out-Null

# Create synthetic verified test dump and manifest to satisfy Step 1 checksum verification
[string]$TempDumpPath = Join-Path $TempTestDir "mock_test.dump"
Set-Content -Path $TempDumpPath -Value "GMS_DR_MOCK_DUMP_CONTENT_FOR_GUARD_TEST" -Encoding utf8
$dumpHash = (Get-FileHash -Path $TempDumpPath -Algorithm SHA256).Hash.ToLower()

[string]$TempManifestPath = Join-Path $TempTestDir "mock_test_manifest.json"
$mockManifest = @{
    backupId = "BACKUP-MOCK-GUARD-TEST"
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    artifacts = @{
        dump = "mock_test.dump"
    }
    checksums = @{
        dump = $dumpHash
    }
}
Set-Content -Path $TempManifestPath -Value ($mockManifest | ConvertTo-Json -Depth 5) -Encoding utf8

try {
    # --------------------------------------------------------------------------
    # Scenario 1: Rejection of operational container 'gate-system-postgres'
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-01" `
        -Description "Reject drill restore targeting operational container 'gate-system-postgres'" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -LiveContainer "gate-system-postgres" `
                -LiveDbName "gms_fixture_db" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "operational container name")

    # --------------------------------------------------------------------------
    # Scenario 2: Rejection of operational database 'gms'
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-02" `
        -Description "Reject drill restore targeting operational database 'gms'" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "operational database name")

    # --------------------------------------------------------------------------
    # Scenario 3: Rejection of operational uploads directory
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-03" `
        -Description "Reject drill restore targeting operational project uploads directory" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            [string]$realUploads = Join-Path $ProjectRootDir "uploads"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms_fixture_db" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $realUploads `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "operational project uploads")

    # --------------------------------------------------------------------------
    # Scenario 4: Rejection of operational maintenance flag path
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-04" `
        -Description "Reject drill restore targeting operational project maintenance directory" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            [string]$realMaint = Join-Path $ProjectRootDir "maintenance"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms_fixture_db" `
                -MaintenanceDir $realMaint `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "operational project root")

    # --------------------------------------------------------------------------
    # Scenario 5: Rejection of fault injection against production identifier
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-05" `
        -Description "Reject fault injection when target database contains 'prod'" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -FaultInjectionPhase "PRE_PROMOTION" `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms_prod_db" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "identified as PRODUCTION")

    # --------------------------------------------------------------------------
    # Scenario 6: Rejection of fault injection without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-06" `
        -Description "Reject fault injection when GMS_ISOLATED_DRILL_ENVIRONMENT is absent" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = ""
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -FaultInjectionPhase "PRE_PROMOTION" `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms_test_fixture" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "verified isolated drill environment")

    # --------------------------------------------------------------------------
    # Scenario 7: Rejection of operational fixture prefix in run-restore-failure-drill.ps1
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-07" `
        -Description "Reject drill runner invocation when custom prefix attempts to match operational target" `
        -Action {
            & $PsExe -ExecutionPolicy Bypass -File $DrillScript `
                -CustomFixturePrefix "gate-system-postgres" 2>&1
        } `
        -ExpectedKeywords @("CRITICAL GOVERNANCE VIOLATION", "Ephemeral fixture identity must NOT match operational targets")

    # --------------------------------------------------------------------------
    # Scenario 8: Rejection of duplicate database restore for same RecoveryOperationId
    # --------------------------------------------------------------------------
    Assert-GuardFailure `
        -ScenarioId "GUARD-08" `
        -Description "Reject duplicate restore attempt when recovery operation ID was already executed" `
        -Action {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            [string]$dupOpId = "REC-DRILL-DUP-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
            $ledgerData = @{
                recoveryOperationId = $dupOpId
                dbRestoreExecuted = $true
                dbRestoreExecutedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            }
            Set-Content -Path (Join-Path $TempMaintDir "recovery-state.json") -Value ($ledgerData | ConvertTo-Json) -Encoding utf8

            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $TempManifestPath `
                -LiveContainer "gms-fixture-container" `
                -LiveDbName "gms_fixture_db" `
                -MaintenanceDir $TempMaintDir `
                -UploadsDirectory $TempUploadsDir `
                -LogDirectory $TempLogsDir `
                -RecoveryOperationId $dupOpId `
                -Force 2>&1
        } `
        -ExpectedKeywords @("CRITICAL RECOVERY VIOLATION", "Duplicate database restore rejected")

} finally {
    $env:GMS_ISOLATED_DRILL_ENVIRONMENT = ""
    if (Test-Path $TempTestDir) {
        Remove-Item -Path $TempTestDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "DR Isolation Guard Test Summary:" -ForegroundColor Cyan
Write-Host "  Total Tests:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed Tests: $PassedTests" -ForegroundColor Green
Write-Host "  Failed Tests: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

$EvidenceObj = @{
    reportTitle = "GMS DR Isolation Guard & Ephemeral Fixture Governance Test Evidence (FIX-01/FIX-02/FIX-05)"
    engine = "PowerShell Native Target Guard Verification Suite"
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    status = if ($FailedTests -eq 0 -and $PassedTests -eq $TotalTests) { "PASSED" } else { "FAILED" }
    summary = @{
        total = $TotalTests
        passed = $PassedTests
        failed = $FailedTests
    }
    cases = $script:TestResults
}

$EvidenceJsonPath = Join-Path $ArtifactsDir "dr-isolation-guard-evidence.json"
Set-Content -Path $EvidenceJsonPath -Value ($EvidenceObj | ConvertTo-Json -Depth 5) -Encoding utf8
Write-Host "Saved DR isolation guard evidence to $EvidenceJsonPath"

if ($FailedTests -eq 0 -and $PassedTests -eq $TotalTests) {
    Write-Host "SUCCESS: All DR isolation guard assertions PASSED ($PassedTests/$TotalTests)!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "ERROR: DR isolation guard assertions FAILED ($PassedTests/$TotalTests)!" -ForegroundColor Red
    exit 1
}
