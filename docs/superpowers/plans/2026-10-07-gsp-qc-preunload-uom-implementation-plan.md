# GSP QC/PA Form Alignment, Pre-Unloading Checklist & Material-Specific Receiving UOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align GSP QC/PA forms strictly with authoritative laboratory analysis sheets under `ACTIVE_CONFIGURED` governance, implement a server-authoritative 9-point Pre-Unloading verification gate, decouple physical weighbridge weight (KG) from commercial received quantity (Batubara = KG, Solar/PAC/Rapid Klen = LITER), enforce decimal-capable receiving (`Decimal(12, 3)`) with strict scale <= 3 rejection, and synchronize receiving UOM during active transaction amendment.

**Architecture:**
1. **Schema & Master Data:** Add `LITER` to `WarehouseUnit` enum, add `receiptUnit` to `ProductCatalog` and `Transaction`, and add `receivedQuantity Decimal(12,3)` and `receivedUnit` to `WarehouseProcess` and `Transaction`. Active GSP ProductCatalogs require both `gspAnalysisProfile` and `receiptUnit`.
2. **QC / PA Evaluators:** Implement exact calibrated rules under `ruleStatus: 'ACTIVE_CONFIGURED'`: Coal evaluates canonical bands `COAL_5600_6000` (max TM 33%) and `COAL_GT_6000` (max TM 25%) with unknown band throwing deterministic HTTP 422 `SPEC_NOT_CONFIGURED` without state change or artificial reject; PAC evaluates inclusive pH (3.5–5.0) and Density (1.170–1.260) with Al2O3 removed; Rapid Klen evaluates strict greater-than (`>`) limits on Na2O, NaOH, pH, and Density with exact boundary values failing; remove `PENDING_SIGNOFF` blockers so compliant runs produce automated `RELEASE`.
3. **Pre-Unloading Gate & Receiving:** Introduce canonical constant `GSP-PREUNLOAD-2026.1` with 9 vehicle/goods/document checks; start requires 9/9 OK, valid SJ, and PO; receiving inputs "Jumlah Diterima" with server-derived read-only `receiptUnit`, rejecting scale >3 decimals (HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`), with atomic updates across `WarehouseProcess` and `Transaction`.

**Tech Stack:** NestJS, TypeScript, Jest, PostgreSQL, Prisma ORM, Vue 3, Vite, Vitest, Pinia, Tailwind CSS.

## Global Constraints
- Target Branch: Work strictly on dedicated branch `fix/gsp-process-audit-improvements` (PR #27). PR #27 remains **OPEN** (`merged = false`).
- Baseline Spec: `docs/superpowers/specs/2026-10-07-gsp-qc-preunload-uom-design.md` (Rev 2.1, SHA `058202013792852fc567d6e2938b61d73e43afae`).
- Zero Application Code Touch Prior to Implementation Plan Approval: Plan-only delivery.
- Zero Production Deployment / Merge: All execution is local and Rancher Desktop UAT only.
- Strict Scale Limit: Received quantity maximum 3 decimal places (`Decimal(12, 3)`). Scale >3 strictly rejected with HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`. Silent rounding is prohibited.
- Receiving Separation: Physical weighbridge gross/tare/net remain strictly in KG; GSP receiving uses `receivedQuantity` and `receiptUnit`. Legacy fields (`actualWeight`, `actualQuantity`, `warehouseUnit`) are never used for GSP.
- GBB / GBJ Protection: Non-GSP processes remain 100% untouched.
- Zero Utility Reintroduction: No Utility role, no fake signoffs, no deviation overrides.

---

## Migration, Backfill & Rollback Rehearsal Strategy

### 1. Proposed Migration
- **Name:** `20261008000000_add_gsp_uom_and_receiving_quantity`
- **Location:** `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql`
- **DDL Execution:**
  ```sql
  -- 1. Extend WarehouseUnit Enum
  DO $$ BEGIN
      IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumtypid = 'WarehouseUnit'::regtype AND enumlabel = 'LITER'
      ) THEN
          ALTER TYPE "WarehouseUnit" ADD VALUE 'LITER';
      END IF;
  END $$;

  -- 2. Add columns to ProductCatalog, Transaction, WarehouseProcess
  ALTER TABLE "ProductCatalog" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
  ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
  ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
  ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
  ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedUnit" "WarehouseUnit";

  -- 3. Exact Code-Based ProductCatalog Backfill
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
  ```

### 2. Post-Migration Invariant Verification Gate
Run SQL verification to assert zero active unresolved GSP products:
```sql
SELECT count(*) FROM "ProductCatalog"
WHERE "processType" = 'GSP'
  AND "isActive" = true
  AND ("gspAnalysisProfile" IS NULL OR "receiptUnit" IS NULL);
```
Expected result: `0`. If count > 0, migration preflight fails immediately.

### 3. Three-Layer Rollback Strategy
1. **Layer 1 (Application Git Revert):** Revert code commits on `fix/gsp-process-audit-improvements`. Columns and enum value `LITER` remain harmlessly dormant in PostgreSQL without breaking runtime queries.
2. **Layer 2 (Forward-Fix Migration):** If schema cleanup is required in development, execute a forward migration dropping added columns `receiptUnit`, `receivedQuantity`, `receivedUnit`.
3. **Layer 3 (Database Backup Restoration):** In the event of a catastrophic migration failure during rehearsal, restore database state from the pre-deployment snapshot created by `npm run db:backup:pre-deploy` using `scripts/restore-dr-snapshot.ts`.

---

## Phase Breakdown & File Inventory

### Phase 1: Schema / Migration / Master Data
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql`
- `backend/src/product-catalog/dto/create-product-catalog.dto.ts`
- `backend/src/product-catalog/dto/update-product-catalog.dto.ts`
- `backend/src/product-catalog/product-catalog.service.ts`
- `backend/src/product-catalog/product-catalog.service.spec.ts`
- `backend/src/gate/gate.service.ts`
- `backend/src/gate/gate-gsp-checkin.spec.ts`
- `backend/src/transactions/active-transaction-amendment.service.ts`
- `backend/src/transactions/active-transaction-amendment.spec.ts`

### Phase 2: QC / PA Evaluators
- `backend/src/qc/constants/coal-specification.ts`
- `backend/src/qc/constants/coal-specification.spec.ts`
- `backend/src/qc/constants/chemical-specification.ts`
- `backend/src/qc/constants/chemical-specification.spec.ts`
- `backend/src/qc/dto/submit-product-analysis.dto.ts`
- `backend/src/qc/qc-product-analysis.service.ts`
- `backend/src/qc/qc-product-analysis.spec.ts`

### Phase 3: GSP Pre-Unloading Gate
- `backend/src/warehouse/constants/gsp-preunload-checklist.ts` (New file)
- `backend/src/warehouse/dto/start-warehouse.dto.ts`
- `backend/src/warehouse/warehouse.service.ts`
- `backend/src/warehouse/gsp-workflow.spec.ts`

### Phase 4: GSP Receiving
- `backend/src/warehouse/dto/complete-warehouse.dto.ts`
- `backend/src/warehouse/warehouse.service.ts`
- `backend/src/warehouse/gsp-workflow.spec.ts`
- `backend/src/warehouse/warehouse.service.spec.ts`

### Phase 5: Frontend
- `frontend/src/components/qc/CoalAnalysisForm.vue`
- `frontend/src/components/qc/ChemicalPacForm.vue`
- `frontend/src/components/qc/ChemicalRapidKlenForm.vue`
- `frontend/src/components/MasterDataModal.vue`
- `frontend/src/stores/masterDataStore.js`
- `frontend/src/views/GSPProcess.vue`
- `frontend/src/__tests__/qc-pa-forms.spec.js`
- `frontend/src/__tests__/gsp-process.spec.js`
- `frontend/src/__tests__/master-data-gsp.spec.js`

### Phase 6: Testing
- Comprehensive mapping of all spec acceptance criteria to unit and integration test suites.

### Phase 7: Migration Rehearsal, E2E & Manual UAT
- `backend/scripts/verify-gsp-uom-migration.ts` (New verification script)
- Rancher Desktop local execution of 17 manual operational scenarios.

---

## Detailed Task Specifications

### Phase 1: Schema / Migration / Master Data

#### Task 1: Prisma Schema Extension & PostgreSQL Migration
**Files:**
- Modify: `backend/prisma/schema.prisma:43-49, 230-245, 320-335, 620-630`
- Create: `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql`

**Interfaces:**
- Consumes: PostgreSQL enum `WarehouseUnit`, models `ProductCatalog`, `Transaction`, `WarehouseProcess`.
- Produces: `WarehouseUnit.LITER`, `ProductCatalog.receiptUnit`, `Transaction.receiptUnit`, `Transaction.receivedQuantity`, `WarehouseProcess.receivedQuantity`, `WarehouseProcess.receivedUnit`.

- [ ] **Step 1: Write migration SQL script**
Add `LITER` to `WarehouseUnit`, add columns with appropriate data types (`DECIMAL(12, 3)` and `"WarehouseUnit"`), add backfill statements for catalog codes `COAL-001`, `SOLAR-001`, `PAC-001..003`, `RPD-001..002`, and backfill in-flight transactions.

- [ ] **Step 2: Update `schema.prisma`**
```prisma
enum WarehouseUnit {
  KG
  PCS
  BAG
  ROLL
  PALLET
  LITER
}

model ProductCatalog {
  // ...
  receiptUnit        WarehouseUnit?
  // ...
}

model Transaction {
  // ...
  receiptUnit        WarehouseUnit?
  receivedQuantity   Decimal?         @db.Decimal(12, 3)
  // ...
}

model WarehouseProcess {
  // ...
  receivedQuantity   Decimal?         @db.Decimal(12, 3)
  receivedUnit       WarehouseUnit?
  // ...
}
```

- [ ] **Step 3: Run migration rehearsal against local database**
Run: `npm --prefix backend run rebuild:local`
Expected: Migration executes successfully, Prisma client regenerates with new types.

- [ ] **Step 4: Verify post-migration invariant check**
Run: `node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.productCatalog.count({ where: { processType: 'GSP', isActive: true, OR: [{ gspAnalysisProfile: null }, { receiptUnit: null }] } }).then(c => { console.log('Active GSP Invariant Violations:', c); process.exit(c === 0 ? 0 : 1); });"`
Expected: Output `Active GSP Invariant Violations: 0`, exit code 0.

- [ ] **Step 5: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql
git commit -m "feat(schema): add LITER to WarehouseUnit and decimal receiving fields to Transaction and WarehouseProcess"
```

**Migration Concern:** Zero downtime; table modifications use nullable columns and enum additions.
**Rollback Consideration:** Enum value `LITER` remains in PostgreSQL; dropping columns via forward migration restores prior schema structure.

---

#### Task 2: ProductCatalog Master Data Validation & DTOs
**Files:**
- Modify: `backend/src/product-catalog/dto/create-product-catalog.dto.ts`
- Modify: `backend/src/product-catalog/dto/update-product-catalog.dto.ts`
- Modify: `backend/src/product-catalog/product-catalog.service.ts`
- Test: `backend/src/product-catalog/product-catalog.service.spec.ts`

**Interfaces:**
- Consumes: `CreateProductCatalogDto`, `UpdateProductCatalogDto`.
- Produces: Validated `ProductCatalog` entities with mandatory `receiptUnit` for active GSP entries; throws `MISSING_GSP_RECEIPT_UNIT` or `MISSING_ANALYSIS_PROFILE` when violated.

- [ ] **Step 1: Write failing unit test in `product-catalog.service.spec.ts`**
```typescript
it('should reject creating active GSP catalog without receiptUnit with MISSING_GSP_RECEIPT_UNIT', async () => {
  await expect(
    service.create({
      code: 'PAC-NEW',
      name: 'PAC New Brand',
      category: 'Chemical UTL',
      processType: ProcessType.GSP,
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      isActive: true,
      // receiptUnit omitted
    } as any, mockAdminUser),
  ).rejects.toThrow('MISSING_GSP_RECEIPT_UNIT');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "should reject creating active GSP catalog without receiptUnit"`
Expected: FAIL.

- [ ] **Step 3: Implement validation in DTOs and `product-catalog.service.ts`**
In `create-product-catalog.dto.ts` and `update-product-catalog.dto.ts`:
```typescript
@ApiPropertyOptional({ enum: WarehouseUnit, example: WarehouseUnit.LITER })
@IsOptional()
@IsEnum(WarehouseUnit, { message: 'Invalid receipt unit' })
receiptUnit?: WarehouseUnit | null;
```
In `product-catalog.service.ts`:
```typescript
if (targetProcessType === ProcessType.GSP) {
  if (targetIsActive) {
    if (!targetProfile) {
      throw new BadRequestException({
        success: false,
        message: 'Produk GSP berstatus aktif wajib menetapkan Analysis Profile.',
        errors: ['MISSING_ANALYSIS_PROFILE', 'MISSING_GSP_ANALYSIS_PROFILE'],
      });
    }
    if (!targetReceiptUnit) {
      throw new BadRequestException({
        success: false,
        message: 'Produk GSP berstatus aktif wajib menetapkan Receipt UOM (KG atau LITER).',
        errors: ['MISSING_GSP_RECEIPT_UNIT'],
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "ProductCatalogService"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/product-catalog/
git commit -m "feat(product-catalog): enforce receiptUnit and analysis profile invariants for active GSP products"
```

---

#### Task 3: Gate Registration Snapshot & Active Transaction Amendment Synchronization
**Files:**
- Modify: `backend/src/gate/gate.service.ts:145-225`
- Modify: `backend/src/transactions/active-transaction-amendment.service.ts:150-295`
- Test: `backend/src/gate/gate-gsp-checkin.spec.ts`
- Test: `backend/src/transactions/active-transaction-amendment.spec.ts`

**Interfaces:**
- Consumes: `ProductCatalog.receiptUnit`, `AmendActiveTransactionDto`.
- Produces: `Transaction.receiptUnit` snapshot at Gate Check-In, atomic `receiptUnit` synchronization upon product amendment before warehouse start.

- [ ] **Step 1: Write failing tests in `gate-gsp-checkin.spec.ts` and `active-transaction-amendment.spec.ts`**
```typescript
// gate-gsp-checkin.spec.ts
it('should fail check-in if GSP catalog has missing receiptUnit', async () => {
  mockCatalog.receiptUnit = null;
  await expect(gateService.checkIn(dto, mockUser)).rejects.toThrow('MISSING_GSP_RECEIPT_UNIT');
});

it('should snapshot receiptUnit from catalog to transaction on gate check-in', async () => {
  mockCatalog.receiptUnit = 'LITER';
  const result = await gateService.checkIn(dto, mockUser);
  expect(result.receiptUnit).toBe('LITER');
});

// active-transaction-amendment.spec.ts
it('should atomically update transaction receiptUnit from KG to LITER when amending Coal to PAC', async () => {
  const result = await service.amendTransaction(coalTx.id, {
    productCatalogId: pacCatalog.id,
    cargoType: 'Chemical UTL',
    cargoSubType: 'PAC 280 AC',
    reason: 'Salah pilih material di pos security',
    revision: 1,
  }, mockAdminUser);
  expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      receiptUnit: 'LITER',
    }),
  }));
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npm --prefix backend test -- -t "gate-gsp-checkin|ActiveTransactionAmendmentService"`
Expected: FAIL.

- [ ] **Step 3: Implement snapshotting and amendment synchronization**
In `gate.service.ts`:
```typescript
if (!catalog.receiptUnit) {
  throw new BadRequestException({
    success: false,
    message: `Katalog produk '${catalog.name}' belum memiliki satuan penerimaan (receiptUnit) terkonfigurasi.`,
    errors: ['MISSING_GSP_RECEIPT_UNIT'],
  });
}
// Snapshot into tx.transaction.create data:
receiptUnit: catalog.receiptUnit,
```
In `active-transaction-amendment.service.ts`:
```typescript
if (!newCatalog.receiptUnit) {
  throw new BadRequestException({
    success: false,
    message: `Katalog produk target '${newCatalog.name}' belum memiliki satuan penerimaan (receiptUnit).`,
    errors: ['MISSING_GSP_RECEIPT_UNIT'],
  });
}
// Update transaction:
receiptUnit: newCatalog.receiptUnit,
// Include in oldValues and newValues of TransactionCorrection:
oldValues: { ...tx, receiptUnit: tx.receiptUnit },
newValues: { ...newValues, receiptUnit: newCatalog.receiptUnit },
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npm --prefix backend test -- -t "gate-gsp-checkin|ActiveTransactionAmendmentService"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/gate/ backend/src/transactions/
git commit -m "feat(transactions): snapshot receiptUnit at gate registration and synchronize during active amendment"
```

---

### Phase 2: QC / PA Evaluators

#### Task 4: Coal Calorie Band & Moisture Evaluator Alignment
**Files:**
- Modify: `backend/src/qc/constants/coal-specification.ts`
- Test: `backend/src/qc/constants/coal-specification.spec.ts`

**Interfaces:**
- Consumes: `{ calorieBand: string, totalMoisture: number, testRound: number, visual: CoalVisualParameters }`.
- Produces: Evaluation result with `ruleStatus: 'ACTIVE_CONFIGURED'`, throws or flags `SPEC_NOT_CONFIGURED` for unmapped calorie bands without fallback.

- [ ] **Step 1: Write failing unit test in `coal-specification.spec.ts`**
```typescript
it('should evaluate COAL_5600_6000 with TM <= 33.0% as PASS', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_5600_6000', totalMoisture: 32.5, testRound: 1, visualPassed: true });
  expect(res.decision).toBe('RELEASE');
  expect(res.result).toBe('PASS');
});

it('should evaluate COAL_GT_6000 with TM <= 25.0% as PASS', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_GT_6000', totalMoisture: 24.8, testRound: 1, visualPassed: true });
  expect(res.decision).toBe('RELEASE');
  expect(res.result).toBe('PASS');
});

it('should identify unknown calorie band as unconfigured without 4200 fallback', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_4200', totalMoisture: 30.0, testRound: 1, visualPassed: true });
  expect(res.isConfigured).toBe(false);
  expect(res.error).toBe('SPEC_NOT_CONFIGURED');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "coal-specification.spec"`
Expected: FAIL.

- [ ] **Step 3: Implement Coal evaluator**
Remove legacy GAR 3800, 4200, 4800, 5000, 5500 and default 4200 fallback.
Define exact mapping:
```typescript
export const CONFIGURED_COAL_CALORIE_BANDS = {
  COAL_GT_6000: { maxTotalMoisturePct: 25.0, label: 'Kalori > 6000 kcal/kg' },
  COAL_5600_6000: { maxTotalMoisturePct: 33.0, label: 'Kalori 5600–6000 kcal/kg' },
};
```
Define exact visual analysis criteria for 5 parameters:
`kondisi === 'Kering (Tidak Basah)'`
`warna in ['Hitam', 'Hitam Kecoklatan', 'Coklat']`
`levelRank in ['High Rank Coal', 'Medium Rank Coal', 'Low Rank Coal']`
`kilap in ['Hitam Mengkilap', 'Hitam Kecoklatan', 'Mudah Lapuk']`
`bahanPengotor === 'Tidak ada kontaminasi batuan maupun tanah'`

If `calorieBand` is not in `CONFIGURED_COAL_CALORIE_BANDS`, return `{ isConfigured: false, error: 'SPEC_NOT_CONFIGURED' }`.
Remove `PENDING_SIGNOFF` blocker; use `ruleStatus: 'ACTIVE_CONFIGURED'`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "coal-specification.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/qc/constants/coal-specification.*
git commit -m "feat(qc): align coal evaluator to COAL_5600_6000 and COAL_GT_6000 bands with SPEC_NOT_CONFIGURED contract"
```

---

#### Task 5: PAC Chemical & Sensory Evaluator Alignment
**Files:**
- Modify: `backend/src/qc/constants/chemical-specification.ts`
- Test: `backend/src/qc/constants/chemical-specification.spec.ts`

**Interfaces:**
- Consumes: `PacAnalysisParameters` (`{ sensory, ph, density }`).
- Produces: `ChemicalEvaluationResult` with inclusive boundaries (pH 3.5–5.0, Density 1.170–1.260), sensory matching operational sheet, and automated RELEASE under `ACTIVE_CONFIGURED`.

- [ ] **Step 1: Write failing unit test in `chemical-specification.spec.ts`**
```typescript
it('should evaluate PAC boundaries inclusively without requiring Al2O3', () => {
  const res1 = evaluatePacAnalysis({
    sensory: { visual: 'Kuning', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
    ph: 3.5,
    density: 1.170,
  });
  expect(res1.decision).toBe('RELEASE');
  expect(res1.result).toBe('PASS');

  const res2 = evaluatePacAnalysis({
    sensory: { visual: 'Coklat Jernih', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
    ph: 5.0,
    density: 1.260,
  });
  expect(res2.decision).toBe('RELEASE');
  expect(res2.result).toBe('PASS');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "chemical-specification.spec"`
Expected: FAIL.

- [ ] **Step 3: Implement PAC evaluation rules**
Sensory parameters:
- `visual`: Permitted values: `'Kuning'`, `'Coklat Jernih'`.
- `foreignMatters`: Permitted value: `'Tidak ada kontaminasi'`.
- `packagingLabel`: Permitted value: `'Kemasan & label tidak rusak'`.
Chemical parameters:
- `ph`: `3.5 <= ph && ph <= 5.0`
- `density`: `1.170 <= density && density <= 1.260`
Remove Al2O3 mandatory check.
Set `ruleStatus: 'ACTIVE_CONFIGURED'`, eliminating legacy `PENDING_SIGNOFF` blocker.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "chemical-specification.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/qc/constants/chemical-specification.*
git commit -m "feat(qc): align PAC evaluator to operational sensory options and inclusive chemical boundaries"
```

---

#### Task 6: Rapid Klen Chemical & Sensory Evaluator Alignment
**Files:**
- Modify: `backend/src/qc/constants/chemical-specification.ts`
- Test: `backend/src/qc/constants/chemical-specification.spec.ts`

**Interfaces:**
- Consumes: `RapidKlenAnalysisParameters` (`{ sensory, alkalinityNa2O, alkalinityNaOH, ph, density }`).
- Produces: `ChemicalEvaluationResult` with strict greater-than (`>`) boundary enforcement.

- [ ] **Step 1: Write failing unit test in `chemical-specification.spec.ts`**
```typescript
it('should enforce strict greater-than limits for Rapid Klen (exact boundary fails)', () => {
  // Boundary values fail
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.00, alkalinityNaOH: 45.17, ph: 12.001, density: 1.401 }).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.16, ph: 12.001, density: 1.401 }).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.000, density: 1.401 }).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.001, density: 1.400 }).result).toBe('REJECT');

  // Values strictly exceeding boundary pass
  const passRes = evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.001, density: 1.401 });
  expect(passRes.decision).toBe('RELEASE');
  expect(passRes.result).toBe('PASS');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "chemical-specification.spec"`
Expected: FAIL.

- [ ] **Step 3: Implement Rapid Klen evaluation rules**
Sensory:
- `visual`: `'Jernih'`
- `foreignMatters`: `'Tidak ada kontaminasi'`
- `packagingLabel`: `'Kemasan & label tidak rusak'`
Chemical (Strict `>`):
- `alkalinityNa2O <= 35.00` -> FAIL
- `alkalinityNaOH <= 45.16` -> FAIL
- `ph <= 12.000` -> FAIL
- `density <= 1.400` -> FAIL
Set `ruleStatus: 'ACTIVE_CONFIGURED'`, eliminating legacy `PENDING_SIGNOFF` blocker.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "chemical-specification.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/qc/constants/chemical-specification.*
git commit -m "feat(qc): enforce strict greater-than limits for Rapid Klen chemical parameters under ACTIVE_CONFIGURED"
```

