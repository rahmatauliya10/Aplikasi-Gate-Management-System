# ==============================================================================
# GMS Immutable Deployment & Automated Rollback Script (P0-05, P1-05, P2-04)
# ==============================================================================
# Deploys specified RELEASE_TAG or distinct BackendDigest & FrontendDigest to
# production using docker-compose.prod.yml.
# Verifies image availability and digest immutability prior to modifying running stack.
# NO TAG FALLBACK: If digests are supplied and fail verification, deploy ABORTS.
# Runs automated watchdog verification post-deployment.
# Upon any healthcheck failure or explicit rollback request, instantly rolls back
# to prior stable release (PreviousBackendDigest / PreviousFrontendDigest).
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetReleaseTag,

    [Parameter(Mandatory=$false)]
    [string]$PreviousReleaseTag = "stable",

    [Parameter(Mandatory=$false)]
    [string]$BackendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$FrontendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousBackendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousFrontendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$TargetManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$RollbackManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$ComposeFile = "docker-compose.prod.yml",

    [Parameter(Mandatory=$false)]
    [switch]$RollbackOnly,

    [Parameter(Mandatory=$false)]
    [switch]$NoSchemaChangeVerified,

    [Parameter(Mandatory=$false)]
    [switch]$UsePrebuiltImages,

    [Parameter(Mandatory=$false)]
    [switch]$RequireDigest,

    [Parameter(Mandatory=$false)]
    [switch]$RequireNginx,

    [Parameter(Mandatory=$false)]
    [ValidateSet(
        "",
        "AFTER_BACKUP",
        "AFTER_MIGRATION",
        "AFTER_CONTAINER_SWITCH",
        "BEFORE_WATCHDOG"
    )]
    [string]$FaultInjectionPhase = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $WorkspaceRoot
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

function Verify-Image-Digest {
    param([string]$ImageName, [string]$ExpectedDigest)
    if (-not $ExpectedDigest) { return $true }
    [string]$foundDigest = & docker images --digests --format "{{.Digest}}" $ImageName 2>$null | Where-Object { $_ -eq $ExpectedDigest }
    if (-not $foundDigest) {
        # Strict NO TAG FALLBACK rule: Digest mismatch is a hard deployment failure!
        Write-Host "[GMS IMMUTABILITY FAILURE] Image [$ImageName] digest mismatch! Expected: $ExpectedDigest" -ForegroundColor Red
        return $false
    }
    return $true
}

function Verify-Image-Exists {
    param([string]$Tag, [string]$BackendDig = "", [string]$FrontendDig = "")
    if ($BackendDig -or $FrontendDig) {
        $backendOk = Verify-Image-Digest -ImageName "gms-backend" -ExpectedDigest $BackendDig
        $frontendOk = Verify-Image-Digest -ImageName "gms-frontend" -ExpectedDigest $FrontendDig
        return ($backendOk -and $frontendOk)
    }
    $backendImg = & docker images -q "gms-backend:$Tag" 2>$null
    $frontendImg = & docker images -q "gms-frontend:$Tag" 2>$null
    return ((-not [string]::IsNullOrWhiteSpace($backendImg)) -and (-not [string]::IsNullOrWhiteSpace($frontendImg)))
}

# Auto-resolve digests from target release manifest or local docker image inspect if not explicitly provided
[string]$ResolvedTargetManifest = ""
if ($TargetManifestPath -and (Test-Path -Path $TargetManifestPath -PathType Leaf)) {
    $ResolvedTargetManifest = $TargetManifestPath
} else {
    [string]$VersionedManifest = Join-Path $WorkspaceRoot "deploy\releases\${TargetReleaseTag}.json"
    if (Test-Path -Path $VersionedManifest -PathType Leaf) {
        $ResolvedTargetManifest = $VersionedManifest
    } else {
        [string]$DefaultManifest = Join-Path $WorkspaceRoot "deploy\release_manifest.json"
        if (Test-Path -Path $DefaultManifest -PathType Leaf) {
            try {
                $TmpObj = Get-Content -Path $DefaultManifest -Raw | ConvertFrom-Json
                if (($TmpObj.gitSha -and $TmpObj.gitSha -eq $TargetReleaseTag) -or ($TmpObj.release -and $TmpObj.release -eq $TargetReleaseTag)) {
                    $ResolvedTargetManifest = $DefaultManifest
                }
            } catch {}
        }
    }
}

