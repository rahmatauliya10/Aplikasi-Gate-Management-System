# GSP QC/PA Form Alignment, Pre-Unloading Checklist & Material-Specific Receiving UOM Implementation Plan (Rev 2.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align GSP QC/PA forms strictly with authoritative laboratory analysis sheets under `ACTIVE_CONFIGURED` governance, implement a server-authoritative 9-point Pre-Unloading verification gate with complete fail-closed audit trails, decouple physical weighbridge weight (KG) from commercial received quantity (Batubara = KG, Solar/PAC/Rapid Klen = LITER), enforce a string-based decimal-safe receiving contract (`Decimal(12, 3)`) with strict scale <= 3 rejection and zero silent rounding, synchronize receiving UOM during active transaction amendment, wire resilient raw-SQL migration and canonical seed invariant verifiers into real CI workflows and production Docker migrator paths, and secure fresh and upgraded database environments with idempotent migrations and seed updates.

**Architecture:**
1. **Schema, Migration & Seed:** Add `LITER` to `WarehouseUnit` enum using PostgreSQL 15 idempotent DDL (`ALTER TYPE "WarehouseUnit" ADD VALUE IF NOT EXISTS 'LITER';`). Add `receiptUnit` to `ProductCatalog` and `Transaction`, and add `receivedQuantity Decimal(12,3)` and `receivedUnit` to `WarehouseProcess` and `Transaction`. Update `backend/prisma/seed.ts` (both `create` and `update` blocks) to seed canonical codes with exact UOMs (`COAL-001`=KG, `SOLAR-001`=LITER, `PAC-001..003`=LITER, `RPD-001..002`=LITER). Enforce canonical UOM mapping in `ProductCatalogService` (`GSP_RECEIPT_UNIT_MISMATCH` on mismatch).
2. **QC / PA Governance & Evaluators:** Migrate specification governance metadata model from legacy `approvalStatus` (`APPROVED | PENDING_SIGNOFF | TEST_FIXTURE`) to neutral `ruleStatus: 'ACTIVE_CONFIGURED' | 'TEST_FIXTURE'` across `coal-specification.ts`, `chemical-specification.ts`, and `specification.provider.ts`. Operational Coal, PAC, and Rapid Klen use `ACTIVE_CONFIGURED` without artificial `PENDING_SIGNOFF` blockers while preserving strict dual-flag test fixture isolation (`ENABLE_TEST_SPEC_FIXTURES === 'true'` AND `GMS_TEST_HARNESS === 'true'`). In `qc-product-analysis.service.ts`, remove the legacy `approvalStatus !== 'APPROVED'` blocker, replace `checkSpecificationApprovalStatus` with `getSpecificationRuleStatus`, and allow compliant evaluations under `ACTIVE_CONFIGURED` to transition directly to `QC_VEHICLE_PASSED`. Remove hardcoded `PENDING_SIGNOFF` banners from frontend forms (`ChemicalPacForm.vue`, `ChemicalRapidKlenForm.vue`). Align Coal evaluator to factual visual parameters (`kondisi`, `warna`, `levelRank`, `kilap`, `bahanPengotor`) evaluated entirely on the backend, prohibiting client-supplied `visualPassed` overrides. Align Coal calorie bands to `COAL_5600_6000` (max TM 33%) and `COAL_GT_6000` (max TM 25%) via `parameters.calorieBand`, returning deterministic HTTP 422 `SPEC_NOT_CONFIGURED` on unknown bands without mutating state or creating fake reject records. Align PAC (pH 3.5–5.0, Density 1.170–1.260 inclusive, Al2O3 removed) and Rapid Klen (strict greater-than `>` limits for Na2O, NaOH, pH, Density).
3. **Pre-Unloading Gate & Audit Trail:** Introduce canonical constant `GSP-PREUNLOAD-2026.1` with 9 inspection items validated with `@IsIn(['OK', 'NOT_OK'])` and `@ArrayMinSize(9)` / `@ArrayMaxSize(9)`. Hard gate requires SJ and PO. Reconcile UX and backend audit: if all 9 are OK -> button "MULAI BONGKAR" transitions status to `WAREHOUSE_IN_PROGRESS` and persists canonical labels; if any item is NOT_OK -> button "SIMPAN HASIL PEMERIKSAAN" submits the inspection, backend logs `GSP_PREUNLOAD_CHECKLIST_FAILED` with failed codes/notes outside the transaction, blocks unloading, and preserves transaction status.
4. **Decoupled Receiving Contract:** Standardize receiving payload on decimal strings (e.g. `"8000.250"`) validated against positive decimal regex (max 9 integer digits, max 3 decimal digits, no exponents, no commas), converted to `new Prisma.Decimal(dto.receivedQuantity)` without silent rounding. Frontend renders read-only UOM badge without KG fallback (fails closed if missing). Wire calls to existing `warehouseStore.startProcess` and `warehouseStore.completeProcess`.
5. **Real Production Migrator & CI Release Gate Wiring:** Wire Gate A (`verify-migration-invariants.js`) directly into the production `migrator` container CMD in `backend/Dockerfile` (`npx prisma migrate deploy && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js`) and into real GitHub Actions workflows (`.github/workflows/ci.yml`). In local prepare tooling, enforce deterministic ordering: `prisma:preflight` -> `prisma migrate deploy` -> `prisma generate` -> `verify-migration-invariants` -> `enforce-audit-immutability`. Implement Gate A with resilient raw SQL queries so it cannot fail due to stale generated client caches. Enforce Gate B (`verify-canonical-seed.js`) after seed execution in full-stack staging. Incorporate an explicit negative rehearsal proving an invariant violation fails the migrator and blocks backend startup.

**Tech Stack:** NestJS, TypeScript, Jest, PostgreSQL 15, Prisma ORM, Vue 3, Vite, Vitest, Pinia, Tailwind CSS, Docker, GitHub Actions.

