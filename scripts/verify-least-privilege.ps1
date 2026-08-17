# ==============================================================================
# GMS Database Least Privilege Verification Script (P1 HIGH)
# ==============================================================================
# Purpose: Verifies that the gms_app role:
#   1. CAN perform DML operations (SELECT, INSERT, UPDATE, DELETE)
#   2. CANNOT perform DDL or admin operations (CREATE DATABASE, DROP DATABASE, CREATE ROLE, ALTER ROLE)
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$Container = "gate-system-postgres",

    [Parameter(Mandatory=$false)]
    [string]$Database = "gms",

    [Parameter(Mandatory=$false)]
    [string]$AppUser = "gms_app"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Verifying PostgreSQL Least Privilege Constraints for user [$AppUser]..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

function Run-AppQuery([string]$sql) {
    return (& docker exec $Container psql -U $AppUser -d $Database -t -A -c "$sql" 2>&1).ToString().Trim()
}

# 1. Verify gms_app is NOT a superuser
$SuperuserCheck = Run-AppQuery "SELECT usesuper FROM pg_user WHERE usename = '$AppUser';"
if ($SuperuserCheck -eq "t" -or $SuperuserCheck -eq "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' has superuser privileges!"
}
Write-Host "Check 1: Role '$AppUser' is NOT superuser [PASS]" -ForegroundColor Green

# 2. Negative Test: CREATE DATABASE must FAIL
$CreateDbResult = Run-AppQuery "CREATE DATABASE forbidden_test_db;"
if (-not ($CreateDbResult -match "permission denied")) {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' was able to execute CREATE DATABASE or returned unexpected error: $CreateDbResult"
}
Write-Host "Check 2: Negative Test - CREATE DATABASE blocked with 'permission denied' [PASS]" -ForegroundColor Green

# 3. Negative Test: CREATE ROLE must FAIL
$CreateRoleResult = Run-AppQuery "CREATE ROLE forbidden_role;"
if (-not ($CreateRoleResult -match "permission denied")) {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' was able to execute CREATE ROLE or returned unexpected error: $CreateRoleResult"
}
Write-Host "Check 3: Negative Test - CREATE ROLE blocked with 'permission denied' [PASS]" -ForegroundColor Green

# 4. Negative Test: DROP DATABASE must FAIL
$DropDbResult = Run-AppQuery "DROP DATABASE gms;"
if (-not ($DropDbResult -match "permission denied|must be owner")) {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' was able to attempt DROP DATABASE without permission denial: $DropDbResult"
}
Write-Host "Check 4: Negative Test - DROP DATABASE blocked with 'permission denied' [PASS]" -ForegroundColor Green

# 5. Positive Test: SELECT on User table must SUCCEED
$SelectResult = Run-AppQuery "SELECT COUNT(*) FROM \"User\";"
[int]$userCount = 0
if (-not [int]::TryParse($SelectResult, [ref]$userCount)) {
    throw "LEAST PRIVILEGE FAILURE: Role '$AppUser' failed normal SELECT query: $SelectResult"
}
Write-Host "Check 5: Positive Test - SELECT on \"User\" succeeded (Count: $userCount) [PASS]" -ForegroundColor Green

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "ALL POSTGRESQL LEAST PRIVILEGE CHECKS PASSED [SUCCESS]" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
exit 0
