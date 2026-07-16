import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
    },
  });

  if (admins.length > 0) {
    const activeAdmin = admins.find((a) => a.isActive);
    if (activeAdmin) {
      console.log('ADMIN_EXISTS');
      process.exit(1);
    } else {
      console.log('ADMIN_INACTIVE');
      process.exit(2);
    }
  } else {
    console.log('NO_ADMIN');
    process.exit(0);
  }
}

void main()
  .catch((e) => {
    console.error(e);
    process.exit(3);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
