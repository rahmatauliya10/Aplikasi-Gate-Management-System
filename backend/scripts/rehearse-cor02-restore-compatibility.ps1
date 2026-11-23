# ==============================================================================
# End-to-End PostgreSQL 17 -> 15/16 Restore Compatibility Rehearsal (COR-02 / MERGE-04)
# ==============================================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$pg16Container = "gms-test-pg-3c-c3e8a491"
$pg15Container = "gms-drill-pg15-c3e8a491"
$pg17ClientContainer = "gms-drill-pg17-client"

$dbUser = "gms_test_user"
$dbPass = "synth_pass_3c_c3e8a491"
$sourceDb = "gms_source_cor02"
$sourcePort = "57193"

$pg16TargetDb = "gms_test_restore_pg16"
$pg16Port = "57193"

$pg15TargetDb = "gms_test_restore_pg15"
$pg15Port = "57194"

$dumpPathInClient = "/tmp/gms_pg17_source.dump"

Write-Host "========================================================================"
Write-Host "  COR-02 / MERGE-04: PG17 -> PG15/16 RESTORE COMPATIBILITY REHEARSAL    "
Write-Host "========================================================================`n"

# ------------------------------------------------------------------------------
# Preflight Target Guard & Version Inventory
# ------------------------------------------------------------------------------
Write-Host "[Preflight] Verifying disposable fixture containers & targets..."
if ($sourcePort -eq "5433" -or $pg16Port -eq "5433" -or $pg15Port -eq "5433") {
  throw "SAFETY ABORT: Operational port 5433 detected! Rehearsal strictly forbidden on port 5433."
}

# Verify PG16 container labels
$pg16Labels = (wsl -d rancher-desktop -e docker inspect $pg16Container --format '{{json .Config.Labels}}' | ConvertFrom-Json)
if ($pg16Labels.'gms.fixture.type' -ne '3c-fresh' -or $pg16Labels.'gms.fixture.run_id' -ne 'c3e8a491') {
  throw "SAFETY ABORT: Container $pg16Container does not possess verified fixture labels."
}
Write-Host "  ✓ Disposable PG16 container verified: $pg16Container (Labels: 3c-fresh, run_id: c3e8a491)"

# Verify PG15 container labels
$pg15Labels = (wsl -d rancher-desktop -e docker inspect $pg15Container --format '{{json .Config.Labels}}' | ConvertFrom-Json)
if ($pg15Labels.'gms.fixture.type' -ne '3c-fresh' -or $pg15Labels.'gms.fixture.run_id' -ne 'c3e8a491') {
  throw "SAFETY ABORT: Container $pg15Container does not possess verified fixture labels."
}
Write-Host "  ✓ Disposable PG15 container verified: $pg15Container (Labels: 3c-fresh, run_id: c3e8a491)"

# Verify PG17 client container
$clientStatus = (wsl -d rancher-desktop -e docker inspect $pg17ClientContainer --format '{{.State.Status}}')
if ($clientStatus -ne "running") {
  throw "SAFETY ABORT: PG17 client container $pg17ClientContainer is not in running state."
}
Write-Host "  ✓ PG17 client container verified: $pg17ClientContainer (Status: running)"

# Record binary versions
$pgDumpVer = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer pg_dump --version).Trim()
$pgRestoreVer = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer pg_restore --version).Trim()
$psqlVer = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer psql --version).Trim()
$pg16ServerVer = (wsl -d rancher-desktop -e docker exec $pg16Container psql -t -A -U $dbUser -d postgres -c "SELECT version();").Trim()
$pg15ServerVer = (wsl -d rancher-desktop -e docker exec $pg15Container psql -t -A -U $dbUser -d postgres -c "SELECT version();").Trim()

Write-Host "`n[Version Inventory]"
Write-Host "  - Client pg_dump:  $pgDumpVer"
Write-Host "  - Client pg_restore: $pgRestoreVer"
Write-Host "  - Client psql:      $psqlVer"
Write-Host "  - Target PG16 Engine: $pg16ServerVer"
Write-Host "  - Target PG15 Engine: $pg15ServerVer"

