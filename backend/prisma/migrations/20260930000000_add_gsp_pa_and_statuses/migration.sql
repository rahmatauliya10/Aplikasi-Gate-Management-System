-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'PA_NOT_REQUIRED';
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'QC_RETEST_REQUIRED';
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'WAITING_UTILITY_DISPOSITION';

-- AlterEnum
ALTER TYPE "CorrectionAction" ADD VALUE IF NOT EXISTS 'AMEND_ACTIVE';
ALTER TYPE "CorrectionAction" ADD VALUE IF NOT EXISTS 'OPERATIONAL_INCIDENT';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "productCatalogId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "paExemptionReason" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "paPolicyVersion" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "processType" "ProcessType" NOT NULL,
    "isPaRequired" BOOLEAN NOT NULL DEFAULT true,
    "policyVersion" TEXT NOT NULL DEFAULT 'SOP-GSP-2026.1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QcProductAnalysis" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productCatalogId" TEXT,
    "testRound" INTEGER NOT NULL DEFAULT 1,
    "productCategory" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'SOP-GSP-2026.1',
    "parameters" JSONB NOT NULL,
    "result" "QcResult" NOT NULL,
    "status" TEXT NOT NULL,
    "dispositionAction" TEXT,
    "dispositionReason" TEXT,
    "dispositionById" TEXT,
    "dispositionAt" TIMESTAMP(3),
    "testedById" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcProductAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCatalog_code_key" ON "ProductCatalog"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductCatalog_processType_isActive_idx" ON "ProductCatalog"("processType", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductCatalog_category_idx" ON "ProductCatalog"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QcProductAnalysis_transactionId_idx" ON "QcProductAnalysis"("transactionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QcProductAnalysis_productCatalogId_idx" ON "QcProductAnalysis"("productCatalogId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QcProductAnalysis_testedById_idx" ON "QcProductAnalysis"("testedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QcProductAnalysis_dispositionById_idx" ON "QcProductAnalysis"("dispositionById");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_productCatalogId_fkey') THEN
        ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_productCatalogId_fkey" FOREIGN KEY ("productCatalogId") REFERENCES "ProductCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QcProductAnalysis_transactionId_fkey') THEN
        ALTER TABLE "QcProductAnalysis" ADD CONSTRAINT "QcProductAnalysis_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QcProductAnalysis_productCatalogId_fkey') THEN
        ALTER TABLE "QcProductAnalysis" ADD CONSTRAINT "QcProductAnalysis_productCatalogId_fkey" FOREIGN KEY ("productCatalogId") REFERENCES "ProductCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QcProductAnalysis_testedById_fkey') THEN
        ALTER TABLE "QcProductAnalysis" ADD CONSTRAINT "QcProductAnalysis_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QcProductAnalysis_dispositionById_fkey') THEN
        ALTER TABLE "QcProductAnalysis" ADD CONSTRAINT "QcProductAnalysis_dispositionById_fkey" FOREIGN KEY ("dispositionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
