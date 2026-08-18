/**
 * Historical Database Rehearsal Test Fixture Generator (P0-01)
 *
 * Generates an authentic pg_dump binary clone based on early historical migrations (1..6),
 * companion physical attachment archive, and companion manifest with exact SHA-256 hashes.
 *
 * This ensures that during CI rehearsal, running `prisma migrate deploy` tests upgrading
 * the schema and data from migration 6 to migration 18 on real historical data.
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

function uuid() {
  return crypto.randomUUID();
}

const HISTORICAL_MIGRATIONS = [
  '20260714030729_init',
  '20260715000000_add_account_password_security',
  '20260715031355_sync_indices',
  '20260715034029_add_user_is_deleted',
  '20260715150000_add_user_profile_fields',
  '20260716041815_add_system_issue'
];

async function main() {
  const targetDir = path.resolve(__dirname);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dumpPath = path.join(targetDir, 'historical_test.dump');
  const manifestPath = path.join(targetDir, 'historical_test_manifest.json');
  const attArchivePath = path.join(targetDir, 'historical_test_attachments.json');

  console.log('Generating authentic historical baseline database fixture at:', dumpPath);

  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:testpassword@localhost:5432/gms_rehearsal_db?schema=public';
  const urlObj = new URL(dbUrl);

  const host = urlObj.hostname || 'localhost';
  const port = urlObj.port || '5432';
  const dbName = urlObj.pathname.replace(/^\//, '') || 'gms_rehearsal_db';
  const user = urlObj.username || 'postgres';
  const password = urlObj.password || 'testpassword';

  const env = { ...process.env, PGPASSWORD: password };
  const psql = (sql) => {
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -v ON_ERROR_STOP=1 -t -A`;
    return execSync(cmd, { env, input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  };

  const psqlFile = (filePath) => {
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -v ON_ERROR_STOP=1 -f "${filePath}"`;
    return execSync(cmd, { env, stdio: 'inherit' });
  };

  // 1. Reset database schema
  console.log('Resetting schema on target database...');
  psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

  // 2. Create _prisma_migrations table
  psql(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 1
    );
  `);

  // 3. Apply the 6 historical migrations sequentially
  const migrationsBaseDir = path.resolve(__dirname, '../../../backend/prisma/migrations');
  console.log(`Applying ${HISTORICAL_MIGRATIONS.length} historical baseline migrations from ${migrationsBaseDir}...`);

  for (const migName of HISTORICAL_MIGRATIONS) {
    const migSqlFile = path.join(migrationsBaseDir, migName, 'migration.sql');
    if (!fs.existsSync(migSqlFile)) {
      throw new Error(`Migration SQL file not found: ${migSqlFile}`);
    }
    const sqlContent = fs.readFileSync(migSqlFile, 'utf8');
    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

    console.log(`  Applying: ${migName} (checksum: ${checksum.substring(0, 16)}...)`);
    psqlFile(migSqlFile);

    psql(`
      INSERT INTO "_prisma_migrations" (
        "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
      ) VALUES (
        '${uuid()}', '${checksum}', NOW(), '${migName}', NULL, NULL, NOW(), 1
      );
    `);
  }

  // 4. Generate companion physical files & compute exact hashes
  const samplePdfContent = Buffer.from('%PDF-1.4 Mock PDF for historical gate inspection evidence\n%%EOF');
  const samplePdfSha256 = computeSha256Buffer(samplePdfContent);

  const sampleJpgContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9]);
  const sampleJpgSha256 = computeSha256Buffer(sampleJpgContent);

  // 5. Seed authentic historical data with DB Attachment records referencing the exact physical files
  console.log('Seeding authentic historical entities and transactions...');
  const seedSql = `
    -- Users
    INSERT INTO "User" ("id", "email", "username", "password", "name", "role", "isActive", "createdAt", "updatedAt")
    VALUES
      ('usr-admin-001', 'admin@gms.local', 'admin', '$argon2id$v=19$m=65536,t=3,p=4$qN8kE7zJ41i5fWjY8q6aZw$5F5N1Q5l8z5L5e5G5k5M5a5b5c5d5e5f', 'System Administrator', 'ADMIN', true, NOW(), NOW()),
      ('usr-qc-001', 'qc@gms.local', 'qc_operator', '$argon2id$v=19$m=65536,t=3,p=4$qN8kE7zJ41i5fWjY8q6aZw$5F5N1Q5l8z5L5e5G5k5M5a5b5c5d5e5f', 'QC Inspector', 'QC', true, NOW(), NOW()),
      ('usr-wh-001', 'warehouse@gms.local', 'wh_operator', '$argon2id$v=19$m=65536,t=3,p=4$qN8kE7zJ41i5fWjY8q6aZw$5F5N1Q5l8z5L5e5G5k5M5a5b5c5d5e5f', 'Warehouse Officer', 'WAREHOUSE', true, NOW(), NOW()),
      ('usr-sec-001', 'security@gms.local', 'sec_guard', '$argon2id$v=19$m=65536,t=3,p=4$qN8kE7zJ41i5fWjY8q6aZw$5F5N1Q5l8z5L5e5G5k5M5a5b5c5d5e5f', 'Security Guard', 'SECURITY', true, NOW(), NOW());

    -- User Warehouse Access
    INSERT INTO "UserWarehouseAccess" ("id", "userId", "processType", "createdAt", "updatedAt")
    VALUES
      ('uwa-001', 'usr-wh-001', 'GBB', NOW(), NOW()),
      ('uwa-002', 'usr-wh-001', 'GSP', NOW(), NOW()),
      ('uwa-003', 'usr-wh-001', 'GBJ', NOW(), NOW());

    -- App Settings
    INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
    VALUES
      ('set-001', 'AUTO_SYNC_INTERVAL', '300', NOW(), NOW()),
      ('set-002', 'MAINTENANCE_MODE', 'false', NOW(), NOW()),
      ('set-003', 'GMS_ENVIRONMENT_ID', 'GMS-PROD-SJA-01', NOW(), NOW()),
      ('set-004', 'GMS_INSTALLATION_UUID', '4f53a720-911b-4f9e-a89b-8321481dc901', NOW(), NOW()),
      ('set-005', 'GMS_RESTORE_ALLOWED', 'TRUE', NOW(), NOW());

    -- Announcement
    INSERT INTO "Announcement" ("id", "title", "message", "type", "status", "location", "speed", "priority", "createdAt", "updatedAt")
    VALUES
      ('ann-001', 'Historical Rehearsal Notice', 'Baseline test announcement for DR validation', 'INFO', 'ACTIVE', 'ALL_PAGES', 'NORMAL', 'MEDIUM', NOW(), NOW());

    -- System Issue
    INSERT INTO "SystemIssue" ("id", "issueType", "description", "status", "reporterId", "createdAt", "updatedAt")
    VALUES
      ('iss-001', 'WEIGHBRIDGE_SYNC', 'Historical baseline issue record for DR validation', 'OPEN', 'usr-sec-001', NOW(), NOW());

    -- 1. GBB Transaction (Raw Material Inbound - Completed)
    INSERT INTO "Transaction" (
      "id", "transactionNumber", "plateNumber", "driverName", "driverPhone", "vendorName", "vehicleType",
      "processType", "cargoType", "cargoProcessType", "status", "gateInAt", "gateOutAt", "completedAt", "createdAt", "updatedAt"
    ) VALUES (
      'trx-gbb-001', 'TRX-GBB-HIST-001', 'B 1234 GBB', 'Driver GBB', '08123456789', 'PT Vendor Raw Material', 'TRUCK',
      'GBB', 'RAW_MATERIAL', 'INBOUND', 'COMPLETED', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '3 hours', NOW()
    );

    INSERT INTO "WeighbridgeRecord" ("id", "transactionId", "type", "weight", "ticketNumber", "operatorId", "createdAt", "updatedAt")
    VALUES
      ('wb-gbb-in', 'trx-gbb-001', 'IN', 25000, 'TKT-GBB-IN', 'usr-sec-001', NOW(), NOW()),
      ('wb-gbb-out', 'trx-gbb-001', 'OUT', 10000, 'TKT-GBB-OUT', 'usr-sec-001', NOW(), NOW());

    INSERT INTO "QcVehicleCheck" ("id", "transactionId", "result", "checkedById", "startedAt", "completedAt", "createdAt", "updatedAt")
    VALUES
      ('qcv-gbb-001', 'trx-gbb-001', 'PASS', 'usr-qc-001', NOW() - INTERVAL '2 hours 30 minutes', NOW() - INTERVAL '2 hours 20 minutes', NOW(), NOW());

    INSERT INTO "IncomingMaterialCheck" ("id", "transactionId", "result", "checkedById", "moisture", "startedAt", "completedAt", "createdAt", "updatedAt")
    VALUES
      ('imc-gbb-001', 'trx-gbb-001', 'PASS', 'usr-qc-001', 12.5, NOW() - INTERVAL '2 hours 15 minutes', NOW() - INTERVAL '2 hours', NOW(), NOW());

    INSERT INTO "WarehouseProcess" ("id", "transactionId", "processType", "unit", "actualQuantity", "condition", "startById", "startAt", "endAt", "createdAt", "updatedAt")
    VALUES
      ('wh-gbb-001', 'trx-gbb-001', 'GBB', 'KG', 15000, 'GOOD', 'usr-wh-001', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NOW(), NOW());

    INSERT INTO "Attachment" ("id", "transactionId", "module", "attachmentType", "originalName", "fileName", "filePath", "mimeType", "size", "uploadedById", "createdAt")
    VALUES
      ('att-gbb-001', 'trx-gbb-001', 'QC', 'DOCUMENT', 'vehicle_check_proof.pdf', 'vehicle_check_proof.pdf', 'qc/vehicle_check_proof.pdf', 'application/pdf', ${samplePdfContent.length}, 'usr-qc-001', NOW());

    INSERT INTO "TransactionStatusHistory" ("id", "transactionId", "oldStatus", "newStatus", "changedById", "changedAt")
    VALUES
      ('tsh-gbb-001', 'trx-gbb-001', 'REGISTERED', 'WEIGH_IN_DONE', 'usr-sec-001', NOW() - INTERVAL '2 hours 45 minutes'),
      ('tsh-gbb-002', 'trx-gbb-001', 'WEIGH_IN_DONE', 'QC_VEHICLE_PASSED', 'usr-qc-001', NOW() - INTERVAL '2 hours 30 minutes'),
      ('tsh-gbb-003', 'trx-gbb-001', 'QC_VEHICLE_PASSED', 'INCOMING_CHECK_PASSED', 'usr-qc-001', NOW() - INTERVAL '2 hours 15 minutes'),
      ('tsh-gbb-004', 'trx-gbb-001', 'INCOMING_CHECK_PASSED', 'WAREHOUSE_DONE', 'usr-wh-001', NOW() - INTERVAL '1 hour'),
      ('tsh-gbb-005', 'trx-gbb-001', 'WAREHOUSE_DONE', 'COMPLETED', 'usr-sec-001', NOW() - INTERVAL '30 minutes');

    -- 2. GSP Transaction (Supporting Goods Inbound - Completed)
    INSERT INTO "Transaction" (
      "id", "transactionNumber", "plateNumber", "driverName", "driverPhone", "vendorName", "vehicleType",
      "processType", "cargoType", "cargoProcessType", "status", "gateInAt", "gateOutAt", "completedAt", "createdAt", "updatedAt"
    ) VALUES (
      'trx-gsp-001', 'TRX-GSP-HIST-001', 'B 5678 GSP', 'Driver GSP', '08123456780', 'PT Vendor Supporting Goods', 'TRUCK',
      'GSP', 'SUPPORTING', 'INBOUND', 'COMPLETED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '2 hours', NOW()
    );

    INSERT INTO "WeighbridgeRecord" ("id", "transactionId", "type", "weight", "ticketNumber", "operatorId", "createdAt", "updatedAt")
    VALUES
      ('wb-gsp-in', 'trx-gsp-001', 'IN', 18000, 'TKT-GSP-IN', 'usr-sec-001', NOW(), NOW()),
      ('wb-gsp-out', 'trx-gsp-001', 'OUT', 13000, 'TKT-GSP-OUT', 'usr-sec-001', NOW(), NOW());

    INSERT INTO "WarehouseProcess" ("id", "transactionId", "processType", "unit", "actualQuantity", "condition", "startById", "startAt", "endAt", "createdAt", "updatedAt")
    VALUES
      ('wh-gsp-001', 'trx-gsp-001', 'GSP', 'KG', 5000, 'GOOD', 'usr-wh-001', NOW() - INTERVAL '1 hour 30 minutes', NOW() - INTERVAL '45 minutes', NOW(), NOW());

    INSERT INTO "Attachment" ("id", "transactionId", "module", "attachmentType", "originalName", "fileName", "filePath", "mimeType", "size", "uploadedById", "createdAt")
    VALUES
      ('att-gsp-001', 'trx-gsp-001', 'WEIGHBRIDGE', 'PHOTO', 'weighbridge_ticket.jpg', 'weighbridge_ticket.jpg', 'weighbridge/weighbridge_ticket.jpg', 'image/jpeg', ${sampleJpgContent.length}, 'usr-sec-001', NOW());

    INSERT INTO "TransactionStatusHistory" ("id", "transactionId", "oldStatus", "newStatus", "changedById", "changedAt")
    VALUES
      ('tsh-gsp-001', 'trx-gsp-001', 'REGISTERED', 'WEIGH_IN_DONE', 'usr-sec-001', NOW() - INTERVAL '1 hour 45 minutes'),
      ('tsh-gsp-002', 'trx-gsp-001', 'WEIGH_IN_DONE', 'WAREHOUSE_DONE', 'usr-wh-001', NOW() - INTERVAL '45 minutes'),
      ('tsh-gsp-003', 'trx-gsp-001', 'WAREHOUSE_DONE', 'COMPLETED', 'usr-sec-001', NOW() - INTERVAL '20 minutes');

    -- 3. GBJ Transaction (Finished Goods Outbound - Completed)
    INSERT INTO "Transaction" (
      "id", "transactionNumber", "plateNumber", "driverName", "driverPhone", "vendorName", "vehicleType",
      "processType", "cargoType", "cargoProcessType", "status", "gateInAt", "gateOutAt", "completedAt", "createdAt", "updatedAt"
    ) VALUES (
      'trx-gbj-001', 'TRX-GBJ-HIST-001', 'B 9012 GBJ', 'Driver GBJ', '08123456781', 'PT Customer Finished Goods', 'TRUCK',
      'GBJ', 'FINISHED_GOODS', 'OUTBOUND', 'COMPLETED', NOW() - INTERVAL '1 hour 30 minutes', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '1 hour 30 minutes', NOW()
    );

    INSERT INTO "WeighbridgeRecord" ("id", "transactionId", "type", "weight", "ticketNumber", "operatorId", "createdAt", "updatedAt")
    VALUES
      ('wb-gbj-in', 'trx-gbj-001', 'IN', 12000, 'TKT-GBJ-IN', 'usr-sec-001', NOW(), NOW()),
      ('wb-gbj-out', 'trx-gbj-001', 'OUT', 24000, 'TKT-GBJ-OUT', 'usr-sec-001', NOW(), NOW());

    INSERT INTO "WarehouseProcess" ("id", "transactionId", "processType", "unit", "actualQuantity", "condition", "startById", "startAt", "endAt", "createdAt", "updatedAt")
    VALUES
      ('wh-gbj-001', 'trx-gbj-001', 'GBJ', 'KG', 12000, 'GOOD', 'usr-wh-001', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '20 minutes', NOW(), NOW());

    INSERT INTO "TransactionStatusHistory" ("id", "transactionId", "oldStatus", "newStatus", "changedById", "changedAt")
    VALUES
      ('tsh-gbj-001', 'trx-gbj-001', 'REGISTERED', 'WEIGH_IN_DONE', 'usr-sec-001', NOW() - INTERVAL '1 hour 15 minutes'),
      ('tsh-gbj-002', 'trx-gbj-001', 'WEIGH_IN_DONE', 'WAREHOUSE_DONE', 'usr-wh-001', NOW() - INTERVAL '20 minutes'),
      ('tsh-gbj-003', 'trx-gbj-001', 'WAREHOUSE_DONE', 'COMPLETED', 'usr-sec-001', NOW() - INTERVAL '10 minutes');

    -- Activity Logs
    INSERT INTO "ActivityLog" ("id", "userId", "userName", "role", "action", "module", "description", "status", "createdAt")
    VALUES
      ('act-001', 'usr-admin-001', 'System Administrator', 'ADMIN', 'SYSTEM_INITIALIZED', 'SETTINGS', 'Historical baseline database initialized', 'SUCCESS', NOW() - INTERVAL '3 hours'),
      ('act-002', 'usr-sec-001', 'Security Guard', 'SECURITY', 'TRANSACTION_CREATE', 'GATE', 'Created GBB transaction TRX-GBB-HIST-001', 'SUCCESS', NOW() - INTERVAL '3 hours');
  `;

  psql(seedSql);

  // 6. Query and assert all 16 entity record counts (fail closed if any query fails)
  const queryCount = (tableName) => {
    const out = psql(`SELECT COUNT(*) FROM "${tableName}";`);
    const num = parseInt(out, 10);
    if (isNaN(num)) {
      throw new Error(`Non-numeric result when querying table ${tableName}: ${out}`);
    }
    return num;
  };

  const tableCounts = {
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
    transactionCorrections: 0, // table created in migration 7
    transactionCorrectionItems: 0, // table created in migration 8
    transactionStatusHistory: queryCount('TransactionStatusHistory'),
    userWarehouseAccess: queryCount('UserWarehouseAccess')
  };

  console.log('Seeded historical baseline entity counts:', tableCounts);

  // 7. Write companion physical attachment archive JSON
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

  // Write sample physical files to uploads and backend/uploads directories for preflight checks
  const uploadDirs = [
    path.resolve(targetDir, '../../../uploads'),
    path.resolve(targetDir, '../../../backend/uploads')
  ];
  for (const upDir of uploadDirs) {
    fs.mkdirSync(path.join(upDir, 'qc'), { recursive: true });
    fs.mkdirSync(path.join(upDir, 'weighbridge'), { recursive: true });
    fs.writeFileSync(path.join(upDir, 'qc', 'vehicle_check_proof.pdf'), samplePdfContent);
    fs.writeFileSync(path.join(upDir, 'weighbridge', 'weighbridge_ticket.jpg'), sampleJpgContent);
  }

  // 8. Execute pg_dump -Fc
  console.log('Exporting PostgreSQL binary dump to:', dumpPath);
  const dumpCmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} -F c -f "${dumpPath}"`;
  execSync(dumpCmd, { env, stdio: 'inherit' });

  const dumpSha256 = computeSha256(dumpPath);
  console.log(`Generated dump SHA-256: ${dumpSha256}`);

  // 9. Write companion manifest
  const manifest = {
    manifestType: 'HISTORICAL_REHEARSAL_FIXTURE',
    backupId: 'BKP-HISTORICAL-REHEARSAL-FIXTURE',
    sourceVersion: '0.5.0-historical',
    sourceMigrationCount: HISTORICAL_MIGRATIONS.length,
    targetMigrationCount: 18,
    sourceMigrations: HISTORICAL_MIGRATIONS,
    createdAt: new Date().toISOString(),
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

  const hmacSecret = process.env.BACKUP_SIGNATURE_SECRET || 'test-backup-signature-secret-for-ci-pipeline-min-32-chars-long';
  manifest.signature = crypto.createHmac('sha256', hmacSecret).update(`${manifest.backupId}:${manifest.checksums.dump}`).digest('hex');

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Generated companion manifest with HMAC signature at:', manifestPath);
  console.log('✅ Authentic historical rehearsal test fixtures generated successfully.');
}

main().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