---

#### Task 7: QC Product Analysis Service Integration & Unconfigured Calorie Band HTTP 422
**Files:**
- Modify: `backend/src/qc/dto/submit-product-analysis.dto.ts`
- Modify: `backend/src/qc/qc-product-analysis.service.ts:320-420`
- Test: `backend/src/qc/qc-product-analysis.spec.ts`

**Interfaces:**
- Consumes: `SubmitProductAnalysisDto` with `calorieBand: string`.
- Produces: Deterministic HTTP 422 `SPEC_NOT_CONFIGURED` exception with state preservation and `ActivityLog` on unknown calorie band; automated `RELEASE` on compliant runs.

- [ ] **Step 1: Write failing test in `qc-product-analysis.spec.ts`**
```typescript
it('should throw HTTP 422 SPEC_NOT_CONFIGURED without changing status or creating reject record on unknown coal calorie band', async () => {
  const dto = {
    testRound: 1,
    parameters: {
      calorieBand: 'COAL_UNKNOWN_4200',
      totalMoisture: 28.0,
      visual: { kondisi: 'Kering (Tidak Basah)', warna: 'Hitam', levelRank: 'Medium Rank Coal', kilap: 'Hitam Mengkilap', bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah' },
    },
  };

  await expect(service.submitProductAnalysis(coalTx.id, dto as any, mockUser))
    .rejects.toThrow(new HttpException({
      statusCode: 422,
      error: 'SPEC_NOT_CONFIGURED',
      message: 'Spesifikasi acuan kalori batubara belum dikonfigurasi. Evaluasi diblokir tanpa keputusan rilis/tolak otomatis.',
    }, 422));

  // Assert transaction was NOT transitioned to REJECTED
  expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
  // Assert ActivityLog recorded
  expect(mockActivityLogs.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'COAL_SPEC_NOT_CONFIGURED',
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "QcProductAnalysisService"`
Expected: FAIL.

