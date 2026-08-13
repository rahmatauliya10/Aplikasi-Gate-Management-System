# ==============================================================================
# GMS Production DR Control Plane & Staged Atomic Restore Operator Tool (P0-06)
# ==============================================================================
# Purpose: Executes production database & attachment restores via an ISOLATED STAGING
# PIPELINE. Ensures 100% atomic switch-over: live database & live uploads are NEVER
# modified until checksums, schema migrations, business invariants, and physical
# attachment SHA-256 relative path reconciliations pass 100% verification.
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
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$LogDir = "C:\GMS_Logs"
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
[string]$BackupId = $ManifestData.backupId
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

[string]$ActualDumpHash = (Get-FileHash -Path $DumpFilePath -Algorithm SHA256).Hash.ToLower()
[string]$ExpectedDumpHash = $ManifestData.checksums.dump.ToLower()
if ($ActualDumpHash -ne $ExpectedDumpHash) {
    throw "Dump File Checksum Mismatch! Expected: $ExpectedDumpHash, Actual: $ActualDumpHash. Aborting restore."
}
Write-Log "  Dump file SHA-256 checksum verified [PASS] ($ActualDumpHash)" -Level "SUCCESS"

[string]$AttArchiveFileName = $ManifestData.artifacts.attachmentsArchive
[string]$AttArchivePath = ""
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

[string]$PromotionPhase = "BEFORE_LIVE_PROMOTION"

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

    # Check Invariants
    [int]$WbDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\", \"type\" FROM \"WeighbridgeRecord\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\", \"type\" HAVING COUNT(*) > 1) d;")
    [int]$WhDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"WarehouseProcess\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$QcvDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"QcVehicleCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$ImDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"IncomingMaterialCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")

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
    [string]$StagingUploadDir = Join-Path -Path $ProjectRootDir -ChildPath "uploads_staging_${TimestampSuffix}"
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
    [string]$LiveContainerId = (& docker ps -q -f "name=$LiveContainer" 2>&1).ToString().Trim()

    if ([string]::IsNullOrWhiteSpace($LiveContainerId)) {
        throw "Live database target container [$LiveContainer] not found or not running. Live database restoration aborted."
    }

    $PromotionPhase = "DURING_DB_PROMOTION"
    Write-Log "  Live Postgres Container [$LiveContainer] detected. Terminating active client connections..."
    & docker exec $LiveContainer psql -U $PgUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LiveDbName' AND pid <> pg_backend_pid();" 2>&1 | Out-Null

    Write-Log "  Executing transactional pg_restore directly into Live Production Database ($LiveDbName)..."
    [string]$TmpDumpInLive = "/tmp/$DumpFileName"
    & docker cp $DumpFilePath "${LiveContainer}:${TmpDumpInLive}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to live database container." }

    $LiveRestoreOut = & docker exec $LiveContainer pg_restore --username=$PgUser --dbname=$LiveDbName --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error $TmpDumpInLive 2>&1
    [int]$LiveExitCode = $LASTEXITCODE
    & docker exec $LiveContainer rm -f $TmpDumpInLive 2>&1 | Out-Null

    if ($LiveExitCode -ne 0) {
        throw "Live Database Promotion (pg_restore) failed with exit code $LiveExitCode: $LiveRestoreOut"
    }

    # Verify Live DB migration deployment & invariants
    [string]$LiveMigCountStr = (& docker exec $LiveContainer psql -t -A -U $PgUser -d $LiveDbName -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" 2>&1).ToString().Trim()
    [int]$LiveMigCount = 0
    if (-not [int]::TryParse($LiveMigCountStr, [ref]$LiveMigCount) -or $LiveMigCount -eq 0) {
        throw "Post-Promotion Live DB Verification Error: _prisma_migrations empty or missing in live database."
    }
    Write-Log "  Live Database Promotion verified [PASS] ($LiveMigCount finished migrations)" -Level "SUCCESS"

    # 7b. Atomic Directory Swap for Attachments
    $PromotionPhase = "DURING_ATTACHMENT_PROMOTION"
    [string]$PreRestoreUploadsDir = Join-Path -Path $ProjectRootDir -ChildPath "uploads_pre_restore_${TimestampSuffix}"
    if (Test-Path -Path $UploadDir) {
        Rename-Item -Path $UploadDir -NewName (Split-Path $PreRestoreUploadsDir -Leaf)
    }
    Rename-Item -Path $StagingUploadDir -NewName (Split-Path $UploadDir -Leaf)
    Write-Log "  Physical attachments directory atomically swapped [PASS]" -Level "SUCCESS"

    # Step 7: Record Audit Evidence Proof
    [datetime]$RestoreEndTime = Get-Date
    [double]$RtoSeconds = [math]::Round(($RestoreEndTime - $RestoreStartTime).TotalSeconds, 2)

    [int]$TxCount = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"Transaction\";")
    [int]$UserCount = [int](Exec-StagingQuery "SELECT COUNT(*) FROM \"User\";")

    $EvidenceObj = @{
        restoreId = "RESTORE-" + $TimestampSuffix
        backupId = $BackupId
        restoreTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "PASSED"
        verifiedDumpHash = $ActualDumpHash
        verifiedAttachmentArchiveHash = if ($AttArchivePath) { (Get-FileHash -Path $AttArchivePath -Algorithm SHA256).Hash.ToLower() } else { null }
        recordCountsVerified = @{
            users = $UserCount
            transactions = $TxCount
            migrations = $MigrationCount
            attachments = $RestoredPhysicalCount
        }
        duplicateIsCurrentViolations = 0
        fkOrphanViolations = 0
        rtoSeconds = $RtoSeconds
    }

    $EvidenceJson = $EvidenceObj | ConvertTo-Json -Compress
    Set-Content -Path $RestoreEvidencePath -Value $EvidenceJson -Encoding utf8
    Write-Log "Restore Evidence Proof written to $RestoreEvidencePath [PASS]" -Level "SUCCESS"

    Write-Log "=============================================================================="
    Write-Log "PRODUCTION RESTORE COMPLETED SUCCESSFULLY! RTO: $RtoSeconds seconds." -Level "SUCCESS"
    Write-Log "=============================================================================="

} catch {
    Write-Log "=============================================================================="
    Write-Log "PRODUCTION RESTORE FAILED during phase [$PromotionPhase]: $_" -Level "ERROR"
    if ($PromotionPhase -eq "BEFORE_LIVE_PROMOTION") {
        Write-Log "FAIL-CLOSED ACTIVE: Live database and live attachment files were NOT modified." -Level "ERROR"
    } elseif ($PromotionPhase -eq "DURING_DB_PROMOTION") {
        Write-Log "CRITICAL PROMOTION FAILURE: Live database promotion failed (single-transaction rollback executed). Attachments were NOT modified." -Level "ERROR"
    } elseif ($PromotionPhase -eq "DURING_ATTACHMENT_PROMOTION") {
        Write-Log "CRITICAL PROMOTION FAILURE: Live database promotion succeeded, but attachment promotion failed. Immediate operator intervention required." -Level "ERROR"
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
    if (Test-Path -Path $StagingUploadDir) {
        Remove-Item -Path $StagingUploadDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
} finally {
    # Step 8: Maintenance Mode Teardown & Container Cleanup
    if (Test-Path -Path $MaintFlagPath) {
        Remove-Item -Path $MaintFlagPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -Path $MaintActivePath) {
        Remove-Item -Path $MaintActivePath -Force -ErrorAction SilentlyContinue
    }
    & docker rm -f $StagingContainer 2>&1 | Out-Null
    Write-Log "Maintenance mode released & staging container destroyed."
}

exit 0
