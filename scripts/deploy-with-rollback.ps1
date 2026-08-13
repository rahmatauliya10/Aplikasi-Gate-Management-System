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
    [switch]$UsePrebuiltImages
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

if ($RollbackOnly) {
    Write-Host "[GMS AUTOMATED ROLLBACK] Rollback requested. Bypassing build for failed tag [$TargetReleaseTag]..." -ForegroundColor Yellow
    Write-Host "[GMS AUTOMATED ROLLBACK] Directly restoring previous release tag: [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Magenta

    $env:RELEASE_TAG = $PreviousReleaseTag
    if ($PreviousBackendDigest) { $env:BACKEND_IMAGE = "gms-backend@$PreviousBackendDigest" }
    if ($PreviousFrontendDigest) { $env:FRONTEND_IMAGE = "gms-frontend@$PreviousFrontendDigest" }

    try {
        if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag -BackendDig $PreviousBackendDigest -FrontendDig $PreviousFrontendDigest)) {
            throw "Previous release image pair [gms-backend:$PreviousReleaseTag, gms-frontend:$PreviousReleaseTag] does not exist locally. Refusing to build previous tag from working tree."
        }

        Write-Host "[GMS AUTOMATED ROLLBACK] Executing fast rollback using immutable image pair [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Cyan
        & docker compose -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
        if ($LASTEXITCODE -ne 0) { throw "Rollback container startup failed with exit code $LASTEXITCODE." }

        Write-Host "[GMS AUTOMATED ROLLBACK] Rollback container boot sequence finished. Confirming system recovery & schema-compatible operation..." -ForegroundColor Magenta

        $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
        & pwsh.exe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile
        if ($LASTEXITCODE -ne 0) { throw "Rollback health check verification failed with exit code $LASTEXITCODE." }
        Write-Host "[GMS AUTOMATED ROLLBACK SUCCESS] Production environment successfully rolled back and restored to stable release [$PreviousReleaseTag]." -ForegroundColor Green
        exit 0
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover during rollback to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }
}

# Auto-resolve digests from release_manifest.json or local docker image inspect if not explicitly provided
[string]$ManifestPath = Join-Path $WorkspaceRoot "deploy\release_manifest.json"
if ((-not $BackendDigest -or -not $FrontendDigest) -and (Test-Path -Path $ManifestPath -PathType Leaf)) {
    try {
        $ManifestObj = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
        if (-not $BackendDigest -and $ManifestObj.backend -and $ManifestObj.backend.digest) {
            $BackendDigest = $ManifestObj.backend.digest
        }
        if (-not $FrontendDigest -and $ManifestObj.frontend -and $ManifestObj.frontend.digest) {
            $FrontendDigest = $ManifestObj.frontend.digest
        }
    } catch {}
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
        if ($UsePrebuiltImages -or ($ComposeFile -like "*prod*")) {
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
    Write-Host "[GMS AUTOMATED ROLLBACK] Initiating immediate rollback to previous release tag: [$PreviousReleaseTag]..." -ForegroundColor Magenta

    $env:RELEASE_TAG = $PreviousReleaseTag
    if ($PreviousBackendDigest) { $env:BACKEND_IMAGE = "gms-backend@$PreviousBackendDigest" }
    if ($PreviousFrontendDigest) { $env:FRONTEND_IMAGE = "gms-frontend@$PreviousFrontendDigest" }

    try {
        if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag -BackendDig $PreviousBackendDigest -FrontendDig $PreviousFrontendDigest)) {
            throw "Previous release image pair [gms-backend:$PreviousReleaseTag, gms-frontend:$PreviousReleaseTag] does not exist. Cannot perform immutable rollback."
        }

        & docker compose -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
        if ($LASTEXITCODE -ne 0) { throw "Rollback container startup failed with exit code $LASTEXITCODE." }

        Write-Host "[GMS AUTOMATED ROLLBACK] Rollback container boot sequence finished. Confirming system recovery..." -ForegroundColor Magenta

        $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
        & pwsh.exe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile
        if ($LASTEXITCODE -ne 0) { throw "Rollback health check verification failed with exit code $LASTEXITCODE." }
        Write-Host "[GMS AUTOMATED ROLLBACK SUCCESS] Production environment successfully rolled back and restored to stable release [$PreviousReleaseTag]." -ForegroundColor Green
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover even after rolling back to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }

    exit 1
}
