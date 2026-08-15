-- AlterTable Attachment
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "supersededByCorrectionId" TEXT;

-- AlterTable TransactionCorrectionItem
ALTER TABLE "TransactionCorrectionItem" ADD COLUMN IF NOT EXISTS "replacementRecordId" TEXT;

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "plateNumberNormalized" TEXT;

-- Backfill plateNumberNormalized for existing records
UPDATE "Transaction" SET "plateNumberNormalized" = UPPER(REGEXP_REPLACE("plateNumber", '[^A-Za-z0-9]', '', 'g')) WHERE "plateNumberNormalized" IS NULL AND "plateNumber" IS NOT NULL;

-- CreateIndex for Transaction plateNumberNormalized
CREATE INDEX IF NOT EXISTS "Transaction_plateNumberNormalized_idx" ON "Transaction"("plateNumberNormalized");

-- AddForeignKey for Attachment supersededByCorrectionId
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_supersededByCorrectionId_fkey') THEN
        ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for Transaction createdById
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_createdById_fkey') THEN
        ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for Transaction cancelledById
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_cancelledById_fkey') THEN
        ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for TransactionStatusHistory changedById
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransactionStatusHistory_changedById_fkey') THEN
        ALTER TABLE "TransactionStatusHistory" ADD CONSTRAINT "TransactionStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for WeighbridgeRecord supersededByCorrectionId
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeighbridgeRecord_supersededByCorrectionId_fkey') THEN
        ALTER TABLE "WeighbridgeRecord" ADD CONSTRAINT "WeighbridgeRecord_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for WarehouseProcess supersededByCorrectionId
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WarehouseProcess_supersededByCorrectionId_fkey') THEN
        ALTER TABLE "WarehouseProcess" ADD CONSTRAINT "WarehouseProcess_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for QcVehicleCheck supersededByCorrectionId
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QcVehicleCheck_supersededByCorrectionId_fkey') THEN
        ALTER TABLE "QcVehicleCheck" ADD CONSTRAINT "QcVehicleCheck_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for IncomingMaterialCheck supersededByCorrectionId
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncomingMaterialCheck_supersededByCorrectionId_fkey') THEN
        ALTER TABLE "IncomingMaterialCheck" ADD CONSTRAINT "IncomingMaterialCheck_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
