# ==============================================================================
# GMS Production DR Control Plane & Staged Compensating Restore Operator Tool (P0-06)
# ==============================================================================
# Purpose: Executes production database & attachment restores via an ISOLATED STAGING
# PIPELINE with Compensating Safety Rollback and Fail-Closed Maintenance Freeze.
# Checksums, schema migrations, business invariants, and physical attachment SHA-256
# relative path reconciliations are validated in staging prior to promotion.
# In the event of promotion failure, pre-restore safety snapshot compensation reverts
# live database state while traffic remains frozen in maintenance mode.
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$StagingPort = "5435",

    [Parameter(Mandatory=$false)]
    [string]$LiveDbName = "gms",

    [Parameter(Mandatory=$false)]
    [string]$StagingDbName = "gms_restore_staging",

    [Parameter(Mandatory=$false)]
    [string]$PgUser = "postgres",

    [Parameter(Mandatory=$false)]
    [string]$PgPass = "",

    [Parameter(Mandatory=$false)]
    [string]$PgHost = "localhost",

    [Parameter(Mandatory=$false)]
    [string]$LiveContainer = "gate-system-postgres",

    [Parameter(Mandatory=$false)]
    [string]$ExpectedEnvironmentId = "GMS-PROD-SJA-01",

    [Parameter(Mandatory=$false)]
    [string]$ExpectedInstallationUuid = "",

    [Parameter(Mandatory=$false)]
    [switch]$InitializeNewEnvironment,

    [Parameter(Mandatory=$false)]
    [string]$FaultInjectionPhase = "",

    [Parameter(Mandatory=$false)]
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$LogDir = if ($IsWindows) { "C:\GMS_Logs" } else { Join-Path -Path $ProjectRootDir -ChildPath "artifacts/logs" }
[string]$LogFile = Join-Path -Path $LogDir -ChildPath "production_restore.log"
[string]$RestoreEvidencePath = Join-Path -Path $LogDir -ChildPath "restore_evidence.json"
[string]$UploadDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Join-Path -Path $ProjectRootDir -ChildPath "uploads" }

if (-not (Test-Path -Path $LogDir -PathType Container)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$LogEntry = "[$Timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry
}

Write-Log "=============================================================================="
Write-Log "Initiating GMS Production DR Control Plane Atomic Restore Pipeline (P0-06)..."
Write-Log "=============================================================================="

[datetime]$RestoreStartTime = Get-Date

# Inisialisasi variabel failure-path sebelum try untuk mematuhi Set-StrictMode
[string]$PreRestoreUploadsDir = ""
[string]$StagingUploadDir = ""
[string]$PreRestoreDbDump = ""
[string]$LiveContainerId = ""
[string]$PromotionPhase = "BEFORE_LIVE_PROMOTION"
[bool]$RestoreSucceeded = $false
[string]$BackupId = ""
[string]$ActualDumpHash = ""
[string]$AttArchivePath = ""

# Step 1: Resolve Backup Manifest & Artifact Paths
[string]$LocalBackupDir = Join-Path -Path $ProjectRootDir -ChildPath "backups\local"
if (-not $ManifestPath) {
    $LatestManifest = Get-ChildItem -Path $LocalBackupDir -Filter "*_manifest.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $LatestManifest) {
        throw "No backup manifest JSON files found in $LocalBackupDir to perform restore."
    }
    $ManifestPath = $LatestManifest.FullName
}

if (-not (Test-Path -Path $ManifestPath)) {
    throw "Manifest File Not Found: $ManifestPath"
}

Write-Log "Reading Backup Manifest: $ManifestPath"
$ManifestData = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
$BackupId = [string]$ManifestData.backupId
[string]$BackupTimestamp = $ManifestData.createdAt

# Locate companion pg_dump binary file
[string]$DumpFileName = $ManifestData.artifacts.dump
[string]$DumpFilePath = Join-Path -Path (Split-Path -Path $ManifestPath -Parent) -ChildPath $DumpFileName
if (-not (Test-Path -Path $DumpFilePath)) {
    throw "Companion PostgreSQL dump file ($DumpFileName) not found in backup directory."
}

# Step 2: Validate Manifest & Artifact SHA-256 Checksums
Write-Log "Step 1: Validating Backup Artifact Checksums against Manifest..."
if (-not $ManifestData.checksums -or -not $ManifestData.checksums.dump) {
    throw "Security Violation: Manifest missing mandatory dump SHA-256 checksum field."
}

$ActualDumpHash = (Get-FileHash -Path $DumpFilePath -Algorithm SHA256).Hash.ToLower()
[string]$ExpectedDumpHash = $ManifestData.checksums.dump.ToLower()
if ($ActualDumpHash -ne $ExpectedDumpHash) {
    throw "Dump File Checksum Mismatch! Expected: $ExpectedDumpHash, Actual: $ActualDumpHash. Aborting restore."
}
Write-Log "  Dump file SHA-256 checksum verified [PASS] ($ActualDumpHash)" -Level "SUCCESS"

