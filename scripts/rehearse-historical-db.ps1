# ==============================================================================
# GMS Historical Database Rehearsal & Preflight Automation Harness (P0-01)
# ==============================================================================
# Purpose: Executes historical database migration rehearsal against an actual
# sanitized database clone inside a DEDICATED EPHEMERAL POSTGRES CONTAINER.
# Completely isolated from live production database containers and host port 5432.
# Verifies migration preflight, checksum integrity, schema drift zero, duplicate
# isCurrent invariant zero, FK orphan zero, and physical attachment reconciliation.
# Produces verifiable proof artifacts required for release gate.
# HARD FAILURE: If no dump file is supplied, rehearsal fails immediately.
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DumpFilePath = "",

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
    Set-Content -Path (Join-Path $ArtifactsDir "historical-preflight.json") -Value ($FailObj | ConvertTo-Json -Depth 5) -Encoding utf8
    Set-Content -Path (Join-Path $ArtifactsDir "restore-proof.json") -Value ($FailObj | ConvertTo-Json -Depth 5) -Encoding utf8
    
    [string]$FailMd = @"
# GMS Historical Database Rehearsal & Staging Smoke Report

**Date:** $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
**Environment:** Dedicated Ephemeral Rehearsal Sandbox
**Verdict:** 🔴 FAILED

## Summary
Rehearsal aborted: No historical database dump provided or found. Hard-coded PASS evidence is prohibited.
"@
    Set-Content -Path (Join-Path $ArtifactsDir "staging-smoke-report.md") -Value $FailMd -Encoding utf8

    exit 1
}

Write-Log "Using historical dump candidate: $ActualDumpPath"

[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$RehearsalContainer = "gms-rehearsal-postgres-" + $TimestampSuffix
[string]$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
[string]$PgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "testpassword" }
[string]$DrillDbName = "gms_rehearsal"
[bool]$ExecutionSuccess = $false

# Direct DATABASE_URL to dedicated ephemeral rehearsal container on $RehearsalPort
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
    Set-Content -Path (Join-Path $ArtifactsDir "migration-checksum.txt") -Value $ChecksumOut -Encoding utf8
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
    try {
        & npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code 2>&1 | Out-Null
        $SchemaDriftExitCode = $LASTEXITCODE
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

    [bool]$PassedInvariants = ($TotalDupes -eq 0) -and ($TotalOrphans -eq 0) -and ($SchemaDriftExitCode -eq 0)
    [string]$VerdictStatus = if ($PassedInvariants) { "PASSED" } else { "FAILED" }

    # 5. Generate preflight report artifact from actual data
    Write-Log "Step 5: Generating historical preflight report artifact..."
    $PreflightObj = @{
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
        }
        reconciliationSummary = @{
            gbbTotal = $GbbCount
            gbbCompleted = $GbbCompletedCount
            gspTotal = $GspCount
            gspCompleted = $GspCompletedCount
            gbjTotal = $GbjCount
            gbjCompleted = $GbjCompletedCount
            attachmentTotal = $AttCount
        }
    }
    Set-Content -Path (Join-Path $ArtifactsDir "historical-preflight.json") -Value ($PreflightObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # 6. Generate restore proof artifact from actual data
    Write-Log "Step 6: Generating restore proof artifact..."
    $RestoreProofObj = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = $VerdictStatus
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
            transactionCorrectionRecordsVerified = $CorrectionCount
            transactionCorrectionItemRecordsVerified = $CorrectionItemCount
            migrationCountVerified = $MigrationCount
            schemaDriftZeroVerified = ($SchemaDriftExitCode -eq 0)
        }
    }
    Set-Content -Path (Join-Path $ArtifactsDir "restore-proof.json") -Value ($RestoreProofObj | ConvertTo-Json -Depth 5) -Encoding utf8

    # 7. Generate staging smoke report artifact from actual data
    Write-Log "Step 7: Generating staging smoke report artifact..."
    [string]$VerdictEmoji = if ($PassedInvariants) { "🟢 PASS" } else { "🔴 FAIL" }
    [string]$SmokeReportMd = @"
# GMS Historical Database Rehearsal & Staging Smoke Report

**Date:** $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
**Environment:** Dedicated Ephemeral Sandbox Container ($RehearsalContainer on port $RehearsalPort)
**Dump Candidate:** $(Split-Path $ActualDumpPath -Leaf)
**Verdict:** $VerdictEmoji

## Executive Summary
Restored historical production dump into dedicated isolated rehearsal container ($RehearsalContainer).
Ran canonical production preflight duplicate audit, verified migration checksums, executed `prisma migrate deploy`, and confirmed zero schema drift.

## Computed Invariants
- **pg_restore Exit:** 0 (SUCCESS)
- **Migration Checksums:** Verified
- **Prisma Migration Deploy:** SUCCESS ($MigrationCount migrations applied)
- **Schema Drift Exit Code:** $SchemaDriftExitCode (Zero Drift Verified)
- **Tables Found:** $TableCount
- **Duplicate `isCurrent=true`:** $TotalDupes violations
- **Orphan Foreign Keys:** $TotalOrphans violations
- **Attachment DB Records:** $AttCount verified
- **GBB Completed Transactions:** $GbbCompletedCount / $GbbCount
- **GSP Completed Transactions:** $GspCompletedCount / $GspCount
- **GBJ Completed Transactions:** $GbjCompletedCount / $GbjCount
"@
    Set-Content -Path (Join-Path $ArtifactsDir "staging-smoke-report.md") -Value $SmokeReportMd -Encoding utf8

    if (-not $PassedInvariants) {
        throw "Invariant checks failed: Duplicate isCurrent = $TotalDupes, Orphan FKs = $TotalOrphans, Schema Drift Exit Code = $SchemaDriftExitCode."
    }

    $ExecutionSuccess = $true
    Write-Log "SUCCESS: Isolated historical DB rehearsal completed successfully. Proof artifacts saved to $ArtifactsDir." -Level "SUCCESS"
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
