-- Reconcile CorrectionTargetModule enum and purge legacy QUALITY_CONTROL enum value

-- 1. Map legacy QUALITY_CONTROL enum values to QC_VEHICLE in TransactionCorrectionItem table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CorrectionTargetModule'
      AND e.enumlabel = 'QUALITY_CONTROL'
  ) THEN
    UPDATE "TransactionCorrectionItem"
    SET "targetModule" = 'QC_VEHICLE'::"CorrectionTargetModule"
    WHERE "targetModule"::text = 'QUALITY_CONTROL';
  END IF;
END $$;

-- 2. Re-create CorrectionTargetModule enum to ensure identical enum definition for fresh installs and upgrades
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CorrectionTargetModule'
      AND e.enumlabel = 'QUALITY_CONTROL'
  ) THEN
    -- Rename legacy type
    ALTER TYPE "CorrectionTargetModule" RENAME TO "CorrectionTargetModule_old";

    -- Create canonical enum type without QUALITY_CONTROL
    CREATE TYPE "CorrectionTargetModule" AS ENUM (
      'TRANSACTION',
      'WEIGHBRIDGE',
      'QC_VEHICLE',
      'QC_MATERIAL',
      'INCOMING_MATERIAL',
      'WAREHOUSE',
      'STATUS',
      'ATTACHMENT',
      'REMARK'
    );

    -- Cast existing column to new enum type
    ALTER TABLE "TransactionCorrectionItem"
      ALTER COLUMN "targetModule" TYPE "CorrectionTargetModule"
      USING "targetModule"::text::"CorrectionTargetModule";

    -- Drop legacy type
    DROP TYPE "CorrectionTargetModule_old";
  END IF;
END $$;