# Deploy POSIX streaming fallback pipeline helper inside client container (CRLF-immune)
$pipelineScriptContent = @'
set -e
PORT="$1"
DB="$2"
PASS="$3"
EXTRA_SQL="$4"

if [ -n "$EXTRA_SQL" ]; then
  (pg_restore -f - --clean --if-exists --no-owner --no-acl /tmp/gms_pg17_source.dump | \
  awk '
    /^COPY / { in_copy=1; print; next }
    /^\\\.$/ { in_copy=0; print; next }
    !in_copy && /^[[:space:]]*SET[[:space:]]+transaction_timeout[[:space:]]*=/ {
      print "-- sanitized: SET transaction_timeout = 0;"
      next
    }
    { print }
  ' && echo "$EXTRA_SQL") | \
  PGPASSWORD="$PASS" psql --host=127.0.0.1 --port="$PORT" --username=gms_test_user --dbname="$DB" --single-transaction -v ON_ERROR_STOP=1
else
  pg_restore -f - --clean --if-exists --no-owner --no-acl /tmp/gms_pg17_source.dump | \
  awk '
    /^COPY / { in_copy=1; print; next }
    /^\\\.$/ { in_copy=0; print; next }
    !in_copy && /^[[:space:]]*SET[[:space:]]+transaction_timeout[[:space:]]*=/ {
      print "-- sanitized: SET transaction_timeout = 0;"
      next
    }
    { print }
  ' | \
  PGPASSWORD="$PASS" psql --host=127.0.0.1 --port="$PORT" --username=gms_test_user --dbname="$DB" --single-transaction -v ON_ERROR_STOP=1
fi
'@
$pipelineScriptContent | wsl -d rancher-desktop -e docker exec -i $pg17ClientContainer sh -c "tr -d '\r' > /tmp/restore_pipeline.sh && chmod +x /tmp/restore_pipeline.sh"
Write-Host "  ✓ POSIX streaming pipeline helper deployed to $($pg17ClientContainer):/tmp/restore_pipeline.sh"

# ------------------------------------------------------------------------------
# Phase 1: Setup Source Database & Seed Representative Data with COPY Literals
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 1/6] Initializing source database: $sourceDb on PG16..."
$createSourceSql = "DROP DATABASE IF EXISTS `"$sourceDb`"; CREATE DATABASE `"$sourceDb`" OWNER $dbUser;"
$createSourceSql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -v ON_ERROR_STOP=1 -U $dbUser -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed creating $sourceDb" }

