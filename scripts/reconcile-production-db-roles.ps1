# ==============================================================================
# GMS Production Existing Database Role & Ownership Reconciliation (P0-01 -> P0-08)
# ==============================================================================
# Purpose: Upgrades and reconciles an existing production PostgreSQL database:
#   1. Validates that 5 database passwords are pairwise distinct
#   2. Creates or normalizes roles (gms_owner, gms_app, gms_backup, restore_operator)
#   3. Revokes unexpected role memberships
#   4. Reassigns ownership of application objects in schema public to gms_owner
#   5. Revokes CREATE on public from PUBLIC, gms_app, gms_backup
#   6. Grants DML to gms_app and read-only to gms_backup
#   7. Configures FOR ROLE gms_owner default privileges
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$Container = "gate-system-postgres",

    [Parameter(Mandatory=$false)]
    [string]$Database = "gms",

    [Parameter(Mandatory=$false)]
    [string]$PostgresUser = "postgres",

    [Parameter(Mandatory=$false)]
    [string]$PostgresPassword = $env:POSTGRES_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$OwnerUser = "gms_owner",

    [Parameter(Mandatory=$false)]
    [string]$OwnerPassword = $env:GMS_OWNER_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$AppUser = "gms_app",

    [Parameter(Mandatory=$false)]
    [string]$AppPassword = $env:GMS_APP_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$BackupUser = "gms_backup",

    [Parameter(Mandatory=$false)]
    [string]$BackupPassword = $env:GMS_BACKUP_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$RestoreUser = "restore_operator",

    [Parameter(Mandatory=$false)]
    [string]$RestorePassword = $env:GMS_RESTORE_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$SqlScriptPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $SqlScriptPath) {
    $SqlScriptPath = Join-Path $WorkspaceRoot "deploy/postgres/reconcile-existing-role-privileges.sql"
}

if (-not (Test-Path $SqlScriptPath)) {
    throw "Reconciliation SQL script not found at [$SqlScriptPath]"
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " GMS Production Database Role & Ownership Reconciliation (P0-01 -> P0-08)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# 1. Validate Secret Distinctness
$passwords = @{
    "POSTGRES_PASSWORD"     = $PostgresPassword
    "GMS_OWNER_PASSWORD"   = $OwnerPassword
    "GMS_APP_PASSWORD"     = $AppPassword
    "GMS_BACKUP_PASSWORD"  = $BackupPassword
    "GMS_RESTORE_PASSWORD" = $RestorePassword
}

foreach ($kv in $passwords.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($kv.Value)) {
        throw "RECONCILIATION ERROR: Secret [$($kv.Key)] is required and cannot be empty!"
    }
}

$uniqueValues = @($passwords.Values | Select-Object -Unique)
if ($uniqueValues.Count -ne 5) {
    throw "PAIRWISE DISTINCT INVARIANT VIOLATION: Database passwords must all be pairwise distinct! Found duplicate secrets across roles."
}
Write-Host "Step 1: Invariant 0 (5 Pairwise-Distinct Secrets) verified [PASS]" -ForegroundColor Green

# 2. Execute reconciliation SQL via psql in target container
Write-Host "Step 2: Executing reconciliation SQL script against [$Database] on [$Container]..." -ForegroundColor Cyan

$sqlContent = Get-Content -Path $SqlScriptPath -Raw

# Pass parameters safely using psql -c session settings or inline DO block with environment
$setCommands = @"
SET gms.owner_user = '$OwnerUser';
SET gms.owner_password = '$OwnerPassword';
SET gms.app_user = '$AppUser';
SET gms.app_password = '$AppPassword';
SET gms.backup_user = '$BackupUser';
SET gms.backup_password = '$BackupPassword';
SET gms.restore_user = '$RestoreUser';
SET gms.restore_password = '$RestorePassword';
"@

$combinedSql = "$setCommands`n$sqlContent"

# Pipe SQL safely into docker exec psql
$output = $combinedSql | docker exec -i -e PGPASSWORD="$PostgresPassword" $Container psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $Database 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host $output -ForegroundColor Red
    throw "DATABASE ROLE RECONCILIATION FAILED (Exit code: $exitCode)"
}

Write-Host $output -ForegroundColor Gray
Write-Host "Step 3: Database Role & Ownership Reconciliation Completed Successfully [PASS]" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
exit 0
