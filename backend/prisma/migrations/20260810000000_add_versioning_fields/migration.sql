-- DropIndex
DROP INDEX "IncomingMaterialCheck_transactionId_key";

-- DropIndex
DROP INDEX "QcVehicleCheck_transactionId_key";

-- DropIndex
DROP INDEX "WarehouseProcess_transactionId_processType_key";

-- DropIndex
DROP INDEX "WeighbridgeRecord_transactionId_type_key";

-- AlterTable
ALTER TABLE "IncomingMaterialCheck" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByCorrectionId" TEXT;

-- AlterTable
ALTER TABLE "QcVehicleCheck" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByCorrectionId" TEXT;

-- AlterTable
ALTER TABLE "WarehouseProcess" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByCorrectionId" TEXT;

-- AlterTable
ALTER TABLE "WeighbridgeRecord" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByCorrectionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomingMaterialCheck_transactionId_revision_key" ON "IncomingMaterialCheck"("transactionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QcVehicleCheck_transactionId_revision_key" ON "QcVehicleCheck"("transactionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseProcess_transactionId_processType_revision_key" ON "WarehouseProcess"("transactionId", "processType", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "WeighbridgeRecord_transactionId_type_revision_key" ON "WeighbridgeRecord"("transactionId", "type", "revision");
