const { PrismaClient } = require('@prisma/client');

async function verifyCanonicalSeed() {
  const prisma = new PrismaClient();
  try {
    const canonicals = [
      { code: 'COAL-001', expectedUom: 'KG' },
      { code: 'SOLAR-001', expectedUom: 'LITER' },
      { code: 'PAC-001', expectedUom: 'LITER' },
      { code: 'PAC-002', expectedUom: 'LITER' },
      { code: 'PAC-003', expectedUom: 'LITER' },
      { code: 'RPD-001', expectedUom: 'LITER' },
      { code: 'RPD-002', expectedUom: 'LITER' },
    ];

    for (const c of canonicals) {
      const prod = await prisma.productCatalog.findUnique({ where: { code: c.code } });
      if (!prod) throw new Error(`Missing canonical seed product: ${c.code}`);
      if (prod.receiptUnit !== c.expectedUom) {
        throw new Error(`Invalid receiptUnit for ${c.code}: expected ${c.expectedUom}, got ${prod.receiptUnit}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  verifyCanonicalSeed()
    .then(() => {
      console.log('✓ Canonical seed verified: all 7 products match exact receiptUnit');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { verifyCanonicalSeed };
