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
    [Parameter(Mandatory=$false)]
    [string]$TargetReleaseTag = "",

    [Parameter(Mandatory=$false)]
    [string]$SmokeAccessToken = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousReleaseTag = "stable",

    [Parameter(Mandatory=$false)]
    [string]$BackendRepository = "ghcr.io/rahmatauliya10/gms-backend",

    [Parameter(Mandatory=$false)]
    [string]$FrontendRepository = "ghcr.io/rahmatauliya10/gms-frontend",

    [Parameter(Mandatory=$false)]
    [string]$MigratorRepository = "ghcr.io/rahmatauliya10/gms-backend-migrator",

    [Parameter(Mandatory=$false)]
    [string]$BackendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$FrontendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$MigratorDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousBackendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousFrontendDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousMigratorDigest = "",

    [Parameter(Mandatory=$false)]
    [string]$TargetManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$PreviousReleaseManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$RollbackManifestPath = "",

    [Parameter(Mandatory=$false)]
    [string]$ComposeFile = "docker-compose.prod.yml",

    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "aplikasigatemanagementsystem",

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

if (-not $RollbackOnly -and [string]::IsNullOrWhiteSpace($TargetReleaseTag)) {
    throw "Parameter -TargetReleaseTag is required for normal deployment mode. For rollback mode, specify -RollbackOnly."
}

if ($TargetReleaseTag -and $TargetReleaseTag -notmatch '^[a-zA-Z0-9_\.\-]+$') {
    throw "Invalid -TargetReleaseTag: [$TargetReleaseTag]. Must contain only alphanumeric, dot, underscore, or hyphen characters."
}

if ($SmokeAccessToken -and -not $env:SMOKE_ACCESS_TOKEN) {
    $env:SMOKE_ACCESS_TOKEN = $SmokeAccessToken
}

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $WorkspaceRoot
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

function Verify-Image-Digest {
    param(
        [string]$ImageRepo,
        [string]$ExpectedDigest
    )
    if (-not $ExpectedDigest) { return $true }
    
    # Check RepoDigests across inspect metadata (matches exact repo@sha256:...)
    [string]$inspectDigests = (& docker inspect --format="{{range .RepoDigests}}{{.}} {{end}}" "$ImageRepo" 2>$null).ToString().Trim()
    if ($inspectDigests -and ($inspectDigests -match [regex]::Escape($ExpectedDigest))) {
        return $true
    }
    
    # Fallback to checking docker images output matching exact repository name and digest
    [string[]]$foundLines = & docker images --digests --format "{{.Repository}}@{{.Digest}}" 2>$null
    if ($foundLines) {
        foreach ($line in $foundLines) {
            if ($line -match [regex]::Escape($ExpectedDigest) -and ($line.StartsWith($ImageRepo) -or $line.Contains($ImageRepo))) {
                return $true
            }
        }
    }

    Write-Host "[GMS IMMUTABILITY FAILURE] Image [$ImageRepo] exact RepoDigest mismatch or image not found! Expected: $ExpectedDigest" -ForegroundColor Red
    return $false
}

function Verify-Image-Exists {
    param(
        [string]$Tag,
        [string]$BackendDig = "",
        [string]$FrontendDig = "",
        [string]$MigratorDig = "",
        [string]$BackendRepo = $BackendRepository,
        [string]$FrontendRepo = $FrontendRepository,
        [string]$MigratorRepo = $MigratorRepository
    )
    if ($BackendDig -or $FrontendDig -or $MigratorDig) {
        $backendOk = if ($BackendDig) { Verify-Image-Digest -ImageRepo "$BackendRepo" -ExpectedDigest $BackendDig } else { $false }
        $frontendOk = if ($FrontendDig) { Verify-Image-Digest -ImageRepo "$FrontendRepo" -ExpectedDigest $FrontendDig } else { $false }
        $migratorOk = if ($MigratorDig) { Verify-Image-Digest -ImageRepo "$MigratorRepo" -ExpectedDigest $MigratorDig } else { $false }
        return ($backendOk -and $frontendOk -and $migratorOk)
    }
    $backendImg = & docker images -q "${BackendRepo}:$Tag" 2>$null
    $frontendImg = & docker images -q "${FrontendRepo}:$Tag" 2>$null
    $migratorImg = & docker images -q "${MigratorRepo}:$Tag" 2>$null
    return ((-not [string]::IsNullOrWhiteSpace($backendImg)) -and (-not [string]::IsNullOrWhiteSpace($frontendImg)) -and (-not [string]::IsNullOrWhiteSpace($migratorImg)))
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
        if (-not $MigratorDigest -and $ManifestObj.migrator) {
            $MigratorDigest = if ($ManifestObj.migrator.digest) { $ManifestObj.migrator.digest } else { $ManifestObj.migrator.ciLocalImageId }
        }
        if (-not $PreviousBackendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.backend) {
            $PreviousBackendDigest = if ($ManifestObj.previousRelease.backend.digest) { $ManifestObj.previousRelease.backend.digest } else { $ManifestObj.previousRelease.backend.ciLocalImageId }
        }
        if (-not $PreviousFrontendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.frontend) {
            $PreviousFrontendDigest = if ($ManifestObj.previousRelease.frontend.digest) { $ManifestObj.previousRelease.frontend.digest } else { $ManifestObj.previousRelease.frontend.ciLocalImageId }
        }
        if (-not $PreviousMigratorDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.migrator) {
            $PreviousMigratorDigest = if ($ManifestObj.previousRelease.migrator.digest) { $ManifestObj.previousRelease.migrator.digest } else { $ManifestObj.previousRelease.migrator.ciLocalImageId }
        }
    } catch {}
}

