-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "incomingQcStartAt" TIMESTAMP(3);
