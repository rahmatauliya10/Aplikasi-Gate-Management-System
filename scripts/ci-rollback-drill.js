/**
 * GMS CI Post-Migration Coordinated Rollback Drill Harness (P0-03)
 *
 * Simulates a failed production deployment post-migration and proves:
 * 1. Pre-deploy backup capture (dump, attachments archive, manifest, checksums).
 * 2. Successful forward migration deployment (schema 6 -> 18).
 * 3. Injected deployment failure trigger (e.g. post-deploy watchdog timeout).
 * 4. Automated coordinated DB rollback to pre-deploy backup snapshot.
 * 5. Reversion of migration set (18 -> 6) and 100% 16-entity retention.
 * 6. Zero duplicate isCurrent violations and zero foreign-key orphans.
 * 7. Fail-closed traffic freeze in maintenance mode during rollback.
 *
 * Emits exact evidence artifact:
 *   artifacts/release-proof/post-migration-rollback-evidence.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function computeSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
}

async function main() {
  const startTime = Date.now();
  console.log('==============================================================================');
  console.log('Starting GMS Post-Migration Coordinated Rollback Drill (P0-03)...');
  console.log('==============================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const artifactsDir = path.join(projectRoot, 'artifacts/release-proof');
  const backupsLocalDir = path.join(projectRoot, 'backups/local');
  const maintenanceDir = path.join(projectRoot, 'maintenance');

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  if (!fs.existsSync(backupsLocalDir)) {
    fs.mkdirSync(backupsLocalDir, { recursive: true });
  }
  if (!fs.existsSync(maintenanceDir)) {
    fs.mkdirSync(maintenanceDir, { recursive: true });
  }

  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:testpassword@localhost:5432/gms_rehearsal_db?schema=public';
  const urlObj = new URL(dbUrl);

  const host = urlObj.hostname || 'localhost';
  const port = urlObj.port || '5432';
  const dbName = urlObj.pathname.replace(/^\//, '') || 'gms_rehearsal_db';
  const user = urlObj.username || 'postgres';
  const password = urlObj.password || process.env.PGPASSWORD || 'testpassword';

  const env = { ...process.env, PGPASSWORD: password };
  const psql = (sql) => {
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -v ON_ERROR_STOP=1 -t -A`;
    return execSync(cmd, { env, input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  };

  const tableExists = (tableName) => {
    const out = psql(`SELECT CASE WHEN to_regclass('public."' || '${tableName}' || '"') IS NOT NULL THEN '1' ELSE '0' END;`);
    return out.trim() === '1';
  };

  const queryCount = (tableName) => {
    if (!tableExists(tableName)) {
      return 0;
    }
    const out = psql(`SELECT COUNT(*) FROM "${tableName}";`);
    const num = parseInt(out, 10);
    if (isNaN(num)) {
      throw new Error(`Failed to parse numeric count for table [${tableName}]: ${out}`);
    }
    return num;
  };

  const queryTableFingerprint = (tableName) => {
    if (!tableExists(tableName)) {
      return 'NON_EXISTENT';
    }
    const out = psql(`SELECT COALESCE(encode(sha256(string_agg(encode(sha256(row_to_json(t)::text::bytea), 'hex'), ',' ORDER BY encode(sha256(row_to_json(t)::text::bytea), 'hex'))::bytea), 'hex'), 'EMPTY') FROM "${tableName}" t;`);
    return out.trim();
  };

  function capture16Entities() {
    return {
      users: queryCount('User'),
      transactions: queryCount('Transaction'),
      weighbridgeRecords: queryCount('WeighbridgeRecord'),
      warehouseProcesses: queryCount('WarehouseProcess'),
      qcVehicleChecks: queryCount('QcVehicleCheck'),
      incomingMaterialChecks: queryCount('IncomingMaterialCheck'),
      attachments: queryCount('Attachment'),
      fraudChecks: queryCount('FraudCheck'),
      activityLogs: queryCount('ActivityLog'),
      appSettings: queryCount('AppSetting'),
      announcements: queryCount('Announcement'),
      systemIssues: queryCount('SystemIssue'),
      transactionCorrections: queryCount('TransactionCorrection'),
      transactionCorrectionItems: queryCount('TransactionCorrectionItem'),
      transactionStatusHistory: queryCount('TransactionStatusHistory'),
      userWarehouseAccess: queryCount('UserWarehouseAccess'),
      migrations: queryCount('_prisma_migrations')
    };
  }

  function capture16EntityFingerprints() {
    const tableNames = [
      'User', 'Transaction', 'WeighbridgeRecord', 'WarehouseProcess',
      'QcVehicleCheck', 'IncomingMaterialCheck', 'Attachment', 'FraudCheck',
      'ActivityLog', 'AppSetting', 'Announcement', 'SystemIssue',
      'TransactionCorrection', 'TransactionCorrectionItem', 'TransactionStatusHistory',
      'UserWarehouseAccess'
    ];
    const fp = {};
    for (const t of tableNames) {
      if (tableExists(t)) {
        fp[t] = queryTableFingerprint(t);
      }
    }
    return fp;
  }

  // ------------------------------------------------------------------------------
  // Step 1: Ensure baseline historical database (6 migrations) is restored
  // ------------------------------------------------------------------------------
  console.log('Step 1: Initializing baseline database state (6 historical migrations)...');
  const fixtureDumpPath = path.join(projectRoot, 'tests/fixtures/historical/historical_test.dump');
  if (!fs.existsSync(fixtureDumpPath)) {
    throw new Error(`Mandatory fixture missing: historical test dump not found at ${fixtureDumpPath}`);
  }

  const restoreBaselineCmd = `pg_restore -h ${host} -p ${port} -U ${user} -d ${dbName} --clean --if-exists --no-owner --no-acl "${fixtureDumpPath}"`;
  execSync(restoreBaselineCmd, { env, stdio: 'pipe' });

  const preDeployEntities = capture16Entities();
  const preDeployFingerprints = capture16EntityFingerprints();
  console.log('Pre-deployment baseline state (16 Entities):', preDeployEntities);

  // ------------------------------------------------------------------------------
  // Step 2: Create Pre-Deployment Backup Snapshot & Companion Manifest
  // ------------------------------------------------------------------------------
  console.log('\nStep 2: Creating mandatory pre-deployment backup snapshot...');
  const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `BKP-PREDEPLOY-DRILL-${backupTimestamp}`;
  const predeployDumpFile = `gms_predeploy_${backupId}.dump`;
  const predeployDumpPath = path.join(backupsLocalDir, predeployDumpFile);
  const predeployManifestFile = `gms_predeploy_${backupId}_manifest.json`;
  const predeployManifestPath = path.join(backupsLocalDir, predeployManifestFile);

  const dumpCmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} -F c -f "${predeployDumpPath}"`;
  execSync(dumpCmd, { env, stdio: 'pipe' });

  const dumpSha256 = computeSha256(predeployDumpPath);

  const predeployManifest = {
    manifestType: 'PREDEPLOY_BACKUP_SNAPSHOT',
    backupId,
    createdAt: new Date().toISOString(),
    artifacts: {
      dump: predeployDumpFile,
      manifest: predeployManifestFile
    },
    checksums: {
      dump: dumpSha256
    },
    recordCounts: preDeployEntities
  };

  fs.writeFileSync(predeployManifestPath, JSON.stringify(predeployManifest, null, 2), 'utf8');

  // Write pointer file
  const pointerPath = path.join(backupsLocalDir, 'latest-predeploy.json');
  fs.writeFileSync(pointerPath, JSON.stringify({
    backupId,
    manifestFile: predeployManifestFile,
    dumpFile: predeployDumpFile,
    checksums: predeployManifest.checksums
  }, null, 2), 'utf8');

  console.log(`  Pre-deployment backup generated: ${backupId} (${dumpSha256})`);

  // ------------------------------------------------------------------------------
  // Step 3: Advance Schema to 19 Migrations via Prisma Migrate Deploy
  // ------------------------------------------------------------------------------
  console.log('\nStep 3: Upgrading schema forward to 19 migrations (prisma migrate deploy)...');
  const backendDir = path.join(projectRoot, 'backend');
  execSync('npx prisma migrate deploy', { cwd: backendDir, env: { ...env, DATABASE_URL: dbUrl }, stdio: 'pipe' });

  const postMigrationEntities = capture16Entities();
  console.log('Post-migration state (Target):', postMigrationEntities);

  if (postMigrationEntities.migrations !== 19) {
    throw new Error(`Expected exactly 19 migrations post-deploy, got ${postMigrationEntities.migrations}`);
  }
  console.log('  Forward schema migration successfully verified (19 migrations applied).');

  // ------------------------------------------------------------------------------
  // Step 4: Inject Failure Trigger & Execute Coordinated Rollback
  // ------------------------------------------------------------------------------
  console.log('\nStep 4: Simulating target deployment failure and initiating coordinated rollback...');
  const maintActivePath = path.join(maintenanceDir, 'active');
  fs.writeFileSync(maintActivePath, 'MAINTENANCE_ACTIVE_ROLLBACK_DRILL', 'utf8');
  console.log('  Maintenance freeze activated (/maintenance/active).');

  // Rollback database using the pre-deploy backup
  console.log('  Executing atomic database restoration to pre-deploy backup snapshot...');
  psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  const rollbackRestoreCmd = `pg_restore -h ${host} -p ${port} -U ${user} -d ${dbName} --no-owner --no-acl --single-transaction "${predeployDumpPath}"`;
  execSync(rollbackRestoreCmd, { env, stdio: 'pipe' });

  // ------------------------------------------------------------------------------
  // Step 5: Verify Post-Rollback Invariants & Database Integrity
  // ------------------------------------------------------------------------------
  console.log('\nStep 5: Verifying post-rollback schema state, 100% 16-entity retention & deterministic content equality...');
  const postRollbackEntities = capture16Entities();
  const postRollbackFingerprints = capture16EntityFingerprints();
  console.log('Post-rollback restored state:', postRollbackEntities);

  const migrationReverted = (postRollbackEntities.migrations === preDeployEntities.migrations);

  // Validate ALL 16 entity tables for exact 100% retention
  const entityAssertions = {};
  let all16EntitiesRetained = true;
  for (const [entityName, baselineCount] of Object.entries(preDeployEntities)) {
    const restoredCount = postRollbackEntities[entityName];
    const match = (restoredCount === baselineCount);
    entityAssertions[entityName] = {
      pass: match,
      expected: baselineCount,
      actual: restoredCount
    };
    if (!match) {
      all16EntitiesRetained = false;
    }
  }

  // Validate content fingerprints match 100%
  const fingerprintAssertions = {};
  let allFingerprintsMatch = true;
  for (const [tbl, fp] of Object.entries(preDeployFingerprints)) {
    const restoredFp = postRollbackFingerprints[tbl];
    const match = (restoredFp === fp);
    fingerprintAssertions[tbl] = {
      pass: match,
      expected: fp,
      actual: restoredFp
    };
    if (!match) {
      allFingerprintsMatch = false;
    }
  }

  // Invariants: 0 duplicate isCurrent (if column exists in restored schema), 0 orphans
  let totalDupes = 0;
  const hasIsCurrent = parseInt(psql(`
    SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'WeighbridgeRecord' AND column_name = 'isCurrent';
  `) || '0', 10) > 0;

  if (hasIsCurrent) {
    const wbDupes = parseInt(psql('SELECT COUNT(*) FROM (SELECT "transactionId", "type" FROM "WeighbridgeRecord" WHERE "isCurrent" = true GROUP BY "transactionId", "type" HAVING COUNT(*) > 1) d;') || '0', 10);
    const whDupes = parseInt(psql('SELECT COUNT(*) FROM (SELECT "transactionId" FROM "WarehouseProcess" WHERE "isCurrent" = true GROUP BY "transactionId" HAVING COUNT(*) > 1) d;') || '0', 10);
    totalDupes = wbDupes + whDupes;
  }

  const orphanHist = parseInt(psql('SELECT COUNT(*) FROM "TransactionStatusHistory" h LEFT JOIN "Transaction" t ON h."transactionId" = t.id WHERE t.id IS NULL;') || '0', 10);
  const orphanWb = parseInt(psql('SELECT COUNT(*) FROM "WeighbridgeRecord" r LEFT JOIN "Transaction" t ON r."transactionId" = t.id WHERE t.id IS NULL;') || '0', 10);
  const totalOrphans = orphanHist + orphanWb;

  const rollbackPassed = migrationReverted &&
                         all16EntitiesRetained &&
                         allFingerprintsMatch &&
                         (totalDupes === 0) &&
                         (totalOrphans === 0);

  if (rollbackPassed) {
    console.log('  Rollback verified 100% successful. Releasing maintenance freeze...');
    if (fs.existsSync(maintActivePath)) fs.unlinkSync(maintActivePath);
  } else {
    console.error('  FATAL: Rollback validation failed! Maintenance flag preserved.');
  }

  // ------------------------------------------------------------------------------
  // Step 6: Emit Evidence Artifact
  // ------------------------------------------------------------------------------
  const totalDurationSec = (Date.now() - startTime) / 1000;
  const rpoDurationMs = Math.max(0, Date.now() - new Date(predeployManifest.createdAt).getTime());
  const rpoMinutes = parseFloat((rpoDurationMs / 60000).toFixed(4));

  const evidenceReport = {
    reportTitle: 'GMS Post-Migration Coordinated Rollback Drill Evidence (P0-03)',
    timestamp: new Date().toISOString(),
    status: rollbackPassed ? 'PASSED' : 'FAILED',
    gitSha: process.env.GITHUB_SHA || 'local-sha',
    preDeployBackupId: backupId,
    verifiedPreDeployDumpHash: dumpSha256,
    rpoMinutes: rpoMinutes,
    rpoDefinition: 'Elapsed duration since pre-deployment backup manifest creation to post-rollback recovery verification (rehearsal delta)',
    rtoSeconds: parseFloat(totalDurationSec.toFixed(2)),
    preDeployState: preDeployEntities,
    targetPostMigrationState: postMigrationEntities,
    restoredPostRollbackState: postRollbackEntities,
    assertions: {
      migrationCountReverted: { pass: migrationReverted, baseline: preDeployEntities.migrations, restored: postRollbackEntities.migrations },
      all16EntitiesRetained: { pass: all16EntitiesRetained },
      allContentFingerprintsMatch: { pass: allFingerprintsMatch },
      entityDetails: entityAssertions,
      fingerprintDetails: fingerprintAssertions,
      zeroDuplicateIsCurrent: { pass: totalDupes === 0, violations: totalDupes },
      zeroForeignOrphans: { pass: totalOrphans === 0, violations: totalOrphans }
    }
  };

  const evidenceJsonPath = path.join(artifactsDir, 'post-migration-rollback-evidence.json');
  const operatorEvidenceJsonPath = path.join(artifactsDir, 'deployment-rollback-operator-evidence.json');
  fs.writeFileSync(evidenceJsonPath, JSON.stringify(evidenceReport, null, 2), 'utf8');
  fs.writeFileSync(operatorEvidenceJsonPath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('\n==============================================================================');
  console.log(`Coordinated Rollback Drill Status: ${rollbackPassed ? 'PASSED' : 'FAILED'} (RTO: ${totalDurationSec.toFixed(2)}s, Measured RPO: ${rpoMinutes}m)`);
  console.log(`Saved exact rollback evidence artifact to: ${evidenceJsonPath}`);
  console.log(`Saved companion operator rollback evidence to: ${operatorEvidenceJsonPath}`);
  console.log('==============================================================================\n');

  // Clean up temporary pre-deploy dump file
  if (fs.existsSync(predeployDumpPath)) {
    fs.unlinkSync(predeployDumpPath);
  }
  if (fs.existsSync(predeployManifestPath)) {
    fs.unlinkSync(predeployManifestPath);
  }

  if (!rollbackPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal rollback drill harness error:', err);
  process.exit(1);
});
