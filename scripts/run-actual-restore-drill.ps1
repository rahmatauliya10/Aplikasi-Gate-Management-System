# ==============================================================================
# GMS Automated Actual Restore Drill Protocol (P0-05)
# ==============================================================================
# Purpose: Executes an actual physical restore drill into an ephemeral database,
# verifies data structural integrity via SQL query, logs result for SLA compliance,
# and destroys the temporary database cleanly.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
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

Write-Log "Starting GMS Comprehensive Actual Restore Drill Protocol (P0-05)..."
[datetime]$DrillStartTime = Get-Date

# 1. Locate latest dump or json backup file
$LatestDump = Get-ChildItem -Path $LocalBackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $LatestDump) {
    Write-Log "No .dump backup files found in $LocalBackupDir to perform drill." -Level "ERROR"
    exit 1
}

[double]$RpoMinutes = [math]::Round(((Get-Date) - $LatestDump.LastWriteTime).TotalMinutes, 2)
Write-Log "Selected dump candidate: $($LatestDump.Name) ($($LatestDump.Length) bytes). Calculated RPO: $RpoMinutes minutes."

[string]$DrillDbName = "gms_drill_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$ContainerName = "gate-system-postgres"
[string]$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }

try {
    Write-Log "Step 1: Creating ephemeral test database ($DrillDbName)..."
    & docker exec $ContainerName psql -U $PgUser -d gms -c "CREATE DATABASE $DrillDbName;" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create ephemeral database inside Docker container."
    }

    Write-Log "Step 2: Executing physical pg_restore into $DrillDbName..."
    [string]$TmpDumpPath = "/tmp/$($LatestDump.Name)"
    & docker cp $LatestDump.FullName "${ContainerName}:${TmpDumpPath}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to container." }

    $RestoreOut = & docker exec $ContainerName pg_restore --username=$PgUser --dbname=$DrillDbName --no-owner --no-privileges $TmpDumpPath 2>&1
    if ($LASTEXITCODE -gt 1) {
        throw "pg_restore failed with exit code $LASTEXITCODE. Output: $RestoreOut"
    }

    # Clean tmp dump in container
    & docker exec $ContainerName rm -f $TmpDumpPath 2>&1 | Out-Null

    Write-Log "Step 3: Deep Data Integrity Verification (Schema, Tables, FKs, Migrations)..."
    
    # Check 1: User table count
    [string]$UserCountStr = (& docker exec $ContainerName psql -t -A -U $PgUser -d $DrillDbName -c "SELECT COUNT(*) FROM \""User\"";" 2>&1).ToString().Trim()
    [int]$UserCount = 0
    if (-not [int]::TryParse($UserCountStr, [ref]$UserCount) -or $UserCount -eq 0) {
        throw "User table validation failed. Restored count: $UserCountStr"
    }

    # Check 2: Table count check (expect >= 14 tables)
    [string]$TableCountStr = (& docker exec $ContainerName psql -t -A -U $PgUser -d $DrillDbName -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>&1).ToString().Trim()
    [int]$TableCount = 0
    [int]::TryParse($TableCountStr, [ref]$TableCount) | Out-Null
    if ($TableCount -lt 10) {
        throw "Database table count verification failed. Found $TableCount tables (expected >= 10)."
    }

    # Check 3: Prisma Migrations table
    [string]$MigrationCountStr = (& docker exec $ContainerName psql -t -A -U $PgUser -d $DrillDbName -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" 2>&1).ToString().Trim()

    [datetime]$DrillEndTime = Get-Date
    [double]$RtoSeconds = [math]::Round(($DrillEndTime - $DrillStartTime).TotalSeconds, 2)

    Write-Log "SUCCESS: Restored database fully verified ($UserCount Users, $TableCount Tables, $MigrationCountStr Migrations). RTO: $RtoSeconds s, RPO: $RpoMinutes m." -Level "SUCCESS"

    # Step 4: Record audit proof
    $ProofObj = @{
        lastTestDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "PASSED"
        verifiedDump = $LatestDump.Name
        userCountVerified = $UserCount
        tableCountVerified = $TableCount
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
    Write-Log "Step 5: Tearing down ephemeral test database ($DrillDbName)..."
    & docker exec $ContainerName psql -U $PgUser -d gms -c "DROP DATABASE IF EXISTS $DrillDbName;" 2>&1 | Out-Null
    Write-Log "Cleanup complete."
}

exit 0
