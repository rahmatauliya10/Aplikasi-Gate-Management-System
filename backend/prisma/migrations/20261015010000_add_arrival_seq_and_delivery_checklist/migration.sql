-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "dailySequence" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deliveryChecklist" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyArrivalCounter" (
    "dateKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyArrivalCounter_pkey" PRIMARY KEY ("dateKey")
);
