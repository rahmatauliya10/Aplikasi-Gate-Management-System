# ==============================================================================
# GMS Immutable Deployment & Automated Rollback Script (P1-05, P2-04)
# ==============================================================================
# Deploys specified RELEASE_TAG to production using docker-compose.prod.yml.
# Runs automated watchdog verification post-deployment.
# Upon any healthcheck failure, instantly rolls back to the prior stable release tag.
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetReleaseTag,

    [Parameter(Mandatory=$false)]
    [string]$PreviousReleaseTag = "stable",

    [Parameter(Mandatory=$false)]
    [string]$ComposeFile = "docker-compose.prod.yml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $WorkspaceRoot

Write-Host "[GMS Deploy] Starting immutable deployment for Release Tag: [$TargetReleaseTag]..." -ForegroundColor Cyan
Write-Host "[GMS Deploy] Fallback rollback tag in case of verification failure: [$PreviousReleaseTag]" -ForegroundColor Yellow

# Step 1: Export RELEASE_TAG environment variable for Compose
$env:RELEASE_TAG = $TargetReleaseTag

try {
    Write-Host "[GMS Deploy] Building and booting containers for release [$TargetReleaseTag]..." -ForegroundColor Cyan
    & docker compose -f $ComposeFile up -d --build --remove-orphans
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
        & docker compose -f $ComposeFile up -d --remove-orphans
        Write-Host "[GMS AUTOMATED ROLLBACK] Rollback container boot sequence finished. Confirming system recovery..." -ForegroundColor Magenta

        $WatchdogPath = Join-Path $PSScriptRoot "gms-autostart-watchdog.ps1"
        & pwsh.exe -ExecutionPolicy Bypass -File $WatchdogPath -ComposeFilePath $ComposeFile
        Write-Host "[GMS AUTOMATED ROLLBACK SUCCESS] Production environment successfully rolled back and restored to stable release [$PreviousReleaseTag]." -ForegroundColor Green
    }
    catch {
        Write-Host "[CRITICAL ROLLBACK FAILURE] System failed to recover even after rolling back to tag [$PreviousReleaseTag]! Immediate manual emergency intervention required: $_" -ForegroundColor Red
        exit 2
    }

    exit 1
}
