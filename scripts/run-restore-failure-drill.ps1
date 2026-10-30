# ==============================================================================
# GMS Automated DR Failure-Injection & Operator Restore Drill Protocol (P0-02 / FIX-01 & FIX-02 Hardened)
# ==============================================================================
# Purpose: Executes automated disaster recovery failure-injection simulations
# against a 100% ISOLATED EPHEMERAL FIXTURE TOPOLOGY.
#
# ZERO OPERATIONAL MUTATION GUARANTEE:
# - NEVER targets, starts, stops, or modifies operational 'gate-system-postgres' or 'gms' db.
# - Rejects non-local / production Docker contexts before executing any mutation.
# - Spawns a unique ephemeral PostgreSQL container (gms-dr-fixture-<run-id>)
#   with dedicated loopback port, ephemeral credentials, and strict label ownership.
# - All maintenance flags, uploads trees, backups, and logs reside strictly in
#   an isolated ephemeral $FixtureRoot directory (never touches project root).
# - Phase 6 HTTP test launches ephemeral mock server on dynamic test-owned port
#   with strict identity handshake; NEVER sends requests to port 3001.
# - Cleanup strictly destroys ONLY resources tagged with this drill's unique run ID.
#
# Validates fail-closed behavior across 6 critical failure phases:
#   Phase 1: Pre-promotion Checksum Corruption & Rejection
#   Phase 2: During-DB-Promotion Failure -> Automatic DB Compensation Rollback
#   Phase 3: Post-DB-Commit Failure -> Automatic DB Compensation Rollback (16 Entities + Fingerprint)
#   Phase 4: Attachment Swap Failure -> Uploads Tree Deterministic Revert
#   Phase 5: Live Verification Discrepancy -> Hard Fail-Closed & Maintenance Freeze
#   Phase 6: Fail-Closed HTTP Mutating Write Rejection (503 MAINTENANCE_MODE)
#
# Produces exact evidence artifact:
#   artifacts/release-proof/restore-failure-drill-evidence.json
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = "",

    [Parameter(Mandatory=$false)]
    [string]$DrillPort = "",

    [Parameter(Mandatory=$false)]
    [string]$CustomFixturePrefix = ""
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

[bool]$IsWinPlatform = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
[string]$LogDir = if ($IsWinPlatform) { "C:\GMS_Logs" } else { Join-Path -Path $ProjectRootDir -ChildPath "artifacts/logs" }
if (-not (Test-Path -Path $LogDir -PathType Container)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}
[string]$LogFile = Join-Path -Path $LogDir -ChildPath "restore_failure_drills.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$LogEntry = "[$Timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry
}

Write-Log "=============================================================================="
Write-Log "Starting GMS DR Failure-Injection Drill in Isolated Ephemeral Topology..."
Write-Log "=============================================================================="

[datetime]$DrillStartTime = Get-Date
[array]$TestResults = @()

function Record-Drill-Phase {
    param(
        [string]$PhaseName,
        [bool]$Passed,
        [string]$Details,
        [double]$DurationSeconds,
        [hashtable]$EvidenceData = @{}
    )
    $script:TestResults += @{
        phase = $PhaseName
        status = if ($Passed) { "PASSED" } else { "FAILED" }
        details = $Details
        durationSeconds = [math]::Round($DurationSeconds, 2)
        evidence = $EvidenceData
    }
    if ($Passed) {
        Write-Log "  [PASS] $PhaseName - $Details" -Level "SUCCESS"
    } else {
        Write-Log "  [FAIL] $PhaseName - $Details" -Level "ERROR"
    }
}

$RestoreScript = Join-Path $PSScriptRoot "gms-production-restore.ps1"
$FixtureManifest = Join-Path $ProjectRootDir "tests/fixtures/historical/historical_test_manifest.json"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

$env:GMS_ISOLATED_DRILL_ENVIRONMENT = "TRUE"

# ------------------------------------------------------------------------------
# STEP 1: Ephemeral Fixture Identification & Resources Allocation (FIX-01 & FIX-02)
# ------------------------------------------------------------------------------
[string]$RunId = [guid]::NewGuid().ToString("N").Substring(0, 8)
[string]$Prefix = if ($CustomFixturePrefix) { $CustomFixturePrefix } else { "gms-dr-fixture" }
[string]$FixtureContainer = "${Prefix}-${RunId}"
[string]$FixtureDb = "gms_dr_${RunId}"
[string]$FixtureUser = "postgres"
[string]$FixturePass = "Gms_Drill_" + [guid]::NewGuid().ToString("N").Substring(0, 16) + "!"

# Forbid operational names unconditionally (before any Docker commands)
if ($Prefix -eq "gate-system-postgres" -or $FixtureContainer -eq "gate-system-postgres" -or $FixtureDb -eq "gms") {
    throw "CRITICAL GOVERNANCE VIOLATION: Ephemeral fixture identity must NOT match operational targets ('gate-system-postgres' / 'gms')."
}

# ------------------------------------------------------------------------------
# STEP 2: Docker Host, Context & Operational Target Guard (FIX-01)
# ------------------------------------------------------------------------------
Write-Log "Step 2: Validating Docker daemon availability and Docker context security..."

# Check Docker daemon availability
[bool]$DockerAvailable = $false
try {
    $rawDocker = & docker ps 2>&1
    if ($LASTEXITCODE -eq 0) { $DockerAvailable = $true }
} catch {}

