-- Create partial unique indexes to guarantee single isCurrent=true row per transaction

CREATE UNIQUE INDEX IF NOT EXISTS "uq_qc_vehicle_current" 
ON "QcVehicleCheck" ("transactionId") 
WHERE "isCurrent" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_incoming_material_current" 
ON "IncomingMaterialCheck" ("transactionId") 
WHERE "isCurrent" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouse_process_current" 
ON "WarehouseProcess" ("transactionId") 
WHERE "isCurrent" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_weighbridge_record_current" 
ON "WeighbridgeRecord" ("transactionId", "weightType") 
WHERE "isCurrent" = true;
