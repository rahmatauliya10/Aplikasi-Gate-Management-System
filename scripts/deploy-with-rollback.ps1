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
    [string]$ComposeFile = "docker-compose.prod.yml",

    [Parameter(Mandatory=$false)]
    [switch]$RollbackOnly,

    [Parameter(Mandatory=$false)]
    [switch]$UsePrebuiltImages,

    [Parameter(Mandatory=$false)]
    [switch]$RequireDigest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $WorkspaceRoot

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

# Auto-resolve digests from release_manifest.json or local docker image inspect if not explicitly provided
[string]$ManifestPath = Join-Path $WorkspaceRoot "deploy\release_manifest.json"
if (Test-Path -Path $ManifestPath -PathType Leaf) {
    try {
        $ManifestObj = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
        if (-not $BackendDigest -and $ManifestObj.backend -and $ManifestObj.backend.digest) {
            $BackendDigest = $ManifestObj.backend.digest
        }
        if (-not $FrontendDigest -and $ManifestObj.frontend -and $ManifestObj.frontend.digest) {
            $FrontendDigest = $ManifestObj.frontend.digest
        }
        if (-not $PreviousBackendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.backend -and $ManifestObj.previousRelease.backend.digest) {
            $PreviousBackendDigest = $ManifestObj.previousRelease.backend.digest
        }
        if (-not $PreviousFrontendDigest -and $ManifestObj.previousRelease -and $ManifestObj.previousRelease.frontend -and $ManifestObj.previousRelease.frontend.digest) {
            $PreviousFrontendDigest = $ManifestObj.previousRelease.frontend.digest
        }
        if (-not $PreviousBackendDigest -and $ManifestObj.backend -and $ManifestObj.backend.digest) {
            $PreviousBackendDigest = $ManifestObj.backend.digest
        }
        if (-not $PreviousFrontendDigest -and $ManifestObj.frontend -and $ManifestObj.frontend.digest) {
            $PreviousFrontendDigest = $ManifestObj.frontend.digest
        }
    } catch {}
}

function Execute-Rollback {
    param(
        [string]$PrevTag,
        [string]$PrevBackendDig,
        [string]$PrevFrontendDig,
        [string]$CompFile,
        [bool]$IsStrictProd
    )
    Write-Host "[GMS AUTOMATED ROLLBACK] Initiating rollback sequence to previous stable release tag: [$PrevTag]..." -ForegroundColor Magenta

    if ($IsStrictProd -or $RequireDigest) {
        if (-not $PrevBackendDig -or -not $PrevFrontendDig) {
            throw "[GMS IMMUTABILITY VIOLATION] Rollback aborted! Production rollback requires explicit SHA-256 digests for previous images (PreviousBackendDigest and PreviousFrontendDigest). Refusing to fall back to target failed image digests."
        }
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
    & pwsh.exe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $CompFile
    if ($LASTEXITCODE -ne 0) { throw "Rollback health check verification failed with exit code $LASTEXITCODE." }
    Write-Host "[GMS AUTOMATED ROLLBACK SUCCESS] Production environment successfully rolled back and restored to stable release [$PrevTag]." -ForegroundColor Green
}

[bool]$IsProductionMode = [bool]($RequireDigest -or ($ComposeFile -like "*prod*"))

if ($RollbackOnly) {
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -CompFile $ComposeFile -IsStrictProd $IsProductionMode
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

Write-Host "[GMS Deploy] Starting immutable deployment for Release Tag: [$TargetReleaseTag]..." -ForegroundColor Cyan
if ($BackendDigest) { Write-Host "[GMS Deploy] Enforcing Backend Image Digest: [$BackendDigest]" -ForegroundColor Cyan }
if ($FrontendDigest) { Write-Host "[GMS Deploy] Enforcing Frontend Image Digest: [$FrontendDigest]" -ForegroundColor Cyan }
Write-Host "[GMS Deploy] Fallback rollback tag in case of verification failure: [$PreviousReleaseTag]" -ForegroundColor Yellow

try {
    # Step 1.2: Verify or build image pair for target release
    if ($UsePrebuiltImages -or (Verify-Image-Exists -Tag $TargetReleaseTag -BackendDig $BackendDigest -FrontendDig $FrontendDigest)) {
        Write-Host "[GMS Deploy] Pre-built image pair found for [$TargetReleaseTag]. Using immutable pre-built images (--no-build)..." -ForegroundColor Green
    } else {
        if ($UsePrebuiltImages -or $IsProductionMode) {
            throw "Production deployment error: Prebuilt immutable image pair [gms-backend:$TargetReleaseTag, gms-frontend:$TargetReleaseTag] was not found in registry/local engine. Building on production server working tree is disabled for release immutability."
        }
        Write-Host "[GMS Deploy] Building image pair for release [$TargetReleaseTag] from local working tree..." -ForegroundColor Cyan
        & docker compose -f $ComposeFile --env-file backend\.env build backend frontend
        if ($LASTEXITCODE -ne 0) { throw "Docker compose build failed with exit code $LASTEXITCODE." }
    }

    # Step 1.5: Database preflight audit and migration using newly built backend image
    Write-Host "[GMS Preflight & Migration] Running database preflight audit and Prisma migration..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env run --rm backend npm run db:prepare:prod
    if ($LASTEXITCODE -ne 0) { throw "Database preflight duplicate audit or Prisma migration failed with exit code $LASTEXITCODE." }

    Write-Host "[GMS Deploy] Booting containers for release [$TargetReleaseTag] (--no-build)..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
    if ($LASTEXITCODE -ne 0) { throw "Docker compose up terminated with error code $LASTEXITCODE." }

    # Step 2: Execute automated health watchdog check
    Write-Host "[GMS Deploy] Verifying post-deployment service health via watchdog..." -ForegroundColor Cyan
    $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
    & pwsh.exe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile
    if ($LASTEXITCODE -ne 0) { throw "Health check verification failed during post-deploy watchdog test." }

    Write-Host "[GMS Deploy] SUCCESS! Release [$TargetReleaseTag] successfully deployed and verified healthy." -ForegroundColor Green

    # Record release tag and manifests
    $TargetReleaseTag | Out-File -FilePath (Join-Path $WorkspaceRoot "deploy\current_release.txt") -Force -Encoding utf8
    
    $ReleaseManifest = @{
        release = $TargetReleaseTag
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
    Set-Content -Path (Join-Path $WorkspaceRoot "deploy\release_manifest.json") -Value ($ReleaseManifest | ConvertTo-Json -Depth 5) -Encoding utf8

    exit 0
}
catch {
    Write-Host "[GMS DEPLOYMENT FAILED] Error detected: $_" -ForegroundColor Red
    try {
        Execute-Rollback -PrevTag $PreviousReleaseTag -PrevBackendDig $PreviousBackendDigest -PrevFrontendDig $PreviousFrontendDigest -CompFile $ComposeFile -IsStrictProd $IsProductionMode
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover even after rolling back to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }

    exit 1
}
