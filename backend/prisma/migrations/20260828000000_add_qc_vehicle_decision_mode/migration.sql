-- CreateEnum
CREATE TYPE "QcVehicleDecisionMode" AS ENUM ('NORMAL_PASS', 'APPROVED_WITH_DEVIATION', 'REJECTED');

-- AlterTable
ALTER TABLE "QcVehicleCheck" 
  ADD COLUMN "decisionMode" "QcVehicleDecisionMode",
  ADD COLUMN "hasDeviation" BOOLEAN,
  ADD COLUMN "deviationReason" TEXT;