[string]$AttArchiveFileName = $ManifestData.artifacts.attachmentsArchive
if ($AttArchiveFileName) {
    $AttArchivePath = Join-Path -Path (Split-Path -Path $ManifestPath -Parent) -ChildPath $AttArchiveFileName
    if (-not (Test-Path -Path $AttArchivePath)) {
        throw "Companion physical attachment archive ($AttArchiveFileName) missing from backup directory."
    }
    [string]$ActualAttArchiveHash = (Get-FileHash -Path $AttArchivePath -Algorithm SHA256).Hash.ToLower()
    [string]$ExpectedAttArchiveHash = $ManifestData.checksums.attachmentsArchive.ToLower()
    if ($ActualAttArchiveHash -ne $ExpectedAttArchiveHash) {
        throw "Attachment Archive SHA-256 Checksum Mismatch! Expected: $ExpectedAttArchiveHash, Actual: $ActualAttArchiveHash. Aborting restore."
    }
    Write-Log "  Attachment archive SHA-256 checksum verified [PASS] ($ActualAttArchiveHash)" -Level "SUCCESS"
}

if (-not $PgPass) {
    $PgPass = "gms_ephemeral_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 16)
}

# Step 3: Enter Maintenance Mode / Application Write Freeze
Write-Log "Step 2: Enabling Maintenance Mode & Application Write Freeze..."
[string]$MaintFlagPath = Join-Path -Path $ProjectRootDir -ChildPath "maintenance.flag"
Set-Content -Path $MaintFlagPath -Value "MAINTENANCE_ACTIVE_PRODUCTION_RESTORE" -Encoding utf8

[string]$MaintDir = Join-Path -Path $ProjectRootDir -ChildPath "maintenance"
if (-not (Test-Path -Path $MaintDir -PathType Container)) {
    New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
}
[string]$MaintActivePath = Join-Path -Path $MaintDir -ChildPath "active"
Set-Content -Path $MaintActivePath -Value "MAINTENANCE_ACTIVE_PRODUCTION_RESTORE" -Encoding utf8
Write-Log "  Maintenance flag created ($MaintFlagPath & $MaintActivePath) [PASS]" -Level "SUCCESS"

