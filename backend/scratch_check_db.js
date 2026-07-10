const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      weighbridgeRecords: true,
      incomingMaterialChecks: true,
      qcVehicleChecks: true
    }
  });
  console.log(JSON.stringify(transactions, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