## Global Constraints
- Target Branch: Work strictly on dedicated branch `fix/gsp-process-audit-improvements` (PR #27). PR #27 remains **OPEN** (`merged = false`).
- Baseline Spec: `docs/superpowers/specs/2026-10-07-gsp-qc-preunload-uom-design.md` (Rev 2.1, SHA `058202013792852fc567d6e2938b61d73e43afae`).
- Zero Application Code Touch Prior to Implementation Plan Approval: Plan-only delivery.
- Zero Production Deployment / Merge: All execution is local and Rancher Desktop UAT only.
- Decimal-Safe Contract: Received quantity payload uses positive decimal string (max 9 integer digits, max 3 decimal digits). Scale >3 strictly rejected with HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`. Scientific notation rejected with HTTP 400 `INVALID_RECEIVED_QUANTITY`. Silent rounding is prohibited.
- Receiving Separation: Physical weighbridge gross/tare/net remain strictly in KG; GSP receiving uses `receivedQuantity` and `receiptUnit`. Legacy fields (`actualWeight`, `actualQuantity`, `warehouseUnit`) are never used for GSP.
- Fail-Closed Frontend: Never default missing GSP `receiptUnit` to `KG`. If `receiptUnit` is null, show `"Receipt UOM belum terkonfigurasi"` and disable completion.
- Existing Store/Service Contracts: Use `warehouseStore.startProcess` / `warehouseStore.completeProcess` and existing Pinia store patterns. No artificial component props or unrequested method renames.
- GBB / GBJ Protection: Non-GSP processes remain 100% untouched.
- Zero Utility Reintroduction: No Utility role, no fake signoffs, no deviation overrides.

---

## Migration, Backfill & Release Gate Strategy

### 1. Proposed Migration
- **Name:** `20261008000000_add_gsp_uom_and_receiving_quantity`
- **Location:** `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql`
- **DDL Execution (PostgreSQL 15 Idempotent):**
  ```sql
  -- 1. Extend WarehouseUnit Enum directly
  ALTER TYPE "WarehouseUnit" ADD VALUE IF NOT EXISTS 'LITER';

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
  ```

### 2. Separation of Verification Gates
- **Gate A: Migration Invariant Check (`backend/scripts/verify-migration-invariants.js`):**
  - Run immediately after `prisma migrate deploy` in:
    1. Local prepare scripts (`db:prepare:local`)
    2. Production prepare scripts (`db:prepare:prod`)
    3. Production Docker migrator CMD (`backend/Dockerfile`)
    4. Real CI workflow jobs (`backend-verification`, `historical-migration-rehearsal-gate`, `production-compose-quality-gate`)
  - **Raw SQL Resilience:** Implemented using raw SQL (`prisma.$queryRawUnsafe` or `pg`) to eliminate dependency on a freshly regenerated Prisma Client:
    1. Enum value `LITER` exists in `"WarehouseUnit"`:
       ```sql
       SELECT enumlabel FROM pg_enum WHERE enumtypid = 'WarehouseUnit'::regtype;
       ```
    2. Zero active GSP catalogs have missing profile or missing `receiptUnit`:
       ```sql
       SELECT count(*) AS count FROM "ProductCatalog"
       WHERE "processType" = 'GSP'
         AND "isActive" = true
         AND ("gspAnalysisProfile" IS NULL OR "receiptUnit" IS NULL);
       ```
    3. Safe on historical/test databases that predate canonical seed records (returns 0 unresolved records if no active GSP products exist).
- **Gate B: Canonical Seed Verification (`backend/scripts/verify-canonical-seed.js`):**
  - Run immediately after `prisma db seed` / `seed.js` in fresh setups and seeded staging.
  - Asserts exact canonical codes exist and match exact UOMs:
    - `COAL-001` = `KG`
    - `SOLAR-001` = `LITER`
    - `PAC-001..003` = `LITER`
    - `RPD-001..002` = `LITER`

### 3. Real Release Gate Pipeline & Container Wiring
1. **Local & Production Prepare Scripts (`backend/package.json`):**
   - Corrected Deterministic Ordering:
     ```json
     "db:prepare:local": "npm run prisma:preflight && npx prisma migrate deploy && npx prisma generate && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js",
     "db:prepare:prod": "npm run db:verify:checksums && npm run db:backup:pre-deploy && npm run prisma:preflight && npx prisma migrate deploy && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js",
     "verify:migration-invariants": "node scripts/verify-migration-invariants.js",
     "seed:verify": "node scripts/verify-canonical-seed.js"
     ```
   - *Note on `prisma generate`:* In local tooling, `npx prisma generate` is run immediately after `prisma migrate deploy` and before any typed ORM access, while Gate A also uses raw SQL for absolute runtime safety.

2. **Production Migrator Image (`backend/Dockerfile`):**
   - In Stage 2 (`migrator`), update the default container CMD:
     ```dockerfile
     CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js"]
     ```
   - The migrator image already carries full builder `node_modules` (including Prisma CLI and client runtime). If migration invariants fail, the migrator exits non-zero, preventing the production backend container (`depends_on: migrator: condition: service_completed_successfully`) from booting.

3. **Real CI Workflows (`.github/workflows/ci.yml`):**
   - **`backend-verification` (Fresh & Upgraded Matrix):**
     Immediately after `npx prisma migrate deploy`:
     ```bash
     node scripts/verify-migration-invariants.js
     ```
     This check is blocking.
   - **`historical-migration-rehearsal-gate`:**
     Immediately after rehearsal DB migration deploy (Step 4):
     ```bash
     DATABASE_URL="postgres://postgres:testpassword@localhost:5432/gms_rehearsal_db?schema=public" node scripts/verify-migration-invariants.js
     ```
     Validates schema invariants on the upgraded historical database without requiring canonical seed records.
   - **`production-compose-quality-gate` (Step 4E):**
     Rehearses the exact production migrator container path:
     ```bash
     docker compose -f docker-compose.prod.yml run --rm migrator node scripts/verify-migration-invariants.js
     ```
     Executed between `npx prisma migrate deploy` and `node scripts/enforce-audit-immutability.js`.
   - **`fullstack-staging-gate`:**
     Immediately after seeding (`backend node dist/prisma/seed.js`):
     ```bash
     docker compose -f docker-compose.yml exec -T backend node scripts/verify-canonical-seed.js
     ```
     Asserts all 7 canonical products exist with exact UOM mapping.
   - All existing checksum gates, drift gates, backup gates, restore DR drills, rollback drills, compose gates, SBOM, and Trivy security gates remain strictly preserved.

---

## Complete File Inventory

### Backend
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql` (new)
- `backend/src/product-catalog/constants/canonical-gsp-uom.ts` (new)
- `backend/src/product-catalog/dto/create-product-catalog.dto.ts`
- `backend/src/product-catalog/dto/update-product-catalog.dto.ts`
- `backend/src/product-catalog/product-catalog.service.ts`
- `backend/src/product-catalog/product-catalog.service.spec.ts`
- `backend/src/gate/gate.service.ts`
- `backend/src/gate/gate-gsp-checkin.spec.ts`
- `backend/src/transactions/active-transaction-amendment.service.ts`
- `backend/src/transactions/active-transaction-amendment.spec.ts`
- `backend/src/qc/constants/coal-specification.ts`
- `backend/src/qc/constants/coal-specification.spec.ts`
- `backend/src/qc/constants/chemical-specification.ts`
- `backend/src/qc/constants/chemical-specification.spec.ts`
- `backend/src/qc/providers/specification.provider.ts`
- `backend/src/qc/providers/specification.provider.spec.ts`
- `backend/src/qc/dto/submit-product-analysis.dto.ts`
- `backend/src/qc/qc-product-analysis.service.ts`
- `backend/src/qc/qc-product-analysis.spec.ts`
- `backend/src/warehouse/constants/gsp-preunload-checklist.ts` (new)
- `backend/src/warehouse/dto/start-warehouse.dto.ts`
- `backend/src/warehouse/dto/complete-warehouse.dto.ts`
- `backend/src/warehouse/warehouse.service.ts`
- `backend/src/warehouse/gsp-workflow.spec.ts`
- `backend/src/warehouse/warehouse.service.spec.ts`
- `backend/scripts/verify-migration-invariants.js` (new)
- `backend/scripts/verify-canonical-seed.js` (new)
- `backend/scripts/verify-baseline-master-upgrade-drill.ts`
- `backend/Dockerfile`
- `backend/package.json`

### Operations / CI
- `.github/workflows/ci.yml`

### Frontend
- `frontend/src/components/qc/CoalAnalysisForm.vue`
- `frontend/src/components/qc/ChemicalPacForm.vue`
- `frontend/src/components/qc/ChemicalRapidKlenForm.vue`
- `frontend/src/components/MasterDataModal.vue`
- `frontend/src/stores/masterDataStore.js`
- `frontend/src/stores/warehouseStore.js`
- `frontend/src/services/warehouseService.js`
- `frontend/src/views/GSPProcess.vue`
- `frontend/src/__tests__/qc-pa-forms.spec.js`
- `frontend/src/__tests__/qc-no-utility-flow.spec.js`
- `frontend/src/__tests__/gsp-process.spec.js` (new)
- `frontend/src/__tests__/master-data-gsp.spec.js` (new)

---

## Detailed Task Specifications

### Phase 1: Schema / Migration / Master Data & Seed

#### Task 1: Prisma Schema Extension & PostgreSQL Migration
**Files:**
- Modify: `backend/prisma/schema.prisma:43-49, 230-245, 320-335, 620-630`
- Create: `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql`

**Interfaces:**
- Consumes: PostgreSQL enum `WarehouseUnit`, models `ProductCatalog`, `Transaction`, `WarehouseProcess`.
- Produces: `WarehouseUnit.LITER`, `ProductCatalog.receiptUnit`, `Transaction.receiptUnit`, `Transaction.receivedQuantity`, `WarehouseProcess.receivedQuantity`, `WarehouseProcess.receivedUnit`.

- [ ] **Step 1: Write migration SQL script**
Create `backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql` using PostgreSQL 15 idempotent DDL:
```sql
ALTER TYPE "WarehouseUnit" ADD VALUE IF NOT EXISTS 'LITER';

ALTER TABLE "ProductCatalog" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receiptUnit" "WarehouseUnit";
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedQuantity" DECIMAL(12, 3);
ALTER TABLE "WarehouseProcess" ADD COLUMN IF NOT EXISTS "receivedUnit" "WarehouseUnit";

UPDATE "ProductCatalog" SET "receiptUnit" = 'KG' WHERE code = 'COAL-001';
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code = 'SOLAR-001';
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code IN ('PAC-001', 'PAC-002', 'PAC-003');
UPDATE "ProductCatalog" SET "receiptUnit" = 'LITER' WHERE code IN ('RPD-001', 'RPD-002');

UPDATE "Transaction" t
SET "receiptUnit" = pc."receiptUnit"
FROM "ProductCatalog" pc
WHERE t."productCatalogId" = pc.id
  AND t."processType" = 'GSP'
  AND t."status" NOT IN ('COMPLETED', 'CANCELLED')
  AND pc."receiptUnit" IS NOT NULL
  AND t."receiptUnit" IS NULL;
```

- [ ] **Step 2: Update `backend/prisma/schema.prisma`**
Add `LITER` to `enum WarehouseUnit`.
Add `receiptUnit WarehouseUnit?` to `model ProductCatalog`.
Add `receiptUnit WarehouseUnit?` and `receivedQuantity Decimal? @db.Decimal(12, 3)` to `model Transaction`.
Add `receivedQuantity Decimal? @db.Decimal(12, 3)` and `receivedUnit WarehouseUnit?` to `model WarehouseProcess`.

- [ ] **Step 3: Run migration rehearsal against local database**
Run: `npm --prefix backend run rebuild:local`
Expected: Migration executes successfully, Prisma client regenerates with new types.

- [ ] **Step 4: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20261008000000_add_gsp_uom_and_receiving_quantity/migration.sql
git commit -m "feat(schema): add LITER to WarehouseUnit and decimal receiving fields to Transaction and WarehouseProcess"
```

---

#### Task 2: GSP Seed Update with Exact Canonical UOM Mapping (`seed.ts`)
**Files:**
- Modify: `backend/prisma/seed.ts:300-395`
- Test: `backend/scripts/verify-canonical-seed.js` (executed via npm)

**Interfaces:**
- Consumes: PrismaClient, seed runner.
- Produces: Idempotent seeding where both `create` AND `update` blocks persist exact `receiptUnit` for all 7 canonical GSP products (`COAL-001`=KG, `SOLAR-001`=LITER, `PAC-001..003`=LITER, `RPD-001..002`=LITER).

- [ ] **Step 1: Write failing test / check in `backend/scripts/verify-canonical-seed.js`**
```javascript
const { PrismaClient } = require('@prisma/client');

async function verifyCanonicalSeed() {
  const prisma = new PrismaClient();
  const canonicals = [
    { code: 'COAL-001', expectedUom: 'KG' },
    { code: 'SOLAR-001', expectedUom: 'LITER' },
    { code: 'PAC-001', expectedUom: 'LITER' },
    { code: 'PAC-002', expectedUom: 'LITER' },
    { code: 'PAC-003', expectedUom: 'LITER' },
    { code: 'RPD-001', expectedUom: 'LITER' },
    { code: 'RPD-002', expectedUom: 'LITER' },
  ];

  for (const c of canonicals) {
    const prod = await prisma.productCatalog.findUnique({ where: { code: c.code } });
    if (!prod) throw new Error(`Missing canonical seed product: ${c.code}`);
    if (prod.receiptUnit !== c.expectedUom) {
      throw new Error(`Invalid receiptUnit for ${c.code}: expected ${c.expectedUom}, got ${prod.receiptUnit}`);
    }
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  verifyCanonicalSeed()
    .then(() => {
      console.log('✓ Canonical seed verified');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { verifyCanonicalSeed };
```

- [ ] **Step 2: Update `backend/prisma/seed.ts`**
In `gspProducts` definition in `seed.ts`:
Add `receiptUnit: 'KG' as const` for `COAL-001`.
Add `receiptUnit: 'LITER' as const` for `SOLAR-001`, `PAC-001`, `PAC-002`, `PAC-003`, `RPD-001`, `RPD-002`.
In `prisma.productCatalog.upsert`:
Include `receiptUnit: prod.receiptUnit` in **both** `update` and `create` blocks:
```typescript
await prisma.productCatalog.upsert({
  where: { code: prod.code },
  update: {
    name: prod.name,
    category: prod.category,
    subCategory: prod.subCategory,
    gspAnalysisProfile: prod.gspAnalysisProfile,
    receiptUnit: prod.receiptUnit, // ADDED TO UPDATE
    isPaRequired: prod.isPaRequired,
    policyVersion: prod.policyVersion,
    isActive: true,
  },
  create: {
    code: prod.code,
    name: prod.name,
    category: prod.category,
    subCategory: prod.subCategory,
    processType: prod.processType,
    gspAnalysisProfile: prod.gspAnalysisProfile,
    receiptUnit: prod.receiptUnit, // ADDED TO CREATE
    isPaRequired: prod.isPaRequired,
    policyVersion: prod.policyVersion,
    isActive: true,
  },
});
```

- [ ] **Step 3: Run seed and verify**
Run: `npm --prefix backend run seed && npx --prefix backend ts-node scripts/verify-canonical-seed.ts`
Expected: Output `Canonical seed verification passed: all 7 products match exact receiptUnit`.

- [ ] **Step 4: Commit**
```bash
git add backend/prisma/seed.ts backend/scripts/verify-canonical-seed.ts
git commit -m "feat(seed): update canonical GSP product catalog seeds with receiptUnit in create and update blocks"
```

---

#### Task 3: Canonical Receipt UOM Constant & Master Data Validation
**Files:**
- Create: `backend/src/product-catalog/constants/canonical-gsp-uom.ts`
- Modify: `backend/src/product-catalog/dto/create-product-catalog.dto.ts`
- Modify: `backend/src/product-catalog/dto/update-product-catalog.dto.ts`
- Modify: `backend/src/product-catalog/product-catalog.service.ts`
- Test: `backend/src/product-catalog/product-catalog.service.spec.ts`

**Interfaces:**
- Consumes: `CreateProductCatalogDto`, `UpdateProductCatalogDto`.
- Produces: `CANONICAL_GSP_RECEIPT_UNITS` mapping constant. Throws `MISSING_GSP_RECEIPT_UNIT` if active GSP product lacks UOM; throws `GSP_RECEIPT_UNIT_MISMATCH` if known canonical code is passed with mismatched UOM.

- [ ] **Step 1: Create `backend/src/product-catalog/constants/canonical-gsp-uom.ts`**
```typescript
import { WarehouseUnit } from '@prisma/client';

export const CANONICAL_GSP_RECEIPT_UNITS: Record<string, WarehouseUnit> = {
  'COAL-001': WarehouseUnit.KG,
  'SOLAR-001': WarehouseUnit.LITER,
  'PAC-001': WarehouseUnit.LITER,
  'PAC-002': WarehouseUnit.LITER,
  'PAC-003': WarehouseUnit.LITER,
  'RPD-001': WarehouseUnit.LITER,
  'RPD-002': WarehouseUnit.LITER,
};

export function assertCanonicalGspUomMapping(code: string, receiptUnit: WarehouseUnit): void {
  const expected = CANONICAL_GSP_RECEIPT_UNITS[code.trim().toUpperCase()];
  if (expected && expected !== receiptUnit) {
    throw new BadRequestException({
      success: false,
      message: `Kode produk canonical '${code}' wajib menggunakan satuan '${expected}', bukan '${receiptUnit}'.`,
      errors: ['GSP_RECEIPT_UNIT_MISMATCH'],
    });
  }
}
```

- [ ] **Step 2: Write failing unit tests in `product-catalog.service.spec.ts`**
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
    } as any, mockAdminUser),
  ).rejects.toMatchObject({
    response: { errors: expect.arrayContaining(['MISSING_GSP_RECEIPT_UNIT']) },
  });
});

it('should reject saving canonical code with wrong UOM (e.g. COAL-001 with LITER) with GSP_RECEIPT_UNIT_MISMATCH', async () => {
  await expect(
    service.create({
      code: 'COAL-001',
      name: 'Batubara',
      category: 'Coal',
      processType: ProcessType.GSP,
      gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
      receiptUnit: WarehouseUnit.LITER, // MISMATCH
      isActive: true,
    } as any, mockAdminUser),
  ).rejects.toMatchObject({
    response: { errors: expect.arrayContaining(['GSP_RECEIPT_UNIT_MISMATCH']) },
  });
});
```

- [ ] **Step 3: Implement validation in DTOs and `product-catalog.service.ts`**
In DTOs: add `@IsOptional() @IsEnum(WarehouseUnit) receiptUnit?: WarehouseUnit | null;`.
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
    assertCanonicalGspUomMapping(targetCode, targetReceiptUnit);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm --prefix backend test -- src/product-catalog`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/product-catalog/
git commit -m "feat(product-catalog): add CANONICAL_GSP_RECEIPT_UNITS and enforce exact UOM mapping on canonical codes"
```

---

#### Task 4: Gate Registration Snapshot & Active Transaction Amendment Synchronization
**Files:**
- Modify: `backend/src/gate/gate.service.ts:145-225`
- Modify: `backend/src/transactions/active-transaction-amendment.service.ts:150-295`
- Test: `backend/src/gate/gate-gsp-checkin.spec.ts`
- Test: `backend/src/transactions/active-transaction-amendment.spec.ts`

**Interfaces:**
- Consumes: `ProductCatalog.receiptUnit`, `AmendActiveTransactionDto`.
- Produces: `Transaction.receiptUnit` snapshot at Gate Check-In; atomic `receiptUnit` replacement during amendment before warehouse start.

- [ ] **Step 1: Write failing tests in `gate-gsp-checkin.spec.ts` and `active-transaction-amendment.spec.ts`**
```typescript
// gate-gsp-checkin.spec.ts
it('should fail check-in if GSP catalog lacks receiptUnit with MISSING_GSP_RECEIPT_UNIT', async () => {
  mockCatalog.receiptUnit = null;
  await expect(gateService.checkIn(dto, mockUser)).rejects.toMatchObject({
    response: { errors: expect.arrayContaining(['MISSING_GSP_RECEIPT_UNIT']) },
  });
});

it('should snapshot receiptUnit from catalog to transaction on gate check-in', async () => {
  mockCatalog.receiptUnit = WarehouseUnit.LITER;
  const result = await gateService.checkIn(dto, mockUser);
  expect(result.receiptUnit).toBe(WarehouseUnit.LITER);
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
      receiptUnit: WarehouseUnit.LITER,
    }),
  }));
});
```

- [ ] **Step 2: Implement snapshotting and amendment synchronization**
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

- [ ] **Step 3: Run tests to verify they pass**
Run: `npm --prefix backend test -- -t "gate-gsp-checkin|ActiveTransactionAmendmentService"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/gate/ backend/src/transactions/
git commit -m "feat(transactions): snapshot receiptUnit at gate registration and synchronize during active amendment"
```

---

### Phase 2: QC / PA Evaluators & Governance

#### Task 5: QC Governance Metadata Model Migration to ACTIVE_CONFIGURED
**Files:**
- Modify: `backend/src/qc/constants/coal-specification.ts`
- Modify: `backend/src/qc/constants/coal-specification.spec.ts`
- Modify: `backend/src/qc/constants/chemical-specification.ts`
- Modify: `backend/src/qc/constants/chemical-specification.spec.ts`
- Modify: `backend/src/qc/providers/specification.provider.ts`
- Modify: `backend/src/qc/providers/specification.provider.spec.ts`

**Interfaces:**
- Consumes: Environment variables `ENABLE_TEST_SPEC_FIXTURES`, `GMS_TEST_HARNESS`.
- Produces: Neutral governance metadata model where legacy `approvalStatus` (`APPROVED | PENDING_SIGNOFF | TEST_FIXTURE`) is replaced with `ruleStatus: 'ACTIVE_CONFIGURED' | 'TEST_FIXTURE'`. Operational Coal, PAC, and Rapid Klen specifications use `ACTIVE_CONFIGURED`, eliminating artificial `PENDING_SIGNOFF` blockers while preserving strict dual-flag isolation for `TEST_FIXTURE`.

- [ ] **Step 1: Write failing unit tests in `specification.provider.spec.ts`, `coal-specification.spec.ts`, and `chemical-specification.spec.ts`**
```typescript
// specification.provider.spec.ts
it('returns operational ACTIVE_CONFIGURED when test fixture flags are false', () => {
  provider.setTestFixtureMode(true);
  process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
  process.env.GMS_TEST_HARNESS = 'false';

  const coalSpec = provider.getCoalSpec();
  expect(coalSpec.ruleStatus).toBe('ACTIVE_CONFIGURED');
  expect(coalSpec.approvedBy).toBeNull();
  expect(coalSpec.approvedAt).toBeNull();
  expect(provider.isTestFixtureActive()).toBe(false);

  const pacSpec = provider.getPacSpec();
  expect(pacSpec.ruleStatus).toBe('ACTIVE_CONFIGURED');

  const rkSpec = provider.getRapidKlenSpec();
  expect(rkSpec.ruleStatus).toBe('ACTIVE_CONFIGURED');
});

it('requires BOTH ENABLE_TEST_SPEC_FIXTURES and GMS_TEST_HARNESS to activate TEST_FIXTURE', () => {
  provider.setTestFixtureMode(true);
  process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
  process.env.GMS_TEST_HARNESS = 'true';

  const coalSpec = provider.getCoalSpec();
  expect(coalSpec.ruleStatus).toBe('TEST_FIXTURE');
  expect(provider.isTestFixtureActive()).toBe(true);
});
```

- [ ] **Step 2: Migrate metadata interfaces & constants in `coal-specification.ts` and `chemical-specification.ts`**
In `backend/src/qc/constants/coal-specification.ts`:
```typescript
export type SpecificationRuleStatus = 'ACTIVE_CONFIGURED' | 'TEST_FIXTURE';

export interface SpecificationMetadata {
  version: string;
  documentSource: string;
  ruleStatus: SpecificationRuleStatus;
  approvedBy: string | null; // Nullable historical field; strictly never controls release
  approvedAt: string | null;
  notes: string;
}

export const OPERATIONAL_COAL_SPEC_METADATA: SpecificationMetadata = {
  version: '2026.1-active',
  documentSource: 'Operational Lab Benchmark (Rev 2.1)',
  ruleStatus: 'ACTIVE_CONFIGURED',
  approvedBy: null,
  approvedAt: null,
  notes: 'Authoritative operational rule for boiler coal testing under Spec Rev 2.1.',
};

export const TEST_FIXTURE_COAL_SPEC_METADATA: SpecificationMetadata = {
  version: 'test-fixture-1.0',
  documentSource: 'Test Harness Fixture (Simulated Rule for Automated Test Execution)',
  ruleStatus: 'TEST_FIXTURE',
  approvedBy: 'QA_MOCK_LEAD',
  approvedAt: '2026-09-30T00:00:00.000Z',
  notes: 'Test fixture for deterministic unit test validation.',
};
```

In `backend/src/qc/constants/chemical-specification.ts`:
```typescript
export interface ChemicalSpecificationMetadata {
  version: string;
  documentSource: string;
  ruleStatus: SpecificationRuleStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  minOperator: 'GT' | 'GTE';
  notes: string;
}

export const OPERATIONAL_PAC_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: '2026.1-active',
  documentSource: 'Operational Lab Benchmark (Rev 2.1)',
  ruleStatus: 'ACTIVE_CONFIGURED',
  approvedBy: null,
  approvedAt: null,
  minOperator: 'GTE',
  notes: 'Authoritative operational rule for PAC chemical testing under Spec Rev 2.1.',
};

export const OPERATIONAL_RAPID_KLEN_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: '2026.1-active',
  documentSource: 'Operational Lab Benchmark (Rev 2.1 - Strict GT)',
  ruleStatus: 'ACTIVE_CONFIGURED',
  approvedBy: null,
  approvedAt: null,
  minOperator: 'GT',
  notes: 'Authoritative operational rule for Rapid Klen alkaline CIP under Spec Rev 2.1.',
};
```
Remove operational wording referring to "Awaiting Formal QA Signoff", "PENDING_SIGNOFF", "approved specification", and "teresahkan".

- [ ] **Step 3: Update `specification.provider.ts`**
Update provider to wire `OPERATIONAL_COAL_SPEC_METADATA`, `OPERATIONAL_PAC_SPEC_METADATA`, and `OPERATIONAL_RAPID_KLEN_SPEC_METADATA` under `ruleStatus: 'ACTIVE_CONFIGURED'`.
Maintain strict dual-flag isolation for test fixtures:
```typescript
isTestFixtureActive(): boolean {
  const fixturesRequested = process.env.ENABLE_TEST_SPEC_FIXTURES === 'true';
  const isTestHarness = process.env.GMS_TEST_HARNESS === 'true';

  if (!fixturesRequested || !isTestHarness) {
    return false;
  }
  return this.testFixtureMode && fixturesRequested && isTestHarness;
}
```

- [ ] **Step 4: Run provider tests to verify they pass**
Run: `npm --prefix backend test -- src/qc/providers/specification.provider.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/qc/constants/coal-specification.ts backend/src/qc/constants/chemical-specification.ts backend/src/qc/providers/
git commit -m "feat(qc): migrate governance metadata model to ACTIVE_CONFIGURED while preserving dual-flag fixture isolation"
```

---

#### Task 6: Coal Factual Visual & Calorie Band Evaluator Alignment (`coal-specification.ts`)
**Files:**
- Modify: `backend/src/qc/constants/coal-specification.ts`
- Test: `backend/src/qc/constants/coal-specification.spec.ts`

**Interfaces:**
- Consumes: `{ calorieBand: string, totalMoisture: number, testRound: number, visual: CoalVisualParameters }`.
- Produces: Evaluation result where visual compliance is calculated exclusively by the backend from factual fields; client `visualPassed=true` is ignored and rejected if factual fields fail. Under `ruleStatus: 'ACTIVE_CONFIGURED'`, compliant analysis produces `decision: 'RELEASE'`.

- [ ] **Step 1: Write failing unit tests in `coal-specification.spec.ts`**
```typescript
const validVisual = {
  kondisi: 'Kering (Tidak Basah)',
  warna: 'Hitam',
  levelRank: 'Medium Rank Coal',
  kilap: 'Hitam Mengkilap',
  bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
};

it('should evaluate COAL_5600_6000 with TM <= 33.0% and valid factual visual as PASS / RELEASE under ACTIVE_CONFIGURED', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_5600_6000', totalMoisture: 32.5, testRound: 1, visual: validVisual }, OPERATIONAL_COAL_SPEC_METADATA);
  expect(res.decision).toBe('RELEASE');
  expect(res.result).toBe('PASS');
});

it('should evaluate COAL_GT_6000 with TM <= 25.0% and valid factual visual as PASS / RELEASE under ACTIVE_CONFIGURED', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_GT_6000', totalMoisture: 24.8, testRound: 1, visual: validVisual }, OPERATIONAL_COAL_SPEC_METADATA);
  expect(res.decision).toBe('RELEASE');
  expect(res.result).toBe('PASS');
});

it('ADVERSARIAL: should REJECT if client passes visualPassed=true but factual visual parameter is non-compliant', () => {
  const badVisual = { ...validVisual, kondisi: 'Basah' };
  const res = evaluateCoalAnalysis({
    calorieBand: 'COAL_5600_6000',
    totalMoisture: 28.0,
    testRound: 1,
    visual: badVisual,
    visualPassed: true, // CLIENT ADVERSARIAL INJECTION
  } as any, OPERATIONAL_COAL_SPEC_METADATA);
  expect(res.result).toBe('REJECT');
  expect(res.decision).toBe('REJECT');
});

it('should return isConfigured=false and error=SPEC_NOT_CONFIGURED for unknown calorie band', () => {
  const res = evaluateCoalAnalysis({ calorieBand: 'COAL_4200', totalMoisture: 30.0, testRound: 1, visual: validVisual }, OPERATIONAL_COAL_SPEC_METADATA);
  expect(res.isConfigured).toBe(false);
  expect(res.error).toBe('SPEC_NOT_CONFIGURED');
});
```

- [ ] **Step 2: Implement Coal factual visual evaluator in `coal-specification.ts`**
Remove legacy GAR 3800, 4200, 4800, 5000, 5500 and default 4200 fallback.
Define factual visual validation:
```typescript
export interface CoalVisualParameters {
  kondisi: string;
  warna: string;
  levelRank: string;
  kilap: string;
  bahanPengotor: string;
}

export function validateCoalVisual(v: CoalVisualParameters): boolean {
  if (!v) return false;
  const isKondisiOk = v.kondisi === 'Kering (Tidak Basah)';
  const isWarnaOk = ['Hitam', 'Hitam Kecoklatan', 'Coklat'].includes(v.warna);
  const isRankOk = ['High Rank Coal', 'Medium Rank Coal', 'Low Rank Coal'].includes(v.levelRank);
  const isKilapOk = ['Hitam Mengkilap', 'Hitam Kecoklatan', 'Mudah Lapuk'].includes(v.kilap);
  const isPengotorOk = v.bahanPengotor === 'Tidak ada kontaminasi batuan maupun tanah';
  return isKondisiOk && isWarnaOk && isRankOk && isKilapOk && isPengotorOk;
}
```
In `evaluateCoalAnalysis`:
Calculate `visualPassed = validateCoalVisual(params.visual)`. Client-supplied `params.visualPassed` is strictly ignored.
Check `CONFIGURED_COAL_CALORIE_BANDS[params.calorieBand]`. If missing, return `{ isConfigured: false, error: 'SPEC_NOT_CONFIGURED' }`.
Under `ruleStatus: 'ACTIVE_CONFIGURED'`, compliant analysis produces `decision: 'RELEASE'`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- src/qc/constants/coal-specification.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/qc/constants/coal-specification.*
git commit -m "feat(qc): implement factual visual evaluation and calorie band contract for Coal with zero client override"
```

---

#### Task 7: PAC Chemical & Sensory Evaluator Alignment (`chemical-specification.ts`)
**Files:**
- Modify: `backend/src/qc/constants/chemical-specification.ts`
- Test: `backend/src/qc/constants/chemical-specification.spec.ts`

**Interfaces:**
- Consumes: `PacAnalysisParameters` (`{ sensory, ph, density }`).
- Produces: `ChemicalEvaluationResult` with inclusive boundaries (pH 3.5–5.0, Density 1.170–1.260), sensory matching operational sheet, and automated RELEASE under `ACTIVE_CONFIGURED` without requiring Al2O3.

- [ ] **Step 1: Write failing unit tests in `chemical-specification.spec.ts`**
```typescript
it('should evaluate PAC boundaries inclusively without requiring Al2O3 under ACTIVE_CONFIGURED', () => {
  const res1 = evaluatePacAnalysis({
    sensory: { visual: 'Kuning', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
    ph: 3.50,
    density: 1.170,
  }, 'PAC 280 AC', OPERATIONAL_PAC_SPEC_METADATA);
  expect(res1.decision).toBe('RELEASE');
  expect(res1.result).toBe('PASS');

  const res2 = evaluatePacAnalysis({
    sensory: { visual: 'Coklat Jernih', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
    ph: 5.00,
    density: 1.260,
  }, 'PAC 280 AC', OPERATIONAL_PAC_SPEC_METADATA);
  expect(res2.decision).toBe('RELEASE');
  expect(res2.result).toBe('PASS');
});

it('should fail PAC when pH or density are outside inclusive boundaries', () => {
  const resLowPh = evaluatePacAnalysis({ sensory: validSensory, ph: 3.49, density: 1.200 }, 'PAC 280 AC', OPERATIONAL_PAC_SPEC_METADATA);
  expect(resLowPh.result).toBe('REJECT');
  const resHighDens = evaluatePacAnalysis({ sensory: validSensory, ph: 4.00, density: 1.261 }, 'PAC 280 AC', OPERATIONAL_PAC_SPEC_METADATA);
  expect(resHighDens.result).toBe('REJECT');
});
```

- [ ] **Step 2: Update `chemical-specification.ts` for PAC**
Sensory parameters:
- `visual`: `'Kuning'` or `'Coklat Jernih'`
- `foreignMatters`: `'Tidak ada kontaminasi'`
- `packagingLabel`: `'Kemasan & label tidak rusak'`
Chemical parameters:
- `3.5 <= ph && ph <= 5.0`
- `1.170 <= density && density <= 1.260`
Remove mandatory Al2O3 validation.
Remove `PENDING_SIGNOFF` blocker; return `decision: 'RELEASE'` on compliant runs under `ruleStatus: 'ACTIVE_CONFIGURED'`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- src/qc/constants/chemical-specification.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/qc/constants/chemical-specification.*
git commit -m "feat(qc): align PAC evaluator to operational sensory options and inclusive boundaries under ACTIVE_CONFIGURED"
```

---

#### Task 8: Rapid Klen Chemical & Sensory Evaluator Alignment (`chemical-specification.ts`)
**Files:**
- Modify: `backend/src/qc/constants/chemical-specification.ts`
- Test: `backend/src/qc/constants/chemical-specification.spec.ts`

**Interfaces:**
- Consumes: `RapidKlenAnalysisParameters` (`{ sensory, alkalinityNa2O, alkalinityNaOH, ph, density }`).
- Produces: `ChemicalEvaluationResult` with strict greater-than (`>`) boundary enforcement.

- [ ] **Step 1: Write failing unit tests in `chemical-specification.spec.ts`**
```typescript
it('should enforce strict greater-than limits for Rapid Klen (exact boundary fails)', () => {
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.00, alkalinityNaOH: 45.17, ph: 12.001, density: 1.401 }, 'Rapid Klen', OPERATIONAL_RAPID_KLEN_SPEC_METADATA).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.16, ph: 12.001, density: 1.401 }, 'Rapid Klen', OPERATIONAL_RAPID_KLEN_SPEC_METADATA).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.000, density: 1.401 }, 'Rapid Klen', OPERATIONAL_RAPID_KLEN_SPEC_METADATA).result).toBe('REJECT');
  expect(evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.001, density: 1.400 }, 'Rapid Klen', OPERATIONAL_RAPID_KLEN_SPEC_METADATA).result).toBe('REJECT');

  const passRes = evaluateRapidKlenAnalysis({ sensory: validSensory, alkalinityNa2O: 35.01, alkalinityNaOH: 45.17, ph: 12.001, density: 1.401 }, 'Rapid Klen', OPERATIONAL_RAPID_KLEN_SPEC_METADATA);
  expect(passRes.decision).toBe('RELEASE');
  expect(passRes.result).toBe('PASS');
});
```

- [ ] **Step 2: Update `chemical-specification.ts` for Rapid Klen**
Sensory:
- `visual`: `'Jernih'`
- `foreignMatters`: `'Tidak ada kontaminasi'`
- `packagingLabel`: `'Kemasan & label tidak rusak'`
Chemical (Strict `>`):
- `alkalinityNa2O <= 35.00` -> FAIL
- `alkalinityNaOH <= 45.16` -> FAIL
- `ph <= 12.000` -> FAIL
- `density <= 1.400` -> FAIL
Remove `PENDING_SIGNOFF` blocker; return `decision: 'RELEASE'` on compliant runs under `ruleStatus: 'ACTIVE_CONFIGURED'`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- src/qc/constants/chemical-specification.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/qc/constants/chemical-specification.*
git commit -m "feat(qc): enforce strict greater-than limits for Rapid Klen under ACTIVE_CONFIGURED"
```

---

#### Task 9: QC Product Analysis Service Integration & Removal of Legacy Approval Blocker
**Files:**
- Modify: `backend/src/qc/qc-product-analysis.service.ts:320-530, 630-665`
- Test: `backend/src/qc/qc-product-analysis.spec.ts`

**Interfaces:**
- Consumes: Generic `SubmitProductAnalysisDto` with `dto.parameters.calorieBand`.
- Produces: Replaces legacy `checkSpecificationApprovalStatus` with `getSpecificationRuleStatus`. Under `ruleStatus: 'ACTIVE_CONFIGURED'`, compliant analysis produces `decision: 'RELEASE'` transitioning directly to `QC_VEHICLE_PASSED`. Removes `specStatus.approvalStatus !== 'APPROVED'` blocker and eliminates `PENDING_DISPOSITION` from canonical flows. Unknown calorie bands return deterministic HTTP 422 `SPEC_NOT_CONFIGURED`.

- [ ] **Step 1: Write failing unit tests in `qc-product-analysis.spec.ts`**
```typescript
it('should release canonical Coal to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled', async () => {
  process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
  process.env.GMS_TEST_HARNESS = 'false';
  const dto = {
    testRound: 1,
    parameters: {
      calorieBand: 'COAL_5600_6000',
      totalMoisture: 31.5,
      visual: {
        kondisi: 'Kering (Tidak Basah)',
        warna: 'Hitam',
        levelRank: 'Medium Rank Coal',
        kilap: 'Hitam Mengkilap',
        bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
      },
    },
  };
  const result = await service.submitProductAnalysis(coalTx.id, dto as any, mockUser);
  expect(result.data.status).toBe(TransactionStatus.QC_VEHICLE_PASSED);
  expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: TransactionStatus.QC_VEHICLE_PASSED }),
  }));
});

it('should release canonical PAC to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled', async () => {
  process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
  process.env.GMS_TEST_HARNESS = 'false';
  const dto = {
    testRound: 1,
    parameters: {
      sensory: { visual: 'Kuning', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
      ph: 4.10,
      density: 1.215,
    },
  };
  const result = await service.submitProductAnalysis(pacTx.id, dto as any, mockUser);
  expect(result.data.status).toBe(TransactionStatus.QC_VEHICLE_PASSED);
});

it('should release canonical Rapid Klen to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled', async () => {
  process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
  process.env.GMS_TEST_HARNESS = 'false';
  const dto = {
    testRound: 1,
    parameters: {
      sensory: { visual: 'Jernih', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' },
      alkalinityNa2O: 35.50,
      alkalinityNaOH: 46.00,
      ph: 12.500,
      density: 1.420,
    },
  };
  const result = await service.submitProductAnalysis(rapidTx.id, dto as any, mockUser);
  expect(result.data.status).toBe(TransactionStatus.QC_VEHICLE_PASSED);
});

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
    .rejects.toMatchObject({
      status: 422,
      response: {
        error: 'SPEC_NOT_CONFIGURED',
      },
    });

  expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
  expect(mockActivityLogs.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'COAL_SPEC_NOT_CONFIGURED',
  }));
});
```

- [ ] **Step 2: Update `qc-product-analysis.service.ts`**
In `qc-product-analysis.service.ts`:
1. Replace `checkSpecificationApprovalStatus` helper:
```typescript
getSpecificationRuleStatus(
  productCategory: string,
  productName: string,
): {
  ruleStatus: 'ACTIVE_CONFIGURED' | 'TEST_FIXTURE' | 'UNCONFIGURED';
  documentSource: string;
} {
  const cat = (productCategory || '').toUpperCase();
  const name = (productName || '').toUpperCase();

  if (cat === 'COAL' || cat.includes('BATUBARA') || name.includes('BATUBARA')) {
    const spec = this.specProvider.getCoalSpec();
    return { ruleStatus: spec.ruleStatus, documentSource: spec.documentSource };
  }
  if (name.includes('PAC')) {
    const spec = this.specProvider.getPacSpec();
    return { ruleStatus: spec.ruleStatus, documentSource: spec.documentSource };
  }
  if (name.includes('RAPID') || name.includes('KLEN')) {
    const spec = this.specProvider.getRapidKlenSpec();
    return { ruleStatus: spec.ruleStatus, documentSource: spec.documentSource };
  }
  return {
    ruleStatus: 'UNCONFIGURED',
    documentSource: 'Unconfigured Product Specification',
  };
}
```
2. Remove legacy `if (specStatus.approvalStatus !== 'APPROVED')` release blocker:
```typescript
const ruleMeta = this.getSpecificationRuleStatus(
  authoritativeProductCategory,
  authoritativeProductName,
);

