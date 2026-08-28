import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface PreflightReport {
  timestamp: string;
  isReadyForMigration: boolean;
  queryErrors?: string[];
  unresolvedLegacyCorrections: {
    weighbridge: number;
    warehouse: number;
    qcVehicle: number;
    incomingMaterial: number;
    attachment: number;
    details: Array<{
      table: string;
      recordId: string;
      transactionId: string;
      legacyCorrectionNumber: string;
    }>;
  };
  duplicateCurrentRevisions: {
    qcVehicle: any[];
    incomingMaterial: any[];
    warehouse: any[];
    weighbridge: any[];
    attachment: any[];
  };
  orphanUserReferences: Array<{
    table: string;
    recordId: string;
    field: string;
    invalidUserId: string;
  }>;
  missingPhysicalAttachments: Array<{
    attachmentId: string;
    transactionId: string;
    fileName: string;
    filePath: string;
  }>;
  duplicateActivePlates: any[];
}

export async function checkTableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const res = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    ) as exists;
  `;
  return Array.isArray(res) && res[0] && res[0].exists === true;
}

export async function checkColumnExists(prisma: PrismaClient, tableName: string, columnName: string): Promise<boolean> {
  const res = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    ) as exists;
  `;
  return Array.isArray(res) && res[0] && res[0].exists === true;
}