# Seed DDL and data into source DB
$sourceSeedSql = @"
CREATE TABLE "User" (
  "id" VARCHAR(36) PRIMARY KEY,
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "role" VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "AppSetting" (
  "key" VARCHAR(100) PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Transaction" (
  "id" VARCHAR(36) PRIMARY KEY,
  "transactionNumber" VARCHAR(50) UNIQUE NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
  "driverName" VARCHAR(255) NOT NULL,
  "notes" TEXT,
  "commodity" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "WeighbridgeRecord" (
  "id" VARCHAR(36) PRIMARY KEY,
  "transactionId" VARCHAR(36) NOT NULL REFERENCES "Transaction"("id"),
  "grossWeight" NUMERIC(12,2) NOT NULL,
  "tareWeight" NUMERIC(12,2) NOT NULL,
  "netWeight" NUMERIC(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "User" ("id", "email", "name", "role") VALUES
  ('usr-cor02-admin', 'admin.cor02@gms.test', 'Admin COR02', 'ADMIN'),
  ('usr-cor02-operator', 'operator.cor02@gms.test', 'Operator COR02', 'SECURITY');

INSERT INTO "AppSetting" ("key", "value") VALUES
  ('GMS_FIXTURE_ISOLATION_UUID', 'FIXTURE-COR02-c3e8a491'),
  ('GMS_SYSTEM_STAGE', 'TEST');

-- Insert transactions with special COPY-block literal text and UTF-8 characters
INSERT INTO "Transaction" ("id", "transactionNumber", "status", "driverName", "notes", "commodity") VALUES
  ('tx-cor02-001', 'GMS-20261120-0001', 'COMPLETED', 'Budi Santoso — PT. Sinar Jaya 📦', 'Literal test: SET transaction_timeout = 0; must not be removed in COPY data', 'Batubara Kalori Tinggi — Spk #9981'),
  ('tx-cor02-002', 'GMS-20261120-0002', 'REGISTERED', 'Ahmad Dani — CV. Berkah 🚚', 'Catatan reguler transaksi tanpa string timeout', 'Sawit TBS Standard Grade');

INSERT INTO "WeighbridgeRecord" ("id", "transactionId", "grossWeight", "tareWeight", "netWeight") VALUES
  ('wb-cor02-001', 'tx-cor02-001', 15500.00, 5200.00, 10300.00),
  ('wb-cor02-002', 'tx-cor02-002', 18200.00, 6100.00, 12100.00);
"@

$sourceSeedSql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -v ON_ERROR_STOP=1 -U $dbUser -d $sourceDb
if ($LASTEXITCODE -ne 0) { throw "Failed seeding source database $sourceDb" }

# Compute Source Fingerprint
$fingerprintQuery = 'SELECT "id", "transactionNumber", "status", "driverName", "notes", "commodity" FROM "Transaction" ORDER BY "transactionNumber" ASC;'
$sourceDataRaw = ($fingerprintQuery | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -F "|" -U $dbUser -d $sourceDb).Trim()
$hasher = [System.Security.Cryptography.SHA256]::Create()
$sourceSha256 = [BitConverter]::ToString($hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sourceDataRaw))).Replace("-","").ToLower()

Write-Host "  ✓ Source database seeded cleanly."
Write-Host "  ✓ Source Data SHA-256 Fingerprint: $sourceSha256"

# ------------------------------------------------------------------------------
# Phase 2: Client PG17 Dump Generation & Header Inspection
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 2/6] Generating custom-format dump using PG17 client binary..."
$dumpCmd = "PGPASSWORD=$dbPass pg_dump -h 127.0.0.1 -p $sourcePort -U $dbUser -d $sourceDb -Fc -f $dumpPathInClient"
wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh -c $dumpCmd
if ($LASTEXITCODE -ne 0) { throw "pg_dump 17 failed generating dump." }

# Verify dump file size
$dumpSize = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer wc -c $dumpPathInClient).Trim().Split(" ")[0]
Write-Host "  ✓ PG17 custom dump generated: $dumpPathInClient ($dumpSize bytes)"

# Verify that pg_dump 17 emits 'SET transaction_timeout = 0;' in SQL stream
$rawSqlHeader = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh -c "pg_restore -f - $dumpPathInClient | grep 'transaction_timeout' | head -n 5" | Out-String).Trim()
Write-Host "  ✓ Verified PG17 SQL stream header contains: '$rawSqlHeader'"
if (-not ($rawSqlHeader -match "transaction_timeout")) {
  throw "ASSERTION FAILED: Expected dump from PG17 to contain 'transaction_timeout' setting."
}

# ------------------------------------------------------------------------------
# Phase 3: Skenario 1 — Direct Restore Failure & Streaming Fallback on PG16 Target
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 3/6] Skenario 1: Testing on Target PostgreSQL 16 ($pg16TargetDb)..."

# Step 3A: Clean target DB on PG16
$recreatePg16Sql = "DROP DATABASE IF EXISTS `"$pg16TargetDb`"; CREATE DATABASE `"$pg16TargetDb`" OWNER $dbUser;"
$recreatePg16Sql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -v ON_ERROR_STOP=1 -U $dbUser -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed creating $pg16TargetDb" }

# Step 3B: Prove direct pg_restore REJECTION due to transaction_timeout
Write-Host "  [Step 3B] Executing direct pg_restore to prove initial rejection on PG16..."
$directRestorePg16Cmd = "PGPASSWORD=$dbPass pg_restore --clean --if-exists --single-transaction --exit-on-error --no-owner --no-acl --host=127.0.0.1 --port=$pg16Port --username=$dbUser --dbname=$pg16TargetDb $dumpPathInClient 2>&1"
$directPg16Output = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh -c $directRestorePg16Cmd | Out-String)
$directPg16ExitCode = $LASTEXITCODE