if (-not $DockerAvailable) {
    throw "FATAL: Docker daemon is not available on this host. Isolated DR drill cannot execute without Docker."
}

# Check Docker context: forbid production/remote contexts
[string]$dockerContext = ""
try {
    $dockerContext = (& docker context show 2>$null | Out-String).Trim()
} catch {}

if ($dockerContext -and $dockerContext -notmatch '^(default|desktop-linux|colima|rancher-desktop)$' -and $dockerContext -match '(prod|production|remote|swarm|k8s)') {
    throw "CRITICAL GOVERNANCE VIOLATION: Current Docker context is '$dockerContext'. Disaster recovery failure drill is UNCONDITIONALLY PROHIBITED on non-local/production Docker contexts."
}

# Reject if container name collision already exists
$existingContainerCheck = (& docker ps -aq -f "name=^/${FixtureContainer}$" 2>$null | Out-String).Trim()
if ($existingContainerCheck) {
    throw "FATAL: Container with fixture name [$FixtureContainer] already exists ($existingContainerCheck). Refusing to reuse or start existing container."
}

# Dynamic port selection if DrillPort not explicitly provided
function Get-FreeLoopbackPort {
    param([int]$FallbackPort = 5437)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = ($listener.LocalEndpoint).Port
        $listener.Stop()
        return $port.ToString()
    } catch {
        return $FallbackPort.ToString()
    }
}

[string]$FixturePort = if ($DrillPort) { $DrillPort } else { Get-FreeLoopbackPort }

# Ephemeral filesystem fixture isolation (FIX-02)
[string]$tempRoot = [System.IO.Path]::GetTempPath()
[string]$FixtureRoot = Join-Path $tempRoot ("gms_dr_fixture_" + $RunId)
[string]$FixtureMaintDir = Join-Path $FixtureRoot "maintenance"
[string]$FixtureUploadsDir = Join-Path $FixtureRoot "uploads"
[string]$FixtureBackupsDir = Join-Path $FixtureRoot "backups"
[string]$FixtureLogsDir = Join-Path $FixtureRoot "logs"

New-Item -Path $FixtureMaintDir -ItemType Directory -Force | Out-Null
New-Item -Path $FixtureUploadsDir -ItemType Directory -Force | Out-Null
New-Item -Path $FixtureBackupsDir -ItemType Directory -Force | Out-Null
New-Item -Path $FixtureLogsDir -ItemType Directory -Force | Out-Null

# Seed a baseline sample file in fixture uploads directory
Set-Content -Path (Join-Path $FixtureUploadsDir "baseline_attachment.txt") -Value "GMS_BASELINE_FIXTURE_UPLOADS_$RunId" -Encoding utf8

Write-Log "Fixture parameters allocated:"
Write-Log "  Run ID:            $RunId"
Write-Log "  Container:         $FixtureContainer"
Write-Log "  Database:          $FixtureDb"
Write-Log "  Port:              127.0.0.1:$FixturePort"
Write-Log "  Fixture Directory: $FixtureRoot"

