-- PA correction lineage and immutable evaluation provenance.
-- Apply atomically; the new enum value is not used within this migration.
BEGIN;
LOCK TABLE "QcProductAnalysis" IN ACCESS EXCLUSIVE MODE;

-- Preflight checks execute before schema changes and fail closed.
DO $$
DECLARE duplicate_rounds text; invalid_rounds text;
BEGIN
  SELECT string_agg(format('%s/%s', "transactionId", "testRound"), ', ' ORDER BY "transactionId", "testRound") INTO duplicate_rounds
  FROM (SELECT "transactionId", "testRound" FROM "QcProductAnalysis" WHERE "isVoided" = false GROUP BY "transactionId", "testRound" HAVING count(*) > 1) d;
  IF duplicate_rounds IS NOT NULL THEN RAISE EXCEPTION 'PA migration aborted: duplicate non-voided transaction/testRound rows: %', duplicate_rounds; END IF;
  SELECT string_agg(format('%s/%s', "transactionId", "testRound"), ', ' ORDER BY "transactionId", "testRound") INTO invalid_rounds
  FROM "QcProductAnalysis" WHERE "testRound" IS NULL OR "testRound" < 1 OR "testRound" > 2;
  IF invalid_rounds IS NOT NULL THEN RAISE EXCEPTION 'PA migration aborted: invalid testRound values: %', invalid_rounds; END IF;
END $$;

ALTER TYPE "CorrectionTargetModule" ADD VALUE IF NOT EXISTS 'QC_PRODUCT_ANALYSIS';

ALTER TABLE "QcProductAnalysis"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceAnalysisId" TEXT,
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "supersededByCorrectionId" TEXT,
  ADD COLUMN "analysisProfile" "GspAnalysisProfile",
  ADD COLUMN "specSnapshot" JSONB,
  ADD COLUMN "evaluationProvenance" JSONB,
  ADD COLUMN "dispositionRequiresReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "QcProductAnalysis"
  ADD CONSTRAINT "QcProductAnalysis_testRound_check" CHECK ("testRound" BETWEEN 1 AND 2),
  ADD CONSTRAINT "QcProductAnalysis_revision_check" CHECK ("revision" >= 1),
  ADD CONSTRAINT "QcProductAnalysis_sourceAnalysisId_fkey" FOREIGN KEY ("sourceAnalysisId") REFERENCES "QcProductAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "QcProductAnalysis_supersededByCorrectionId_fkey" FOREIGN KEY ("supersededByCorrectionId") REFERENCES "TransactionCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "QcProductAnalysis_sourceAnalysisId_key" ON "QcProductAnalysis" ("sourceAnalysisId");
CREATE UNIQUE INDEX "QcProductAnalysis_current_nonvoided_round_key" ON "QcProductAnalysis" ("transactionId", "testRound") WHERE "isCurrent" = true AND "isVoided" = false;
CREATE INDEX "QcProductAnalysis_transactionId_testRound_isCurrent_idx" ON "QcProductAnalysis" ("transactionId", "testRound", "isCurrent");
CREATE INDEX "QcProductAnalysis_sourceAnalysisId_idx" ON "QcProductAnalysis" ("sourceAnalysisId");
CREATE INDEX "QcProductAnalysis_supersededByCorrectionId_idx" ON "QcProductAnalysis" ("supersededByCorrectionId");

-- Existing rows retain null snapshot/provenance; no historical specification is invented.
COMMIT;