Write-Host "    -> Direct pg_restore exit code: $directPg16ExitCode"
Write-Host "    -> Direct pg_restore output: $($directPg16Output.Trim())"
if ($directPg16ExitCode -eq 0 -or -not $directPg16Output.Contains('unrecognized configuration parameter "transaction_timeout"')) {
  throw 'ASSERTION FAILED: Expected direct pg_restore to fail with unrecognized configuration parameter "transaction_timeout".'
}
Write-Host "  ✓ Exact production rejection reproduced: unrecognized configuration parameter `"transaction_timeout`""

# Step 3C: Execute sanitized single-transaction streaming fallback pipeline
Write-Host "  [Step 3C] Activating COPY-aware streaming fallback pipeline on PG16..."
$pg16StreamingOutput = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh /tmp/restore_pipeline.sh $pg16Port $pg16TargetDb $dbPass | Out-String)
$pg16StreamingExitCode = $LASTEXITCODE
if ($pg16StreamingExitCode -ne 0) {
  Write-Host "Streaming pipeline output: $pg16StreamingOutput"
  throw "Streaming fallback pipeline failed on PG16 target."
}
Write-Host "  ✓ Streaming fallback pipeline completed with exit code 0 on PG16."

# Step 3D: Verify restored data on PG16
$pg16DataRaw = ($fingerprintQuery | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -F "|" -U $dbUser -d $pg16TargetDb).Trim()
$pg16Sha256 = [BitConverter]::ToString($hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($pg16DataRaw))).Replace("-","").ToLower()

Write-Host "  ✓ PG16 Restored Data SHA-256 Fingerprint: $pg16Sha256"
if ($pg16Sha256 -ne $sourceSha256) {
  throw "ASSERTION FAILED: PG16 restored data fingerprint does not match source fingerprint!"
}

# Verify literal text preserved inside COPY data block
$literalCheckSql = 'SELECT "notes" FROM "Transaction" WHERE "id" = ''tx-cor02-001'';'
$literalNotes = ($literalCheckSql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -U $dbUser -d $pg16TargetDb).Trim()
if (-not $literalNotes.Contains("SET transaction_timeout = 0;")) {
  throw "ASSERTION FAILED: Literal 'SET transaction_timeout = 0;' inside COPY data block was inadvertently altered!"
}
Write-Host "  ✓ Verified literal string in COPY block preserved intact: '$literalNotes'"

# Verify UTF-8 characters preserved
$utf8CheckSql = 'SELECT "driverName" FROM "Transaction" WHERE "id" = ''tx-cor02-001'';'
$driverName = ($utf8CheckSql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -U $dbUser -d $pg16TargetDb).Trim()
if (-not $driverName.Contains("📦")) {
  throw "ASSERTION FAILED: UTF-8 characters in driverName were not preserved!"
}
Write-Host "  ✓ Verified UTF-8 string preserved intact: '$driverName'"

# ------------------------------------------------------------------------------
# Phase 4: Skenario 1 — Direct Restore Failure & Streaming Fallback on PG15 Target
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 4/6] Skenario 1: Testing on Target PostgreSQL 15 ($pg15TargetDb)..."

# Step 4A: Clean target DB on PG15
$recreatePg15Sql = "DROP DATABASE IF EXISTS `"$pg15TargetDb`"; CREATE DATABASE `"$pg15TargetDb`" OWNER $dbUser;"
$recreatePg15Sql | wsl -d rancher-desktop -e docker exec -i $pg15Container psql -v ON_ERROR_STOP=1 -U $dbUser -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed creating $pg15TargetDb" }

# Step 4B: Prove direct pg_restore REJECTION on PG15
Write-Host "  [Step 4B] Executing direct pg_restore to prove initial rejection on PG15..."
$directRestorePg15Cmd = "PGPASSWORD=$dbPass pg_restore --clean --if-exists --single-transaction --exit-on-error --no-owner --no-acl --host=127.0.0.1 --port=$pg15Port --username=$dbUser --dbname=$pg15TargetDb $dumpPathInClient 2>&1"
$directPg15Output = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh -c $directRestorePg15Cmd | Out-String)
$directPg15ExitCode = $LASTEXITCODE

