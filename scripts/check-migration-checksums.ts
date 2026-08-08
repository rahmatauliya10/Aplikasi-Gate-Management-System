/**
 * Migration Checksum Reconciliation Script (P0-01)
 *
 * Diagnostic-only. Compares checksums in _prisma_migrations table
 * against the local migration files. Does NOT modify anything.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/check-migration-checksums.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationRow {
  id: string;
  migration_name: string;
  checksum: string;
  started_at: Date;
  finished_at: Date | null;
  applied_steps_count: number;
}

async function main() {
  console.log('\n=== GMS Migration Checksum Reconciliation ===\n');

  // 1. Read _prisma_migrations from DB
  let dbMigrations: MigrationRow[];
  try {
    dbMigrations = await prisma.$queryRaw<MigrationRow[]>`
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
  } catch (err: any) {
    console.error('❌ Failed to query _prisma_migrations table:', err.message);
    console.error('   Ensure DATABASE_URL points to a deployed database.');
    process.exit(1);
  }

  console.log(`Found ${dbMigrations.length} migration(s) in database.\n`);

  // 2. Compare with local files
  const migrationsDir = path.resolve(__dirname, '..', 'backend', 'prisma', 'migrations');
  let hasFailure = false;
  let mismatchCount = 0;

  for (const row of dbMigrations) {
    const localFile = path.join(migrationsDir, row.migration_name, 'migration.sql');
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
  if (fs.existsSync(migrationsDir)) {
    const localDirs = fs.readdirSync(migrationsDir).filter(d => {
      const fullPath = path.join(migrationsDir, d);
      return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'migration.sql'));
    });

    const dbNames = new Set(dbMigrations.map(m => m.migration_name));
    const pendingMigrations = localDirs.filter(d => !dbNames.has(d));

    if (pendingMigrations.length > 0) {
      console.log(`\n📋 Pending migrations (in repo but not applied to DB):`);
      for (const name of pendingMigrations) {
        console.log(`   ⏳ ${name}`);
      }
      console.log('');
    }
  }

  // 4. Summary
  console.log('--- Summary ---');
  if (!hasFailure) {
    console.log('✅ All migration checksums match. Safe to deploy.');
  } else {
    console.log(`❌ ${mismatchCount} checksum mismatch(es) found.`);
    console.log('');
    console.log('⚠️  DO NOT run prisma migrate deploy until mismatches are resolved.');
    console.log('   Options:');
    console.log('   1. If the DB migration was never production-deployed, mark it resolved in _prisma_migrations');
    console.log('   2. If the DB migration WAS production-deployed, create a new migration to apply the delta');
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