// Under AnalysisDecision.RELEASE:
case AnalysisDecision.RELEASE:
  if (ruleMeta.ruleStatus !== 'ACTIVE_CONFIGURED' && ruleMeta.ruleStatus !== 'TEST_FIXTURE') {
    throw new BadRequestException(
      `Keputusan RELEASE otomatis ditolak: Spesifikasi operasional untuk ${authoritativeProductName} belum aktif terkonfigurasi (Status: ${ruleMeta.ruleStatus}).`,
    );
  }
  nextStatus = TransactionStatus.QC_VEHICLE_PASSED;
  break;
```
3. Eliminate `PENDING_DISPOSITION` from canonical flows:
```typescript
case AnalysisDecision.PENDING_DISPOSITION:
  throw new BadRequestException(
    `Pengujian laboratorium untuk ${authoritativeProductName} tidak dapat diproses rilis: Spesifikasi operasional berstatus ${ruleMeta.ruleStatus} (${ruleMeta.documentSource}).`,
  );
```
4. On unconfigured calorie band:
```typescript
if (evalResult.isConfigured === false) {
  await this.activityLogsService.logAction({
    userId: user.sub,
    action: 'COAL_SPEC_NOT_CONFIGURED',
    details: { transactionId, calorieBand: rawParams.calorieBand },
  });
  throw new HttpException(
    {
      statusCode: 422,
      error: 'SPEC_NOT_CONFIGURED',
      message: 'Spesifikasi acuan kalori batubara belum dikonfigurasi. Evaluasi diblokir tanpa keputusan rilis/tolak otomatis.',
    },
    422,
  );
}
```

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- src/qc/qc-product-analysis.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/qc/qc-product-analysis.service.ts backend/src/qc/qc-product-analysis.spec.ts
git commit -m "feat(qc): wire ACTIVE_CONFIGURED release flow in service and remove legacy approval blockers"
```

