import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with initial users...');

  // Hash passwords using argon2 (Argon2id is default or specifically configured)
  const hashOptions = { type: argon2.argon2id };
  const passwordHashAdmin = await argon2.hash('admin123', hashOptions);
  const passwordHashQC = await argon2.hash('qc123', hashOptions);
  const passwordHashWarehouse = await argon2.hash('warehouse123', hashOptions);
  const passwordHashSecurity = await argon2.hash('security123', hashOptions);

  // 1. Admin
  console.log('Upserting admin user...');
  const existingAdmin = await prisma.user.findFirst({
    where: { username: 'admin' }
  });

  let admin;
  if (existingAdmin) {
    admin = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        name: 'Admin',
        role: Role.ADMIN,
        isActive: true,
        passwordHash: passwordHashAdmin,
      },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        email: 'admin@gms.local',
        username: 'admin',
        name: 'Admin',
        role: Role.ADMIN,
        isActive: true,
        passwordHash: passwordHashAdmin,
      },
    });
  }

  // Hapus warehouseAccess lama lalu insert ulang sesuai seed.
  await prisma.userWarehouseAccess.deleteMany({ where: { userId: admin.id } });
  await prisma.userWarehouseAccess.createMany({
    data: [
      { userId: admin.id, processType: 'GBB' },
      { userId: admin.id, processType: 'GBJ' },
      { userId: admin.id, processType: 'GSP' },
    ],
  });

  // 2. QC
  console.log('Upserting QC user...');
  const qc = await prisma.user.upsert({
    where: { email: 'frengky.qc@gms.local' },
    update: {
      username: 'qc',
      name: 'Frengky Wahudi',
      role: Role.QC,
      isActive: true,
      passwordHash: passwordHashQC,
    },
    create: {
      email: 'frengky.qc@gms.local',
      username: 'qc',
      name: 'Frengky Wahudi',
      role: Role.QC,
      isActive: true,
      passwordHash: passwordHashQC,
    },
  });
  await prisma.userWarehouseAccess.deleteMany({ where: { userId: qc.id } });

  // 3. Warehouse
  console.log('Upserting warehouse user...');
  const warehouse = await prisma.user.upsert({
    where: { email: 'arga.warehouse@gms.local' },
    update: {
      username: 'warehouse',
      name: 'Arga Vebrianto',
      role: Role.WAREHOUSE,
      isActive: true,
      passwordHash: passwordHashWarehouse,
    },
    create: {
      email: 'arga.warehouse@gms.local',
      username: 'warehouse',
      name: 'Arga Vebrianto',
      role: Role.WAREHOUSE,
      isActive: true,
      passwordHash: passwordHashWarehouse,
    },
  });
  await prisma.userWarehouseAccess.deleteMany({ where: { userId: warehouse.id } });
  await prisma.userWarehouseAccess.createMany({
    data: [
      { userId: warehouse.id, processType: 'GBB' },
      { userId: warehouse.id, processType: 'GBJ' },
      { userId: warehouse.id, processType: 'GSP' },
    ],
  });

  // 4. Security
  console.log('Upserting security user...');
  const security = await prisma.user.upsert({
    where: { email: 'enggar.security@gms.local' },
    update: {
      username: 'security',
      name: 'Enggar',
      role: Role.SECURITY,
      isActive: true,
      passwordHash: passwordHashSecurity,
    },
    create: {
      email: 'enggar.security@gms.local',
      username: 'security',
      name: 'Enggar',
      role: Role.SECURITY,
      isActive: true,
      passwordHash: passwordHashSecurity,
    },
  });
  await prisma.userWarehouseAccess.deleteMany({ where: { userId: security.id } });

  // 5. Default Anti-Fraud Warning Announcement
  console.log('Upserting default announcement...');
  const existingAnnouncement = await prisma.announcement.findFirst({
    where: { type: 'FRAUD_ALERT' }
  });

  if (!existingAnnouncement) {
    await prisma.announcement.create({
      data: {
        title: 'Anti-Fraud Warning',
        message: '⚠️ ANTI-FRAUD WARNING: Seluruh proses gate, timbang, gudang, dan QC wajib dicatat sesuai kondisi aktual. Manipulasi data, pemalsuan dokumen, bypass proses, atau pengeluaran barang tanpa otorisasi akan terekam dalam sistem dan ditindak sesuai prosedur perusahaan.',
        type: 'FRAUD_ALERT',
        status: 'ACTIVE',
        location: 'ALL_PAGES',
        speed: 'NORMAL',
        priority: 'HIGH',
        textColor: '#FFFFFF',
        backgroundColor: '#EF4444',
        createdBy: admin?.id
      }
    });
  }

  console.log('Database seeding finished.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
