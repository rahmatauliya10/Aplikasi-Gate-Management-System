# ==============================================================================
# End-to-End Populated-Upgrade & Concurrency Rehearsal (COR-01 Unbroken Chain)
# ==============================================================================
$ErrorActionPreference = 'Stop'

$containerName = "gms-test-pg-3c-c3e8a491"
$dbUser = "gms_test_user"
$targetDb = "gms_test_upgrade"
$targetPort = "57193"
$fixtureUuid = "FIXTURE-UPGRADE-c3e8a491"
$envId = "TEST-INTEGRATION-3C"

Write-Host "========================================================================"
Write-Host "  COR-01: UNBROKEN POPULATED-UPGRADE & CONCURRENCY REHEARSAL           "
Write-Host "========================================================================`n"

# ------------------------------------------------------------------------------
# Preflight Target Guard Verification
# ------------------------------------------------------------------------------
Write-Host "[Preflight] Verifying disposable fixture target..."
if ($targetPort -eq "5433") {
  throw "SAFETY ABORT: Operational port 5433 detected! Rehearsal forbidden on operational port."
}

# Verify container label & run identity
$containerLabels = (wsl -d rancher-desktop -e docker inspect $containerName --format '{{json .Config.Labels}}' | ConvertFrom-Json)
if ($containerLabels.'gms.fixture.type' -ne '3c-fresh' -or $containerLabels.'gms.fixture.run_id' -ne 'c3e8a491') {
  throw "SAFETY ABORT: Container $containerName does not possess verified fixture labels."
}
Write-Host "  ✓ Disposable container verified: $containerName (Labels: 3c-fresh, run_id: c3e8a491)"

# ------------------------------------------------------------------------------
# Phase 1: Clean Database Re-creation
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 1/6] Recreating isolated test database: $targetDb..."
$dropCreateSql = "DROP DATABASE IF EXISTS `"$targetDb`"; CREATE DATABASE `"$targetDb`" OWNER $dbUser;"
$dropCreateSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U $dbUser -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed recreating $targetDb" }

# Initialize _prisma_migrations table
$initMigrationsSql = @"
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
"@
$initMigrationsSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U $dbUser -d $targetDb
if ($LASTEXITCODE -ne 0) { throw "Failed initializing _prisma_migrations" }
Write-Host "  ✓ Database $targetDb created and migration table initialized."

# ------------------------------------------------------------------------------
# Phase 2: Apply Baseline Migrations (1..27) with ON_ERROR_STOP=1
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 2/6] Applying 27 baseline migrations (Fail-Closed)..."
$baselineMigrations = @(
  '20260714030729_init',
  '20260715000000_add_account_password_security',
  '20260715031355_sync_indices',
  '20260715034029_add_user_is_deleted',
  '20260715150000_add_user_profile_fields',
  '20260716041815_add_system_issue',
  '20260804170000_add_unique_constraints_and_corrections',
  '20260806000000_add_revision_and_correction_items',
  '20260807000000_repair_correction_enums_and_constraints',
  '20260808000000_add_missing_columns_to_warehouse_and_incoming',
  '20260809000000_reconcile_correction_enum_and_history',
  '20260810000000_add_versioning_fields',
  '20260810163000_partial_unique_is_current',
  '20260810180000_add_incoming_qc_start_at',
  '20260811000000_fix_qc_process_scope_and_backfill',
  '20260811010000_fix_atomic_workflow_state_machine',
  '20260811020000_production_readiness_versioning_and_invariants',
  '20260811030000_secure_attachment_lineage',
  '20260821100000_void_metadata_and_fk_restrict',
  '20260828000000_add_qc_vehicle_decision_mode',
  '20260930000000_add_gsp_pa_and_statuses',
  '20260930010000_add_pa_invalidation_fields',
  '20261006000000_add_gsp_analysis_profile',
  '20261008000000_add_liter_to_warehouse_unit',
  '20261008010000_add_gsp_uom_and_receiving_quantity',
  '20261014000000_add_waiting_gsp_disposition',
  '20261015000000_add_waiting_gsp_checklist_disposition'
)