---

### Phase 3: GSP Pre-Unloading Gate

#### Task 10: Canonical Pre-Unload Checklist Constants & DTO Schema
**Files:**
- Create: `backend/src/warehouse/constants/gsp-preunload-checklist.ts`
- Modify: `backend/src/warehouse/dto/start-warehouse.dto.ts`

**Interfaces:**
- Consumes: Client payload `{ suratJalanNumber, poNumber, preUnloadChecklist: { items: Array<{ code, result, notes }> } }`.
- Produces: Canonical `GSP-PREUNLOAD-2026.1` constant. Validates DTO with `@IsIn(['OK', 'NOT_OK'])`, `@ArrayMinSize(9)`, `@ArrayMaxSize(9)`.

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
```typescript
export class PreUnloadChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsIn(['OK', 'NOT_OK'], { message: "Checklist result must be 'OK' or 'NOT_OK'" })
  result: 'OK' | 'NOT_OK';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PreUnloadChecklistDto {
  @IsArray()
  @ArrayMinSize(9, { message: 'Pre-unload checklist must contain exactly 9 items' })
  @ArrayMaxSize(9, { message: 'Pre-unload checklist must contain exactly 9 items' })
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
git commit -m "feat(warehouse): define canonical GSP-PREUNLOAD-2026.1 checklist constant and strict DTO schema"
```