[bool]$script:DbRestoreExecuted = $false
[string]$MaintDir = Join-Path $WorkspaceRoot "maintenance"
[string]$MaintActive = Join-Path $MaintDir "active"

function Assert-StrictSmokeGate {
    param(
        [string]$PhaseTitle = "Post-Deployment"
    )
    [string]$SmokeScript = Join-Path $PSScriptRoot "prod-smoke-readonly.js"
    [string]$SmokeEvidenceFile = Join-Path $WorkspaceRoot "artifacts\release-proof\prod-smoke-evidence.json"

    if (-not (Test-Path $SmokeScript)) {
        throw "CRITICAL RELEASE GATE BLOCKED: Smoke verification script '$SmokeScript' is missing. Cannot verify system health."
    }

    Write-Host "[GMS RELEASE GATE] Executing $PhaseTitle non-mutating strict smoke verification (--require-passed)..." -ForegroundColor Cyan
    if (Test-Path $SmokeEvidenceFile) {
        Remove-Item $SmokeEvidenceFile -Force -ErrorAction SilentlyContinue
    }

    & node $SmokeScript --require-passed
    [int]$smokeExit = $LASTEXITCODE
    if ($smokeExit -ne 0) {
        throw "$PhaseTitle smoke verification FAILED with exit code $smokeExit! Traffic remains frozen in maintenance mode."
    }

    # Strictly require proven PASSED verdict from evidence artifact
    if (-not (Test-Path $SmokeEvidenceFile)) {
        throw "CRITICAL RELEASE GATE BLOCKED: Smoke test exited 0 but evidence artifact was not generated at $SmokeEvidenceFile. Traffic cannot be unfrozen without verified proof."
    }

    try {
        $smokeEvidenceObj = Get-Content $SmokeEvidenceFile -Raw | ConvertFrom-Json
        if ($smokeEvidenceObj.overallVerdict -ne "PASSED") {
            throw "CRITICAL RELEASE GATE BLOCKED: Smoke evidence verdict is '$($smokeEvidenceObj.overallVerdict)', NOT 'PASSED'. Traffic remains strictly frozen in maintenance mode."
        }
        Write-Host "  [PASS] $PhaseTitle smoke test verdict verified PASSED (100% of required & authenticated probes)." -ForegroundColor Green
        return $true
    } catch {
        throw "CRITICAL RELEASE GATE BLOCKED: Failed validating smoke test evidence verdict: $_"
    }
}