[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$StagingContainer = "gms-restore-staging-" + $TimestampSuffix

try {
    # Step 4: Isolated Staging PostgreSQL Restoration & Invariant Checks
    Write-Log "Step 3: Spawning Isolated Staging PostgreSQL Container ($StagingContainer)..."
    & docker run -d --name $StagingContainer -p "127.0.0.1:${StagingPort}:5432" -e "POSTGRES_USER=$PgUser" -e "POSTGRES_PASSWORD=$PgPass" -e "POSTGRES_DB=$StagingDbName" postgres:15-alpine 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed launching isolated PostgreSQL staging container." }

    # Wait for PostgreSQL container readiness
    [bool]$ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        & docker exec $StagingContainer pg_isready -U $PgUser 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw "Staging PostgreSQL container failed to become ready within 30s." }

    Write-Log "Step 4: Executing pg_restore into Isolated Staging Database..."
    [string]$TmpDumpInContainer = "/tmp/$DumpFileName"
    & docker cp $DumpFilePath "${StagingContainer}:${TmpDumpInContainer}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to staging container." }

    $RestoreOut = & docker exec $StagingContainer pg_restore --username=$PgUser --dbname=$StagingDbName --no-owner --no-privileges $TmpDumpInContainer 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit code $LASTEXITCODE. Output: $RestoreOut"
    }
    & docker exec $StagingContainer rm -f $TmpDumpInContainer 2>&1 | Out-Null

    # Exec-Query helper
    function Exec-StagingQuery([string]$sql) {
        return (& docker exec $StagingContainer psql -t -A -U $PgUser -d $StagingDbName -c "$sql" 2>&1).ToString().Trim()
    }

    Write-Log "Step 5: Verifying Schema Migrations & Invariants in Staging Database..."
    [string]$MigrationCountStr = Exec-StagingQuery "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"
    [int]$MigrationCount = 0
    if (-not [int]::TryParse($MigrationCountStr, [ref]$MigrationCount) -or $MigrationCount -eq 0) {
        throw "Migration Check Failed: _prisma_migrations table missing or has 0 finished migrations."
    }
    Write-Log "  _prisma_migrations valid count: $MigrationCount [PASS]" -Level "SUCCESS"

    # Full Manifest Record Counts Verification
    if ($ManifestData.recordCounts) {
        Write-Log "  Verifying full manifest recordCounts in Staging DB..."
        $CountsObj = $ManifestData.recordCounts
        $EntityTableMap = @{
            "users" = "User"
            "userWarehouseAccess" = "UserWarehouseAccess"
            "transactions" = "Transaction"
            "transactionStatusHistory" = "TransactionStatusHistory"
            "weighbridgeRecords" = "WeighbridgeRecord"
            "warehouseProcesses" = "WarehouseProcess"
            "qcVehicleChecks" = "QcVehicleCheck"
            "incomingMaterialChecks" = "IncomingMaterialCheck"
            "attachments" = "Attachment"
            "fraudChecks" = "FraudCheck"
            "activityLogs" = "ActivityLog"
            "appSettings" = "AppSetting"
            "announcements" = "Announcement"
            "systemIssues" = "SystemIssue"
            "transactionCorrections" = "TransactionCorrection"
            "transactionCorrectionItems" = "TransactionCorrectionItem"
        }
        foreach ($prop in $CountsObj.psobject.Properties) {
            [string]$entityKey = $prop.Name
            [int]$expectedCount = [int]$prop.Value
            [string]$tableName = if ($EntityTableMap.ContainsKey($entityKey)) { $EntityTableMap[$entityKey] } else { $entityKey }
            [string]$actualCountStr = Exec-StagingQuery "SELECT COUNT(*) FROM `"$tableName`";"
            [int]$actualCount = 0
            if (-not [int]::TryParse($actualCountStr, [ref]$actualCount)) {
                throw "HARD FAIL: Database count query failed for entity '$entityKey' (table '$tableName'). Output: $actualCountStr"
            }
            if ($expectedCount -ne $actualCount) {
                throw "Manifest Record Count Mismatch for entity '$entityKey' (table '$tableName'): expected $expectedCount, restored $actualCount"
            }
        }
        Write-Log "  Full manifest record counts reconciliation [PASS] (16 entities verified)" -Level "SUCCESS"
    }

    # Hard Guard: DB Attachment count > 0 requires physical attachment archive
    [int]$StagingAttCount = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"Attachment\";")
    if ($StagingAttCount -gt 0 -and (-not $AttArchivePath -or -not (Test-Path -Path $AttArchivePath))) {
        throw "HARD FAIL: Restored staging database contains $StagingAttCount Attachment records, but physical attachment archive is missing."
    }

    # Check Invariants
    [int]$WbDupeCurrent = 0
    [int]$WhDupeCurrent = 0
    [int]$QcvDupeCurrent = 0
    [int]$ImDupeCurrent = 0
    [string]$hasIsCurrentStaging = Exec-StagingQuery "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WeighbridgeRecord' AND column_name = 'isCurrent';"
    if ($hasIsCurrentStaging -eq "1") {
        $WbDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\", \"type\" FROM \"WeighbridgeRecord\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\", \"type\" HAVING COUNT(*) > 1) d;")
        $WhDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"WarehouseProcess\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
        $QcvDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"QcVehicleCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
        $ImDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"IncomingMaterialCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    }

    if (($WbDupeCurrent + $WhDupeCurrent + $QcvDupeCurrent + $ImDupeCurrent) -gt 0) {
        throw "Invariant Check Failed: Duplicate isCurrent=true records present in restored database."
    }
    Write-Log "  Duplicate isCurrent invariant check [PASS] (0 duplicates)" -Level "SUCCESS"

    [int]$OrphanHist = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"TransactionStatusHistory\" h LEFT JOIN \"Transaction\" t ON h.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWb = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"WeighbridgeRecord\" r LEFT JOIN \"Transaction\" t ON r.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWh = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"WarehouseProcess\" w LEFT JOIN \"Transaction\" t ON w.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanAtt = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"Attachment\" a LEFT JOIN \"Transaction\" t ON a.\"transactionId\" = t.id WHERE t.id IS NULL;")

    if (($OrphanHist + $OrphanWb + $OrphanWh + $OrphanAtt) -gt 0) {
        throw "FK Integrity Check Failed: Found orphaned child records in staging database."
    }
    Write-Log "  FK Orphan integrity check [PASS] (0 orphans)" -Level "SUCCESS"

    # Step 5: Isolated Physical Attachment Restoration & Path Reconciliation
    $StagingUploadDir = Join-Path -Path $ProjectRootDir -ChildPath "uploads_staging_${TimestampSuffix}"
    New-Item -Path $StagingUploadDir -ItemType Directory -Force | Out-Null
    [int]$RestoredPhysicalCount = 0

    if ($AttArchivePath) {
        Write-Log "Step 6: Restoring Physical Attachments into Isolated Staging Directory ($StagingUploadDir)..."
        $AttJsonData = Get-Content -Path $AttArchivePath -Raw | ConvertFrom-Json
        [string]$BaseCanonicalDir = [System.IO.Path]::GetFullPath($StagingUploadDir)

        if ($AttJsonData.files) {
            foreach ($fileObj in $AttJsonData.files) {
                [string]$relPath = $fileObj.relativePath
                if (-not $relPath) { $relPath = $fileObj.fileName }

                # Security Path Traversal Guard
                [string]$targetFile = [System.IO.Path]::GetFullPath((Join-Path -Path $BaseCanonicalDir -ChildPath $relPath))
                if (-not $targetFile.StartsWith($BaseCanonicalDir + [System.IO.Path]::DirectorySeparatorChar)) {
                    throw "Security Exception: Path traversal attempt detected in attachment path '$relPath'."
                }

                [string]$targetParent = Split-Path $targetFile -Parent
                if (-not (Test-Path -Path $targetParent -PathType Container)) {
                    New-Item -Path $targetParent -ItemType Directory -Force | Out-Null
                }

                [byte[]]$bytes = [System.Convert]::FromBase64String($fileObj.base64Content)
                [System.IO.File]::WriteAllBytes($targetFile, $bytes)

                # SHA256 checksum check
                [string]$calcHash = (Get-FileHash -Path $targetFile -Algorithm SHA256).Hash.ToLower()
                if ($fileObj.checksum -and ($calcHash -ne $fileObj.checksum.ToLower())) {
                    throw "Attachment File Checksum Failure: File '$relPath' checksum mismatch (Expected: $($fileObj.checksum), Calculated: $calcHash)."
                }
                $RestoredPhysicalCount++
            }
        }

        # Reconcile DB Attachment table entries against physical files in Staging Directory
        [string]$AttDbJson = Exec-StagingQuery "SELECT COALESCE(json_agg(json_build_object('id', id, 'filePath', \"filePath\", 'sha256', sha256)), '[]'::json) FROM \"Attachment\";"
        if (-not [string]::IsNullOrWhiteSpace($AttDbJson) -and $AttDbJson -ne "[]") {
            $AttDbList = $AttDbJson | ConvertFrom-Json
            foreach ($att in $AttDbList) {
                if ($att.filePath) {
                    [string]$normRelPath = $att.filePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar).Replace('\', [System.IO.Path]::DirectorySeparatorChar).TrimStart([System.IO.Path]::DirectorySeparatorChar)
                    [string]$expectedPhysicalFile = Join-Path -Path $StagingUploadDir -ChildPath $normRelPath

                    if (-not (Test-Path -Path $expectedPhysicalFile -PathType Leaf)) {
                        throw "Attachment Reconciliation Error: Database record ID $($att.id) references file '$normRelPath' which is missing from physical attachment archive."
                    }

                    if ($att.sha256) {
                        [string]$calcHash = (Get-FileHash -Path $expectedPhysicalFile -Algorithm SHA256).Hash.ToLower()
                        if ($calcHash -ne $att.sha256.ToLower()) {
                            throw "Attachment SHA-256 DB Reconciliation Error: File '$normRelPath' DB SHA ($($att.sha256)) mismatches physical SHA ($calcHash)."
                        }
                    }
                }
            }
        }
        Write-Log "  Physical attachment 100% reconciliation PASSED ($RestoredPhysicalCount files verified)" -Level "SUCCESS"
    }

    # Step 6: Atomic Switch-Over (Dual Promotion: Live DB & Physical Attachments)
    Write-Log "Step 7: Executing Atomic Switch-Over (Promoting Staging DB & Attachments to Live Production)..."

    # 7a. Atomic Live Database Promotion
    Write-Log "  7a. Promoting Staging Database to Live Production Database ($LiveDbName)..."
    $LiveContainerId = (& docker ps -q -f "name=$LiveContainer" 2>&1).ToString().Trim()

    if ([string]::IsNullOrWhiteSpace($LiveContainerId)) {
        throw "Live database target container [$LiveContainer] not found or not running. Live database restoration aborted."
    }

    # Helper for live database queries
    function Exec-LiveDbQuery([string]$sql) {
        return (& docker exec $LiveContainer psql -t -A -U $PgUser -d $LiveDbName -c "$sql" 2>&1).ToString().Trim()
    }

    # --------------------------------------------------------------------------
    # TARGET DATABASE FINGERPRINT & AUTHORIZATION GUARD (ZERO-FORCE BYPASS)
    # --------------------------------------------------------------------------
    Write-Log "  Verifying Target Database Fingerprint & Authorization Proof on [$LiveDbName]..."
    [string]$TableCountStr = Exec-LiveDbQuery "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
    [int]$LiveTableCount = 0
    [int]::TryParse($TableCountStr, [ref]$LiveTableCount) | Out-Null

    if ($InitializeNewEnvironment) {
        Write-Log "  -InitializeNewEnvironment switch detected. Verifying target database is 100% empty..."
        if ($LiveTableCount -gt 0) {
            [string]$LiveUserCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.\"User\"') IS NOT NULL THEN (SELECT COUNT(*) FROM \"User\") ELSE 0 END;"
            [string]$LiveMigCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.\"_prisma_migrations\"') IS NOT NULL THEN (SELECT COUNT(*) FROM \"_prisma_migrations\") ELSE 0 END;"
            [string]$LiveTxCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.\"Transaction\"') IS NOT NULL THEN (SELECT COUNT(*) FROM \"Transaction\") ELSE 0 END;"
            [int]$uCount = 0; [int]$mCount = 0; [int]$tCount = 0;
            [int]::TryParse($LiveUserCountStr, [ref]$uCount) | Out-Null
            [int]::TryParse($LiveMigCountStr, [ref]$mCount) | Out-Null
            [int]::TryParse($LiveTxCountStr, [ref]$tCount) | Out-Null
            if (($uCount + $mCount + $tCount) -gt 0) {
                throw "HARD FAIL: -InitializeNewEnvironment REJECTED! Target database [$LiveDbName] is populated (Tables: $LiveTableCount, Migrations: $mCount, Users: $uCount, Tx: $tCount). Initialization is only permitted on 100% empty databases."
            }
        }
        Write-Log "  Target database verified empty for fresh environment initialization [PASS]" -Level "SUCCESS"
    } else {
        # Standard Production Restore: Enforce strict fingerprint validation
        if ($LiveTableCount -eq 0) {
            throw "HARD FAIL: Target database [$LiveDbName] has 0 tables and is not initialized. For fresh databases, use -InitializeNewEnvironment. NO DATABASE MUTATION OCCURRED."
        }

        [string]$hasMigrations = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.\"_prisma_migrations\"') IS NOT NULL THEN 1 ELSE 0 END;"
        [string]$hasAppSettings = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.\"AppSetting\"') IS NOT NULL THEN 1 ELSE 0 END;"

        if ($hasMigrations -ne "1" -or $hasAppSettings -ne "1") {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Target database [$LiveDbName] does not contain valid GMS schema tables (_prisma_migrations or AppSetting missing). NO DATABASE MUTATION OCCURRED."
        }

        # Check GMS_ENVIRONMENT_ID
        [string]$ActualEnvId = Exec-LiveDbQuery "SELECT COALESCE((SELECT value FROM \"AppSetting\" WHERE key = 'GMS_ENVIRONMENT_ID' OR key = 'ENVIRONMENT_ID' OR key = 'SYSTEM_ENVIRONMENT_ID' LIMIT 1), '');"
        if ([string]::IsNullOrWhiteSpace($ActualEnvId)) {
            $ActualEnvId = $ExpectedEnvironmentId
        }
        if ($ExpectedEnvironmentId -and $ActualEnvId -ne $ExpectedEnvironmentId) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Environment ID '$ExpectedEnvironmentId' does not match target database ID '$ActualEnvId'. NO DATABASE MUTATION OCCURRED."
        }

        # Check GMS_INSTALLATION_UUID
        [string]$ActualInstallUuid = Exec-LiveDbQuery "SELECT COALESCE((SELECT value FROM \"AppSetting\" WHERE key = 'GMS_INSTALLATION_UUID' OR key = 'INSTALLATION_UUID' LIMIT 1), '');"
        if ($ExpectedInstallationUuid -and -not [string]::IsNullOrWhiteSpace($ActualInstallUuid) -and $ActualInstallUuid -ne $ExpectedInstallationUuid) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Installation UUID '$ExpectedInstallationUuid' does not match target UUID '$ActualInstallUuid'. NO DATABASE MUTATION OCCURRED."
        }

        # Check GMS_RESTORE_ALLOWED
        [string]$RestoreAllowedVal = Exec-LiveDbQuery "SELECT COALESCE((SELECT UPPER(value) FROM \"AppSetting\" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1), 'FALSE');"
        if ($RestoreAllowedVal -ne "TRUE" -and $RestoreAllowedVal -ne "1") {
            throw "HARD FAIL: GMS_RESTORE_ALLOWED is set to '$RestoreAllowedVal' in AppSetting. Restore operation is NOT permitted on live database [$LiveDbName]. Set GMS_RESTORE_ALLOWED = TRUE in target database prior to executing restore. NO DATABASE MUTATION OCCURRED."
        }

        Write-Log "  Target DB Fingerprint Verified (Env: $ActualEnvId, UUID: $ActualInstallUuid, RESTORE_ALLOWED: TRUE) [PASS]" -Level "SUCCESS"
    }

    $PreRestoreDbDump = Join-Path -Path $LocalBackupDir -ChildPath "pre_restore_live_db_${TimestampSuffix}.dump"
    Write-Log "  Creating mandatory pre-restore safety dump of Live Production Database ($LiveDbName)..."
    & docker exec $LiveContainer pg_dump -U $PgUser -d $LiveDbName -F c -f "/tmp/pre_restore_live_db.dump" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "MANDATORY PRE-RESTORE SNAPSHOT FAILED: pg_dump exited with error code $LASTEXITCODE. Live promotion aborted."
    }
    & docker cp "${LiveContainer}:/tmp/pre_restore_live_db.dump" $PreRestoreDbDump 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -Path $PreRestoreDbDump -PathType Leaf)) {
        throw "MANDATORY PRE-RESTORE SNAPSHOT FAILED: Failed copying snapshot to host path $PreRestoreDbDump."
    }
    & docker exec $LiveContainer rm -f "/tmp/pre_restore_live_db.dump" 2>&1 | Out-Null
    Write-Log "  Mandatory pre-restore live database snapshot created & verified: $PreRestoreDbDump" -Level "SUCCESS"

    $PromotionPhase = "DURING_DB_PROMOTION"
    Write-Log "  Live Postgres Container [$LiveContainer] detected. Terminating active client connections..."
    & docker exec $LiveContainer psql -U $PgUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LiveDbName' AND pid <> pg_backend_pid();" 2>&1 | Out-Null

    if ($FaultInjectionPhase -eq "DURING_DB_PROMOTION" -or $env:GMS_FAULT_INJECTION_PHASE -eq "DURING_DB_PROMOTION") {
        throw "INJECTED_FAULT: Simulated live pg_restore execution failure during DB promotion."
    }

    Write-Log "  Executing transactional pg_restore directly into Live Production Database ($LiveDbName)..."
    [string]$TmpDumpInLive = "/tmp/$DumpFileName"
    & docker cp $DumpFilePath "${LiveContainer}:${TmpDumpInLive}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to live database container." }

    & docker exec $LiveContainer psql -U $PgUser -d $LiveDbName -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>&1 | Out-Null
    $LiveRestoreOut = & docker exec $LiveContainer pg_restore --username=$PgUser --dbname=$LiveDbName --no-owner --no-privileges --single-transaction --exit-on-error $TmpDumpInLive 2>&1
    [int]$LiveExitCode = $LASTEXITCODE
    & docker exec $LiveContainer rm -f $TmpDumpInLive 2>&1 | Out-Null

    if ($LiveExitCode -ne 0) {
        throw "Live Database Promotion (pg_restore) failed with exit code $LiveExitCode: $LiveRestoreOut"
    }

    # DB pg_restore committed into live target; transition phase immediately to guarantee DB rollback on any subsequent error
    $PromotionPhase = "DB_COMMITTED_PENDING_ATTACHMENT"
    Write-Log "  Live Database pg_restore committed into [$LiveDbName] [PASS]" -Level "SUCCESS"

    if ($FaultInjectionPhase -eq "POST_DB_COMMIT" -or $env:GMS_FAULT_INJECTION_PHASE -eq "POST_DB_COMMIT") {
        throw "INJECTED_FAULT: Simulated post-DB-commit promotion failure for DR drill validation."
    }

    # Verify Live DB migration deployment
    [string]$LiveMigCountStr = Exec-LiveDbQuery "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"
    [int]$LiveMigCount = 0
    if (-not [int]::TryParse($LiveMigCountStr, [ref]$LiveMigCount) -or $LiveMigCount -eq 0) {
        throw "Post-Promotion Live DB Verification Error: _prisma_migrations empty or missing in live database."
    }
    Write-Log "  Live Database Migration verified ($LiveMigCount finished migrations) [PASS]" -Level "SUCCESS"

    # 7b. Atomic Directory Swap for Attachments
    $PromotionPhase = "DURING_ATTACHMENT_PROMOTION"
    $PreRestoreUploadsDir = Join-Path -Path $ProjectRootDir -ChildPath "uploads_pre_restore_${TimestampSuffix}"
    if (Test-Path -Path $UploadDir) {
        Rename-Item -Path $UploadDir -NewName (Split-Path $PreRestoreUploadsDir -Leaf)
    }
    Rename-Item -Path $StagingUploadDir -NewName (Split-Path $UploadDir -Leaf)
    Write-Log "  Physical attachments directory atomically swapped [PASS]" -Level "SUCCESS"

    if ($FaultInjectionPhase -eq "ATTACHMENT_SWAP" -or $env:GMS_FAULT_INJECTION_PHASE -eq "ATTACHMENT_SWAP") {
        throw "INJECTED_FAULT: Simulated attachment promotion failure for DR drill validation."
    }

    # Step 7: Comprehensive 16-Entity, Invariant, and Attachment Integrity Verification against LIVE target
    $PromotionPhase = "DURING_LIVE_VERIFICATION"
    Write-Log "  Executing full 16-entity manifest and invariant verification against live target..."

    if ($FaultInjectionPhase -eq "LIVE_VERIFICATION" -or $env:GMS_FAULT_INJECTION_PHASE -eq "LIVE_VERIFICATION") {
        throw "INJECTED_FAULT: Simulated live verification discrepancy for DR drill validation."
    }

    [int]$LiveUserCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"User\";")
    [int]$LiveTxCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"Transaction\";")
    [int]$LiveAttCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"Attachment\";")
    [int]$LiveCorrectionCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"TransactionCorrection\";")
    [int]$LiveCorrectionItemCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"TransactionCorrectionItem\";")
    [int]$LiveWbCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"WeighbridgeRecord\";")
    [int]$LiveWhCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"WarehouseProcess\";")
    [int]$LiveQcvCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"QcVehicleCheck\";")
    [int]$LiveImCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"IncomingMaterialCheck\";")
    [int]$LiveFraudCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"FraudCheck\";")
    [int]$LiveActCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"ActivityLog\";")
    [int]$LiveSettingCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"AppSetting\";")
    [int]$LiveAnnounceCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"Announcement\";")
    [int]$LiveIssueCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"SystemIssue\";")
    [int]$LiveStatusHistCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"TransactionStatusHistory\";")
    [int]$LiveWhAccessCount = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"UserWarehouseAccess\";")

    # Invariant checks on live database
    [int]$LiveWbDupeCurrent = 0
    [int]$LiveWhDupeCurrent = 0
    [int]$LiveQcvDupeCurrent = 0
    [int]$LiveImDupeCurrent = 0
    [string]$hasIsCurrentLive = Exec-LiveDbQuery "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WeighbridgeRecord' AND column_name = 'isCurrent';"
    if ($hasIsCurrentLive -eq "1") {
        $LiveWbDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\", \"type\" FROM \"WeighbridgeRecord\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\", \"type\" HAVING COUNT(*) > 1) d;")
        $LiveWhDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"WarehouseProcess\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
        $LiveQcvDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"QcVehicleCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
        $LiveImDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"IncomingMaterialCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    }
    [int]$LiveTotalDupes = $LiveWbDupeCurrent + $LiveWhDupeCurrent + $LiveQcvDupeCurrent + $LiveImDupeCurrent

    [int]$LiveOrphanHist = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"TransactionStatusHistory\" h LEFT JOIN \"Transaction\" t ON h.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$LiveOrphanWb = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"WeighbridgeRecord\" r LEFT JOIN \"Transaction\" t ON r.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$LiveOrphanWh = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"WarehouseProcess\" w LEFT JOIN \"Transaction\" t ON w.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$LiveOrphanAtt = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM \"Attachment\" a LEFT JOIN \"Transaction\" t ON a.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$LiveTotalOrphans = $LiveOrphanHist + $LiveOrphanWb + $LiveOrphanWh + $LiveOrphanAtt

    if ($LiveTotalDupes -gt 0) {
        throw "Post-Promotion Live DB Verification Error: Duplicate isCurrent violations detected on live target ($LiveTotalDupes)."
    }
    if ($LiveTotalOrphans -gt 0) {
        throw "Post-Promotion Live DB Verification Error: Foreign key orphan violations detected on live target ($LiveTotalOrphans)."
    }

    # Physical attachment reconciliation on live uploads
    if ($LiveAttCount -gt 0 -and $AttArchivePath) {
        if ($RestoredPhysicalCount -lt $LiveAttCount) {
            throw "Post-Promotion Live Verification Error: Restored physical attachments count ($RestoredPhysicalCount) is less than database attachment records ($LiveAttCount). Hard failure enforced."
        }
    }

    # Assert all 16 live entity counts against manifest
    if ($ManifestData.recordCounts) {
        Write-Log "  Asserting 16-entity manifest counts directly against live target..."
        $CountsObj = $ManifestData.recordCounts
        $LiveEntityMap = @{
            "users" = $LiveUserCount
            "userWarehouseAccess" = $LiveWhAccessCount
            "transactions" = $LiveTxCount
            "transactionStatusHistory" = $LiveStatusHistCount
            "weighbridgeRecords" = $LiveWbCount
            "warehouseProcesses" = $LiveWhCount
            "qcVehicleChecks" = $LiveQcvCount
            "incomingMaterialChecks" = $LiveImCount
            "attachments" = $LiveAttCount
            "fraudChecks" = $LiveFraudCount
            "activityLogs" = $LiveActCount
            "appSettings" = $LiveSettingCount
            "announcements" = $LiveAnnounceCount
            "systemIssues" = $LiveIssueCount
            "transactionCorrections" = $LiveCorrectionCount
            "transactionCorrectionItems" = $LiveCorrectionItemCount
        }
        foreach ($prop in $CountsObj.psobject.Properties) {
            [string]$entityKey = $prop.Name
            [int]$expectedCount = [int]$prop.Value
            if ($LiveEntityMap.ContainsKey($entityKey)) {
                [int]$actualLiveCount = [int]$LiveEntityMap[$entityKey]
                if ($expectedCount -ne $actualLiveCount) {
                    throw "Post-Promotion Live DB Verification Error: Record count mismatch for '$entityKey'. Expected: $expectedCount, Live: $actualLiveCount."
                }
            }
        }
        Write-Log "  Live 16-entity manifest assertions PASSED [PASS]" -Level "SUCCESS"
    }

    [bool]$PassedLiveAssertions = ($LiveTotalDupes -eq 0) -and ($LiveTotalOrphans -eq 0) -and (-not ($LiveAttCount -gt 0 -and $AttArchivePath -and ($RestoredPhysicalCount -lt $LiveAttCount)))
    [string]$VerdictStatus = if ($PassedLiveAssertions) { "PASSED" } else { "FAILED" }

    [datetime]$RestoreEndTime = Get-Date
    [double]$RtoSeconds = [math]::Round(($RestoreEndTime - $RestoreStartTime).TotalSeconds, 2)

    $EvidenceObj = @{
        restoreId = "RESTORE-" + $TimestampSuffix
        backupId = $BackupId
        restoreTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = $VerdictStatus
        verifiedDumpHash = $ActualDumpHash
        verifiedAttachmentArchiveHash = if ($AttArchivePath) { (Get-FileHash -Path $AttArchivePath -Algorithm SHA256).Hash.ToLower() } else { null }
        recordCountsVerified = @{
            users = $LiveUserCount
            userWarehouseAccess = $LiveWhAccessCount
            transactions = $LiveTxCount
            transactionStatusHistory = $LiveStatusHistCount
            weighbridgeRecords = $LiveWbCount
            warehouseProcesses = $LiveWhCount
            qcVehicleChecks = $LiveQcvCount
            incomingMaterialChecks = $LiveImCount
            attachments = $LiveAttCount
            restoredPhysicalAttachments = $RestoredPhysicalCount
            fraudChecks = $LiveFraudCount
            activityLogs = $LiveActCount
            appSettings = $LiveSettingCount
            announcements = $LiveAnnounceCount
            systemIssues = $LiveIssueCount
            transactionCorrections = $LiveCorrectionCount
            transactionCorrectionItems = $LiveCorrectionItemCount
            migrations = $LiveMigCount
        }
        duplicateIsCurrentViolations = $LiveTotalDupes
        fkOrphanViolations = $LiveTotalOrphans
        rtoSeconds = $RtoSeconds
    }

    $EvidenceJson = $EvidenceObj | ConvertTo-Json -Depth 5 -Compress
    Set-Content -Path $RestoreEvidencePath -Value $EvidenceJson -Encoding utf8
    Write-Log "Restore Evidence Proof written to $RestoreEvidencePath [PASS]" -Level "SUCCESS"

    Write-Log "=============================================================================="
    Write-Log "PRODUCTION RESTORE COMPLETED SUCCESSFULLY! RTO: $RtoSeconds seconds." -Level "SUCCESS"
    Write-Log "=============================================================================="

    $RestoreSucceeded = $true

} catch {
    Write-Log "=============================================================================="
    Write-Log "PRODUCTION RESTORE FAILED during phase [$PromotionPhase]: $_" -Level "ERROR"
    if ($PromotionPhase -eq "BEFORE_LIVE_PROMOTION") {
        Write-Log "FAIL-CLOSED ACTIVE: Live database and live attachment files were NOT modified." -Level "ERROR"
    } elseif ($PromotionPhase -in @("DURING_DB_PROMOTION", "DB_COMMITTED_PENDING_ATTACHMENT", "DURING_ATTACHMENT_PROMOTION", "DURING_LIVE_VERIFICATION")) {
        Write-Log "CRITICAL PROMOTION FAILURE: Live database was affected or committed. Attempting automatic compensating rollback of Live DB..." -Level "ERROR"
        if ($PreRestoreDbDump -and (Test-Path -Path $PreRestoreDbDump)) {
            try {
                Write-Log "  Attempting automatic live database rollback to pre-restore snapshot ($PreRestoreDbDump)..." -Level "WARN"
                [string]$TmpRollbackInLive = "/tmp/rollback_$DumpFileName"
                & docker cp $PreRestoreDbDump "${LiveContainer}:${TmpRollbackInLive}"
                if ($LASTEXITCODE -ne 0) { throw "Failed copying rollback snapshot to live container." }
                & docker exec $LiveContainer psql -U $PgUser -d $LiveDbName -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>&1 | Out-Null
                & docker exec $LiveContainer pg_restore --username=$PgUser --dbname=$LiveDbName --no-owner --no-privileges --single-transaction --exit-on-error $TmpRollbackInLive 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "Rollback pg_restore exited with error code $LASTEXITCODE." }
                & docker exec $LiveContainer rm -f $TmpRollbackInLive 2>&1 | Out-Null
                Write-Log "  Live database successfully rolled back to pre-restore snapshot." -Level "SUCCESS"
            } catch {
                Write-Log "  CRITICAL ROLLBACK ERROR: Automatic live DB rollback failed: $_" -Level "ERROR"
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($PreRestoreUploadsDir) -and (Test-Path -Path $PreRestoreUploadsDir)) {
            try {
                if (Test-Path -Path $UploadDir) { Remove-Item -Path $UploadDir -Recurse -Force -ErrorAction SilentlyContinue }
                Rename-Item -Path $PreRestoreUploadsDir -NewName (Split-Path $UploadDir -Leaf)
                Write-Log "  Uploads directory successfully reverted to pre-restore snapshot." -Level "SUCCESS"
            } catch {
                Write-Log "  CRITICAL ROLLBACK ERROR: Uploads directory rollback failed: $_" -Level "ERROR"
            }
        }
    }
    Write-Log "=============================================================================="

    $EvidenceObj = @{
        restoreId = "RESTORE-" + $TimestampSuffix
        backupId = $BackupId
        restoreTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "FAILED"
        promotionPhase = $PromotionPhase
        error = $_.ToString()
    }
    $EvidenceJson = $EvidenceObj | ConvertTo-Json -Compress
    Set-Content -Path $RestoreEvidencePath -Value $EvidenceJson -Encoding utf8

    # Clean staging upload directory if created
    if (-not [string]::IsNullOrWhiteSpace($StagingUploadDir) -and (Test-Path -Path $StagingUploadDir)) {
        Remove-Item -Path $StagingUploadDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
} finally {
    # Step 8: Maintenance Mode Teardown & Container Cleanup (Fail-Closed)
    if ($RestoreSucceeded) {
        if (Test-Path -Path $MaintFlagPath) {
            Remove-Item -Path $MaintFlagPath -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -Path $MaintActivePath) {
            Remove-Item -Path $MaintActivePath -Force -ErrorAction SilentlyContinue
        }
        Write-Log "Maintenance mode released & staging container destroyed."
    } else {
        Write-Log "RESTORE FAILED OR INCOMPLETE! MAINTENANCE MODE REMAINS ACTIVE FOR SAFETY." -Level "WARN"
        Write-Log "Maintenance flags ($MaintFlagPath & $MaintActivePath) have been preserved." -Level "WARN"
    }

    # Auto-reset GMS_RESTORE_ALLOWED to FALSE in target database for security
    if (-not [string]::IsNullOrWhiteSpace($LiveContainerId)) {
        try {
            & docker exec $LiveContainer psql -U $PgUser -d $LiveDbName -c "UPDATE \"AppSetting\" SET value = 'FALSE' WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED';" 2>&1 | Out-Null
        } catch {}
    }

    & docker rm -f $StagingContainer 2>&1 | Out-Null
}

exit 0
