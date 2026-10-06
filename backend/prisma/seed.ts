import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function getOrCreateBootstrapAdminPassword(secretFilePath?: string): string {
  const envPwd = (
    process.env.ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD
  )?.trim();
  const weakPasswords = [
    'admin123',
    'admin123!',
    'password',
    'password123',
    'password123!',
    'admin',
    'supersecret',
    'changeit',
    'changeme',
    'gms123',
    'gms123!',
    '12345678',
    '123456789',
    '1234567890',
  ];

  if (
    envPwd &&
    envPwd.length >= 12 &&
    !weakPasswords.includes(envPwd.toLowerCase())
  ) {
    return envPwd;
  }

  const defaultPath =
    process.env.NODE_ENV === 'production'
      ? '/app/secrets/bootstrap_admin_password.txt'
      : path.resolve(
          process.cwd(),
          '../deploy/secrets/bootstrap_admin_password.txt',
        );
  const targetPath = secretFilePath || defaultPath;

  if (fs.existsSync(targetPath)) {
    try {
      const savedPwd = fs.readFileSync(targetPath, 'utf8').trim();
      if (savedPwd.length >= 12) {
        return savedPwd;
      }
    } catch (e) {
      console.error(`[BootstrapPassword] Failed reading ${targetPath}:`, e);
    }
  }

  const newPassword = 'GMS_' + randomBytes(12).toString('hex') + '!';

  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, newPassword, {
      mode: 0o600,
      encoding: 'utf8',
    });
    console.log(
      `[BootstrapPassword] Generated secure admin bootstrap password and saved to ${targetPath}`,
    );
  } catch (e) {
    console.error(
      `[BootstrapPassword] CRITICAL: Unable to write bootstrap password file at ${targetPath}:`,
      e,
    );
    throw new Error(
      `CRITICAL: Failed writing admin bootstrap secret file at ${targetPath}. Refusing to create admin with unretrievable password.`,
    );
  }

  return newPassword;
}

const prisma = new PrismaClient();

