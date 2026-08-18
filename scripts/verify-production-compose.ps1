# ==============================================================================
# GMS Production Compose Semantic & Security Invariants Verification Gate (PowerShell)
# ==============================================================================

param(
    [string]$ComposeFile = "docker-compose.prod.yml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Item "$PSScriptRoot\..").FullName
$ComposePath = Join-Path $ProjectRoot $ComposeFile

if (-not (Test-Path $ComposePath)) {
    throw "Compose file not found at: $ComposePath"
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Verifying Production Compose: $ComposeFile" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# Set dummy CI variables required for parsing
$env:BACKEND_IMAGE = "ghcr.io/rahmatauliya10/gms-backend@sha256:0000000000000000000000000000000000000000000000000000000000000000"
$env:FRONTEND_IMAGE = "ghcr.io/rahmatauliya10/gms-frontend@sha256:0000000000000000000000000000000000000000000000000000000000000000"
$env:MIGRATOR_IMAGE = "ghcr.io/rahmatauliya10/gms-backend-migrator@sha256:0000000000000000000000000000000000000000000000000000000000000000"
$env:POSTGRES_PASSWORD = "testpassword"
$env:POSTGRES_USER = "postgres"
$env:JWT_ACCESS_SECRET = "test-jwt-access-secret-for-ci-pipeline-min-32-chars-long"
$env:JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-ci-pipeline-min-32-chars-long"
$env:BACKUP_SIGNATURE_SECRET = "test-backup-signature-secret-for-ci-pipeline-min-32-chars-long"
$env:CORS_ORIGIN = "http://localhost:8080"
$env:NAS_MOUNT_PATH = "/tmp/nas"

# Gate 1: Syntax & Variable Interpolation (docker compose config)
Write-Host "Gate 1: Syntax & Variable Interpolation validation..." -ForegroundColor Yellow
$ConfigJson = (& docker compose -f $ComposePath config --format json 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error "Gate 1 FAILED: docker compose config returned non-zero exit code: $ConfigJson"
    exit 1
}
Write-Host "Gate 1 PASSED: docker compose config is syntactically valid." -ForegroundColor Green

# Gate 2: Semantic Assertions via JSON AST
Write-Host "Gate 2: Semantic & Security Invariants validation..." -ForegroundColor Yellow
$Parsed = $ConfigJson | ConvertFrom-Json

$Errors = [System.Collections.Generic.List[string]]::new()
$Services = $Parsed.services

# Backend Assertions
$Backend = $Services.backend
if (-not $Backend) {
    $Errors.Add("Service [backend] is missing.")
} else {
    $Nets = @($Backend.networks | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)
    if ($Nets -notcontains "proxy-net" -or $Nets -notcontains "db-net") {
        $Errors.Add("Backend must be in both proxy-net and db-net.")
    }
    if ($Backend.security_opt -notcontains "no-new-privileges:true") {
        $Errors.Add("Backend missing security_opt [no-new-privileges:true].")
    }
    if ($Backend.cap_drop -notcontains "ALL") {
        $Errors.Add("Backend missing cap_drop [ALL].")
    }
    if (-not $Backend.healthcheck) {
        $Errors.Add("Backend missing healthcheck.")
    }
}

# Migrator Assertions
$Migrator = $Services.migrator
if (-not $Migrator) {
    $Errors.Add("Service [migrator] is missing.")
} else {
    $MigNets = @($Migrator.networks | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)
    if ($MigNets -notcontains "db-net" -or $MigNets -contains "proxy-net") {
        $Errors.Add("Migrator must be strictly in db-net and never in proxy-net.")
    }
    if ($Migrator.restart -ne "no") {
        $Errors.Add("Migrator restart policy must be 'no'.")
    }
    if ($Migrator.PSObject.Properties['ports'] -and $Migrator.ports.Count -gt 0) {
        $Errors.Add("Migrator must not expose host ports.")
    }
}

# Postgres Isolation
$Postgres = $Services.postgres
if (-not $Postgres) {
    $Errors.Add("Service [postgres] is missing.")
} else {
    if ($Postgres.PSObject.Properties['ports'] -and $Postgres.ports.Count -gt 0) {
        $Errors.Add("Postgres must NOT expose ports to host in production.")
    }
}

if ($Errors.Count -gt 0) {
    Write-Host "Gate 2 FAILED with $($Errors.Count) errors:" -ForegroundColor Red
    foreach ($err in $Errors) {
        Write-Host "  - [FAIL] $err" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Gate 2 PASSED: All semantic security invariants verified." -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " SUCCESS: Production compose configuration verified!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