---

#### Task 11: GSP Pre-Unloading Hard Gate, ActivityLog Audit & Persistence
**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts:238-480`
- Test: `backend/src/warehouse/gsp-workflow.spec.ts`

**Interfaces:**
- Consumes: `StartWarehouseDto`, user identity.
- Produces: Complete fail-closed audit: logs `GSP_PREUNLOAD_CHECKLIST_FAILED` on any `NOT_OK` or `GSP_PREUNLOAD_CHECKLIST_INVALID` on malformed structures outside the DB transaction before throwing; transitions to `WAREHOUSE_IN_PROGRESS` and persists canonical labels on 9/9 OK with SJ and PO.

- [ ] **Step 1: Write failing unit test in `gsp-workflow.spec.ts`**
```typescript
it('should block warehouse start if any checklist item is NOT_OK and record ActivityLog fail-closed outside transaction', async () => {
  const dto = {
    suratJalanNumber: 'SJ-001',
    poNumber: 'PO-001',
    preUnloadChecklist: {
      items: [
        { code: 'CLEAN_VEHICLE', result: 'OK' },
        { code: 'DOOR_SEAL_GOOD', result: 'NOT_OK', notes: 'Segel rusak' },
        // ... 7 other canonical items OK
      ],
    },
  };

  await expect(warehouseService.startWarehouse(gspTx.id, dto as any, mockUser))
    .rejects.toThrow('Pemeriksaan pra-bongkar belum memenuhi persyaratan.');

  expect(mockPrisma.warehouseProcess.create).not.toHaveBeenCalled();
  expect(mockActivityLogs.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
    referenceId: gspTx.id,
  }));
});

it('should log GSP_PREUNLOAD_CHECKLIST_INVALID on malformed duplicate or unknown codes', async () => {
  const malformedDto = {
    suratJalanNumber: 'SJ-001',
    poNumber: 'PO-001',
    preUnloadChecklist: {
      items: [
        { code: 'CLEAN_VEHICLE', result: 'OK' },
        { code: 'UNKNOWN_CODE', result: 'OK' },
        // ... 7 items
      ],
    },
  };
  await expect(warehouseService.startWarehouse(gspTx.id, malformedDto as any, mockUser))
    .rejects.toThrow();
  expect(mockActivityLogs.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GSP_PREUNLOAD_CHECKLIST_INVALID',
  }));
});
```

- [ ] **Step 2: Implement pre-unloading logic in `warehouse.service.ts`**
For GSP:
1. Validate SJ and PO presence (`dto.suratJalanNumber || tx.suratJalanNumber` and `dto.poNumber || tx.poNumber`).
2. Validate canonical codes: verify exactly 9 items, no duplicates, all in `GSP_PREUNLOAD_CODES`. If invalid, log `GSP_PREUNLOAD_CHECKLIST_INVALID` to `activityLogsService` and throw `BadRequestException`.
3. If any item is `NOT_OK`:
   - Log `GSP_PREUNLOAD_CHECKLIST_FAILED` with failed codes and notes to `activityLogsService` (outside `$transaction`).
   - Throw `BadRequestException('Pemeriksaan pra-bongkar belum memenuhi persyaratan.')`.
4. If 9/9 OK: inside Prisma transaction, atomically transition `Transaction` to `WAREHOUSE_IN_PROGRESS` and persist canonical labels into `WarehouseProcess.checklistItems` with `startById` and `startAt`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/warehouse/warehouse.service.ts backend/src/warehouse/gsp-workflow.spec.ts
git commit -m "feat(warehouse): enforce pre-unloading verification gate and complete fail-closed ActivityLog audit"
```

---

### Phase 4: GSP Receiving

#### Task 12: Decimal-Safe Complete Warehouse DTO & Exact Scale Validator
**Files:**
- Modify: `backend/src/warehouse/dto/complete-warehouse.dto.ts`

**Interfaces:**
- Consumes: `{ receivedQuantity?: string, receivedUnit?: WarehouseUnit }`.
- Produces: Decimal-safe string contract; validates positive decimal, max 9 integer digits, max 3 decimal digits; rejects exponents (`1e3`) and scale > 3 (`8000.2507`) with deterministic HTTP 400.

- [ ] **Step 1: Write decimal validator helper function**
```typescript
export function validateReceivedQuantityString(val: string): Prisma.Decimal {
  if (typeof val !== 'string' || !val.trim()) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message: 'Jumlah diterima wajib berupa string angka desimal yang valid.',
    });
  }
  const trimmed = val.trim();
  // Reject scientific notation, negative numbers, comma notation, or non-digits
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message: 'Format jumlah diterima tidak valid (hanya angka positif dengan titik desimal diperbolehkan).',
    });
  }
  const parts = trimmed.split('.');
  const intPart = parts[0];
  const decPart = parts[1] || '';

  if (intPart.length > 9) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'RECEIVED_QUANTITY_OVERFLOW',
      message: 'Jumlah diterima melebihi batas kapasitas integer (maksimal 9 digit sebelum koma).',
    });
  }
  if (decPart.length > 3) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY_SCALE',
      message: 'Jumlah diterima maksimal 3 angka di belakang koma (desimal).',
    });
  }

  const dec = new Prisma.Decimal(trimmed);
  if (dec.lte(0)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message: 'Jumlah diterima harus lebih besar dari 0.',
    });
  }
  return dec;
}
```

- [ ] **Step 2: Update `CompleteWarehouseDto`**
Add fields:
```typescript
@ApiPropertyOptional({ description: 'Commercial received quantity string (up to 3 decimal places)', example: '8000.250' })
@IsOptional()
@IsString()
receivedQuantity?: string;

@ApiPropertyOptional({ enum: WarehouseUnit, description: 'Optional client-submitted unit for verification', example: WarehouseUnit.LITER })
@IsOptional()
@IsEnum(WarehouseUnit)
receivedUnit?: WarehouseUnit;
```

- [ ] **Step 3: Run build to verify DTO compilation**
Run: `npm --prefix backend run build`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/warehouse/dto/complete-warehouse.dto.ts
git commit -m "feat(warehouse): define decimal-safe receivedQuantity string contract and exact scale validator"
```

---

#### Task 13: Warehouse Receiving Decoupling, Unit Derivation & Atomic Persistence
**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts:520-720`
- Test: `backend/src/warehouse/gsp-workflow.spec.ts`
- Test: `backend/src/warehouse/warehouse.service.spec.ts`

**Interfaces:**
- Consumes: `CompleteWarehouseDto`, `Transaction.receiptUnit`.
- Produces: Decoupled GSP receiving where `receivedQuantity` is validated via `validateReceivedQuantityString`, `receivedUnit` is derived from `Transaction.receiptUnit`, and exact Decimal is persisted atomically to `WarehouseProcess.receivedQuantity/receivedUnit` and `Transaction.receivedQuantity`. GBB/GBJ flows remain untouched.

