# ==============================================================================
# GMS Automated Actual Restore Drill Protocol (P0-05 / P0-06)
# ==============================================================================
# Purpose: Executes an actual physical restore drill into a DEDICATED EPHEMERAL
# POSTGRES CONTAINER (completely isolated from live production database container).
# Verifies data structural integrity via SQL query, reconciles physical attachment
# files & SHA-256 hashes using exact normalized relative paths, reconciles ALL
# backup manifest record counts in a loop, enforces mandatory SHA-256 checksums,
# logs results for SLA compliance, and destroys temporary container cleanly.
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DrillPort = "5434"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[array]$CandidateBackupDirs = @(
    (Join-Path -Path $ProjectRootDir -ChildPath "backups\local"),
    (Join-Path -Path $ProjectRootDir -ChildPath "deploy\backups\local"),
    "C:\GMS_Backups"
)
if ($env:LOCAL_BACKUP_DIR) { $CandidateBackupDirs += $env:LOCAL_BACKUP_DIR }

[string]$LocalBackupDir = ""
foreach ($dir in $CandidateBackupDirs) {
    if (Test-Path -Path $dir -PathType Container) {
        $LocalBackupDir = $dir
        break
    }
}
if (-not $LocalBackupDir) {
    $LocalBackupDir = Join-Path -Path $ProjectRootDir -ChildPath "backups\local"
    New-Item -Path $LocalBackupDir -ItemType Directory -Force | Out-Null
}

[string]$LogDir = "C:\GMS_Logs"
[string]$LogFile = Join-Path -Path $LogDir -ChildPath "restore_drills.log"
[string]$RestoreHistoryPath = Join-Path -Path $LocalBackupDir -ChildPath "restore_history.json"

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

Write-Log "Starting GMS Comprehensive Actual Restore Drill Protocol (P0-05/P0-06)..."
[datetime]$DrillStartTime = Get-Date

# 1. Locate latest dump file
$LatestDump = Get-ChildItem -Path $LocalBackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $LatestDump) {
    Write-Log "No .dump backup files found in $LocalBackupDir to perform drill." -Level "ERROR"
    exit 1
}

[double]$RpoMinutes = [math]::Round(((Get-Date) - $LatestDump.LastWriteTime).TotalMinutes, 2)
Write-Log "Selected dump candidate: $($LatestDump.Name) ($($LatestDump.Length) bytes). Calculated RPO: $RpoMinutes minutes."

# Extract backup timestamp prefix from dump name if possible (e.g. gms_2026-08-12T10-00-00-000Z.dump -> 2026-08-12T10-00-00-000Z)
[string]$BackupTimestamp = ""
if ($LatestDump.Name -match "gms_(.+)\.dump") {
    $BackupTimestamp = $Matches[1]
}

# 1.1 Strict Backup Manifest Location & Mandatory Pre-Verification
[string]$ManifestCandidatePath = ""
if ($BackupTimestamp) {
    $foundManifest = Get-ChildItem -Path $LocalBackupDir -Filter "*${BackupTimestamp}*_manifest.json" | Select-Object -First 1
    if ($foundManifest) { $ManifestCandidatePath = $foundManifest.FullName }
}

if (-not $ManifestCandidatePath -or -not (Test-Path -Path $ManifestCandidatePath)) {
    throw "Backup Manifest Missing: Required manifest JSON file matching dump candidate ($BackupTimestamp) was not found in $LocalBackupDir. Fallback pairing is disabled."
}

Write-Log "Found exact backup manifest ($ManifestCandidatePath). Pre-verifying checksums..."
$ManifestData = Get-Content -Path $ManifestCandidatePath -Raw | ConvertFrom-Json

# HARD FAILURE: Missing dump checksum in manifest is prohibited
if (-not $ManifestData.checksums -or -not $ManifestData.checksums.dump) {
    throw "Security Exception: Backup manifest ($ManifestCandidatePath) is missing mandatory dump SHA-256 checksum field. Skipping checksum verification is prohibited for production DR drills."
}

[string]$ActualDumpHash = (Get-FileHash -Path $LatestDump.FullName -Algorithm SHA256).Hash.ToLower()
[string]$ExpectedDumpHash = $ManifestData.checksums.dump.ToLower()
if ($ActualDumpHash -ne $ExpectedDumpHash) {
    throw "Dump SHA-256 Checksum Mismatch against Manifest! Expected: $ExpectedDumpHash, Computed: $ActualDumpHash"
}
Write-Log "Dump SHA-256 pre-verification PASSED against manifest ($ActualDumpHash)."

