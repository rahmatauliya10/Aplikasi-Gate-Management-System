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
    [string]$MaintenanceDir = "",

    [Parameter(Mandatory=$false)]
    [string]$UploadsDirectory = "",

    [Parameter(Mandatory=$false)]
    [string]$LogDirectory = "",

    [Parameter(Mandatory=$false)]
    [string]$RecoveryOperationId = "",

    [Parameter(Mandatory=$false)]
    [string]$PgPort = "",

    [Parameter(Mandatory=$false)]
    [switch]$PreserveMaintenanceFlag,

    [Parameter(Mandatory=$false)]
    [switch]$ManagedByOrchestrator,

    [Parameter(Mandatory=$false)]
    [switch]$Force,

    [Parameter(Mandatory=$false)]
    [switch]$ExportFunctionsOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

[string]$ProjectRootDir = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
[bool]$IsWinPlatform = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
[string]$LogDir = if ($LogDirectory) { $LogDirectory } elseif ($IsWinPlatform) { "C:\GMS_Logs" } else { Join-Path -Path $ProjectRootDir -ChildPath "artifacts/logs" }
[string]$LogFile = Join-Path -Path $LogDir -ChildPath "production_restore.log"
[string]$RestoreEvidencePath = Join-Path -Path $LogDir -ChildPath "restore_evidence.json"
[string]$UploadDir = if ($UploadsDirectory) { $UploadsDirectory } elseif ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { Join-Path -Path $ProjectRootDir -ChildPath "uploads" }

