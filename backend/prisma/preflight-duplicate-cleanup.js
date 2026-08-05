const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('===================================================');
  console.log('  GMS - MIGRATION PREFLIGHT DUPLICATE AUDIT/CLEANUP ');
  console.log('===================================================\n');

  const args = process.argv.slice(2);
  const isExecuteCleanup = args.includes('--execute-cleanup') && args.includes('--approve');
  const isReportOnly = !isExecuteCleanup || args.includes('--report-only');

  if (isReportOnly) {
    console.log('[MODE]: REPORT-ONLY (DRY-RUN). No data will be deleted.');
    console.log('To execute cleanup, run with: --execute-cleanup --approve\n');
  } else {
    console.log('[MODE]: EXECUTE CLEANUP (DESTRUCTIVE MODE).');
    console.log('Confirmed with --execute-cleanup --approve flags.\n');
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

    // Check table existence helper
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

    let qcCleaned = 0;
    let incomingCleaned = 0;
    let warehouseCleaned = 0;

    // 1. QcVehicleCheck
    const hasQcTable = await checkTableExists('QcVehicleCheck');
    if (!hasQcTable) {
      console.log('[1/3] Table "QcVehicleCheck" does not exist yet. Skipping check.');
    } else {
      console.log('[1/3] Checking duplicates in QcVehicleCheck (transactionId)...');
      const qcDuplicates = await prisma.$queryRaw`
        SELECT "transactionId", COUNT(*) as count
        FROM "QcVehicleCheck"
        GROUP BY "transactionId"
        HAVING COUNT(*) > 1;
      `;

      const qcIdsToDelete = [];
      for (const dup of qcDuplicates) {
        const records = await prisma.qcVehicleCheck.findMany({
          where: { transactionId: dup.transactionId },
          orderBy: { createdAt: 'desc' },
        });
        const ids = records.slice(1).map((r) => r.id);
        qcIdsToDelete.push(...ids);
      }

      qcCleaned = qcIdsToDelete.length;
      if (isReportOnly) {
        console.log(`- Report: Found ${qcCleaned} duplicate QcVehicleCheck records (dry-run).`);
      } else if (qcIdsToDelete.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.qcVehicleCheck.deleteMany({ where: { id: { in: qcIdsToDelete } } });
        });
        console.log(`- Executed: ${qcCleaned} duplicate QcVehicleCheck records removed.`);
      } else {
        console.log(`- Status: No duplicate QcVehicleCheck records found.`);
      }
    }

    // 2. IncomingMaterialCheck
    const hasIncomingTable = await checkTableExists('IncomingMaterialCheck');
    if (!hasIncomingTable) {
      console.log('[2/3] Table "IncomingMaterialCheck" does not exist yet. Skipping check.');
    } else {
      console.log('[2/3] Checking duplicates in IncomingMaterialCheck (transactionId)...');
      const incomingDuplicates = await prisma.$queryRaw`
        SELECT "transactionId", COUNT(*) as count
        FROM "IncomingMaterialCheck"
        GROUP BY "transactionId"
        HAVING COUNT(*) > 1;
      `;

      const incomingIdsToDelete = [];
      for (const dup of incomingDuplicates) {
        const records = await prisma.incomingMaterialCheck.findMany({
          where: { transactionId: dup.transactionId },
          orderBy: { createdAt: 'desc' },
        });
        const ids = records.slice(1).map((r) => r.id);
        incomingIdsToDelete.push(...ids);
      }

      incomingCleaned = incomingIdsToDelete.length;
      if (isReportOnly) {
        console.log(`- Report: Found ${incomingCleaned} duplicate IncomingMaterialCheck records (dry-run).`);
      } else if (incomingIdsToDelete.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.incomingMaterialCheck.deleteMany({ where: { id: { in: incomingIdsToDelete } } });
        });
        console.log(`- Executed: ${incomingCleaned} duplicate IncomingMaterialCheck records removed.`);
      } else {
        console.log(`- Status: No duplicate IncomingMaterialCheck records found.`);
      }
    }

    // 3. WarehouseProcess
    const hasWarehouseTable = await checkTableExists('WarehouseProcess');
    if (!hasWarehouseTable) {
      console.log('[3/3] Table "WarehouseProcess" does not exist yet. Skipping check.');
    } else {
      console.log('[3/3] Checking duplicates in WarehouseProcess (transactionId, processType)...');
      const warehouseDuplicates = await prisma.$queryRaw`
        SELECT "transactionId", "processType", COUNT(*) as count
        FROM "WarehouseProcess"
        GROUP BY "transactionId", "processType"
        HAVING COUNT(*) > 1;
      `;

      const warehouseIdsToDelete = [];
      for (const dup of warehouseDuplicates) {
        const records = await prisma.warehouseProcess.findMany({
          where: {
            transactionId: dup.transactionId,
            processType: dup.processType,
          },
          orderBy: { createdAt: 'desc' },
        });
        const ids = records.slice(1).map((r) => r.id);
        warehouseIdsToDelete.push(...ids);
      }

      warehouseCleaned = warehouseIdsToDelete.length;
      if (isReportOnly) {
        console.log(`- Report: Found ${warehouseCleaned} duplicate WarehouseProcess records (dry-run).`);
      } else if (warehouseIdsToDelete.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.warehouseProcess.deleteMany({ where: { id: { in: warehouseIdsToDelete } } });
        });
        console.log(`- Executed: ${warehouseCleaned} duplicate WarehouseProcess records removed.`);
      } else {
        console.log(`- Status: No duplicate WarehouseProcess records found.`);
      }
    }

    console.log('\n===================================================');
    console.log('  SUCCESS: PREFLIGHT MIGRATION AUDIT COMPLETED     ');
    console.log('===================================================');
    process.exit(0);
  } catch (e) {
    console.error(`\nERROR PREFLIGHT MIGRATION CHECK GAGAL: ${e.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
