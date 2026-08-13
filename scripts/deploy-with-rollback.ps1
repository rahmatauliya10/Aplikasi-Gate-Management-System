# ==============================================================================
# GMS Immutable Deployment & Automated Rollback Script (P1-05, P2-04)
# ==============================================================================
# Deploys specified RELEASE_TAG to production using docker-compose.prod.yml.
# Runs automated watchdog verification post-deployment.
# Upon any healthcheck failure or explicit rollback request, instantly rolls back
# to prior stable release tag without rebuilding from current working tree.
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetReleaseTag,

    [Parameter(Mandatory=$false)]
    [string]$PreviousReleaseTag = "stable",

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

function Verify-Image-Exists {
    param([string]$Tag)
    $backendImg = & docker images -q "gms-backend:$Tag" 2>$null
    $frontendImg = & docker images -q "gms-frontend:$Tag" 2>$null
    return ((-not [string]::IsNullOrWhiteSpace($backendImg)) -and (-not [string]::IsNullOrWhiteSpace($frontendImg)))
}

if ($RollbackOnly) {
    Write-Host "[GMS AUTOMATED ROLLBACK] Rollback requested. Bypassing build for failed tag [$TargetReleaseTag]..." -ForegroundColor Yellow
    Write-Host "[GMS AUTOMATED ROLLBACK] Directly restoring previous release tag: [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Magenta

    $env:RELEASE_TAG = $PreviousReleaseTag
    try {
        if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag)) {
            throw "Previous release image pair [gms-backend:$PreviousReleaseTag, gms-frontend:$PreviousReleaseTag] does not exist locally. Refusing to build previous tag from working tree."
        }

        Write-Host "[GMS AUTOMATED ROLLBACK] Executing fast rollback using immutable image pair [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Cyan
        & docker compose -f $ComposeFile --env-file backend\.env up -d --no-build --remove-orphans
        if ($LASTEXITCODE -ne 0) { throw "Rollback container startup failed with exit code $LASTEXITCODE." }

        Write-Host "[GMS AUTOMATED ROLLBACK] Rollback container boot sequence finished. Confirming system recovery..." -ForegroundColor Magenta

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

Write-Host "[GMS Deploy] Starting immutable deployment for Release Tag: [$TargetReleaseTag]..." -ForegroundColor Cyan
Write-Host "[GMS Deploy] Fallback rollback tag in case of verification failure: [$PreviousReleaseTag]" -ForegroundColor Yellow

# Pre-flight check: Ensure previous release image pair exists BEFORE altering the running stack
Write-Host "[GMS Pre-flight] Verifying immutability requirement: checking availability of previous image pair [$PreviousReleaseTag]..." -ForegroundColor Cyan
if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag)) {
    throw "Pre-flight Error: Previous release image pair [gms-backend:$PreviousReleaseTag, gms-frontend:$PreviousReleaseTag] was not found. Runtime docker commit container snapshotting is disabled for release immutability."
}
Write-Host "[GMS Pre-flight SUCCESS] Verified presence of immutable rollback image pair [$PreviousReleaseTag]." -ForegroundColor Green

# Step 1: Export RELEASE_TAG environment variable for Compose
$env:RELEASE_TAG = $TargetReleaseTag

try {
    # Step 1.2: Verify or build image pair for target release
    if ($UsePrebuiltImages -or (Verify-Image-Exists -Tag $TargetReleaseTag)) {
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

    # Record release tag to stable tracking file
    $TargetReleaseTag | Out-File -FilePath (Join-Path $WorkspaceRoot "deploy\current_release.txt") -Force -Encoding utf8
    exit 0
}
catch {
    Write-Host "[GMS DEPLOYMENT FAILED] Error detected: $_" -ForegroundColor Red
    Write-Host "[GMS AUTOMATED ROLLBACK] Initiating immediate rollback to previous release tag: [$PreviousReleaseTag]..." -ForegroundColor Magenta

    $env:RELEASE_TAG = $PreviousReleaseTag
    try {
        if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag)) {
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
