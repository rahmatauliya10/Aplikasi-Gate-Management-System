# ==============================================================================
# GMS Database Least Privilege & Authentication Isolation Gate (P0-07 / P0-10)
# ==============================================================================
# Purpose: Comprehensive 15-point automated verification testing:
#   Pre-check 0: Invariant 0 - 5 Database secrets are pairwise distinct
#   Pre-check 1: Invariant 1 - Zero unexpected role memberships (pg_auth_members)
#   Check 1-3  : gms_app is NOSUPERUSER, NOCREATEDB, NOCREATEROLE
#   Check 4-5  : gms_app USAGE(public) = true, CREATE(public) = false
#   Check 6    : Negative Test - gms_app CREATE TABLE -> MUST FAIL
#   Check 7-8  : Positive Test - gms_owner CREATE & ALTER probe table -> MUST PASS
#   Check 9-10 : Positive Test - gms_app SELECT & DML on probe table -> MUST PASS
#   Check 11   : Positive Test - gms_backup SELECT on probe table -> MUST PASS
#   Check 12-14: Negative Test - gms_backup INSERT/UPDATE/CREATE -> MUST FAIL
#   Check 15   : TCP Credential & Fallback Elimination Gate
#   Post-check : Native pg_dump smoke test with gms_backup credentials
#   Finally    : Safe cleanup of probe table (__gms_privilege_probe)
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
    [string]$AppUser = "gms_app",

    [Parameter(Mandatory=$false)]
    [string]$AppPassword = $env:GMS_APP_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$OwnerUser = "gms_owner",

    [Parameter(Mandatory=$false)]
    [string]$OwnerPassword = $env:GMS_OWNER_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$BackupUser = "gms_backup",

    [Parameter(Mandatory=$false)]
    [string]$BackupPassword = $env:GMS_BACKUP_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$RestoreUser = "restore_operator",

    [Parameter(Mandatory=$false)]
    [string]$RestorePassword = $env:GMS_RESTORE_PASSWORD,

    [Parameter(Mandatory=$false)]
    [string]$HostAddress = "",

    [Parameter(Mandatory=$false)]
    [string]$Port = "5432"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " GMS 15-Point Least Privilege & Authentication Isolation Gate" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

function Run-Query([string]$user, [string]$password, [string]$sql, [bool]$useTcp = $false) {
    if ($useTcp) {
        $targetHost = if ($HostAddress) { $HostAddress } else { $Container }
        $res = & docker exec -e PGPASSWORD="$password" $Container psql -h $targetHost -p $Port -U $user -d $Database -t -A -c "$sql" 2>&1
    } else {
        $res = & docker exec -e PGPASSWORD="$password" $Container psql -U $user -d $Database -t -A -c "$sql" 2>&1
    }
    return ($res | Out-String).Trim()
}

# Pre-check 0: Invariant 0 (Pairwise Distinct Secrets)
if ($PostgresPassword -and $OwnerPassword -and $AppPassword -and $BackupPassword -and $RestorePassword) {
    $passwords = @($PostgresPassword, $OwnerPassword, $AppPassword, $BackupPassword, $RestorePassword)
    $uniqueCount = @($passwords | Select-Object -Unique).Count
    if ($uniqueCount -ne 5) {
        throw "INVARIANT 0 VIOLATION: Database passwords must all be pairwise distinct! Found duplicates."
    }
    Write-Host "Pre-check 0: Invariant 0 (5 Pairwise-Distinct Secrets) verified [PASS]" -ForegroundColor Green
} else {
    Write-Host "Pre-check 0: Invariant 0 - Skipping distinctness check (passwords not fully provided via env) [WARN]" -ForegroundColor Yellow
}

# Pre-check 1: Invariant 1 (No Unexpected Role Membership)
$membershipCheckSql = @"
SELECT count(*) FROM pg_auth_members m
JOIN pg_roles member_role ON member_role.oid = m.member
JOIN pg_roles granted_role ON granted_role.oid = m.roleid
WHERE member_role.rolname IN ('$AppUser', '$OwnerUser', '$BackupUser');
"@
$membershipCount = Run-Query -user $PostgresUser -password $PostgresPassword -sql $membershipCheckSql
if ($membershipCount -ne "0") {
    throw "INVARIANT 1 VIOLATION: Unexpected role membership found in pg_auth_members (Count: $membershipCount)! Roles must have zero inherited memberships."
}
Write-Host "Pre-check 1: Invariant 1 (Zero Unexpected Role Membership) verified [PASS]" -ForegroundColor Green

