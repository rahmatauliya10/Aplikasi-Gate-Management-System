# ==============================================================================
# GMS Historical Database Rehearsal & Preflight Automation Harness (P0-01)
# ==============================================================================
# Purpose: Executes historical database migration rehearsal against an actual
# sanitized database clone + companion physical attachment archive inside a
# DEDICATED EPHEMERAL POSTGRES CONTAINER.
# Completely isolated from live production database containers and host port 5432.
# Verifies migration preflight, checksum integrity, schema drift zero, duplicate
# isCurrent invariant zero, FK orphan zero, and physical attachment reconciliation.
# Produces exact evidence artifacts required for P0-01 release gate:
# - historical-db-rehearsal.json
# - migration-checksums.json
# - preflight-report.json
# - schema-drift.txt
# - attachment-reconcile.json
# - smoke-test-report.json
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DumpFilePath = "",

    [Parameter(Mandatory=$false)]
    [string]$AttachmentArchivePath = "",

    [Parameter(Mandatory=$false)]
    [string]$BackupDir = "",

    [Parameter(Mandatory=$false)]
    [string]$RehearsalPort = "5433"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts\release-proof"
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "[$Timestamp] [$Level] $Message"
}

Write-Log "Starting GMS Historical Database Rehearsal Protocol (P0-01)..."

# Locate historical dump file
[string]$ActualDumpPath = $DumpFilePath
if (-not $ActualDumpPath) {
    [array]$CandidateDirs = @(
        $BackupDir,
        (Join-Path -Path $ProjectRootDir -ChildPath "backups\local"),
        (Join-Path -Path $ProjectRootDir -ChildPath "deploy\backups\local"),
        "C:\GMS_Backups"
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -Path $_ -PathType Container) }

    foreach ($dir in $CandidateDirs) {
        $found = Get-ChildItem -Path $dir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($found) {
            $ActualDumpPath = $found.FullName
            break
        }
    }
}

if (-not $ActualDumpPath -or -not (Test-Path -Path $ActualDumpPath -PathType Leaf)) {
    Write-Log "FAIL: No historical database clone/dump provided or found. Historical DB rehearsal requires an actual sanitized production dump file." -Level "ERROR"
    
    # Write failure artifacts
    $FailObj = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "FAILED"
        error = "No historical dump file provided or found. Hard failure enforced."
    }
    Set-Content -Path (Join-Path $ArtifactsDir "historical-db-rehearsal.json") -Value ($FailObj | ConvertTo-Json -Depth 5) -Encoding utf8
    Set-Content -Path (Join-Path $ArtifactsDir "preflight-report.json") -Value ($FailObj | ConvertTo-Json -Depth 5) -Encoding utf8
    Set-Content -Path (Join-Path $ArtifactsDir "smoke-test-report.json") -Value ($FailObj | ConvertTo-Json -Depth 5) -Encoding utf8
    exit 1
}

Write-Log "Using historical dump candidate: $ActualDumpPath"

[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$RehearsalContainer = "gms-rehearsal-postgres-" + $TimestampSuffix
[string]$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
[string]$PgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "testpassword" }
[string]$DrillDbName = "gms_rehearsal"

[string]$DrillDbUrl = "postgresql://${PgUser}:${PgPass}@localhost:${RehearsalPort}/${DrillDbName}?schema=public"
$env:DATABASE_URL = $DrillDbUrl

