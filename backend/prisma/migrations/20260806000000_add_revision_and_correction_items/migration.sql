-- CreateEnum
CREATE TYPE "CorrectionTargetModule" AS ENUM ('TRANSACTION', 'WEIGHBRIDGE', 'QUALITY_CONTROL', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TransactionCorrection" ADD COLUMN "correctionNumber" TEXT,
ADD COLUMN "expectedRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "reasonCode" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN "remark" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TransactionCorrectionItem" (
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

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCorrection_correctionNumber_key" ON "TransactionCorrection"("correctionNumber");

-- CreateIndex
CREATE INDEX "TransactionCorrection_correctionNumber_idx" ON "TransactionCorrection"("correctionNumber");

-- CreateIndex
CREATE INDEX "TransactionCorrectionItem_correctionId_idx" ON "TransactionCorrectionItem"("correctionId");

-- CreateIndex
CREATE INDEX "TransactionCorrectionItem_targetModule_targetRecordId_idx" ON "TransactionCorrectionItem"("targetModule", "targetRecordId");

-- AddForeignKey
ALTER TABLE "TransactionCorrectionItem" ADD CONSTRAINT "TransactionCorrectionItem_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "TransactionCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