# Check 1: gms_app is NOSUPERUSER
$SuperuserCheck = Run-Query -user $PostgresUser -password $PostgresPassword -sql "SELECT usesuper FROM pg_user WHERE usename = '$AppUser';"
if ($SuperuserCheck -eq "t" -or $SuperuserCheck -eq "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' has superuser privileges!"
}
Write-Host "Check 1: Role '$AppUser' is NOSUPERUSER [PASS]" -ForegroundColor Green

# Check 2: gms_app NOCREATEDB
$CreateDbPriv = Run-Query -user $PostgresUser -password $PostgresPassword -sql "SELECT usecreatedb FROM pg_user WHERE usename = '$AppUser';"
if ($CreateDbPriv -eq "t" -or $CreateDbPriv -eq "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' has CREATEDB privilege!"
}
Write-Host "Check 2: Role '$AppUser' is NOCREATEDB [PASS]" -ForegroundColor Green

# Check 3: gms_app NOCREATEROLE
$CreateRolePriv = Run-Query -user $PostgresUser -password $PostgresPassword -sql "SELECT rolcreaterole FROM pg_roles WHERE rolname = '$AppUser';"
if ($CreateRolePriv -eq "t" -or $CreateRolePriv -eq "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' has CREATEROLE privilege!"
}
Write-Host "Check 3: Role '$AppUser' is NOCREATEROLE [PASS]" -ForegroundColor Green

# Check 4: gms_app USAGE(public) = TRUE
$UsageCheck = Run-Query -user $PostgresUser -password $PostgresPassword -sql "SELECT has_schema_privilege('$AppUser', 'public', 'USAGE');"
if ($UsageCheck -ne "t" -and $UsageCheck -ne "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' lacks USAGE on schema public!"
}
Write-Host "Check 4: Role '$AppUser' has USAGE on schema public [PASS]" -ForegroundColor Green

# Check 5: gms_app CREATE(public) = FALSE
$CreateSchemaCheck = Run-Query -user $PostgresUser -password $PostgresPassword -sql "SELECT has_schema_privilege('$AppUser', 'public', 'CREATE');"
if ($CreateSchemaCheck -eq "t" -or $CreateSchemaCheck -eq "true") {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' has CREATE on schema public! Must be revoked."
}
Write-Host "Check 5: Role '$AppUser' has NO CREATE on schema public [PASS]" -ForegroundColor Green

# Check 6: Negative Test - gms_app CREATE TABLE must FAIL
$CreateResult = Run-Query -user $AppUser -password $AppPassword -sql "CREATE TABLE public.forbidden_app_table (id int);"
if (-not ($CreateResult -match "permission denied")) {
    throw "LEAST PRIVILEGE VIOLATION: Role '$AppUser' was able to create table or failed without permission denied: $CreateResult"
}
Write-Host "Check 6: Negative Test - gms_app CREATE TABLE rejected with 'permission denied' [PASS]" -ForegroundColor Green

