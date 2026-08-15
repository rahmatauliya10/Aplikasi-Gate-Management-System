const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('===================================================');
  console.log('  GMS - REVISION-AWARE PREFLIGHT DUPLICATE AUDIT   ');
  console.log('===================================================\n');

  const args = process.argv.slice(2);
  const isExecuteCleanup = args.includes('--execute-cleanup') && args.includes('--approve');
  const isFailOnDuplicates = args.includes('--fail-on-duplicates');
  const isReportOnly = !isExecuteCleanup || args.includes('--report-only');

  console.log('[MODE]: REVISION-AWARE PREFLIGHT AUDIT.');
  console.log('[SAFETY]: Automatic deletion of revision history is DISABLED to preserve audit logs.');
  if (isFailOnDuplicates) {
    console.log('[OPTION]: --fail-on-duplicates ENABLED (Will exit code 2 if duplicate active current records exist).\n');
  } else {
    console.log('\n');
  }

  const rawUrl = process.env.DATABASE_URL;
  const dbUrl = rawUrl ? rawUrl.replace(/^"|"$/g, '') : undefined;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL tidak dikonfigurasi.');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    await prisma.$connect();

    // Helper: Check table existence
    const checkTableExists = async (tableName) => {
      const res = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as exists;
      `;
      return Array.isArray(res) && res[0] && res[0].exists === true;
    };

    // Helper: Check column existence
    const checkColumnExists = async (tableName, columnName) => {
      const res = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
          AND column_name = ${columnName}
        ) as exists;
      `;
      return Array.isArray(res) && res[0] && res[0].exists === true;
    };

    let totalDuplicateCurrentRecords = 0;

    // 1. QcVehicleCheck
    const hasQcTable = await checkTableExists('QcVehicleCheck');
    if (!hasQcTable) {
      console.log('[1/4] Table "QcVehicleCheck" does not exist yet. Skipping check.');
    } else {
      const hasIsCurrent = await checkColumnExists('QcVehicleCheck', 'isCurrent');
      console.log(`[1/4] Checking duplicate active current records in QcVehicleCheck (isCurrent column: ${hasIsCurrent})...`);
      const qcDuplicates = hasIsCurrent
        ? await prisma.$queryRaw`
            SELECT "transactionId", COUNT(*) as count
            FROM "QcVehicleCheck"
            WHERE "isCurrent" = true
            GROUP BY "transactionId"
            HAVING COUNT(*) > 1;
          `
        : await prisma.$queryRaw`
            SELECT "transactionId", COUNT(*) as count
            FROM "QcVehicleCheck"
            GROUP BY "transactionId"
            HAVING COUNT(*) > 1;
          `;

      if (qcDuplicates.length > 0) {
        console.error(`⚠️ Found ${qcDuplicates.length} transaction(s) with multiple active (isCurrent=true) QcVehicleCheck records:`);
        for (const dup of qcDuplicates) {
          console.error(`   - transactionId: ${dup.transactionId} (Count: ${dup.count})`);
        }
        totalDuplicateCurrentRecords += qcDuplicates.length;
      } else {
        console.log('- Status: No duplicate active current QcVehicleCheck records found.');
      }
    }

    // 2. IncomingMaterialCheck
    const hasIncomingTable = await checkTableExists('IncomingMaterialCheck');
    if (!hasIncomingTable) {
      console.log('[2/4] Table "IncomingMaterialCheck" does not exist yet. Skipping check.');
    } else {
      const hasIsCurrent = await checkColumnExists('IncomingMaterialCheck', 'isCurrent');
      console.log(`[2/4] Checking duplicate active current records in IncomingMaterialCheck (isCurrent column: ${hasIsCurrent})...`);
      const incomingDuplicates = hasIsCurrent
        ? await prisma.$queryRaw`
            SELECT "transactionId", COUNT(*) as count
            FROM "IncomingMaterialCheck"
            WHERE "isCurrent" = true
            GROUP BY "transactionId"
            HAVING COUNT(*) > 1;
          `
        : await prisma.$queryRaw`
            SELECT "transactionId", COUNT(*) as count
            FROM "IncomingMaterialCheck"
            GROUP BY "transactionId"
            HAVING COUNT(*) > 1;
          `;

      if (incomingDuplicates.length > 0) {
        console.error(`⚠️ Found ${incomingDuplicates.length} transaction(s) with multiple active (isCurrent=true) IncomingMaterialCheck records:`);
        for (const dup of incomingDuplicates) {
          console.error(`   - transactionId: ${dup.transactionId} (Count: ${dup.count})`);
        }
        totalDuplicateCurrentRecords += incomingDuplicates.length;
      } else {
        console.log('- Status: No duplicate active current IncomingMaterialCheck records found.');
      }
    }

    // 3. WarehouseProcess
    const hasWarehouseTable = await checkTableExists('WarehouseProcess');
    if (!hasWarehouseTable) {
      console.log('[3/4] Table "WarehouseProcess" does not exist yet. Skipping check.');
    } else {
      const hasIsCurrent = await checkColumnExists('WarehouseProcess', 'isCurrent');
      console.log(`[3/4] Checking duplicate active current records in WarehouseProcess (isCurrent column: ${hasIsCurrent})...`);
      const warehouseDuplicates = hasIsCurrent
        ? await prisma.$queryRaw`
            SELECT "transactionId", "processType", COUNT(*) as count
            FROM "WarehouseProcess"
            WHERE "isCurrent" = true
            GROUP BY "transactionId", "processType"
            HAVING COUNT(*) > 1;
          `
        : await prisma.$queryRaw`
            SELECT "transactionId", "processType", COUNT(*) as count
            FROM "WarehouseProcess"
            GROUP BY "transactionId", "processType"
            HAVING COUNT(*) > 1;
          `;

      if (warehouseDuplicates.length > 0) {
        console.error(`⚠️ Found ${warehouseDuplicates.length} process(es) with multiple active (isCurrent=true) WarehouseProcess records:`);
        for (const dup of warehouseDuplicates) {
          console.error(`   - transactionId: ${dup.transactionId}, processType: ${dup.processType} (Count: ${dup.count})`);
        }
        totalDuplicateCurrentRecords += warehouseDuplicates.length;
      } else {
        console.log('- Status: No duplicate active current WarehouseProcess records found.');
      }
    }

    // 4. WeighbridgeRecord
    const hasWeighbridgeTable = await checkTableExists('WeighbridgeRecord');
    if (!hasWeighbridgeTable) {
      console.log('[4/4] Table "WeighbridgeRecord" does not exist yet. Skipping check.');
    } else {
      const hasIsCurrent = await checkColumnExists('WeighbridgeRecord', 'isCurrent');
      console.log(`[4/4] Checking duplicate active current records in WeighbridgeRecord (isCurrent column: ${hasIsCurrent})...`);
      const weighbridgeDuplicates = hasIsCurrent
        ? await prisma.$queryRaw`
            SELECT "transactionId", "type", COUNT(*) as count
            FROM "WeighbridgeRecord"
            WHERE "isCurrent" = true
            GROUP BY "transactionId", "type"
            HAVING COUNT(*) > 1;
          `
        : await prisma.$queryRaw`
            SELECT "transactionId", "type", COUNT(*) as count
            FROM "WeighbridgeRecord"
            GROUP BY "transactionId", "type"
            HAVING COUNT(*) > 1;
          `;

      if (weighbridgeDuplicates.length > 0) {
        console.error(`⚠️ Found ${weighbridgeDuplicates.length} record(s) with multiple active (isCurrent=true) WeighbridgeRecord entries:`);
        for (const dup of weighbridgeDuplicates) {
          console.error(`   - transactionId: ${dup.transactionId}, type: ${dup.type} (Count: ${dup.count})`);
        }
        totalDuplicateCurrentRecords += weighbridgeDuplicates.length;
      } else {
        console.log('- Status: No duplicate active current WeighbridgeRecord entries found.');
      }
    }

    console.log('\n===================================================');
    console.log('  PREFLIGHT MIGRATION AUDIT COMPLETED              ');
    console.log('===================================================');

    if (totalDuplicateCurrentRecords > 0) {
      console.error(`\n[PREFLIGHT BLOCKER]: Found ${totalDuplicateCurrentRecords} conflict(s) where multiple records have isCurrent=true.`);
      console.error('Automated deletion of historical audit logs is forbidden.');
      console.error('Please manually reconcile the duplicate current records (set isCurrent=false on superseded rows) before proceeding.');
      if (isFailOnDuplicates || isReportOnly || isExecuteCleanup) {
        process.exit(2);
      }
    }

    console.log('✅ No duplicate active current records found. Safe to proceed.\n');
    process.exit(0);
  } catch (e) {
    console.error(`\nERROR PREFLIGHT MIGRATION CHECK GAGAL: ${e.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
