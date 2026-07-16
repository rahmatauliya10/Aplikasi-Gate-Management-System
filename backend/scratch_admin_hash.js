const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  try {
    const admin = await prisma.user.findFirst({
      where: {
        OR: [{ username: 'admin' }, { role: 'ADMIN' }]
      }
    });
    
    if (admin) {
      const hash = crypto.createHash('sha256').update(admin.passwordHash).digest('hex');
      console.log(`ADMIN_HASH_FINGERPRINT: ${hash.substring(0, 8)}`);
    } else {
      console.log('ADMIN_NOT_FOUND');
    }
  } catch (e) {
    console.error('Error fetching admin:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