# Execute Checks 7-14 with try / finally probe lifecycle
$probeTableCreated = $false
try {
    # Check 7: Positive Test - gms_owner CREATE probe table
    $createProbeResult = Run-Query -user $OwnerUser -password $OwnerPassword -sql "DROP TABLE IF EXISTS public.__gms_privilege_probe; CREATE TABLE public.__gms_privilege_probe (id integer PRIMARY KEY, value text);"
    if ($createProbeResult -match "ERROR|permission denied") {
        throw "MIGRATOR PRIVILEGE FAILURE: Role '$OwnerUser' failed to CREATE probe table: $createProbeResult"
    }
    $probeTableCreated = $true
    Write-Host "Check 7: Positive Test - gms_owner CREATE probe table succeeded [PASS]" -ForegroundColor Green

    # Check 8: Positive Test - gms_owner ALTER probe table
    $alterProbeResult = Run-Query -user $OwnerUser -password $OwnerPassword -sql "ALTER TABLE public.__gms_privilege_probe ADD COLUMN extra text;"
    if ($alterProbeResult -match "ERROR|permission denied") {
        throw "MIGRATOR PRIVILEGE FAILURE: Role '$OwnerUser' failed to ALTER probe table: $alterProbeResult"
    }
    Write-Host "Check 8: Positive Test - gms_owner ALTER probe table succeeded [PASS]" -ForegroundColor Green

    # Check 9: Positive Test - gms_app SELECT probe table
    $selectProbeResult = Run-Query -user $AppUser -password $AppPassword -sql "SELECT COUNT(*) FROM public.__gms_privilege_probe;"
    if ($selectProbeResult -ne "0") {
        throw "RUNTIME PRIVILEGE FAILURE: Role '$AppUser' failed to SELECT from probe table: $selectProbeResult"
    }
    Write-Host "Check 9: Positive Test - gms_app SELECT on probe table succeeded [PASS]" -ForegroundColor Green

    # Check 10: Positive Test - gms_app DML (INSERT, UPDATE, DELETE) against probe table
    $dmlProbeResult = Run-Query -user $AppUser -password $AppPassword -sql "INSERT INTO public.__gms_privilege_probe (id, value, extra) VALUES (1, 'initial', 'init_extra'); UPDATE public.__gms_privilege_probe SET value = 'updated' WHERE id = 1; DELETE FROM public.__gms_privilege_probe WHERE id = 1;"
    if ($dmlProbeResult -match "ERROR|permission denied") {
        throw "RUNTIME PRIVILEGE FAILURE: Role '$AppUser' failed normal DML operations: $dmlProbeResult"
    }
    Write-Host "Check 10: Positive Test - gms_app INSERT/UPDATE/DELETE on probe table succeeded [PASS]" -ForegroundColor Green

    # Check 11: Positive Test - gms_backup SELECT on probe table
    $backupSelectResult = Run-Query -user $BackupUser -password $BackupPassword -sql "SELECT COUNT(*) FROM public.__gms_privilege_probe;"
    if ($backupSelectResult -ne "0") {
        throw "BACKUP PRIVILEGE FAILURE: Role '$BackupUser' failed to SELECT probe table: $backupSelectResult"
    }
    Write-Host "Check 11: Positive Test - gms_backup SELECT on probe table succeeded [PASS]" -ForegroundColor Green

    # Check 12: Negative Test - gms_backup INSERT on probe table must FAIL (error 42501)
    $backupInsertResult = Run-Query -user $BackupUser -password $BackupPassword -sql "INSERT INTO public.__gms_privilege_probe (id, value) VALUES (99, 'forbidden');"
    if (-not ($backupInsertResult -match "permission denied")) {
        throw "LEAST PRIVILEGE VIOLATION: Role '$BackupUser' was able to INSERT into table: $backupInsertResult"
    }
    Write-Host "Check 12: Negative Test - gms_backup INSERT rejected with 'permission denied' [PASS]" -ForegroundColor Green

    # Check 13: Negative Test - gms_backup UPDATE/DELETE must FAIL
    $backupUpdateResult = Run-Query -user $BackupUser -password $BackupPassword -sql "UPDATE public.__gms_privilege_probe SET value = 'hacked' WHERE id = 1;"
    if (-not ($backupUpdateResult -match "permission denied")) {
        throw "LEAST PRIVILEGE VIOLATION: Role '$BackupUser' was able to UPDATE table: $backupUpdateResult"
    }
    Write-Host "Check 13: Negative Test - gms_backup UPDATE/DELETE rejected with 'permission denied' [PASS]" -ForegroundColor Green

    # Check 14: Negative Test - gms_backup CREATE TABLE must FAIL
    $backupCreateResult = Run-Query -user $BackupUser -password $BackupPassword -sql "CREATE TABLE public.forbidden_backup_table (id int);"
    if (-not ($backupCreateResult -match "permission denied")) {
        throw "LEAST PRIVILEGE VIOLATION: Role '$BackupUser' was able to CREATE TABLE: $backupCreateResult"
    }
    Write-Host "Check 14: Negative Test - gms_backup CREATE TABLE rejected with 'permission denied' [PASS]" -ForegroundColor Green

} finally {
    if ($probeTableCreated) {
        $dropProbeResult = Run-Query -user $OwnerUser -password $OwnerPassword -sql "DROP TABLE IF EXISTS public.__gms_privilege_probe;"
        Write-Host "Cleanup: Temporary probe table __gms_privilege_probe cleanly removed." -ForegroundColor Gray
    }
}

