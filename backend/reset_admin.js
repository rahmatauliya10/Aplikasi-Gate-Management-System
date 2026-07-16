const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

async function run() {
  try {
    const newPassword = 'adminReset2026!';
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id
    });
    
    await prisma.user.update({
      where: { email: 'admin@gms.local' },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('SUCCESS: Admin password has been set to:', newPassword);
  } catch (err) {
    console.error('ERROR resetting admin password:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