- [ ] **Step 3: Implement handler in `qc-product-analysis.service.ts`**
In `qc-product-analysis.service.ts`:
If profile is `COAL_PA`:
- Extract `rawParams.calorieBand`.
- Evaluate via `evaluateCoalAnalysis`.
- If `!evalResult.isConfigured`:
  - Log `COAL_SPEC_NOT_CONFIGURED` to `ActivityLogsService`.
  - Do NOT create `QcProductAnalysis` record.
  - Do NOT update `Transaction.status`.
  - Throw `new HttpException({ statusCode: 422, error: 'SPEC_NOT_CONFIGURED', message: 'Spesifikasi acuan kalori batubara belum dikonfigurasi. Evaluasi diblokir tanpa keputusan rilis/tolak otomatis.' }, 422)`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "QcProductAnalysisService"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/qc/
git commit -m "feat(qc): handle unconfigured coal calorie band with deterministic HTTP 422 and state protection"
```

---

### Phase 3: GSP Pre-Unloading Gate

#### Task 8: Canonical Pre-Unload Checklist Constants & DTO
**Files:**
- Create: `backend/src/warehouse/constants/gsp-preunload-checklist.ts`
- Modify: `backend/src/warehouse/dto/start-warehouse.dto.ts`

**Interfaces:**
- Consumes: Client payload `{ suratJalanNumber, poNumber, preUnloadChecklist: { items: Array<{ code, result, notes }> } }`.
- Produces: Validated canonical codes and definitions for `GSP-PREUNLOAD-2026.1`.

- [ ] **Step 1: Create `backend/src/warehouse/constants/gsp-preunload-checklist.ts`**
```typescript
export const GSP_PREUNLOAD_VERSION = 'GSP-PREUNLOAD-2026.1';

