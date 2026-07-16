import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const environment = process.env.NODE_ENV;
  if (!['development', 'test', 'production'].includes(environment ?? '')) {
    throw new Error(`NODE_ENV tidak valid: "${environment}"`);
  }

  const isTest = environment === 'test';

  if (isTest && !process.env.DATABASE_URL?.toLowerCase().includes('test')) {
    throw new Error('Test seed menolak database non-test.');
  }

  console.log('Seeding database with initial users...');

  const generateTempPassword = () => randomBytes(16).toString('base64url');
  const hashOptions = { type: argon2.argon2id };

  // 1. Admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@gms.local';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  console.log(`Checking admin user (${adminEmail})...`);
  let adminId: string | null = null;
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: adminEmail },
        { username: adminUsername },
      ],
    },
  });

  if (!existingAdmin) {
    console.log(`Seeding admin user with username: ${adminUsername}, email: ${adminEmail}...`);
    const tempAdminPassword = isTest
      ? (process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123!')
      : generateTempPassword();

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminUsername,
        name: 'Admin',
        role: Role.ADMIN,
        isActive: true,
        passwordHash: await argon2.hash(tempAdminPassword, hashOptions),
        mustChangePassword: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        passwordChangedAt: null,
      },
    });
    if (!isTest) {
      console.log(`[SEED] Admin created. Temporary Password: ${tempAdminPassword}`);
    }
    await prisma.userWarehouseAccess.createMany({
      data: [
        { userId: admin.id, processType: 'GBB' },
        { userId: admin.id, processType: 'GBJ' },
        { userId: admin.id, processType: 'GSP' },
      ],
      skipDuplicates: true,
    });
    adminId = admin.id;
  } else {
    console.log('User admin already exists, skipped.');
    adminId = existingAdmin.id;
  }

  // Seeding of other roles is allowed ONLY in development or test environments
  const isDevOrTest = environment === 'development' || environment === 'test';

  if (isDevOrTest) {
    // 2. QC
    console.log('Checking QC user...');
    const existingQC = await prisma.user.findUnique({
      where: { email: 'frengky.qc@gms.local' },
    });

    if (!existingQC) {
      console.log('Seeding QC user...');
      const tempQCPassword = isTest ? 'QCPassword123!' : generateTempPassword();
      await prisma.user.create({
        data: {
          email: 'frengky.qc@gms.local',
          username: 'qc',
          name: 'Frengky Wahudi',
          role: Role.QC,
          isActive: true,
          passwordHash: await argon2.hash(tempQCPassword, hashOptions),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      if (!isTest) {
        console.log(`[SEED] QC created. Temporary Password: ${tempQCPassword}`);
      }
    } else {
      console.log('User qc already exists, skipped.');
    }

    // 3. Warehouse
    console.log('Checking warehouse user...');
    const existingWarehouse = await prisma.user.findUnique({
      where: { email: 'arga.warehouse@gms.local' },
    });

    if (!existingWarehouse) {
      console.log('Seeding warehouse user...');
      const tempWarehousePassword = isTest ? 'WarehousePassword123!' : generateTempPassword();
      const warehouse = await prisma.user.create({
        data: {
          email: 'arga.warehouse@gms.local',
          username: 'warehouse',
          name: 'Arga Vebrianto',
          role: Role.WAREHOUSE,
          isActive: true,
          passwordHash: await argon2.hash(tempWarehousePassword, hashOptions),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      if (!isTest) {
        console.log(`[SEED] Warehouse created. Temporary Password: ${tempWarehousePassword}`);
      }
      await prisma.userWarehouseAccess.createMany({
        data: [
          { userId: warehouse.id, processType: 'GBB' },
          { userId: warehouse.id, processType: 'GBJ' },
          { userId: warehouse.id, processType: 'GSP' },
        ],
        skipDuplicates: true,
      });
    } else {
      console.log('User warehouse already exists, skipped.');
    }

    // 4. Security
    console.log('Checking security user...');
    const existingSecurity = await prisma.user.findUnique({
      where: { email: 'enggar.security@gms.local' },
    });

    if (!existingSecurity) {
      console.log('Seeding security user...');
      const tempSecurityPassword = isTest ? 'SecurityPassword123!' : generateTempPassword();
      await prisma.user.create({
        data: {
          email: 'enggar.security@gms.local',
          username: 'security',
          name: 'Enggar',
          role: Role.SECURITY,
          isActive: true,
          passwordHash: await argon2.hash(tempSecurityPassword, hashOptions),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      if (!isTest) {
        console.log(`[SEED] Security created. Temporary Password: ${tempSecurityPassword}`);
      }
    } else {
      console.log('User security already exists, skipped.');
    }
  } else {
    console.log('Production or non-development environment detected, skipping non-admin user seeding.');
  }

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
        createdBy: adminId
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