try {
    # 1. Start dedicated isolated PostgreSQL container
    Write-Log "Step 1: Starting dedicated isolated PostgreSQL container ($RehearsalContainer on port $RehearsalPort)..."
    & docker run -d --name $RehearsalContainer -p "${RehearsalPort}:5432" -e "POSTGRES_USER=$PgUser" -e "POSTGRES_PASSWORD=$PgPass" -e "POSTGRES_DB=$DrillDbName" postgres:15-alpine 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to start dedicated PostgreSQL rehearsal container." }

    # Wait for PostgreSQL container readiness
    [bool]$ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        & docker exec $RehearsalContainer pg_isready -U $PgUser 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw "Dedicated PostgreSQL rehearsal container failed to become ready within 30 seconds." }
    Write-Log "Dedicated rehearsal PostgreSQL container is ready."

    # 2. Restore historical dump into isolated container
    Write-Log "Step 2: Restoring historical dump into isolated database..."
    [string]$TmpDumpPath = "/tmp/$([System.IO.Path]::GetFileName($ActualDumpPath))"
    & docker cp $ActualDumpPath "${RehearsalContainer}:${TmpDumpPath}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to rehearsal container." }

    $RestoreOut = & docker exec $RehearsalContainer pg_restore --username=$PgUser --dbname=$DrillDbName --no-owner --no-privileges $TmpDumpPath 2>&1
    [int]$RestoreExitCode = $LASTEXITCODE
    & docker exec $RehearsalContainer rm -f $TmpDumpPath 2>&1 | Out-Null

    if ($RestoreExitCode -ne 0) {
        throw "Historical pg_restore failed with exit code $RestoreExitCode: $RestoreOut"
    }
    Write-Log "pg_restore completed with exit code 0 (SUCCESS)."

    # 3. Check migration checksums against rehearsal DB
    Write-Log "Step 3: Computing and verifying migration checksums on rehearsal DB..."
    [string]$ChecksumOut = & node (Join-Path $ProjectRootDir "scripts\check-migration-checksums.js") 2>&1
    
    $ChecksumObj = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = if ($LASTEXITCODE -eq 0) { "PASSED" } else { "FAILED" }
        output = $ChecksumOut
    }
    Set-Content -Path (Join-Path $ArtifactsDir "migration-checksums.json") -Value ($ChecksumObj | ConvertTo-Json -Depth 5) -Encoding utf8
    Set-Content -Path (Join-Path $ArtifactsDir "migration-checksums.txt") -Value $ChecksumOut -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Migration checksum verification failed: $ChecksumOut" }

    # 3.5 Production Preflight Duplicate Audit on Rehearsal DB
    Write-Log "Step 3.5: Executing canonical production preflight duplicate audit on rehearsal DB..."
    Push-Location (Join-Path $ProjectRootDir "backend")
    try {
        [string]$PreflightOut = & npm run prisma:preflight -- --report-only --fail-on-duplicates 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Production preflight duplicate audit failed on historical database rehearsal: $PreflightOut" }
    } finally {
        Pop-Location
    }

    # 3.6 Execute Prisma Migration Deploy on Rehearsal DB
    Write-Log "Step 3.6: Executing Prisma migration deployment on historical database rehearsal..."
    Push-Location (Join-Path $ProjectRootDir "backend")
    try {
        [string]$MigrateDeployOut = & npx prisma migrate deploy 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Prisma migrate deploy failed on historical database rehearsal: $MigrateDeployOut" }
    } finally {
        Pop-Location
    }

    # 3.7 Zero Schema Drift Gate Check
    Write-Log "Step 3.7: Verifying zero schema drift post-migration..."
    Push-Location (Join-Path $ProjectRootDir "backend")
    [int]$SchemaDriftExitCode = 1
    [string]$DrillDiffOut = ""
    try {
        $DrillDiffOut = & npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code 2>&1
        $SchemaDriftExitCode = $LASTEXITCODE
        Set-Content -Path (Join-Path $ArtifactsDir "schema-drift.txt") -Value $DrillDiffOut -Encoding utf8
        if ($SchemaDriftExitCode -ne 0) { throw "Schema drift detected on historical database rehearsal (exit code $SchemaDriftExitCode)." }
    } finally {
        Pop-Location
    }

    # Helper function to execute queries against isolated rehearsal DB
    function Exec-Query([string]$sql) {
        return (& docker exec $RehearsalContainer psql -t -A -U $PgUser -d $DrillDbName -c "$sql" 2>&1).ToString().Trim()
    }

    Write-Log "Step 4: Executing actual preflight audit and invariant queries..."
    [int]$TableCount = [int](Exec-Query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
    [int]$UserCount = [int](Exec-Query "SELECT COUNT(*) FROM \"User\";")
    [int]$TxCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\";")
    [int]$WbCount = [int](Exec-Query "SELECT COUNT(*) FROM \"WeighbridgeRecord\";")
    [int]$WhCount = [int](Exec-Query "SELECT COUNT(*) FROM \"WarehouseProcess\";")
    [int]$QcvCount = [int](Exec-Query "SELECT COUNT(*) FROM \"QcVehicleCheck\";")
    [int]$ImCount = [int](Exec-Query "SELECT COUNT(*) FROM \"IncomingMaterialCheck\";")
    [int]$AttCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Attachment\";")
    [int]$CorrectionCount = [int](Exec-Query "SELECT COUNT(*) FROM \"TransactionCorrection\";")
    [int]$CorrectionItemCount = [int](Exec-Query "SELECT COUNT(*) FROM \"TransactionCorrectionItem\";")
    [int]$MigrationCount = [int](Exec-Query "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;")

    [int]$GbbCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GBB';")
    [int]$GbbCompletedCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GBB' AND \"status\" = 'COMPLETED';")
    [int]$GspCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GSP';")
    [int]$GspCompletedCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GSP' AND \"status\" = 'COMPLETED';")
    [int]$GbjCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GBJ';")
    [int]$GbjCompletedCount = [int](Exec-Query "SELECT COUNT(*) FROM \"Transaction\" WHERE \"processType\" = 'GBJ' AND \"status\" = 'COMPLETED';")

    # Invariant queries
    [int]$WbDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\", \"type\" FROM \"WeighbridgeRecord\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\", \"type\" HAVING COUNT(*) > 1) d;")
    [int]$WhDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"WarehouseProcess\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$QcvDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"QcVehicleCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$ImDupeCurrent = [int](Exec-Query "SELECT COUNT(*) FROM (SELECT \"transactionId\" FROM \"IncomingMaterialCheck\" WHERE \"isCurrent\" = true GROUP BY \"transactionId\" HAVING COUNT(*) > 1) d;")
    [int]$TotalDupes = $WbDupeCurrent + $WhDupeCurrent + $QcvDupeCurrent + $ImDupeCurrent

    # FK Orphan queries
    [int]$OrphanHist = [int](Exec-Query "SELECT COUNT(*) FROM \"TransactionStatusHistory\" h LEFT JOIN \"Transaction\" t ON h.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWb = [int](Exec-Query "SELECT COUNT(*) FROM \"WeighbridgeRecord\" r LEFT JOIN \"Transaction\" t ON r.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanWh = [int](Exec-Query "SELECT COUNT(*) FROM \"WarehouseProcess\" w LEFT JOIN \"Transaction\" t ON w.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$OrphanAtt = [int](Exec-Query "SELECT COUNT(*) FROM \"Attachment\" a LEFT JOIN \"Transaction\" t ON a.\"transactionId\" = t.id WHERE t.id IS NULL;")
    [int]$TotalOrphans = $OrphanHist + $OrphanWb + $OrphanWh + $OrphanAtt

    # 4.5 Physical Attachment Reconciliation if attachment archive or upload dir is available
    [int]$MissingPhysicalFiles = 0
    [int]$OrphanPhysicalFiles = 0
    [int]$ReconciledPhysicalFiles = 0

    [string]$TargetUploadDir = ""
    if ($AttachmentArchivePath -and (Test-Path -Path $AttachmentArchivePath -PathType Leaf)) {
        [string]$TmpExtractDir = Join-Path -Path $env:TEMP -ChildPath ("gms_att_rehearsal_" + $TimestampSuffix)
        New-Item -Path $TmpExtractDir -ItemType Directory -Force | Out-Null
        
        if ($AttachmentArchivePath.ToLower().EndsWith(".json")) {
            Write-Log "Processing JSON attachment archive ($AttachmentArchivePath)..."
            $AttJsonData = Get-Content -Path $AttachmentArchivePath -Raw | ConvertFrom-Json
            if ($AttJsonData.files) {
                foreach ($fileObj in $AttJsonData.files) {
                    [string]$relPath = if ($fileObj.relativePath) { $fileObj.relativePath } else { $fileObj.fileName }
                    [string]$targetFile = Join-Path -Path $TmpExtractDir -ChildPath $relPath
                    [string]$targetParent = Split-Path $targetFile -Parent
                    if (-not (Test-Path -Path $targetParent -PathType Container)) {
                        New-Item -Path $targetParent -ItemType Directory -Force | Out-Null
                    }
                    if ($fileObj.base64Content) {
                        [byte[]]$bytes = [System.Convert]::FromBase64String($fileObj.base64Content)
                        [System.IO.File]::WriteAllBytes($targetFile, $bytes)
                    }
                }
            }
            $TargetUploadDir = $TmpExtractDir
        } else {
            Write-Log "Extracting physical attachment zip archive ($AttachmentArchivePath) to $TmpExtractDir..."
            Expand-Archive -Path $AttachmentArchivePath -DestinationPath $TmpExtractDir -Force
            $TargetUploadDir = $TmpExtractDir
        }
    } elseif ($BackupDir -and (Test-Path -Path (Join-Path $BackupDir "uploads") -PathType Container)) {
        $TargetUploadDir = Join-Path $BackupDir "uploads"
    }

    if ($TargetUploadDir -and (Test-Path -Path $TargetUploadDir -PathType Container)) {
        Write-Log "Verifying physical attachment file existence against DB Attachment records..."
        [array]$DbAttachmentPaths = (Exec-Query "SELECT \"filePath\" FROM \"Attachment\" WHERE \"filePath\" IS NOT NULL AND \"filePath\" != '';") -split "`n"
        foreach ($relPath in $DbAttachmentPaths) {
            $relPathClean = $relPath.Trim()
            if (-not $relPathClean) { continue }
            $fullPhysicalPath = Join-Path -Path $TargetUploadDir -ChildPath $relPathClean
            if (Test-Path -Path $fullPhysicalPath -PathType Leaf) {
                $ReconciledPhysicalFiles++
            } else {
                $MissingPhysicalFiles++
                Write-Log "  Missing physical attachment file: $relPathClean" -Level "WARN"
            }
        }
    } else {
        if ($AttCount -gt 0) {
            Write-Log "HARD FAIL: Database contains $AttCount Attachment records, but no attachment archive or directory was supplied." -Level "ERROR"
            $MissingPhysicalFiles = $AttCount
            $ReconciledPhysicalFiles = 0
        } else {
            $ReconciledPhysicalFiles = 0
            $MissingPhysicalFiles = 0
        }
    }

    [bool]$PassedInvariants = ($TotalDupes -eq 0) -and ($TotalOrphans -eq 0) -and ($SchemaDriftExitCode -eq 0) -and ($MissingPhysicalFiles -eq 0)
    [string]$VerdictStatus = if ($PassedInvariants) { "PASSED" } else { "FAILED" }

    # 5. Generate attachment-reconcile.json artifact
    Write-Log "Step 5: Generating attachment reconciliation artifact (Migration Rehearsal Integrity)..."
    $AttReconcileObj = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = if ($MissingPhysicalFiles -eq 0) { "PASSED" } else { "FAILED" }
        dbAttachmentCount = $AttCount
        reconciledCount = $ReconciledPhysicalFiles
        missingFilesCount = $MissingPhysicalFiles
        orphanFilesCount = $OrphanPhysicalFiles
    }
    Set-Content -Path (Join-Path $ArtifactsDir "attachment-reconcile.json") -Value ($AttReconcileObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # 6. Generate preflight-report.json artifact
    Write-Log "Step 6: Generating Migration Rehearsal Integrity preflight report..."
    $PreflightObj = @{
        reportTitle = "Migration Rehearsal Integrity Report"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        rehearsalContainer = $RehearsalContainer
        rehearsalPort = $RehearsalPort
        status = $VerdictStatus
        preflightAudit = @{
            duplicateIsCurrentViolations = $TotalDupes
            orphanReferences = $TotalOrphans
            unappliedMigrationsCount = 0
            schemaDriftDetected = ($SchemaDriftExitCode -ne 0)
            schemaDriftExitCode = $SchemaDriftExitCode
            missingPhysicalFiles = $MissingPhysicalFiles
        }
        reconciliationSummary = @{
            gbbTotal = $GbbCount
            gbbCompleted = $GbbCompletedCount
            gspTotal = $GspCount
            gspCompleted = $GspCompletedCount
            gbjTotal = $GbjCount
            gbjCompleted = $GbjCompletedCount
            attachmentTotal = $AttCount
            attachmentReconciled = $ReconciledPhysicalFiles
        }
    }
    Set-Content -Path (Join-Path $ArtifactsDir "preflight-report.json") -Value ($PreflightObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # 7. Generate historical-db-rehearsal.json artifact
    Write-Log "Step 7: Generating historical-db-rehearsal.json evidence..."
    $RehearsalProofObj = @{
        reportTitle = "Migration Rehearsal Integrity Evidence"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = $VerdictStatus
        dumpFile = Split-Path $ActualDumpPath -Leaf
        verificationDetails = @{
            tableCount = $TableCount
            userRecordsVerified = $UserCount
            transactionRecordsVerified = $TxCount
            gbbCompletedVerifiedCount = $GbbCompletedCount
            gspCompletedVerifiedCount = $GspCompletedCount
            gbjCompletedVerifiedCount = $GbjCompletedCount
            weighbridgeRecordsVerified = $WbCount
            warehouseRecordsVerified = $WhCount
            qcVehicleRecordsVerified = $QcvCount
            incomingCheckRecordsVerified = $ImCount
            attachmentRecordsVerified = $AttCount
            physicalAttachmentsVerified = $ReconciledPhysicalFiles
            missingPhysicalAttachmentsCount = $MissingPhysicalFiles
            transactionCorrectionRecordsVerified = $CorrectionCount
            transactionCorrectionItemRecordsVerified = $CorrectionItemCount
            migrationCountVerified = $MigrationCount
            schemaDriftZeroVerified = ($SchemaDriftExitCode -eq 0)
        }
    }
    Set-Content -Path (Join-Path $ArtifactsDir "historical-db-rehearsal.json") -Value ($RehearsalProofObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # 8. Generate smoke-test-report.json artifact
    Write-Log "Step 8: Generating Migration Rehearsal application smoke report..."
    [bool]$SmokePassed = ($GbbCount -gt 0) -and ($GspCount -gt 0) -and ($GbjCount -gt 0)
    $SmokeObj = @{
        reportTitle = "Migration Rehearsal Application Read Smoke Report"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = if ($SmokePassed) { "PASSED" } else { "FAILED" }
        gbbSmokePassed = ($GbbCount -gt 0)
        gspSmokePassed = ($GspCount -gt 0)
        gbjSmokePassed = ($GbjCount -gt 0)
        readQueryVerification = @{
            tableCount = $TableCount
            userCount = $UserCount
            transactionCount = $TxCount
        }
    }
    Set-Content -Path (Join-Path $ArtifactsDir "smoke-test-report.json") -Value ($SmokeObj | ConvertTo-Json -Depth 5) -Encoding utf8

    if (-not $PassedInvariants) {
        throw "Invariant checks failed: Duplicate isCurrent = $TotalDupes, Orphan FKs = $TotalOrphans, Schema Drift Exit Code = $SchemaDriftExitCode."
    }

    Write-Log "SUCCESS: Isolated historical DB rehearsal completed successfully. Required 6 evidence artifacts saved to $ArtifactsDir." -Level "SUCCESS"
}
catch {
    Write-Log "Historical DB rehearsal failed: $_" -Level "ERROR"
    exit 1
}
finally {
    Write-Log "Cleaning up dedicated ephemeral rehearsal container ($RehearsalContainer)..."
    & docker rm -f $RehearsalContainer 2>&1 | Out-Null
}

exit 0