async function main() {
  const environment = process.env.NODE_ENV;
  if (!['development', 'test', 'production'].includes(environment ?? '')) {
    throw new Error(`NODE_ENV tidak valid: "${environment}"`);
  }

  const isTest = environment === 'test';
  if (environment === 'production' && process.env.SEED_ALL_USERS === 'true' && process.env.ALLOW_PROD_SEED_ALL_USERS !== 'true') {
    throw new Error('SEED_ALL_USERS=true is prohibited in production environment unless ALLOW_PROD_SEED_ALL_USERS=true is explicitly set.');
  }
  const isDevOrTest = environment === 'development' || environment === 'test' || (process.env.SEED_ALL_USERS === 'true' && (environment !== 'production' || process.env.ALLOW_PROD_SEED_ALL_USERS === 'true'));

  if (isTest && process.env.ALLOW_NON_TEST_DB !== 'true' && !process.env.SEED_ALL_USERS && !process.env.DATABASE_URL?.toLowerCase().includes('test')) {
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
    const tempAdminPassword = getOrCreateBootstrapAdminPassword();

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminUsername,
        name: 'System Admin',
        role: Role.ADMIN,
        isActive: true,
        passwordHash: await argon2.hash(tempAdminPassword, hashOptions),
        mustChangePassword: isDevOrTest ? false : true,
        passwordChangedAt: new Date(),
      },
    });
    if (!isTest) {
      console.log(`[SEED] Admin created. Bootstrap password preserved in deploy/secrets or environment.`);
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
    console.log('User admin already exists, skipping creation and preserving existing password (idempotency enforced).');
    adminId = existingAdmin.id;
  }

  // Seeding of other roles is allowed in development, test, or when SEED_ALL_USERS is requested
  if (isDevOrTest) {
    // 2. QC
    console.log('Checking QC user...');
    const existingQC = await prisma.user.findUnique({
      where: { email: 'frengky.qc@gms.local' },
    });

    if (!existingQC) {
      console.log('Seeding QC user...');
      const tempQCPassword = process.env.DEFAULT_QC_PASSWORD || process.env.QC_PASSWORD || (isTest ? 'QCPassword123!' : generateTempPassword());
      const qcUser = await prisma.user.create({
        data: {
          email: 'frengky.qc@gms.local',
          username: 'qc',
          name: 'Frengky Wahudi',
          role: Role.QC,
          isActive: true,
          passwordHash: await argon2.hash(tempQCPassword, hashOptions),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await prisma.userWarehouseAccess.createMany({
        data: [
          { userId: qcUser.id, processType: 'GBB' },
          { userId: qcUser.id, processType: 'GBJ' },
          { userId: qcUser.id, processType: 'GSP' },
        ],
        skipDuplicates: true,
      });
      if (!isTest) {
        console.log(`[SEED] QC created with GBB, GBJ, GSP access.`);
      }
    } else {
      await prisma.userWarehouseAccess.createMany({
        data: [
          { userId: existingQC.id, processType: 'GBB' },
          { userId: existingQC.id, processType: 'GBJ' },
          { userId: existingQC.id, processType: 'GSP' },
        ],
        skipDuplicates: true,
      });
      console.log('User qc already exists, process access mapping verified.');
    }

    // 3. Warehouse
    console.log('Checking warehouse user...');
    const existingWarehouse = await prisma.user.findUnique({
      where: { email: 'arga.warehouse@gms.local' },
    });

    if (!existingWarehouse) {
      console.log('Seeding warehouse user...');
      const tempWarehousePassword = process.env.DEFAULT_WAREHOUSE_PASSWORD || process.env.WAREHOUSE_PASSWORD || (isTest ? 'WarehousePassword123!' : generateTempPassword());
      const warehouse = await prisma.user.create({
        data: {
          email: 'arga.warehouse@gms.local',
          username: 'warehouse',
          name: 'Arga Vebrianto',
          role: Role.WAREHOUSE,
          isActive: true,
          passwordHash: await argon2.hash(tempWarehousePassword, hashOptions),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      if (!isTest) {
        console.log(`[SEED] Warehouse created.`);
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
      const tempSecurityPassword = process.env.DEFAULT_SECURITY_PASSWORD || process.env.SECURITY_PASSWORD || (isTest ? 'SecurityPassword123!' : generateTempPassword());
      await prisma.user.create({
        data: {
          email: 'enggar.security@gms.local',
          username: 'security',
          name: 'Enggar',
          role: Role.SECURITY,
          isActive: true,
          passwordHash: await argon2.hash(tempSecurityPassword, hashOptions),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      if (!isTest) {
        console.log(`[SEED] Security created.`);
      }
    } else {
      console.log('User security already exists, skipped.');
    }

    // 5. Utility Officer (for GSP Batubara Four-Eyes Disposition)
    console.log('Checking utility user...');
    const existingUtility = await prisma.user.findUnique({
      where: { email: 'agus.utility@gms.local' },
    });

    if (!existingUtility) {
      console.log('Seeding utility user...');
      const tempUtilityPassword =
        process.env.DEFAULT_UTILITY_PASSWORD ||
        process.env.UTILITY_PASSWORD ||
        (isTest ? 'UtilityPassword123!' : generateTempPassword());
      const utilityUser = await prisma.user.create({
        data: {
          email: 'agus.utility@gms.local',
          username: 'utility_lead',
          name: 'Agus Utility Head',
          role: Role.ADMIN,
          department: 'UTILITY',
          area: 'UTILITY_DISPOSITION_AUTHORITY',
          isActive: true,
          passwordHash: await argon2.hash(tempUtilityPassword, hashOptions),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ),
        },
      });
      await prisma.userWarehouseAccess.createMany({
        data: [
          { userId: utilityUser.id, processType: 'GBB' },
          { userId: utilityUser.id, processType: 'GBJ' },
          { userId: utilityUser.id, processType: 'GSP' },
        ],
        skipDuplicates: true,
      });
      if (!isTest) {
        console.log(`[SEED] Utility Lead created.`);
      }
    } else {
      console.log('User utility_lead already exists, skipped.');
    }
  } else {
    console.log(
      'Production or non-development environment detected, skipping non-admin user seeding.',
    );
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

  // 6. GSP Product Catalog (Master Data)
  console.log('Seeding GSP Product Catalog...');
  const gspProducts = [
    {
      code: 'SOLAR-001',
      name: 'Solar',
      category: 'Fuel',
      subCategory: 'Solar',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'PA_EXEMPT' as const,
      isPaRequired: false,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'COAL-001',
      name: 'Batubara',
      category: 'Coal',
      subCategory: 'Batubara',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'COAL_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      subCategory: 'PAC 280 AC',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'PAC_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-002',
      name: 'POLYCOR P9',
      category: 'Chemical UTL',
      subCategory: 'POLYCOR P9',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'PAC_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-003',
      name: 'IPAC CIP A200',
      category: 'Chemical UTL',
      subCategory: 'IPAC CIP A200',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'PAC_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'RPD-001',
      name: 'Rapid Klen',
      category: 'Chemical PROD',
      subCategory: 'Rapid Klen',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'RAPID_KLEN_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'RPD-002',
      name: 'PRO-CIP B++',
      category: 'Chemical PROD',
      subCategory: 'PRO-CIP B++',
      processType: 'GSP' as const,
      gspAnalysisProfile: 'RAPID_KLEN_PA' as const,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
  ];

  for (const prod of gspProducts) {
    await prisma.productCatalog.upsert({
      where: { code: prod.code },
      update: {
        name: prod.name,
        category: prod.category,
        subCategory: prod.subCategory,
        gspAnalysisProfile: prod.gspAnalysisProfile,
        isPaRequired: prod.isPaRequired,
        policyVersion: prod.policyVersion,
        isActive: true,
      },
      create: {
        code: prod.code,
        name: prod.name,
        category: prod.category,
        subCategory: prod.subCategory,
        processType: prod.processType,
        gspAnalysisProfile: prod.gspAnalysisProfile,
        isPaRequired: prod.isPaRequired,
        policyVersion: prod.policyVersion,
        isActive: true,
      },
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
