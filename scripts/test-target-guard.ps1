# ==============================================================================
# GMS Target Guard & Fault-Injection Policy Integration Test Suite (P0-C / P0-D Hardened)
# ==============================================================================
# Executes REAL PowerShell invocations against scripts/gms-production-restore.ps1
# using an EPHEMERAL ISOLATED TARGET FIXTURE (gms-guard-fixture-<run-id>)
# to prove fail-closed guarantees across 9 target guard scenarios:
#   1. Missing / Unreachable Target Container -> REJECT (Container Missing Guard)
#   2. Real Container Target with Wrong Environment ID -> REJECT (FINGERPRINT MISMATCH)
#   3. Real Container Target with Wrong Installation UUID -> REJECT (FINGERPRINT MISMATCH)
#   4. Real Container Target with GMS_RESTORE_ALLOWED = 'FALSE' -> REJECT (RESTORE BLOCKED)
#   5. Real Container Target with Production Environment ID + Fault Injection -> REJECT (GOVERNANCE VIOLATION)
#   6. Real Container Target with Fault Injection without GMS_ISOLATED_DRILL_ENVIRONMENT -> REJECT
#   7. Real Container Target with Production DB Name + Fault Injection -> REJECT
#   8. Corrupted Checksum Manifest Preflight -> REJECT
#   9. Non-existent Manifest File Path -> REJECT
#
# Proves ZERO MUTATION: Compares full data, configuration, and environment fingerprint
# before and after all 9 negative tests.
# OPERATIONAL ISOLATION: Never interacts with, mutates, or starts operational 'gate-system-postgres'
# Never deletes or modifies operational maintenance flags or operational AppSettings.
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
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Starting Isolated Target Guard PowerShell Integration Suite (P0-C / P0-D)..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# Check Docker daemon availability (FAIL-CLOSED: Never claim false PASS)
# ------------------------------------------------------------------------------
[bool]$DockerAvailable = $false
try {
    $rawDocker = & docker ps 2>&1
    if ($LASTEXITCODE -eq 0) { $DockerAvailable = $true }
} catch {}

if (-not $DockerAvailable) {
    Write-Host "[WARN] Docker daemon is not available on this host. Cannot execute containerized assertions." -ForegroundColor Yellow
    $EvidenceObj = @{
        reportTitle = "GMS Target Guard PowerShell Integration Test Evidence (P0-C / P0-D Hardened)"
        engine = "PowerShell Integration with Isolated Ephemeral Target Fixture"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "NOT_EXECUTED"
        note = "Docker daemon not running on this host; containerized assertions NOT EXECUTED. Zero false PASS reported."
        summary = @{
            total = 9
            passed = 0
            failed = 0
            notExecuted = 9
        }
    }
    $EvidenceJsonPath = Join-Path $ArtifactsDir "target-guard-powershell-evidence.json"
    Set-Content -Path $EvidenceJsonPath -Value ($EvidenceObj | ConvertTo-Json -Depth 5) -Encoding utf8
    
    if ($AllowSkipIfDockerUnavailable) {
        Write-Host "::warning file=scripts/test-target-guard.ps1,title=DockerNotAvailable::Docker not available; target guard skipped with status NOT_EXECUTED."
        exit 0
    } else {
        Write-Host "::error file=scripts/test-target-guard.ps1,title=DockerUnavailableRequiredGate::Docker daemon not available. Required integration test cannot pass without actual container execution."
        exit 1
    }
}

# ------------------------------------------------------------------------------
# Operational Container Isolation Guard
# ------------------------------------------------------------------------------
[string]$operationalContainerId = ""
try {
    $rawOp = (& docker ps -a -q -f "name=^/gate-system-postgres$" 2>$null | Out-String).Trim()
    if ($rawOp) { $operationalContainerId = $rawOp }
} catch {}

if ($operationalContainerId) {
    Write-Host "[ISOLATION GUARD] Operational container 'gate-system-postgres' ($operationalContainerId) detected." -ForegroundColor Green
    Write-Host "[ISOLATION GUARD] Test suite will spawn a completely isolated ephemeral fixture and NEVER touch 'gate-system-postgres'." -ForegroundColor Green
}

# Generate unique run ID and fixture parameters
[string]$TestRunId = [guid]::NewGuid().ToString("N").Substring(0, 8)
[string]$TargetContainer = "gms-guard-fixture-$TestRunId"
[string]$TargetDb = "gms_guard_$TestRunId"
[string]$TargetUser = "postgres"
[string]$TargetPass = "testpassword"
[string]$KnownEnvId = "GMS-DRILL-SJA-01"
[string]$KnownInstallUuid = "4f53a720-911b-4f9e-a89b-8321481dc901"

