-- CreateEnum CorrectionTargetModule
DO $$ BEGIN
    CREATE TYPE "CorrectionTargetModule" AS ENUM ('TRANSACTION', 'WEIGHBRIDGE', 'QC_VEHICLE', 'QC_MATERIAL', 'INCOMING_MATERIAL', 'WAREHOUSE', 'STATUS', 'ATTACHMENT', 'REMARK');
EXCEPTION
    WHEN duplicate_object THEN
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'QC_VEHICLE';
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'QC_MATERIAL';
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'INCOMING_MATERIAL';
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'STATUS';
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'ATTACHMENT';
        ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'REMARK';
END $$;

-- CreateEnum CorrectionAction
DO $$ BEGIN
    CREATE TYPE "CorrectionAction" AS ENUM ('CORRECT_DATA', 'CORRECT_RECORDED_STATUS', 'REOPEN_WORKFLOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable WarehouseProcess
ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "checklistItems" JSONB;

-- AlterTable IncomingMaterialCheck
ALTER TABLE "IncomingMaterialCheck" ADD COLUMN IF NOT EXISTS "goodBeanPercentage" DOUBLE PRECISION;

-- AlterTable TransactionCorrection
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "correctionNumber" TEXT;
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "action" "CorrectionAction" NOT NULL DEFAULT 'CORRECT_DATA';
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "remark" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "expectedRevision" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex for correctionNumber
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCorrection_correctionNumber_key" ON "TransactionCorrection"("correctionNumber");
CREATE INDEX IF NOT EXISTS "TransactionCorrection_correctionNumber_idx" ON "TransactionCorrection"("correctionNumber");

-- CreateTable TransactionCorrectionItem
CREATE TABLE IF NOT EXISTS "TransactionCorrectionItem" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "targetModule" "CorrectionTargetModule" NOT NULL,
    "targetRecordId" TEXT,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "itemRemark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCorrectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "TransactionCorrectionItem_correctionId_idx" ON "TransactionCorrectionItem"("correctionId");
CREATE INDEX IF NOT EXISTS "TransactionCorrectionItem_targetModule_targetRecordId_idx" ON "TransactionCorrectionItem"("targetModule", "targetRecordId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TransactionCorrectionItem" ADD CONSTRAINT "TransactionCorrectionItem_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "TransactionCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