function Execute-Rollback {
    param(
        [string]$PrevTag,
        [string]$PrevBackendDig,
        [string]$PrevFrontendDig,
        [string]$PrevMigratorDig,
        [string]$CompFile,
        [string]$ProjName = "aplikasigatemanagementsystem",
        [bool]$IsStrictProd = $false,
        [string]$RollbackManifestPath = "",
        [bool]$RequireDbRollback = $false,
        [bool]$EnforceNginx = $false,
        [string]$BackendRepo = $BackendRepository,
        [string]$FrontendRepo = $FrontendRepository,
        [string]$MigratorRepo = $MigratorRepository
    )
    Write-Host "[GMS AUTOMATED ROLLBACK] Initiating schema-aware coordinated rollback sequence to previous stable release tag: [$PrevTag]..." -ForegroundColor Magenta

    # --------------------------------------------------------------------------
    # GMS SINGLE RECOVERY ORCHESTRATOR (PHASED EXECUTION - P1-03)
    # --------------------------------------------------------------------------
    # Phase 1: PRECHECK
    Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: PRECHECK] Validating rollback prerequisites and image digests..." -ForegroundColor Magenta
    if ($IsStrictProd -or $RequireDigest) {
        if (-not $PrevBackendDig -or -not $PrevFrontendDig -or -not $PrevMigratorDig) {
            throw "[GMS IMMUTABILITY VIOLATION] Rollback aborted! Production rollback requires explicit SHA-256 digests for ALL previous images (PreviousBackendDigest, PreviousFrontendDigest, and PreviousMigratorDigest). Refusing to fall back to unverified tags."
        }
        if ($PrevBackendDig -notmatch '^sha256:[a-fA-F0-9]{64}$' -or
            $PrevFrontendDig -notmatch '^sha256:[a-fA-F0-9]{64}$' -or
            $PrevMigratorDig -notmatch '^sha256:[a-fA-F0-9]{64}$'
        ) {
            throw "[GMS IMMUTABILITY VIOLATION] Rollback aborted! Production rollback requires valid 64-hex SHA-256 digests (format 'sha256:<64 hex chars>') for ALL previous images. Invalid digest format rejected."
        }
    }

    # Phase 2: FREEZE & WRITER SHUTDOWN
    Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: FREEZE] Freezing ingress traffic and stopping data writer containers..." -ForegroundColor Magenta
    if (-not (Test-Path -Path $MaintDir -PathType Container)) {
        New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
    }
    Set-Content -Path $MaintActive -Value "MAINTENANCE_ACTIVE_ROLLBACK" -Encoding utf8
    Set-Content -Path (Join-Path $WorkspaceRoot "maintenance.flag") -Value "MAINTENANCE_ACTIVE_ROLLBACK" -Encoding utf8

    # Stop writer services before any database restoration
    Write-Host "  Stopping backend and migrator containers to ensure zero in-flight database mutations..." -ForegroundColor Cyan
    $stopOut = & docker compose -p $ProjName -f $CompFile stop backend migrator 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] docker compose stop reported non-zero ($LASTEXITCODE): $stopOut" -ForegroundColor Yellow
    }
    $runningWriters = (& docker compose -p $ProjName -f $CompFile ps --services --filter "status=running" 2>$null | Where-Object { $_ -match '^(backend|migrator)$' })
    if ($runningWriters) {
        Write-Host "  [WARN] Writer services ($($runningWriters -join ', ')) still reported as running. Enforcing kill..." -ForegroundColor Yellow
        & docker compose -p $ProjName -f $CompFile kill backend migrator 2>&1 | Out-Null
    }

    [bool]$RollbackSucceeded = $false
    [bool]$SmokePassedVerdictProven = $false

    try {
        # Phase 3: RESTORE_REQUIRED / RESTORE_DONE (EXACTLY ONCE)
        if ($RequireDbRollback -or ($RollbackManifestPath -and (Test-Path -Path $RollbackManifestPath -PathType Leaf))) {
            if ($script:DbRestoreExecuted) {
                throw "[CRITICAL RECOVERY VIOLATION] Duplicate database restore rejected! A restore operation has already been executed in this recovery sequence."
            }
            if (-not $RollbackManifestPath -or -not (Test-Path -Path $RollbackManifestPath -PathType Leaf)) {
                throw "[CRITICAL ROLLBACK FAILURE] Pre-deployment backup manifest ($RollbackManifestPath) was not found on host storage! Cannot perform safe rollback without DB restoration. Traffic remains frozen in maintenance mode."
            }

            Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: RESTORE_REQUIRED] Executing single authoritative database & attachment restore via operator plane ($RollbackManifestPath)..." -ForegroundColor Yellow
            $RestoreScript = Join-Path $PSScriptRoot "gms-production-restore.ps1"
            & $PsExe -ExecutionPolicy Bypass -File $RestoreScript -ManifestPath $RollbackManifestPath -Force -PreserveMaintenanceFlag -ManagedByOrchestrator
            if ($LASTEXITCODE -ne 0) {
                throw "[CRITICAL ROLLBACK FAILURE] Coordinated database restore failed with exit code $LASTEXITCODE during rollback! Refusing to boot old application on unverified schema."
            }
            $script:DbRestoreExecuted = $true
            Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: RESTORE_DONE] Authoritative single database restore completed successfully." -ForegroundColor Green
        } else {
            Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: RESTORE_SKIPPED] Image-only rollback verified; schema restoration not required." -ForegroundColor Cyan
        }

        # Phase 4: IMAGE_SWITCH
        Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: IMAGE_SWITCH] Switching stack to previous stable image digests..." -ForegroundColor Magenta
        $env:RELEASE_TAG = $PrevTag
        $env:BACKEND_IMAGE = if ($PrevBackendDig) { "${BackendRepo}@$PrevBackendDig" } else { "${BackendRepo}:$PrevTag" }
        $env:FRONTEND_IMAGE = if ($PrevFrontendDig) { "${FrontendRepo}@$PrevFrontendDig" } else { "${FrontendRepo}:$PrevTag" }
        $env:MIGRATOR_IMAGE = if ($PrevMigratorDig) { "${MigratorRepo}@$PrevMigratorDig" } else { "${MigratorRepo}:$PrevTag" }

        if (-not (Verify-Image-Exists -Tag $PrevTag -BackendDig $PrevBackendDig -FrontendDig $PrevFrontendDig -MigratorDig $PrevMigratorDig -BackendRepo $BackendRepo -FrontendRepo $FrontendRepo -MigratorRepo $MigratorRepo)) {
            throw "Previous release image set [${BackendRepo}:$PrevTag, ${FrontendRepo}:$PrevTag, ${MigratorRepo}:$PrevTag] does not exist locally. Cannot perform safe rollback."
        }

        Write-Host "[GMS RECOVERY ORCHESTRATOR] Booting previous stable release containers ($env:BACKEND_IMAGE, $env:FRONTEND_IMAGE)..." -ForegroundColor Cyan
        & docker compose -p $ProjName -f $CompFile --env-file backend\.env up -d --no-build --remove-orphans
        if ($LASTEXITCODE -ne 0) { throw "Rollback container startup failed with exit code $LASTEXITCODE." }

        # Phase 5: HEALTH_VERIFIED
        Write-Host "[GMS RECOVERY ORCHESTRATOR - PHASE: HEALTH_VERIFIED] Running watchdog and production-safe read-only smoke verification..." -ForegroundColor Magenta
        $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
        & $PsExe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $CompFile -RequireNginx:$EnforceNginx -ProjectName $ProjName
        if ($LASTEXITCODE -ne 0) { throw "Rollback health check verification failed during post-deploy watchdog test." }

        # Execute read-only smoke test via unified gate
        $SmokePassedVerdictProven = Assert-StrictSmokeGate -PhaseTitle "Post-Rollback"
        $RollbackSucceeded = [bool]$SmokePassedVerdictProven
        Write-Host "[GMS RECOVERY ORCHESTRATOR - COMPLETED] Production environment successfully rolled back and restored to stable release [$PrevTag] with 100% verified health." -ForegroundColor Green
    } finally {
        if ($RollbackSucceeded -and $SmokePassedVerdictProven) {
            Write-Host "  Deactivating maintenance freeze; opening traffic..." -ForegroundColor Green
            if (Test-Path -Path $MaintActive) {
                Remove-Item -Path $MaintActive -Force -ErrorAction SilentlyContinue
            }
            if (Test-Path -Path (Join-Path $WorkspaceRoot "maintenance.flag")) {
                Remove-Item -Path (Join-Path $WorkspaceRoot "maintenance.flag") -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-Host "[GMS CRITICAL ALERT] Rollback failed, incomplete, or smoke verdict not PASSED! Maintenance flag ($MaintActive) retained to freeze write traffic and protect system integrity." -ForegroundColor Red
        }
    }
}