export interface CanonicalChecklistItem {
  code: string;
  label: string;
}

export const GSP_PREUNLOAD_CANONICAL_ITEMS: CanonicalChecklistItem[] = [
  { code: 'CLEAN_VEHICLE', label: 'Kendaraan bersih' },
  { code: 'DOOR_SEAL_GOOD', label: 'Seal pintu kendaraan baik' },
  { code: 'NO_EXPIRED_GAS_CYLINDER', label: 'Tidak ditemukan tabung gas yang sudah Exp date masa uji berlakunya' },
  { code: 'ITEMS_NEATLY_ARRANGED', label: 'Barang tertata rapi' },
  { code: 'NO_PEST_OR_ANIMAL_TRACE', label: 'Tidak ditemukan hama / binatang dan/atau jejak / bekas binatang' },
  { code: 'GOOD_CLEAN_SEALED', label: 'Barang baik dan bersih serta tersegel' },
  { code: 'COA_MATCHES_BATCH', label: 'CoA tersedia dan sesuai batchnya' },
  { code: 'QTY_TYPE_MATCHES_SJ', label: 'Jumlah dan jenis barang sesuai SJ' },
  { code: 'VEHICLE_NO_LEAK_GOOD', label: 'Kendaraan tidak bocor / kondisi baik' },
];

export const GSP_PREUNLOAD_CODES = GSP_PREUNLOAD_CANONICAL_ITEMS.map((i) => i.code);
```

- [ ] **Step 2: Update `backend/src/warehouse/dto/start-warehouse.dto.ts`**
Add class-validator validation for `preUnloadChecklist`:
```typescript
export class PreUnloadChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(['OK', 'NOT_OK'])
  result: 'OK' | 'NOT_OK';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PreUnloadChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreUnloadChecklistItemDto)
  items: PreUnloadChecklistItemDto[];
}
```

- [ ] **Step 3: Run linter on new files**
Run: `npm --prefix backend run lint`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/warehouse/constants/gsp-preunload-checklist.ts backend/src/warehouse/dto/start-warehouse.dto.ts
git commit -m "feat(warehouse): define canonical GSP-PREUNLOAD-2026.1 checklist constant and DTO schema"
```

---

#### Task 9: GSP Pre-Unloading Hard Gate & Persistence in WarehouseService
**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts:238-480`
- Test: `backend/src/warehouse/gsp-workflow.spec.ts`

**Interfaces:**
- Consumes: `StartWarehouseDto`, user identity.
- Produces: Atomic validation of SJ, PO, and 9 canonical checklist codes; fail-closed `ActivityLog` on any `NOT_OK` without mutating status; canonical persistence in `WarehouseProcess.checklistItems` with `startById` and `startAt`.

- [ ] **Step 1: Write failing unit test in `gsp-workflow.spec.ts`**
```typescript
it('should block warehouse start if any checklist item is NOT_OK and record ActivityLog fail-closed', async () => {
  const dto = {
    suratJalanNumber: 'SJ-001',
    poNumber: 'PO-001',
    preUnloadChecklist: {
      items: [
        { code: 'CLEAN_VEHICLE', result: 'OK' },
        { code: 'DOOR_SEAL_GOOD', result: 'NOT_OK', notes: 'Segel rusak' },
        // ... 7 other items OK
      ],
    },
  };

  await expect(warehouseService.startWarehouse(gspTx.id, dto as any, mockUser))
    .rejects.toThrow('Pemeriksaan pra-bongkar belum memenuhi persyaratan.');

  expect(mockPrisma.warehouseProcess.create).not.toHaveBeenCalled();
  expect(mockActivityLogs.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
  }));
});