- [ ] **Step 1: Write failing unit test in `gsp-workflow.spec.ts`**
```typescript
it('should reject receivedQuantity with exponent notation or scale > 3', async () => {
  await expect(warehouseService.completeWarehouse(gspTx.id, { receivedQuantity: '1e3' } as any, mockUser))
    .rejects.toMatchObject({ response: { error: 'INVALID_RECEIVED_QUANTITY' } });

  await expect(warehouseService.completeWarehouse(gspTx.id, { receivedQuantity: '8000.2507' } as any, mockUser))
    .rejects.toMatchObject({ response: { error: 'INVALID_RECEIVED_QUANTITY_SCALE' } });
});

it('should persist exact Decimal value without silent rounding atomically in same transaction', async () => {
  await warehouseService.completeWarehouse(gspTx.id, { receivedQuantity: '16500.250' } as any, mockUser);
  expect(mockPrisma.warehouseProcess.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      receivedQuantity: new Prisma.Decimal('16500.250'),
      receivedUnit: WarehouseUnit.LITER,
    }),
  }));
  expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      receivedQuantity: new Prisma.Decimal('16500.250'),
    }),
  }));
});
```

- [ ] **Step 2: Implement receiving logic in `warehouse.service.ts`**
In `warehouse.service.ts` -> `completeWarehouse`:
For `tx.processType === 'GSP'`:
```typescript
if (!dto.receivedQuantity) {
  throw new BadRequestException('Jumlah diterima (receivedQuantity) wajib diisi untuk transaksi GSP.');
}
const decimalQty = validateReceivedQuantityString(dto.receivedQuantity);
const derivedUnit = tx.receiptUnit;
if (!derivedUnit) {
  throw new BadRequestException('Satuan penerimaan (receiptUnit) tidak ditemukan pada transaksi.');
}
if (dto.receivedUnit && dto.receivedUnit !== derivedUnit) {
  throw new BadRequestException(`Satuan penerimaan (${dto.receivedUnit}) tidak cocok dengan satuan transaksi (${derivedUnit}).`);
}
```
In Prisma transaction:
- `Transaction.updateMany`: `receivedQuantity: decimalQty`, `status: 'WAREHOUSE_DONE'`.
- `WarehouseProcess.update`: `receivedQuantity: decimalQty`, `receivedUnit: derivedUnit`.
For GBB / GBJ: preserve legacy `actualWeight` / `actualQuantity` checks and updates.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix backend test -- -t "GSP 4-Group Workflow|WarehouseService"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add backend/src/warehouse/warehouse.service.ts backend/src/warehouse/gsp-workflow.spec.ts backend/src/warehouse/warehouse.service.spec.ts
git commit -m "feat(warehouse): decouple GSP receiving with atomic Decimal persistence and zero silent rounding"
```

---

### Phase 5: Frontend

#### Task 14: Coal PA Form Factual Visual Fields & Calorie Band Alignment
**Files:**
- Modify: `frontend/src/components/qc/CoalAnalysisForm.vue`
- Test: `frontend/src/__tests__/qc-pa-forms.spec.js`

**Interfaces:**
- Consumes: Transaction data with Coal profile.
- Produces: Calorie band selection in `parameters.calorieBand` (`COAL_5600_6000`, `COAL_GT_6000`), exact 5 factual visual fields, and moisture input.

- [ ] **Step 1: Write failing frontend test in `qc-pa-forms.spec.js`**
```javascript
it('should render exact two calorie bands and five factual visual fields for Coal PA form', async () => {
  const wrapper = mount(CoalAnalysisForm, { props: { transaction: mockCoalTx } });
  const select = wrapper.find('select[name="calorieBand"]');
  expect(select.exists()).toBe(true);
  const options = select.findAll('option');
  expect(options.map(o => o.attributes('value'))).toEqual(['COAL_5600_6000', 'COAL_GT_6000']);

  // Factual visual inputs
  expect(wrapper.find('select[name="kondisi"]').exists()).toBe(true);
  expect(wrapper.find('select[name="warna"]').exists()).toBe(true);
  expect(wrapper.find('select[name="levelRank"]').exists()).toBe(true);
  expect(wrapper.find('select[name="kilap"]').exists()).toBe(true);
  expect(wrapper.find('select[name="bahanPengotor"]').exists()).toBe(true);
});
```

- [ ] **Step 2: Update `CoalAnalysisForm.vue`**
- Replace legacy calorie tiers with dropdown containing `COAL_5600_6000` ("5600–6000 kcal/kg (Max TM 33%)") and `COAL_GT_6000` ("> 6000 kcal/kg (Max TM 25%)").
- Replace generic sensory checkboxes with 5 factual visual selects/radios:
  1. `kondisi`: `Kering (Tidak Basah)`
  2. `warna`: `Hitam`, `Hitam Kecoklatan`, `Coklat`
  3. `levelRank`: `High Rank Coal`, `Medium Rank Coal`, `Low Rank Coal`
  4. `kilap`: `Hitam Mengkilap`, `Hitam Kecoklatan`, `Mudah Lapuk`
  5. `bahanPengotor`: `Tidak ada kontaminasi batuan maupun tanah`
- On submit, payload submits `{ calorieBand, totalMoisture, visual: { kondisi, warna, levelRank, kilap, bahanPengotor } }` inside `parameters`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/qc/CoalAnalysisForm.vue frontend/src/__tests__/qc-pa-forms.spec.js
git commit -m "feat(frontend): align CoalAnalysisForm with configured calorie bands and factual visual fields"
```

---

#### Task 15: PAC & Rapid Klen PA Forms Alignment & Banner Removal
**Files:**
- Modify: `frontend/src/components/qc/ChemicalPacForm.vue`
- Modify: `frontend/src/components/qc/ChemicalRapidKlenForm.vue`
- Test: `frontend/src/__tests__/qc-pa-forms.spec.js`

**Interfaces:**
- Consumes: Chemical transactions.
- Produces: PAC sensory/pH/density without Al2O3, Rapid Klen sensory and strict chemical boundaries; completely removes hardcoded `PENDING_SIGNOFF` banners.

- [ ] **Step 1: Write failing frontend test in `qc-pa-forms.spec.js`**
```javascript
it('should NOT render any PENDING_SIGNOFF or governance hold banner in PAC or Rapid Klen forms', () => {
  const pacWrapper = mount(ChemicalPacForm, { props: { transaction: mockPacTx } });
  expect(pacWrapper.find('#banner-pac-governance').exists()).toBe(false);
  expect(pacWrapper.text()).not.toContain('PENDING_SIGNOFF');
  expect(pacWrapper.text()).not.toContain('Spesifikasi operasional belum disahkan');

  const rpdWrapper = mount(ChemicalRapidKlenForm, { props: { transaction: mockRpdTx } });
  expect(rpdWrapper.find('#banner-rapid-governance').exists()).toBe(false);
  expect(rpdWrapper.text()).not.toContain('PENDING_SIGNOFF');
  expect(rpdWrapper.text()).not.toContain('Spesifikasi operasional belum disahkan');
});
```

- [ ] **Step 2: Update `ChemicalPacForm.vue` and `ChemicalRapidKlenForm.vue`**
- Delete `#banner-pac-governance` from `ChemicalPacForm.vue`.
- Delete `#banner-rapid-governance` from `ChemicalRapidKlenForm.vue`.
- PAC: Remove Al2O3 field from form and validation. Sensory selects: Visual (`Kuning`, `Coklat Jernih`), Foreign Matters (`Tidak ada kontaminasi`), Packaging (`Kemasan & label tidak rusak`).
- Rapid Klen: Sensory selects: Visual (`Jernih`), Foreign Matters (`Tidak ada kontaminasi`), Packaging (`Kemasan & label tidak rusak`). Display strict boundary indicators (`> 35.00%`, `> 45.16%`, `> 12.000`, `> 1.400`).

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "qc-pa-forms"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/qc/ChemicalPacForm.vue frontend/src/components/qc/ChemicalRapidKlenForm.vue frontend/src/__tests__/qc-pa-forms.spec.js
git commit -m "feat(frontend): remove PENDING_SIGNOFF banners and align PAC and Rapid Klen forms with authoritative laboratory sheets"
```

---

#### Task 16: Pre-Unloading 9-Point Checklist UI & Dual-Action Button in GSPProcess
**Files:**
- Modify: `frontend/src/views/GSPProcess.vue:60-110`
- Modify: `frontend/src/stores/warehouseStore.js`
- Test: `frontend/src/__tests__/gsp-process.spec.js`

**Interfaces:**
- Consumes: `truckStore` queue and `warehouseStore.startProcess`.
- Produces: 9-point checklist with toggles `[ OK ]` / `[ NOT OK ]`. If incomplete -> button disabled; if 9/9 OK -> button `[ MULAI BONGKAR ]`; if any NOT_OK -> button `[ SIMPAN HASIL PEMERIKSAAN ]` submitting fail-closed record to backend.

- [ ] **Step 1: Write failing frontend test in `gsp-process.spec.js`**
```javascript
it('should render dual-action checklist buttons: MULAI BONGKAR when 9/9 OK and SIMPAN HASIL PEMERIKSAAN when any NOT_OK', async () => {
  const pinia = createTestingPinia({ stubActions: false });
  const truckStore = useTruckStore(pinia);
  const warehouseStore = useWarehouseStore(pinia);
  truckStore.trucks = [mockTruckQcPassed];

  const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } });
  wrapper.vm.selectedTruck = mockTruckQcPassed;
  await wrapper.vm.$nextTick();

  // Incomplete: button disabled
  const submitBtn = wrapper.find('#btn-submit-preunload');
  expect(submitBtn.attributes('disabled')).toBeDefined();

  // Answer 8 OK and 1 NOT_OK
  for (let i = 0; i < 8; i++) wrapper.vm.checklistAnswers[i] = 'OK';
  wrapper.vm.checklistAnswers[8] = 'NOT_OK';
  await wrapper.vm.$nextTick();

  expect(submitBtn.text()).toContain('SIMPAN HASIL PEMERIKSAAN');
  await submitBtn.trigger('click');
  expect(warehouseStore.startProcess).toHaveBeenCalled();

  // Answer all 9 OK
  wrapper.vm.checklistAnswers[8] = 'OK';
  await wrapper.vm.$nextTick();
  expect(submitBtn.text()).toContain('MULAI BONGKAR');
});
```

- [ ] **Step 2: Implement checklist UI and logic in `GSPProcess.vue`**
- Section: "Pemeriksaan Pra-Bongkar (Kendaraan, Barang & Dokumen)".
- Render Surat Jalan & PO fields (mandatory before unload).
- Render 9 canonical checklist items with `[ OK ]` / `[ NOT OK ]` toggles and notes input.
- Computed button state:
  - If any of the 9 items is unanswered or SJ/PO missing: disabled.
  - If 9/9 answered and all are `OK`: label = "MULAI BONGKAR", calls `warehouseStore.startProcess(id, payload)`.
  - If 9/9 answered and one or more are `NOT_OK`: label = "SIMPAN HASIL PEMERIKSAAN", calls `warehouseStore.startProcess(id, payload)` which registers `GSP_PREUNLOAD_CHECKLIST_FAILED` on backend and displays fail-closed alert in UI.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/views/GSPProcess.vue frontend/src/stores/warehouseStore.js frontend/src/__tests__/gsp-process.spec.js
git commit -m "feat(frontend): implement pre-unloading checklist with dual-action MULAI BONGKAR / SIMPAN HASIL PEMERIKSAAN"
```

---

#### Task 17: GSP Receiving Screen, String Decimal Input & Fail-Closed UOM Badge in GSPProcess
**Files:**
- Modify: `frontend/src/views/GSPProcess.vue:110-125`
- Test: `frontend/src/__tests__/gsp-process.spec.js`

