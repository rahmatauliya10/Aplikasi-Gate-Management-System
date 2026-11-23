/**
 * ==============================================================================
 * COR-02 / MERGE-04: End-to-End Production Fallback Restore Integration Drill
 * ==============================================================================
 * Directly tests the application's production restore fallback implementation:
 * - DatabaseBackupService.executePgRestoreWithFallback()
 * - createSanitizingTransformStream()
 * - executeStreamingRestorePipeline()
 *
 * Runs inside PG17 container with real pg_dump 17, pg_restore 17, psql 17
 * targeting disposable PostgreSQL 16 and PostgreSQL 15 engines.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');
const { execFileSync, execSync } = child_process;
const { StringDecoder } = require('string_decoder');

// Import compiled production service from dist
const {
  DatabaseBackupService,
  createSanitizingTransformStream,
  executeStreamingRestorePipeline,
} = require('../dist/src/settings/database-backup.service.js');

const dbUser = process.env.DB_USER || 'gms_test_user';
const dbPass = process.env.DB_PASS || 'synth_pass_3c_c3e8a491';
const pg16Port = process.env.PG16_PORT || '57193';
const pg15Port = process.env.PG15_PORT || '57194';
const sourceDb = 'gms_source_cor02';
const pg16TargetDb = 'gms_test_restore_pg16';
const pg15TargetDb = 'gms_test_restore_pg15';
const host = '127.0.0.1';
const dumpPath = '/tmp/gms_pg17_source.dump';
const truncatedDumpPath = '/tmp/gms_pg17_truncated.dump';

function computeSha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Creates a stream hook that inspects incoming data for a COPY block,
 * buffers lines to guarantee clean chunk boundary handling, and injects
 * a fatal SQL syntax error immediately following the exact termination of COPY (\.).
 * Guarantees every byte of input is forwarded EXACTLY ONCE (zero duplication/corruption).
 */
function createFaultInjectingStreamHook(targetCopyPattern, injectedSqlStatement, onInjected) {
  const decoder = new StringDecoder('utf8');
  let pendingBuffer = '';
  let inTargetCopy = false;
  let copyBlockEnded = false;
  let faultInjected = false;

  return {
    processChunk(chunk) {
      if (faultInjected) {
        return Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      }

      const text = pendingBuffer + (Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk));
      const lines = text.split('\n');
      pendingBuffer = lines.pop() ?? '';

      let output = '';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (targetCopyPattern.test(trimmed)) {
          inTargetCopy = true;
        }

        output += line + '\n';

        if (inTargetCopy && trimmed === '\\.') {
          inTargetCopy = false;
          copyBlockEnded = true;
          faultInjected = true;
          output += injectedSqlStatement;
          if (typeof onInjected === 'function') {
            onInjected();
          }

          for (let j = i + 1; j < lines.length; j++) {
            output += lines[j] + '\n';
          }
          if (pendingBuffer) {
            output += pendingBuffer;
            pendingBuffer = '';
          }
          break;
        }
      }

      return output;
    },

    flush() {
      let output = '';
      const finalDecoded = pendingBuffer + decoder.end();
      pendingBuffer = '';
      if (finalDecoded) {
        output += finalDecoded;
      }
      return output;
    },

    getState() {
      return {
        inTargetCopy,
        copyBlockEnded,
        faultInjected,
      };
    },
  };
}

/**
 * Validates the stream hook in-memory across all 4 boundary conditions
 * before any database operations occur:
 * 1. Header COPY split across chunks
 * 2. Data row split across chunks
 * 3. Terminator (\.) split across chunks
 * 4. Multi-byte UTF-8 character split across Buffer chunks
 */
