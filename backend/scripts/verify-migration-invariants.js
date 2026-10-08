/**
 * Database Migration Invariants Verifier (Release Gate)
 *
 * Verifies that after database migrations have run:
 * 1. ZERO active GSP ProductCatalog records have null gspAnalysisProfile OR null receiptUnit.
 * 2. All active GSP ProductCatalog receiptUnit values are strictly 'KG' or 'LITER'.
 * 3. Any active GSP transaction reaching or past WAREHOUSE_IN_PROGRESS has non-null receiptUnit.
 *
 * Exits with code 0 on success, code 1 on invariant violation.
 */

const { PrismaClient } = require('@prisma/client');

async function verifyMigrationInvariants() {
  const prisma = new PrismaClient();
  console.log('🔍 [INVARIANT_GATE] Verifying migration invariants against database...');

  try {
    // 1. Check for active GSP product catalogs with null profile or null receiptUnit
    const invalidActiveCatalogs = await prisma.$queryRawUnsafe(`
      SELECT id, code, name, "processType", "isActive", "gspAnalysisProfile", "receiptUnit"
      FROM "ProductCatalog"
      WHERE "processType" = 'GSP'
        AND "isActive" = true
        AND ("gspAnalysisProfile" IS NULL OR "receiptUnit" IS NULL);
    `);

    if (invalidActiveCatalogs && invalidActiveCatalogs.length > 0) {
      console.error(
        `❌ [INVARIANT_VIOLATION] Found ${invalidActiveCatalogs.length} active GSP catalog(s) with NULL profile or receiptUnit:`,
      );
      console.error(JSON.stringify(invalidActiveCatalogs, null, 2));
      throw new Error(
        `[INVARIANT_GATE_FAILED] Active GSP ProductCatalog records must have non-null gspAnalysisProfile and receiptUnit.`,
      );
    }

    // 2. Check for invalid receiptUnit values on active GSP catalogs (strictly KG or LITER)
    const invalidUomCatalogs = await prisma.$queryRawUnsafe(`
      SELECT id, code, name, "receiptUnit"
      FROM "ProductCatalog"
      WHERE "processType" = 'GSP'
        AND "isActive" = true
        AND "receiptUnit" NOT IN ('KG', 'LITER');
    `);

    if (invalidUomCatalogs && invalidUomCatalogs.length > 0) {
      console.error(
        `❌ [INVARIANT_VIOLATION] Found ${invalidUomCatalogs.length} active GSP catalog(s) with invalid receiptUnit:`,
      );
      console.error(JSON.stringify(invalidUomCatalogs, null, 2));
      throw new Error(
        `[INVARIANT_GATE_FAILED] Active GSP ProductCatalog receiptUnit must be strictly 'KG' or 'LITER'.`,
      );
    }

    // 3. Check for GSP transactions at or past WAREHOUSE_IN_PROGRESS with NULL receiptUnit
    const invalidGspTransactions = await prisma.$queryRawUnsafe(`
      SELECT id, "transactionNumber", "processType", status, "receiptUnit"
      FROM "Transaction"
      WHERE "processType" = 'GSP'
        AND status IN ('WAREHOUSE_IN_PROGRESS', 'WAREHOUSE_DONE', 'WAITING_WEIGH_OUT', 'WEIGH_OUT_COMPLETED', 'GATE_OUT_COMPLETED', 'COMPLETED')
        AND "receiptUnit" IS NULL;
    `);

    if (invalidGspTransactions && invalidGspTransactions.length > 0) {
      console.error(
        `❌ [INVARIANT_VIOLATION] Found ${invalidGspTransactions.length} GSP transaction(s) in/past warehouse with NULL receiptUnit:`,
      );
      console.error(JSON.stringify(invalidGspTransactions, null, 2));
      throw new Error(
        `[INVARIANT_GATE_FAILED] In-progress or completed GSP transactions must have non-null receiptUnit.`,
      );
    }

    console.log('✓ [MIGRATION_INVARIANT_OK] All migration invariants verified successfully.');
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  verifyMigrationInvariants()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = { verifyMigrationInvariants };
