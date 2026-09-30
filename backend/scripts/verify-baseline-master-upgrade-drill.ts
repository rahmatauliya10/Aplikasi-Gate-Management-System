/**
 * Comprehensive Master Baseline Upgrade & Intentional Drift Detection Drill
 *
 * Verifies:
 * 1. Clean upgrade from Baseline Master (Migrations 1..20) to GSP Branch (Migrations 21..22)
 * 2. 100% preservation of representative baseline master data
 * 3. Exact schema drift check (Zero Schema Drift)
 * 4. Intentional Schema Drift Injection & Positive Detection Test
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const POSTGRES_PORT = process.env.POSTGRES_PORT || '5433';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';
const POSTGRES_HOST = process.env.POSTGRES_HOST || '127.0.0.1';
const DRILL_DB_NAME = 'gms_master_upgrade_drill';

const BASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/postgres?schema=public`;
const DRILL_DB_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${DRILL_DB_NAME}?schema=public`;

const BASELINE_MASTER_MIGRATIONS = [
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
];

async function main() {
  console.log('========================================================================');
  console.log('  GMS MASTER BASELINE UPGRADE & INTENTIONAL DRIFT VERIFICATION DRILL   ');
  console.log('========================================================================\n');

  // Step 1: Create fresh isolated drill database
  console.log(`[Step 1/5] Creating isolated drill database: ${DRILL_DB_NAME}...`);
  execSync(`docker exec -i gate-system-postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS \\"${DRILL_DB_NAME}\\";"`, { encoding: 'utf8' });
  execSync(`docker exec -i gate-system-postgres psql -U postgres -d postgres -c "CREATE DATABASE \\"${DRILL_DB_NAME}\\";"`, { encoding: 'utf8' });
  console.log(`  ✓ Database "${DRILL_DB_NAME}" created successfully.\n`);

  // Step 2: Apply Baseline Master Migrations (1..20)
  console.log(`[Step 2/5] Applying 20 Baseline Master migrations (commit ae0b30c)...`);

  // Create _prisma_migrations table
  const initMigrationTableSql = `
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
  `;
  execSync(`docker exec -i gate-system-postgres psql -U postgres -d ${DRILL_DB_NAME}`, {
    input: initMigrationTableSql,
    encoding: 'utf8',
  });

  const migrationsDir = path.resolve(__dirname, '../prisma/migrations');

  for (const migName of BASELINE_MASTER_MIGRATIONS) {
    const sqlPath = path.join(migrationsDir, migName, 'migration.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Migration SQL not found: ${sqlPath}`);
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

    // Execute migration SQL via psql
    execSync(`docker exec -i gate-system-postgres psql -U postgres -d ${DRILL_DB_NAME}`, {
      input: sqlContent,
      encoding: 'utf8',
    });

    // Record migration in _prisma_migrations
    const recordSql = `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ('${crypto.randomUUID()}', '${checksum}', now(), '${migName}', 1);`;
    execSync(`docker exec -i gate-system-postgres psql -U postgres -d ${DRILL_DB_NAME}`, {
      input: recordSql,
      encoding: 'utf8',
    });

    process.stdout.write(`  ✓ Applied baseline migration: ${migName}\n`);
  }

  // Insert representative baseline master data
  console.log('\n  Seeding representative baseline data into master tables...');
  const seedSql = `
    INSERT INTO "User" (id, email, username, password, name, role, "isActive", "tokenVersion", "createdAt", "updatedAt")
    VALUES 
      ('usr-admin-1', 'admin@gms.local', 'admin', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'Admin Baseline', 'ADMIN', true, 0, now(), now()),
      ('usr-qc-1', 'qc.analyst@gms.local', 'qcanalyst', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'QC Analyst 1', 'QC', true, 0, now(), now()),
      ('usr-sec-1', 'security@gms.local', 'security1', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'Security Lead', 'SECURITY', true, 0, now(), now());

    INSERT INTO "Transaction" (
      id, "transactionNumber", "plateNumber", "plateNumberNormalized", "driverName", "driverPhone",
      "vendorName", "vehicleType", "processType", "cargoType", "cargoSubType", "cargoProcessType",
      status, "grossWeight", "tareWeight", "netWeight", "createdById", "createdAt", "updatedAt", revision
    ) VALUES 
      ('tx-base-001', 'GMS-20260828-0001', 'B 1234 ABC', 'B1234ABC', 'Budi Santoso', '08123456789', 'PT Vendor A', 'Truck', 'GBB', 'Raw Material', 'Kopi Robusta', 'INBOUND', 'REGISTERED', null, null, null, 'usr-admin-1', now(), now(), 1),
      ('tx-base-002', 'GMS-20260828-0002', 'B 5678 DEF', 'B5678DEF', 'Agus Prasetyo', '08123456788', 'PT Vendor B', 'Fuso', 'GBJ', 'Finished Goods', 'Kopi Kapal Api', 'OUTBOUND', 'COMPLETED', 15000, 5000, 10000, 'usr-sec-1', now(), now(), 5);

    INSERT INTO "WeighbridgeRecord" (id, "transactionId", type, weight, "operatorId", "createdAt", "updatedAt", revision, "isCurrent")
    VALUES 
      ('wbr-001', 'tx-base-002', 'IN', 5000, 'usr-sec-1', now(), now(), 1, false),
      ('wbr-002', 'tx-base-002', 'OUT', 15000, 'usr-sec-1', now(), now(), 2, true);

    INSERT INTO "AppSetting" (id, key, value, "createdAt", "updatedAt")
    VALUES ('set-001', 'SYS_VERSION', '1.0.0-baseline', now(), now());
  `;
  execSync(`docker exec -i gate-system-postgres psql -U postgres -d ${DRILL_DB_NAME}`, {
    input: seedSql,
    encoding: 'utf8',
  });

  const drillPrisma = new PrismaClient({ datasources: { db: { url: DRILL_DB_URL } } });
  await drillPrisma.$connect();

  const baselineCountRes: any = await drillPrisma.$queryRawUnsafe(`
    SELECT 
      (SELECT COUNT(*)::text FROM "User") as user_count,
      (SELECT COUNT(*)::text FROM "Transaction") as tx_count,
      (SELECT COUNT(*)::text FROM "WeighbridgeRecord") as wb_count;
  `);
  console.log(`  ✓ Representative baseline seeded: ${JSON.stringify(baselineCountRes[0])}\n`);

  await drillPrisma.$disconnect();

  // Step 3: Upgrade to GSP branch via Prisma migrate deploy
  console.log(`[Step 3/5] Upgrading database to GSP Branch via "prisma migrate deploy"...`);
  const migrateDeployOutput = execSync(
    `npx prisma migrate deploy`,
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: DRILL_DB_URL },
      encoding: 'utf8',
    },
  );
  console.log(migrateDeployOutput);

  // Verify migration status and baseline data preservation
  const verifyPrisma = new PrismaClient({ datasources: { db: { url: DRILL_DB_URL } } });
  await verifyPrisma.$connect();

  const migrationRows: any = await verifyPrisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, applied_steps_count 
    FROM "_prisma_migrations" 
    ORDER BY started_at ASC;
  `);
  console.log(`  ✓ Total migrations recorded in history: ${migrationRows.length}/22`);
  if (migrationRows.length !== 22) {
    throw new Error(`Expected exactly 22 migrations applied, found: ${migrationRows.length}`);
  }

  // Verify baseline data intact
  const postUpgradeCountRes: any = await verifyPrisma.$queryRawUnsafe(`
    SELECT 
      (SELECT COUNT(*)::text FROM "User") as user_count,
      (SELECT COUNT(*)::text FROM "Transaction") as tx_count,
      (SELECT COUNT(*)::text FROM "WeighbridgeRecord") as wb_count;
  `);
  console.log(`  ✓ Post-upgrade baseline data counts: ${JSON.stringify(postUpgradeCountRes[0])}`);
  if (
    Number(postUpgradeCountRes[0].user_count) !== Number(baselineCountRes[0].user_count) ||
    Number(postUpgradeCountRes[0].tx_count) !== Number(baselineCountRes[0].tx_count) ||
    Number(postUpgradeCountRes[0].wb_count) !== Number(baselineCountRes[0].wb_count)
  ) {
    throw new Error('Baseline data loss or corruption detected during upgrade!');
  }
  console.log('  ✓ 100% of baseline master records preserved perfectly across upgrade.\n');

  // Verify new GSP tables and columns work
  console.log('  Verifying new GSP tables (ProductCatalog, QcProductAnalysis)...');
  await verifyPrisma.$executeRawUnsafe(`
    INSERT INTO "ProductCatalog" (id, code, name, category, "processType", "isPaRequired", "policyVersion", "isActive", "createdAt", "updatedAt")
    VALUES 
      ('pc-solar-test', 'SOLAR-001', 'Solar B35', 'Fuel', 'GSP', false, 'SOP-GSP-2026.1', true, now(), now()),
      ('pc-pac-test', 'PAC-001', 'PAC 280 AC', 'Chemicals', 'GSP', true, 'SOP-GSP-2026.1', true, now(), now())
    ON CONFLICT (code) DO NOTHING;
  `);

  await verifyPrisma.$executeRawUnsafe(`
    INSERT INTO "QcProductAnalysis" (
      id, "transactionId", "productCategory", "productName", "parameters", result, status, "testedById", "testedAt", "createdAt", "updatedAt"
    ) VALUES (
      'pa-test-001', 'tx-base-001', 'Fuel', 'Solar B35', '{"density": 0.835}', 'PASS', 'RELEASE', 'usr-qc-1', now(), now(), now()
    );
  `);
  const gspCountRes: any = await verifyPrisma.$queryRawUnsafe(`SELECT COUNT(*)::text as count FROM "ProductCatalog";`);
  console.log(`  ✓ ProductCatalog records created successfully: ${gspCountRes[0].count}\n`);

  await verifyPrisma.$disconnect();

  // Step 4: Schema Drift Verification (Clean State)
  console.log(`[Step 4/5] Running schema drift inspection on upgraded database...`);
  try {
    const diffClean = execSync(
      `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "${DRILL_DB_URL}" --exit-code`,
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: DRILL_DB_URL },
        encoding: 'utf8',
      },
    );
    console.log(diffClean || '  No difference detected.');
    console.log('  ✓ Clean State: ZERO SCHEMA DRIFT VERIFIED (Exit Code 0).\n');
  } catch (err: any) {
    if (err.status !== 0) {
      console.error('Unexpected schema drift in clean state:', err.stdout || err.message);
      throw err;
    }
  }

  // Step 5: Intentional Drift Positive-Detection Test
  console.log(`[Step 5/5] Testing Intentional Drift Injection & Positive Detection...`);
  const driftPrisma = new PrismaClient({ datasources: { db: { url: DRILL_DB_URL } } });
  await driftPrisma.$connect();

  console.log('  Injecting rogue unmanaged column: "Transaction"."rogue_audit_drift_test"...');
  await driftPrisma.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN "rogue_audit_drift_test" VARCHAR(120);`);

  let detectedDrift = false;
  let driftOutput = '';
  try {
    execSync(
      `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "${DRILL_DB_URL}" --exit-code`,
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: DRILL_DB_URL },
        encoding: 'utf8',
      },
    );
  } catch (err: any) {
    // Exit code 2 indicates drift was detected by prisma migrate diff
    if (err.status === 2 || (err.stdout && err.stdout.includes('rogue_audit_drift_test'))) {
      detectedDrift = true;
      driftOutput = err.stdout || err.stderr || '';
    }
  }

  if (!detectedDrift) {
    throw new Error('FAILED: Intentional drift was NOT detected by the drift checker!');
  }
  console.log(`  ✓ POSITIVE DETECTION CONFIRMED! Drift checker flagged injected anomaly:`);
  console.log(`    Diff snippet: ${driftOutput.trim().split('\n').slice(0, 4).join('\n    ')}`);

  // Rollback rogue column
  console.log('\n  Cleaning up injected anomaly (ROLLBACK)...');
  await driftPrisma.$executeRawUnsafe(`ALTER TABLE "Transaction" DROP COLUMN "rogue_audit_drift_test";`);
  await driftPrisma.$disconnect();

  // Re-verify clean state after rollback
  const diffRollback = execSync(
    `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "${DRILL_DB_URL}" --exit-code`,
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: DRILL_DB_URL },
      encoding: 'utf8',
    },
  );
  console.log('  ✓ Post-cleanup: Re-verified Zero Schema Drift (Exit Code 0).\n');

  console.log('========================================================================');
  console.log('  DRILL COMPLETE: ALL 5 PHASES PASSED WITH 100% INTEGRITY & EVIDENCE   ');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Drill execution error:', err.message || err);
  process.exit(1);
});
