-- AlterTable Transaction: Add void metadata fields
ALTER TABLE "Transaction" 
  ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidReasonCode" TEXT,
  ADD COLUMN "voidReason" TEXT;

-- Backfill legacy soft-deleted transactions
UPDATE "Transaction"
SET
  "isVoided" = true,
  "voidedAt" = COALESCE("cancelledAt", "updatedAt"),
  "voidedById" = "cancelledById",
  "voidReasonCode" = 'LEGACY_SOFT_DELETE',
  "voidReason" = COALESCE("cancellationReason", 'Migrated from legacy soft-delete')
WHERE
  "status" = 'CANCELLED'
  AND (
    "cancellationReason" ILIKE '%deleted via API%'
    OR "cancellationReason" ILIKE '%soft-delete%'
  );

-- AddForeignKey for voidedById
ALTER TABLE "Transaction" 
  ADD CONSTRAINT "Transaction_voidedById_fkey" 
  FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update 3 foreign keys to RESTRICT
ALTER TABLE "TransactionStatusHistory" 
  DROP CONSTRAINT "TransactionStatusHistory_transactionId_fkey",
  ADD CONSTRAINT "TransactionStatusHistory_transactionId_fkey" 
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionCorrection" 
  DROP CONSTRAINT "TransactionCorrection_transactionId_fkey",
  ADD CONSTRAINT "TransactionCorrection_transactionId_fkey" 
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionCorrectionItem" 
  DROP CONSTRAINT "TransactionCorrectionItem_correctionId_fkey",
  ADD CONSTRAINT "TransactionCorrectionItem_correctionId_fkey" 
  FOREIGN KEY ("correctionId") REFERENCES "TransactionCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