[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$DrillContainer = "gms-dr-postgres-" + $TimestampSuffix
[string]$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
[string]$PgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "testpassword" }
[string]$DrillDbName = "gms_dr_restore"

try {
    Write-Log "Step 1: Starting dedicated isolated PostgreSQL container ($DrillContainer on port $DrillPort)..."
    & docker run -d --name $DrillContainer -p "${DrillPort}:5432" -e "POSTGRES_USER=$PgUser" -e "POSTGRES_PASSWORD=$PgPass" -e "POSTGRES_DB=$DrillDbName" postgres:15-alpine 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to start dedicated PostgreSQL DR restore container." }

    # Wait for PostgreSQL container readiness
    [bool]$ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        & docker exec $DrillContainer pg_isready -U $PgUser 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw "Dedicated DR PostgreSQL container failed to become ready within 30 seconds." }

    Write-Log "Step 2: Executing physical pg_restore into isolated DR container..."
    [string]$TmpDumpPath = "/tmp/$($LatestDump.Name)"
    & docker cp $LatestDump.FullName "${DrillContainer}:${TmpDumpPath}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to DR container." }

    $RestoreOut = & docker exec $DrillContainer pg_restore --username=$PgUser --dbname=$DrillDbName --no-owner --no-privileges $TmpDumpPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit code $LASTEXITCODE. Output: $RestoreOut"
    }

    # Clean tmp dump in container
    & docker exec $DrillContainer rm -f $TmpDumpPath 2>&1 | Out-Null

    Write-Log "Step 3: Deep Data Integrity & Invariant Verification..."
    
    # Helper to run query inside isolated container
    function Exec-Query([string]$sql) {
        return (& docker exec $DrillContainer psql -t -A -U $PgUser -d $DrillDbName -c "$sql" 2>&1).ToString().Trim()
    }

    # Table mapping dictionary between Manifest Record Count key names and SQL table names
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

    # Check 1: Record Count Reconciliation across ALL Manifest Entities in a Loop
    Write-Log "Check 3.1: Validating restored row counts against manifest for ALL entities..."
    $CountsObj = if ($ManifestData.recordCounts) { $ManifestData.recordCounts } else { $ManifestData.expectedCounts }
    if (-not $CountsObj) {
        throw "Manifest Error: recordCounts object is missing in manifest data."
    }

    foreach ($prop in $CountsObj.psobject.Properties) {
        [string]$entityKey = $prop.Name
        [int]$expectedCount = [int]$prop.Value

        # Resolve SQL table name
        [string]$tableName = if ($EntityTableMap.ContainsKey($entityKey)) { $EntityTableMap[$entityKey] } else { $entityKey }
        
        [string]$sqlQuery = "SELECT COUNT(*) FROM `"$tableName`";"
        [string]$actualCountStr = Exec-Query $sqlQuery
        [int]$actualCount = 0
        if (-not [int]::TryParse($actualCountStr, [ref]$actualCount)) {
            throw "Failed querying table '$tableName' for manifest entity '$entityKey'. SQL Output: $actualCountStr"
        }

        if ($expectedCount -ne $actualCount) {
            throw "FULL MANIFEST RECONCILIATION FAILED for entity '$entityKey' (table '$tableName'): expected $expectedCount, restored $actualCount"
        }
        Write-Log "  Entity '$entityKey' ($tableName): expected $expectedCount === actual $actualCount [OK]"
    }
    Write-Log "Full manifest record count reconciliation PASSED with 100% exact match." -Level "SUCCESS"

    # Fetch total user and table count for metrics
    [int]$UserCount = [int](Exec-Query "SELECT COUNT(*) FROM \"User\";")
    [int]$TableCount = [int](Exec-Query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
    [int]$TxCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\";")
    [int]$AttCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Attachment\";")
    [string]$MigrationCountStr = Exec-Query "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"

    # Check 2: Invariant checks (Duplicate isCurrent must be 0)
    [int]$WbDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\", \"type\" FROM \"WeighbridgeRecord\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\", \"type\" HAVING COUNT(*) > 1) d;")
    [int]$WhDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"WarehouseProcess\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$QcvDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"QcVehicleCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$ImDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"IncomingMaterialCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")

    if (($WbDupeCurrent + $WhDupeCurrent + $QcvDupeCurrent + $ImDupeCurrent) -gt 0) {
        throw "Data Invariant Violation: Found duplicate isCurrent=true records (WB: $WbDupeCurrent, WH: $WhDupeCurrent, QCV: $QcvDupeCurrent, IM: $ImDupeCurrent)."
    }

    # Check 3: FK Orphan Checks (must be 0)
    [int]$OrphanHist = [int](Exec-Query "SELECT COUNT(*) FROM \"TransactionStatusHistory\" h LEFT JOIN \"Transaction\" t ON h.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWb = [int](Exec-Query "SELECT COUNT(*) FROM \"WeighbridgeRecord\" r LEFT JOIN \"Transaction\" t ON r.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWh = [int](Exec-Query "SELECT COUNT(*) FROM \"WarehouseProcess\" w LEFT JOIN \"Transaction\" t ON w.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanAtt = [int](Exec-Query "SELECT COUNT(*) FROM \"Attachment\" a LEFT JOIN \"Transaction\" t ON a.\"transactionId\" = t.id WHERE t.id IS NULL;")

    if (($OrphanHist + $OrphanWb + $OrphanWh + $OrphanAtt) -gt 0) {
        throw "Data Integrity Violation: Found orphaned child records (Hist: $OrphanHist, WB: $OrphanWb, WH: $OrphanWh, Att: $OrphanAtt)."
    }

    # Check 4: Physical Attachment Restoration & Normalized Relative Path Reconciliation
    Write-Log "Step 3.5: Physical Attachment Restoration & Full Normalized Relative Path Reconciliation..."
    [bool]$AttachmentPhysicalVerified = $false
    [int]$AttachmentFilesVerified = 0

    [string]$AttJsonCandidatePath = ""
    if ($BackupTimestamp) {
        $foundAtt = Get-ChildItem -Path $LocalBackupDir -Filter "*${BackupTimestamp}*_attachments.json" | Select-Object -First 1
        if ($foundAtt) { $AttJsonCandidatePath = $foundAtt.FullName }
    }

    if ($AttCount -gt 0 -and (-not $AttJsonCandidatePath -or -not (Test-Path -Path $AttJsonCandidatePath))) {
        throw "Physical Attachment Restore FAILED: Database contains $AttCount attachments, but physical attachment JSON archive matching timestamp ($BackupTimestamp) was not found in $LocalBackupDir."
    }

    if ($AttJsonCandidatePath -and (Test-Path -Path $AttJsonCandidatePath)) {
        # HARD FAILURE: Missing attachments archive checksum in manifest is prohibited
        if (-not $ManifestData.checksums -or -not $ManifestData.checksums.attachmentsArchive) {
            throw "Security Exception: Manifest is missing mandatory attachmentsArchive SHA-256 checksum field. Skipping checksum is prohibited."
        }
        [string]$ActualAttArchiveHash = (Get-FileHash -Path $AttJsonCandidatePath -Algorithm SHA256).Hash.ToLower()
        [string]$ExpectedAttArchiveHash = $ManifestData.checksums.attachmentsArchive.ToLower()
        if ($ActualAttArchiveHash -ne $ExpectedAttArchiveHash) {
            throw "Attachment Archive SHA-256 Checksum Mismatch against Manifest! Expected: $ExpectedAttArchiveHash, Computed: $ActualAttArchiveHash"
        }
        Write-Log "Attachment archive SHA-256 pre-verification PASSED against manifest ($ActualAttArchiveHash)."

        [string]$EphemeralAttDir = Join-Path -Path $env:TEMP -ChildPath ("gms_att_drill_" + $TimestampSuffix)
        New-Item -Path $EphemeralAttDir -ItemType Directory -Force | Out-Null
        try {
            Write-Log "Decoding physical attachment archive $($AttJsonCandidatePath)..."
            $AttJsonData = Get-Content -Path $AttJsonCandidatePath -Raw | ConvertFrom-Json

            if ($AttJsonData.files) {
                [string]$BaseCanonicalDir = [System.IO.Path]::GetFullPath($EphemeralAttDir)

                foreach ($fileObj in $AttJsonData.files) {
                    [string]$relPath = $fileObj.relativePath
                    if (-not $relPath) { $relPath = $fileObj.fileName }
                    
                    # Security Path Traversal Guard
                    [string]$targetFile = [System.IO.Path]::GetFullPath((Join-Path -Path $BaseCanonicalDir -ChildPath $relPath))
                    if (-not $targetFile.StartsWith($BaseCanonicalDir + [System.IO.Path]::DirectorySeparatorChar)) {
                        throw "Security Exception: Path traversal attack detected in attachment relative path '$relPath'"
                    }

                    [string]$targetParent = Split-Path $targetFile -Parent
                    if (-not (Test-Path -Path $targetParent -PathType Container)) {
                        New-Item -Path $targetParent -ItemType Directory -Force | Out-Null
                    }

                    [byte[]]$bytes = [System.Convert]::FromBase64String($fileObj.base64Content)
                    [System.IO.File]::WriteAllBytes($targetFile, $bytes)

                    # Hash check
                    $calcHash = (Get-FileHash -Path $targetFile -Algorithm SHA256).Hash.ToLower()
                    if ($fileObj.checksum -and ($calcHash -ne $fileObj.checksum.ToLower())) {
                        throw "Attachment file checksum mismatch for $relPath. Expected: $($fileObj.checksum), Computed: $calcHash"
                    }
                    $AttachmentFilesVerified++
                }
            }

            # Reconcile DB Attachment records using exact normalized relative paths (NOT basename)
            [string]$AttFilesJson = Exec-Query "SELECT COALESCE(json_agg(json_build_object('id', id, 'filePath', \"filePath\", 'sha256', sha256)), '[]'::json) FROM \"Attachment\";"
            if (-not [string]::IsNullOrWhiteSpace($AttFilesJson) -and $AttFilesJson -ne "[]") {
                $AttList = $AttFilesJson | ConvertFrom-Json
                foreach ($att in $AttList) {
                    if ($att.filePath) {
                        # Normalize path separators to current platform
                        [string]$normRelPath = $att.filePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar).Replace('\', [System.IO.Path]::DirectorySeparatorChar).TrimStart([System.IO.Path]::DirectorySeparatorChar)
                        [string]$expectedPhysicalFile = Join-Path -Path $EphemeralAttDir -ChildPath $normRelPath

                        if (-not (Test-Path -Path $expectedPhysicalFile -PathType Leaf)) {
                            throw "Physical Attachment File Missing during restore drill at exact relative path: $normRelPath (Full expected: $expectedPhysicalFile)"
                        }

                        if ($att.sha256) {
                            $calcHash = (Get-FileHash -Path $expectedPhysicalFile -Algorithm SHA256).Hash.ToLower()
                            if ($calcHash -ne $att.sha256.ToLower()) {
                                throw "Attachment SHA-256 DB Hash Mismatch for $normRelPath. Expected DB SHA: $($att.sha256), Physical SHA: $calcHash"
                            }
                        }
                    }
                }
            }

            $AttachmentPhysicalVerified = $true
            Write-Log "Physical Attachment Restoration PASSED ($AttachmentFilesVerified files restored & reconciled using full normalized relative path with 100% SHA-256 match)." -Level "SUCCESS"
        } finally {
            if (Test-Path -Path $EphemeralAttDir) {
                Remove-Item -Path $EphemeralAttDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    } else {
        # 0 DB attachments and no archive
        $AttachmentPhysicalVerified = $true
        Write-Log "Attachment archive not present and DB attachment count is 0."
    }

    [datetime]$DrillEndTime = Get-Date
    [double]$RtoSeconds = [math]::Round(($DrillEndTime - $DrillStartTime).TotalSeconds, 2)

    Write-Log "SUCCESS: Restored database & physical attachments fully verified ($UserCount Users, $TableCount Tables, $MigrationCountStr Migrations, $TxCount Tx, $AttCount Attachments, 0 Dupes, 0 Orphans). RTO: $RtoSeconds s, RPO: $RpoMinutes m." -Level "SUCCESS"

    # Step 4: Record audit proof
    $ProofObj = @{
        lastTestDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "PASSED"
        verifiedDump = $LatestDump.Name
        userCountVerified = $UserCount
        tableCountVerified = $TableCount
        migrationCountVerified = [int]$MigrationCountStr
        transactionCountVerified = $TxCount
        attachmentCountVerified = $AttCount
        manifestVerified = $true
        attachmentPhysicalVerified = $AttachmentPhysicalVerified
        attachmentFilesVerifiedCount = $AttachmentFilesVerified
        duplicateIsCurrentViolations = 0
        fkOrphanViolations = 0
        rtoSeconds = $RtoSeconds
        rpoMinutes = $RpoMinutes
    }
    $JsonContent = $ProofObj | ConvertTo-Json -Compress
    Set-Content -Path $RestoreHistoryPath -Value $JsonContent -Encoding utf8

    Write-Log "Recorded restore proof to $RestoreHistoryPath."

} catch {
    Write-Log "RESTORE DRILL FAILED: $_" -Level "ERROR"
    $ProofObj = @{
        lastTestDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "FAILED"
        verifiedDump = $LatestDump.Name
        error = $_.ToString()
    }
    $JsonContent = $ProofObj | ConvertTo-Json -Compress
    Set-Content -Path $RestoreHistoryPath -Value $JsonContent -Encoding utf8
    exit 1
} finally {
    Write-Log "Step 5: Tearing down dedicated isolated DR container ($DrillContainer)..."
    & docker rm -f $DrillContainer 2>&1 | Out-Null
    Write-Log "Cleanup complete."
}

exit 0