# Determine an available ephemeral port
function Get-AvailablePort {
    param([int]$DefaultPort = 5439)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $p = ($listener.LocalEndpoint).Port
        $listener.Stop()
        return $p.ToString()
    } catch {
        return $DefaultPort.ToString()
    }
}
[string]$TargetPort = Get-AvailablePort -DefaultPort 5439

[int]$TotalTests = 0
[int]$PassedTests = 0
[int]$FailedTests = 0
[array]$TestResults = @()

$TempTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gms_guard_test_" + $TestRunId)
New-Item -Path $TempTestDir -ItemType Directory -Force | Out-Null

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
    $global:LASTEXITCODE = 0

    try {
        $output = & $ExecutionBlock *>&1 | Out-String
        if (Test-Path Variable:LASTEXITCODE) {
            $exitCode = if ($global:LASTEXITCODE -ne 0) { $global:LASTEXITCODE } else { 0 }
        }
        if ($exitCode -eq 0 -and ($output -match "(?i)HARD FAIL|CRITICAL GOVERNANCE VIOLATION|Dump File Checksum Mismatch|FAILED|ERROR:|is not running")) {
            $exitCode = 1
        }
    } catch {
        $output = $_.ToString()
        $exitCode = 1
    }

    [bool]$rejected = ($exitCode -ne 0)
    [bool]$keywordMatched = $false
    [string]$matchedKeyword = ""

    [string]$lowerCombined = $output.ToLower()
    foreach ($kw in $ExpectedKeywords) {
        if ($lowerCombined.Contains($kw.ToLower())) {
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
        [string]$errPreview = if ($output.Length -gt 500) { $output.Substring($output.Length - 500).Replace("`r", "").Replace("`n", " ") } else { $output.Replace("`r", "").Replace("`n", " ") }
        Write-Host "::error file=scripts/test-target-guard.ps1,title=GuardAssertionFailed::$TestName FAILED. ExitCode=$exitCode. Preview: $errPreview"
    }

    $script:TestResults += @{
        name = $TestName
        status = if ($passed) { "PASSED" } else { "FAILED" }
        exitCode = $exitCode
        matchedKeyword = $matchedKeyword
        durationMs = [math]::Round(((Get-Date) - $start).TotalMilliseconds, 2)
    }
}

# ------------------------------------------------------------------------------
# Robust Fail-Closed Fingerprint Engine (Data + Config + Environment)
# ------------------------------------------------------------------------------
function Get-TargetDbFingerprint {
    try {
        # 1. All AppSettings (including GMS_RESTORE_ALLOWED and RESTORE_ALLOWED)
        $rawSettings = "SELECT key || '=' || COALESCE(value, '') FROM ""AppSetting"" ORDER BY key;" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d $TargetDb 2>&1
        if ($LASTEXITCODE -ne 0) { throw "AppSetting query failed: $rawSettings" }

        # 2. Migration inventory and checksums
        $rawMigs = "SELECT migration_name || '=' || COALESCE(checksum, '') FROM ""_prisma_migrations"" ORDER BY migration_name;" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d $TargetDb 2>&1
        if ($LASTEXITCODE -ne 0) { throw "_prisma_migrations query failed: $rawMigs" }

        # 3. Schema table listing and row count checks
        $rawTables = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d $TargetDb 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Table listing query failed: $rawTables" }

        $rawUsers = "SELECT CASE WHEN to_regclass('public.""User""') IS NOT NULL THEN (SELECT COUNT(*)::text FROM ""User"") ELSE '0' END;" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d $TargetDb 2>&1
        if ($LASTEXITCODE -ne 0) { throw "User count query failed: $rawUsers" }

        # 4. Environment fingerprint (Container ID, Image, Labels)
        $rawInspect = & docker inspect --format="{{.Id}}|{{.Image}}" $TargetContainer 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Container inspect failed: $rawInspect" }

        [string]$settings = ($rawSettings | Out-String).Trim()
        [string]$migs = ($rawMigs | Out-String).Trim()
        [string]$tables = ($rawTables | Out-String).Trim()
        [string]$users = ($rawUsers | Out-String).Trim()
        [string]$envMeta = ($rawInspect | Out-String).Trim()

        [string]$combined = "$settings`n$migs`n$tables`n$users`n$envMeta"
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($combined)
        return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLower()
    } catch {
        Write-Host "ERROR: Get-TargetDbFingerprint failed (Fail-Closed): $_" -ForegroundColor Red
        throw "Target DB Fingerprint acquisition failed fail-closed: $_"
    }
}