export async function runProductionMigrationPreflight(
  prismaClient?: PrismaClient,
): Promise<PreflightReport> {
  console.log('=== RUNNING PRODUCTION DATA MIGRATION PREFLIGHT (STRICT READ-ONLY) ===\n');

  const prisma = prismaClient || new PrismaClient();
  const shouldDisconnect = !prismaClient;

  const report: PreflightReport = {
    timestamp: new Date().toISOString(),
    isReadyForMigration: true,
    unresolvedLegacyCorrections: {
      weighbridge: 0,
      warehouse: 0,
      qcVehicle: 0,
      incomingMaterial: 0,
      attachment: 0,
      details: [],
    },
    duplicateCurrentRevisions: {
      qcVehicle: [],
      incomingMaterial: [],
      warehouse: [],
      weighbridge: [],
      attachment: [],
    },
    orphanUserReferences: [],
    missingPhysicalAttachments: [],
    duplicateActivePlates: [],
  };

  try {
    // 1. Scan for legacy supersededByCorrectionId values (non-UUID string values starting with COR-)
    const legacyTables = [
      { name: 'WeighbridgeRecord', key: 'weighbridge' as const, modelName: 'weighbridgeRecord' },
      { name: 'WarehouseProcess', key: 'warehouse' as const, modelName: 'warehouseProcess' },
      { name: 'QcVehicleCheck', key: 'qcVehicle' as const, modelName: 'qcVehicleCheck' },
      { name: 'IncomingMaterialCheck', key: 'incomingMaterial' as const, modelName: 'incomingMaterialCheck' },
      { name: 'Attachment', key: 'attachment' as const, modelName: 'attachment' },
    ];

    for (const { name, key, modelName } of legacyTables) {
      const tableExists = await checkTableExists(prisma, name);
      if (!tableExists) continue;

      const hasCol = await checkColumnExists(prisma, name, 'supersededByCorrectionId');
      if (!hasCol) continue;

      const records = await (prisma as any)[modelName].findMany({
        where: {
          supersededByCorrectionId: {
            startsWith: 'COR-',
          },
        },
        select: {
          id: true,
          transactionId: true,
          supersededByCorrectionId: true,
        },
      });

      if (records.length > 0) {
        console.log(`Found ${records.length} legacy correction reference(s) in ${name}`);
        for (const rec of records) {
          report.isReadyForMigration = false;
          report.unresolvedLegacyCorrections[key]++;
          report.unresolvedLegacyCorrections.details.push({
            table: name,
            recordId: rec.id,
            transactionId: rec.transactionId,
            legacyCorrectionNumber: rec.supersededByCorrectionId,
          });
        }
      }
    }

    // 2. Check for duplicate current revisions per transaction / lineage across all 5 tables
    // 2a. QcVehicleCheck
    if (await checkTableExists(prisma, 'QcVehicleCheck')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'QcVehicleCheck', 'isCurrent');
      const qcDuplicates = hasIsCurrent
        ? await prisma.$queryRaw<any[]>`
            SELECT "transactionId", COUNT(*) as count 
            FROM "QcVehicleCheck" 
            WHERE "isCurrent" = true 
            GROUP BY "transactionId" 
            HAVING COUNT(*) > 1
          `
        : [];
      if (qcDuplicates.length > 0) {
        report.isReadyForMigration = false;
        report.duplicateCurrentRevisions.qcVehicle = qcDuplicates;
      }
    }

    // 2b. IncomingMaterialCheck
    if (await checkTableExists(prisma, 'IncomingMaterialCheck')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'IncomingMaterialCheck', 'isCurrent');
      const incDuplicates = hasIsCurrent
        ? await prisma.$queryRaw<any[]>`
            SELECT "transactionId", COUNT(*) as count 
            FROM "IncomingMaterialCheck" 
            WHERE "isCurrent" = true 
            GROUP BY "transactionId" 
            HAVING COUNT(*) > 1
          `
        : [];
      if (incDuplicates.length > 0) {
        report.isReadyForMigration = false;
        report.duplicateCurrentRevisions.incomingMaterial = incDuplicates;
      }
    }

    // 2c. WarehouseProcess
    if (await checkTableExists(prisma, 'WarehouseProcess')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'WarehouseProcess', 'isCurrent');
      const whDuplicates = hasIsCurrent
        ? await prisma.$queryRaw<any[]>`
            SELECT "transactionId", "processType", COUNT(*) as count 
            FROM "WarehouseProcess" 
            WHERE "isCurrent" = true 
            GROUP BY "transactionId", "processType" 
            HAVING COUNT(*) > 1
          `
        : [];
      if (whDuplicates.length > 0) {
        report.isReadyForMigration = false;
        report.duplicateCurrentRevisions.warehouse = whDuplicates;
      }
    }

    // 2d. WeighbridgeRecord
    if (await checkTableExists(prisma, 'WeighbridgeRecord')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'WeighbridgeRecord', 'isCurrent');
      const wbDuplicates = hasIsCurrent
        ? await prisma.$queryRaw<any[]>`
            SELECT "transactionId", "type", COUNT(*) as count 
            FROM "WeighbridgeRecord" 
            WHERE "isCurrent" = true 
            GROUP BY "transactionId", "type" 
            HAVING COUNT(*) > 1
          `
        : [];
      if (wbDuplicates.length > 0) {
        report.isReadyForMigration = false;
        report.duplicateCurrentRevisions.weighbridge = wbDuplicates;
      }
    }

    // 2e. Attachment
    if (await checkTableExists(prisma, 'Attachment')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'Attachment', 'isCurrent');
      const hasLineage = await checkColumnExists(prisma, 'Attachment', 'attachmentLineageId');

      let attDuplicates: any[] = [];
      if (hasIsCurrent && hasLineage) {
        attDuplicates = await prisma.$queryRaw<any[]>`
          SELECT "attachmentLineageId", COUNT(*) as count 
          FROM "Attachment" 
          WHERE "isCurrent" = true 
          GROUP BY "attachmentLineageId" 
          HAVING COUNT(*) > 1
        `;
      }
      if (attDuplicates.length > 0) {
        report.isReadyForMigration = false;
        report.duplicateCurrentRevisions.attachment = attDuplicates;
      }
    }

    // 3. Check physical file existence for active Attachment records
    if (await checkTableExists(prisma, 'Attachment')) {
      const hasIsCurrent = await checkColumnExists(prisma, 'Attachment', 'isCurrent');
      const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

      const activeAttachments = await prisma.attachment.findMany({
        where: hasIsCurrent ? { isCurrent: true } : {},
        select: {
          id: true,
          transactionId: true,
          fileName: true,
          filePath: true,
        },
      });

      for (const att of activeAttachments) {
        const fullPath = path.resolve(baseUploadDir, att.filePath);
        if (!fs.existsSync(fullPath)) {
          report.isReadyForMigration = false;
          report.missingPhysicalAttachments.push({
            attachmentId: att.id,
            transactionId: att.transactionId,
            fileName: att.fileName,
            filePath: att.filePath,
          });
        }
      }
    }

    // 4. Check for duplicate active plates (not COMPLETED or CANCELLED)
    if (await checkTableExists(prisma, 'Transaction')) {
      const hasNormPlate = await checkColumnExists(prisma, 'Transaction', 'plateNumberNormalized');
      if (hasNormPlate) {
        const activePlateDuplicates = await prisma.$queryRaw<any[]>`
          SELECT "plateNumberNormalized", COUNT(*) as count
          FROM "Transaction"
          WHERE "status" NOT IN ('COMPLETED', 'CANCELLED')
            AND "plateNumberNormalized" IS NOT NULL
            AND "plateNumberNormalized" != ''
          GROUP BY "plateNumberNormalized"
          HAVING COUNT(*) > 1
        `;
        if (activePlateDuplicates.length > 0) {
          report.isReadyForMigration = false;
          report.duplicateActivePlates = activePlateDuplicates;
        }
      }
    }

    // 5. Check for orphan User references across all business tables
    const userRefChecks = [
      { table: 'Transaction', field: 'createdById' },
      { table: 'Transaction', field: 'cancelledById' },
      { table: 'Transaction', field: 'weighInById' },
      { table: 'Transaction', field: 'weighOutById' },
      { table: 'Transaction', field: 'warehouseStartById' },
      { table: 'Transaction', field: 'warehouseEndById' },
      { table: 'WeighbridgeRecord', field: 'operatorId' },
      { table: 'WarehouseProcess', field: 'startById' },
      { table: 'WarehouseProcess', field: 'endById' },
      { table: 'QcVehicleCheck', field: 'checkedById' },
      { table: 'IncomingMaterialCheck', field: 'checkedById' },
      { table: 'Attachment', field: 'uploadedById' },
    ];

    if (await checkTableExists(prisma, 'User')) {
      for (const { table, field } of userRefChecks) {
        if (!(await checkTableExists(prisma, table))) continue;
        if (!(await checkColumnExists(prisma, table, field))) continue;

        const orphanQuery = `
          SELECT t.id as "recordId", t."${field}" as "invalidUserId"
          FROM "${table}" t
          LEFT JOIN "User" u ON t."${field}" = u.id
          WHERE t."${field}" IS NOT NULL AND u.id IS NULL
        `;

        const rawOrphans = await prisma.$queryRawUnsafe<Array<{ recordId: string; invalidUserId: string }>>(orphanQuery);
        const orphans = Array.isArray(rawOrphans) ? rawOrphans : [];
        if (orphans.length > 0) {
          report.isReadyForMigration = false;
          for (const o of orphans) {
            report.orphanUserReferences.push({
              table,
              recordId: o.recordId,
              field,
              invalidUserId: o.invalidUserId,
            });
          }
        }
      }
    }

    console.log('\n=== PREFLIGHT SUMMARY ===');
    console.log(`Ready for Migration: ${report.isReadyForMigration ? 'YES' : 'NO'}`);
    console.log(`Unresolved Legacy Corrections: ${report.unresolvedLegacyCorrections.details.length}`);
    console.log(`Duplicate Active Current Revisions: ${
      report.duplicateCurrentRevisions.qcVehicle.length +
      report.duplicateCurrentRevisions.incomingMaterial.length +
      report.duplicateCurrentRevisions.warehouse.length +
      report.duplicateCurrentRevisions.weighbridge.length +
      report.duplicateCurrentRevisions.attachment.length
    }`);
    console.log(`Missing Physical Files: ${report.missingPhysicalAttachments.length}`);
    console.log(`Duplicate Active Plates: ${report.duplicateActivePlates.length}`);
    console.log(`Orphan User References: ${report.orphanUserReferences.length}\n`);

    return report;
  } catch (error: any) {
    console.error('❌ PREFLIGHT DATABASE QUERY ERROR:', error);
    report.isReadyForMigration = false;
    report.queryErrors = [error?.message || String(error)];
    return report;
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

export async function main(): Promise<void> {
  const report = await runProductionMigrationPreflight();
  fs.writeFileSync(
    'migration_preflight_report.json',
    JSON.stringify(report, null, 2),
  );
  if (!report.isReadyForMigration) {
    console.error('❌ PREFLIGHT BLOCKER DETECTED: Database is NOT ready for migration.');
    process.exit(1);
  } else {
    console.log('✅ PREFLIGHT PASSED: Database is ready for migration.');
    process.exit(0);
  }
}

export const isDirectExecution = (): boolean => {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return false;
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      const currentFilePath = fileURLToPath(import.meta.url);
      const executedPath = path.resolve(process.argv[1]);
      if (executedPath === currentFilePath) {
        return true;
      }
    }
  } catch {
    // Fallback if import.meta is unavailable
  }
  const argv1 = (process.argv[1] || '').replace(/\\/g, '/');
  return (
    argv1.endsWith('production-migration-preflight.ts') ||
    argv1.endsWith('production-migration-preflight.js')
  );
};

if (isDirectExecution()) {
  main().catch((err) => {
    console.error('Preflight script fatal error:', err);
    process.exit(1);
  });
}
