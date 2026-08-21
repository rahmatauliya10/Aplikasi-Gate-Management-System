/**
 * Database Audit & History Table Immutability Privilege Enforcer (P0)
 *
 * Ensures that role `gms_app` has SELECT and INSERT privileges on immutable audit/history tables,
 * but UPDATE and DELETE privileges are strictly revoked/denied.
 *
 * Must be executed using `gms_owner` (table owner) credentials after migrations deploy.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AUDIT_TABLES = [
  'ActivityLog',
  'TransactionCorrection',
  'TransactionCorrectionItem',
  'TransactionStatusHistory',
];

async function main() {
  console.log('🔒 Enforcing immutable audit and history table privilege restrictions...');

  const appUser = process.env.GMS_APP_USER || 'gms_app';

  try {
    // 1. Verify if app role exists in PostgreSQL
    const roleCheck = await prisma.$queryRawUnsafe(
      `SELECT rolname FROM pg_roles WHERE rolname = $1;`,
      appUser,
    );

    if (!roleCheck || roleCheck.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `Production Security Error: Configured application role [${appUser}] does not exist in PostgreSQL!`,
        );
      }
      console.log(`ℹ️  Role [${appUser}] does not exist in this database environment. Skipping.`);
      await prisma.$disconnect();
      return;
    }

    // 2. Revoke UPDATE, DELETE, and TRUNCATE on each immutable audit table for app role
    for (const table of AUDIT_TABLES) {
      // Check if table exists in public schema
      const tableCheck = await prisma.$queryRawUnsafe(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1;`,
        table,
      );

      if (tableCheck && tableCheck.length > 0) {
        await prisma.$executeRawUnsafe(
          `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."${table}" FROM "${appUser}";`,
        );
        console.log(`  ✓ Revoked UPDATE, DELETE, TRUNCATE on [public."${table}"] from role [${appUser}]`);
      } else {
        console.log(`  ℹ️ Table [public."${table}"] not found yet. Skipping.`);
      }
    }

    // 3. Defense-in-depth: Revoke DELETE and TRUNCATE on Transaction table for app role
    const txTableCheck = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Transaction';`,
    );
    if (txTableCheck && txTableCheck.length > 0) {
      await prisma.$executeRawUnsafe(
        `REVOKE DELETE, TRUNCATE ON TABLE public."Transaction" FROM "${appUser}";`,
      );
      console.log(`  ✓ Revoked DELETE, TRUNCATE on [public."Transaction"] from role [${appUser}]`);
    }

    console.log('✅ Audit & history table immutability privileges successfully enforced.\n');
  } catch (err) {
    console.error('❌ Error enforcing audit table immutability privileges:', err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
