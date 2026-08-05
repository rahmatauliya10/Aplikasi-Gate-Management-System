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
    [switch]$RollbackOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $WorkspaceRoot

function Verify-Image-Exists {
    param([string]$Tag)
    $backendImg = & docker images -q "gms-backend:$Tag" 2>$null
    return (-not [string]::IsNullOrWhiteSpace($backendImg))
}

if ($RollbackOnly) {
    Write-Host "[GMS AUTOMATED ROLLBACK] Rollback requested. Bypassing build for failed tag [$TargetReleaseTag]..." -ForegroundColor Yellow
    Write-Host "[GMS AUTOMATED ROLLBACK] Directly restoring previous release tag: [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Magenta

    $env:RELEASE_TAG = $PreviousReleaseTag
    try {
        if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag)) {
            throw "Previous release image [gms-backend:$PreviousReleaseTag] does not exist locally. Refusing to build previous tag from working tree."
        }

        Write-Host "[GMS AUTOMATED ROLLBACK] Executing fast rollback using immutable image [$PreviousReleaseTag] (--no-build)..." -ForegroundColor Cyan
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

# Pre-flight check: Ensure previous release image exists BEFORE altering the running stack
Write-Host "[GMS Pre-flight] Verifying immutability requirement: checking availability of previous image [$PreviousReleaseTag]..." -ForegroundColor Cyan
if (-not (Verify-Image-Exists -Tag $PreviousReleaseTag)) {
    Write-Host "[GMS Pre-flight WARNING] Image [gms-backend:$PreviousReleaseTag] not found. Attempting to snapshot current running container baseline as [$PreviousReleaseTag]..." -ForegroundColor Yellow
    $runningBackend = & docker ps -q --filter "name=gate-system-backend" 2>$null
    if (-not [string]::IsNullOrWhiteSpace($runningBackend)) {
        & docker commit gate-system-backend "gms-backend:$PreviousReleaseTag" 2>$null
        & docker commit gate-system-frontend "gms-frontend:$PreviousReleaseTag" 2>$null
        Write-Host "[GMS Pre-flight SUCCESS] Captured current running containers as immutable rollback tag [$PreviousReleaseTag]." -ForegroundColor Green
    } else {
        Write-Host "[GMS Pre-flight WARN] No running container stack found to snapshot. Deployment will proceed, but rollback requires an existing immutable image." -ForegroundColor Yellow
    }
}

# Step 1: Export RELEASE_TAG environment variable for Compose
$env:RELEASE_TAG = $TargetReleaseTag

try {
    Write-Host "[GMS Deploy] Building and booting containers for release [$TargetReleaseTag]..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile --env-file backend\.env up -d --build --remove-orphans
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
            throw "Previous release image [gms-backend:$PreviousReleaseTag] does not exist. Cannot perform immutable rollback."
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
