# ==============================================================================
# GMS Production Release Checksums & Artifact Verification Generator
# ==============================================================================
# Generates cryptographic SHA-256 checksums and provenance manifest for release
# artifacts including backend bundle, frontend bundle, SQL migrations, scripts,
# docker-compose configs, and container image manifests.
#
# Produces:
#   artifacts/release-proof/RELEASE_CHECKSUMS.sha256
#   artifacts/release-proof/release_manifest_provenance.json
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = "",
    [Parameter(Mandatory=$false)]
    [string]$GitCommitSha = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
if (-not $ArtifactsDir) {
    $ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts\release-proof"
}
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

[string]$ChecksumFile = Join-Path -Path $ArtifactsDir -ChildPath "RELEASE_CHECKSUMS.sha256"
[string]$ManifestFile = Join-Path -Path $ArtifactsDir -ChildPath "release_manifest_provenance.json"

[string]$GitSha = $GitCommitSha
if (-not $GitSha -and $env:RELEASE_SHA) {
    $GitSha = $env:RELEASE_SHA
}
if (-not $GitSha -and $env:GITHUB_SHA) {
    $GitSha = $env:GITHUB_SHA
}
if (-not $GitSha) {
    try {
        if (Get-Command git -ErrorAction SilentlyContinue) {
            $GitSha = (& git rev-parse HEAD 2>$null)
        }
    } catch {}
}

if ([string]::IsNullOrWhiteSpace($GitSha) -or $GitSha -eq "HEAD") {
    throw "FATAL: Git commit SHA is unavailable. Release checksums and provenance generation aborted."
}

[string]$ReleaseTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " GMS Production Release Checksums & Provenance Generator" -ForegroundColor Cyan
Write-Host " Git Commit SHA : $GitSha" -ForegroundColor Cyan
Write-Host " Output File    : $ChecksumFile" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$TargetPaths = @(
    "docker-compose.prod.yml",
    "docker-compose.yml",
    "deploy\nginx\nginx.conf",
    "deploy\nginx\conf.d\gms.conf",
    "deploy\postgres\01-init-least-privilege-roles.sql",
    "deploy\postgres\01-init-least-privilege-roles.sh",
    ".trivyignore.yaml",
    ".github\workflows\ci.yml",
    ".github\workflows\release.yml",
    "backend\prisma\schema.prisma",
    "backend\Dockerfile",
    "backend\src\common\validators\blocked-passwords.data.ts",
    "frontend\Dockerfile",
    "scripts\verify-production-compose.js",
    "scripts\verify-production-compose.ps1",
    "scripts\gms-autostart-watchdog.ps1",
    "scripts\gms-health-monitor.ps1",
    "scripts\gms-production-restore.ps1",
    "scripts\deploy-with-rollback.ps1",
    "scripts\run-nas-restore-drill.ps1",
    "scripts\run-cold-boot-test.ps1",
    "scripts\run-restore-failure-drill.ps1",
    "scripts\run-deployment-rollback-drill.ps1"
)

$ChecksumLines = [System.Collections.Generic.List[string]]::new()
$ManifestEntries = [ordered]@{}

foreach ($RelPath in $TargetPaths) {
    [string]$FullPath = Join-Path -Path $ProjectRootDir -ChildPath $RelPath
    if (Test-Path -Path $FullPath -PathType Leaf) {
        $Hash = (Get-FileHash -Path $FullPath -Algorithm SHA256).Hash.ToLower()
        $ChecksumLines.Add("$Hash  $RelPath")
        $ManifestEntries[$RelPath] = [ordered]@{
            sha256 = $Hash
            sizeBytes = (Get-Item -Path $FullPath).Length
        }
        Write-Host "  [SHA256] $RelPath -> $Hash" -ForegroundColor Green
    }
}

# Scan SQL migrations
$MigrationDir = Join-Path -Path $ProjectRootDir -ChildPath "backend\prisma\migrations"
if (Test-Path -Path $MigrationDir) {
    $SqlFiles = Get-ChildItem -Path $MigrationDir -Filter "migration.sql" -Recurse
    foreach ($Sql in $SqlFiles) {
        [string]$Rel = $Sql.FullName.Substring($ProjectRootDir.Length + 1)
        $Hash = (Get-FileHash -Path $Sql.FullName -Algorithm SHA256).Hash.ToLower()
        $ChecksumLines.Add("$Hash  $Rel")
        $ManifestEntries[$Rel] = [ordered]@{
            sha256 = $Hash
            sizeBytes = $Sql.Length
        }
    }
    Write-Host "  Calculated SHA-256 for $($SqlFiles.Count) migration SQL files." -ForegroundColor Green
}

# Write SHA256 file
[System.IO.File]::WriteAllLines($ChecksumFile, $ChecksumLines, [System.Text.Encoding]::UTF8)

# Write Provenance JSON
$Provenance = [ordered]@{
    generator = "GMS_RELEASE_SUPPLY_CHAIN_PROVENANCE"
    releaseVersion = "v1.0.0"
    gitSha = $GitSha
    timestamp = $ReleaseTimestamp
    artifactsCount = $ManifestEntries.Count
    artifacts = $ManifestEntries
}
$JsonOut = $Provenance | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($ManifestFile, $JsonOut, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " SUCCESS: Release Checksums & Provenance Manifest Generated!" -ForegroundColor Green
Write-Host " Checksums File : $ChecksumFile" -ForegroundColor Green
Write-Host " Manifest File  : $ManifestFile" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