**Interfaces:**
- Consumes: Transaction in `WAREHOUSE_IN_PROGRESS`.
- Produces: Receiving card with string-based `receivedQuantity` input, dynamic label, read-only UOM badge without KG fallback (disabled if null), and submit calling `warehouseStore.completeProcess`.

- [ ] **Step 1: Write failing frontend test in `gsp-process.spec.js`**
```javascript
it('should render read-only UOM badge without KG fallback and block completion if receiptUnit is missing', async () => {
  const pinia = createTestingPinia({ stubActions: false });
  const truckStore = useTruckStore(pinia);
  const wrapper = mount(GSPProcess, { global: { plugins: [pinia] } });

  // Missing receiptUnit
  wrapper.vm.selectedTruck = { ...mockTruckInProgress, receiptUnit: null };
  await wrapper.vm.$nextTick();

  expect(wrapper.text()).toContain('Receipt UOM belum terkonfigurasi');
  expect(wrapper.text()).not.toContain('Jumlah Diterima (KG)'); // NO KG FALLBACK
  expect(wrapper.find('#btn-complete-gsp-receiving').attributes('disabled')).toBeDefined();

  // Valid receiptUnit LITER
  wrapper.vm.selectedTruck = { ...mockTruckInProgress, receiptUnit: 'LITER' };
  await wrapper.vm.$nextTick();
  expect(wrapper.text()).toContain('Jumlah Diterima (LITER)');
  expect(wrapper.find('#badge-receipt-uom').text()).toBe('LITER');
});
```

- [ ] **Step 2: Update receiving section in `GSPProcess.vue`**
- If `!selectedTruck.receiptUnit`: show warning card `"Receipt UOM belum terkonfigurasi. Hubungi Admin Master Data."` and disable submission.
- If `selectedTruck.receiptUnit` is present:
  - Label: `Jumlah Diterima (${selectedTruck.receiptUnit})`
  - Badge `#badge-receipt-uom`: displays `selectedTruck.receiptUnit`
  - Input `#input-received-quantity`: string text/number input
  - Inline regex check: `/^\d+(\.\d{1,3})?$/`. If invalid, show error message and disable submit.
  - On submit: call `warehouseStore.completeProcess(selectedTruck.id, { receivedQuantity: String(quantityInput.value) })`.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "gsp-process"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/views/GSPProcess.vue frontend/src/__tests__/gsp-process.spec.js
