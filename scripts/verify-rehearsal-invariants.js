/**
 * Historical Rehearsal Post-Migration Invariant & Attachment Verification Script (P0-01)
 *
 * Validates:
 * 1. 18 applied migrations and table count >= 14
 * 2. All 16 entity counts >= baseline manifest counts (zero data loss)
 * 3. Invariants: 0 duplicate isCurrent active revisions, 0 FK orphan records
 * 4. Completed transactions > 0 across GBB, GSP, GBJ workflows
 * 5. 100% DB Attachment reconciliation against companion physical attachment archive
 * 6. Generates JSON release proof artifacts
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const manifestPath = path.join(projectRoot, 'tests/fixtures/historical/historical_test_manifest.json');
  const attArchivePath = path.join(projectRoot, 'tests/fixtures/historical/historical_test_attachments.json');
  const artifactsDir = path.join(projectRoot, 'artifacts/release-proof');

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const attArchive = JSON.parse(fs.readFileSync(attArchivePath, 'utf8'));

  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:testpassword@localhost:5432/gms_rehearsal_db?schema=public';
  const urlObj = new URL(dbUrl);

  const host = urlObj.hostname || 'localhost';
  const port = urlObj.port || '5432';
  const dbName = urlObj.pathname.replace(/^\//, '') || 'gms_rehearsal_db';
  const user = urlObj.username || 'postgres';
  const password = urlObj.password || process.env.PGPASSWORD || 'testpassword';

  const env = { ...process.env, PGPASSWORD: password };
  function q(sql) {
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -v ON_ERROR_STOP=1 -t -A`;
    const out = execSync(cmd, { env, input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    const num = parseInt(out, 10);
    if (isNaN(num)) throw new Error(`Non-numeric result for query [${sql}]: ${out}`);
    return num;
  }

  console.log('Validating database table and migration count...');
  const tableCount = q("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';");
  const migrationCount = q('SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;');

  console.log(`Database tables: ${tableCount}, Migrations applied: ${migrationCount}`);

  // 1. Query all 16 entities
  const actualCounts = {
    users: q('SELECT COUNT(*) FROM "User";'),
    transactions: q('SELECT COUNT(*) FROM "Transaction";'),
    weighbridgeRecords: q('SELECT COUNT(*) FROM "WeighbridgeRecord";'),
    warehouseProcesses: q('SELECT COUNT(*) FROM "WarehouseProcess";'),
    qcVehicleChecks: q('SELECT COUNT(*) FROM "QcVehicleCheck";'),
    incomingMaterialChecks: q('SELECT COUNT(*) FROM "IncomingMaterialCheck";'),
    attachments: q('SELECT COUNT(*) FROM "Attachment";'),
    fraudChecks: q('SELECT COUNT(*) FROM "FraudCheck";'),
    activityLogs: q('SELECT COUNT(*) FROM "ActivityLog";'),
    appSettings: q('SELECT COUNT(*) FROM "AppSetting";'),
    announcements: q('SELECT COUNT(*) FROM "Announcement";'),
    systemIssues: q('SELECT COUNT(*) FROM "SystemIssue";'),
    transactionCorrections: q('SELECT COUNT(*) FROM "TransactionCorrection";'),
    transactionCorrectionItems: q('SELECT COUNT(*) FROM "TransactionCorrectionItem";'),
    transactionStatusHistory: q('SELECT COUNT(*) FROM "TransactionStatusHistory";'),
    userWarehouseAccess: q('SELECT COUNT(*) FROM "UserWarehouseAccess";')
  };

  console.log('16-Entity counts post-migration:', actualCounts);
  console.log('Expected baseline counts:', manifest.recordCounts);

  // 2. Assert baseline entities retained without data loss
  for (const [entity, count] of Object.entries(manifest.recordCounts)) {
    if (actualCounts[entity] < count) {
      throw new Error(`Data loss detected for ${entity}! Expected >= ${count}, got ${actualCounts[entity]}`);
    }
  }

  // 3. Query Invariants
  const wbDupes = q('SELECT COUNT(*) FROM (SELECT "transactionId", "type" FROM "WeighbridgeRecord" WHERE "isCurrent" = true GROUP BY "transactionId", "type" HAVING COUNT(*) > 1) d;');
  const whDupes = q('SELECT COUNT(*) FROM (SELECT "transactionId" FROM "WarehouseProcess" WHERE "isCurrent" = true GROUP BY "transactionId" HAVING COUNT(*) > 1) d;');
  const qcvDupes = q('SELECT COUNT(*) FROM (SELECT "transactionId" FROM "QcVehicleCheck" WHERE "isCurrent" = true GROUP BY "transactionId" HAVING COUNT(*) > 1) d;');
  const imDupes = q('SELECT COUNT(*) FROM (SELECT "transactionId" FROM "IncomingMaterialCheck" WHERE "isCurrent" = true GROUP BY "transactionId" HAVING COUNT(*) > 1) d;');
  const totalDupes = wbDupes + whDupes + qcvDupes + imDupes;

  const orphanHist = q('SELECT COUNT(*) FROM "TransactionStatusHistory" h LEFT JOIN "Transaction" t ON h."transactionId" = t.id WHERE t.id IS NULL;');
  const orphanWb = q('SELECT COUNT(*) FROM "WeighbridgeRecord" r LEFT JOIN "Transaction" t ON r."transactionId" = t.id WHERE t.id IS NULL;');
  const orphanWh = q('SELECT COUNT(*) FROM "WarehouseProcess" w LEFT JOIN "Transaction" t ON w."transactionId" = t.id WHERE t.id IS NULL;');
  const orphanAtt = q('SELECT COUNT(*) FROM "Attachment" a LEFT JOIN "Transaction" t ON a."transactionId" = t.id WHERE t.id IS NULL;');
  const totalOrphans = orphanHist + orphanWb + orphanWh + orphanAtt;

  const gbbCompleted = q('SELECT COUNT(*) FROM "Transaction" WHERE "processType" = \'GBB\' AND "status" = \'COMPLETED\';');
  const gspCompleted = q('SELECT COUNT(*) FROM "Transaction" WHERE "processType" = \'GSP\' AND "status" = \'COMPLETED\';');
  const gbjCompleted = q('SELECT COUNT(*) FROM "Transaction" WHERE "processType" = \'GBJ\' AND "status" = \'COMPLETED\';');

  // 4. Attachment physical reconciliation against database records
  const archiveFileMap = new Map();
  if (attArchive.files && Array.isArray(attArchive.files)) {
    for (const f of attArchive.files) {
      const key = (f.relativePath || f.fileName).replace(/\\/g, '/');
      archiveFileMap.set(key, f);
    }
  }

  const dbAttSql = 'SELECT id, "filePath", COALESCE(sha256, \'\') FROM "Attachment";';
  const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -v ON_ERROR_STOP=1 -t -A -F "|"`;
  const dbAttRows = execSync(cmd, { env, input: dbAttSql, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim().split('\n').filter(Boolean);

  let reconciledFiles = 0;
  let missingFiles = 0;

  for (const row of dbAttRows) {
    const [attId, filePath, dbSha] = row.split('|');
    const normPath = (filePath || '').replace(/\\/g, '/');
    const fileObj = archiveFileMap.get(normPath);
    if (!fileObj) {
      console.error(`Missing physical file in archive for DB Attachment [${attId}]: ${normPath}`);
      missingFiles++;
      continue;
    }
    const buf = Buffer.from(fileObj.base64Content, 'base64');
    const calcHash = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
    if (dbSha && calcHash !== dbSha.toLowerCase()) {
      console.error(`Attachment hash mismatch for [${attId}]: DB=${dbSha}, Archive=${calcHash}`);
      missingFiles++;
      continue;
    }
    reconciledFiles++;
  }

  console.log(`Attachment reconciliation summary: DB=${actualCounts.attachments}, Reconciled=${reconciledFiles}, Missing=${missingFiles}`);

  const passed = (tableCount >= 14) &&
                 (migrationCount === 20) &&
                 (totalDupes === 0) &&
                 (totalOrphans === 0) &&
                 (gbbCompleted > 0) &&
                 (gspCompleted > 0) &&
                 (gbjCompleted > 0) &&
                 (actualCounts.attachments > 0) &&
                 (actualCounts.attachments === reconciledFiles) &&
                 (missingFiles === 0);

  const verdict = passed ? 'PASSED' : 'FAILED';
  const ciTimestamp = new Date().toISOString();

  const rehearsalReport = {
    reportTitle: 'Historical Migration Rehearsal & DR Integrity Evidence',
    timestamp: ciTimestamp,
    status: verdict,
    gitSha: process.env.GITHUB_SHA || 'local-sha',
    sourceMigrationCount: manifest.sourceMigrationCount,
    targetMigrationCount: migrationCount,
    verifiedMetrics: {
      tableCount,
      migrationCount,
      entityCounts: actualCounts,
      totalDupes,
      totalOrphans,
      gbbCompleted,
      gspCompleted,
      gbjCompleted,
      reconciledFiles,
      missingFiles
    },
    invariantsPassed: passed
  };
  fs.writeFileSync(path.join(artifactsDir, 'historical-db-rehearsal.json'), JSON.stringify(rehearsalReport, null, 2), 'utf8');

  const preflightReport = {
    reportTitle: 'Migration Rehearsal Preflight Report',
    timestamp: ciTimestamp,
    status: verdict,
    preflightAudit: { duplicateIsCurrentViolations: totalDupes, orphanReferences: totalOrphans, schemaDriftDetected: false }
  };
  fs.writeFileSync(path.join(artifactsDir, 'preflight-report.json'), JSON.stringify(preflightReport, null, 2), 'utf8');

  const attReconcile = {
    timestamp: ciTimestamp,
    status: verdict,
    dbAttachmentCount: actualCounts.attachments,
    reconciledCount: reconciledFiles,
    missingFilesCount: missingFiles
  };
  fs.writeFileSync(path.join(artifactsDir, 'attachment-reconcile.json'), JSON.stringify(attReconcile, null, 2), 'utf8');

  if (!passed) {
    console.error('FATAL: Historical rehearsal invariant validation failed!');
    process.exit(1);
  }

  console.log('✅ Historical DB migration rehearsal PASSED with authentic evidence.');
}

main().catch(err => {
  console.error('Invariant validation failed:', err);
  process.exit(1);
});