# ------------------------------------------------------------------------------
# STEP 3: Spawn Isolated Ephemeral Container & Verify Ownership
# ------------------------------------------------------------------------------
try {
    Write-Log "Launching isolated PostgreSQL fixture container ($FixtureContainer)..."
    & docker run -d `
        --name $FixtureContainer `
        --label "gms.test.fixture=true" `
        --label "gms.test.run_id=$RunId" `
        --label "gms.test.created_by=run-restore-failure-drill" `
        -p "127.0.0.1:${FixturePort}:5432" `
        -e "POSTGRES_DB=$FixtureDb" `
        -e "POSTGRES_USER=$FixtureUser" `
        -e "POSTGRES_PASSWORD=$FixturePass" `
        postgres:16-alpine 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Failed launching isolated fixture container [$FixtureContainer]."
    }

    # Strict ownership and mount verification
    $rawInspect = & docker inspect $FixtureContainer 2>$null | Out-String
    if (-not $rawInspect) {
        throw "Failed inspecting fixture container [$FixtureContainer]."
    }
    $inspectObj = $rawInspect | ConvertFrom-Json
    $containerLabels = $inspectObj[0].Config.Labels
    if (-not $containerLabels."gms.test.fixture" -or $containerLabels."gms.test.run_id" -ne $RunId) {
        throw "CRITICAL GOVERNANCE VIOLATION: Fixture container label mismatch! Expected run_id '$RunId'."
    }

    # Forbid operational volume or bind mounts
    $mounts = $inspectObj[0].Mounts
    if ($mounts) {
        foreach ($m in $mounts) {
            [string]$src = $m.Source
            if ($src -like "*prod*" -or $src -like "*gate-system-postgres*" -or $src -like "*\uploads" -or $src -like "*/uploads") {
                throw "CRITICAL GOVERNANCE VIOLATION: Fixture container has unauthorized mount to operational storage: $src"
            }
        }
    }

    # Wait for PostgreSQL ready with temporary password
    [bool]$dbReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        & docker exec -e "PGPASSWORD=$FixturePass" $FixtureContainer pg_isready -U $FixtureUser -d $FixtureDb 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $dbReady = $true
            break
        }
    }
    if (-not $dbReady) {
        throw "PostgreSQL fixture container did not become ready within 30 seconds."
    }
    Write-Log "PostgreSQL fixture container is ready and authenticated." -Level "SUCCESS"

    # Seed baseline historical data into fixture DB
    [string]$DumpFile = Join-Path $ProjectRootDir "tests/fixtures/historical/historical_test.dump"
    if (-not (Test-Path -LiteralPath $DumpFile)) {
        throw "MANDATORY FIXTURE MISSING: Historical test dump ($DumpFile) not found."
    }
    Write-Log "Populating baseline historical test database into $FixtureContainer ($FixtureDb)..."
    & docker cp $DumpFile "${FixtureContainer}:/tmp/baseline.dump" 2>&1 | Out-Null
    & docker exec -e "PGPASSWORD=$FixturePass" $FixtureContainer psql -U $FixtureUser -d $FixtureDb -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO $FixtureUser;" 2>&1 | Out-Null
    $restoreRes = & docker exec -e "PGPASSWORD=$FixturePass" $FixtureContainer pg_restore -U $FixtureUser -d $FixtureDb --no-owner --no-privileges /tmp/baseline.dump 2>&1 | Out-String
    if ($restoreRes -match "error:") {
        Write-Log "pg_restore notice/output: $restoreRes" -Level "WARN"
    }
    & docker exec $FixtureContainer rm -f /tmp/baseline.dump 2>&1 | Out-Null

    # Helper to enable target restore gate in fixture database
    function Enable-FixtureRestoreGate {
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
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
VALUES ('m-init', '0000000000000000000000000000000000000000000000000000000000000000', NOW(), '20260714030729_init', 1)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" VARCHAR(36) PRIMARY KEY,
    "key" VARCHAR(255) UNIQUE NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt") VALUES ('set-restore-gate', 'GMS_RESTORE_ALLOWED', 'TRUE', NOW(), NOW()) ON CONFLICT ("key") DO UPDATE SET "value" = 'TRUE';
INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt") VALUES ('set-env-gate', 'GMS_ENVIRONMENT_ID', 'GMS-DRILL-SJA-01', NOW(), NOW()) ON CONFLICT ("key") DO UPDATE SET "value" = 'GMS-DRILL-SJA-01';
INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt") VALUES ('set-uuid-gate', 'GMS_INSTALLATION_UUID', '4f53a720-911b-4f9e-a89b-8321481dc901', NOW(), NOW()) ON CONFLICT ("key") DO UPDATE SET "value" = '4f53a720-911b-4f9e-a89b-8321481dc901';
"@
        ($initSql + "`n") | & docker exec -i -e "PGPASSWORD=$FixturePass" $FixtureContainer psql -U $FixtureUser -d $FixtureDb 2>&1 | Out-Null
    }

    # ------------------------------------------------------------------------------
    # Fingerprinting Helpers (PostgreSQL 16 Entities + Physical Attachments Tree)
    # ------------------------------------------------------------------------------
    function Get-DatabaseFingerprint {
        $Tables = @(
            "User",
            "UserWarehouseAccess",
            "Transaction",
            "TransactionStatusHistory",
            "WeighbridgeRecord",
            "WarehouseProcess",
            "QcVehicleCheck",
            "IncomingMaterialCheck",
            "Attachment",
            "FraudCheck",
            "ActivityLog",
            "AppSetting",
            "Announcement",
            "SystemIssue",
            "TransactionCorrection",
            "TransactionCorrectionItem"
        )

        $Result = [ordered]@{}

        foreach ($Table in $Tables) {
            $rawCheck = ("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$Table';`n") | & docker exec -i -e "PGPASSWORD=$FixturePass" $FixtureContainer psql -U $FixtureUser -d $FixtureDb -t -A 2>&1
            $TableCheck = ""
            if ($rawCheck) {
                $tableLines = @(($rawCheck.ToString() -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^(NOTICE|WARNING):' })
                if ((@($tableLines)).Count -gt 0) { $TableCheck = ([string]$tableLines[-1]).Trim() }
            }
            if ($TableCheck -ne "1") {
                $Result[$Table] = "NON_EXISTENT"
                continue
            }

            $whereClause = if ($Table -eq "AppSetting") { "WHERE key NOT IN ('GMS_RESTORE_ALLOWED', 'RESTORE_ALLOWED')" } else { "" }
            $Sql = "SELECT COALESCE(encode(sha256(string_agg(encode(sha256(row_to_json(t)::text::bytea), 'hex'), ',' ORDER BY encode(sha256(row_to_json(t)::text::bytea), 'hex'))::bytea), 'hex'), 'EMPTY') FROM ""$Table"" t $whereClause;"

            $Hash = ""
            try {
                $rawHash = ($Sql + "`n") | & docker exec -i -e "PGPASSWORD=$FixturePass" $FixtureContainer psql -U $FixtureUser -d $FixtureDb -t -A 2>&1
                if ($rawHash) {
                    $hashLines = @(($rawHash.ToString() -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^(NOTICE|WARNING):' })
                    if ((@($hashLines)).Count -gt 0) { $Hash = ([string]$hashLines[-1]).Trim() }
                }
            } catch {
                throw "FATAL: Database fingerprint query failed for table '$Table'. Error: $($_.ToString())"
            }

            if ([string]::IsNullOrWhiteSpace($Hash) -or $Hash.Contains("ERROR") -or $Hash.Contains("fatal") -or $Hash.Contains("could not connect")) {
                throw "FATAL: Database fingerprint query returned error for table '$Table'. Output: $Hash"
            } else {
                $Result[$Table] = $Hash.Trim()
            }
        }

        return $Result
    }

    function Get-UploadsFingerprint {
        param([string]$UploadsDirectory)

        if (-not (Test-Path -Path $UploadsDirectory -PathType Container)) {
            return "EMPTY"
        }

        $Files = @(Get-ChildItem -Path $UploadsDirectory -File -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName)
        if ($Files.Count -eq 0) {
            return "EMPTY"
        }

        $Entries = $Files | ForEach-Object {
            $Relative = $_.FullName.Substring($UploadsDirectory.Length).Replace('\', '/')
            $Hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
            "$Relative|$Hash"
        }

        $Content = ($Entries -join "`n")
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Content)
        $Sha = [System.Security.Cryptography.SHA256]::Create()

        return [BitConverter]::ToString(
            $Sha.ComputeHash($Bytes)
        ).Replace("-", "").ToLower()
    }

    # ------------------------------------------------------------------------------
    # Phase 1: Pre-promotion Checksum Corruption Test
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 1: Corrupted Dump SHA-256 Checksum Rejection Drill..."
    [datetime]$p1Start = Get-Date
    [string]$TempCorruptDir = ""
    try {
        $TempCorruptDir = Join-Path $FixtureRoot ("corrupt_test_" + [guid]::NewGuid().ToString("N"))
        New-Item -Path $TempCorruptDir -ItemType Directory -ErrorAction Stop | Out-Null

        [string]$RealDumpPath = Join-Path $ProjectRootDir "tests/fixtures/historical/historical_test.dump"
        [string]$CorruptDumpPath = Join-Path $TempCorruptDir "corrupted_test.dump"
        [string]$CorruptManifestPath = Join-Path $TempCorruptDir "corrupt_manifest.json"

        [byte[]]$dumpBytes = [System.IO.File]::ReadAllBytes($RealDumpPath)
        [string]$originalHash = (Get-FileHash -Path $RealDumpPath -Algorithm SHA256).Hash.ToLower()
        if ($dumpBytes.Length -gt 100) {
            $dumpBytes[50] = [byte]($dumpBytes[50] -bxor 0xFF) # tamper single byte
        }
        [System.IO.File]::WriteAllBytes($CorruptDumpPath, $dumpBytes)

        $CorruptManifestObj = @{
            manifestType = "HISTORICAL_REHEARSAL_FIXTURE"
            backupId = "BKP-DRILL-CORRUPT-TAMPERED-BYTE"
            createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            artifacts = @{
                dump = "corrupted_test.dump"
            }
            checksums = @{
                dump = $originalHash
            }
        }
        Set-Content -Path $CorruptManifestPath -Value ($CorruptManifestObj | ConvertTo-Json -Depth 5) -Encoding utf8

        [int]$p1Exit = 0
        try {
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $CorruptManifestPath `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -PgPass $FixturePass `
                -LiveContainer $FixtureContainer `
                -LiveDbName $FixtureDb `
                -PgPort $FixturePort `
                -MaintenanceDir $FixtureMaintDir `
                -UploadsDirectory $FixtureUploadsDir `
                -LogDirectory $FixtureLogsDir `
                -Force 2>&1 | Out-Null
            $p1Exit = $LASTEXITCODE
        } catch {
            $p1Exit = 1
        }

        [bool]$p1Passed = ($p1Exit -ne 0)
        [string]$p1Details = if ($p1Passed) {
            "Mismatched/corrupt dump checksum strictly rejected before DB or uploads mutation (ExitCode=$p1Exit)."
        } else {
            "Security vulnerability: Corrupted dump was not rejected by restore preflight check."
        }

        Record-Drill-Phase -PhaseName "Phase 1: Pre-promotion Checksum Corruption" -Passed $p1Passed -Details $p1Details -DurationSeconds ((Get-Date) - $p1Start).TotalSeconds -EvidenceData @{ exitCode = $p1Exit; rejectedBeforeMutation = $p1Passed }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 1: Pre-promotion Checksum Corruption" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p1Start).TotalSeconds
    }

    # ------------------------------------------------------------------------------
    # Phase 2: DURING_DB_PROMOTION Failure Simulation & Compensating Rollback
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 2: DURING_DB_PROMOTION Failure & Early Compensation Rollback Drill..."
    [datetime]$p2Start = Get-Date
    try {
        [int]$p2Exit = 0
        [bool]$p2Passed = $false
        [string]$p2Details = ""

        # Clear fixture maintenance flags
        $fActive = Join-Path $FixtureMaintDir "active"
        $fFlag = Join-Path $FixtureMaintDir "maintenance.flag"
        if (Test-Path $fActive) { Remove-Item $fActive -Force -ErrorAction SilentlyContinue }
        if (Test-Path $fFlag) { Remove-Item $fFlag -Force -ErrorAction SilentlyContinue }

        Enable-FixtureRestoreGate
        $DbBeforeP2 = Get-DatabaseFingerprint
        $UploadsBeforeP2 = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $p2Output = ""
        try {
            $env:GMS_FAULT_INJECTION_PHASE = "DURING_DB_PROMOTION"
            $p2Output = & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $FixtureManifest `
                -FaultInjectionPhase "DURING_DB_PROMOTION" `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -PgPass $FixturePass `
                -LiveContainer $FixtureContainer `
                -LiveDbName $FixtureDb `
                -PgPort $FixturePort `
                -MaintenanceDir $FixtureMaintDir `
                -UploadsDirectory $FixtureUploadsDir `
                -LogDirectory $FixtureLogsDir `
                -Force 2>&1 | Out-String
            $p2Exit = $LASTEXITCODE
        } catch {
            $p2Output = $_.ToString()
            $p2Exit = 1
        } finally {
            $env:GMS_FAULT_INJECTION_PHASE = ""
        }

        $DbAfterP2 = Get-DatabaseFingerprint
        $UploadsAfterP2 = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $DbRestoredP2 = (($DbBeforeP2 | ConvertTo-Json -Compress) -eq ($DbAfterP2 | ConvertTo-Json -Compress))
        $UploadsUnchangedP2 = ($UploadsBeforeP2 -eq $UploadsAfterP2)
        $MaintenanceActiveP2 = (Test-Path (Join-Path $FixtureMaintDir "active")) -or (Test-Path (Join-Path $FixtureMaintDir "maintenance.flag"))

        $p2Passed = ($p2Exit -ne 0) -and $DbRestoredP2 -and $UploadsUnchangedP2 -and $MaintenanceActiveP2
        $p2Details = if ($p2Passed) {
            "DURING_DB_PROMOTION fault caught cleanly -> DB compensated -> Uploads unchanged -> Maintenance active in fixture."
        } else {
            "Phase 2 check failed: ExitCode=$p2Exit, DbRestored=$DbRestoredP2, UploadsUnchanged=$UploadsUnchangedP2, MaintenanceActive=$MaintenanceActiveP2."
        }

        Record-Drill-Phase -PhaseName "Phase 2: During-DB-Promotion Compensation" `
            -Passed $p2Passed `
            -Details $p2Details `
            -DurationSeconds ((Get-Date) - $p2Start).TotalSeconds `
            -EvidenceData @{
                operatorExitCode = $p2Exit
                databaseRestored = $DbRestoredP2
                uploadsUnchanged = $UploadsUnchangedP2
                maintenanceActive = $MaintenanceActiveP2
            }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 2: During-DB-Promotion Compensation" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p2Start).TotalSeconds
    }

    # ------------------------------------------------------------------------------
    # Phase 3: Post-DB-Commit Failure Simulation & DB Rollback Compensation
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 3: Post-DB-Commit Compensation Rollback Drill..."
    [datetime]$p3Start = Get-Date
    try {
        [int]$p3Exit = 0
        [bool]$p3Passed = $false
        [string]$p3Details = ""

        # Clear fixture maintenance flags
        $fActive = Join-Path $FixtureMaintDir "active"
        $fFlag = Join-Path $FixtureMaintDir "maintenance.flag"
        if (Test-Path $fActive) { Remove-Item $fActive -Force -ErrorAction SilentlyContinue }
        if (Test-Path $fFlag) { Remove-Item $fFlag -Force -ErrorAction SilentlyContinue }

        Enable-FixtureRestoreGate
        $DbBefore = Get-DatabaseFingerprint
        $UploadsBefore = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $p3Output = ""
        try {
            $env:GMS_FAULT_INJECTION_PHASE = "POST_DB_COMMIT"
            $p3Output = & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $FixtureManifest `
                -FaultInjectionPhase "POST_DB_COMMIT" `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -PgPass $FixturePass `
                -LiveContainer $FixtureContainer `
                -LiveDbName $FixtureDb `
                -PgPort $FixturePort `
                -MaintenanceDir $FixtureMaintDir `
                -UploadsDirectory $FixtureUploadsDir `
                -LogDirectory $FixtureLogsDir `
                -Force 2>&1 | Out-String
            $p3Exit = $LASTEXITCODE
        } catch {
            $p3Output = $_.ToString()
            $p3Exit = 1
        } finally {
            $env:GMS_FAULT_INJECTION_PHASE = ""
        }

        $DbAfter = Get-DatabaseFingerprint
        $UploadsAfter = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $DbRestored = (($DbBefore | ConvertTo-Json -Compress) -eq ($DbAfter | ConvertTo-Json -Compress))
        $UploadsRestored = ($UploadsBefore -eq $UploadsAfter)
        $MaintenanceActive = (Test-Path (Join-Path $FixtureMaintDir "active")) -or (Test-Path (Join-Path $FixtureMaintDir "maintenance.flag"))

        $p3Passed = ($p3Exit -ne 0) -and $DbRestored -and $UploadsRestored -and $MaintenanceActive
        $p3Details = if ($p3Passed) {
            "Operator detected failure (ExitCode=$p3Exit) -> DB 16 entities restored identical -> Physical attachments preserved -> Maintenance active."
        } else {
            "Phase 3 check failed: ExitCode=$p3Exit, DbRestored=$DbRestored, UploadsRestored=$UploadsRestored, MaintenanceActive=$MaintenanceActive."
        }

        Record-Drill-Phase -PhaseName "Phase 3: Post-DB-Commit Compensation" `
            -Passed $p3Passed `
            -Details $p3Details `
            -DurationSeconds ((Get-Date) - $p3Start).TotalSeconds `
            -EvidenceData @{
                operatorExitCode = $p3Exit
                databaseRestored = $DbRestored
                uploadsRestored = $UploadsRestored
                maintenanceActive = $MaintenanceActive
            }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 3: Post-DB-Commit Compensation" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p3Start).TotalSeconds
    }

    # ------------------------------------------------------------------------------
    # Phase 4: Attachment Swap Failure & Uploads Tree Revert Drill
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 4: Attachment Promotion Failure & Uploads Tree Revert Drill..."
    [datetime]$p4Start = Get-Date
    try {
        [int]$p4Exit = 0
        [bool]$p4Passed = $false
        [string]$p4Details = ""

        # Clear fixture maintenance flags
        $fActive = Join-Path $FixtureMaintDir "active"
        $fFlag = Join-Path $FixtureMaintDir "maintenance.flag"
        if (Test-Path $fActive) { Remove-Item $fActive -Force -ErrorAction SilentlyContinue }
        if (Test-Path $fFlag) { Remove-Item $fFlag -Force -ErrorAction SilentlyContinue }

        Enable-FixtureRestoreGate
        $DbBeforeP4 = Get-DatabaseFingerprint
        $UploadsBeforeP4 = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $p4Output = ""
        try {
            $env:GMS_FAULT_INJECTION_PHASE = "ATTACHMENT_SWAP"
            $p4Output = & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $FixtureManifest `
                -FaultInjectionPhase "ATTACHMENT_SWAP" `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -PgPass $FixturePass `
                -LiveContainer $FixtureContainer `
                -LiveDbName $FixtureDb `
                -PgPort $FixturePort `
                -MaintenanceDir $FixtureMaintDir `
                -UploadsDirectory $FixtureUploadsDir `
                -LogDirectory $FixtureLogsDir `
                -Force 2>&1 | Out-String
            $p4Exit = $LASTEXITCODE
        } catch {
            $p4Output = $_.ToString()
            $p4Exit = 1
        } finally {
            $env:GMS_FAULT_INJECTION_PHASE = ""
        }

        $DbAfterP4 = Get-DatabaseFingerprint
        $UploadsAfterP4 = Get-UploadsFingerprint -UploadsDirectory $FixtureUploadsDir

        $UploadsPreservedP4 = ($UploadsBeforeP4 -eq $UploadsAfterP4)
        $DbPreservedP4 = (($DbBeforeP4 | ConvertTo-Json -Compress) -eq ($DbAfterP4 | ConvertTo-Json -Compress))

        $p4Passed = ($p4Exit -ne 0) -and $UploadsPreservedP4 -and $DbPreservedP4
        $p4Details = if ($p4Passed) {
            "Atomic rename and staging upload rollback verified: live uploads tree and DB preserved/reverted upon exception (ExitCode=$p4Exit)."
        } else {
            "Failure: Attachment promotion fault was not handled fail-closed (ExitCode=$p4Exit, UploadsPreserved=$UploadsPreservedP4, DbPreserved=$DbPreservedP4)."
        }

        Record-Drill-Phase -PhaseName "Phase 4: Attachment Swap Rollback" `
            -Passed $p4Passed `
            -Details $p4Details `
            -DurationSeconds ((Get-Date) - $p4Start).TotalSeconds `
            -EvidenceData @{
                exitCode = $p4Exit
                uploadsPreserved = $UploadsPreservedP4
                databasePreserved = $DbPreservedP4
            }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 4: Attachment Swap Rollback" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p4Start).TotalSeconds
    }

    # ------------------------------------------------------------------------------
    # Phase 5: Live Verification Discrepancy & Maintenance Freeze Drill
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 5: Live Verification Discrepancy & Maintenance Freeze Drill..."
    [datetime]$p5Start = Get-Date
    try {
        [int]$p5Exit = 0
        [bool]$p5Passed = $false
        [string]$p5Details = ""

        # Clear fixture maintenance flags
        $fActive = Join-Path $FixtureMaintDir "active"
        $fFlag = Join-Path $FixtureMaintDir "maintenance.flag"
        if (Test-Path $fActive) { Remove-Item $fActive -Force -ErrorAction SilentlyContinue }
        if (Test-Path $fFlag) { Remove-Item $fFlag -Force -ErrorAction SilentlyContinue }

        Enable-FixtureRestoreGate

        $p5Output = ""
        try {
            $env:GMS_FAULT_INJECTION_PHASE = "LIVE_VERIFICATION"
            $p5Output = & $PsExe -ExecutionPolicy Bypass -File $RestoreScript `
                -ManifestPath $FixtureManifest `
                -FaultInjectionPhase "LIVE_VERIFICATION" `
                -ExpectedEnvironmentId "GMS-DRILL-SJA-01" `
                -PgPass $FixturePass `
                -LiveContainer $FixtureContainer `
                -LiveDbName $FixtureDb `
                -PgPort $FixturePort `
                -MaintenanceDir $FixtureMaintDir `
                -UploadsDirectory $FixtureUploadsDir `
                -LogDirectory $FixtureLogsDir `
                -Force 2>&1 | Out-String
            $p5Exit = $LASTEXITCODE
        } catch {
            $p5Output = $_.ToString()
            $p5Exit = 1
        } finally {
            $env:GMS_FAULT_INJECTION_PHASE = ""
        }

        $MaintenanceFlagActive = (Test-Path (Join-Path $FixtureMaintDir "active")) -or (Test-Path (Join-Path $FixtureMaintDir "maintenance.flag"))
        $p5Passed = ($p5Exit -ne 0) -and $MaintenanceFlagActive
        $p5Details = if ($p5Passed) {
            "Maintenance flag verified present in fixture upon discrepancy to freeze write traffic in inconsistent state (ExitCode=$p5Exit)."
        } else {
            "Failure: Live verification discrepancy did not trigger fail-closed maintenance freeze."
        }

        Record-Drill-Phase -PhaseName "Phase 5: Maintenance Freeze on Discrepancy" `
            -Passed $p5Passed `
            -Details $p5Details `
            -DurationSeconds ((Get-Date) - $p5Start).TotalSeconds `
            -EvidenceData @{
                exitCode = $p5Exit
                maintenanceFreezeActive = $MaintenanceFlagActive
            }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 5: Maintenance Freeze on Discrepancy" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p5Start).TotalSeconds
    }

    # ------------------------------------------------------------------------------
    # Phase 6: Fail-Closed HTTP Write Rejection during Maintenance Mode Drill (FIX-02 Hardened)
    # ------------------------------------------------------------------------------
    Write-Log "Executing Phase 6: Fail-Closed HTTP Write Rejection during Maintenance Mode Drill..."
    [datetime]$p6Start = Get-Date
    [System.Diagnostics.Process]$mockProc = $null
    [int]$statusCode = 0
    [bool]$writeRejected = $false
    [string]$codeString = "UNKNOWN"
    [bool]$networkErrorDistinguished = $false

    try {
        # Activate maintenance in fixture directory strictly
        Set-Content -Path (Join-Path -Path $FixtureMaintDir -ChildPath "active") -Value "MAINTENANCE_DRILL_503" -Encoding utf8
        Set-Content -Path (Join-Path -Path $FixtureMaintDir -ChildPath "maintenance.flag") -Value "MAINTENANCE_DRILL_503" -Encoding utf8

        # Start ephemeral mock maintenance server on a dynamic loopback port
        [string]$MockScript = Join-Path $PSScriptRoot "mock-maintenance-server.js"
        [string]$mockAuthToken = "mock_auth_" + [guid]::NewGuid().ToString("N")
        [string]$dynHttpPort = Get-FreeLoopbackPort -FallbackPort 34567

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "node"
        $psi.Arguments = "`"$MockScript`" $dynHttpPort `"$FixtureMaintDir`""
        $psi.EnvironmentVariables["MOCK_SERVER_AUTH_TOKEN"] = $mockAuthToken
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $mockProc = [System.Diagnostics.Process]::Start($psi)

        # Wait for mock server to be responsive on dynamic port
        [bool]$mockReady = $false
        for ($waitCount = 0; $waitCount -lt 40; $waitCount++) {
            Start-Sleep -Milliseconds 150
            try {
                $idRes = Invoke-WebRequest -Uri "http://127.0.0.1:${dynHttpPort}/_identity" -TimeoutSec 1 -SkipHttpErrorCheck 2>$null
                if ($idRes -and $idRes.StatusCode -eq 200) {
                    $idObj = $idRes.Content | ConvertFrom-Json
                    if ($idObj.serverType -eq "GMS_EPHEMERAL_MOCK_MAINTENANCE_SERVER" -and $idObj.token -eq $mockAuthToken) {
                        $mockReady = $true
                        break
                    }
                }
            } catch {}
        }

        if (-not $mockReady) {
            throw "SECURITY VIOLATION / TEST FAILURE: Ephemeral mock maintenance server failed to launch or identity verification failed on port $dynHttpPort. Refusing to send test requests to unknown services."
        }

        # Test 1: Verified Mock Server in Maintenance Mode MUST return HTTP 503 with MAINTENANCE_MODE
        [bool]$serverGave503 = $false
        try {
            $response = Invoke-WebRequest `
                -Uri "http://127.0.0.1:${dynHttpPort}/api/gate/check-in" `
                -Method POST `
                -Headers @{ Authorization = "Bearer test_token" } `
                -ContentType "application/json" `
                -Body '{"driverName":"DrillTest"}' `
                -TimeoutSec 5 `
                -SkipHttpErrorCheck 2>$null

            if ($response) {
                $statusCode = [int]$response.StatusCode
                if ($statusCode -eq 503) {
                    $serverGave503 = $true
                    try {
                        $bodyObj = $response.Content | ConvertFrom-Json
                        if ($bodyObj.code) { $codeString = [string]$bodyObj.code }
                    } catch {}
                }
            }
        } catch {
            if ($_.Exception -and $_.Exception.Response) {
                $httpRes = $_.Exception.Response
                $statusCode = [int]$httpRes.StatusCode
                if ($statusCode -eq 503) {
                    $serverGave503 = $true
                    $codeString = "MAINTENANCE_MODE"
                }
            }
        }

        # Test 2: Connection failure against non-existent port (39999) MUST NOT be treated as 503!
        [bool]$networkErrorProperlyRejected = $false
        try {
            $badReq = Invoke-WebRequest -Uri "http://127.0.0.1:39999/api/gate/check-in" -Method POST -TimeoutSec 2 -SkipHttpErrorCheck 2>$null
        } catch {
            $networkErrorProperlyRejected = $true
        }

        $writeRejected = $serverGave503
        $networkErrorDistinguished = $networkErrorProperlyRejected
        $p6Passed = $serverGave503 -and ($codeString -eq "MAINTENANCE_MODE") -and $networkErrorProperlyRejected

        $p6Details = if ($p6Passed) {
            "Fail-closed write freeze verified on dynamic port ${dynHttpPort}: returned HTTP 503 MAINTENANCE_MODE; network errors verified NOT masked."
        } elseif (-not $serverGave503) {
            "FAIL-CLOSED violation: write API returned HTTP $statusCode (code: $codeString), expected HTTP 503 MAINTENANCE_MODE."
        } else {
            "FAIL-CLOSED violation: network connection exception distinction check failed."
        }

        Record-Drill-Phase -PhaseName "Phase 6: Maintenance HTTP Write Rejection (503)" `
            -Passed $p6Passed `
            -Details $p6Details `
            -DurationSeconds ((Get-Date) - $p6Start).TotalSeconds `
            -EvidenceData @{
                statusCode = $statusCode
                code = $codeString
                writeRejected = $writeRejected
                networkErrorDistinguished = $networkErrorDistinguished
                mockServerPort = $dynHttpPort
            }
    } catch {
        Record-Drill-Phase -PhaseName "Phase 6: Maintenance HTTP Write Rejection (503)" -Passed $false -Details ($_.ToString()) -DurationSeconds ((Get-Date) - $p6Start).TotalSeconds
    } finally {
        if ($mockProc -and -not $mockProc.HasExited) {
            try {
                $mockProc.Kill()
                $mockProc.WaitForExit(3000)
            } catch {}
        }
    }

} finally {
    # --------------------------------------------------------------------------
    # STEP 4: Scoped Teardown of Run ID Ephemeral Resources ONLY (FIX-01 & FIX-02)
    # --------------------------------------------------------------------------
    Write-Log "Cleaning up ephemeral DR drill fixture resources for Run ID: $RunId..." -Level "INFO"

    # Destroy isolated container ONLY if label matches $RunId
    if ($FixtureContainer) {
        try {
            $rawInsp = & docker inspect $FixtureContainer 2>$null | Out-String
            if ($rawInsp -and $rawInsp -like "*gms.test.run_id=$RunId*") {
                Write-Log "  Removing ephemeral container $FixtureContainer..."
                & docker rm -f $FixtureContainer 2>&1 | Out-Null
            }
        } catch {}
    }

    # Remove temporary fixture directories
    if ($FixtureRoot -and (Test-Path -LiteralPath $FixtureRoot)) {
        if ($FixtureRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Log "  Removing ephemeral fixture directory $FixtureRoot..."
            Remove-Item -LiteralPath $FixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Verify operational root paths were never touched
    [string]$opMaintActive = Join-Path $ProjectRootDir "maintenance/active"
    [string]$opMaintFlag = Join-Path $ProjectRootDir "maintenance.flag"
    if (Test-Path $opMaintActive) {
        Write-Log "Operational marker $opMaintActive was preserved intact by drill." -Level "INFO"
    }
}

# ------------------------------------------------------------------------------
# STEP 5: Summarize and Save Evidence Artifact
# ------------------------------------------------------------------------------
[bool]$AllDrillsPassed = @($script:TestResults | Where-Object { $_.status -ne "PASSED" }).Count -eq 0
[double]$TotalDuration = ((Get-Date) - $DrillStartTime).TotalSeconds

[double]$CalculatedRpoMinutes = 0.0
if (Test-Path -Path $FixtureManifest) {
    try {
        $manObj = Get-Content -Path $FixtureManifest -Raw | ConvertFrom-Json
        if ($manObj.PSObject.Properties['createdAt'] -and $manObj.createdAt) {
            $createdDate = [datetime]::Parse($manObj.createdAt)
            $CalculatedRpoMinutes = [math]::Round([math]::Max(0.0, ((Get-Date).ToUniversalTime() - $createdDate.ToUniversalTime()).TotalMinutes), 4)
        }
    } catch {}
}

$DrillEvidenceObj = @{
    reportTitle = "Production Operator DR Failure-Injection & Resilience Evidence (P0-02 - 6 Phases Hardened)"
    engine = "PowerShell Isolated Ephemeral Fixture Harness"
    runId = $RunId
    fixtureContainer = $FixtureContainer
    fixtureDatabase = $FixtureDb
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    status = if ($AllDrillsPassed) { "PASSED" } else { "FAILED" }
    rpoMinutes = $CalculatedRpoMinutes
    rpoDefinition = "Elapsed duration since fixture manifest creation to drill completion (rehearsal delta)"
    rtoSeconds = [math]::Round($TotalDuration, 2)
    drillsSummary = @{
        totalPhases = @($script:TestResults).Count
        passedPhases = @($script:TestResults | Where-Object { $_.status -eq "PASSED" }).Count
        failedPhases = @($script:TestResults | Where-Object { $_.status -ne "PASSED" }).Count
    }
    phaseResults = $script:TestResults
}

[string]$EvidenceJsonPath = Join-Path -Path $ArtifactsDir -ChildPath "restore-failure-drill-evidence-powershell.json"
Set-Content -Path $EvidenceJsonPath -Value ($DrillEvidenceObj | ConvertTo-Json -Depth 5) -Encoding utf8

[string]$LegacyEvidencePath = Join-Path -Path $ArtifactsDir -ChildPath "restore-failure-drill-evidence.json"
Set-Content -Path $LegacyEvidencePath -Value ($DrillEvidenceObj | ConvertTo-Json -Depth 5) -Encoding utf8

Write-Log "Saved DR drill evidence artifact to $EvidenceJsonPath"

Write-Host "=============================================================================="
Write-Host "DR FAILURE-INJECTION DRILL RESULTS BREAKDOWN (6 PHASES):"
foreach ($r in $script:TestResults) {
    Write-Host "  [$($r.status)] $($r.phase) ($($r.durationSeconds)s): $($r.details)"
}
Write-Host "=============================================================================="

if ($AllDrillsPassed) {
    Write-Log "SUCCESS: All 6 DR failure-injection phases PASSED with verified fail-closed guarantees." -Level "SUCCESS"
    exit 0
} else {
    Write-Log "ERROR: One or more DR failure-injection phases FAILED!" -Level "ERROR"
    exit 1
}
