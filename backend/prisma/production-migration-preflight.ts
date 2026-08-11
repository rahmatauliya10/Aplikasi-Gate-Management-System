import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export interface PreflightReport {
  timestamp: string;
  isReadyForMigration: boolean;
  unresolvedLegacyCorrections: {
    weighbridge: number;
    warehouse: number;
    qcVehicle: number;
    incomingMaterial: number;
    attachment: number;
    details: any[];
  };
  duplicateCurrentRevisions: {
    qcVehicle: any[];
    incomingMaterial: any[];
    warehouse: any[];
    weighbridge: any[];
    attachment: any[];
  };
  orphanUserReferences: any[];
  missingPhysicalAttachments: any[];
  duplicateActivePlates: any[];
}

export async function runProductionMigrationPreflight(): Promise<PreflightReport> {
  console.log('=== RUNNING PRODUCTION DATA MIGRATION PREFLIGHT ===\n');

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

  // 1. Scan for legacy supersededByCorrectionId values (non-UUID string values starting with COR-)
  const legacyTables = [
    { name: 'WeighbridgeRecord', model: prisma.weighbridgeRecord },
    { name: 'WarehouseProcess', model: prisma.warehouseProcess },
    { name: 'QcVehicleCheck', model: prisma.qcVehicleCheck },
    { name: 'IncomingMaterialCheck', model: prisma.incomingMaterialCheck },
    { name: 'Attachment', model: prisma.attachment },
  ];

  for (const { name, model } of legacyTables) {
    const records = await (model as any).findMany({
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
      console.log(`Found ${records.length} legacy correction references in ${name}`);
      for (const rec of records) {
        // Try resolving against TransactionCorrection.correctionNumber
        const matched = await prisma.transactionCorrection.findUnique({
          where: { correctionNumber: rec.supersededByCorrectionId },
        });

        if (matched) {
          // Auto-fix FK reference to use TransactionCorrection.id (UUID)
          await (model as any).update({
            where: { id: rec.id },
            data: { supersededByCorrectionId: matched.id },
          });
          console.log(
            `  [AUTO-FIXED] ${name}:${rec.id} ${rec.supersededByCorrectionId} -> ${matched.id}`,
          );
        } else {
          report.isReadyForMigration = false;
          (report.unresolvedLegacyCorrections as any)[
            name.charAt(0).toLowerCase() + name.slice(1)
          ]++;
          report.unresolvedLegacyCorrections.details.push({
            table: name,
            recordId: rec.id,
            transactionId: rec.transactionId,
            legacyCorrectionNumber: rec.supersededByCorrectionId,
          });
        }
      }
    }
  }

  // 2. Check for duplicate current revisions per transaction / lineage
  const qcDuplicates = await prisma.$queryRaw<any[]>`
    SELECT "transactionId", COUNT(*) as count 
    FROM "QcVehicleCheck" 
    WHERE "isCurrent" = true 
    GROUP BY "transactionId" 
    HAVING COUNT(*) > 1
  `;
  if (qcDuplicates.length > 0) {
    report.isReadyForMigration = false;
    report.duplicateCurrentRevisions.qcVehicle = qcDuplicates;
  }

  const incDuplicates = await prisma.$queryRaw<any[]>`
    SELECT "transactionId", COUNT(*) as count 
    FROM "IncomingMaterialCheck" 
    WHERE "isCurrent" = true 
    GROUP BY "transactionId" 
    HAVING COUNT(*) > 1
  `;
  if (incDuplicates.length > 0) {
    report.isReadyForMigration = false;
    report.duplicateCurrentRevisions.incomingMaterial = incDuplicates;
  }

  // 3. Check physical file existence for active Attachment records
  const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const activeAttachments = await prisma.attachment.findMany({
    where: { isCurrent: true },
  });

  for (const att of activeAttachments) {
    const fullPath = path.resolve(baseUploadDir, att.filePath);
    if (!fs.existsSync(fullPath)) {
      report.missingPhysicalAttachments.push({
        attachmentId: att.id,
        transactionId: att.transactionId,
        fileName: att.fileName,
        filePath: att.filePath,
      });
    }
  }

  // 4. Check for duplicate active plates (not COMPLETED or CANCELLED)
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
    report.duplicateActivePlates = activePlateDuplicates;
  }

  console.log('\n=== PREFLIGHT SUMMARY ===');
  console.log(`Ready for Migration: ${report.isReadyForMigration ? 'YES' : 'NO'}`);
  console.log(
    `Unresolved Legacy Corrections: ${report.unresolvedLegacyCorrections.details.length}`,
  );
  console.log(
    `Missing Physical Files: ${report.missingPhysicalAttachments.length}`,
  );
  console.log(
    `Duplicate Active Plates: ${report.duplicateActivePlates.length}`,
  );

  return report;
}

if (require.main === module) {
  runProductionMigrationPreflight()
    .then((report) => {
      fs.writeFileSync(
        'migration_preflight_report.json',
        JSON.stringify(report, null, 2),
      );
      process.exit(report.isReadyForMigration ? 0 : 1);
    })
    .catch((err) => {
      console.error('Preflight script error:', err);
      process.exit(1);
    });
}
