-- Migration Repair: Add missing enum values, CorrectionAction enum, action column, and unique correctionNumber constraint

-- 1. Add missing enum values to CorrectionTargetModule
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'QC_VEHICLE';
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'QC_MATERIAL';
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'INCOMING_MATERIAL';
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'STATUS';
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'ATTACHMENT';
ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'REMARK';

-- 2. Create CorrectionAction Enum if not exists
DO $$ BEGIN
    CREATE TYPE "CorrectionAction" AS ENUM ('CORRECT_DATA', 'CORRECT_RECORDED_STATUS', 'REOPEN_WORKFLOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Add action column with default 'CORRECT_DATA'
ALTER TABLE "TransactionCorrection" 
    ADD COLUMN IF NOT EXISTS "action" "CorrectionAction" NOT NULL DEFAULT 'CORRECT_DATA';

-- 4. Backfill any NULL correctionNumber values with UUID
UPDATE "TransactionCorrection" 
    SET "correctionNumber" = gen_random_uuid()::text 
    WHERE "correctionNumber" IS NULL;

-- 5. Set correctionNumber NOT NULL
ALTER TABLE "TransactionCorrection" 
    ALTER COLUMN "correctionNumber" SET NOT NULL;

-- 6. Create Unique Index on correctionNumber
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCorrection_correctionNumber_key" 
    ON "TransactionCorrection"("correctionNumber");
