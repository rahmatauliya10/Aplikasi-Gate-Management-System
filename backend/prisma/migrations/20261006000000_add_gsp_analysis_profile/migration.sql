-- CreateEnum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GspAnalysisProfile') THEN
        CREATE TYPE "GspAnalysisProfile" AS ENUM ('PA_EXEMPT', 'COAL_PA', 'PAC_PA', 'RAPID_KLEN_PA');
    END IF;
END $$;

-- AlterTable ProductCatalog
ALTER TABLE "ProductCatalog" ADD COLUMN IF NOT EXISTS "gspAnalysisProfile" "GspAnalysisProfile";

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "gspAnalysisProfile" "GspAnalysisProfile";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductCatalog_gspAnalysisProfile_idx" ON "ProductCatalog"("gspAnalysisProfile");
CREATE INDEX IF NOT EXISTS "Transaction_gspAnalysisProfile_idx" ON "Transaction"("gspAnalysisProfile");

-- Backfill exact canonical GSP ProductCatalog rows
UPDATE "ProductCatalog"
SET "category" = 'Coal', "subCategory" = 'Batubara', "gspAnalysisProfile" = 'COAL_PA', "isPaRequired" = true
WHERE "code" = 'COAL-001' OR ("processType" = 'GSP' AND "name" = 'Batubara');

UPDATE "ProductCatalog"
SET "category" = 'Fuel', "subCategory" = 'Solar', "gspAnalysisProfile" = 'PA_EXEMPT', "isPaRequired" = false
WHERE "code" = 'SOLAR-001' OR ("processType" = 'GSP' AND "name" = 'Solar');

UPDATE "ProductCatalog"
SET "category" = 'Chemical UTL', "subCategory" = 'PAC 280 AC', "gspAnalysisProfile" = 'PAC_PA', "isPaRequired" = true
WHERE "code" = 'PAC-001' OR ("processType" = 'GSP' AND "name" = 'PAC 280 AC');

UPDATE "ProductCatalog"
SET "category" = 'Chemical UTL', "subCategory" = 'POLYCOR P9', "gspAnalysisProfile" = 'PAC_PA', "isPaRequired" = true
WHERE "code" = 'PAC-002' OR ("processType" = 'GSP' AND "name" = 'POLYCOR P9');

UPDATE "ProductCatalog"
SET "category" = 'Chemical UTL', "subCategory" = 'IPAC CIP A200', "gspAnalysisProfile" = 'PAC_PA', "isPaRequired" = true
WHERE "code" = 'PAC-003' OR ("processType" = 'GSP' AND "name" = 'IPAC CIP A200');

UPDATE "ProductCatalog"
SET "category" = 'Chemical PROD', "subCategory" = 'Rapid Klen', "gspAnalysisProfile" = 'RAPID_KLEN_PA', "isPaRequired" = true
WHERE "code" = 'RPD-001' OR ("processType" = 'GSP' AND "name" = 'Rapid Klen');

UPDATE "ProductCatalog"
SET "category" = 'Chemical PROD', "subCategory" = 'PRO-CIP B++', "gspAnalysisProfile" = 'RAPID_KLEN_PA', "isPaRequired" = true
WHERE "code" = 'RPD-002' OR ("processType" = 'GSP' AND "name" = 'PRO-CIP B++');

-- Backfill existing Transactions that already link to canonical ProductCatalog
UPDATE "Transaction" t
SET "gspAnalysisProfile" = pc."gspAnalysisProfile"
FROM "ProductCatalog" pc
WHERE t."productCatalogId" = pc."id" AND pc."gspAnalysisProfile" IS NOT NULL AND t."gspAnalysisProfile" IS NULL;
