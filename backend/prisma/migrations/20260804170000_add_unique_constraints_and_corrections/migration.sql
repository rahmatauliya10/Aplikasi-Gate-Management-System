-- CreateUniqueIndex for QcVehicleCheck
CREATE UNIQUE INDEX IF NOT EXISTS "QcVehicleCheck_transactionId_key" ON "QcVehicleCheck"("transactionId");

-- CreateUniqueIndex for IncomingMaterialCheck
CREATE UNIQUE INDEX IF NOT EXISTS "IncomingMaterialCheck_transactionId_key" ON "IncomingMaterialCheck"("transactionId");

-- CreateUniqueIndex for WarehouseProcess
CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseProcess_transactionId_processType_key" ON "WarehouseProcess"("transactionId", "processType");

-- CreateTable TransactionCorrection
CREATE TABLE IF NOT EXISTS "TransactionCorrection" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "oldValues" JSONB NOT NULL,
    "newValues" JSONB NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransactionCorrection_transactionId_idx" ON "TransactionCorrection"("transactionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TransactionCorrection_correctedById_idx" ON "TransactionCorrection"("correctedById");

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
