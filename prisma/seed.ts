import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  const users = [
    {
      name: 'Admin',
      username: 'admin',
      email: 'admin@gms.local',
      password: 'admin123',
      role: 'ADMIN',
    },
    {
      name: 'Frengky Wahudi',
      username: 'qc',
      email: 'qc@gms.local',
      password: 'qc123',
      role: 'QC',
    },
    {
      name: 'Arga Vebrianto',
      username: 'warehouse',
      email: 'warehouse@gms.local',
      password: 'warehouse123',
      role: 'WAREHOUSE',
    },
    {
      name: 'Enggar',
      username: 'security',
      email: 'security@gms.local',
      password: 'security123',
      role: 'SECURITY',
    },
    {
      name: 'Weighbridge Operator',
      username: 'weighbridge',
      email: 'weighbridge@gms.local',
      password: 'weighbridge123',
      role: 'WEIGHBRIDGE',
    },
  ];

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    // Use upsert to prevent errors if running seed multiple times
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
      },
      create: {
        name: user.name,
        username: user.username,
        email: user.email,
        password: hashedPassword,
        role: user.role,
      },
    });
    console.log(`Upserted user: ${user.username}`);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
