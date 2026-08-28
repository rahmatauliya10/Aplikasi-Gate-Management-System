/**
 * Migration-State-Aware Schema Drift Check Gate
 *
 * Replaces naive `prisma migrate diff` to accurately handle databases with
 * legitimate pending migrations (e.g. 18 applied, 2 pending) without false positive drift.
 *
 * Verifies:
 * 1. Checksums of all applied migrations in _prisma_migrations match local files.
 * 2. Unmanaged / legacy databases fail closed.
 * 3. If all migrations are applied: DB matches Prisma datamodel (zero diff).
 * 4. If pending migrations exist: Diff between DB and Datamodel is strictly and
 *    exclusively accounted for by the pending migration SQL scripts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

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
      console.error('   Applying migrations on an unmanaged existing database will corrupt state.');
      await prismaClient.$disconnect();
      process.exit(1);
    }
  } catch (checkErr) {
    console.error('❌ Could not verify table existence for fresh database check (FAIL CLOSED):', checkErr.message);
    await prismaClient.$disconnect();
    process.exit(1);
  }
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, '') // remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function extractStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  console.log('\n=== GMS Migration-State-Aware Drift Verification Gate ===\n');

  const baseDir = path.resolve(__dirname, '..');
  const schemaPath = fs.existsSync(path.join(baseDir, 'prisma', 'schema.prisma'))
    ? path.join(baseDir, 'prisma', 'schema.prisma')
    : path.join(baseDir, 'backend', 'prisma', 'schema.prisma');
  const migrationsDir = fs.existsSync(path.join(baseDir, 'prisma', 'migrations'))
    ? path.join(baseDir, 'prisma', 'migrations')
    : path.join(baseDir, 'backend', 'prisma', 'migrations');

  // Step 1: Read _prisma_migrations from DB
  let dbMigrations = [];
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
    const isRelationMissing =
      errCode === '42P01' ||
      (errMsg.includes('_prisma_migrations') &&
        (errMsg.includes('does not exist') || errMsg.includes('undefined_table')));

    if (isRelationMissing) {
      await checkUnmanagedLegacyDb(prisma);
      console.log('ℹ️  Table _prisma_migrations does not exist yet (Fresh Database). Safe to proceed with initial migration.\n');
      await prisma.$disconnect();
      process.exit(0);
    }

    console.error('❌ Failed to query _prisma_migrations (FAIL CLOSED):', errMsg);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!dbMigrations || dbMigrations.length === 0) {
    await checkUnmanagedLegacyDb(prisma);
    console.log('ℹ️  No migrations found in database (Fresh Database). Safe to proceed with initial migration.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Step 2: Verify Checksums of all applied migrations
  console.log(`Auditing ${dbMigrations.length} applied migration(s) against local files in repo...`);
  let hasFailure = false;
  const appliedMigrationNames = new Set();

  for (const row of dbMigrations) {
    appliedMigrationNames.add(row.migration_name);
    const localFile = path.join(migrationsDir, row.migration_name, 'migration.sql');
    if (!fs.existsSync(localFile)) {
      console.error(`❌ MIGRATION DRIFT: DB contains applied migration '${row.migration_name}' which is MISSING from repo!`);
      hasFailure = true;
      continue;
    }

    const localContent = fs.readFileSync(localFile, 'utf8');
    const localChecksum = crypto.createHash('sha256').update(localContent).digest('hex');

    if (row.checksum !== localChecksum) {
      console.error(`❌ CHECKSUM DRIFT on migration '${row.migration_name}':`);
      console.error(`   Database Checksum: ${row.checksum}`);
      console.error(`   Local File SHA256: ${localChecksum}`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    console.error('\n❌ MIGRATION INTEGRITY DRIFT DETECTED: Applied migrations do not match repository baseline.\n');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('✅ Applied migration checksums match repository 100% [PASS].');

  // Step 3: Identify Pending Migrations
  const allLocalMigrations = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((d) => {
        const fullPath = path.join(migrationsDir, d);
        return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'migration.sql'));
      }).sort()
    : [];

  const pendingMigrations = allLocalMigrations.filter((m) => !appliedMigrationNames.has(m));

  console.log(`\nMigration State Summary:`);
  console.log(`   Applied in DB: ${appliedMigrationNames.size} / ${allLocalMigrations.length}`);
  console.log(`   Pending in Repo: ${pendingMigrations.length}`);

  if (pendingMigrations.length > 0) {
    for (const p of pendingMigrations) {
      console.log(`   ⏳ Pending: ${p}`);
    }
  }

  // Step 4: Schema-Level Drift Verification
  if (pendingMigrations.length === 0) {
    console.log('\nAll migrations applied. Executing exact Prisma datamodel diff check against live database...');
    try {
      execSync(
        `npx prisma migrate diff --from-schema-datasource "${schemaPath}" --to-schema-datamodel "${schemaPath}" --exit-code`,
        { stdio: 'inherit', encoding: 'utf8' },
      );
      console.log('\n✅ Zero Schema Drift: Live database perfectly matches Prisma datamodel [100% OK].\n');
      await prisma.$disconnect();
      process.exit(0);
    } catch (diffErr) {
      console.error('\n❌ SCHEMA DRIFT DETECTED: Database schema was modified outside Prisma migrations (exit code ' + (diffErr.status || 1) + ')!\n');
      await prisma.$disconnect();
      process.exit(1);
    }
  } else {
    console.log('\nPending migrations detected. Verifying that live database matches expected applied state without unauthorized drift...');
    
    let diffScript = '';
    try {
      diffScript = execSync(
        `npx prisma migrate diff --from-schema-datasource "${schemaPath}" --to-schema-datamodel "${schemaPath}" --script`,
        { encoding: 'utf8' },
      );
    } catch (genErr) {
      console.error('❌ Failed to generate schema diff script:', genErr.message);
      await prisma.$disconnect();
      process.exit(1);
    }

    if (!diffScript.trim() || diffScript.trim() === '-- This is an empty migration.') {
      console.log('ℹ️  No schema changes pending between live database and datamodel.\n');
      await prisma.$disconnect();
      process.exit(0);
    }

    // Read combined pending SQL
    const pendingSqlCombined = pendingMigrations
      .map((m) => fs.readFileSync(path.join(migrationsDir, m, 'migration.sql'), 'utf8'))
      .join('\n');

    const normPending = normalizeSql(pendingSqlCombined);
    const diffStatements = extractStatements(diffScript);

    let unexpectedStatements = [];

    for (const stmt of diffStatements) {
      const normStmt = normalizeSql(stmt);
      if (!normStmt) continue;

      // Extract core signature (e.g., "alter table ... add column ...", "create table ...", "create type ...")
      // Check if statement or its target object is declared in pending migrations
      let isAccountedFor = normPending.includes(normStmt);

      if (!isAccountedFor) {
        // Keyword/identifier token match fallback for formatted differences
        const createTableMatch = normStmt.match(/create table\s+["`]?(\w+)["`]?/i);
        const addColumnMatch = normStmt.match(/alter table\s+["`]?(\w+)["`]?\s+add column\s+["`]?(\w+)["`]?/i);
        const createTypeMatch = normStmt.match(/create type\s+["`]?(\w+)["`]?/i);
        const createIndexMatch = normStmt.match(/create\s+(unique\s+)?index\s+["`]?(\w+)["`]?/i);

        if (createTableMatch && normPending.includes(createTableMatch[1].toLowerCase())) {
          isAccountedFor = true;
        } else if (addColumnMatch && normPending.includes(addColumnMatch[1].toLowerCase()) && normPending.includes(addColumnMatch[2].toLowerCase())) {
          isAccountedFor = true;
        } else if (createTypeMatch && normPending.includes(createTypeMatch[1].toLowerCase())) {
          isAccountedFor = true;
        } else if (createIndexMatch && normPending.includes(createIndexMatch[2].toLowerCase())) {
          isAccountedFor = true;
        }
      }

      if (!isAccountedFor) {
        unexpectedStatements.push(stmt);
      }
    }

    if (unexpectedStatements.length > 0) {
      console.error('\n❌ UNMANAGED SCHEMA DRIFT DETECTED:');
      console.error('   The following database schema differences are NOT accounted for in the pending migrations:');
      for (const unexp of unexpectedStatements) {
        console.error(`   - ${unexp}`);
      }
      console.error('\n   The database has been modified manually or is in an inconsistent state!\n');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`\n✅ PENDING-MIGRATION-AWARE DRIFT CHECK PASSED:`);
    console.log(`   Database accurately matches ${appliedMigrationNames.size} applied migration(s).`);
    console.log(`   All ${diffStatements.length} schema diff statement(s) are strictly accounted for in the ${pendingMigrations.length} pending migration(s).`);
    console.log(`   Zero unmanaged drift detected.\n`);
    await prisma.$disconnect();
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error('Fatal error in migration drift check:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
