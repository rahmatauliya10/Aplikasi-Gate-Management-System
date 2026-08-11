-- Migration: 20260811000000_fix_qc_process_scope_and_backfill
-- Description: Backfill default process scope (GBB, GBJ, GSP) for existing active QC users with missing warehouseAccess mappings.

-- 1. Preflight check & Safe backfill for existing active QC users
INSERT INTO "UserWarehouseAccess" ("id", "userId", "processType", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    u."id",
    p."processType"::"ProcessType",
    NOW(),
    NOW()
FROM "User" u
CROSS JOIN (
    VALUES ('GBB'::text), ('GBJ'::text), ('GSP'::text)
) AS p("processType")
WHERE u."role" = 'QC'
  AND u."isDeleted" = false
  AND NOT EXISTS (
      SELECT 1 FROM "UserWarehouseAccess" uwa 
      WHERE uwa."userId" = u."id"
  )
ON CONFLICT ("userId", "processType") DO NOTHING;