git commit -m "feat(frontend): implement decimal-safe receiving screen with fail-closed UOM badge and zero KG fallback"
```

---

#### Task 18: Master Data Modal Receipt UOM Field & Store Synchronization
**Files:**
- Modify: `frontend/src/components/MasterDataModal.vue:320-360`
- Modify: `frontend/src/stores/masterDataStore.js`
- Test: `frontend/src/__tests__/master-data-gsp.spec.js`

**Interfaces:**
- Consumes: `masterDataStore`.
- Produces: Visible, required `Receipt UOM` selection (`KG` or `LITER`) when creating/editing GSP product catalog items; badges displayed on product list cards.

- [ ] **Step 1: Write failing test in `master-data-gsp.spec.js`**
```javascript
it('should require Receipt UOM in Add GSP Product modal and display badge in catalog cards', async () => {
  const pinia = createTestingPinia({ stubActions: false });
  const wrapper = mount(MasterDataModal, { global: { plugins: [pinia] } });
  await wrapper.find('#btn-scope-gsp').trigger('click');
  expect(wrapper.findAll('.product-receipt-uom-badge').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Update `MasterDataModal.vue` and `masterDataStore.js`**
- In `MasterDataModal.vue`:
  - Add `Receipt UOM` dropdown (`KG`, `LITER`) in Add GSP Product modal.
  - Enforce `receiptUnit` required in `canSubmitGsp` validation.
  - Display `receiptUnit` badge next to `gspAnalysisProfile` on product cards.
- In `masterDataStore.js`:
  - Include `receiptUnit` in `createProductCatalog` and `updateProductCatalog` payloads.

- [ ] **Step 3: Run test to verify it passes**
Run: `npm --prefix frontend test -- -t "master-data-gsp"`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/MasterDataModal.vue frontend/src/stores/masterDataStore.js frontend/src/__tests__/master-data-gsp.spec.js
git commit -m "feat(frontend): add Receipt UOM field to GSP Master Data settings and catalog store"
```

---

### Phase 6: Testing & Acceptance Mapping

#### Task 19: QC / PA Engine Automated Test Matrix
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
| Client `visualPassed=true` cannot bypass factual checks | `coal-specification.spec.ts` | `ADVERSARIAL: should reject if visualPassed=true but factual checks fail` |
| Unknown Coal Band -> HTTP 422 | `qc-product-analysis.spec.ts` | `should throw HTTP 422 SPEC_NOT_CONFIGURED on unconfigured calorie band` |
| Assert zero fallback to 4200 | `coal-specification.spec.ts` | `should assert no fallback exists for arbitrary calorie string` |
| Coal PASS under `ACTIVE_CONFIGURED` -> `QC_VEHICLE_PASSED` | `qc-product-analysis.spec.ts` | `should release canonical Coal to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled` |
| PAC: pH 3.5 & 5.0 PASS, 3.4 & 5.1 FAIL | `chemical-specification.spec.ts` | `should enforce PAC pH inclusive boundary (3.50-5.00)` |
| PAC: Density 1.170 & 1.260 PASS | `chemical-specification.spec.ts` | `should enforce PAC density inclusive boundary (1.170-1.260)` |
| PAC: Omission of Al2O3 does not block PASS | `chemical-specification.spec.ts` | `should release PAC without Al2O3 parameter` |
| PAC PASS under `ACTIVE_CONFIGURED` -> `QC_VEHICLE_PASSED` | `qc-product-analysis.spec.ts` | `should release canonical PAC to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled` |
| Rapid Klen: Na2O 35.00 FAIL, 35.01 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen Na2O` |
| Rapid Klen: NaOH 45.16 FAIL, 45.17 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen NaOH` |
| Rapid Klen: pH 12.000 FAIL, 12.001 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen pH` |
| Rapid Klen: Density 1.400 FAIL, 1.401 PASS | `chemical-specification.spec.ts` | `should enforce strict greater-than for Rapid Klen density` |
| Rapid Klen PASS under `ACTIVE_CONFIGURED` -> `QC_VEHICLE_PASSED` | `qc-product-analysis.spec.ts` | `should release canonical Rapid Klen to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED with test fixtures disabled` |

- [ ] **Step 1: Implement full test matrix across specified test files**
- [ ] **Step 2: Run all QC tests**
Run: `npm --prefix backend test -- src/qc`
Expected: PASS with 100% test scenario success.
- [ ] **Step 3: Commit**
```bash
git add backend/src/qc/
git commit -m "test(qc): implement comprehensive automated test matrix for Coal, PAC, and Rapid Klen evaluators under ACTIVE_CONFIGURED"
```

---

#### Task 20: GSP Pre-Unloading & Receiving Automated Test Matrix
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
| Exponent notation (`1e3`) -> HTTP 400 `INVALID_RECEIVED_QUANTITY` | `gsp-workflow.spec.ts` | `should reject receivedQuantity with exponent notation` |
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

#### Task 21: Gate Snapshot & Amendment Synchronization Automated Test Matrix
**Files:**
- Modify: `backend/src/gate/gate-gsp-checkin.spec.ts`
- Modify: `backend/src/transactions/active-transaction-amendment.spec.ts`

**Specification Acceptance Coverage:**
| Scenario | Test Location | Test Case Name |
|---|---|---|
| Gate Check-In snapshots `receiptUnit` | `gate-gsp-checkin.spec.ts` | `should snapshot catalog receiptUnit onto new transaction` |
| GSP Check-In without catalog `receiptUnit` fails closed | `gate-gsp-checkin.spec.ts` | `should fail check-in if catalog lacks receiptUnit` |
| Canonical mapping enforcement: COAL-001 + LITER rejected | `product-catalog.service.spec.ts` | `should reject COAL-001 with LITER` |
| Canonical mapping enforcement: SOLAR-001 + KG rejected | `product-catalog.service.spec.ts` | `should reject SOLAR-001 with KG` |
| Canonical mapping enforcement: PAC-001 + KG rejected | `product-catalog.service.spec.ts` | `should reject PAC-001 with KG` |
| Canonical mapping enforcement: RPD-001 + KG rejected | `product-catalog.service.spec.ts` | `should reject RPD-001 with KG` |
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
git commit -m "test(transactions): implement test matrix for gate snapshotting, active amendment UOM synchronization, and canonical mapping validation"
```

---

### Phase 7: Migration Rehearsal, Release Gates & Manual UAT

#### Task 22: Migration Invariant Release Gate & Canonical Seed Verification Scripts
**Files:**
- Create: `backend/scripts/verify-migration-invariants.js`
- Create: `backend/scripts/verify-canonical-seed.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: PostgreSQL connection string `DATABASE_URL`.
- Produces: Two decoupled verification scripts executable via Node directly:
  1. `verify-migration-invariants.js` (Gate A): Uses raw SQL to verify enum `LITER` and assert zero active GSP products have null profile or null `receiptUnit`. Safe against unseeded historical databases and immune to stale generated Prisma client caches.
  2. `verify-canonical-seed.js` (Gate B): Verifies all 7 canonical products exist and match exact UOM mappings. Executed after seeding in fresh/staging pipelines.

- [ ] **Step 1: Create `backend/scripts/verify-migration-invariants.js`**
```javascript
/**
 * Migration Invariant Release Gate (Gate A)
 *
 * Verifies PostgreSQL 15 schema invariants immediately after migration deployment.
 * Uses raw SQL queries to ensure deterministic execution regardless of whether
 * Prisma Client has been regenerated yet on the host/container.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  console.log('--- [Gate A] Verifying GSP Migration Invariants ---');

  try {
    // 1. Verify Enum LITER in WarehouseUnit
    const enums = await prisma.$queryRawUnsafe(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'WarehouseUnit'::regtype;`
    );
    const enumLabels = (enums || []).map((e) => e.enumlabel);
    if (!enumLabels.includes('LITER')) {
      throw new Error("FAILED: 'WarehouseUnit' enum does not contain 'LITER'!");
    }
    console.log("  ✓ WarehouseUnit enum contains 'LITER'");

    // 2. Verify Zero unresolved active GSP product catalogs via raw SQL
    const unresolvedRows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count FROM "ProductCatalog"
       WHERE "processType" = 'GSP'
         AND "isActive" = true
         AND ("gspAnalysisProfile" IS NULL OR "receiptUnit" IS NULL);`
    );
    const unresolvedCount = unresolvedRows[0] ? unresolvedRows[0].count : 0;
    if (unresolvedCount > 0) {
      throw new Error(
        `FAILED: Found ${unresolvedCount} active GSP product catalogs with missing profile or receiptUnit!`
      );
    }
    console.log('  ✓ Zero unresolved active GSP product catalogs');
    console.log('--- [Gate A] GSP Migration Invariants PASSED [100% OK] ---');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
```

- [ ] **Step 2: Create `backend/scripts/verify-canonical-seed.js`**
```javascript
/**
 * Canonical Seed Verification Gate (Gate B)
 *
 * Asserts all 7 canonical GSP product catalogs exist with exact configured UOMs.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  console.log('--- [Gate B] Verifying Canonical Seed Products ---');

  const canonicals = [
    { code: 'COAL-001', expectedUom: 'KG' },
    { code: 'SOLAR-001', expectedUom: 'LITER' },
    { code: 'PAC-001', expectedUom: 'LITER' },
    { code: 'PAC-002', expectedUom: 'LITER' },
    { code: 'PAC-003', expectedUom: 'LITER' },
    { code: 'RPD-001', expectedUom: 'LITER' },
    { code: 'RPD-002', expectedUom: 'LITER' },
  ];

  try {
    for (const c of canonicals) {
      const prod = await prisma.productCatalog.findUnique({ where: { code: c.code } });
      if (!prod) {
        throw new Error(`FAILED: Missing canonical seed product: ${c.code}`);
      }
      if (prod.receiptUnit !== c.expectedUom) {
        throw new Error(
          `FAILED: Invalid receiptUnit for ${c.code}: expected '${c.expectedUom}', got '${prod.receiptUnit}'`
        );
      }
      console.log(`  ✓ Canonical product ${c.code} verified with receiptUnit '${c.expectedUom}'`);
    }
    console.log('--- [Gate B] Canonical Seed Verification PASSED [100% OK] ---');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
```

- [ ] **Step 3: Update `backend/package.json` scripts**
In `backend/package.json`:
- Ensure deterministic prepare order in `db:prepare:local`:
  `"db:prepare:local": "npm run prisma:preflight && npx prisma migrate deploy && npx prisma generate && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js"`
- Ensure deterministic production prepare order in `db:prepare:prod`:
  `"db:prepare:prod": "npm run db:verify:checksums && npm run db:backup:pre-deploy && npm run prisma:preflight && npx prisma migrate deploy && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js"`
- Add script aliases:
  `"verify:migration-invariants": "node scripts/verify-migration-invariants.js"`
  `"seed:verify": "node scripts/verify-canonical-seed.js"`

- [ ] **Step 4: Commit**
```bash
git add backend/scripts/verify-migration-invariants.js backend/scripts/verify-canonical-seed.js backend/package.json
git commit -m "chore(ops): implement raw-SQL migration invariant gate and canonical seed verifiers in package scripts"
```

---

#### Task 23: Production Migrator (Dockerfile), Real CI Workflows Integration & Release-Gate Rehearsals
**Files:**
- Modify: `backend/Dockerfile:51-53`
- Modify: `.github/workflows/ci.yml:68-75, 312-325, 691-696, 772-776`
- Modify: `backend/scripts/verify-baseline-master-upgrade-drill.ts`

**Interfaces:**
- Consumes: Production Docker migrator build, GitHub Actions workflows.
- Produces: Hardened release gates wired directly into the production container CMD and 4 GitHub Actions workflow jobs; explicit negative test proving invalid master data fails the migrator and blocks backend startup.

- [ ] **Step 1: Update production Dockerfile migrator container CMD**
In `backend/Dockerfile` (Stage 2 `migrator`):
```dockerfile
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/verify-migration-invariants.js && node scripts/enforce-audit-immutability.js"]
```
Because `migrator` carries full builder `node_modules` and `scripts`, `node scripts/verify-migration-invariants.js` executes reliably without `ts-node` or rebuild overhead.

- [ ] **Step 2: Update real CI workflows in `.github/workflows/ci.yml`**
1. **`backend-verification` Job (Matrix: Fresh & Upgraded):**
   Immediately after `npx prisma migrate deploy`:
   ```yaml
   - name: Generate Prisma Client & Validate Migrations
     working-directory: ./backend
     env:
       DATABASE_URL: postgres://postgres:testpassword@localhost:5432/gms_test_db?schema=public
     run: |
       npx prisma generate
       npm run prisma:preflight -- --report-only --fail-on-duplicates
       if [ "${{ matrix.db_state }}" = "upgraded" ]; then
         echo "Executing baseline upgrade simulation..."
         npx prisma db execute --file prisma/migrations/20260714030729_init/migration.sql --schema prisma/schema.prisma
         npx prisma migrate resolve --applied 20260714030729_init || true
       fi
       npx prisma migrate deploy
       node scripts/verify-migration-invariants.js
   ```
2. **`historical-migration-rehearsal-gate` Job:**
   Immediately after rehearsal migration deployment (Step 4):
   ```yaml
   echo "Step 4: Executing Prisma migration deployment on rehearsal DB..."
   npx prisma migrate deploy
   cd ..
   echo "Step 4.6: Verifying GSP migration invariants on rehearsal DB..."
   DATABASE_URL="postgres://postgres:testpassword@localhost:5432/gms_rehearsal_db?schema=public" node backend/scripts/verify-migration-invariants.js
   ```
3. **`production-compose-quality-gate` Job (Step 4E):**
   Rehearses the exact production migrator container path:
   ```yaml
   echo "4E: Deploying Forward Migrations via Migrator Container..."
   docker compose -f docker-compose.prod.yml run --rm migrator npx prisma migrate deploy
   docker compose -f docker-compose.prod.yml run --rm migrator node scripts/verify-migration-invariants.js
   docker compose -f docker-compose.prod.yml run --rm migrator npx prisma migrate status
   docker compose -f docker-compose.prod.yml run --rm migrator node scripts/enforce-audit-immutability.js
   ```
4. **`fullstack-staging-gate` Job:**
   Immediately after seeding in Step 4:
   ```yaml
   docker compose -f docker-compose.yml exec -T -e NODE_ENV=test -e SEED_ALL_USERS=true -e DEFAULT_ADMIN_PASSWORD=test-admin-password-12345 -e DEFAULT_QC_PASSWORD=test-qc-password-12345 -e DEFAULT_WAREHOUSE_PASSWORD=test-wh-password-12345 -e DEFAULT_SECURITY_PASSWORD=test-sec-password-12345 backend node dist/prisma/seed.js
   echo "Verifying Canonical Seed Invariants in Staging..."
   docker compose -f docker-compose.yml exec -T backend node scripts/verify-canonical-seed.js
   ```
Preserve all existing checksum gates, drift gates, backup gates, restore DR drills, rollback drills, compose gates, SBOM, and Trivy security gates.

- [ ] **Step 3: Execute Release-Gate Negative Test Rehearsal**
Rehearse the blocking nature of the migrator release gate:
1. Connect to PostgreSQL and inject an active GSP catalog with missing `receiptUnit`:
   ```sql
   INSERT INTO "ProductCatalog" ("id", "code", "name", "category", "processType", "gspAnalysisProfile", "receiptUnit", "isActive", "createdAt", "updatedAt")
   VALUES ('test-negative-gsp', 'NEG-001', 'Negative Test GSP', 'Chemical', 'GSP', 'PAC_PA', NULL, true, NOW(), NOW());
   ```
2. Execute migrator gate:
   `node backend/scripts/verify-migration-invariants.js`
   Expected: Exits with non-zero code (`FAILED: Found 1 active GSP product catalogs with missing profile or receiptUnit!`).
3. In Docker Compose rehearsal:
   `docker compose -f docker-compose.prod.yml run --rm migrator node scripts/verify-migration-invariants.js`
   Expected: Container exits code 1. Backend container cannot start because migrator service failed.
4. Clean up negative test fixture:
   ```sql
   DELETE FROM "ProductCatalog" WHERE "id" = 'test-negative-gsp';
   ```
5. Re-run verification:
   `node backend/scripts/verify-migration-invariants.js`
   Expected: Exits 0 (`Zero unresolved active GSP product catalogs`). Migrator succeeds, backend starts and becomes healthy.

- [ ] **Step 4: Update `verify-baseline-master-upgrade-drill.ts`**
In `backend/scripts/verify-baseline-master-upgrade-drill.ts`, add Gate A verification call immediately after the branch migration deploys.

- [ ] **Step 5: Commit**
```bash
git add backend/Dockerfile .github/workflows/ci.yml backend/scripts/verify-baseline-master-upgrade-drill.ts
git commit -m "chore(ops): wire GSP migration invariant gates into Dockerfile migrator CMD and real GitHub Actions workflows"
```

---

#### Task 24: Full Regression & Manual Rancher Desktop UAT Suite
**Files:**
- Documentation: Rancher Desktop local execution runbook.

**17 Manual Operational Scenarios:**
1. **Batubara 5600–6000 PASS:** Select `COAL_5600_6000`, TM 32.0%, Visual factual OK -> Status `QC_VEHICLE_PASSED`.
2. **Batubara >6000 PASS:** Select `COAL_GT_6000`, TM 24.5%, Visual factual OK -> Status `QC_VEHICLE_PASSED`.
3. **Batubara Round 1 Fail -> Retest:** Select `COAL_GT_6000`, TM 26.0% -> Status `QC_RETEST_REQUIRED`.
4. **Batubara Round 2 Fail -> Reject:** Retest Round 2, TM 26.5% -> Status `QC_VEHICLE_REJECTED`.
5. **Unknown Coal Band -> Blocked:** API submission with `< 5600` or arbitrary band -> HTTP 422 `SPEC_NOT_CONFIGURED`, status retained `QC_VEHICLE_IN_PROGRESS`.
6. **Solar -> PA_NOT_REQUIRED:** Weigh In Solar truck -> Status transitions directly to `PA_NOT_REQUIRED`.
7. **PAC PASS:** Sensory compliant, pH 4.2, Density 1.210 -> Status `QC_VEHICLE_PASSED`. No `PENDING_SIGNOFF` banner.
8. **Rapid Klen PASS:** Sensory compliant, Na2O 35.5%, NaOH 46.0%, pH 12.5, Density 1.420 -> Status `QC_VEHICLE_PASSED`. No `PENDING_SIGNOFF` banner.
9. **Checklist NOT_OK -> No Bongkar & Audit Created:** In GSP Warehouse, set item 2 to `NOT_OK` -> Button becomes `SIMPAN HASIL PEMERIKSAAN`, on click backend logs `GSP_PREUNLOAD_CHECKLIST_FAILED`, status retained, bongkar blocked.
10. **Missing SJ/PO -> No Bongkar:** Leave SJ empty -> Button disabled.
11. **Batubara Receiving KG:** Unload Batubara, input `Jumlah Diterima: "24850.500"`, badge `KG` read-only -> Complete -> Weigh Out in KG.
12. **Solar/PAC/Rapid Receiving LITER:** Unload PAC, input `Jumlah Diterima: "8000.250"`, badge `LITER` read-only -> Complete.
13. **Wrong UOM Fail:** API submission for Solar with `receivedUnit: 'KG'` -> HTTP 400 rejected.
14. **>3 Decimals Fail:** Input `"8000.2507"` -> Frontend blocks submit / API returns HTTP 400 `INVALID_RECEIVED_QUANTITY_SCALE`. Exponent `"1e3"` rejected.
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
| 1 | `schema/migration/seed` | `feat(schema): add LITER to WarehouseUnit, decimal receiving fields, and update canonical GSP seeds` |
| 2 | `master-data/gate` | `feat(master-data): enforce canonical UOM mapping, snapshot at gate check-in, and sync during amendment` |
| 3 | `qc/governance-coal` | `feat(qc): transition provider to ACTIVE_CONFIGURED and align coal evaluator with factual visual checks` |
| 4 | `qc/chemicals` | `feat(qc): align PAC and Rapid Klen evaluators with authoritative laboratory sheets under ACTIVE_CONFIGURED` |
| 5 | `warehouse/preunload` | `feat(warehouse): enforce server-authoritative 9-point pre-unloading checklist and fail-closed audit` |
| 6 | `warehouse/receiving` | `feat(warehouse): decouple GSP receiving with decimal string contract and exact 3-decimal scale policy` |
| 7 | `frontend/qc` | `feat(frontend): remove PENDING_SIGNOFF banners and align Coal, PAC, and Rapid Klen forms` |
| 8 | `frontend/warehouse` | `feat(frontend): implement pre-unloading checklist dual-action UX and decimal-safe receiving screen` |
| 9 | `ops/release-gates-ci` | `chore(ops): wire migration release gates into Dockerfile migrator, real CI workflows, and upgrade drills` |

---

## Execution Handoff

Plan revision complete and saved to `docs/superpowers/plans/2026-10-07-gsp-qc-preunload-uom-implementation-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