[bool]$IsProductionMode = [bool]($RequireDigest -or ($ComposeFile -like "*prod*"))
[bool]$EffectiveRequireNginx = if ($PSBoundParameters.ContainsKey('RequireNginx')) { [bool]$RequireNginx } else { $IsProductionMode }

# STRICT PRODUCTION FAULT INJECTION GUARD (FAIL-CLOSED: ZERO PRODUCTION OVERRIDES)
[string]$EffectiveDeployFault = if ($FaultInjectionPhase) { $FaultInjectionPhase } else { $env:GMS_FAULT_INJECTION_PHASE }
if (-not [string]::IsNullOrWhiteSpace($EffectiveDeployFault)) {
    if ($IsProductionMode -or $ComposeFile -like "*prod*" -or $ProjectName -like "*prod*") {
        throw "[CRITICAL GOVERNANCE VIOLATION] Fault injection (-FaultInjectionPhase '$EffectiveDeployFault') is unconditionally blocked on production deployments. Zero overrides permitted on production."
    }
}

if ($RollbackOnly) {
    if (-not $RollbackManifestPath -and -not $NoSchemaChangeVerified) {
        throw "[GMS GOVERNANCE VIOLATION] -RollbackOnly requires either an explicit -RollbackManifestPath to restore the database to a verified pre-migration state, or -NoSchemaChangeVerified with proven previous migration inventory match."
    }
    if (-not $RollbackManifestPath -and $NoSchemaChangeVerified) {
        Write-Host "[GMS Rollback Guard] -NoSchemaChangeVerified specified for image-only rollback. Verifying exact database schema compatibility against previous release manifest..." -ForegroundColor Cyan
        
        # 1. Resolve previous release manifest to get authoritative migration inventory (Fail-Closed)
        [string]$PrevManifestPath = ""
        if ($PreviousReleaseManifestPath -and (Test-Path $PreviousReleaseManifestPath)) {
            $PrevManifestPath = $PreviousReleaseManifestPath
        } elseif ($TargetManifestPath -and (Test-Path $TargetManifestPath)) {
            try {
                $targetMan = Get-Content $TargetManifestPath -Raw | ConvertFrom-Json
                if ($targetMan.PSObject.Properties['previousReleaseManifest'] -and $targetMan.previousReleaseManifest -and (Test-Path $targetMan.previousReleaseManifest)) {
                    $PrevManifestPath = $targetMan.previousReleaseManifest
                }
            } catch {}
        }
        if (-not $PrevManifestPath) {
            [string]$candidatePrev = Join-Path $WorkspaceRoot "deploy\releases\${PreviousReleaseTag}.json"
            if (Test-Path $candidatePrev) {
                $PrevManifestPath = $candidatePrev
            } else {
                [string]$stableManifest = Join-Path $WorkspaceRoot "deploy\releases\stable.json"
                if (Test-Path $stableManifest) {
                    $PrevManifestPath = $stableManifest
                }
            }
        }

        # FAIL-CLOSED: A valid previous release manifest is MANDATORY
        if (-not $PrevManifestPath -or -not (Test-Path $PrevManifestPath)) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Previous release manifest was not found. An authoritative previous release manifest with an explicit migration inventory is MANDATORY when using -NoSchemaChangeVerified. Full database recovery via -RollbackManifestPath is required."
        }

        # 2. Extract expected migrations and checksums from manifest
        Write-Host "  Loading authoritative migration inventory from previous manifest: $PrevManifestPath" -ForegroundColor Cyan
        $prevManObj = Get-Content $PrevManifestPath -Raw | ConvertFrom-Json
        [string[]]$expectedMigrations = @()
        $expectedChecksumMap = @{}

        $invProp = $prevManObj.PSObject.Properties['migrationInventory']
        $migsProp = $prevManObj.PSObject.Properties['migrations']

        if ($invProp -and $invProp.Value) {
            foreach ($item in $invProp.Value) {
                $name = if ($item.PSObject.Properties['migration_name'] -and $item.migration_name) { [string]$item.migration_name } elseif ($item.PSObject.Properties['name'] -and $item.name) { [string]$item.name } else { "" }
                if ($name) {
                    $expectedMigrations += $name
                    $ck = if ($item.PSObject.Properties['checksum'] -and $item.checksum) { [string]$item.checksum } elseif ($item.PSObject.Properties['migration_checksum'] -and $item.migration_checksum) { [string]$item.migration_checksum } else { "" }
                    if ($ck) { $expectedChecksumMap[$name] = $ck.Trim().ToLower() }
                }
            }
        } elseif ($migsProp -and $migsProp.Value) {
            foreach ($item in $migsProp.Value) {
                if ($item -is [string]) {
                    $expectedMigrations += [string]$item
                } elseif ($item.PSObject.Properties['migration_name'] -and $item.migration_name) {
                    $name = [string]$item.migration_name
                    $expectedMigrations += $name
                    if ($item.PSObject.Properties['checksum'] -and $item.checksum) { $expectedChecksumMap[$name] = [string]$item.checksum.ToString().Trim().ToLower() }
                } elseif ($item.PSObject.Properties['name'] -and $item.name) {
                    $name = [string]$item.name
                    $expectedMigrations += $name
                    if ($item.PSObject.Properties['checksum'] -and $item.checksum) { $expectedChecksumMap[$name] = [string]$item.checksum.ToString().Trim().ToLower() }
                }
            }
        }

        if ($expectedMigrations.Count -eq 0) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Previous release manifest at '$PrevManifestPath' does not contain an explicit migration inventory list ('migrationInventory' missing or empty). Cannot verify schema compatibility without migration records. Full database recovery via -RollbackManifestPath is MANDATORY."
        }

        # FAIL-CLOSED: Every single migration in manifest MUST have a valid 64-char hex SHA-256 checksum
        foreach ($mName in $expectedMigrations) {
            if (-not $expectedChecksumMap.ContainsKey($mName) -or [string]::IsNullOrWhiteSpace($expectedChecksumMap[$mName])) {
                throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Migration '$mName' in previous release manifest at '$PrevManifestPath' is missing an explicit checksum. Incomplete checksums are strictly prohibited for image-only rollback. Full database recovery via -RollbackManifestPath is MANDATORY."
            }
            if ($expectedChecksumMap[$mName] -notmatch '^[a-fA-F0-9]{64}$') {
                throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Migration '$mName' in manifest at '$PrevManifestPath' has invalid checksum format '$($expectedChecksumMap[$mName])' (expected 64-hex SHA-256). Full database recovery via -RollbackManifestPath is MANDATORY."
            }
        }

        # 3. Query live database applied migrations and checksums
        $livePg = (& docker ps -q -f "name=gate-system-postgres" 2>$null).ToString().Trim()
        if (-not $livePg) {
            throw "[CRITICAL SCHEMA CHECK FAILED] Target database container [gate-system-postgres] is not running. Cannot verify schema compatibility for image-only rollback."
        }

        [string]$appliedRaw = (& docker exec gate-system-postgres psql -t -A -U postgres -d gms -c "SELECT migration_name || '|' || COALESCE(checksum, '') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL ORDER BY started_at ASC;" 2>$null).ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($appliedRaw)) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Target live database contains 0 applied migrations or _prisma_migrations is unreadable."
        }

        [string[]]$appliedLines = $appliedRaw -split "`r?`n"
        [string[]]$appliedMigrations = @()
        $appliedChecksumMap = @{}

        foreach ($line in $appliedLines) {
            if ($line.Contains("|")) {
                $parts = $line.Split("|")
                $mName = $parts[0].Trim()
                $mHash = $parts[1].Trim().ToLower()
                $appliedMigrations += $mName
                $appliedChecksumMap[$mName] = $mHash
            } else {
                $mName = $line.Trim()
                if ($mName) {
                    $appliedMigrations += $mName
                    $appliedChecksumMap[$mName] = ""
                }
            }
        }

        # FAIL-CLOSED: Every applied migration in live database MUST have a valid 64-char hex checksum in _prisma_migrations
        foreach ($mName in $appliedMigrations) {
            $actHash = if ($appliedChecksumMap.ContainsKey($mName)) { $appliedChecksumMap[$mName] } else { "" }
            if ([string]::IsNullOrWhiteSpace($actHash) -or $actHash -notmatch '^[a-fA-F0-9]{64}$') {
                throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED (Fail-Closed)! Applied migration '$mName' in live database does not have a valid checksum in _prisma_migrations ('$actHash'). Full database recovery via -RollbackManifestPath is MANDATORY."
            }
        }

        # Check for forward migrations applied in live DB that previous release does not know about
        [string[]]$unaccountedMigrations = $appliedMigrations | Where-Object { $expectedMigrations -notcontains $_ }
        if ($unaccountedMigrations.Count -gt 0) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED! Live database contains $($unaccountedMigrations.Count) forward migration(s) not present in previous release manifest [$($unaccountedMigrations -join ', ')]. Old container image is NOT compatible with forward-migrated schema. Full database recovery via -RollbackManifestPath is MANDATORY."
        }

        # Check for missing migrations required by previous release
        [string[]]$missingInLive = $expectedMigrations | Where-Object { $appliedMigrations -notcontains $_ }
        if ($missingInLive.Count -gt 0) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED! Live database is missing $($missingInLive.Count) migration(s) expected by previous release manifest [$($missingInLive -join ', ')]. Full database recovery via -RollbackManifestPath is MANDATORY."
        }

        # Check checksums for all migrations: every expected migration must match live database checksum 100%
        [int]$checksumsVerified = 0
        foreach ($mName in $expectedMigrations) {
            $expectedCk = $expectedChecksumMap[$mName]
            $actualCk = if ($appliedChecksumMap.ContainsKey($mName)) { $appliedChecksumMap[$mName] } else { "" }
            if ($expectedCk -ne $actualCk) {
                throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Image-only rollback REJECTED! Migration checksum mismatch detected for migration '$mName' (Live: $actualCk, Manifest: $expectedCk). Schema drift or altered migration detected. Full database recovery via -RollbackManifestPath is MANDATORY."
            }
            $checksumsVerified++
        }

        if ($checksumsVerified -ne $expectedMigrations.Count -or $expectedMigrations.Count -ne $appliedMigrations.Count) {
            throw "[CRITICAL SCHEMA COMPATIBILITY VIOLATION] Incomplete checksum validation: verified $checksumsVerified of $($expectedMigrations.Count) expected migrations against $($appliedMigrations.Count) applied migrations. Full database recovery via -RollbackManifestPath is MANDATORY."
        }

        Write-Host "  [PASS] Exact migration inventory matches previous release ($($appliedMigrations.Count) migrations verified, $checksumsVerified checksums verified 100% identical)." -ForegroundColor Green
    }
    [bool]$dbRollbackRequired = [bool](-not [string]::IsNullOrWhiteSpace($RollbackManifestPath))
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -PrevMigratorDig $PreviousMigratorDigest -CompFile $ComposeFile -ProjName $ProjectName -IsStrictProd $IsProductionMode -RollbackManifestPath $RollbackManifestPath -RequireDbRollback $dbRollbackRequired -EnforceNginx $EffectiveRequireNginx -BackendRepo $BackendRepository -FrontendRepo $FrontendRepository -MigratorRepo $MigratorRepository
        exit 0
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover during rollback to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }
}

