-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_module_action_idx" ON "ActivityLog"("module", "action");

-- CreateIndex
CREATE INDEX "Attachment_transactionId_idx" ON "Attachment"("transactionId");

-- CreateIndex
CREATE INDEX "FraudCheck_transactionId_idx" ON "FraudCheck"("transactionId");

-- CreateIndex
CREATE INDEX "IncomingMaterialCheck_transactionId_idx" ON "IncomingMaterialCheck"("transactionId");

-- CreateIndex
CREATE INDEX "QcVehicleCheck_transactionId_idx" ON "QcVehicleCheck"("transactionId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_plateNumber_idx" ON "Transaction"("plateNumber");

-- CreateIndex
CREATE INDEX "Transaction_processType_status_idx" ON "Transaction"("processType", "status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "TransactionStatusHistory_transactionId_idx" ON "TransactionStatusHistory"("transactionId");

-- CreateIndex
CREATE INDEX "WarehouseProcess_transactionId_idx" ON "WarehouseProcess"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WeighbridgeRecord_transactionId_type_key" ON "WeighbridgeRecord"("transactionId", "type");