function runInMemoryHookTests() {
  console.log('[In-Memory Seam Hook Validation: Split-Chunk & UTF-8 Tests]');
  const injectedSql = 'SELECT * FROM nonexistent_table_injected_cor02_error;\n';

  // Test 1: Header COPY terpecah
  {
    const hook = createFaultInjectingStreamHook(/^COPY\s+"Transaction"/i, injectedSql);
    const chunk1 = 'SET standard_conforming_strings = on;\nCOPY "Trans';
    const chunk2 = 'action" ("id", "num") FROM stdin;\n1\tABC\n\\.\nCOMMIT;\n';
    const out1 = hook.processChunk(chunk1);
    const out2 = hook.processChunk(chunk2);
    const outFlush = hook.flush();
    const actual = out1 + out2 + outFlush;
    const expected = (chunk1 + chunk2).replace('\\.\n', '\\.\n' + injectedSql);
    if (actual !== expected) {
      throw new Error(`In-Memory Test 1 Failed: Split COPY Header mismatch!\nExpected:\n${expected}\nActual:\n${actual}`);
    }
    const state = hook.getState();
    if (!state.copyBlockEnded || !state.faultInjected) {
      throw new Error('In-Memory Test 1 Failed: Hook state did not record injection!');
    }
    console.log('  ✓ Test 1/4: Split COPY Header passed (exact byte preservation).');
  }

  // Test 2: Baris data terpecah
  {
    const hook = createFaultInjectingStreamHook(/^COPY\s+"Transaction"/i, injectedSql);
    const chunk1 = 'COPY "Transaction" ("id", "name") FROM stdin;\ntx-001\tBudi';
    const chunk2 = ' Santoso\ntx-002\tAhmad\n\\.\n';
    const out1 = hook.processChunk(chunk1);
    const out2 = hook.processChunk(chunk2);
    const outFlush = hook.flush();
    const actual = out1 + out2 + outFlush;
    const expected = (chunk1 + chunk2).replace('\\.\n', '\\.\n' + injectedSql);
    if (actual !== expected) {
      throw new Error(`In-Memory Test 2 Failed: Split Data Row mismatch!\nExpected:\n${expected}\nActual:\n${actual}`);
    }
    console.log('  ✓ Test 2/4: Split Data Row passed (exact byte preservation, zero duplication).');
  }

  // Test 3: Terminator (\.) terpecah
  {
    const hook = createFaultInjectingStreamHook(/^COPY\s+"Transaction"/i, injectedSql);
    const chunk1 = 'COPY "Transaction" ("id") FROM stdin;\ntx-001\n\\';
    const chunk2 = '.\nSELECT 1;\n';
    const out1 = hook.processChunk(chunk1);
    const out2 = hook.processChunk(chunk2);
    const outFlush = hook.flush();
    const actual = out1 + out2 + outFlush;
    const expected = (chunk1 + chunk2).replace('\\.\n', '\\.\n' + injectedSql);
    if (actual !== expected) {
      throw new Error(`In-Memory Test 3 Failed: Split Terminator (\\.) mismatch!\nExpected:\n${expected}\nActual:\n${actual}`);
    }
    console.log('  ✓ Test 3/4: Split Terminator (\\.) passed (exact post-COPY injection).');
  }

  // Test 4: Karakter UTF-8 terpecah bila hook menerima Buffer
  {
    const hook = createFaultInjectingStreamHook(/^COPY\s+"Transaction"/i, injectedSql);
    // 📦 is 4 bytes: 0xF0, 0x9F, 0x93, 0xA6
    const chunk1 = Buffer.concat([
      Buffer.from('COPY "Transaction" ("name") FROM stdin;\nBudi ', 'utf8'),
      Buffer.from([0xF0, 0x9F]),
    ]);
    const chunk2 = Buffer.concat([
      Buffer.from([0x93, 0xA6]),
      Buffer.from(' Jaya\n\\.\n', 'utf8'),
    ]);
    const out1 = hook.processChunk(chunk1);
    const out2 = hook.processChunk(chunk2);
    const outFlush = hook.flush();
    const actual = out1 + out2 + outFlush;
    const expected = 'COPY "Transaction" ("name") FROM stdin;\nBudi 📦 Jaya\n\\.\n' + injectedSql;
    if (actual !== expected) {
      throw new Error(`In-Memory Test 4 Failed: Split Multi-byte UTF-8 Buffer mismatch!\nExpected:\n${expected}\nActual:\n${actual}`);
    }
    console.log('  ✓ Test 4/4: Split Multi-byte UTF-8 Buffer passed (zero byte corruption).');
  }
  console.log('  ✓ In-Memory Suite PASS: Every input byte forwarded exactly once, output strictly equal to input + 1 statement.\n');
}