# If still missing, inspect local image digest if available
if (-not $BackendDigest) {
    try {
        [string]$inspectBackend = (& docker inspect --format="{{index .RepoDigests 0}}" "${BackendRepository}:$TargetReleaseTag" 2>&1 | Out-String).Trim()
        if ($inspectBackend -and $inspectBackend.Contains("@")) {
            $BackendDigest = $inspectBackend.Split("@")[1]
        }
    } catch {}
}
if (-not $FrontendDigest) {
    try {
        [string]$inspectFrontend = (& docker inspect --format="{{index .RepoDigests 0}}" "${FrontendRepository}:$TargetReleaseTag" 2>&1 | Out-String).Trim()
        if ($inspectFrontend -and $inspectFrontend.Contains("@")) {
            $FrontendDigest = $inspectFrontend.Split("@")[1]
        }
    } catch {}
}
if (-not $MigratorDigest) {
    try {
        [string]$inspectMigrator = (& docker inspect --format="{{index .RepoDigests 0}}" "${MigratorRepository}:$TargetReleaseTag" 2>&1 | Out-String).Trim()
        if ($inspectMigrator -and $inspectMigrator.Contains("@")) {
            $MigratorDigest = $inspectMigrator.Split("@")[1]
        }
    } catch {}
}

# Strict Production Immutability Verification Gate
if ($IsProductionMode) {
    if (-not $BackendDigest -or -not $FrontendDigest -or -not $MigratorDigest) {
        throw "[GMS IMMUTABILITY VIOLATION] Production deployment strictly requires SHA-256 image digests for BackendDigest, FrontendDigest, and MigratorDigest. Tag fallbacks are strictly prohibited for Level 9 production readiness."
    }
}