[string]$PreTestFingerprint = ""
[string]$PostTestFingerprint = ""

try {
    # --------------------------------------------------------------------------
    # 1. Spawn Ephemeral Isolated Fixture Container
    # --------------------------------------------------------------------------
    Write-Host "`nSpawning isolated ephemeral fixture container ($TargetContainer on port $TargetPort)..." -ForegroundColor Cyan
    $runOut = & docker run -d --name $TargetContainer `
        --label "gms.test.fixture=true" `
        --label "gms.test.run_id=$TestRunId" `
        --label "gms.test.owner=test-target-guard.ps1" `
        -p "127.0.0.1:${TargetPort}:5432" `
        -e "POSTGRES_DB=$TargetDb" `
        -e "POSTGRES_USER=$TargetUser" `
        -e "POSTGRES_PASSWORD=$TargetPass" `
        -e "POSTGRES_HOST_AUTH_METHOD=trust" `
        postgres:15-alpine 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start isolated test fixture container: $runOut"
    }

    # Wait for PostgreSQL container readiness
    Write-Host "Waiting for isolated fixture PostgreSQL container to become ready..." -ForegroundColor Cyan
    $isReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $readyCheck = "SELECT 1;" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d postgres 2>$null
        if ($readyCheck -and $readyCheck.Trim() -eq "1") {
            $isReady = $true
            break
        }
    }
    if (-not $isReady) {
        throw "Target PostgreSQL container ($TargetContainer) failed to become ready within 30s."
    }

    # Ensure fixture database exists
    $dbCheck = "SELECT 1 FROM pg_database WHERE datname = '$TargetDb';" | & docker exec -i $TargetContainer psql -t -A -U $TargetUser -d postgres 2>$null
    if ($dbCheck -ne "1") {
        Write-Host "Creating target database [$TargetDb] on $TargetContainer..." -ForegroundColor Cyan
        "CREATE DATABASE ""$TargetDb"";" | & docker exec -i $TargetContainer psql -U $TargetUser -d postgres 2>&1 | Out-Null
    }

    # Initialize baseline schema and security governance records
    Write-Host "Initializing target identity governance and baseline schema on $TargetContainer..." -ForegroundColor Cyan
    $initSql = @"
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "key" VARCHAR(255) UNIQUE NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "User" (
    "id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "username" VARCHAR(255) UNIQUE NOT NULL,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES 
  ('m-init-01', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', now(), '20260714030729_init', now(), 1),
  ('m-init-02', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', now(), '20260715000000_add_account_password_security', now(), 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "AppSetting" ("key", "value") VALUES 
  ('GMS_ENVIRONMENT_ID', '$KnownEnvId'),
  ('GMS_INSTALLATION_UUID', '$KnownInstallUuid'),
  ('GMS_RESTORE_ALLOWED', 'FALSE')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
"@
    $initRes = ""
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        $initRes = $initSql | & docker exec -i $TargetContainer psql -U $TargetUser -d $TargetDb 2>&1
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to initialize baseline target database: $initRes"
    }

    # --------------------------------------------------------------------------
    # 2. Capture Initial Full Fingerprint (Fail-Closed)
    # --------------------------------------------------------------------------
    $PreTestFingerprint = Get-TargetDbFingerprint
    Write-Host "  Pre-test Target DB Fingerprint Hash: $PreTestFingerprint [CAPTURED]" -ForegroundColor Green

    # Locate authoritative historical rehearsal manifest
    [string]$AuthoritativeManifest = Join-Path $ProjectRootDir "tests/fixtures/historical/historical_test_manifest.json"
    if (-not (Test-Path $AuthoritativeManifest)) {
        Write-Host "  Generating authentic historical manifest..." -ForegroundColor Cyan
        node (Join-Path $ProjectRootDir "tests/fixtures/historical/generate-test-fixtures.js")
    }

    # Generate tampered manifest for Case 8 in temp directory
    $CorruptManifestPath = Join-Path $TempTestDir "corrupt_manifest.json"
    $validData = Get-Content -Path $AuthoritativeManifest -Raw | ConvertFrom-Json
    $CorruptManifestObj = @{
        manifestType = $validData.manifestType
        backupId = "BKP-GUARD-CORRUPT-001"
        createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        artifacts = $validData.artifacts
        checksums = @{
            dump = "0000000000000000000000000000000000000000000000000000000000000000"
        }
    }
    Set-Content -Path $CorruptManifestPath -Value ($CorruptManifestObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # Copy authentic companion dump and attachments to $TempTestDir for Case 8
    [string]$dumpSrc = Join-Path (Split-Path -Path $AuthoritativeManifest -Parent) "historical_test.dump"
    [string]$attSrc = Join-Path (Split-Path -Path $AuthoritativeManifest -Parent) "historical_test_attachments.json"
    if (Test-Path $dumpSrc) {
        Copy-Item -Path $dumpSrc -Destination (Join-Path $TempTestDir "historical_test.dump") -Force
    }
    if (Test-Path $attSrc) {
        Copy-Item -Path $attSrc -Destination (Join-Path $TempTestDir "historical_test_attachments.json") -Force
    }

    $env:PGPASSWORD = $TargetPass

    # --------------------------------------------------------------------------
    # Case 1: Missing / Unreachable Target Container (Dedicated Container Guard)
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 1: Target Container Missing / Unreachable" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer "nonexistent_container_xyz999" -Force 2>&1
        } `
        -ExpectedKeywords @("is not running or unreachable", "HARD FAIL: Live target container", "Cannot proceed with restore")

    # --------------------------------------------------------------------------
    # Case 2: Real Container Target with Mismatched Environment ID -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 2: Real Container Target with Mismatched Environment ID" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId "GMS-UNEXPECTED-ENV-ID" -ExpectedInstallationUuid $KnownInstallUuid -Force 2>&1
        } `
        -ExpectedKeywords @("Expected Environment ID 'GMS-UNEXPECTED-ENV-ID'", "does not match target database ID")

    # --------------------------------------------------------------------------
    # Case 3: Real Container Target with Mismatched Installation UUID -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 3: Real Container Target with Mismatched Installation UUID" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId $KnownEnvId -ExpectedInstallationUuid "00000000-0000-0000-0000-000000000000" -Force 2>&1
        } `
        -ExpectedKeywords @("Expected Installation UUID '00000000-0000-0000-0000-000000000000'", "does not match target UUID")

    # --------------------------------------------------------------------------
    # Case 4: Real Container Target with RESTORE_ALLOWED = 'FALSE' -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 4: Real Container Target with RESTORE_ALLOWED = FALSE" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId $KnownEnvId -ExpectedInstallationUuid $KnownInstallUuid -Force 2>&1
        } `
        -ExpectedKeywords @("GMS_RESTORE_ALLOWED is set to 'FALSE'", "Restore operation is NOT permitted")

    # --------------------------------------------------------------------------
    # Case 5: Real Container Target with Production Environment ID + Fault Injection -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 5: Real Container Target with Production ID + Fault Injection" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId "GMS-PROD-SJA-01" -ExpectedInstallationUuid $KnownInstallUuid -FaultInjectionPhase "DURING_DB_PROMOTION" -Force 2>&1
        } `
        -ExpectedKeywords @("PRODUCTION", "CRITICAL GOVERNANCE VIOLATION", "UNCONDITIONALLY PROHIBITED on production targets")

    # --------------------------------------------------------------------------
    # Case 6: Real Container Target with Fault Injection without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 6: Fault Injection Without GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = ""
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId $KnownEnvId -ExpectedInstallationUuid $KnownInstallUuid -FaultInjectionPhase "DURING_DB_PROMOTION" -Force 2>&1
        } `
        -ExpectedKeywords @("requires verified isolated drill environment (GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE)", "CRITICAL GOVERNANCE VIOLATION")

    # --------------------------------------------------------------------------
    # Case 7: Real Container Target with Production DB Name (`gms_prod`) + Fault Injection -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 7: Production DB Name with Fault Injection" `
        -ExecutionBlock {
            $env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $AuthoritativeManifest -LiveContainer $TargetContainer -LiveDbName "gms_prod" -PgUser $TargetUser -PgPass $TargetPass -ExpectedEnvironmentId $KnownEnvId -ExpectedInstallationUuid $KnownInstallUuid -FaultInjectionPhase "DURING_DB_PROMOTION" -Force 2>&1
        } `
        -ExpectedKeywords @("PRODUCTION", "CRITICAL GOVERNANCE VIOLATION", "UNCONDITIONALLY PROHIBITED on production targets")

    # --------------------------------------------------------------------------
    # Case 8: Manifest With Corrupted Dump SHA-256 Checksum -> REJECT
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 8: Corrupted Dump SHA-256 Checksum in Manifest Preflight" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $CorruptManifestPath -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -Force 2>&1
        } `
        -ExpectedKeywords @("Dump File Checksum Mismatch", "Checksum Mismatch", "SHA-256", "Preflight Check Failed")

    # --------------------------------------------------------------------------
    # Case 9: Missing / Invalid Manifest Path -> Hard Fail Preflight
    # --------------------------------------------------------------------------
    Assert-GuardRejection -TestName "Case 9: Non-Existent Manifest Path Rejection" `
        -ExecutionBlock {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath (Join-Path $TempTestDir "missing_manifest.json") -LiveContainer $TargetContainer -LiveDbName $TargetDb -PgUser $TargetUser -PgPass $TargetPass -Force 2>&1
        } `
        -ExpectedKeywords @("Manifest File Not Found", "Preflight Check Failed", "HARD FAIL")

    # --------------------------------------------------------------------------
    # 3. Verify Pre/Post Target Database Fingerprint Invariant (ZERO MUTATION PROOF)
    # --------------------------------------------------------------------------
    Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "Verifying Target Database Fingerprint Invariant (Pre vs Post)..." -ForegroundColor Cyan
    $PostTestFingerprint = Get-TargetDbFingerprint
    Write-Host "  Pre-test  Target DB Fingerprint Hash: $PreTestFingerprint" -ForegroundColor Gray
    Write-Host "  Post-test Target DB Fingerprint Hash: $PostTestFingerprint" -ForegroundColor Gray

    if ($PreTestFingerprint -ne $PostTestFingerprint -or [string]::IsNullOrWhiteSpace($PostTestFingerprint)) {
        throw "CRITICAL INVARIANT VIOLATION: Target database fingerprint was mutated during negative guard assertions! Pre: $PreTestFingerprint, Post: $PostTestFingerprint"
    }

    Write-Host "  [PASS] Target database fingerprint verified 100% UNMUTATED (Zero Database Mutation Guarantee)!" -ForegroundColor Green

} catch {
    Write-Host "FATAL ERROR IN TARGET GUARD TEST SUITE: $_" -ForegroundColor Red
    Write-Host "StackTrace: $($_.ScriptStackTrace)" -ForegroundColor Red
    Write-Host "::error file=scripts/test-target-guard.ps1,title=GuardSuiteFatalError::$($_.ToString())"
    $script:FailedTests++
} finally {
    Write-Host "`nCleaning up isolated test fixture..." -ForegroundColor Cyan
    if (Test-Path $TempTestDir) {
        Remove-Item -Path $TempTestDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Destroy ONLY the ephemeral test fixture container created by this test run
    if ($TargetContainer -and $TargetContainer -ne "gate-system-postgres" -and $TargetContainer.StartsWith("gms-guard-fixture-")) {
        Write-Host "  Destroying isolated test fixture container ($TargetContainer)..."
        & docker rm -f $TargetContainer 2>&1 | Out-Null
    }
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Target Guard PowerShell Integration Test Summary:" -ForegroundColor Cyan
Write-Host "  Total Tests:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed Tests: $PassedTests" -ForegroundColor Green
Write-Host "  Failed Tests: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

$EvidenceObj = @{
    reportTitle = "GMS Target Guard PowerShell Integration Test Evidence (P0-C / P0-D Hardened)"
    engine = "PowerShell Integration with Isolated Ephemeral Target Fixture"
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    status = if ($FailedTests -eq 0 -and $PassedTests -eq 9) { "PASSED" } else { "FAILED" }
    targetFixture = @{
        container = $TargetContainer
        port = $TargetPort
        database = $TargetDb
        environmentId = $KnownEnvId
        installationUuid = $KnownInstallUuid
        preTestFingerprint = $PreTestFingerprint
        postTestFingerprint = $PostTestFingerprint
        zeroMutationVerified = ($PreTestFingerprint -eq $PostTestFingerprint)
    }
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

if ($FailedTests -eq 0 -and $PassedTests -eq 9) {
    Write-Host "SUCCESS: All real PowerShell target guard assertions against isolated staging container PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "ERROR: Target guard assertions FAILED or incomplete (Passed: $PassedTests/9)!" -ForegroundColor Red
    exit 1
}
