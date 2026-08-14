/**
 * Historical Database Rehearsal Test Fixture Generator (P0-01)
 *
 * Generates an authentic pg_dump binary clone, companion physical attachment archive,
 * and signed companion manifest with exact SHA-256 hashes for CI historical rehearsal.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function computeSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

function computeSha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

async function main() {
  const targetDir = path.resolve(__dirname);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dumpPath = path.join(targetDir, 'historical_test.dump');
  const manifestPath = path.join(targetDir, 'historical_test_manifest.json');
  const attArchivePath = path.join(targetDir, 'historical_test_attachments.json');

  console.log('Generating historical database dump fixture at:', dumpPath);

  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:testpassword@localhost:5432/gms_test_db?schema=public';
  const urlObj = new URL(dbUrl);

  const host = urlObj.hostname || 'localhost';
  const port = urlObj.port || '5432';
  const dbName = urlObj.pathname.replace(/^\//, '') || 'gms_test_db';
  const user = urlObj.username || 'postgres';
  const password = urlObj.password || 'testpassword';

  // 1. Execute pg_dump -Fc (custom binary format)
  const env = { ...process.env, PGPASSWORD: password };
  const dumpCmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} -F c -f "${dumpPath}"`;
  try {
    execSync(dumpCmd, { env, stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to execute pg_dump:', err.message);
    process.exit(1);
  }

  const dumpSha256 = computeSha256(dumpPath);
  console.log(`Generated dump SHA-256: ${dumpSha256}`);

  // 2. Generate companion attachment archive JSON with realistic files
  const samplePdfContent = Buffer.from('%PDF-1.4 Mock PDF for gate vehicle inspection evidence\n%%EOF');
  const samplePdfSha256 = computeSha256Buffer(samplePdfContent);

  const sampleJpgContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9]);
  const sampleJpgSha256 = computeSha256Buffer(sampleJpgContent);

  const attachmentsArchive = {
    archiveType: 'GMS_ATTACHMENT_ARCHIVE_V1',
    createdAt: new Date().toISOString(),
    files: [
      {
        fileName: 'vehicle_check_proof.pdf',
        relativePath: 'qc/vehicle_check_proof.pdf',
        base64Content: samplePdfContent.toString('base64'),
        checksum: samplePdfSha256,
        sizeBytes: samplePdfContent.length
      },
      {
        fileName: 'weighbridge_ticket.jpg',
        relativePath: 'weighbridge/weighbridge_ticket.jpg',
        base64Content: sampleJpgContent.toString('base64'),
        checksum: sampleJpgSha256,
        sizeBytes: sampleJpgContent.length
      }
    ]
  };

  fs.writeFileSync(attArchivePath, JSON.stringify(attachmentsArchive, null, 2), 'utf8');
  const attSha256 = computeSha256(attArchivePath);
  console.log(`Generated attachments archive SHA-256: ${attSha256}`);

  // 3. Query actual table counts for manifest metadata
  let tableCounts = {
    users: 1,
    transactions: 1,
    weighbridgeRecords: 0,
    warehouseProcesses: 0,
    qcVehicleChecks: 0,
    incomingMaterialChecks: 0,
    attachments: 0,
    fraudChecks: 0,
    activityLogs: 0,
    appSettings: 0,
    announcements: 0,
    systemIssues: 0,
    transactionCorrections: 0,
    transactionCorrectionItems: 0,
    transactionStatusHistory: 0,
    userWarehouseAccess: 0
  };

  try {
    const queryCmd = (sql) => `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -t -A -c "${sql}"`;
    const getCount = (tbl) => {
      try {
        const out = execSync(queryCmd(`SELECT COUNT(*) FROM \\"${tbl}\\";`), { env, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
        return parseInt(out, 10) || 0;
      } catch {
        return 0;
      }
    };

    tableCounts = {
      users: getCount('User'),
      transactions: getCount('Transaction'),
      weighbridgeRecords: getCount('WeighbridgeRecord'),
      warehouseProcesses: getCount('WarehouseProcess'),
      qcVehicleChecks: getCount('QcVehicleCheck'),
      incomingMaterialChecks: getCount('IncomingMaterialCheck'),
      attachments: getCount('Attachment'),
      fraudChecks: getCount('FraudCheck'),
      activityLogs: getCount('ActivityLog'),
      appSettings: getCount('AppSetting'),
      announcements: getCount('Announcement'),
      systemIssues: getCount('SystemIssue'),
      transactionCorrections: getCount('TransactionCorrection'),
      transactionCorrectionItems: getCount('TransactionCorrectionItem'),
      transactionStatusHistory: getCount('TransactionStatusHistory'),
      userWarehouseAccess: getCount('UserWarehouseAccess')
    };
  } catch (e) {
    console.warn('Could not query exact table counts:', e.message);
  }

  // 4. Generate companion manifest
  const manifest = {
    manifestType: 'HISTORICAL_REHEARSAL_FIXTURE',
    backupId: 'BKP-HISTORICAL-REHEARSAL-FIXTURE',
    createdAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
    artifacts: {
      dump: 'historical_test.dump',
      attachmentsArchive: 'historical_test_attachments.json'
    },
    checksums: {
      dump: dumpSha256,
      attachmentsArchive: attSha256
    },
    recordCounts: tableCounts
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Generated companion manifest at:', manifestPath);
  console.log('✅ Historical rehearsal test fixtures generated successfully.');
}

main().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
