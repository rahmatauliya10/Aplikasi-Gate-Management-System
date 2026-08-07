-- Add missing columns to WarehouseProcess and IncomingMaterialCheck

-- AlterTable WarehouseProcess
ALTER TABLE "WarehouseProcess"
    ADD COLUMN IF NOT EXISTS "checklistItems" JSONB;

-- AlterTable IncomingMaterialCheck
ALTER TABLE "IncomingMaterialCheck"
    ADD COLUMN IF NOT EXISTS "goodBeanPercentage" DOUBLE PRECISION;
