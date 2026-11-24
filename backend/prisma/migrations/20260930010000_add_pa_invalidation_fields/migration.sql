-- AlterTable
ALTER TABLE "QcProductAnalysis" ADD COLUMN IF NOT EXISTS "isVoided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QcProductAnalysis" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "QcProductAnalysis" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QcProductAnalysis_productCategory_idx" ON "QcProductAnalysis"("productCategory");
