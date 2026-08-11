-- Migration for PR-26: Secure Attachment Lineage

-- 1. Add attachmentLineageId to Attachment table if not present
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "attachmentLineageId" TEXT;

-- 2. Backfill attachmentLineageId with UUID for existing rows where null
UPDATE "Attachment" 
SET "attachmentLineageId" = gen_random_uuid()::text 
WHERE "attachmentLineageId" IS NULL;

-- 3. Set NOT NULL
ALTER TABLE "Attachment" ALTER COLUMN "attachmentLineageId" SET NOT NULL;

-- 4. Drop legacy unique constraint [transactionId, revision] if exists
DROP INDEX IF EXISTS "Attachment_transactionId_revision_key";

-- 5. Add unique constraint [attachmentLineageId, revision]
CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_attachmentLineageId_revision_key" 
ON "Attachment"("attachmentLineageId", "revision");

-- 6. Add performance indices
CREATE INDEX IF NOT EXISTS "Attachment_transactionId_isCurrent_idx" 
ON "Attachment"("transactionId", "isCurrent");

CREATE INDEX IF NOT EXISTS "Attachment_attachmentLineageId_idx" 
ON "Attachment"("attachmentLineageId");
