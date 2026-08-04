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
[string]$LocalBackupDir = if ($env:LOCAL_BACKUP_DIR) { $env:LOCAL_BACKUP_DIR } else { Join-Path -Path $ProjectRootDir -ChildPath "backups\local" }
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

Write-Log "Starting GMS Actual Restore Drill Protocol..."

# 1. Locate latest custom backup dump file (.dump)
if (-not (Test-Path -Path $LocalBackupDir -PathType Container)) {
    Write-Log "Backup directory not found at $LocalBackupDir" -Level "ERROR"
    exit 1
}

$LatestDump = Get-ChildItem -Path $LocalBackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $LatestDump) {
    Write-Log "No .dump backup files found in $LocalBackupDir to perform drill." -Level "ERROR"
    exit 1
}

Write-Log "Selected candidate dump file for restore drill: $($LatestDump.Name) ($($LatestDump.Length) bytes)"

[string]$DrillDbName = "gms_drill_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$ContainerName = "gate-system-postgres"
[string]$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }

try {
    Write-Log "Step 1: Creating ephemeral test database ($DrillDbName) in container $ContainerName..."
    & docker exec $ContainerName psql -U $PgUser -d gms -c "CREATE DATABASE $DrillDbName;" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create ephemeral database inside Docker container."
    }

    Write-Log "Step 2: Executing physical pg_restore into $DrillDbName..."
    # Copy dump into container temporary space and restore
    [string]$TmpDumpPath = "/tmp/$($LatestDump.Name)"
    & docker cp $LatestDump.FullName "${ContainerName}:${TmpDumpPath}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to container." }

    & docker exec $ContainerName pg_restore --username=$PgUser --dbname=$DrillDbName --no-owner --no-privileges $TmpDumpPath 2>&1 | Out-Null
    
    # Remove tmp dump inside container
    & docker exec $ContainerName rm -f $TmpDumpPath 2>&1 | Out-Null

    Write-Log "Step 3: Executing data integrity verification queries on restored DB..."
    [string]$UserCountResult = (& docker exec $ContainerName psql -t -A -U $PgUser -d $DrillDbName -c "SELECT COUNT(*) FROM \""User\"";" 2>&1).ToString().Trim()
    
    [int]$UserCount = 0
    if (-not [int]::TryParse($UserCountResult, [ref]$UserCount) -or $UserCount -eq 0) {
        throw "Data integrity check FAILED: Unable to count users or 0 users restored (Result: $UserCountResult)."
    }

    Write-Log "SUCCESS: Restored database validated successfully ($UserCount User records confirmed)." -Level "SUCCESS"

    # Step 4: Record positive proof to restore_history.json
    $ProofObj = @{
        lastTestDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "PASSED"
        verifiedDump = $LatestDump.Name
        userCountVerified = $UserCount
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