if (-not (Test-Path -Path $LogDir -PathType Container)) {
    try {
        New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
    } catch {
        $LogDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts/logs"
        $LogFile = Join-Path -Path $LogDir -ChildPath "production_restore.log"
        $RestoreEvidencePath = Join-Path -Path $LogDir -ChildPath "restore_evidence.json"
        if (-not (Test-Path -Path $LogDir -PathType Container)) {
            New-Item -Path $LogDir -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
        }
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$LogEntry = "[$Timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry
}

function Clear-StaleGmsRestoreArtifacts {
    param(
        [Parameter(Mandatory=$true)][string]$Container,
        [Parameter(Mandatory=$false)][string]$CurrentOperationId = "",
        [Parameter(Mandatory=$false)][string]$LedgerPath = "",
        [Parameter(Mandatory=$false)][scriptblock]$LedgerInspector = $null,
        [Parameter(Mandatory=$false)][scriptblock]$CommandExecutor = $null
    )
    try {
        # Securely sweep GMS restore staging directories based on strict forensic retention governance.
        # Rules:
        # 1. Directories belonging to CurrentOperationId are reserved for active execution and finally block.
        # 2. Directories with status in ("FAILED", "IN_PROGRESS", "RESTORING") are NEVER deleted automatically by age;
        #    they are strictly PRESERVED for post-incident audit and operator investigation.
        # 3. Untagged directories (missing stage.meta.json) are NEVER deleted automatically; they are strictly PRESERVED.
        # 4. Directories with status == "COMPLETED" may ONLY be pruned if the recovery operation is confirmed VERIFIED in the recovery ledger.
        $findScript = 'find /tmp -maxdepth 1 -name "gms_restore_*" -type d 2>/dev/null'
        [string]$staleDirs = ""
        if ($CommandExecutor) {
            $staleDirs = (& $CommandExecutor $Container $findScript | Out-String).Trim()
        } else {
            $staleDirs = (& docker exec $Container sh -c $findScript 2>&1 | Out-String).Trim()
        }
        if ($staleDirs) {
            $dirList = $staleDirs -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -like "/tmp/gms_restore_*" }
            foreach ($d in $dirList) {
                [string]$readMetaScript = "test -f `"$d/stage.meta.json`" && cat `"$d/stage.meta.json`" || true"
                [string]$metaJson = ""
                if ($CommandExecutor) {
                    $metaJson = (& $CommandExecutor $Container $readMetaScript | Out-String).Trim()
                } else {
                    $metaJson = (& docker exec $Container sh -c $readMetaScript 2>$null | Out-String).Trim()
                }

                [bool]$shouldPrune = $false
                [string]$pruneReason = ""

                if ($metaJson -and $metaJson.StartsWith("{")) {
                    try {
                        $metaObj = $metaJson | ConvertFrom-Json
                        [string]$opId = [string]$metaObj.operationId
                        [string]$status = [string]$metaObj.status
                        [string]$createdIso = [string]$metaObj.createdAt

                        # Do not touch the current active operation's directory
                        if ($CurrentOperationId -and $opId -eq $CurrentOperationId) {
                            continue
                        }

                        [double]$ageHours = 0
                        [datetimeoffset]$dto = [datetimeoffset]::MinValue
                        if ([datetimeoffset]::TryParse($createdIso, [ref]$dto)) {
                            $ageHours = [Math]::Round(((Get-Date).ToUniversalTime() - $dto.UtcDateTime).TotalHours, 2)
                        }

                        if ($status -in @("FAILED", "IN_PROGRESS", "RESTORING")) {
                            # Strict forensic retention: Never delete failed or incomplete operations by age
                            Write-Log "  [FORENSIC PRESERVE] Preserving unreconciled recovery artifact: $d (Op: $opId, Status: $status, Age: ${ageHours}h). Incomplete/failed artifacts are strictly preserved for operator review." -Level "INFO"
                        } elseif ($status -eq "COMPLETED") {
                            # Completed operations may only be pruned if confirmed VERIFIED in the recovery ledger
                            [bool]$isVerified = $false
                            if ($LedgerInspector) {
                                $isVerified = [bool](& $LedgerInspector $opId)
                            } elseif ($LedgerPath -and (Test-Path -Path $LedgerPath -PathType Leaf)) {
                                try {
                                    $ledgerContent = Get-Content -Path $LedgerPath -Raw -ErrorAction SilentlyContinue
                                    if ($ledgerContent) {
                                        $ledgerObj = $ledgerContent | ConvertFrom-Json
                                        if ($ledgerObj.recoveryOperationId -eq $opId -and $ledgerObj.status -eq "VERIFIED") {
                                            $isVerified = $true
                                        }
                                    }
                                } catch {}
                            }

                            if ($isVerified) {
                                $shouldPrune = $true
                                $pruneReason = "reconciled and verified operation [$opId]"
                            } else {
                                Write-Log "  [FORENSIC PRESERVE] Preserving completed recovery artifact: $d (Op: $opId, Age: ${ageHours}h) pending terminal VERIFIED status in ledger." -Level "INFO"
                            }
                        } else {
                            Write-Log "  [FORENSIC PRESERVE] Preserving recovery artifact with unknown status: $d (Op: $opId, Status: $status)." -Level "WARN"
                        }
                    } catch {
                        Write-Log "  [FORENSIC PRESERVE] Preserving recovery directory due to metadata parse note: $d" -Level "WARN"
                    }
                } else {
                    # Untagged legacy directory: strictly preserve for operator inspection
                    Write-Log "  [FORENSIC PRESERVE] Preserving untagged legacy recovery directory: $d for operator investigation." -Level "WARN"
                }

                if ($shouldPrune) {
                    Write-Log "  [CLEANUP] Pruning reconciled recovery staging directory: $d ($pruneReason)..." -Level "INFO"
                    if ($CommandExecutor) {
                        & $CommandExecutor $Container "rm -rf `"$d`"" | Out-Null
                    } else {
                        & docker exec $Container rm -rf $d 2>&1 | Out-Null
                    }
                }
            }
        }
    } catch {
        Write-Log "  [WARN] Note during scoped restore artifact sweep: $_" -Level "WARN"
    }
}

function Assert-RestoreStorageCapacity {
    param(
        [Parameter(Mandatory=$true)][string]$Container,
        [Parameter(Mandatory=$true)][string]$DumpPathInContainer,
        [Parameter(Mandatory=$false)][scriptblock]$StatExecutor = $null,
        [Parameter(Mandatory=$false)][scriptblock]$DfExecutor = $null
    )
    Write-Log "  PostgreSQL < 17: Checking container storage capacity in /tmp before SQL generation..." -Level "INFO"
    [string]$sizeStr = ""
    if ($StatExecutor) {
        $sizeStr = (& $StatExecutor $Container $DumpPathInContainer | Out-String).Trim()
    } else {
        $sizeStr = (& docker exec $Container stat -c %s "$DumpPathInContainer" 2>$null | Out-String).Trim()
    }
    [int64]$dumpBytes = 0
    [bool]$hasDumpSize = [int64]::TryParse($sizeStr, [ref]$dumpBytes)
    if (-not $hasDumpSize -or $dumpBytes -le 0) {
        throw "CRITICAL RESTORE PREFLIGHT: Failed to determine dump file size on [$Container] ($DumpPathInContainer). Stat returned: '$sizeStr'. Restore aborted fail-closed."
    }

    [string]$availKbStr = ""
    if ($DfExecutor) {
        $availKbStr = (& $DfExecutor $Container "/tmp" | Out-String).Trim()
    } else {
        $availKbStr = (& docker exec $Container sh -c "df -k /tmp | awk 'NR==2 {print \$4}'" 2>$null | Out-String).Trim()
    }
    [int64]$availKb = 0
    [bool]$hasAvail = [int64]::TryParse($availKbStr, [ref]$availKb)
    if (-not $hasAvail -or $availKb -le 0) {
        throw "CRITICAL RESTORE PREFLIGHT: Failed to determine storage capacity in container [$Container] on /tmp. Df returned: '$availKbStr'. Restore aborted fail-closed."
    }

    [int64]$availBytes = $availKb * 1024
    [int64]$requiredBytes = [Math]::Max($dumpBytes * 3, 104857600) # Max(3x dump, 100MB buffer)
    if ($availBytes -lt $requiredBytes) {
        throw "CRITICAL RESTORE PREFLIGHT: Insufficient storage capacity in container /tmp for uncompressed SQL staging. Available: $([Math]::Round($availBytes / 1MB, 2))MB, Required: $([Math]::Round($requiredBytes / 1MB, 2))MB. Restore aborted fail-closed."
    }
    Write-Log "  Storage preflight verified: $([Math]::Round($availBytes / 1MB, 2))MB available in /tmp (Required: $([Math]::Round($requiredBytes / 1MB, 2))MB) [PASS]" -Level "INFO"
    return @{
        DumpBytes = $dumpBytes
        AvailBytes = $availBytes
        RequiredBytes = $requiredBytes
    }
}

function Exec-LiveDbQueryInternal {
    param(
        [Parameter(Mandatory=$true)][string]$Container,
        [Parameter(Mandatory=$true)][string]$DbName,
        [Parameter(Mandatory=$true)][string]$User,
        [Parameter(Mandatory=$false)][string]$Pass = "",
        [Parameter(Mandatory=$true)][string]$Sql = "",
        [Parameter(Mandatory=$false)][scriptblock]$CommandExecutor = $null
    )
    $LASTEXITCODE = 0
    [string]$raw = ""
    [int]$exitCode = 0
    if ($CommandExecutor) {
        $raw = (& $CommandExecutor $Container $Sql | Out-String)
    } else {
        $execArgs = @("exec")
        if ($Pass) { $execArgs += @("-e", "PGPASSWORD=$Pass") }
        $execArgs += @($Container, "psql", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-U", $User, "-d", $DbName, "-c", $Sql)
        $raw = (& docker @execArgs 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
    }

    if ($exitCode -ne 0 -or $raw -match '(?i)(psql:\s*error|FATAL:|could not connect to server|terminating connection|ERROR:|\bFAILED\b)') {
        throw "CRITICAL LIVE DB QUERY FAILURE: Exit code: $exitCode. Error executing SQL [$Sql]: $raw"
    }

    [string[]]$lines = @(($raw -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^(NOTICE|WARNING):' })
    if ((@($lines)).Count -gt 0) { return ([string]$lines[-1]).Trim() }
    return ""
}

function Get-LiveTableCountSafe {
    param(
        [Parameter(Mandatory=$true)][string]$TableName,
        [Parameter(Mandatory=$false)][string]$Container = "",
        [Parameter(Mandatory=$false)][string]$DbName = "",
        [Parameter(Mandatory=$false)][string]$User = "",
        [Parameter(Mandatory=$false)][string]$Pass = "",
        [Parameter(Mandatory=$false)][bool]$AllowMissingIfHistorical = $false,
        [Parameter(Mandatory=$false)][scriptblock]$QueryExecutor = $null
    )
    if ([string]::IsNullOrWhiteSpace($TableName)) {
        throw "CRITICAL RESTORE VERIFICATION: TableName cannot be null or empty. Fail-closed."
    }

    # Helper scriptblock for executing SQL
    $execQuery = {
        param([string]$sql)
        if ($QueryExecutor) {
            return (& $QueryExecutor $sql)
        } else {
            return (Exec-LiveDbQueryInternal -Container $Container -DbName $DbName -User $User -Pass $Pass -Sql $sql)
        }
    }

    # 1. Existence check
    [string]$exists = (& $execQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$TableName') = 1 THEN '1' ELSE '0' END;")
    [string]$cleanExists = if ($exists) { $exists.Trim() } else { "" }
    if ($cleanExists -ne "1" -and $cleanExists -ne "0") {
        throw "CRITICAL RESTORE VERIFICATION: Unexpected existence check result [$exists] for table [$TableName]. Fail-closed."
    }
    if ($cleanExists -eq "0") {
        if ($AllowMissingIfHistorical) {
            Write-Log "  Historical schema note: optional table [$TableName] does not exist in target database. Count evaluated as 0." -Level "INFO"
            return 0
        }
        throw "CRITICAL RESTORE VERIFICATION: Mandatory table [$TableName] does NOT exist in live database [$DbName]! Restoration cannot be verified. Fail-closed."
    }

    # 2. Count query
    [string]$cntStr = (& $execQuery "SELECT COUNT(*) FROM `"$TableName`";")
    [string]$cleanCnt = if ($cntStr) { $cntStr.Trim() } else { "" }
    [int]$cnt = -1
    if (-not [int]::TryParse($cleanCnt, [ref]$cnt) -or $cnt -lt 0) {
        throw "CRITICAL RESTORE VERIFICATION: Non-numeric or invalid row count [$cntStr] returned for table [$TableName]! Fail-closed."
    }
    return $cnt
}

if ($ExportFunctionsOnly) {
    return
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
[string]$StagingContainer = ""
[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$MaintDir = if ($MaintenanceDir) { $MaintenanceDir } else { Join-Path -Path $ProjectRootDir -ChildPath "maintenance" }
[string]$MaintFlagPath = if ($MaintenanceDir) { Join-Path -Path $MaintenanceDir -ChildPath "maintenance.flag" } else { Join-Path -Path $ProjectRootDir -ChildPath "maintenance.flag" }
[string]$MaintActivePath = if ($MaintenanceDir) { Join-Path -Path $MaintenanceDir -ChildPath "active" } else { Join-Path -Path $ProjectRootDir -ChildPath "maintenance/active" }
[string]$LockFilePath = Join-Path -Path $MaintDir -ChildPath "recovery.lock"
[System.IO.FileStream]$script:RecoveryLockStream = $null

try {
# Step 0.5: Mutual Exclusion Guard (P1 Operation Lock)
if (-not (Test-Path -Path $MaintDir -PathType Container)) {
    New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
}
try {
    $script:RecoveryLockStream = [System.IO.File]::Open($LockFilePath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $lockBytes = [System.Text.Encoding]::UTF8.GetBytes("PID=$PID`nRecoveryOperationId=$RecoveryOperationId`nTimestamp=$((Get-Date).ToUniversalTime().ToString('o'))`n")
    $script:RecoveryLockStream.SetLength(0)
    $script:RecoveryLockStream.Write($lockBytes, 0, $lockBytes.Length)
    $script:RecoveryLockStream.Flush()
} catch {
    throw "CRITICAL CONCURRENCY VIOLATION: Another disaster recovery operation is actively holding the lock at [$LockFilePath]. Concurrent recovery executions are strictly prohibited."
}

# Step 1: Resolve Backup Manifest & Artifact Paths
[string]$LocalBackupDir = Join-Path -Path $ProjectRootDir -ChildPath "backups/local"
if (-not (Test-Path -Path $LocalBackupDir -PathType Container)) {
    New-Item -Path $LocalBackupDir -ItemType Directory -Force | Out-Null
}
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

[string]$AttArchiveFileName = ""
if ($ManifestData.artifacts.PSObject.Properties['attachmentsArchive']) {
    $AttArchiveFileName = [string]$ManifestData.artifacts.attachmentsArchive
}
if ($AttArchiveFileName) {
    $AttArchivePath = Join-Path -Path (Split-Path -Path $ManifestPath -Parent) -ChildPath $AttArchiveFileName
    if (-not (Test-Path -Path $AttArchivePath)) {
        throw "Companion physical attachment archive ($AttArchiveFileName) missing from backup directory."
    }
    [string]$ActualAttArchiveHash = (Get-FileHash -Path $AttArchivePath -Algorithm SHA256).Hash.ToLower()
    [string]$ExpectedAttArchiveHash = if ($ManifestData.checksums.PSObject.Properties['attachmentsArchive']) { [string]$ManifestData.checksums.attachmentsArchive.ToLower() } else { "" }
    if ($ExpectedAttArchiveHash -and $ActualAttArchiveHash -ne $ExpectedAttArchiveHash) {
        throw "Attachment Archive SHA-256 Checksum Mismatch! Expected: $ExpectedAttArchiveHash, Actual: $ActualAttArchiveHash. Aborting restore."
    }
    Write-Log "  Attachment archive SHA-256 checksum verified [PASS] ($ActualAttArchiveHash)" -Level "SUCCESS"
}

if (-not $PgPass) {
    if ($env:PGPASSWORD) {
        $PgPass = $env:PGPASSWORD
    } elseif ($env:POSTGRES_PASSWORD) {
        $PgPass = $env:POSTGRES_PASSWORD
    } else {
        $PgPass = "gms_ephemeral_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 16)
    }
}

# Step 1.5: Target Environment & Fault-Injection Preflight Validation
Write-Log "Step 1.5: Validating Target Infrastructure & Security Governance Preflight..."
[string]$EffectiveFaultPhasePreflight = if ($FaultInjectionPhase) { $FaultInjectionPhase } else { $env:GMS_FAULT_INJECTION_PHASE }
if (-not [string]::IsNullOrWhiteSpace($EffectiveFaultPhasePreflight)) {
    # 1. Unconditional rejection of production targets
    if ($LiveDbName -like "*prod*" -or $LiveContainer -like "*prod*" -or ($ExpectedEnvironmentId -and $ExpectedEnvironmentId -like "*PROD*")) {
        throw "CRITICAL GOVERNANCE VIOLATION: Target database [$LiveDbName] or container [$LiveContainer] is identified as PRODUCTION. Fault injection (-FaultInjectionPhase '$EffectiveFaultPhasePreflight') is UNCONDITIONALLY PROHIBITED on production targets under ALL circumstances. CI or drill flags cannot override this."
    }

    # 2. Require verified isolated drill environment
    if ($env:GMS_ISOLATED_DRILL_ENVIRONMENT -ne "TRUE") {
        throw "CRITICAL GOVERNANCE VIOLATION: Fault injection (-FaultInjectionPhase '$EffectiveFaultPhasePreflight') requires verified isolated drill environment (GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE). Target environment is not authorized."
    }

    # 3. Check container labels and mounts to prevent drill against production volumes
    $rawInspectPreflight = & docker inspect $LiveContainer 2>$null
    [string]$inspectJsonPreflight = if ($rawInspectPreflight) { [string]$rawInspectPreflight.ToString() } else { "" }
    if ($inspectJsonPreflight) {
        if ($inspectJsonPreflight -like "*prod-postgres-data*" -or $inspectJsonPreflight -like "*production_postgres*") {
            throw "CRITICAL GOVERNANCE VIOLATION: Target container [$LiveContainer] is bound to production data volumes! Fault injection is unconditionally blocked."
        }
    }
}

# 4. In isolated drill mode, strictly forbid operational paths, databases, and containers
if ($env:GMS_ISOLATED_DRILL_ENVIRONMENT -eq "TRUE") {
    if ($LiveContainer -eq "gate-system-postgres") {
        throw "CRITICAL GOVERNANCE VIOLATION: Target container [$LiveContainer] is the operational container name! Drill must use an isolated fixture container."
    }
    if ($LiveDbName -eq "gms") {
        throw "CRITICAL GOVERNANCE VIOLATION: Target database [$LiveDbName] is the operational database name! Drill must use an isolated fixture database."
    }
    [string]$realProjectUploads = Join-Path -Path $ProjectRootDir -ChildPath "uploads"
    if ($UploadDir -eq $realProjectUploads) {
        throw "CRITICAL GOVERNANCE VIOLATION: Target uploads directory [$UploadDir] points to operational project uploads! Drill must use an isolated fixture uploads directory."
    }
    [string]$realMaintDir = Join-Path -Path $ProjectRootDir -ChildPath "maintenance"
    [string]$realMaintFlag = Join-Path -Path $ProjectRootDir -ChildPath "maintenance.flag"
    [string]$realMaintActive = Join-Path -Path $ProjectRootDir -ChildPath "maintenance/active"
    if ($MaintDir -eq $realMaintDir -or $MaintFlagPath -eq $realMaintFlag -or $MaintActivePath -eq $realMaintActive) {
        throw "CRITICAL GOVERNANCE VIOLATION: Maintenance directory or flag path points to operational project root! Drill must use an isolated fixture maintenance directory."
    }
}

# 5. Persistent Exactly-Once Recovery Enforcement (P1-04 Crash-Resilient 4-State Machine)
if (-not $RecoveryOperationId) {
    $RecoveryOperationId = "REC-OP-" + [guid]::NewGuid().ToString("N").Substring(0, 12).ToUpper()
}

[string]$RecLedgerFile = Join-Path -Path $MaintDir -ChildPath "recovery-state.json"

function Update-RecoveryLedger {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet("PREPARED", "RESTORING", "RESTORED", "VERIFIED")]
        [string]$State,
        [hashtable]$Extra = @{}
    )
    if (-not $MaintDir) { return }
    if (-not (Test-Path -Path $MaintDir -PathType Container)) {
        New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
    }
    [string]$recTarget = Join-Path -Path $MaintDir -ChildPath "recovery-state.json"
    [string]$recTmp = $recTarget + ".tmp"
    $obj = @{
        recoveryOperationId = $RecoveryOperationId
        backupId = $BackupId
        status = $State
        updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        dbRestoreExecuted = ($State -in @("RESTORED", "VERIFIED"))
    }
    foreach ($k in $Extra.Keys) {
        $obj[$k] = $Extra[$k]
    }
    Set-Content -Path $recTmp -Value ($obj | ConvertTo-Json -Depth 5) -Encoding utf8
    Move-Item -Path $recTmp -Destination $recTarget -Force
    Write-Log "  [GMS RECOVERY LEDGER] Persisted state: [$State] (op: $RecoveryOperationId, backup: $BackupId)" -Level "INFO"
}

if (Test-Path -Path $RecLedgerFile) {
    [object]$recLedger = $null
    try {
        $recRaw = Get-Content -Path $RecLedgerFile -Raw
        if ([string]::IsNullOrWhiteSpace($recRaw)) {
            throw "Recovery ledger file is empty"
        }
        $recLedger = $recRaw | ConvertFrom-Json
    } catch {
        throw "CRITICAL RECOVERY VIOLATION: Corrupted recovery ledger at [$RecLedgerFile]! Manual inspection required: $_"
    }

    if (-not $recLedger -or -not $recLedger.recoveryOperationId) {
        throw "CRITICAL RECOVERY VIOLATION: Corrupted recovery ledger at [$RecLedgerFile] (missing recoveryOperationId)! Manual inspection required."
    }

    if ($recLedger.status -eq "RESTORING") {
        throw "CRITICAL RECOVERY VIOLATION: Recovery operation [$($recLedger.recoveryOperationId)] was interrupted while in state RESTORING. Automatic retry is prohibited to prevent double-restore. Manual database reconciliation is required."
    }

    if ($recLedger.recoveryOperationId -eq $RecoveryOperationId) {
        if ($recLedger.status -in @("RESTORED", "VERIFIED") -or $recLedger.dbRestoreExecuted -eq $true) {
            throw "CRITICAL RECOVERY VIOLATION: Duplicate database restore rejected! Recovery operation [$RecoveryOperationId] already executed (status: $($recLedger.status)) at $($recLedger.updatedAt)."
        }
    }

    if ($recLedger.status -eq "RESTORED") {
        throw "CRITICAL RECOVERY VIOLATION: Previous recovery operation [$($recLedger.recoveryOperationId)] is in state RESTORED but has not completed verification (missing VERIFIED state). Automatic restore is prohibited. Manual verification or ledger reconciliation is required."
    }
}

# Verify target container exists and is running
$rawLivePreflight = ""
try {
    $rawOut = & docker ps -q -f "name=^/${LiveContainer}$" 2>$null
    if ($LASTEXITCODE -eq 0 -and $rawOut) {
        $rawLivePreflight = ([string]($rawOut | Out-String)).Trim()
    }
} catch {}
if ([string]::IsNullOrWhiteSpace($rawLivePreflight)) {
    throw "HARD FAIL: Live target container [$LiveContainer] is not running or unreachable. Cannot proceed with restore."
}

# Helper for live database queries
function Exec-LiveDbQuery([string]$sql) {
    $inputSql = $sql.Trim() + "`n"
    $raw = if ($PgPass) {
        $inputSql | & docker exec -i -e "PGPASSWORD=$PgPass" $LiveContainer psql -t -A -U $PgUser -d $LiveDbName 2>&1
    } else {
        $inputSql | & docker exec -i $LiveContainer psql -t -A -U $PgUser -d $LiveDbName 2>&1
    }
    if (-not $raw) { return "" }
    [string]$rawText = ($raw | Out-String)
    [string[]]$lines = @(($rawText -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^(NOTICE|WARNING):' })
    if ((@($lines)).Count -gt 0) {
        $errLine = $lines | Where-Object { $_ -match '^(psql:\s*error:|ERROR:|FATAL:)' } | Select-Object -First 1
        if ($errLine) {
            throw "Database query error on [$LiveDbName]: $($lines -join ' -- ')"
        }
        return ([string]$lines[-1]).Trim()
    }
    return ""
}

# --------------------------------------------------------------------------
# TARGET DATABASE FINGERPRINT & AUTHORIZATION GUARD (ZERO-FORCE BYPASS)
# --------------------------------------------------------------------------
Write-Log "  Verifying Target Database Fingerprint & Authorization Proof on [$LiveDbName]..."
[string]$TableCountStr = Exec-LiveDbQuery "SELECT count(*) FROM pg_stat_user_tables;"
[int]$LiveTableCount = 0
[int]::TryParse($TableCountStr, [ref]$LiveTableCount) | Out-Null

if ($InitializeNewEnvironment) {
    Write-Log "  -InitializeNewEnvironment switch detected. Verifying target database is 100% empty..."
    if ($LiveTableCount -gt 0) {
        [string]$LiveUserCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""User""') IS NOT NULL THEN (SELECT COUNT(*) FROM ""User"") ELSE 0 END;"
        [string]$LiveMigCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""_prisma_migrations""') IS NOT NULL THEN (SELECT COUNT(*) FROM ""_prisma_migrations"") ELSE 0 END;"
        [string]$LiveTxCountStr = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""Transaction""') IS NOT NULL THEN (SELECT COUNT(*) FROM ""Transaction"") ELSE 0 END;"
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

    [string]$hasMigrations = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""_prisma_migrations""') IS NOT NULL THEN 1 ELSE 0 END;"
    [string]$hasAppSettings = Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""AppSetting""') IS NOT NULL THEN 1 ELSE 0 END;"
    if ($hasMigrations -ne "1" -or $hasAppSettings -ne "1") {
        throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Target database [$LiveDbName] does not contain valid GMS schema tables (_prisma_migrations or AppSetting missing). NO DATABASE MUTATION OCCURRED."
    }

    # Check GMS_ENVIRONMENT_ID (FAIL-CLOSED: Never fallback to ExpectedEnvironmentId - F7 Remediation)
    [string]$ActualEnvId = Exec-LiveDbQuery "SELECT value FROM ""AppSetting"" WHERE key IN ('GMS_ENVIRONMENT_ID', 'ENVIRONMENT_ID', 'SYSTEM_ENVIRONMENT_ID') LIMIT 1;"
    if ([string]::IsNullOrWhiteSpace($ActualEnvId)) {
        throw "HARD FAIL: TARGET DATABASE FINGERPRINT REJECTED! Target database [$LiveDbName] has no GMS_ENVIRONMENT_ID configured in AppSetting. Fail-closed: Cannot restore into unverified database without verified identity. NO DATABASE MUTATION OCCURRED."
    }
    if ($ExpectedEnvironmentId -and $ActualEnvId -ne $ExpectedEnvironmentId) {
        throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Environment ID '$ExpectedEnvironmentId' does not match target database ID '$ActualEnvId'. NO DATABASE MUTATION OCCURRED."
    }

    # Check GMS_INSTALLATION_UUID (FAIL-CLOSED: Must be present on existing database)
    [string]$ActualInstallUuid = Exec-LiveDbQuery "SELECT value FROM ""AppSetting"" WHERE key IN ('GMS_INSTALLATION_UUID', 'INSTALLATION_UUID') LIMIT 1;"
    if ([string]::IsNullOrWhiteSpace($ActualInstallUuid)) {
        throw "HARD FAIL: TARGET DATABASE FINGERPRINT REJECTED! Target database [$LiveDbName] has no GMS_INSTALLATION_UUID configured in AppSetting. Fail-closed: Existing environment restore requires a valid installation UUID. NO DATABASE MUTATION OCCURRED."
    }
    if ($ExpectedInstallationUuid -and $ActualInstallUuid -ne $ExpectedInstallationUuid) {
        throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Installation UUID '$ExpectedInstallationUuid' does not match target UUID '$ActualInstallUuid'. NO DATABASE MUTATION OCCURRED."
    }

    # Check GMS_RESTORE_ALLOWED
    [string]$RestoreAllowedVal = Exec-LiveDbQuery "SELECT UPPER(value) FROM ""AppSetting"" WHERE key IN ('GMS_RESTORE_ALLOWED', 'RESTORE_ALLOWED') LIMIT 1;"
    if (-not $RestoreAllowedVal) { $RestoreAllowedVal = "FALSE" }
    if ($RestoreAllowedVal -ne "TRUE" -and $RestoreAllowedVal -ne "1") {
        throw "HARD FAIL: GMS_RESTORE_ALLOWED is set to '$RestoreAllowedVal' in AppSetting. Restore operation is NOT permitted on live database [$LiveDbName]. Set GMS_RESTORE_ALLOWED = TRUE in target database prior to executing restore. NO DATABASE MUTATION OCCURRED."
    }

    Write-Log "  Target DB Fingerprint Verified (Env: $ActualEnvId, UUID: $ActualInstallUuid, RESTORE_ALLOWED: TRUE) [PASS]" -Level "SUCCESS"
}

# Step 2: Enter Maintenance Mode / Application Write Freeze
Write-Log "Step 2: Enabling Maintenance Mode & Application Write Freeze..."
Set-Content -Path $MaintFlagPath -Value "MAINTENANCE_ACTIVE_PRODUCTION_RESTORE" -Encoding utf8

if (-not (Test-Path -Path $MaintDir -PathType Container)) {
    New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
}
Set-Content -Path $MaintActivePath -Value "MAINTENANCE_ACTIVE_PRODUCTION_RESTORE" -Encoding utf8
Write-Log "  Maintenance flag created ($MaintFlagPath & $MaintActivePath) [PASS]" -Level "SUCCESS"

[string]$TimestampSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")
$StagingContainer = "gms-restore-staging-" + $TimestampSuffix

# Step 2.1: Register PREPARED recovery state in persistent ledger
Update-RecoveryLedger -State "PREPARED"

function Invoke-AtomicPostgresRestore {
    param(
        [Parameter(Mandatory=$true)][string]$Container,
        [Parameter(Mandatory=$true)][string]$DbName,
        [Parameter(Mandatory=$true)][string]$User,
        [Parameter(Mandatory=$true)][string]$DumpPathInContainer,
        [Parameter(Mandatory=$false)][string]$Pass = "",
        [Parameter(Mandatory=$false)][string]$Context = "Database"
    )

    Write-Log "  Executing atomic single-transaction restore for [$Context] on [$DbName]..."

    # Detect PostgreSQL server version fail-closed without string-interpolating credentials
    [string]$versionNumStr = ""
    [int]$vExitCode = 1
    try {
        $vArgs = @("exec")
        if ($Pass) { $vArgs += @("-e", "PGPASSWORD=$Pass") }
        $vArgs += @($Container, "psql", "-t", "-A", "-U", $User, "-d", $DbName, "-c", "SHOW server_version_num;")
        $vOut = & docker @vArgs 2>&1
        $vExitCode = $LASTEXITCODE
        $versionNumStr = ([string]($vOut | Out-String)).Trim()
    } catch {
        $versionNumStr = $_.ToString()
    }

    [int]$serverVersionNum = 0
    [bool]$parsedVersion = [int]::TryParse($versionNumStr, [ref]$serverVersionNum)
    if ($vExitCode -ne 0 -or -not $parsedVersion -or $serverVersionNum -le 0) {
        throw "CRITICAL RESTORE FAILURE: Unable to detect PostgreSQL server version on [$Container] (query exit code: $vExitCode, output: '$versionNumStr'). Fail-closed: restore aborted before any database mutation."
    }
    Write-Log "  Detected PostgreSQL server version: $serverVersionNum on [$Container]" -Level "INFO"

    [string]$restoreOutput = ""
    [int]$exitCode = 0

    if ($serverVersionNum -ge 170000) {
        # Native PostgreSQL 17+: transaction_timeout is supported natively
        Write-Log "  PostgreSQL 17+ detected: Running native atomic pg_restore with --single-transaction --exit-on-error..." -Level "INFO"
        $execArgs = @("exec")
        if ($Pass) { $execArgs += @("-e", "PGPASSWORD=$Pass") }
        $execArgs += @(
            $Container,
            "pg_restore",
            "--username=$User",
            "--dbname=$DbName",
            "--clean",
            "--if-exists",
            "--single-transaction",
            "--exit-on-error",
            "--no-owner",
            "--no-privileges",
            $DumpPathInContainer
        )
        $restoreOutput = & docker @execArgs 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } else {
        # PostgreSQL < 17 (e.g. PG15): Two-Phase Validated Generation & Atomic Execution
        # Pre-cleanup: Sweep verified completed artifacts while strictly preserving unreconciled runs for forensics
        Clear-StaleGmsRestoreArtifacts -Container $Container -CurrentOperationId $RecoveryOperationId -LedgerPath $RecLedgerFile

        [string]$stageUniqueId = [guid]::NewGuid().ToString("N").Substring(0, 8)
        [string]$tempStageDir = "/tmp/gms_restore_${TimestampSuffix}_${stageUniqueId}"
        [string]$tempSqlFile = "${tempStageDir}/stage.sql"
        [string]$tempMetaFile = "${tempStageDir}/stage.meta.json"
        [int]$stageExitCode = 1

        try {
            # Storage Capacity Pre-flight Check: strictly fail-closed
            $storageResult = Assert-RestoreStorageCapacity -Container $Container -DumpPathInContainer $DumpPathInContainer
            [int64]$dumpBytes = [int64]$storageResult.DumpBytes

            # Phase 1: Generate sanitized SQL in isolated directory with restricted permissions (0700 dir, 0600 file)
            Write-Log "  PostgreSQL < 17 detected (version $serverVersionNum): Phase 1 - Generating and validating sanitized SQL dump..." -Level "INFO"

            # Prepare metadata JSON string
            $metaData = @{
                operationId = $RecoveryOperationId
                container = $Container
                stageUniqueId = $stageUniqueId
                createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                status = "IN_PROGRESS"
                pid = $PID
            } | ConvertTo-Json -Compress
            $encodedMeta = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($metaData))

            $awkScript = 'BEGIN { in_copy = 0 } /^COPY / { in_copy = 1; print; next } $0 == "\\." { in_copy = 0; print; next } !in_copy && /^SET[ \t]+transaction_timeout/ { next } { print }'
            $genScript = "set -e -o pipefail; umask 077; mkdir -m 700 -p `"$tempStageDir`"; echo '$encodedMeta' | base64 -d > `"$tempMetaFile`"; trap 'rm -rf `"$tempStageDir`"' INT TERM; pg_restore -f - --clean --if-exists --no-owner --no-privileges `"$DumpPathInContainer`" | awk '$awkScript' > `"$tempSqlFile`""
            
            $execGenArgs = @("exec")
            if ($Pass) { $execGenArgs += @("-e", "PGPASSWORD=$Pass") }
            $execGenArgs += @($Container, "sh", "-c", $genScript)
            
            $genOutput = & docker @execGenArgs 2>&1 | Out-String
            $genExitCode = $LASTEXITCODE
            
            if ($genExitCode -ne 0) {
                & docker exec $Container sh -c "test -f `"$tempMetaFile`" && sed -i 's/\"status\":\"[A-Z_]*\"/\"status\":\"FAILED\"/g' `"$tempMetaFile`" || true" 2>$null | Out-Null
                throw "CRITICAL ATOMIC RESTORE FAILURE: Phase 1 SQL generation failed for [$Context] with exit code $($genExitCode). Zero queries sent to target database. Output: $genOutput"
            }

            # Verify generated SQL file exists, is non-empty, and respects safe expansion bounds
            [string]$sqlBytesStr = (& docker exec $Container stat -c %s "$tempSqlFile" 2>$null | Out-String).Trim()
            [int64]$sqlBytes = 0
            if (-not [int64]::TryParse($sqlBytesStr, [ref]$sqlBytes) -or $sqlBytes -le 0) {
                throw "CRITICAL ATOMIC RESTORE FAILURE: Phase 1 SQL generation produced an empty or missing SQL file ($tempSqlFile). Restore aborted before database mutation."
            }

            # Safe expansion cap: SQL dump should not exceed 10x dump size or remaining capacity
            if ($sqlBytes -gt ($dumpBytes * 10) -and $sqlBytes -gt 524288000) { # > 10x dump and > 500MB
                throw "CRITICAL ATOMIC RESTORE FAILURE: Phase 1 SQL generation exceeded safe expansion bound ($sqlBytes bytes vs dump size $dumpBytes bytes). Disk exhaustion prevented; restore aborted fail-closed."
            }
            Write-Log "  Validated generated SQL dump: $sqlBytes bytes (expansion: $([Math]::Round($sqlBytes / [Math]::Max($dumpBytes, 1), 2))x) [PASS]" -Level "INFO"

            # Phase 2: Execute verified SQL in an atomic single transaction
            Write-Log "  PostgreSQL < 17 detected: Phase 2 - Executing validated SQL in atomic single transaction via psql..." -Level "INFO"
            $applyScript = "set -e -o pipefail; psql -U `"$User`" -d `"$DbName`" -v ON_ERROR_STOP=1 --single-transaction -f `"$tempSqlFile`""
            
            $execApplyArgs = @("exec")
            if ($Pass) { $execApplyArgs += @("-e", "PGPASSWORD=$Pass") }
            $execApplyArgs += @($Container, "sh", "-c", $applyScript)
            
            $restoreOutput = & docker @execApplyArgs 2>&1 | Out-String
            $stageExitCode = $LASTEXITCODE
            $exitCode = $stageExitCode

            if ($stageExitCode -eq 0) {
                & docker exec $Container sh -c "test -f `"$tempMetaFile`" && sed -i 's/\"status\":\"[A-Z_]*\"/\"status\":\"COMPLETED\"/g' `"$tempMetaFile`" || true" 2>$null | Out-Null
            } else {
                & docker exec $Container sh -c "test -f `"$tempMetaFile`" && sed -i 's/\"status\":\"[A-Z_]*\"/\"status\":\"FAILED\"/g' `"$tempMetaFile`" || true" 2>$null | Out-Null
            }
        } finally {
            # Explicit post-SQL retention policy (P1/P2 Remediation):
            # - If restore failed or was interrupted, preserve staging directory, stage.meta.json (status: FAILED),
            #   and SQL file intact in container for operator post-incident analysis.
            # - If restore succeeded ($stageExitCode -eq 0), scrub uncompressed plaintext SQL to protect data privacy
            #   and container storage capacity, while preserving stage.meta.json as forensic proof until the overall recovery is VERIFIED.
            if ($tempStageDir) {
                if ($stageExitCode -eq 0) {
                    Write-Log "  Scrubbing temporary uncompressed SQL after verified application: $tempSqlFile (preserving forensic metadata until ledger verification)..." -Level "INFO"
                    & docker exec $Container rm -f $tempSqlFile 2>&1 | Out-Null
                } else {
                    Write-Log "  [FORENSIC PRESERVE] Restore not verified successful (exit code: $stageExitCode). Retaining staging directory [$tempStageDir] in container [$Container] for operator investigation." -Level "WARN"
                    & docker exec $Container sh -c "test -f `"$tempMetaFile`" && sed -i 's/\"status\":\"[A-Z_]*\"/\"status\":\"FAILED\"/g' `"$tempMetaFile`" || true" 2>$null | Out-Null
                }
            }
        }
    }

    if ($exitCode -ne 0) {
        throw "CRITICAL ATOMIC RESTORE FAILURE: [$Context] restore on [$DbName] failed with exit code ${exitCode}. Error output: $restoreOutput"
    }

    Write-Log "  [$Context] Atomic single-transaction restore verified successful (exit code: 0) [PASS]" -Level "SUCCESS"
    return $restoreOutput
}

# Step 4: Isolated Staging PostgreSQL Restoration & Invariant Checks
    Write-Log "Step 3: Spawning Isolated Staging PostgreSQL Container ($StagingContainer)..."
    & docker run -d --name $StagingContainer -p "127.0.0.1:${StagingPort}:5432" -e "POSTGRES_USER=$PgUser" -e "POSTGRES_PASSWORD=$PgPass" -e "POSTGRES_DB=$StagingDbName" -e "POSTGRES_HOST_AUTH_METHOD=trust" postgres:15-alpine 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed launching isolated PostgreSQL staging container." }

    # Wait for PostgreSQL container readiness
    [bool]$ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        & docker exec $StagingContainer pg_isready -U $PgUser -d $StagingDbName 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw "Staging PostgreSQL container failed to become ready within 30s." }

    Write-Log "Step 4: Executing pg_restore into Isolated Staging Database..."
    [string]$TmpDumpInContainer = "/tmp/$DumpFileName"
    & docker cp $DumpFilePath "${StagingContainer}:${TmpDumpInContainer}"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying dump file to staging container." }

    try {
        [void](Invoke-AtomicPostgresRestore -Container $StagingContainer -DbName $StagingDbName -User $PgUser -DumpPathInContainer $TmpDumpInContainer -Pass $PgPass -Context "Staging Database")
    } finally {
        & docker exec $StagingContainer rm -f $TmpDumpInContainer 2>&1 | Out-Null
    }

    # Exec-Query helper
    function Exec-StagingQuery([string]$sql) {
        $inputSql = $sql.Trim() + "`n"
        $raw = $inputSql | & docker exec -i $StagingContainer psql -t -A -U $PgUser -d $StagingDbName 2>&1
        if (-not $raw) { return "" }
        [string]$rawText = ($raw | Out-String)
        [string[]]$lines = @(($rawText -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^(NOTICE|WARNING):' })
        if ((@($lines)).Count -gt 0) {
            $errLine = $lines | Where-Object { $_ -match '^(psql:\s*error:|ERROR:|FATAL:)' } | Select-Object -First 1
            if ($errLine) {
                throw "Staging database query error: $($lines -join ' -- ')"
            }
            return ([string]$lines[-1]).Trim()
        }
        return ""
    }

    Write-Log "Step 5: Verifying Schema Migrations & Invariants in Staging Database..."
    [string]$MigrationCountStr = Exec-StagingQuery "SELECT COUNT(*) FROM ""_prisma_migrations"" WHERE finished_at IS NOT NULL;"
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
            [string]$tableExists = Exec-StagingQuery "SELECT CASE WHEN to_regclass('public.`"$tableName`"') IS NOT NULL THEN '1' ELSE '0' END;"
            if ($tableExists -ne "1") {
                if ($expectedCount -eq 0) {
                    continue # Valid historical schema: table does not exist in this migration version and expected count is 0
                } else {
                    throw "HARD FAIL: Table '$tableName' for entity '$entityKey' does not exist in staging database, but expected count is $expectedCount."
                }
            }
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
    [int]$StagingAttCount = 0
    if ((Exec-StagingQuery "SELECT CASE WHEN to_regclass('public.""Attachment""') IS NOT NULL THEN '1' ELSE '0' END;") -eq "1") {
        $StagingAttCount = [int](Exec-StagingQuery "SELECT COUNT(*) FROM ""Attachment"";")
    }
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
        $WbDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"", ""type"" FROM ""WeighbridgeRecord"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"", ""type"" HAVING COUNT(*) > 1) d;")
        $WhDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""WarehouseProcess"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
        $QcvDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""QcVehicleCheck"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
        $ImDupeCurrent = [int](Exec-StagingQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""IncomingMaterialCheck"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
    }

    if (($WbDupeCurrent + $WhDupeCurrent + $QcvDupeCurrent + $ImDupeCurrent) -gt 0) {
        throw "Invariant Check Failed: Duplicate isCurrent=true records present in restored database."
    }
    Write-Log "  Duplicate isCurrent invariant check [PASS] (0 duplicates)" -Level "SUCCESS"

    [int]$OrphanHist = 0
    if ((Exec-StagingQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('TransactionStatusHistory', 'Transaction')) = 2 THEN '1' ELSE '0' END;") -eq "1") {
        $OrphanHist = [int](Exec-StagingQuery "SELECT COUNT(*) FROM ""TransactionStatusHistory"" h LEFT JOIN ""Transaction"" t ON h.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$OrphanWb = 0
    if ((Exec-StagingQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('WeighbridgeRecord', 'Transaction')) = 2 THEN '1' ELSE '0' END;") -eq "1") {
        $OrphanWb = [int](Exec-StagingQuery "SELECT COUNT(*) FROM ""WeighbridgeRecord"" r LEFT JOIN ""Transaction"" t ON r.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$OrphanWh = 0
    if ((Exec-StagingQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('WarehouseProcess', 'Transaction')) = 2 THEN '1' ELSE '0' END;") -eq "1") {
        $OrphanWh = [int](Exec-StagingQuery "SELECT COUNT(*) FROM ""WarehouseProcess"" w LEFT JOIN ""Transaction"" t ON w.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$OrphanAtt = 0
    if ((Exec-StagingQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Attachment', 'Transaction')) = 2 THEN '1' ELSE '0' END;") -eq "1") {
        $OrphanAtt = [int](Exec-StagingQuery "SELECT COUNT(*) FROM ""Attachment"" a LEFT JOIN ""Transaction"" t ON a.""transactionId"" = t.id WHERE t.id IS NULL;")
    }

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
        [string]$AttDbJson = Exec-StagingQuery "SELECT COALESCE(json_agg(json_build_object('id', id, 'filePath', ""filePath"", 'sha256', sha256)), '[]'::json) FROM ""Attachment"";"
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
    $rawLive = & docker ps -q -f "name=$LiveContainer" 2>&1
    $LiveContainerId = if ($rawLive) { [string]$rawLive.ToString().Trim() } else { "" }

    if ([string]::IsNullOrWhiteSpace($LiveContainerId)) {
        throw "Live database target container [$LiveContainer] not found or not running. Live database restoration aborted."
    }

    # Helper for live database queries
    function Exec-LiveDbQuery([string]$sql) {
        return (Exec-LiveDbQueryInternal -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -Sql $sql)
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
            [string]$LiveUserCountStr = Exec-LiveDbQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User') = 1 THEN (SELECT COUNT(*) FROM ""User"") ELSE 0 END;"
            [string]$LiveMigCountStr = Exec-LiveDbQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') = 1 THEN (SELECT COUNT(*) FROM ""_prisma_migrations"") ELSE 0 END;"
            [string]$LiveTxCountStr = Exec-LiveDbQuery "SELECT CASE WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Transaction') = 1 THEN (SELECT COUNT(*) FROM ""Transaction"") ELSE 0 END;"
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

        [string]$hasMigrations = Exec-LiveDbQuery "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations';"
        [string]$hasAppSettings = Exec-LiveDbQuery "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AppSetting';"

        if ($hasMigrations -ne "1" -or $hasAppSettings -ne "1") {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Target database [$LiveDbName] does not contain valid GMS schema tables (_prisma_migrations or AppSetting missing). NO DATABASE MUTATION OCCURRED."
        }

        # Check GMS_ENVIRONMENT_ID (FAIL-CLOSED: Never fallback to ExpectedEnvironmentId - F7 Remediation)
        [string]$ActualEnvId = Exec-LiveDbQuery "SELECT COALESCE((SELECT value FROM ""AppSetting"" WHERE key = 'GMS_ENVIRONMENT_ID' OR key = 'ENVIRONMENT_ID' OR key = 'SYSTEM_ENVIRONMENT_ID' LIMIT 1), '');"
        if ([string]::IsNullOrWhiteSpace($ActualEnvId)) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT REJECTED! Target database [$LiveDbName] has no GMS_ENVIRONMENT_ID configured in AppSetting. Fail-closed: Cannot restore into unverified database without verified identity. NO DATABASE MUTATION OCCURRED."
        }
        if ($ExpectedEnvironmentId -and $ActualEnvId -ne $ExpectedEnvironmentId) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Environment ID '$ExpectedEnvironmentId' does not match target database ID '$ActualEnvId'. NO DATABASE MUTATION OCCURRED."
        }

        # Check GMS_INSTALLATION_UUID (FAIL-CLOSED: Must be present on existing database)
        [string]$ActualInstallUuid = Exec-LiveDbQuery "SELECT COALESCE((SELECT value FROM ""AppSetting"" WHERE key = 'GMS_INSTALLATION_UUID' OR key = 'INSTALLATION_UUID' LIMIT 1), '');"
        if ([string]::IsNullOrWhiteSpace($ActualInstallUuid)) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT REJECTED! Target database [$LiveDbName] has no GMS_INSTALLATION_UUID configured in AppSetting. Fail-closed: Existing environment restore requires a valid installation UUID. NO DATABASE MUTATION OCCURRED."
        }
        [string]$EffectiveExpectedUuid = $ExpectedInstallationUuid
        if (-not $EffectiveExpectedUuid -and $ManifestData.installationUuid) {
            $EffectiveExpectedUuid = [string]$ManifestData.installationUuid
        }
        if (-not $EffectiveExpectedUuid -and ($ActualEnvId -like "*PROD*" -or $ExpectedEnvironmentId -like "*PROD*")) {
            throw "HARD FAIL: Production restore strictly requires an explicit -ExpectedInstallationUuid (or installationUuid in manifest) to prevent restoring onto an unverified target. Refusing unverified target."
        }
        if ($EffectiveExpectedUuid -and $ActualInstallUuid -ne $EffectiveExpectedUuid) {
            throw "HARD FAIL: TARGET DATABASE FINGERPRINT MISMATCH! Expected Installation UUID '$EffectiveExpectedUuid' does not match target UUID '$ActualInstallUuid'. NO DATABASE MUTATION OCCURRED."
        }

        # Verify Docker host context
        try {
            $dockerContext = (& docker context show 2>$null).ToString().Trim()
            if ($dockerContext) {
                Write-Log "  Verified Docker host context: $dockerContext"
            }
        } catch {}

        # Check GMS_RESTORE_ALLOWED
        [string]$RestoreAllowedVal = Exec-LiveDbQuery "SELECT COALESCE((SELECT UPPER(value) FROM ""AppSetting"" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1), 'FALSE');"
        if ($RestoreAllowedVal -ne "TRUE" -and $RestoreAllowedVal -ne "1") {
            throw "HARD FAIL: GMS_RESTORE_ALLOWED is set to '$RestoreAllowedVal' in AppSetting. Restore operation is NOT permitted on live database [$LiveDbName]. Set GMS_RESTORE_ALLOWED = TRUE in target database prior to executing restore. NO DATABASE MUTATION OCCURRED."
        }

        # STRICT PRODUCTION FAULT INJECTION GUARD (FAIL-CLOSED: ZERO PRODUCTION OVERRIDES)
        [string]$EffectiveFaultPhase = if ($FaultInjectionPhase) { $FaultInjectionPhase } else { $env:GMS_FAULT_INJECTION_PHASE }
        if (-not [string]::IsNullOrWhiteSpace($EffectiveFaultPhase)) {
            # 1. Unconditional rejection of production database identity (NO CI OR DRILL OVERRIDES)
            if ($ActualEnvId -like "*PROD*" -or $LiveDbName -like "*prod*" -or $LiveContainer -like "*prod*") {
                throw "CRITICAL GOVERNANCE VIOLATION: Target database [$LiveDbName] is identified as PRODUCTION ($ActualEnvId, container: $LiveContainer). Fault injection (-FaultInjectionPhase '$EffectiveFaultPhase') is UNCONDITIONALLY PROHIBITED on production targets under ALL circumstances. CI or drill flags cannot override this."
            }

            # 2. Require verified isolated drill environment
            if ($env:GMS_ISOLATED_DRILL_ENVIRONMENT -ne "TRUE") {
                throw "CRITICAL GOVERNANCE VIOLATION: Fault injection (-FaultInjectionPhase '$EffectiveFaultPhase') requires verified isolated drill environment (GMS_ISOLATED_DRILL_ENVIRONMENT=TRUE). Target environment ($ActualEnvId) is not authorized."
            }

            # 3. Environment ID must be explicitly designated for testing/drill
            if ($ActualEnvId -notlike "*DRILL*" -and $ActualEnvId -notlike "*STAGING*" -and $ActualEnvId -notlike "*TEST*" -and $ActualEnvId -notlike "*DEV*") {
                throw "CRITICAL GOVERNANCE VIOLATION: Fault injection is prohibited on environment with ID '$ActualEnvId'. Only DRILL, STAGING, TEST, or DEV environment IDs may execute fault injection."
            }

            # 4. Check container labels and mounts to prevent drill against production volumes
            $rawInspect = & docker inspect $LiveContainer 2>$null
            [string]$inspectJson = if ($rawInspect) { [string]$rawInspect.ToString() } else { "" }
            if ($inspectJson) {
                if ($inspectJson -like "*prod-postgres-data*" -or $inspectJson -like "*production_postgres*") {
                    throw "CRITICAL GOVERNANCE VIOLATION: Target container [$LiveContainer] is bound to production data volumes! Fault injection is unconditionally blocked."
                }
            }
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

    # Transition ledger state to RESTORING immediately before modifying live database
    Update-RecoveryLedger -State "RESTORING"

    try {
        [void](Invoke-AtomicPostgresRestore -Container $LiveContainer -DbName $LiveDbName -User $PgUser -DumpPathInContainer $TmpDumpInLive -Pass $PgPass -Context "Live Database Promotion")
    } finally {
        & docker exec $LiveContainer rm -f $TmpDumpInLive 2>&1 | Out-Null
    }

    # DB pg_restore committed into live target; transition phase immediately to guarantee DB rollback on any subsequent error
    $PromotionPhase = "DB_COMMITTED_PENDING_ATTACHMENT"
    Write-Log "  Live Database pg_restore committed into [$LiveDbName] [PASS]" -Level "SUCCESS"

    # Persist RESTORED state in ledger immediately upon successful DB restore
    Update-RecoveryLedger -State "RESTORED" -Extra @{ dbRestoreExecutedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }

    if ($FaultInjectionPhase -eq "POST_DB_COMMIT" -or $env:GMS_FAULT_INJECTION_PHASE -eq "POST_DB_COMMIT") {
        throw "INJECTED_FAULT: Simulated post-DB-commit promotion failure for DR drill validation."
    }

    # Verify Live DB migration deployment
    [string]$LiveMigCountStr = Exec-LiveDbQuery "SELECT COUNT(*) FROM ""_prisma_migrations"" WHERE finished_at IS NOT NULL;"
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

    # Check if target database is running historical schema (less than 10 finished migrations)
    [bool]$isHistoricalSchema = ($LiveMigCount -lt 10)

    [int]$LiveUserCount = Get-LiveTableCountSafe -TableName "User" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveTxCount = Get-LiveTableCountSafe -TableName "Transaction" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveAttCount = Get-LiveTableCountSafe -TableName "Attachment" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveCorrectionCount = Get-LiveTableCountSafe -TableName "TransactionCorrection" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveCorrectionItemCount = Get-LiveTableCountSafe -TableName "TransactionCorrectionItem" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveWbCount = Get-LiveTableCountSafe -TableName "WeighbridgeRecord" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveWhCount = Get-LiveTableCountSafe -TableName "WarehouseProcess" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveQcvCount = Get-LiveTableCountSafe -TableName "QcVehicleCheck" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveImCount = Get-LiveTableCountSafe -TableName "IncomingMaterialCheck" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveFraudCount = Get-LiveTableCountSafe -TableName "FraudCheck" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveActCount = Get-LiveTableCountSafe -TableName "ActivityLog" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveSettingCount = Get-LiveTableCountSafe -TableName "AppSetting" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass
    [int]$LiveAnnounceCount = Get-LiveTableCountSafe -TableName "Announcement" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveIssueCount = Get-LiveTableCountSafe -TableName "SystemIssue" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveStatusHistCount = Get-LiveTableCountSafe -TableName "TransactionStatusHistory" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema
    [int]$LiveWhAccessCount = Get-LiveTableCountSafe -TableName "UserWarehouseAccess" -Container $LiveContainer -DbName $LiveDbName -User $PgUser -Pass $PgPass -AllowMissingIfHistorical $isHistoricalSchema

    # Invariant checks on live database
    [int]$LiveWbDupeCurrent = 0
    [int]$LiveWhDupeCurrent = 0
    [int]$LiveQcvDupeCurrent = 0
    [int]$LiveImDupeCurrent = 0
    [string]$hasIsCurrentLive = Exec-LiveDbQuery "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WeighbridgeRecord' AND column_name = 'isCurrent';"
    if ($hasIsCurrentLive -eq "1") {
        $LiveWbDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"", ""type"" FROM ""WeighbridgeRecord"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"", ""type"" HAVING COUNT(*) > 1) d;")
        $LiveWhDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""WarehouseProcess"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
        $LiveQcvDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""QcVehicleCheck"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
        $LiveImDupeCurrent = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM (SELECT ""transactionId"" FROM ""IncomingMaterialCheck"" WHERE ""isCurrent"" = true GROUP BY ""transactionId"" HAVING COUNT(*) > 1) d;")
    }
    [int]$LiveTotalDupes = $LiveWbDupeCurrent + $LiveWhDupeCurrent + $LiveQcvDupeCurrent + $LiveImDupeCurrent

    [int]$LiveOrphanHist = 0
    if ((Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""TransactionStatusHistory""') IS NOT NULL AND to_regclass('public.""Transaction""') IS NOT NULL THEN '1' ELSE '0' END;") -eq "1") {
        $LiveOrphanHist = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM ""TransactionStatusHistory"" h LEFT JOIN ""Transaction"" t ON h.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$LiveOrphanWb = 0
    if ((Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""WeighbridgeRecord""') IS NOT NULL AND to_regclass('public.""Transaction""') IS NOT NULL THEN '1' ELSE '0' END;") -eq "1") {
        $LiveOrphanWb = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM ""WeighbridgeRecord"" r LEFT JOIN ""Transaction"" t ON r.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$LiveOrphanWh = 0
    if ((Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""WarehouseProcess""') IS NOT NULL AND to_regclass('public.""Transaction""') IS NOT NULL THEN '1' ELSE '0' END;") -eq "1") {
        $LiveOrphanWh = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM ""WarehouseProcess"" w LEFT JOIN ""Transaction"" t ON w.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
    [int]$LiveOrphanAtt = 0
    if ((Exec-LiveDbQuery "SELECT CASE WHEN to_regclass('public.""Attachment""') IS NOT NULL AND to_regclass('public.""Transaction""') IS NOT NULL THEN '1' ELSE '0' END;") -eq "1") {
        $LiveOrphanAtt = [int](Exec-LiveDbQuery "SELECT COUNT(*) FROM ""Attachment"" a LEFT JOIN ""Transaction"" t ON a.""transactionId"" = t.id WHERE t.id IS NULL;")
    }
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

    # Step 7.5: Post-Promotion Security Postcondition Verification (FIX-05 / P1-05)
    # Strictly reset GMS_RESTORE_ALLOWED to FALSE and verify via query before reporting success
    Write-Log "Verifying post-restore security postconditions: resetting GMS_RESTORE_ALLOWED to FALSE..." -Level "INFO"
    [string]$resetVal = ""
    try {
        $resetRaw = if ($PgPass) {
            & docker exec -e "PGPASSWORD=$PgPass" $LiveContainer psql -U $PgUser -d $LiveDbName -v ON_ERROR_STOP=1 -t -A -c "UPDATE ""AppSetting"" SET value = 'FALSE' WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED'; SELECT value FROM ""AppSetting"" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1;" 2>&1
        } else {
            & docker exec $LiveContainer psql -U $PgUser -d $LiveDbName -v ON_ERROR_STOP=1 -t -A -c "UPDATE ""AppSetting"" SET value = 'FALSE' WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED'; SELECT value FROM ""AppSetting"" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1;" 2>&1
        }
        $resetVal = if ($resetRaw) { ([string]($resetRaw | Out-String)).Trim() } else { "" }
    } catch {
        throw "CRITICAL SECURITY POSTCONDITION EXCEPTION: Failed executing auto-reset query for GMS_RESTORE_ALLOWED: $_"
    }

    if ($resetVal -ne "FALSE") {
        throw "CRITICAL SECURITY POSTCONDITION FAILURE: GMS_RESTORE_ALLOWED could not be verified reset to FALSE (query returned '$resetVal'). Live database restore permission remains insecure. System fail-closed."
    }
    Write-Log "Auto-reset of GMS_RESTORE_ALLOWED to FALSE strictly verified in target database [PASS]." -Level "SUCCESS"

    [bool]$PassedLiveAssertions = ($LiveTotalDupes -eq 0) -and ($LiveTotalOrphans -eq 0) -and (-not ($LiveAttCount -gt 0 -and $AttArchivePath -and ($RestoredPhysicalCount -lt $LiveAttCount))) -and ($resetVal -eq "FALSE")
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
        securityPostconditionsVerified = @{
            restoreGateResetToFalse = ($resetVal -eq "FALSE")
            trafficFrozenInMaintenance = $true
        }
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

    # Persist recovery ledger state for restart resilience (FIX-05 / P1-04)
    Update-RecoveryLedger -State "VERIFIED" -Extra @{
        dbRestoreExecutedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        rtoSeconds = $RtoSeconds
    }

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
                try {
                    [void](Invoke-AtomicPostgresRestore -Container $LiveContainer -DbName $LiveDbName -User $PgUser -DumpPathInContainer $TmpRollbackInLive -Pass $PgPass -Context "Live Database Rollback")
                    Write-Log "  Live database successfully rolled back to pre-restore snapshot." -Level "SUCCESS"
                } finally {
                    & docker exec $LiveContainer rm -f $TmpRollbackInLive 2>&1 | Out-Null
                }
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
    try {
        Set-Content -Path $RestoreEvidencePath -Value $EvidenceJson -Encoding utf8
    } catch {
        [string]$altLogs = Join-Path -Path $ProjectRootDir -ChildPath "artifacts/logs"
        if (-not (Test-Path -Path $altLogs)) { New-Item -Path $altLogs -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null }
        [string]$altEvidence = Join-Path -Path $altLogs -ChildPath "restore_evidence.json"
        Set-Content -Path $altEvidence -Value $EvidenceJson -Encoding utf8 -ErrorAction SilentlyContinue
    }

    # Clean staging upload directory if created
    if (-not [string]::IsNullOrWhiteSpace($StagingUploadDir) -and (Test-Path -Path $StagingUploadDir)) {
        Remove-Item -Path $StagingUploadDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
} finally {
    # Step 8: Unified Fail-Closed Maintenance Policy & Container Cleanup (FIX-02 C / FIX-05)
    # Restore success does NOT automatically open ingress traffic.
    # Maintenance remains strictly active until health watchdog, strict smoke tests, and authorized unfreeze pass.
    if ((Test-Path -Path $MaintFlagPath) -or (Test-Path -Path $MaintActivePath)) {
        Write-Log "MAINTENANCE MODE REMAINS ACTIVE FOR SAFETY (Fail-Closed Policy)." -Level "INFO"
        Write-Log "Ingress traffic stays frozen until post-recovery watchdog, strict smoke probes, and authorized unfreeze are completed." -Level "INFO"
    }

    # Emergency safety reset of GMS_RESTORE_ALLOWED in target database if unhandled failure occurred
    if (-not [string]::IsNullOrWhiteSpace($LiveContainerId)) {
        try {
            $resetRawFinally = if ($PgPass) {
                & docker exec -e "PGPASSWORD=$PgPass" $LiveContainer psql -U $PgUser -d $LiveDbName -t -A -c "UPDATE ""AppSetting"" SET value = 'FALSE' WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED'; SELECT value FROM ""AppSetting"" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1;" 2>&1
            } else {
                & docker exec $LiveContainer psql -U $PgUser -d $LiveDbName -t -A -c "UPDATE ""AppSetting"" SET value = 'FALSE' WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED'; SELECT value FROM ""AppSetting"" WHERE key = 'GMS_RESTORE_ALLOWED' OR key = 'RESTORE_ALLOWED' LIMIT 1;" 2>&1
            }
            [string]$resetValFinally = ($resetRawFinally | Out-String).Trim()
            if ($resetValFinally -eq "FALSE") {
                Write-Log "Safety reset of GMS_RESTORE_ALLOWED to FALSE confirmed in finally block." -Level "INFO"
            }
        } catch {
            Write-Log "WARNING: Could not execute emergency reset query for GMS_RESTORE_ALLOWED in finally block: $_" -Level "WARN"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($StagingContainer)) {
        & docker rm -f $StagingContainer 2>&1 | Out-Null
    }

    if ($script:RecoveryLockStream -ne $null) {
        try {
            $script:RecoveryLockStream.Close()
            $script:RecoveryLockStream.Dispose()
        } catch {}
        $script:RecoveryLockStream = $null
        Remove-Item -Path $LockFilePath -Force -ErrorAction SilentlyContinue
    }
}

exit 0
