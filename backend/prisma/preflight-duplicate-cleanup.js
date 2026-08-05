const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('===================================================');
  console.log('  GMS - MIGRATION PREFLIGHT DUPLICATE CLEANUP     ');
  console.log('===================================================\n');

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
    console.log('[1/3] Memeriksa duplikat QcVehicleCheck (transactionId)...');
    const qcDuplicates = await prisma.$queryRaw`
      SELECT "transactionId", COUNT(*) as count
      FROM "QcVehicleCheck"
      GROUP BY "transactionId"
      HAVING COUNT(*) > 1;
    `;

    let qcCleaned = 0;
    for (const dup of qcDuplicates) {
      const records = await prisma.qcVehicleCheck.findMany({
        where: { transactionId: dup.transactionId },
        orderBy: { createdAt: 'desc' },
      });
      const idsToDelete = records.slice(1).map((r) => r.id);
      if (idsToDelete.length > 0) {
        await prisma.qcVehicleCheck.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        qcCleaned += idsToDelete.length;
      }
    }
    console.log(`- Status QcVehicleCheck: ${qcCleaned} record duplikat lama dibersihkan.`);

    console.log('[2/3] Memeriksa duplikat IncomingMaterialCheck (transactionId)...');
    const incomingDuplicates = await prisma.$queryRaw`
      SELECT "transactionId", COUNT(*) as count
      FROM "IncomingMaterialCheck"
      GROUP BY "transactionId"
      HAVING COUNT(*) > 1;
    `;

    let incomingCleaned = 0;
    for (const dup of incomingDuplicates) {
      const records = await prisma.incomingMaterialCheck.findMany({
        where: { transactionId: dup.transactionId },
        orderBy: { createdAt: 'desc' },
      });
      const idsToDelete = records.slice(1).map((r) => r.id);
      if (idsToDelete.length > 0) {
        await prisma.incomingMaterialCheck.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        incomingCleaned += idsToDelete.length;
      }
    }
    console.log(`- Status IncomingMaterialCheck: ${incomingCleaned} record duplikat lama dibersihkan.`);

    console.log('[3/3] Memeriksa duplikat WarehouseProcess (transactionId, processType)...');
    const warehouseDuplicates = await prisma.$queryRaw`
      SELECT "transactionId", "processType", COUNT(*) as count
      FROM "WarehouseProcess"
      GROUP BY "transactionId", "processType"
      HAVING COUNT(*) > 1;
    `;

    let warehouseCleaned = 0;
    for (const dup of warehouseDuplicates) {
      const records = await prisma.warehouseProcess.findMany({
        where: {
          transactionId: dup.transactionId,
          processType: dup.processType,
        },
        orderBy: { createdAt: 'desc' },
      });
      const idsToDelete = records.slice(1).map((r) => r.id);
      if (idsToDelete.length > 0) {
        await prisma.warehouseProcess.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        warehouseCleaned += idsToDelete.length;
      }
    }
    console.log(`- Status WarehouseProcess: ${warehouseCleaned} record duplikat lama dibersihkan.`);

    console.log('\n===================================================');
    console.log('  SUCCESS: PREFLIGHT MIGRATION CHECK PASSED        ');
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