if ($ResolvedTargetManifest) {
    try {
        $ManifestObj = Get-Content -Path $ResolvedTargetManifest -Raw | ConvertFrom-Json
        if (-not $BackendDigest -and $ManifestObj.backend) {
            $BackendDigest = if ($ManifestObj.backend.digest) { $ManifestObj.backend.digest } else { $ManifestObj.backend.ciLocalImageId }
        }
        if (-not $FrontendDigest -and $ManifestObj.frontend) {
            $FrontendDigest = if ($ManifestObj.frontend.digest) { $ManifestObj.frontend.digest } else { $ManifestObj.frontend.ciLocalImageId }
        }
        if (-not $PreviousBackendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.backend) {
            $PreviousBackendDigest = if ($ManifestObj.previousRelease.backend.digest) { $ManifestObj.previousRelease.backend.digest } else { $ManifestObj.previousRelease.backend.ciLocalImageId }
        }
        if (-not $PreviousFrontendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.frontend) {
            $PreviousFrontendDigest = if ($ManifestObj.previousRelease.frontend.digest) { $ManifestObj.previousRelease.frontend.digest } else { $ManifestObj.previousRelease.frontend.ciLocalImageId }
        }
    } catch {}
}

function Execute-Rollback {
    param(
        [string]$PrevTag,
        [string]$PrevBackendDig,
        [string]$PrevFrontendDig,
        [string]$CompFile,
        [bool]$IsStrictProd,
        [string]$RollbackManifestPath = "",
        [bool]$RequireDbRollback = $false,
        [bool]$EnforceNginx = $false
    )
    Write-Host "[GMS AUTOMATED ROLLBACK] Initiating schema-aware coordinated rollback sequence to previous stable release tag: [$PrevTag]..." -ForegroundColor Magenta

    if ($IsStrictProd -or $RequireDigest) {
        if (-not $PrevBackendDig -or -not $PrevFrontendDig) {
            throw "[GMS IMMUTABILITY VIOLATION] Rollback aborted! Production rollback requires explicit SHA-256 digests for previous images (PreviousBackendDigest and PreviousFrontendDigest). Refusing to fall back to target failed image digests."
        }
    }

    # Freeze traffic / Maintenance Mode during rollback via bind-mounted maintenance directory
    Write-Host "[GMS AUTOMATED ROLLBACK] Freezing traffic and entering maintenance mode..." -ForegroundColor Cyan
    [string]$MaintDir = Join-Path $WorkspaceRoot "maintenance"
    if (-not (Test-Path -Path $MaintDir -PathType Container)) {
        New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
    }
    [string]$MaintActive = Join-Path $MaintDir "active"
    Set-Content -Path $MaintActive -Value "MAINTENANCE_ACTIVE_ROLLBACK" -Encoding utf8

    [bool]$RollbackSucceeded = $false

    try {
        # If database was migrated or migration was started, execute MANDATORY coordinated DB rollback
        if ($RequireDbRollback -or ($RollbackManifestPath -and (Test-Path -Path $RollbackManifestPath -PathType Leaf))) {
            if (-not $RollbackManifestPath -or -not (Test-Path -Path $RollbackManifestPath -PathType Leaf)) {
                throw "[CRITICAL ROLLBACK FAILURE] Migration was started or completed, but pre-deployment backup manifest ($RollbackManifestPath) was not found on host storage! Cannot perform safe rollback without DB restoration. Traffic remains frozen in maintenance mode."
            }

            Write-Host "[GMS AUTOMATED ROLLBACK] Restoring database to pre-deployment state via operator restore plane ($RollbackManifestPath)..." -ForegroundColor Yellow
            $RestoreScript = Join-Path $PSScriptRoot "gms-production-restore.ps1"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $RollbackManifestPath -Force
            if ($LASTEXITCODE -ne 0) {
                throw "[CRITICAL ROLLBACK FAILURE] Coordinated database restore failed with exit code $LASTEXITCODE during rollback! Refusing to boot old application on unverified schema."
            }
            Write-Host "[GMS AUTOMATED ROLLBACK] Database successfully reverted to pre-migration state." -ForegroundColor Green
        } else {
            Write-Host "[GMS AUTOMATED ROLLBACK] Migration was not initiated; proceeding with application container rollback..." -ForegroundColor Cyan
        }

        $env:RELEASE_TAG = $PrevTag
        $env:BACKEND_IMAGE = if ($PrevBackendDig) { "gms-backend@$PrevBackendDig" } else { "gms-backend:$PrevTag" }
        $env:FRONTEND_IMAGE = if ($PrevFrontendDig) { "gms-frontend@$PrevFrontendDig" } else { "gms-frontend:$PrevTag" }

        if (-not (Verify-Image-Exists -Tag $PrevTag -BackendDig $PrevBackendDig -FrontendDig $PrevFrontendDig)) {
            throw "Previous release image pair [gms-backend:$PrevTag, gms-frontend:$PrevTag] does not exist locally. Cannot perform safe rollback."
        }

        Write-Host "[GMS AUTOMATED ROLLBACK] Booting previous stable release containers ($env:BACKEND_IMAGE, $env:FRONTEND_IMAGE)..." -ForegroundColor Cyan
        & docker compose -f $CompFile --env-file backend\.env up -d --no-build --remove-orphans
        if ($LASTEXITCODE -ne 0) { throw "Rollback container startup failed with exit code $LASTEXITCODE." }

        Write-Host "[GMS AUTOMATED ROLLBACK] Confirming system recovery & schema-compatible operation via watchdog..." -ForegroundColor Magenta
        $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
        & $PsExe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $CompFile -RequireNginx:$EnforceNginx
        if ($LASTEXITCODE -ne 0) { throw "Rollback health check verification failed with exit code $LASTEXITCODE." }

        $RollbackSucceeded = $true
        Write-Host "[GMS AUTOMATED ROLLBACK SUCCESS] Production environment successfully rolled back and restored to stable release [$PrevTag]." -ForegroundColor Green
    } finally {
        if ($RollbackSucceeded) {
            if (Test-Path -Path $MaintActive) {
                Remove-Item -Path $MaintActive -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-Host "[GMS CRITICAL ALERT] Rollback failed or incomplete! Maintenance flag ($MaintActive) retained to protect system integrity." -ForegroundColor Red
        }
    }
}

[bool]$IsProductionMode = [bool]($RequireDigest -or ($ComposeFile -like "*prod*"))
[bool]$EffectiveRequireNginx = if ($PSBoundParameters.ContainsKey('RequireNginx')) { [bool]$RequireNginx } else { $IsProductionMode }

if ($RollbackOnly) {
    if (-not $RollbackManifestPath -and -not $NoSchemaChangeVerified) {
        throw "[GMS GOVERNANCE VIOLATION] -RollbackOnly requires either an explicit -RollbackManifestPath to restore the database to a verified pre-migration state, or -NoSchemaChangeVerified to explicitly confirm no schema migration occurred."
    }
    [bool]$dbRollbackRequired = [bool](-not [string]::IsNullOrWhiteSpace($RollbackManifestPath))
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -CompFile $ComposeFile -IsStrictProd $IsProductionMode -RollbackManifestPath $RollbackManifestPath -RequireDbRollback $dbRollbackRequired -EnforceNginx $EffectiveRequireNginx
        exit 0
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover during rollback to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }
}