# Export compose environment variables with fallback tag or digest
$env:RELEASE_TAG = $TargetReleaseTag
$env:BACKEND_IMAGE = if ($BackendDigest) { "${BackendRepository}@$BackendDigest" } else { "${BackendRepository}:$TargetReleaseTag" }
$env:FRONTEND_IMAGE = if ($FrontendDigest) { "${FrontendRepository}@$FrontendDigest" } else { "${FrontendRepository}:$TargetReleaseTag" }
$env:MIGRATOR_IMAGE = if ($MigratorDigest) { "${MigratorRepository}@$MigratorDigest" } else { "${MigratorRepository}:$TargetReleaseTag" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Starting GMS Immutable Deployment Process: Target Release [$TargetReleaseTag]" -ForegroundColor Cyan
Write-Host "Project Name:   $ProjectName" -ForegroundColor Gray
Write-Host "Backend Image:  $env:BACKEND_IMAGE" -ForegroundColor Gray
Write-Host "Frontend Image: $env:FRONTEND_IMAGE" -ForegroundColor Gray
Write-Host "Migrator Image: $env:MIGRATOR_IMAGE" -ForegroundColor Gray
Write-Host "==============================================================================" -ForegroundColor Cyan

[string]$CapturedManifestPath = ""
[string]$CapturedPreDeployBackupId = "NONE"
[bool]$MigrationStarted = $false

try {
    # Step 1.1: Verify target image availability and immutability before altering any services
    Write-Host "[GMS Preflight] Validating image presence and digest immutability..." -ForegroundColor Cyan
    if (-not (Verify-Image-Exists -Tag $TargetReleaseTag -BackendDig $BackendDigest -FrontendDig $FrontendDigest -MigratorDig $MigratorDigest)) {
        throw "Target release image set [gms-backend:$TargetReleaseTag, gms-frontend:$TargetReleaseTag] is not present or digest mismatched. Aborting deploy."
    }

    # Step 1.2: Activate strict write-freeze maintenance gate before pre-deploy backup & migration
    Write-Host "[GMS Deploy - PHASE: FREEZE] Activating maintenance gate and closing ingress write traffic..." -ForegroundColor Magenta
    if (-not (Test-Path -Path $MaintDir -PathType Container)) {
        New-Item -Path $MaintDir -ItemType Directory -Force | Out-Null
    }
    Set-Content -Path $MaintActive -Value "MAINTENANCE_ACTIVE_DEPLOY" -Encoding utf8
    Set-Content -Path (Join-Path $WorkspaceRoot "maintenance.flag") -Value "MAINTENANCE_ACTIVE_DEPLOY" -Encoding utf8

    # Drain and stop backend writers to ensure zero active in-flight database mutations during backup & migration
    Write-Host "[GMS Deploy] Stopping active backend writer services before pre-deploy backup & migration..." -ForegroundColor Cyan
    $stopOut = & docker compose -p $ProjectName -f $ComposeFile stop backend migrator 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to stop database writer services (backend, migrator): $stopOut"
    }

    # Verify no running containers matching writer services
    $runningWriters = (& docker compose -p $ProjectName -f $ComposeFile ps --services --filter "status=running" 2>$null | Where-Object { $_ -match '^(backend|migrator)$' })
    if ($runningWriters) {
        throw "CRITICAL WRITER SHUTDOWN FAILURE: Writer services ($($runningWriters -join ', ')) are still reported as running after stop command."
    }

    # Active transaction drain check prior to backup and migration
    Write-Host "[GMS Preflight] Verifying active transaction drain on PostgreSQL..." -ForegroundColor Cyan
    try {
        $drainSql = "SELECT count(*) FROM pg_stat_activity WHERE datname = 'gms' AND state = 'active' AND pid <> pg_backend_pid();"
        $activeTxRaw = (& docker exec gate-system-postgres psql -t -A -U postgres -d gms -c $drainSql 2>$null | Out-String).Trim()
        [int]$activeTxCount = 0
        if ([int]::TryParse($activeTxRaw, [ref]$activeTxCount) -and $activeTxCount -gt 0) {
            Write-Host "  Waiting for $activeTxCount active client transactions to drain..." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    } catch {
        Write-Host "  Notice: Transaction drain check skipped (PostgreSQL not reachable or not ready yet)." -ForegroundColor DarkGray
    }

    # Step 1.3: Check migration checksums against canonical baseline prior to backup & execution
    Write-Host "[GMS Preflight] Validating migration history checksums and detecting schema drift..." -ForegroundColor Cyan
    & docker compose -p $ProjectName -f $ComposeFile --env-file backend\.env run --rm migrator npm run test:drift
    if ($LASTEXITCODE -ne 0) { throw "Schema migration checksum verification failed with exit code $LASTEXITCODE. Target migrations have drift!" }

    # Step 1.4: Trigger pre-deployment atomic database and attachment backup
    Write-Host "[GMS Preflight] Creating mandatory pre-deployment backup..." -ForegroundColor Cyan
    $PredeployBackupLog = & docker compose -p $ProjectName -f $ComposeFile --env-file backend\.env run --rm migrator node scripts/run-predeploy-backup.js 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Pre-deployment backup script terminated with error code ${LASTEXITCODE}: $PredeployBackupLog"
    }

    # Step 1.5: Strict Extraction of Captured Backup ID from Node.js standard output
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

    # Step 1.6: Bind host manifest path strictly to the captured backupId
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

    # Step 1.7: Run database preflight duplicate audit
    Write-Host "[GMS Preflight] Running database preflight duplicate audit..." -ForegroundColor Cyan
    & docker compose -p $ProjectName -f $ComposeFile --env-file backend\.env run --rm migrator npm run prisma:preflight -- --report-only --fail-on-duplicates
    if ($LASTEXITCODE -ne 0) { throw "Database preflight duplicate audit failed with exit code $LASTEXITCODE." }

    # Step 1.8: Execute forward database migration (Setting MigrationStarted = true right here)
    Write-Host "[GMS Migration] Applying Prisma database migrations forward (Target Release: $TargetReleaseTag)..." -ForegroundColor Cyan
    $MigrationStarted = $true

    & docker compose -p $ProjectName -f $ComposeFile --env-file backend\.env run --rm migrator npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma database migration deployment failed with exit code $LASTEXITCODE."
    }
    Write-Host "[GMS Migration] Database migrations deployed successfully." -ForegroundColor Green

    if ($FaultInjectionPhase -eq "AFTER_MIGRATION" -or $env:GMS_FAULT_INJECTION_PHASE -eq "AFTER_MIGRATION") {
        throw "INJECTED_FAULT_AFTER_MIGRATION: Simulated failure immediately after forward database migration."
    }

    Write-Host "[GMS Deploy] Booting containers for release [$TargetReleaseTag] (--no-build)..." -ForegroundColor Cyan
    & docker compose -p $ProjectName -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
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
    & $PsExe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile -RequireNginx:$EffectiveRequireNginx -ProjectName $ProjectName
    if ($LASTEXITCODE -ne 0) { throw "Health check verification failed during post-deploy watchdog test." }

    # Step 3: Execute strict non-mutating smoke verification gate before releasing maintenance or declaring success
    Write-Host "[GMS Deploy] Verifying post-deployment service health via strict smoke gate..." -ForegroundColor Cyan
    [bool]$DeploySmokePassed = Assert-StrictSmokeGate -PhaseTitle "Normal Deployment"
    if (-not $DeploySmokePassed) {
        throw "CRITICAL RELEASE GATE BLOCKED: Normal deployment smoke test did not produce a verified PASSED verdict."
    }

    # Step 4: Resolve exact source Git SHA from repository or environment (No fallback/hardcoded strings allowed)
    [string]$ExactSourceGitSha = ""
    try {
        $gitOut = (& git rev-parse HEAD 2>$null | Out-String).Trim()
        if ($gitOut -and $gitOut -match '^[a-fA-F0-9]{40}$') {
            $ExactSourceGitSha = $gitOut
        }
    } catch {}
    if (-not $ExactSourceGitSha -and $env:GITHUB_SHA -and $env:GITHUB_SHA -match '^[a-fA-F0-9]{40}$') {
        $ExactSourceGitSha = $env:GITHUB_SHA
    }
    if (-not $ExactSourceGitSha -and $env:GMS_RELEASE_COMMIT_SHA -and $env:GMS_RELEASE_COMMIT_SHA -match '^[a-fA-F0-9]{40}$') {
        $ExactSourceGitSha = $env:GMS_RELEASE_COMMIT_SHA
    }
    if (-not $ExactSourceGitSha -and $TargetReleaseTag -match '^[a-fA-F0-9]{40}$') {
        $ExactSourceGitSha = $TargetReleaseTag
    }
    if (-not $ExactSourceGitSha) {
        # Check existing release manifest for provenance
        [string]$existingManifestPath = Join-Path $WorkspaceRoot "deploy\release_manifest.json"
        if (Test-Path -Path $existingManifestPath) {
            try {
                $existMf = Get-Content -Path $existingManifestPath -Raw | ConvertFrom-Json
                [string]$candSha = if ($existMf.gitSha) { [string]$existMf.gitSha } elseif ($existMf.release) { [string]$existMf.release } else { "" }
                if ($candSha -match '^[a-fA-F0-9]{40}$') {
                    $ExactSourceGitSha = $candSha
                }
            } catch {}
        }
    }
    if (-not $ExactSourceGitSha) {
        throw "CRITICAL PROVENANCE FAILURE: Cannot resolve valid 40-character Git commit SHA for release provenance. Fallback hardcoded SHAs are strictly prohibited."
    }

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

    # Step 5: Query live applied migration inventory for release manifest (FAIL-CLOSED: Checked exit code & non-empty)
    [array]$LiveMigrationInventory = @()
    [string]$invRaw = (& docker exec gate-system-postgres psql -t -A -U postgres -d gms -v ON_ERROR_STOP=1 -c "SELECT migration_name || '|' || COALESCE(checksum, '') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL ORDER BY started_at ASC;" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "[CRITICAL MANIFEST FAILURE] Querying applied migrations from database failed with exit code $LASTEXITCODE. Output: $invRaw"
    }
    if ([string]::IsNullOrWhiteSpace($invRaw)) {
        throw "[CRITICAL MANIFEST FAILURE] Live database reported 0 applied migrations in _prisma_migrations. Cannot produce verified release manifest."
    }

    $invLines = $invRaw -split "`r?`n"
    foreach ($line in $invLines) {
        if ($line.Contains("|")) {
            $p = $line.Split("|")
            [string]$mName = $p[0].Trim()
            [string]$mSum = $p[1].Trim().ToLower()
            if (-not $mName -or -not $mSum -or ($mSum -notmatch '^[a-fA-F0-9]{64}$')) {
                throw "[CRITICAL MANIFEST FAILURE] Migration '$mName' has invalid or missing 64-char SHA-256 checksum: '$mSum'"
            }
            $LiveMigrationInventory += @{ migration_name = $mName; checksum = $mSum }
        }
    }

    if ($LiveMigrationInventory.Count -eq 0) {
        throw "[CRITICAL MANIFEST FAILURE] No valid migration records could be parsed from live database query."
    }

    # Step 6: Construct and atomically write immutable release manifest
    $ReleaseManifest = @{
        release = $TargetReleaseTag
        gitSha = $ExactSourceGitSha
        sourceHeadSha = $ExactSourceGitSha
        schemaVersion = "1.0.0"
        migrationChecksumsVerified = $true
        migrationInventory = $LiveMigrationInventory
        migrations = ($LiveMigrationInventory | ForEach-Object { $_.migration_name })
        preDeployBackupId = $PreDeployBackupId
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        status = "DEPLOYED"
        backend = @{
            image = $BackendRepository
            digest = $BackendDigest
        }
        frontend = @{
            image = $FrontendRepository
            digest = $FrontendDigest
        }
        migrator = @{
            image = $MigratorRepository
            digest = $MigratorDigest
        }
        previousRelease = @{
            tag = $PreviousReleaseTag
            backend = @{ digest = $PreviousBackendDigest }
            frontend = @{ digest = $PreviousFrontendDigest }
            migrator = @{ digest = $PreviousMigratorDigest }
        }
    }
    [string]$ManifestJson = $ReleaseManifest | ConvertTo-Json -Depth 5

    # Atomic write to temporary paths first, then move
    [string]$MainManifestPath = Join-Path $WorkspaceRoot "deploy\release_manifest.json"
    [string]$TmpMainManifest = Join-Path $WorkspaceRoot "deploy\release_manifest.json.tmp"
    Set-Content -Path $TmpMainManifest -Value $ManifestJson -Encoding utf8
    Move-Item -Path $TmpMainManifest -Destination $MainManifestPath -Force

    [string]$VersionedManifestPath = Join-Path $ReleasesDir "${TargetReleaseTag}.json"
    [string]$TmpVersionedManifest = Join-Path $ReleasesDir "${TargetReleaseTag}.json.tmp"
    Set-Content -Path $TmpVersionedManifest -Value $ManifestJson -Encoding utf8
    Move-Item -Path $TmpVersionedManifest -Destination $VersionedManifestPath -Force

    # Atomically update stable.json with the newly verified release record
    [string]$StableManifestPath = Join-Path $ReleasesDir "stable.json"
    [string]$TmpStableManifest = Join-Path $ReleasesDir "stable.json.tmp"
    Set-Content -Path $TmpStableManifest -Value $ManifestJson -Encoding utf8
    Move-Item -Path $TmpStableManifest -Destination $StableManifestPath -Force

    # Record release tag ONLY AFTER all gates, manifests, and strict smoke tests pass
    $TargetReleaseTag | Out-File -FilePath (Join-Path $WorkspaceRoot "deploy\current_release.txt") -Force -Encoding utf8

    # Step 7: Deactivate maintenance write-freeze; open production traffic
    Write-Host "[GMS Deploy] Deactivating maintenance write-freeze; opening production traffic..." -ForegroundColor Green
    if (Test-Path -Path $MaintActive) {
        Remove-Item -Path $MaintActive -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -Path (Join-Path $WorkspaceRoot "maintenance.flag")) {
        Remove-Item -Path (Join-Path $WorkspaceRoot "maintenance.flag") -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[GMS Deploy] SUCCESS! Release [$TargetReleaseTag] (SHA: $ExactSourceGitSha) deployed, verified healthy, and traffic opened." -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "[GMS DEPLOYMENT FAILED] Error detected: $_" -ForegroundColor Red
    Write-Host "[GMS ALERT] Traffic remains frozen in maintenance mode ($MaintActive). Triggering coordinated rollback..." -ForegroundColor Red
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -PrevMigratorDig $PreviousMigratorDigest -CompFile $ComposeFile -ProjName $ProjectName -IsStrictProd $IsProductionMode -RollbackManifestPath $CapturedManifestPath -RequireDbRollback $MigrationStarted -EnforceNginx $EffectiveRequireNginx -BackendRepo $BackendRepository -FrontendRepo $FrontendRepository -MigratorRepo $MigratorRepository
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover during rollback to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }

    exit 1
}
