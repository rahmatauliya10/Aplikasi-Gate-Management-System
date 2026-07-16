const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const qc = await prisma.user.findFirst({
      where: { username: 'qc' }
    });
    if (qc) {
      console.log('QC user details:', JSON.stringify({
        id: qc.id,
        email: qc.email,
        username: qc.username,
        isActive: qc.isActive,
        isDeleted: qc.isDeleted,
        mustChangePassword: qc.mustChangePassword,
        passwordChangedAt: qc.passwordChangedAt,
        createdAt: qc.createdAt
      }, null, 2));
    } else {
      console.log('QC user not found!');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
