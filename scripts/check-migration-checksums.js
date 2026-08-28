/**
 * Migration Checksum Reconciliation Script (P0-01)
 *
 * Diagnostic-only. Compares checksums in _prisma_migrations table
 * against the local migration files. Does NOT modify anything.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/check-migration-checksums.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e1) {
  try {
    PrismaClient = require(
      path.resolve(process.cwd(), 'node_modules', '@prisma', 'client'),
    ).PrismaClient;
  } catch (e2) {
    PrismaClient = require(
      path.resolve(__dirname, '..', 'backend', 'node_modules', '@prisma', 'client'),
    ).PrismaClient;
  }
}

const prisma = new PrismaClient();

async function checkUnmanagedLegacyDb(prismaClient) {
  try {
    const existingTables = await prismaClient.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const tableNames = (existingTables || []).map((t) => (t.tablename || '').toLowerCase());
    const gmsBusinessTables = ['user', 'transaction', 'qcvehiclecheck', 'weighbridgerecord'];
    const foundGmsTables = tableNames.filter((t) => gmsBusinessTables.includes(t));

    if (foundGmsTables.length > 0) {
      console.error('❌ UNMANAGED / LEGACY DATABASE DETECTED (FAIL CLOSED):');
      console.error(
        `   Table '_prisma_migrations' is missing/empty, but GMS business tables (${foundGmsTables.join(', ')}) already exist in the database!`,
      );
      console.error('   Applying initial migrations on an unmanaged existing database will crash or corrupt state.');
      console.error('   Please reconcile migration history before proceeding.\n');
      await prismaClient.$disconnect();
      process.exit(1);
    }
  } catch (checkErr) {
    console.error('❌ Could not verify table existence for fresh database check (FAIL CLOSED):', checkErr.message);
    await prismaClient.$disconnect();
    process.exit(1);
  }
}

async function main() {
  console.log('\n=== GMS Migration Checksum Reconciliation ===\n');

  // 1. Read _prisma_migrations from DB
  let dbMigrations;
  try {
    dbMigrations = await prisma.$queryRaw`
      SELECT
        id,
        migration_name,
        checksum,
        started_at,
        finished_at,
        applied_steps_count
      FROM "_prisma_migrations"
      ORDER BY started_at
    `;
  } catch (err) {
    const errCode = err?.meta?.code || err?.code;
    const errMsg = String(err?.message || err);

    // Check if error is PostgreSQL 42P01 (relation "_prisma_migrations" does not exist)
    const isRelationMissing =
      errCode === '42P01' ||
      (errMsg.includes('_prisma_migrations') &&
        (errMsg.includes('does not exist') ||
          errMsg.includes('undefined_table')));

    if (isRelationMissing) {
      await checkUnmanagedLegacyDb(prisma);
      console.log('ℹ️  Table _prisma_migrations does not exist yet (Fresh Database).');
      console.log('   Safe to apply initial migrations.\n');
      await prisma.$disconnect();
      process.exit(0);
    }

    console.error('❌ Failed to verify migration history due to database error (FAIL CLOSED):');
    console.error(`   ${errMsg}\n`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!dbMigrations || dbMigrations.length === 0) {
    await checkUnmanagedLegacyDb(prisma);
    console.log('ℹ️  No migrations found in database (Fresh Database).');
    console.log('   Safe to apply initial migrations.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`Found ${dbMigrations.length} migration(s) in database.\n`);

  // 2. Compare with local files
  const baseDir = path.resolve(__dirname, '..');
  const migrationsDir = fs.existsSync(
    path.join(baseDir, 'backend', 'prisma', 'migrations'),
  )
    ? path.join(baseDir, 'backend', 'prisma', 'migrations')
    : path.join(baseDir, 'prisma', 'migrations');
  let hasFailure = false;
  let mismatchCount = 0;

  for (const row of dbMigrations) {
    const localFile = path.join(
      migrationsDir,
      row.migration_name,
      'migration.sql',
    );
    const exists = fs.existsSync(localFile);

    if (!exists) {
      console.log(`⚠️  ${row.migration_name}`);
      console.log(`   DB checksum: ${row.checksum}`);
      console.log(`   Local file:  MISSING`);
      console.log(`   Applied:     ${row.started_at?.toISOString()}`);
      console.log('');
      hasFailure = true;
      mismatchCount++;
      continue;
    }

    const localContent = fs.readFileSync(localFile, 'utf-8');
    const localChecksum = crypto
      .createHash('sha256')
      .update(localContent)
      .digest('hex');

    // Prisma checksums are SHA-256 but stored differently depending on version.
    // We compare the local sha256 with the DB checksum.
    const match = row.checksum === localChecksum;

    if (match) {
      console.log(`✅ ${row.migration_name}`);
      console.log(`   Checksum: ${row.checksum.substring(0, 16)}...`);
    } else {
      console.log(`❌ ${row.migration_name}`);
      console.log(`   DB checksum:    ${row.checksum}`);
      console.log(`   Local checksum: ${localChecksum}`);
      console.log(`   Applied:        ${row.started_at?.toISOString()}`);
      hasFailure = true;
      mismatchCount++;
    }
    console.log('');
  }

  // 3. Check for local migrations not in DB
  let pendingCount = 0;
  if (fs.existsSync(migrationsDir)) {
    const localDirs = fs.readdirSync(migrationsDir).filter((d) => {
      const fullPath = path.join(migrationsDir, d);
      return (
        fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'migration.sql'))
      );
    });

    const dbNames = new Set(dbMigrations.map((m) => m.migration_name));
    const pendingMigrations = localDirs.filter((d) => !dbNames.has(d));
    pendingCount = pendingMigrations.length;

    if (pendingMigrations.length > 0) {
      console.log(`\n📋 Pending migrations (in repo but not applied to DB):`);
      for (const name of pendingMigrations) {
        console.log(`   ⏳ ${name}`);
      }
      console.log('');
    }
  }

  // Parse optional CLI arguments for pending count enforcement
  const args = process.argv.slice(2);
  const expectPendingArgIdx = args.findIndex(
    (a) => a === '--expect-pending' || a.startsWith('--expect-pending='),
  );
  if (expectPendingArgIdx !== -1) {
    const arg = args[expectPendingArgIdx];
    let expectedCount = null;
    if (arg.includes('=')) {
      expectedCount = parseInt(arg.split('=')[1], 10);
    } else if (args[expectPendingArgIdx + 1] !== undefined) {
      expectedCount = parseInt(args[expectPendingArgIdx + 1], 10);
    }
    if (expectedCount !== null && !isNaN(expectedCount)) {
      if (pendingCount !== expectedCount) {
        console.error(
          `❌ PENDING MIGRATIONS MISMATCH: Expected ${expectedCount} pending migration(s), but found ${pendingCount}.`,
        );
        hasFailure = true;
      } else {
        console.log(
          `✅ Expected pending migrations count (${expectedCount}) verified.`,
        );
      }
    }
  }

  if (args.includes('--fail-on-pending') && pendingCount > 0) {
    console.error(
      `❌ UNAPPLIED MIGRATIONS DETECTED: Found ${pendingCount} pending migration(s) when --fail-on-pending was specified.`,
    );
    hasFailure = true;
  }

  // 4. Summary
  console.log('--- Summary ---');
  if (!hasFailure) {
    console.log('✅ All migration checksums match. Safe to deploy.');
  } else {
    console.log(`❌ ${mismatchCount} checksum mismatch(es) found.`);
    console.log('');
    console.log(
      '⚠️  DO NOT run prisma migrate deploy until mismatches are resolved.',
    );
    console.log('   Options:');
    console.log(
      '   1. If the DB migration was never production-deployed, mark it resolved in _prisma_migrations',
    );
    console.log(
      '   2. If the DB migration WAS production-deployed, create a new migration to apply the delta',
    );
    console.log('   3. Contact the audit team for reconciliation guidance');
  }

  await prisma.$disconnect();
  process.exit(hasFailure ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