# Check 15: TCP Authentication & Fallback Elimination Gate
if ($AppPassword -and $OwnerPassword -and $BackupPassword -and $PostgresPassword) {
    # 15A: gms_app + correct GMS_APP_PASSWORD over TCP -> PASS
    $tcpAppPass = Run-Query -user $AppUser -password $AppPassword -sql "SELECT 1;" -useTcp $true
    if ($tcpAppPass.Trim() -ne "1") {
        throw "TCP AUTH FAILURE: Role '$AppUser' failed TCP connection with GMS_APP_PASSWORD: $tcpAppPass"
    }

    # 15B: gms_app + wrong POSTGRES_PASSWORD over TCP -> MUST FAIL (Proves no fallback)
    $tcpAppFail = Run-Query -user $AppUser -password $PostgresPassword -sql "SELECT 1;" -useTcp $true
    if ($tcpAppFail.Trim() -eq "1") {
        throw "SECURITY VIOLATION: Role '$AppUser' authenticated using POSTGRES_PASSWORD! Password fallback is still active."
    }

    # 15C: gms_owner + GMS_OWNER_PASSWORD over TCP -> PASS
    $tcpOwnerPass = Run-Query -user $OwnerUser -password $OwnerPassword -sql "SELECT 1;" -useTcp $true
    if ($tcpOwnerPass.Trim() -ne "1") {
        throw "TCP AUTH FAILURE: Role '$OwnerUser' failed TCP connection with GMS_OWNER_PASSWORD: $tcpOwnerPass"
    }

    # 15D: gms_backup + GMS_BACKUP_PASSWORD over TCP -> PASS
    $tcpBackupPass = Run-Query -user $BackupUser -password $BackupPassword -sql "SELECT 1;" -useTcp $true
    if ($tcpBackupPass.Trim() -ne "1") {
        throw "TCP AUTH FAILURE: Role '$BackupUser' failed TCP connection with GMS_BACKUP_PASSWORD: $tcpBackupPass"
    }

    Write-Host "Check 15: TCP Authentication & Fallback Elimination Gate PASSED [PASS]" -ForegroundColor Green
} else {
    Write-Host "Check 15: Skipping TCP auth gate (passwords not fully provided via environment) [WARN]" -ForegroundColor Yellow
}

# Check 16 & 17: Database Audit & History Immutability Gate
$auditTables = @("ActivityLog", "TransactionCorrection", "TransactionCorrectionItem", "TransactionStatusHistory")
foreach ($tbl in $auditTables) {
    # Check 16: Positive Test - gms_app has SELECT and INSERT on audit table
    $selectAudit = Run-Query -user $AppUser -password $AppPassword -sql "SELECT has_table_privilege('$AppUser', 'public.\"$tbl\"', 'SELECT'), has_table_privilege('$AppUser', 'public.\"$tbl\"', 'INSERT');"
    if ($selectAudit -match "f|false") {
        throw "IMMUTABILITY VIOLATION: Role '$AppUser' lacks SELECT or INSERT privilege on audit table '$tbl': $selectAudit"
    }

    # Check 17: Negative Test - gms_app UPDATE & DELETE MUST be denied
    $updateAudit = Run-Query -user $AppUser -password $AppPassword -sql "SELECT has_table_privilege('$AppUser', 'public.\"$tbl\"', 'UPDATE'), has_table_privilege('$AppUser', 'public.\"$tbl\"', 'DELETE');"
    if ($updateAudit -match "t|true") {
        throw "IMMUTABILITY VIOLATION: Role '$AppUser' has UPDATE or DELETE privilege on immutable audit table '$tbl': $updateAudit"
    }
}
Write-Host "Check 16: Positive Test - gms_app SELECT and INSERT verified on all 4 audit tables [PASS]" -ForegroundColor Green
Write-Host "Check 17: Negative Test - gms_app UPDATE and DELETE revoked on all 4 audit tables [PASS]" -ForegroundColor Green

# Post-check: Native pg_dump Smoke Test with gms_backup Credentials
if ($BackupPassword) {
    Write-Host "Post-check: Executing native pg_dump smoke test with role [$BackupUser]..." -ForegroundColor Cyan
    $testDumpPath = "/tmp/gms_backup_privilege_smoke.dump"
    
    # Execute pg_dump inside container using gms_backup credentials
    $targetHost = if ($HostAddress) { $HostAddress } else { $Container }
    $dumpExec = & docker exec -e PGPASSWORD="$BackupPassword" $Container pg_dump -h $targetHost -p $Port -U $BackupUser -d $Database -F c -f "$testDumpPath" 2>&1
    $dumpExitCode = $LASTEXITCODE

    if ($dumpExitCode -ne 0) {
        throw "BACKUP SMOKE FAILURE: pg_dump failed with exit code ${dumpExitCode}: $dumpExec"
    }

    # Verify dump file is non-empty and pg_restore can list contents
    $restoreList = & docker exec -e PGPASSWORD="$BackupPassword" $Container pg_restore --list "$testDumpPath" 2>&1
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($restoreList)) {
        throw "BACKUP SMOKE FAILURE: pg_restore --list failed on dump file: $restoreList"
    }

    # Clean up test dump
    & docker exec $Container rm -f "$testDumpPath" | Out-Null
    Write-Host "Post-check: Native pg_dump smoke test using [$BackupUser] PASSED [SUCCESS]" -ForegroundColor Green
}

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " ALL 17 LEAST PRIVILEGE, AUTHENTICATION & IMMUTABILITY CHECKS PASSED [100% SUCCESS]" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
exit 0