function runPsql(port, db, sql) {
  return execFileSync(
    'psql',
    [
      '--host=' + host,
      '--port=' + port,
      '--username=' + dbUser,
      '--dbname=' + db,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    {
      env: { ...process.env, PGPASSWORD: dbPass, PGOPTIONS: '-c client_min_messages=warning' },
      encoding: 'utf8',
    },
  ).trim();
}

function runPsqlScript(port, db, sqlScript) {
  return execFileSync(
    'psql',
    [
      '--host=' + host,
      '--port=' + port,
      '--username=' + dbUser,
      '--dbname=' + db,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    {
      input: sqlScript,
      env: { ...process.env, PGPASSWORD: dbPass, PGOPTIONS: '-c client_min_messages=warning' },
      encoding: 'utf8',
    },
  ).trim();
}

async function main() {
  console.log('========================================================================');
  console.log('  COR-02 / MERGE-04: PRODUCTION RESTORE FALLBACK INTEGRATION DRILL      ');
  console.log('========================================================================\n');

  // Preflight Safety Guard
  if (pg16Port === '5433' || pg15Port === '5433') {
    throw new Error('SAFETY ABORT: Operational port 5433 detected! Prohibited.');
  }

  // Version Inventory
  const pgDumpVer = execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }).trim();
  const pgRestoreVer = execFileSync('pg_restore', ['--version'], { encoding: 'utf8' }).trim();
  const psqlVer = execFileSync('psql', ['--version'], { encoding: 'utf8' }).trim();
  const nodeVer = process.version;
  const pg16EngineVer = runPsql(pg16Port, 'postgres', 'SELECT version();');
  const pg15EngineVer = runPsql(pg15Port, 'postgres', 'SELECT version();');

  console.log('[Version Inventory]');
  console.log(`  - Node.js runtime:   ${nodeVer}`);
  console.log(`  - Client pg_dump:    ${pgDumpVer}`);
  console.log(`  - Client pg_restore: ${pgRestoreVer}`);
  console.log(`  - Client psql:       ${psqlVer}`);
  console.log(`  - Target PG16 Engine: ${pg16EngineVer}`);
  console.log(`  - Target PG15 Engine: ${pg15EngineVer}\n`);

  // Run in-memory stream hook unit tests before executing database integration tests
  runInMemoryHookTests();

  // Instantiate production service (using null mocks for unused constructor deps)
  const service = new DatabaseBackupService(null, null);

  // ----------------------------------------------------------------------------
  // Phase 1: Setup Source Database on PG16 with COPY literal and UTF-8 characters
  // ----------------------------------------------------------------------------
  console.log(`\n[Phase 1/5] Initializing source database: ${sourceDb} on PG16...`);
  try {
    runPsql(pg16Port, 'postgres', `DROP DATABASE IF EXISTS "${sourceDb}";`);
    runPsql(pg16Port, 'postgres', `CREATE DATABASE "${sourceDb}" OWNER ${dbUser};`);
  } catch (err) {
    throw new Error(`Failed creating source database: ${err.message}`);
  }

  const seedSql = `
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

    INSERT INTO "Transaction" ("id", "transactionNumber", "status", "driverName", "notes", "commodity") VALUES
      ('tx-cor02-001', 'GMS-20261120-0001', 'COMPLETED', 'Budi Santoso — PT. Sinar Jaya 📦', 'Literal test: SET transaction_timeout = 0; must not be removed in COPY data', 'Batubara Kalori Tinggi — Spk #9981'),
      ('tx-cor02-002', 'GMS-20261120-0002', 'REGISTERED', 'Ahmad Dani — CV. Berkah 🚚', 'Catatan reguler transaksi tanpa string timeout', 'Sawit TBS Standard Grade');

    INSERT INTO "WeighbridgeRecord" ("id", "transactionId", "grossWeight", "tareWeight", "netWeight") VALUES
      ('wb-cor02-001', 'tx-cor02-001', 15500.00, 5200.00, 10300.00),
      ('wb-cor02-002', 'tx-cor02-002', 18200.00, 6100.00, 12100.00);
  `;
  runPsqlScript(pg16Port, sourceDb, seedSql);

  const fingerprintQuery = 'SELECT "id", "transactionNumber", "status", "driverName", "notes", "commodity" FROM "Transaction" ORDER BY "transactionNumber" ASC;';
  const sourceDataRaw = runPsql(pg16Port, sourceDb, fingerprintQuery);
  const sourceSha256 = computeSha256(sourceDataRaw);

  console.log('  ✓ Source database seeded cleanly.');
  console.log(`  ✓ Source Data SHA-256 Fingerprint: ${sourceSha256}`);

  // ----------------------------------------------------------------------------
  // Phase 2: Generate PG17 Custom Dump
  // ----------------------------------------------------------------------------
  console.log('\n[Phase 2/5] Generating custom-format dump using PG17 client binary...');
  execFileSync('pg_dump', [
    '-h', host,
    '-p', pg16Port,
    '-U', dbUser,
    '-d', sourceDb,
    '-Fc',
    '-f', dumpPath,
  ], {
    env: { ...process.env, PGPASSWORD: dbPass },
  });

  const dumpStats = fs.statSync(dumpPath);
  console.log(`  ✓ PG17 custom dump generated: ${dumpPath} (${dumpStats.size} bytes)`);

  // Verify dump SQL stream contains 'SET transaction_timeout = 0;'
  const rawSqlHeader = execFileSync('pg_restore', ['-f', '-', dumpPath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!rawSqlHeader.includes('SET transaction_timeout = 0;')) {
    throw new Error('ASSERTION FAILED: Expected PG17 dump to contain SET transaction_timeout = 0;');
  }
  console.log("  ✓ Verified PG17 SQL stream header contains 'SET transaction_timeout = 0;'");

  // ----------------------------------------------------------------------------
  // Phase 3: Skenario 1 — Direct Production Fallback Method on Target PG16
  // ----------------------------------------------------------------------------
  console.log(`\n[Phase 3/5] Skenario 1: Invoking production executePgRestoreWithFallback() on PG16 (${pg16TargetDb})...`);
  runPsql(pg16Port, 'postgres', `DROP DATABASE IF EXISTS "${pg16TargetDb}";`);
  runPsql(pg16Port, 'postgres', `CREATE DATABASE "${pg16TargetDb}" OWNER ${dbUser};`);

  // Call the actual production method
  await service['executePgRestoreWithFallback'](
    dumpPath,
    host,
    pg16Port,
    dbUser,
    pg16TargetDb,
    dbPass,
  );
  console.log('  ✓ executePgRestoreWithFallback() resolved successfully on PG16 target.');

  const pg16DataRaw = runPsql(pg16Port, pg16TargetDb, fingerprintQuery);
  const pg16Sha256 = computeSha256(pg16DataRaw);
  console.log(`  ✓ PG16 Restored Data SHA-256 Fingerprint: ${pg16Sha256}`);
  if (pg16Sha256 !== sourceSha256) {
    throw new Error(`FINGERPRINT MISMATCH: PG16 fingerprint ${pg16Sha256} does not match source ${sourceSha256}`);
  }
  console.log('  ✓ 100% Data Preservation verified across PG17 dump -> PG16 target.');

  // Verify COPY literal preservation
  const notesCheck = runPsql(pg16Port, pg16TargetDb, 'SELECT "notes" FROM "Transaction" WHERE "id" = \'tx-cor02-001\';');
  if (!notesCheck.includes('SET transaction_timeout = 0;')) {
    throw new Error('ASSERTION FAILED: Literal string inside COPY block was inadvertently sanitized!');
  }
  console.log(`  ✓ Verified literal string in COPY block preserved intact: '${notesCheck}'`);

  // Verify UTF-8 multibyte characters
  const driverCheck = runPsql(pg16Port, pg16TargetDb, 'SELECT "driverName" FROM "Transaction" WHERE "id" = \'tx-cor02-001\';');
  if (!driverCheck.includes('📦')) {
    throw new Error(`ASSERTION FAILED: Multibyte UTF-8 characters were corrupted: '${driverCheck}'`);
  }
  console.log(`  ✓ Verified UTF-8 string preserved intact: '${driverCheck}'`);

  // ----------------------------------------------------------------------------
  // Phase 4: Skenario 1 — Direct Production Fallback Method on Target PG15
  // ----------------------------------------------------------------------------
  console.log(`\n[Phase 4/5] Skenario 1: Invoking production executePgRestoreWithFallback() on PG15 (${pg15TargetDb})...`);
  runPsql(pg15Port, 'postgres', `DROP DATABASE IF EXISTS "${pg15TargetDb}";`);
  runPsql(pg15Port, 'postgres', `CREATE DATABASE "${pg15TargetDb}" OWNER ${dbUser};`);

  // Call the actual production method
  await service['executePgRestoreWithFallback'](
    dumpPath,
    host,
    pg15Port,
    dbUser,
    pg15TargetDb,
    dbPass,
  );
  console.log('  ✓ executePgRestoreWithFallback() resolved successfully on PG15 target.');

  const pg15DataRaw = runPsql(pg15Port, pg15TargetDb, fingerprintQuery);
  const pg15Sha256 = computeSha256(pg15DataRaw);
  console.log(`  ✓ PG15 Restored Data SHA-256 Fingerprint: ${pg15Sha256}`);
  if (pg15Sha256 !== sourceSha256) {
    throw new Error(`FINGERPRINT MISMATCH: PG15 fingerprint ${pg15Sha256} does not match source ${sourceSha256}`);
  }
  console.log('  ✓ 100% Data Preservation verified across PG17 dump -> PG15 target.');

  // ----------------------------------------------------------------------------
  // Phase 5A: Skenario 2A — Corrupt/Truncated Dump Archive Rejection
  // ----------------------------------------------------------------------------
  console.log(`\n[Phase 5A/6] Skenario 2A: Corrupt/Truncated Dump Archive Rejection on Target PG16...`);

  // Seed known pre-existing table that WILL be targeted for DROP by --clean in the dump
  console.log('  [Step 5A.1] Seeding pre-existing record into target database...');
  runPsql(pg16Port, 'postgres', `DROP DATABASE IF EXISTS "${pg16TargetDb}";`);
  runPsql(pg16Port, 'postgres', `CREATE DATABASE "${pg16TargetDb}" OWNER ${dbUser};`);

  const preExistingSql = `
    CREATE TABLE "Transaction" (
      "id" VARCHAR(36) PRIMARY KEY,
      "transactionNumber" VARCHAR(50) UNIQUE NOT NULL,
      "status" VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
      "driverName" VARCHAR(255) NOT NULL,
      "notes" TEXT,
      "commodity" VARCHAR(100) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO "Transaction" ("id", "transactionNumber", "status", "driverName", "notes", "commodity") VALUES
      ('tx-pre-existing-001', 'GMS-PRE-EXISTING-001', 'COMPLETED', 'Pre-Restore Driver Alpha', 'Kondisi awal sebelum restore gagal', 'Komoditas Awal');
  `;
  runPsqlScript(pg16Port, pg16TargetDb, preExistingSql);

  const preRecord = runPsql(pg16Port, pg16TargetDb, 'SELECT "transactionNumber" FROM "Transaction";');
  console.log(`  ✓ Pre-restore state verified: Transaction has record '${preRecord}'`);

  // Create truncated corrupt dump (cutting off mid-stream during table load)
  const fullDumpBytes = fs.readFileSync(dumpPath);
  const truncatedBytes = fullDumpBytes.slice(0, 3500);
  fs.writeFileSync(truncatedDumpPath, truncatedBytes);
  console.log(`  ✓ Created truncated dump for fail-injection: ${truncatedDumpPath} (${truncatedBytes.length} bytes)`);

  // Invoke executePgRestoreWithFallback with truncated dump -> MUST REJECT
  console.log('  [Step 5A.2] Invoking executePgRestoreWithFallback() with truncated dump...');
  let truncatedRejected = false;
  try {
    await service['executePgRestoreWithFallback'](
      truncatedDumpPath,
      host,
      pg16Port,
      dbUser,
      pg16TargetDb,
      dbPass,
    );
  } catch (err) {
    truncatedRejected = true;
    console.log(`  ✓ Corrupt dump rejected fail-closed as expected with error: ${err.message}`);
  }

  if (!truncatedRejected) {
    throw new Error('ATOMICITY VIOLATION: Expected executePgRestoreWithFallback() to reject on corrupted/truncated dump!');
  }

  const postTruncatedRecords = runPsql(pg16Port, pg16TargetDb, 'SELECT "transactionNumber" FROM "Transaction";');
  if (!postTruncatedRecords.includes('GMS-PRE-EXISTING-001')) {
    throw new Error('ATOMICITY VIOLATION: Pre-existing record was lost on truncated dump attempt!');
  }
  console.log('  ✓ Invariant confirmed: Corrupt dump rejected without data loss on pre-existing records.');

  // ----------------------------------------------------------------------------
  // Phase 5B: Skenario 2B — In-Stream Fallback Fault-Injection & Rollback Proof
  // ----------------------------------------------------------------------------
  console.log(`\n[Phase 5B/5] Skenario 2B: In-Stream Fallback Fault-Injection & Transactional Rollback...`);

  // Reset target database and seed 3 diverse pre-existing records
  runPsql(pg16Port, 'postgres', `DROP DATABASE IF EXISTS "${pg16TargetDb}";`);
  runPsql(pg16Port, 'postgres', `CREATE DATABASE "${pg16TargetDb}" OWNER ${dbUser};`);

  const preExistingMultiSql = `
    CREATE TABLE "Transaction" (
      "id" VARCHAR(36) PRIMARY KEY,
      "transactionNumber" VARCHAR(50) UNIQUE NOT NULL,
      "status" VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
      "driverName" VARCHAR(255) NOT NULL,
      "notes" TEXT,
      "commodity" VARCHAR(100) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO "Transaction" ("id", "transactionNumber", "status", "driverName", "notes", "commodity", "createdAt") VALUES
      ('tx-pre-001', 'GMS-PRE-001', 'COMPLETED', 'Driver Alpha — PT. Logistik Nusantara', 'Catatan Awal Pra-Restore 1', 'Batubara Kalori Sedang', '2026-11-20 08:00:00+00'),
      ('tx-pre-002', 'GMS-PRE-002', 'REGISTERED', 'Driver Beta — CV. Mitra Sawit', 'Catatan Awal Pra-Restore 2', 'Kelapa Sawit TBS', '2026-11-20 08:30:00+00'),
      ('tx-pre-003', 'GMS-PRE-003', 'IN_PROGRESS', 'Driver Gamma — PT. CPO Lestari', 'Catatan Awal Pra-Restore 3', 'CPO Curah Standar', '2026-11-20 09:00:00+00');
  `;
  runPsqlScript(pg16Port, pg16TargetDb, preExistingMultiSql);

  // Full 7-column snapshot query covering every single field in the synthetic table
  const fullSnapshotQuery = 'SELECT "id", "transactionNumber", "status", "driverName", "notes", "commodity", to_char("createdAt", \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS "createdAt" FROM "Transaction" ORDER BY "id" ASC;';
  const preFailureSnapshotRaw = runPsql(pg16Port, pg16TargetDb, fullSnapshotQuery);
  const preFailureSnapshotSha = computeSha256(preFailureSnapshotRaw);

  console.log('  [Step 5B.1] Full 7-Column Pre-Restore Target Table Snapshot:');
  console.log('  ------------------------------------------------------------------------');
  preFailureSnapshotRaw.split('\n').forEach((line) => console.log('    ' + line));
  console.log('  ------------------------------------------------------------------------');
  console.log(`  ✓ Pre-Failure Snapshot SHA-256: ${preFailureSnapshotSha}`);

  // Test Seam: Intercept child_process.spawn for psql in streaming fallback
  // Uses createFaultInjectingStreamHook to guarantee every byte of input is forwarded exactly once
  const originalSpawn = child_process.spawn;
  let injectPsqlFault = true;
  let faultHookTriggered = false;

  const hook = createFaultInjectingStreamHook(
    /^COPY\s+(?:"?public"?\.)?"?Transaction"?/i,
    'SELECT * FROM nonexistent_table_injected_cor02_error;\n',
    () => {
      faultHookTriggered = true;
      console.log('  [Test Seam Hook] Detected EXACT END of COPY data block (\\.). Injected fatal SQL error.');
    },
  );

  child_process.spawn = function (cmd, args, opts) {
    const proc = originalSpawn.call(this, cmd, args, opts);
    if (cmd === 'psql' && injectPsqlFault) {
      const originalWrite = proc.stdin.write;
      const originalEnd = proc.stdin.end;

      proc.stdin.write = function (chunk, encoding, cb) {
        const transformed = hook.processChunk(chunk);
        if (transformed && transformed.length > 0) {
          return originalWrite.call(proc.stdin, transformed, 'utf8', cb);
        }
        if (typeof cb === 'function') cb();
        return true;
      };

      proc.stdin.end = function (chunk, encoding, cb) {
        if (chunk) {
          const transformed = hook.processChunk(chunk);
          if (transformed && transformed.length > 0) {
            originalWrite.call(proc.stdin, transformed, 'utf8');
          }
        }
        const flushed = hook.flush();
        if (flushed && flushed.length > 0) {
          originalWrite.call(proc.stdin, flushed, 'utf8');
        }
        return originalEnd.call(proc.stdin, cb);
      };
    }
    return proc;
  };

  console.log('  [Step 5B.2] Invoking executePgRestoreWithFallback() with VALID dump (triggering fallback + post-COPY fault)...');
  let fallbackFaultRejected = false;
  let fallbackErrorMsg = '';

  try {
    await service['executePgRestoreWithFallback'](
      dumpPath,
      host,
      pg16Port,
      dbUser,
      pg16TargetDb,
      dbPass,
    );
  } catch (err) {
    fallbackFaultRejected = true;
    fallbackErrorMsg = err.message || '';
    console.log(`  ✓ Streaming fallback rejected fail-closed as expected with error: ${fallbackErrorMsg}`);
  } finally {
    // Restore original spawn function
    child_process.spawn = originalSpawn;
    injectPsqlFault = false;
  }

  if (!fallbackFaultRejected) {
    throw new Error('ATOMICITY VIOLATION: Expected executePgRestoreWithFallback() to reject upon in-stream SQL error!');
  }
  const hookState = hook.getState();
  if (!hookState.copyBlockEnded || !hookState.faultInjected || !faultHookTriggered) {
    throw new Error('TEST HARNESS ERROR: End of COPY block (\\.) was not reached or fault was not injected!');
  }
  if (!fallbackErrorMsg.includes('nonexistent_table_injected_cor02_error')) {
    throw new Error(`FAILURE ATTRIBUTION VIOLATION: Expected rejection error to be caused specifically by 'nonexistent_table_injected_cor02_error', but received: ${fallbackErrorMsg}`);
  }
  console.log("  ✓ Verified: Failure was strictly caused by 'nonexistent_table_injected_cor02_error' as targeted.");

  // Step 5B.3: Compare Full 7-Column Pre/Post Snapshots
  console.log('  [Step 5B.3] Verifying complete transactional rollback across all 7 fields...');
  const postFailureSnapshotRaw = runPsql(pg16Port, pg16TargetDb, fullSnapshotQuery);
  const postFailureSnapshotSha = computeSha256(postFailureSnapshotRaw);

  console.log('  [Step 5B.3] Full 7-Column Post-Failure Target Table Snapshot:');
  console.log('  ------------------------------------------------------------------------');
  postFailureSnapshotRaw.split('\n').forEach((line) => console.log('    ' + line));
  console.log('  ------------------------------------------------------------------------');
  console.log(`  ✓ Post-Failure Snapshot SHA-256: ${postFailureSnapshotSha}`);

  if (postFailureSnapshotSha !== preFailureSnapshotSha) {
    throw new Error(`ATOMICITY VIOLATION: Full snapshot SHA mismatch! Pre: ${preFailureSnapshotSha}, Post: ${postFailureSnapshotSha}`);
  }
  if (postFailureSnapshotRaw !== preFailureSnapshotRaw) {
    throw new Error('ATOMICITY VIOLATION: Full table snapshot contents differ after rollback!');
  }
  console.log('  ✓ 100% Deep Equality Confirmed: All 7 columns across all pre-existing rows bit-for-bit preserved.');

  const dumpRecordsCount = runPsql(pg16Port, pg16TargetDb, 'SELECT COUNT(*) FROM "Transaction" WHERE "transactionNumber" IN (\'GMS-20261120-0001\', \'GMS-20261120-0002\');');
  if (dumpRecordsCount.trim() !== '0') {
    throw new Error(`ATOMICITY VIOLATION: Partial records from dump were committed: count=${dumpRecordsCount}`);
  }
  console.log('  ✓ Invariant confirmed: 0 partial records from dump committed.');
  console.log('  ✓ --single-transaction --exit-on-error verified: Entire batch rolled back upon stream failure.');

  // ----------------------------------------------------------------------------
  // Scope Recording: Write-Freeze Confinement Status
  // ----------------------------------------------------------------------------
  console.log(`\n[Write-Freeze Confinement Status]`);
  console.log('  - In strict compliance with lead reviewer directive:');
  console.log('  - Live web server / deployment write-freeze has NOT been executed in this isolated runner.');
  console.log('  - Recorded Status: >> BELUM DIUJI (DEFERRED / PENDING FORMAL REVIEWER DECISION) <<\n');

  console.log('========================================================================');
  console.log('  REHEARSAL COMPLETE: ALL PRODUCTION FALLBACK CRITERIA VERIFIED (PASS)  ');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('\nFATAL ERROR IN PRODUCTION RESTORE DRILL:');
  console.error(err);
  process.exit(1);
});
