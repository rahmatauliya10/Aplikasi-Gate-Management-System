-- 2. Add columns to ProductCatalog, Transaction, WarehouseProcess
ALTER TABLE "ProductCatalog" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedUnit" "WarehouseUnit";

-- 3. Exact Code-Based ProductCatalog Backfill (No free-text matching)
UPDATE "ProductCatalog" SET "receiptUnit" = 'KG' WHERE code = 'COAL-001';
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code = 'SOLAR-001';
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code IN ('PAC-001', 'PAC-002', 'PAC-003');
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code IN ('RPD-001', 'RPD-002');

-- 4. In-Flight Transaction Backfill (exclude COMPLETED & CANCELLED)
UPDATE "Transaction" t
SET "receiptUnit" = pc."receiptUnit"
FROM "ProductCatalog" pc
WHERE t."productCatalogId" = pc.id
  AND t."processType" = 'GSP'
  AND t."status" NOT IN ('COMPLETED', 'CANCELLED')
  AND pc."receiptUnit" IS NOT NULL
  AND t."receiptUnit" IS NULL;