# If still missing, inspect local image digest if available
if (-not $BackendDigest) {
    [string]$inspectBackend = & docker inspect --format="{{index .RepoDigests 0}}" "gms-backend:$TargetReleaseTag" 2>$null
    if ($inspectBackend -and $inspectBackend.Contains("@")) {
        $BackendDigest = $inspectBackend.Split("@")[1]
    }
}
if (-not $FrontendDigest) {
    [string]$inspectFrontend = & docker inspect --format="{{index .RepoDigests 0}}" "gms-frontend:$TargetReleaseTag" 2>$null
    if ($inspectFrontend -and $inspectFrontend.Contains("@")) {
        $FrontendDigest = $inspectFrontend.Split("@")[1]
    }
}

# Strict Production Immutability Verification Gate
if ($IsProductionMode) {
    if (-not $BackendDigest -or -not $FrontendDigest) {
        throw "[GMS IMMUTABILITY VIOLATION] Production deployment strictly requires SHA-256 image digests for gms-backend and gms-frontend. Tag fallbacks are strictly prohibited for Level 9 production readiness."
    }
}

# Export compose environment variables with fallback tag or digest
$env:RELEASE_TAG = $TargetReleaseTag
$env:BACKEND_IMAGE = if ($BackendDigest) { "gms-backend@$BackendDigest" } else { "gms-backend:$TargetReleaseTag" }
$env:FRONTEND_IMAGE = if ($FrontendDigest) { "gms-frontend@$FrontendDigest" } else { "gms-frontend:$TargetReleaseTag" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Starting GMS Immutable Deployment Process: Target Release [$TargetReleaseTag]" -ForegroundColor Cyan
Write-Host "Backend Image:  $env:BACKEND_IMAGE" -ForegroundColor Gray
Write-Host "Frontend Image: $env:FRONTEND_IMAGE" -ForegroundColor Gray
Write-Host "==============================================================================" -ForegroundColor Cyan

[string]$CapturedManifestPath = ""
[string]$CapturedPreDeployBackupId = "NONE"
[bool]$MigrationStarted = $false

try {
    # Step 1.1: Verify target image availability and immutability before altering any services
    Write-Host "[GMS Preflight] Validating image presence and digest immutability..." -ForegroundColor Cyan
    if (-not (Verify-Image-Exists -Tag $TargetReleaseTag -BackendDig $BackendDigest -FrontendDig $FrontendDigest)) {
        throw "Target release image pair [gms-backend:$TargetReleaseTag, gms-frontend:$TargetReleaseTag] is not present or digest mismatched. Aborting deploy."
    }

    # Step 1.2: Check migration checksums against canonical baseline prior to backup & execution
    Write-Host "[GMS Preflight] Validating migration history checksums and detecting schema drift..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env run --rm migrator npm run test:drift
    if ($LASTEXITCODE -ne 0) { throw "Schema migration checksum verification failed with exit code $LASTEXITCODE. Target migrations have drift!" }

    # Step 1.3: Trigger pre-deployment atomic database and attachment backup
    Write-Host "[GMS Preflight] Creating mandatory pre-deployment backup..." -ForegroundColor Cyan
    $PredeployBackupLog = & docker compose -f $ComposeFile --env-file backend\.env run --rm migrator node scripts/run-predeploy-backup.js 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Pre-deployment backup script terminated with error code $LASTEXITCODE: $PredeployBackupLog"
    }

    # Step 1.4: Strict Extraction of Captured Backup ID from Node.js standard output
    [string]$backupLogCombined = ($PredeployBackupLog | Out-String)
    if ($backupLogCombined -match "BACKUP_CREATED_ID:\s*(BKP-[^\s\r\n]+)") {
        $CapturedPreDeployBackupId = $Matches[1].Trim()
        Write-Host "[GMS Preflight] Pre-deployment backup ID captured: $CapturedPreDeployBackupId" -ForegroundColor Green
    } elseif ($backupLogCombined -match "Backup Created:\s*(BKP-[^\s\r\n]+)") {
        $CapturedPreDeployBackupId = $Matches[1].Trim()
        Write-Host "[GMS Preflight] Pre-deployment backup ID captured: $CapturedPreDeployBackupId" -ForegroundColor Green
    } else {
        throw "CRITICAL SECURITY FAILURE: Pre-deployment backup ran but could not capture BACKUP_CREATED_ID from stdout output. Output: $backupLogCombined"
    }

    # Step 1.5: Bind host manifest path strictly to the captured backupId
    [string]$HostLocalBackupDir = Join-Path $WorkspaceRoot "backups\local"
    [string]$ExpectedManifestFile = "gms_${CapturedPreDeployBackupId.Replace('BKP-', '')}_manifest.json"
    [string]$ExactHostManifest = Join-Path $HostLocalBackupDir $ExpectedManifestFile

    if (Test-Path -Path $ExactHostManifest -PathType Leaf) {
        $CapturedManifestPath = $ExactHostManifest
    } else {
        # Fallback: check latest-predeploy.json pointer
        [string]$latestPointer = Join-Path $HostLocalBackupDir "latest-predeploy.json"
        if (Test-Path -Path $latestPointer -PathType Leaf) {
            try {
                $ptrObj = Get-Content -Path $latestPointer -Raw | ConvertFrom-Json
                if ($ptrObj.manifestFile) {
                    [string]$cand2 = Join-Path $HostLocalBackupDir $ptrObj.manifestFile
                    if (Test-Path -Path $cand2 -PathType Leaf) {
                        $CapturedManifestPath = $cand2
                        $CapturedPreDeployBackupId = $ptrObj.backupId
                    }
                }
            } catch {}
        }
    }

    if (-not $CapturedManifestPath -and ($backupLogCombined -match "Backup Created:\s*(BKP-[^\s\r\n]+)")) {
        $CapturedPreDeployBackupId = $Matches[1].Trim()
        [string]$candManifest = Join-Path $HostLocalBackupDir "gms_${CapturedPreDeployBackupId.Replace('BKP-', '')}_manifest.json"
        if (Test-Path -Path $candManifest -PathType Leaf) {
            $CapturedManifestPath = $candManifest
        }
    }

    if ($CapturedManifestPath -and (Test-Path -Path $CapturedManifestPath -PathType Leaf)) {
        # Strict validation: verify manifest backupId matches captured ID
        try {
            $parsedMan = Get-Content -Path $CapturedManifestPath -Raw | ConvertFrom-Json
            if ($parsedMan.backupId -ne $CapturedPreDeployBackupId) {
                throw "Pre-deployment manifest backupId mismatch! Expected: $CapturedPreDeployBackupId, Found: $($parsedMan.backupId)"
            }
        } catch {
            throw "Failed parsing pre-deployment backup manifest: $_"
        }
        Write-Host "[GMS Deploy] Pre-deployment backup manifest bound and confirmed on host: $CapturedManifestPath ($CapturedPreDeployBackupId)" -ForegroundColor Green
    } else {
        throw "CRITICAL PREFLIGHT FAILURE: Pre-deployment backup was created, but manifest file ($CapturedManifestPath) could not be bound/located on host storage ($HostLocalBackupDir). Aborting deployment before migration."
    }

    if ($FaultInjectionPhase -eq "AFTER_BACKUP" -or $env:GMS_FAULT_INJECTION_PHASE -eq "AFTER_BACKUP") {
        throw "INJECTED_FAULT_AFTER_BACKUP: Simulated failure immediately after backup creation."
    }

    # Step 1.6: Run database preflight duplicate audit
    Write-Host "[GMS Preflight] Running database preflight duplicate audit..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env run --rm migrator npm run prisma:preflight -- --report-only --fail-on-duplicates
    if ($LASTEXITCODE -ne 0) { throw "Database preflight duplicate audit failed with exit code $LASTEXITCODE." }

    # Step 1.7: Execute forward database migration (Setting MigrationStarted = true right here)
    Write-Host "[GMS Migration] Applying Prisma database migrations forward (Target Release: $TargetReleaseTag)..." -ForegroundColor Cyan
    $MigrationStarted = $true

    & docker compose -f $ComposeFile --env-file backend\.env run --rm migrator npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma database migration deployment failed with exit code $LASTEXITCODE."
    }
    Write-Host "[GMS Migration] Database migrations deployed successfully." -ForegroundColor Green

    if ($FaultInjectionPhase -eq "AFTER_MIGRATION" -or $env:GMS_FAULT_INJECTION_PHASE -eq "AFTER_MIGRATION") {
        throw "INJECTED_FAULT_AFTER_MIGRATION: Simulated failure immediately after forward database migration."
    }

    Write-Host "[GMS Deploy] Booting containers for release [$TargetReleaseTag] (--no-build)..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
    if ($LASTEXITCODE -ne 0) { throw "Docker compose up terminated with error code $LASTEXITCODE." }

    if ($FaultInjectionPhase -eq "AFTER_CONTAINER_SWITCH" -or $env:GMS_FAULT_INJECTION_PHASE -eq "AFTER_CONTAINER_SWITCH") {
        throw "INJECTED_FAULT_AFTER_CONTAINER_SWITCH: Simulated failure immediately after container switch."
    }

    if ($FaultInjectionPhase -eq "BEFORE_WATCHDOG" -or $env:GMS_FAULT_INJECTION_PHASE -eq "BEFORE_WATCHDOG") {
        throw "INJECTED_FAULT_BEFORE_WATCHDOG: Simulated failure before healthcheck watchdog execution."
    }

    # Step 2: Execute automated health watchdog check
    Write-Host "[GMS Deploy] Verifying post-deployment service health via watchdog..." -ForegroundColor Cyan
    $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
    & $PsExe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile -RequireNginx:$EffectiveRequireNginx
    if ($LASTEXITCODE -ne 0) { throw "Health check verification failed during post-deploy watchdog test." }

    Write-Host "[GMS Deploy] SUCCESS! Release [$TargetReleaseTag] successfully deployed and verified healthy." -ForegroundColor Green

    # Record release tag and manifests
    $TargetReleaseTag | Out-File -FilePath (Join-Path $WorkspaceRoot "deploy\current_release.txt") -Force -Encoding utf8

    [string]$ReleasesDir = Join-Path $WorkspaceRoot "deploy\releases"
    if (-not (Test-Path -Path $ReleasesDir -PathType Container)) {
        New-Item -Path $ReleasesDir -ItemType Directory -Force | Out-Null
    }

    [string]$PreDeployBackupId = if ($CapturedPreDeployBackupId -ne "NONE") {
        $CapturedPreDeployBackupId
    } else {
        [string[]]$BackupSearchDirs = @(
            (Join-Path $WorkspaceRoot "backups\local"),
            (Join-Path $WorkspaceRoot "deploy\backups"),
            (Join-Path $WorkspaceRoot "backups")
        )
        [string]$LatestBackupManifest = $null
        foreach ($bDir in $BackupSearchDirs) {
            if (Test-Path -Path $bDir -PathType Container) {
                $manifestCandidate = Get-ChildItem -Path $bDir -Filter "*_manifest.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
                if ($manifestCandidate) {
                    $LatestBackupManifest = $manifestCandidate
                    break
                }
            }
        }
        if ($LatestBackupManifest) {
            try { (Get-Content -Path $LatestBackupManifest -Raw | ConvertFrom-Json).backupId } catch { "UNKNOWN" }
        } else { "NONE" }
    }

    $ReleaseManifest = @{
        release = $TargetReleaseTag
        gitSha = $TargetReleaseTag
        schemaVersion = "1.0.0"
        migrationChecksumsVerified = $true
        preDeployBackupId = $PreDeployBackupId
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        backend = @{
            image = "gms-backend"
            digest = $BackendDigest
        }
        frontend = @{
            image = "gms-frontend"
            digest = $FrontendDigest
        }
        previousRelease = @{
            tag = $PreviousReleaseTag
            backend = @{ digest = $PreviousBackendDigest }
            frontend = @{ digest = $PreviousFrontendDigest }
        }
    }
    [string]$ManifestJson = $ReleaseManifest | ConvertTo-Json -Depth 5
    Set-Content -Path (Join-Path $WorkspaceRoot "deploy\release_manifest.json") -Value $ManifestJson -Encoding utf8
    Set-Content -Path (Join-Path $ReleasesDir "${TargetReleaseTag}.json") -Value $ManifestJson -Encoding utf8

    exit 0
}
catch {
    Write-Host "[GMS DEPLOYMENT FAILED] Error detected: $_" -ForegroundColor Red
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -CompFile $ComposeFile -IsStrictProd $IsProductionMode -RollbackManifestPath $CapturedManifestPath -RequireDbRollback $MigrationStarted -EnforceNginx $EffectiveRequireNginx
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover during rollback to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }

    exit 1
}