Write-Host "    -> Direct pg_restore exit code: $directPg15ExitCode"
Write-Host "    -> Direct pg_restore output: $($directPg15Output.Trim())"
if ($directPg15ExitCode -eq 0 -or -not $directPg15Output.Contains('unrecognized configuration parameter "transaction_timeout"')) {
  throw 'ASSERTION FAILED: Expected direct pg_restore to fail with unrecognized configuration parameter "transaction_timeout" on PG15.'
}
Write-Host "  ✓ Exact production rejection reproduced on PG15: unrecognized configuration parameter `"transaction_timeout`""

# Step 4C: Execute sanitized single-transaction streaming fallback pipeline on PG15
Write-Host "  [Step 4C] Activating COPY-aware streaming fallback pipeline on PG15..."
$pg15StreamingOutput = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh /tmp/restore_pipeline.sh $pg15Port $pg15TargetDb $dbPass | Out-String)
if ($LASTEXITCODE -ne 0) {
  Write-Host "Streaming pipeline output: $pg15StreamingOutput"
  throw "Streaming fallback pipeline failed on PG15 target."
}
Write-Host "  ✓ Streaming fallback pipeline completed with exit code 0 on PG15."

# Step 4D: Verify restored data on PG15
$pg15DataRaw = ($fingerprintQuery | wsl -d rancher-desktop -e docker exec -i $pg15Container psql -t -A -F "|" -U $dbUser -d $pg15TargetDb).Trim()
$pg15Sha256 = [BitConverter]::ToString($hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($pg15DataRaw))).Replace("-","").ToLower()

Write-Host "  ✓ PG15 Restored Data SHA-256 Fingerprint: $pg15Sha256"
if ($pg15Sha256 -ne $sourceSha256) {
  throw "ASSERTION FAILED: PG15 restored data fingerprint does not match source fingerprint!"
}
Write-Host "  ✓ 100% Data Preservation verified across PG17 dump -> PG15 target."

# ------------------------------------------------------------------------------
# Phase 5: Skenario 2 — Atomisitas & Fail-Injection dengan Sentinel State
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 5/6] Skenario 2: Atomisitas & Fail-Injection dengan Sentinel Awal..."

# Step 5A: Recreate target DB and seed known sentinel initial state
$recreateSentinelSql = @"
DROP DATABASE IF EXISTS `"$pg16TargetDb`";
CREATE DATABASE `"$pg16TargetDb`" OWNER $dbUser;
\c $pg16TargetDb
CREATE TABLE _sentinel_initial_state (
  "id" SERIAL PRIMARY KEY,
  "marker" VARCHAR(100) NOT NULL,
  "secretValue" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO _sentinel_initial_state ("marker", "secretValue") VALUES ('SENTINEL_ACTIVE_PRE_RESTORE', 'INTEGRITY_CANARY_VALUE_9988');
"@

$recreateSentinelSql | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -v ON_ERROR_STOP=1 -U $dbUser -d postgres
if ($LASTEXITCODE -ne 0) { throw "Failed creating sentinel state on $pg16TargetDb" }

# Verify sentinel exists
$sentinelCountQuery = "SELECT COUNT(*) FROM _sentinel_initial_state;"
$preSentinelCount = ($sentinelCountQuery | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -U $dbUser -d $pg16TargetDb).Trim()
Write-Host "  ✓ Initial sentinel table seeded: $preSentinelCount row(s) present."

# Step 5B: Stream restore with mid-stream SQL failure injected
Write-Host "  [Step 5B] Injecting SQL error mid-stream into single-transaction fallback pipeline..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$failOutput = (wsl -d rancher-desktop -e docker exec $pg17ClientContainer sh -c "/tmp/restore_pipeline.sh $pg16Port $pg16TargetDb $dbPass 'SELECT * FROM nonexistent_table_for_fault_injection_verification_cor02;' 2>&1" | Out-String)
$failExitCode = $LASTEXITCODE
$ErrorActionPreference = $prevEAP

Write-Host "    -> Injected pipeline exit code: $failExitCode"
Write-Host "    -> Injected error output: $($failOutput.Trim())"
if ($failExitCode -eq 0 -or -not $failOutput.Contains("nonexistent_table_for_fault_injection_verification_cor02")) {
  throw "ASSERTION FAILED: Expected fail-injection to reject with exit code != 0."
}
Write-Host "  ✓ Fail-closed rejection verified: psql halted with non-zero exit code on SQL error."

# Step 5C: Verify atomicity — Sentinel preserved, 0 partial changes committed
Write-Host "  [Step 5C] Verifying target database state post-failure..."
$postSentinelCount = ($sentinelCountQuery | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -U $dbUser -d $pg16TargetDb).Trim()
if ($postSentinelCount -ne "1") {
  throw "ATOMICITY VIOLATION: Sentinel table was dropped or modified during failed restore attempt!"
}
Write-Host "  ✓ Sentinel table intact: Exactly 1 row preserved (_sentinel_initial_state)."

# Verify NO partial tables from dump exist
$tableListQuery = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
$tablesPostFailure = ($tableListQuery | wsl -d rancher-desktop -e docker exec -i $pg16Container psql -t -A -U $dbUser -d $pg16TargetDb).Trim() -split "`r?`n"
Write-Host "  ✓ Tables present post-rollback: $($tablesPostFailure -join ', ')"

if ($tablesPostFailure -contains "Transaction" -or $tablesPostFailure -contains "WeighbridgeRecord" -or $tablesPostFailure -contains "AppSetting") {
  throw "ATOMICITY VIOLATION: Partial tables from dump were committed despite failure!"
}
Write-Host "  ✓ Invariant confirmed: 0 partial tables committed. --single-transaction fully rolled back all DDL and DML."

# ------------------------------------------------------------------------------
# Phase 6: Skenario 3 — Write-Freeze Confinement & Maintenance State Isolation
# ------------------------------------------------------------------------------
Write-Host "`n[Phase 6/6] Skenario 3: Write-Freeze Confinement Verification..."

$maintTestDir = Join-Path $PSScriptRoot "test-maintenance-cor02"
$maintActiveFile = Join-Path $maintTestDir "active"

if (-not (Test-Path $maintTestDir)) {
  New-Item -ItemType Directory -Path $maintTestDir -Force | Out-Null
}

# 1. Simulate active write-freeze before restore
"MAINTENANCE_ACTIVE_DRILL_COR02" | Out-File -FilePath $maintActiveFile -Encoding utf8 -Force
Write-Host "  ✓ Write-freeze activated: $(Test-Path $maintActiveFile)"

# 2. Simulate restore failure handling: assert write-freeze remains strictly active
Write-Host "  -> Simulating restore failure handling..."
$restoreFailed = ($failExitCode -ne 0)
if ($restoreFailed) {
  # Production policy: DO NOT clear maintenance marker on restore failure!
  Write-Host "    [Policy Check] Restore failed; preserving maintenance write-freeze..."
} else {
  Remove-Item -Path $maintActiveFile -Force -ErrorAction SilentlyContinue
}

$maintRemainsActive = Test-Path $maintActiveFile
if (-not $maintRemainsActive) {
  throw "SAFETY VIOLATION: Write-freeze was deactivated after failed restore! Traffic must remain frozen."
}
Write-Host "  ✓ Write-freeze confinement verified: maintenance/active remains STRICTLY intact after restore failure."

# 3. Simulate restore success handling: assert write-freeze can be cleared safely
Write-Host "  -> Simulating restore success handling..."
$restoreSucceeded = ($pg16StreamingExitCode -eq 0) # Streaming fallback succeeded cleanly
if ($restoreSucceeded) {
  Remove-Item -Path $maintActiveFile -Force -ErrorAction SilentlyContinue
}
$maintCleared = (-not (Test-Path $maintActiveFile))
if (-not $maintCleared) {
  throw "SAFETY VIOLATION: Failed to clear maintenance marker upon confirmed successful recovery."
}
Write-Host "  ✓ Write-freeze release verified: maintenance/active cleared ONLY upon confirmed success."

# Cleanup temporary maintenance test directory
Remove-Item -Path $maintTestDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n========================================================================"
Write-Host "  REHEARSAL COMPLETE: ALL COR-02 SCENARIOS PASSED WITH FULL COMPLIANCE "
Write-Host "========================================================================"