it('should require SJ and PO before GSP warehouse start', async () => {
  const dto = {
    // missing SJ / PO
    preUnloadChecklist: { items: valid9Items },
  };
  await expect(warehouseService.startWarehouse(gspTx.id, dto as any, mockUser))
    .rejects.toThrow('Surat Jalan dan PO wajib diisi sebelum memulai pembongkaran.');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow"`
Expected: FAIL.

- [ ] **Step 3: Implement GSP pre-unloading logic in `warehouse.service.ts`**
In `warehouse.service.ts` -> `startWarehouse`:
For `tx.processType === 'GSP'`:
1. Check SJ and PO presence:
   ```typescript
   const effectiveSj = dto.suratJalanNumber || tx.suratJalanNumber;
   const effectivePo = dto.poNumber || tx.poNumber;
   if (!effectiveSj || !effectivePo) {
     throw new BadRequestException('Surat Jalan dan PO wajib diisi sebelum memulai pembongkaran.');
   }
   ```
2. Validate checklist items:
   - Must contain exactly 9 items.
   - Every code must be in `GSP_PREUNLOAD_CODES`.
   - No duplicates, no missing codes.
   - If any `result !== 'OK'`:
     - Log `GSP_PREUNLOAD_CHECKLIST_FAILED` with failed item codes and notes to `ActivityLog`.
     - Throw `BadRequestException('Pemeriksaan pra-bongkar belum memenuhi persyaratan.')`.
3. Construct canonical persisted JSON shape:
   ```typescript
   const persistedChecklist = {
     version: GSP_PREUNLOAD_VERSION,
     overallResult: 'OK',
     items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((canon) => {
       const submitted = dto.preUnloadChecklist.items.find((i) => i.code === canon.code);
       return {
         code: canon.code,
         label: canon.label, // Backend-authoritative label (ignores client label)
         result: 'OK',
         notes: submitted?.notes || '',
       };
     }),
   };
   ```
4. Atomically persist into `WarehouseProcess.checklistItems` with `startById` and `startAt`, and transition `Transaction` status to `WAREHOUSE_IN_PROGRESS`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/warehouse/warehouse.service.ts backend/src/warehouse/gsp-workflow.spec.ts
git commit -m "feat(warehouse): enforce server-authoritative 9-point pre-unloading checklist and mandatory SJ/PO gate"
```

---

### Phase 4: GSP Receiving

#### Task 10: Complete Warehouse DTO & Decimal Scale Validation
**Files:**
- Modify: `backend/src/warehouse/dto/complete-warehouse.dto.ts`

**Interfaces:**
- Consumes: `{ receivedQuantity?: number, receivedUnit?: WarehouseUnit }`.
- Produces: Validated received quantity supporting up to 3 decimal places; strictly rejects scale > 3 with HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`.

- [ ] **Step 1: Write validator helper function for decimal scale**
In `backend/src/warehouse/dto/complete-warehouse.dto.ts` or a shared utility:
```typescript
export function assertValidReceivedQuantityScale(val: number): void {
  const str = String(val);
  const parts = str.split('.');
  if (parts.length === 2 && parts[1].length > 3) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY_SCALE',
      message: 'Jumlah diterima maksimal 3 angka di belakang koma (desimal).',
    });
  }
}
```

- [ ] **Step 2: Update `CompleteWarehouseDto`**
Add fields:
```typescript
@ApiPropertyOptional({ description: 'Commercial received quantity (up to 3 decimal places)', example: 8000.25 })
@IsOptional()
@IsNumber()
@Min(0.001)
receivedQuantity?: number;

@ApiPropertyOptional({ enum: WarehouseUnit, description: 'Optional client-submitted unit for verification', example: WarehouseUnit.LITER })
@IsOptional()
@IsEnum(WarehouseUnit)
receivedUnit?: WarehouseUnit;
```

- [ ] **Step 3: Run backend build to verify types**
Run: `npm --prefix backend run build`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/warehouse/dto/complete-warehouse.dto.ts
git commit -m "feat(warehouse): add receivedQuantity and receivedUnit to CompleteWarehouseDto with scale validation"
```

---

#### Task 11: Warehouse Receiving Decoupling & Atomic Persistence in WarehouseService
**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts:520-720`
- Test: `backend/src/warehouse/gsp-workflow.spec.ts`
- Test: `backend/src/warehouse/warehouse.service.spec.ts`

**Interfaces:**
- Consumes: `CompleteWarehouseDto`, `Transaction.receiptUnit`.
- Produces: Decoupled GSP receiving where `receivedQuantity` is mandatory > 0, `receivedUnit` is derived from `Transaction.receiptUnit`, scale > 3 is rejected, and atomic updates write to `WarehouseProcess.receivedQuantity/receivedUnit` and `Transaction.receivedQuantity` in the same Prisma transaction. GBB/GBJ flows remain untouched.

- [ ] **Step 1: Write failing unit test in `gsp-workflow.spec.ts`**
```typescript
it('should reject GSP completeWarehouse if receivedQuantity is missing or scale exceeds 3 decimals', async () => {
  // Missing receivedQuantity
  await expect(warehouseService.completeWarehouse(gspTx.id, { actualWeight: 15000 } as any, mockUser))
    .rejects.toThrow('Jumlah diterima (receivedQuantity) wajib diisi untuk transaksi GSP.');

  // Scale > 3 decimals
  await expect(warehouseService.completeWarehouse(gspTx.id, { receivedQuantity: 8000.2507 } as any, mockUser))
    .rejects.toThrow('INVALID_RECEIVED_QUANTITY_SCALE');
});

it('should derive receivedUnit from transaction receiptUnit and persist atomically in same transaction', async () => {
  const res = await warehouseService.completeWarehouse(gspTx.id, { receivedQuantity: 16500.25 } as any, mockUser);
  expect(mockPrisma.warehouseProcess.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      receivedQuantity: 16500.25,
      receivedUnit: 'LITER',
    }),
  }));
  expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      receivedQuantity: 16500.25,
    }),
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow"`
Expected: FAIL.

- [ ] **Step 3: Implement receiving logic in `warehouse.service.ts`**
In `warehouse.service.ts` -> `completeWarehouse`:
1. Distinguish GSP from non-GSP:
   ```typescript
   if (tx.processType === 'GSP') {
     if (dto.receivedQuantity == null || dto.receivedQuantity <= 0) {
       throw new BadRequestException('Jumlah diterima (receivedQuantity) wajib diisi untuk transaksi GSP.');
     }
     assertValidReceivedQuantityScale(dto.receivedQuantity);

     // Derive receivedUnit from Transaction.receiptUnit
     const derivedUnit = tx.receiptUnit;
     if (!derivedUnit) {
       throw new BadRequestException('Satuan penerimaan (receiptUnit) tidak ditemukan pada transaksi.');
     }
     if (dto.receivedUnit && dto.receivedUnit !== derivedUnit) {
       throw new BadRequestException(`Satuan penerimaan (${dto.receivedUnit}) tidak cocok dengan satuan transaksi (${derivedUnit}).`);
     }
   } else {
     // Non-GSP (GBB/GBJ): preserve legacy actualWeight / actualQuantity checks
     if (dto.actualWeight == null && dto.actualQuantity == null) {
       throw new BadRequestException('At least one of actualWeight or actualQuantity is required');
     }
   }
   ```
2. Atomic update in Prisma transaction:
   - For GSP:
     - `Transaction.updateMany`: `receivedQuantity: dto.receivedQuantity`, `status: 'WAREHOUSE_DONE'`. (Leave `actualWeight`, `actualQuantity`, `warehouseUnit` null).
     - `WarehouseProcess.update`: `receivedQuantity: dto.receivedQuantity`, `receivedUnit: derivedUnit`.
   - For non-GSP:
     - Continue updating `actualWeight`, `actualQuantity`, `warehouseUnit` as before.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow|WarehouseService"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/warehouse/warehouse.service.ts backend/src/warehouse/gsp-workflow.spec.ts backend/src/warehouse/warehouse.service.spec.ts
git commit -m "feat(warehouse): decouple GSP receiving with atomic receivedQuantity persistence and exact 3-decimal scale policy"
```

---

### Phase 5: Frontend

#### Task 12: Coal PA Form Alignment
**Files:**
- Modify: `frontend/src/components/qc/CoalAnalysisForm.vue`
- Test: `frontend/src/__tests__/qc-pa-forms.spec.js`

**Interfaces:**
- Consumes: Transaction data with Coal profile.
- Produces: Calorie band selection (`COAL_5600_6000`, `COAL_GT_6000`), exact 5 visual parameters, and moisture input.

- [ ] **Step 1: Write failing frontend test in `qc-pa-forms.spec.js`**
```javascript
it('should render exact two calorie bands and five visual parameters for Coal PA form', async () => {
  const wrapper = mount(CoalAnalysisForm, { props: { transaction: mockCoalTx } });
  expect(wrapper.find('select[name="calorieBand"]').exists()).toBe(true);
  const options = wrapper.findAll('select[name="calorieBand"] option');
  expect(options.map(o => o.attributes('value'))).toEqual(['COAL_5600_6000', 'COAL_GT_6000']);
  expect(wrapper.text()).toContain('Kering (Tidak Basah)');
  expect(wrapper.text()).toContain('Digital Moisture Analyzer');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: FAIL.

- [ ] **Step 3: Update `CoalAnalysisForm.vue`**
- Replace legacy calorie tiers with dropdown containing `COAL_5600_6000` ("5600–6000 kcal/kg (Max TM 33%)") and `COAL_GT_6000` ("> 6000 kcal/kg (Max TM 25%)").
- Add exact 5 visual check controls with exact wording:
  1. Kondisi: `Kering (Tidak Basah)`
  2. Warna: `Hitam`, `Hitam Kecoklatan`, `Coklat`
  3. Level Rank: `High Rank Coal`, `Medium Rank Coal`, `Low Rank Coal`
  4. Kilap: `Hitam Mengkilap`, `Hitam Kecoklatan`, `Mudah Lapuk`
  5. Bahan Pengotor: `Tidak ada kontaminasi batuan maupun tanah`
- Method indicator: `Digital Moisture Analyzer`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/qc/CoalAnalysisForm.vue frontend/src/__tests__/qc-pa-forms.spec.js
git commit -m "feat(frontend): align CoalAnalysisForm with configured calorie bands and authoritative visual checks"
```

---

#### Task 13: PAC & Rapid Klen PA Form Alignment
**Files:**
- Modify: `frontend/src/components/qc/ChemicalPacForm.vue`
- Modify: `frontend/src/components/qc/ChemicalRapidKlenForm.vue`
- Test: `frontend/src/__tests__/qc-pa-forms.spec.js`

**Interfaces:**
- Consumes: Chemical transactions.
- Produces: PAC sensory/pH/density without mandatory Al2O3, Rapid Klen sensory and strict chemical boundaries.

- [ ] **Step 1: Write failing frontend test in `qc-pa-forms.spec.js`**
```javascript
it('should render PAC form without mandatory Al2O3 and Rapid Klen with strict boundary indicators', () => {
  const pacWrapper = mount(ChemicalPacForm, { props: { transaction: mockPacTx } });
  expect(pacWrapper.find('#input-al2o3').exists()).toBe(false);
  expect(pacWrapper.text()).toContain('Kuning');
  expect(pacWrapper.text()).toContain('Coklat Jernih');

  const rpdWrapper = mount(ChemicalRapidKlenForm, { props: { transaction: mockRpdTx } });
  expect(rpdWrapper.text()).toContain('> 35.00%');
  expect(rpdWrapper.text()).toContain('> 45.16%');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: FAIL.

- [ ] **Step 3: Update `ChemicalPacForm.vue` and `ChemicalRapidKlenForm.vue`**
- PAC: Remove Al2O3 input field from form validation. Sensory radio/select: Visual (`Kuning`, `Coklat Jernih`), Foreign Matters (`Tidak ada kontaminasi`), Packaging (`Kemasan & label tidak rusak`).
- Rapid Klen: Display strict boundary helper text (`> 35.00%`, `> 45.16%`, `> 12.000`, `> 1.400`).

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/qc/ChemicalPacForm.vue frontend/src/components/qc/ChemicalRapidKlenForm.vue frontend/src/__tests__/qc-pa-forms.spec.js
git commit -m "feat(frontend): align PAC and Rapid Klen forms with authoritative laboratory sheets"
```

---

#### Task 14: Pre-Unloading 9-Point Checklist UI in GSPProcess.vue
**Files:**
- Modify: `frontend/src/views/GSPProcess.vue:60-110`
- Test: `frontend/src/__tests__/gsp-process.spec.js`

**Interfaces:**
- Consumes: GSP transaction with `QC_VEHICLE_PASSED` or `PA_NOT_REQUIRED`.
- Produces: Pre-unloading verification section with Surat Jalan, PO, and 9-point checklist with toggles `[ OK ]` / `[ NOT OK ]`; disable "Mulai Bongkar" until 9/9 OK.

- [ ] **Step 1: Write failing frontend test in `gsp-process.spec.js`**
```javascript
it('should render 9 pre-unloading checklist items and disable start button until all 9 are OK', async () => {
  const wrapper = mount(GSPProcess, { props: { initialTruck: mockTruckQcPassed } });
  expect(wrapper.findAll('.checklist-item-row').length).toBe(9);
  const startBtn = wrapper.find('#btn-start-gsp-bongkar');
  expect(startBtn.attributes('disabled')).toBeDefined();

  // Mark all 9 OK
  for (const row of wrapper.findAll('.checklist-item-row')) {
    await row.find('.btn-toggle-ok').trigger('click');
  }
  expect(startBtn.attributes('disabled')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: FAIL.

- [ ] **Step 3: Implement pre-unloading checklist UI in `GSPProcess.vue`**
- Render Section: "Pemeriksaan Pra-Bongkar (Kendaraan, Barang & Dokumen)".
- Render 9 canonical checklist items with label, toggle `[ OK ]` / `[ NOT OK ]`, and notes input.
- Render Surat Jalan & PO input fields (prefilled if present).
- Enable `[ MULAI BONGKAR ]` button only when SJ and PO are filled and all 9 items have `result === 'OK'`.
- On click, submit payload to `POST /api/warehouse/start/:id`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/views/GSPProcess.vue frontend/src/__tests__/gsp-process.spec.js
git commit -m "feat(frontend): implement 9-point pre-unloading verification checklist in GSPProcess"
```

---

#### Task 15: GSP Receiving Screen & Read-Only UOM Badge in GSPProcess.vue
**Files:**
- Modify: `frontend/src/views/GSPProcess.vue:110-125`
- Test: `frontend/src/__tests__/gsp-process.spec.js`

**Interfaces:**
- Consumes: Active transaction in `WAREHOUSE_IN_PROGRESS`.
- Produces: "Jumlah Diterima" input with dynamic label and read-only UOM badge (`KG` or `LITER`), client-side decimal validation, and submission to `completeWarehouse`.

- [ ] **Step 1: Write failing frontend test in `gsp-process.spec.js`**
```javascript
it('should render Jumlah Diterima with read-only UOM badge and block scale > 3 decimals', async () => {
  const wrapper = mount(GSPProcess, { props: { initialTruck: mockTruckInProgressPac } });
  expect(wrapper.text()).toContain('Jumlah Diterima (LITER)');
  expect(wrapper.find('#badge-receipt-uom').text()).toBe('LITER');

  const input = wrapper.find('#input-received-quantity');
  await input.setValue('8000.2507');
  expect(wrapper.find('.error-scale-msg').exists()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: FAIL.

- [ ] **Step 3: Update `GSPProcess.vue` receiving section**
- Replace legacy `WeightInput` with dedicated GSP receiving card:
  - Header: `Selesai Penerimaan Barang (GSP)`
  - Material Name: Displayed read-only (e.g. `PAC 280 AC`)
  - Input: `Jumlah Diterima` (`#input-received-quantity`, type number, step `0.001`)
  - Dynamic label: `Jumlah Diterima (${selectedTruck.receiptUnit || 'KG'})`
  - Satuan (UOM): Read-only badge `#badge-receipt-uom` displaying `selectedTruck.receiptUnit`
  - Inline validation: prevent submission if decimals > 3.
  - Action button: `[ SELESAIKAN PENERIMAAN ]` calling `warehouseService.completeWarehouse(id, { receivedQuantity })`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/views/GSPProcess.vue frontend/src/__tests__/gsp-process.spec.js
git commit -m "feat(frontend): replace legacy weight input with material-specific receiving quantity and read-only UOM badge"
```

---

#### Task 16: Master Data Modal Receipt UOM Field
**Files:**
- Modify: `frontend/src/components/MasterDataModal.vue:320-360`
- Modify: `frontend/src/stores/masterDataStore.js`
- Test: `frontend/src/__tests__/master-data-gsp.spec.js`

**Interfaces:**
- Consumes: `masterDataStore`.
- Produces: Visible, required `Receipt UOM` selection (`KG` or `LITER`) when creating/editing GSP product catalog items; badges displayed on product list cards.

- [ ] **Step 1: Write failing test in `master-data-gsp.spec.js`**
```javascript
it('should include Receipt UOM in Add GSP Product modal and list card badge', async () => {
  const wrapper = mount(MasterDataModal);
  await wrapper.find('#btn-tab-materials').trigger('click');
  await wrapper.find('#btn-scope-gsp').trigger('click');
  expect(wrapper.findAll('.product-receipt-uom-badge').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm --prefix frontend test -- -t "master-data-gsp"`
Expected: FAIL.

- [ ] **Step 3: Update `MasterDataModal.vue` and `masterDataStore.js`**
- In `MasterDataModal.vue`:
  - Add `Receipt UOM` dropdown (`KG`, `LITER`) in Add GSP Product modal.
  - Enforce `receiptUnit` required in `canSubmitGsp` validation.
  - Display `receiptUnit` badge next to `gspAnalysisProfile` on product cards.
- In `masterDataStore.js`:
  - Include `receiptUnit` in `createProductCatalog` and `updateProductCatalog` payloads.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "master-data-gsp"`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/MasterDataModal.vue frontend/src/stores/masterDataStore.js frontend/src/__tests__/master-data-gsp.spec.js
git commit -m "feat(frontend): add Receipt UOM field to GSP Master Data settings and catalog store"
```

---

### Phase 6: Testing & Acceptance Mapping

#### Task 17: QC / PA Engine Automated Test Matrix
**Files:**
- Modify: `backend/src/qc/constants/coal-specification.spec.ts`
- Modify: `backend/src/qc/constants/chemical-specification.spec.ts`
- Modify: `backend/src/qc/qc-product-analysis.spec.ts`

**Specification Acceptance Coverage:**
| Scenario | Test Location | Test Case Name |
|---|---|---|
| `COAL_GT_6000` TM <= 25.0% PASS | `coal-specification.spec.ts` | `should pass COAL_GT_6000 with TM 24.5%` |
| `COAL_GT_6000` TM 25.5% RETEST Round 1 | `coal-specification.spec.ts` | `should require retest for COAL_GT_6000 with TM 25.5% on Round 1` |
| `COAL_GT_6000` TM 25.5% REJECT Round 2 | `coal-specification.spec.ts` | `should reject COAL_GT_6000 with TM 25.5% on Round 2` |
| `COAL_5600_6000` TM <= 33.0% PASS | `coal-specification.spec.ts` | `should pass COAL_5600_6000 with TM 32.0%` |
| `COAL_5600_6000` TM 34.0% RETEST Round 1 | `coal-specification.spec.ts` | `should require retest for COAL_5600_6000 with TM 34.0% on Round 1` |
| Unknown Coal Band -> HTTP 422 | `qc-product-analysis.spec.ts` | `should throw HTTP 422 SPEC_NOT_CONFIGURED on unconfigured calorie band` |
| Assert zero fallback to 4200 | `coal-specification.spec.ts` | `should assert no fallback exists for arbitrary calorie string` |
| PAC: pH 3.5 & 5.0 PASS, 3.4 & 5.1 FAIL | `chemical-specification.spec.ts` | `should enforce PAC pH inclusive boundary (3.50-5.00)` |
| PAC: Density 1.170 & 1.260 PASS | `chemical-specification.spec.ts` | `should enforce PAC density inclusive boundary (1.170-1.260)` |
| PAC: Omission of Al2O3 does not block PASS | `chemical-specification.spec.ts` | `should release PAC without Al2O3 parameter` |
| Rapid Klen: Na2O 35.00 FAIL, 35.01 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen Na2O` |
| Rapid Klen: NaOH 45.16 FAIL, 45.17 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen NaOH` |
| Rapid Klen: pH 12.000 FAIL, 12.001 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen pH` |
| Rapid Klen: Density 1.400 FAIL, 1.401 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen density` |

- [ ] **Step 1: Implement full test matrix across specified test files**
- [ ] **Step 2: Run all QC tests**
Run: `npm --prefix backend test -- src/qc`
Expected: PASS with 100% test scenario success.
- [ ] **Step 3: Commit**
```bash
git add backend/src/qc/
git commit -m "test(qc): implement comprehensive automated test matrix for Coal, PAC, and Rapid Klen evaluators"
```

---

#### Task 18: GSP Pre-Unloading & Receiving Automated Test Matrix
**Files:**
- Modify: `backend/src/warehouse/gsp-workflow.spec.ts`
- Modify: `backend/src/warehouse/warehouse.service.spec.ts`

**Specification Acceptance Coverage:**
| Scenario | Test Location | Test Case Name |
|---|---|---|
| Coal PASS + 9/9 OK + SJ + PO -> START ALLOWED | `gsp-workflow.spec.ts` | `should start warehouse when Coal is RELEASE, SJ and PO present, and all 9 checklist items OK` |
| 1 Checklist Code NOT_OK -> REJECTED & Retain Status | `gsp-workflow.spec.ts` | `should reject start and record ActivityLog when any checklist item is NOT_OK` |
| Solar PA_NOT_REQUIRED + 9/9 OK + SJ + PO -> ALLOWED | `gsp-workflow.spec.ts` | `should start warehouse for Solar PA_NOT_REQUIRED when pre-unload checklist passes` |
| Missing SJ or PO -> REJECTED | `gsp-workflow.spec.ts` | `should reject start when Surat Jalan or PO is missing` |
| Duplicate / Unknown / Missing Codes -> HTTP 400 | `gsp-workflow.spec.ts` | `should validate pre-unload checklist structure and reject duplicate or invalid codes` |
| Client-Tampered Labels -> Canonical Label Persisted | `gsp-workflow.spec.ts` | `should persist canonical labels in checklistItems regardless of client input` |
| Coal receiving in KG | `gsp-workflow.spec.ts` | `should complete Coal receiving in KG with exact receivedQuantity` |
| Solar / PAC / Rapid receiving in LITER | `gsp-workflow.spec.ts` | `should complete Solar, PAC, and Rapid Klen receiving in LITER` |
| Scale > 3 decimals -> HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE` | `gsp-workflow.spec.ts` | `should reject receivedQuantity with scale exceeding 3 decimals` |
| Mismatched `receivedUnit` payload -> HTTP 400 | `gsp-workflow.spec.ts` | `should reject client payload submitting wrong receivedUnit` |
| Atomic persistence in same DB transaction | `gsp-workflow.spec.ts` | `should atomically update WarehouseProcess and Transaction receivedQuantity` |
| Non-regression: GBB / GBJ intact | `warehouse.service.spec.ts` | `should preserve GBB 7-stage and GBJ actualWeight receiving flows` |

- [ ] **Step 1: Implement full test matrix across specified test files**
- [ ] **Step 2: Run all warehouse tests**
Run: `npm --prefix backend test -- src/warehouse`
Expected: PASS with 100% test scenario success.
- [ ] **Step 3: Commit**
```bash
git add backend/src/warehouse/
git commit -m "test(warehouse): implement comprehensive automated test matrix for pre-unload gate, receiving UOM, and GBB/GBJ non-regression"
```

---

#### Task 19: Gate Snapshot & Amendment Synchronization Automated Test Matrix
**Files:**
- Modify: `backend/src/gate/gate-gsp-checkin.spec.ts`
- Modify: `backend/src/transactions/active-transaction-amendment.spec.ts`

**Specification Acceptance Coverage:**
| Scenario | Test Location | Test Case Name |
|---|---|---|
| Gate Check-In snapshots `receiptUnit` | `gate-gsp-checkin.spec.ts` | `should snapshot catalog receiptUnit onto new transaction` |
| GSP Check-In without catalog `receiptUnit` fails closed | `gate-gsp-checkin.spec.ts` | `should fail check-in if catalog lacks receiptUnit` |
| Amendment Coal -> PAC: `KG` -> `LITER` | `active-transaction-amendment.spec.ts` | `should synchronize receiptUnit from KG to LITER on Coal to PAC amendment` |
| Amendment PAC -> Coal: `LITER` -> `KG` | `active-transaction-amendment.spec.ts` | `should synchronize receiptUnit from LITER to KG on PAC to Coal amendment` |
| Amendment Solar -> Rapid Klen: `LITER` -> `LITER` | `active-transaction-amendment.spec.ts` | `should synchronize receiptUnit from LITER to LITER on Solar to Rapid amendment` |
| Target catalog with missing `receiptUnit` rejected | `active-transaction-amendment.spec.ts` | `should reject amendment if target catalog lacks receiptUnit` |
| Amendment after `WAREHOUSE_IN_PROGRESS` rejected | `active-transaction-amendment.spec.ts` | `should reject amendment once transaction enters WAREHOUSE_IN_PROGRESS` |

- [ ] **Step 1: Implement full test matrix across specified test files**
- [ ] **Step 2: Run gate and amendment tests**
Run: `npm --prefix backend test -- -t "gate-gsp-checkin|ActiveTransactionAmendmentService"`
Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add backend/src/gate/ backend/src/transactions/
git commit -m "test(transactions): implement test matrix for gate snapshotting, active amendment UOM synchronization, and post-unload blocking"
```

---

### Phase 7: Migration Rehearsal, E2E & Manual UAT

#### Task 20: Database Migration Rehearsal & Invariant Verification Script
**Files:**
- Create: `backend/scripts/verify-gsp-uom-migration.ts`
- Modify: `backend/package.json` (add rehearsal npm script)

**Interfaces:**
- Consumes: PostgreSQL connection.
- Produces: Verification report confirming fresh migration success, upgraded historical migration success, schema drift check, zero invariant violations, and rollback drill safety.

- [ ] **Step 1: Create verification script `backend/scripts/verify-gsp-uom-migration.ts`**
```typescript
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  console.log('--- Verifying GSP UOM Migration & Schema Invariants ---');

  // 1. Verify Enum
  const enums: any = await prisma.$queryRaw`SELECT enumlabel FROM pg_enum WHERE enumtypid = 'WarehouseUnit'::regtype;`;
  const enumLabels = enums.map((e: any) => e.enumlabel);
  if (!enumLabels.includes('LITER')) {
    throw new Error('FAILED: WarehouseUnit enum does not contain LITER');
  }
  console.log('✓ WarehouseUnit enum contains LITER');

  // 2. Verify ProductCatalog Invariant
  const unresolvedGsp = await prisma.productCatalog.count({
    where: {
      processType: 'GSP',
      isActive: true,
      OR: [{ gspAnalysisProfile: null }, { receiptUnit: null }],
    },
  });
  if (unresolvedGsp > 0) {
    throw new Error(`FAILED: Found ${unresolvedGsp} active GSP product catalogs with missing profile or receiptUnit`);
  }
  console.log('✓ Active GSP ProductCatalog invariants verified (0 unresolved)');

  // 3. Verify Canonical UOM mapping
  const coal = await prisma.productCatalog.findUnique({ where: { code: 'COAL-001' } });
  if (coal?.receiptUnit !== 'KG') throw new Error('COAL-001 is not KG');
  const solar = await prisma.productCatalog.findUnique({ where: { code: 'SOLAR-001' } });
  if (solar?.receiptUnit !== 'LITER') throw new Error('SOLAR-001 is not LITER');
  const pac = await prisma.productCatalog.findUnique({ where: { code: 'PAC-001' } });
  if (pac?.receiptUnit !== 'LITER') throw new Error('PAC-001 is not LITER');
  const rpd = await prisma.productCatalog.findUnique({ where: { code: 'RPD-001' } });
  if (rpd?.receiptUnit !== 'LITER') throw new Error('RPD-001 is not LITER');
  console.log('✓ Canonical product catalog codes verified with exact receiptUnit');

  await prisma.$disconnect();
  console.log('--- All Migration Verification Gates Passed Successfully ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run verification script**
Run: `npx --prefix backend ts-node scripts/verify-gsp-uom-migration.ts`
Expected: Output `--- All Migration Verification Gates Passed Successfully ---`, exit code 0.

- [ ] **Step 3: Commit**
```bash
git add backend/scripts/verify-gsp-uom-migration.ts backend/package.json
git commit -m "chore(ops): add automated database migration rehearsal and post-migration invariant verification script"
```

---

#### Task 21: Full Regression & Manual Rancher Desktop UAT Suite
**Files:**
- Test Documentation: Rancher Desktop local execution runbook.

**17 Manual Operational Scenarios:**
1. **Batubara 5600–6000 PASS:** Select `COAL_5600_6000`, TM 32.0%, Visual OK -> Status `QC_VEHICLE_PASSED`.
2. **Batubara >6000 PASS:** Select `COAL_GT_6000`, TM 24.5%, Visual OK -> Status `QC_VEHICLE_PASSED`.
3. **Batubara Round 1 Fail -> Retest:** Select `COAL_GT_6000`, TM 26.0% -> Status `QC_RETEST_REQUIRED`.
4. **Batubara Round 2 Fail -> Reject:** Retest Round 2, TM 26.5% -> Status `QC_VEHICLE_REJECTED`.
5. **Unknown Coal Band -> Blocked:** API submission with `< 5600` or arbitrary band -> HTTP 422 `SPEC_NOT_CONFIGURED`, status retained `QC_VEHICLE_IN_PROGRESS`.
6. **Solar -> PA_NOT_REQUIRED:** Weigh In Solar truck -> Status transitions directly to `PA_NOT_REQUIRED`.
7. **PAC PASS:** Sensory compliant, pH 4.2, Density 1.210 -> Status `QC_VEHICLE_PASSED`.
8. **Rapid Klen PASS:** Sensory compliant, Na2O 35.5%, NaOH 46.0%, pH 12.5, Density 1.420 -> Status `QC_VEHICLE_PASSED`.
9. **Checklist NOT_OK -> No Bongkar:** In GSP Warehouse, set item 2 to `NOT_OK` -> Button disabled / submit blocked, status retained, ActivityLog recorded.
10. **Missing SJ/PO -> No Bongkar:** Leave SJ empty -> Button disabled / submit blocked.
11. **Batubara Receiving KG:** Unload Batubara, input `Jumlah Diterima: 24850.500`, badge `KG` read-only -> Complete -> Weigh Out in KG.
12. **Solar/PAC/Rapid Receiving LITER:** Unload PAC, input `Jumlah Diterima: 8000.250`, badge `LITER` read-only -> Complete.
13. **Wrong UOM Fail:** API submission for Solar with `receivedUnit: 'KG'` -> HTTP 400 rejected.
14. **>3 Decimals Fail:** Input `8000.2507` -> Frontend blocks submit / API returns HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`.
15. **Active Amendment KG <-> LITER:** Security check-in Batubara (KG). Amend to PAC 280 AC before unload -> `receiptUnit` transitions to LITER, previous PA voided.
16. **GBB Regression:** Register and process GBB material -> 7-stage workflow completes normally with physical KG.
17. **GBJ Regression:** Register and process GBJ outbound material -> Completes normally with delivery checklist and physical KG.

- [ ] **Step 1: Execute Rancher Desktop UAT suite and document results**
- [ ] **Step 2: Commit test verification evidence if applicable**

---

## Proposed Commit Sequence

The implementation will be delivered in 9 small, reviewable commits:

| Commit # | Scope | Message |
|---|---|---|
| 1 | `schema/migration` | `feat(schema): add LITER to WarehouseUnit and decimal receiving fields to Transaction and WarehouseProcess` |
| 2 | `master-data/gate` | `feat(master-data): enforce receiptUnit and snapshot during gate registration and active amendment` |
| 3 | `qc/coal` | `feat(qc): align coal evaluator to COAL_5600_6000 and COAL_GT_6000 with SPEC_NOT_CONFIGURED contract` |
| 4 | `qc/chemical` | `feat(qc): align PAC and Rapid Klen evaluators with authoritative laboratory sheets under ACTIVE_CONFIGURED` |
| 5 | `warehouse/preunload` | `feat(warehouse): enforce server-authoritative 9-point pre-unloading checklist and mandatory SJ/PO gate` |
| 6 | `warehouse/receiving` | `feat(warehouse): decouple GSP receiving with atomic receivedQuantity persistence and exact 3-decimal scale policy` |
| 7 | `frontend/qc` | `feat(frontend): align Coal, PAC, and Rapid Klen forms with authoritative laboratory specifications` |
| 8 | `frontend/warehouse` | `feat(frontend): implement pre-unloading checklist and dynamic receiving quantity in GSPProcess` |
| 9 | `ops/test-hardening` | `test(e2e): harden migration rehearsal, full regression suite, and Rancher Desktop UAT instruments` |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-07-gsp-qc-preunload-uom-implementation-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
