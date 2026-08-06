-- CreateEnum CorrectionTargetModule if not exists
DO $$ BEGIN
    CREATE TYPE "CorrectionTargetModule" AS ENUM ('TRANSACTION', 'WEIGHBRIDGE', 'WAREHOUSE', 'QUALITY_CONTROL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable TransactionCorrection
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "correctionNumber" TEXT;
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "remark" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TransactionCorrection" ADD COLUMN IF NOT EXISTS "expectedRevision" INTEGER NOT NULL DEFAULT 1;

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