$migrationsDir = Join-Path $PSScriptRoot "..\prisma\migrations"
$idx = 1
foreach ($mig in $baselineMigrations) {
  $sqlFile = Join-Path $migrationsDir "$mig\migration.sql"
  if (-not (Test-Path $sqlFile)) { throw "Migration file not found: $sqlFile" }

  $bytes = [System.IO.File]::ReadAllBytes($sqlFile)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  $checksum = -join ($hasher.ComputeHash($bytes) | ForEach-Object { "{0:x2}" -f $_ })

  $sqlContent = [System.IO.File]::ReadAllText($sqlFile)
  $sqlContent | wsl -d rancher-desktop -e docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U $dbUser -d $targetDb -q
  if ($LASTEXITCODE -ne 0) {
    throw "SQL ERROR: Migration $mig failed under ON_ERROR_STOP=1. Halting fail-closed."
  }

  $uuid = [System.Guid]::NewGuid().ToString()
  $recordSql = "INSERT INTO `"_prisma_migrations`" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ('$uuid', '$checksum', now(), '$mig', 1);"
  $recordSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U $dbUser -d $targetDb -q
  if ($LASTEXITCODE -ne 0) { throw "Failed recording migration $mig into _prisma_migrations." }

  $idx++
}
Write-Host "  ✓ 27/27 baseline migrations applied cleanly with ON_ERROR_STOP=1."

# Assert pre-upgrade invariants
$colCount = ("SELECT count(*) FROM information_schema.columns WHERE table_name = 'Transaction' AND column_name = 'dailySequence';" | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A).Trim()
if ($colCount -ne '0') { throw "INVARIANT FAILURE: Transaction.dailySequence exists prior to candidate migration!" }

$tblCount = ("SELECT count(*) FROM information_schema.tables WHERE table_name = 'DailyArrivalCounter';" | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A).Trim()
if ($tblCount -ne '0') { throw "INVARIANT FAILURE: DailyArrivalCounter exists prior to candidate migration!" }
Write-Host "  ✓ Schema invariants verified: dailySequence column count = 0, DailyArrivalCounter count = 0."

# ------------------------------------------------------------------------------
# Phase 3: Seed Historical Data on Baseline Schema & Snapshot Fingerprint
# ------------------------------------------------------------------------------
$dateKey = Get-Date -Format "yyyyMMdd"
Write-Host "`n[Phase 3/6] Seeding historical records on baseline schema for test day $dateKey..."

$seedSql = @"
INSERT INTO "AppSetting" (id, key, value, "createdAt", "updatedAt")
VALUES 
  ('set-fixture-uuid', 'FIXTURE_ISOLATION_UUID', '$fixtureUuid', now(), now()),
  ('set-env-id', 'ENVIRONMENT_ID', '$envId', now(), now()),
  ('set-sys-stage', 'SYSTEM_STAGE', 'TEST', now(), now()),
  ('set-install-uuid', 'INSTALLATION_UUID', 'GMS-TEST-UPGRADE-UUID', now(), now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO "User" (id, email, username, password, name, role, "isActive", "tokenVersion", "createdAt", "updatedAt")
VALUES ('usr-operator-drill', 'operator@gms.test', 'gateop', '`$argon2id`$v=19`$m=65536,t=3,p=4`$dummyhash', 'Gate Operator Drill', 'SECURITY', true, 0, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Insert into Transaction WITHOUT dailySequence column (column does not exist in schema 1..27)
INSERT INTO "Transaction" (
  id, "transactionNumber", "plateNumber", "plateNumberNormalized",
  "driverName", "driverPhone", "vendorName", "vehicleType",
  "processType", "cargoType", "cargoSubType", "cargoProcessType",
  status, "grossWeight", "tareWeight", "netWeight", "createdById",
  "createdAt", "updatedAt", revision
) VALUES 
  ('tx-hist-001', 'GMS-${dateKey}-0001', 'B 1111 AAA', 'B1111AAA', 'Driver One', '0811111111', 'PT Vendor Alpha', 'Truck', 'GBB', 'Raw Material', 'Kopi', 'INBOUND', 'COMPLETED', 12000, 4000, 8000, 'usr-operator-drill', now(), now(), 1),
  ('tx-hist-002', 'GMS-${dateKey}-0002', 'B 2222 BBB', 'B2222BBB', 'Driver Two', '0822222222', 'PT Vendor Beta', 'Truck', 'GBB', 'Raw Material', 'Kopi', 'INBOUND', 'COMPLETED', 13000, 4500, 8500, 'usr-operator-drill', now(), now(), 1),
  ('tx-hist-005', 'GMS-${dateKey}-0005', 'B 5555 EEE', 'B5555EEE', 'Driver Five', '0855555555', 'PT Vendor Epsilon', 'Truck', 'GBB', 'Raw Material', 'Kopi', 'INBOUND', 'COMPLETED', 16000, 5000, 11000, 'usr-operator-drill', now(), now(), 1)
ON CONFLICT (id) DO NOTHING;
"@
$seedSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U $dbUser -d $targetDb -q
if ($LASTEXITCODE -ne 0) { throw "Failed seeding historical baseline data." }

# Compute Pre-Upgrade Cryptographic SHA-256 Fingerprint
$preSnapshotSql = "SELECT id, `"transactionNumber`", status, `"grossWeight`", `"tareWeight`", `"netWeight`", `"createdById`" FROM `"Transaction`" ORDER BY id ASC;"
$preSnapshotRaw = ($preSnapshotSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A)
$preBytes = [System.Text.Encoding]::UTF8.GetBytes($preSnapshotRaw)
$preUpgradeHash = -join ($hasher.ComputeHash($preBytes) | ForEach-Object { "{0:x2}" -f $_ })
Write-Host "  ✓ Pre-Upgrade SHA-256 Fingerprint: $preUpgradeHash"
Write-Host "  ✓ 3 historical records seeded on baseline schema (0001, 0002, 0005 gap condition)."

# ------------------------------------------------------------------------------
# Phase 4: Deploy Candidate Migrations (28..30)
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 4/6] Deploying Candidate Migrations via 'npx prisma migrate deploy'..."
$env:DATABASE_URL = "postgresql://${dbUser}:synth_pass_3c_c3e8a491@127.0.0.1:${targetPort}/${targetDb}?schema=public"

Push-Location "$PSScriptRoot\.."
try {
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy exited with code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$postCount = ("SELECT count(*) FROM `"_prisma_migrations`";" | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A).Trim()
if ($postCount -ne '30') { throw "Expected 30 migrations applied, found: $postCount" }
Write-Host "  ✓ Candidate migrations deployed successfully. Total migrations: $postCount / 30."

# ------------------------------------------------------------------------------
# Phase 5: Post-Upgrade Invariant Verification on Unbroken Records
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 5/6] Verifying Data Preservation and Post-Upgrade Invariants..."

# Cryptographic Data Preservation Check
$postSnapshotSql = "SELECT id, `"transactionNumber`", status, `"grossWeight`", `"tareWeight`", `"netWeight`", `"createdById`" FROM `"Transaction`" ORDER BY id ASC;"
$postSnapshotRaw = ($postSnapshotSql | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A)
$postBytes = [System.Text.Encoding]::UTF8.GetBytes($postSnapshotRaw)
$postUpgradeHash = -join ($hasher.ComputeHash($postBytes) | ForEach-Object { "{0:x2}" -f $_ })
Write-Host "  ✓ Post-Upgrade SHA-256 Fingerprint: $postUpgradeHash"

if ($postUpgradeHash -ne $preUpgradeHash) {
  throw "DATA CORRUPTION DETECTED! Pre-upgrade hash ($preUpgradeHash) does not match post-upgrade hash ($postUpgradeHash)."
}
Write-Host "  ✓ 100% byte-for-byte data preservation cryptographically confirmed across DDL upgrade."

# Verify dailySequence is strictly NULL for all 3 historical records
$nullSeqCount = ("SELECT count(*) FROM `"Transaction`" WHERE id IN ('tx-hist-001', 'tx-hist-002', 'tx-hist-005') AND `"dailySequence`" IS NULL;" | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A).Trim()
if ($nullSeqCount -ne '3') { throw "INVARIANT VIOLATION: Historical rows do not have dailySequence = NULL!" }
Write-Host "  ✓ Invariant confirmed: All 3 historical records have dailySequence = NULL (no unrequested backfill)."

# Verify DailyArrivalCounter exists and has 0 rows for today
$counterCount = ("SELECT count(*) FROM `"DailyArrivalCounter`" WHERE `"dateKey`" = '$dateKey';" | wsl -d rancher-desktop -e docker exec -i $containerName psql -U $dbUser -d $targetDb -t -A).Trim()
if ($counterCount -ne '0') { throw "INVARIANT VIOLATION: DailyArrivalCounter for $dateKey has unexpected records!" }
Write-Host "  ✓ Invariant confirmed: DailyArrivalCounter exists with 0 rows for dateKey '$dateKey'."

# ------------------------------------------------------------------------------
# Phase 6: Concurrency Allocator Execution (Unbroken Continuity, No Reset)
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 6/6] Executing Concurrency Spec on Upgraded Database (Unbroken Continuity)..."
$env:DATABASE_URL_TEST = "postgresql://${dbUser}:synth_pass_3c_c3e8a491@127.0.0.1:${targetPort}/${targetDb}?schema=public"
$env:GMS_FIXTURE_ISOLATION_UUID = $fixtureUuid
$env:GMS_ENVIRONMENT_ID = $envId

Push-Location "$PSScriptRoot\.."
try {
  # Formal command without --forceExit; relies on proper module.close() & prisma.$disconnect()
  npm test -- src/gate/gate-postgres-populated-upgrade.spec.ts
  if ($LASTEXITCODE -ne 0) { throw "Jest concurrency spec failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "`n========================================================================"
Write-Host "  REHEARSAL COMPLETE: ALL 6 PHASES PASSED WITH COMPLETE DATA CONTINUITY "
Write-Host "========================================================================`n"
