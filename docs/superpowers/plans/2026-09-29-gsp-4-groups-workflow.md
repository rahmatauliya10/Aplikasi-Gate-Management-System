# GSP 4-Group Workflow & Product Assurance (PA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the verified 4-group GSP workflow in local/UAT environments: provide a dedicated, verified bypass for Solar (`PA_NOT_REQUIRED`) with server-side catalog protection, enforce strict pre-unloading PA Analysis gates for Batubara, PAC, and Rapid Klen with multi-round lab auditability, eliminate post-unloading GSP incoming checks without altering GBB 7-stage flow, and establish auditable operational incident handling for product corrections.

**Architecture:** 
1. Database & State Machine: Add canonical statuses `PA_NOT_REQUIRED`, `QC_RETEST_REQUIRED`, and `WAITING_UTILITY_DISPOSITION` to `TransactionStatus`. Create dedicated relational model `QcProductAnalysis` for multi-round lab records, COA parameters, and dual-control disposition.
2. Backend Services: Enforce server-side product exemption whitelist in `weighbridge.service.ts` to assign `PA_NOT_REQUIRED` strictly for registered Solar. Guard `warehouse.service.ts` to permit start only for `QC_VEHICLE_PASSED` or valid `PA_NOT_REQUIRED`, and route GSP completion directly to `WAREHOUSE_DONE`. Lock down `operation-log-correction.service.ts` to prevent product switching from bypassing PA and treat post-unloading corrections as auditable operational incidents.
3. Frontend Views: Dynamic PA Analysis modal in `QCVerification.vue` tailored per group, distinct neutral styling for `TIDAK PERLU PA` across Dashboard, Queue, Details, and History, and strict UI button gating in `GSPProcess.vue`.

**Tech Stack:** NestJS, TypeScript, Jest, Supertest, PostgreSQL, Prisma ORM, Vue 3, Vite, Vitest, Pinia, Tailwind CSS.

## Global Constraints
- Target Branch: Work strictly on dedicated branch `fix/gsp-process-audit-improvements` based on `origin/master` (`ae0b30c`).
- Zero Production Deployment / Merge: All changes, tests, and UAT are strictly restricted to local and UAT environments.
- Scope Limitation: Strictly limited to 4 groups (Batubara, Solar, PAC 280 AC / POLYCOR P9 / IPAC CIP A200, Rapid Klen / PRO-CIP B++). The 5th chemical group remains deferred.
- No False Passed Records: Solar MUST NEVER generate a `QC_VEHICLE_PASSED` or "Lulus QC/PA" audit record. It must unambiguously record `PA_NOT_REQUIRED` ("Tidak Perlu PA").
- Pre-Unloading Gating: Batubara, PAC, and Rapid Klen must be strictly blocked from starting warehouse unloading (`POST /api/warehouse/start/:id`) via both API and UI until a legitimate `RELEASE` status is recorded.
- Unratified Dependencies Gate:
  1. Specific ASTM standards (D3302 vs D3173, D3172), per-brand spec thresholds (Polycor P9, IPAC, PRO-CIP), and Utility authorization roles are treated as unratified business dependencies.
  2. Four-Eyes Principle: Approver must be distinct from the testing analyst (`dispositionById !== testedById`). Do not grant unilateral disposition authority to `ADMIN` on assumption.
- Auditable Operational Incidents: Product corrections after unloading has begun cannot physically undo the discharge; they must be recorded as auditable operational incidents with mandatory reason, evidence, and PIC.
- Preserve GBB & GBJ: The GBB 7-stage workflow (`INCOMING_CHECK_PENDING`) and GBJ loading flows must remain 100% intact.

---

## Migration, Legacy Data & Rollback Strategy

### 1. Database Schema Migration Plan
- Migration Name: `20260930000000_add_gsp_pa_and_statuses`
- DDL Actions:
  1. `ALTER TYPE "TransactionStatus" ADD VALUE 'PA_NOT_REQUIRED';`
  2. `ALTER TYPE "TransactionStatus" ADD VALUE 'QC_RETEST_REQUIRED';`
  3. `ALTER TYPE "TransactionStatus" ADD VALUE 'WAITING_UTILITY_DISPOSITION';`
  4. Create table `"QcProductAnalysis"` with foreign keys to `"Transaction"` and `"User"` (testedBy, dispositionBy).
- Safety Check: PostgreSQL supports appending values to enums without table rewrites (`ALTER TYPE ... ADD VALUE`).

### 2. Legacy Data Impact
- Existing completed transactions (`COMPLETED`, `CANCELLED`) remain unchanged.
- Existing historical GSP transactions will not be retroactively altered.
- Open GSP transactions in UAT database:
  - If status is `QC_VEHICLE_PENDING`, transactions will continue through the updated QC/PA flow.
  - Transactions currently in `INCOMING_CHECK_PENDING` will be completed under current rules or reset via standard UAT test reset.

### 3. Rollback Plan
- Prisma rollback migration script:
  - Drop table `"QcProductAnalysis"`.
  - Revert `workflow-state-machine.ts`, `weighbridge.service.ts`, and `warehouse.service.ts` to commit `bf65603`.
  - For PostgreSQL enum values, if rollback of enum is required in dev, restore DB from the automated backup `backups/pre_gsp_migration.sql`.

---

## Tasks Breakdown

### Task 1: Prisma Schema Migration & Product Catalog Exemption Policy

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260930000000_add_gsp_pa_and_statuses/migration.sql`
- Create: `backend/src/qc/constants/pa-exemption-policy.ts`
- Create: `backend/src/qc/constants/pa-exemption-policy.spec.ts`

**Interfaces:**
- Produces: `isProductPaExempt(processType: string, cargoType: string, cargoSubType: string): boolean`
- Produces: `PA_EXEMPTION_WHITELIST` constant with policy version `SOP-GSP-2026.1`.

- [ ] **Step 1: Write failing test for PA Exemption Policy**

```typescript
// backend/src/qc/constants/pa-exemption-policy.spec.ts
import { isProductPaExempt, getPaExemptionRule } from './pa-exemption-policy';

describe('PA Exemption Whitelist Policy', () => {
  it('returns true and policy metadata strictly for registered GSP Solar', () => {
    expect(isProductPaExempt('GSP', 'Fuel', 'Solar')).toBe(true);
    const rule = getPaExemptionRule('GSP', 'Fuel', 'Solar');
    expect(rule?.policyVersion).toBe('SOP-GSP-2026.1');
    expect(rule?.reason).toContain('Solar fuel delivery');
  });

  it('rejects arbitrary client strings or non-exempt cargo types', () => {
    expect(isProductPaExempt('GSP', 'Fuel', 'Solar Non-Standard')).toBe(false);
    expect(isProductPaExempt('GSP', 'Chemicals', 'PAC 280 AC')).toBe(false);
    expect(isProductPaExempt('GSP', 'Coal', 'Batubara')).toBe(false);
    expect(isProductPaExempt('GBB', 'Fuel', 'Solar')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix backend test backend/src/qc/constants/pa-exemption-policy.spec.ts`
Expected: FAIL (Cannot find module './pa-exemption-policy')

- [ ] **Step 3: Implement `backend/src/qc/constants/pa-exemption-policy.ts` and update `schema.prisma`**

Update `schema.prisma` to include new `TransactionStatus` enums and `QcProductAnalysis` model:
```prisma
enum TransactionStatus {
  REGISTERED
  WEIGH_IN_DONE
  QC_VEHICLE_PENDING
  QC_VEHICLE_IN_PROGRESS
  QC_VEHICLE_PASSED
  QC_VEHICLE_REJECTED
  PA_NOT_REQUIRED
  QC_RETEST_REQUIRED
  WAITING_UTILITY_DISPOSITION
  WAREHOUSE_IN_PROGRESS
  WAREHOUSE_DONE
  INCOMING_CHECK_PENDING
  INCOMING_CHECK_IN_PROGRESS
  INCOMING_CHECK_PASSED
  INCOMING_CHECK_REJECTED
  WEIGH_OUT_DONE
  COMPLETED
  CANCELLED
}

model QcProductAnalysis {
  id                    String        @id @default(uuid())
  transactionId         String
  testRound             Int           @default(1)
  productCategory       String
  productName           String
  parameters            Json
  result                QcResult
  status                String
  dispositionAction     String?
  dispositionReason     String?
  dispositionById       String?
  dispositionAt         DateTime?
  testedById            String?
  testedAt              DateTime      @default(now())
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  transaction           Transaction   @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  testedBy              User?         @relation("ProductAnalysisTestedBy", fields: [testedById], references: [id], onDelete: SetNull)
  dispositionBy         User?         @relation("ProductAnalysisDispositionBy", fields: [dispositionById], references: [id], onDelete: SetNull)

  @@index([transactionId])
  @@index([productCategory])
}
```

Implement `backend/src/qc/constants/pa-exemption-policy.ts`:
```typescript
export interface PaExemptionRule {
  processType: 'GSP';
  cargoType: 'Fuel';
  cargoSubType: 'Solar';
  policyVersion: string;
  reason: string;
  isPaRequired: false;
}

export const PA_EXEMPTION_WHITELIST: readonly PaExemptionRule[] = [
  {
    processType: 'GSP',
    cargoType: 'Fuel',
    cargoSubType: 'Solar',
    policyVersion: 'SOP-GSP-2026.1',
    reason: 'SOP Exemption Rule v1.0: Solar fuel delivery is exempt from laboratory PA analysis.',
    isPaRequired: false,
  },
] as const;

export function getPaExemptionRule(processType?: string | null, cargoType?: string | null, cargoSubType?: string | null): PaExemptionRule | null {
  if (processType !== 'GSP' || cargoType !== 'Fuel' || cargoSubType !== 'Solar') return null;
  return PA_EXEMPTION_WHITELIST.find(r => r.processType === processType && r.cargoType === cargoType && r.cargoSubType === cargoSubType) || null;
}

export function isProductPaExempt(processType?: string | null, cargoType?: string | null, cargoSubType?: string | null): boolean {
  return getPaExemptionRule(processType, cargoType, cargoSubType) !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test backend/src/qc/constants/pa-exemption-policy.spec.ts`
Expected: PASS

- [ ] **Step 5: Apply migration to local PostgreSQL database and generate Prisma client**

Run:
```bash
npx --prefix backend prisma migrate dev --name add_gsp_pa_and_statuses --create-only
npx --prefix backend prisma db push
npx --prefix backend prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/qc/constants/pa-exemption-policy*
git commit -m "feat(qc): add pa exemption policy and product analysis schema"
```

---

### Task 2: Backend Workflow State Machine & Transition Guards

**Files:**
- Modify: `backend/src/common/state-machine/workflow-state-machine.ts`
- Modify: `backend/src/common/state-machine/workflow-state-machine.spec.ts`

**Interfaces:**
- Produces: Updated `VALID_STATUS_TRANSITIONS` supporting `PA_NOT_REQUIRED`, `QC_RETEST_REQUIRED`, and `WAITING_UTILITY_DISPOSITION`.
- Consumes: `TransactionStatus` from `@prisma/client`.

- [ ] **Step 1: Write failing unit test in `workflow-state-machine.spec.ts`**

```typescript
// in backend/src/common/state-machine/workflow-state-machine.spec.ts
it('allows valid transitions for Solar bypass and Coal multi-round lab flow', () => {
  // Solar bypass
  expect(isValidStatusTransition(TransactionStatus.REGISTERED, TransactionStatus.PA_NOT_REQUIRED)).toBe(true);
  expect(isValidStatusTransition(TransactionStatus.PA_NOT_REQUIRED, TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(true);
  
  // Coal multi-round
  expect(isValidStatusTransition(TransactionStatus.QC_VEHICLE_PENDING, TransactionStatus.QC_RETEST_REQUIRED)).toBe(true);
  expect(isValidStatusTransition(TransactionStatus.QC_RETEST_REQUIRED, TransactionStatus.WAITING_UTILITY_DISPOSITION)).toBe(true);
  expect(isValidStatusTransition(TransactionStatus.WAITING_UTILITY_DISPOSITION, TransactionStatus.QC_VEHICLE_PASSED)).toBe(true);
  expect(isValidStatusTransition(TransactionStatus.WAITING_UTILITY_DISPOSITION, TransactionStatus.QC_VEHICLE_REJECTED)).toBe(true);

  // Illegal transitions
  expect(isValidStatusTransition(TransactionStatus.PA_NOT_REQUIRED, TransactionStatus.QC_VEHICLE_PASSED)).toBe(false);
  expect(isValidStatusTransition(TransactionStatus.QC_RETEST_REQUIRED, TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(false);
  expect(isValidStatusTransition(TransactionStatus.WAITING_UTILITY_DISPOSITION, TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix backend test backend/src/common/state-machine/workflow-state-machine.spec.ts`
Expected: FAIL

- [ ] **Step 3: Update `VALID_STATUS_TRANSITIONS` in `workflow-state-machine.ts`**

Update `backend/src/common/state-machine/workflow-state-machine.ts`:
```typescript
export const VALID_STATUS_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  REGISTERED: [
    TransactionStatus.WEIGH_IN_DONE,
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.PA_NOT_REQUIRED,
    TransactionStatus.CANCELLED,
  ],
  WEIGH_IN_DONE: [
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.PA_NOT_REQUIRED,
    TransactionStatus.CANCELLED,
  ],
  PA_NOT_REQUIRED: [
    TransactionStatus.WAREHOUSE_IN_PROGRESS,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_PENDING: [
    TransactionStatus.QC_VEHICLE_IN_PROGRESS,
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.QC_RETEST_REQUIRED,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_IN_PROGRESS: [
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.QC_RETEST_REQUIRED,
    TransactionStatus.CANCELLED,
  ],
  QC_RETEST_REQUIRED: [
    TransactionStatus.QC_VEHICLE_IN_PROGRESS,
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.WAITING_UTILITY_DISPOSITION,
    TransactionStatus.CANCELLED,
  ],
  WAITING_UTILITY_DISPOSITION: [
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_PASSED: [
    TransactionStatus.WAREHOUSE_IN_PROGRESS,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_REJECTED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  WAREHOUSE_IN_PROGRESS: [
    TransactionStatus.INCOMING_CHECK_PENDING,
    TransactionStatus.WAREHOUSE_DONE,
    TransactionStatus.CANCELLED,
  ],
  WAREHOUSE_DONE: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_PENDING: [
    TransactionStatus.INCOMING_CHECK_IN_PROGRESS,
    TransactionStatus.INCOMING_CHECK_PASSED,
    TransactionStatus.INCOMING_CHECK_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_IN_PROGRESS: [
    TransactionStatus.INCOMING_CHECK_PASSED,
    TransactionStatus.INCOMING_CHECK_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_PASSED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_REJECTED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  WEIGH_OUT_DONE: [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test backend/src/common/state-machine/workflow-state-machine.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/state-machine/workflow-state-machine*
git commit -m "feat(workflow): update state machine with pa exemption and retest transitions"
```

---

### Task 3: Weighbridge In & Warehouse Start/Complete Service Logic

**Files:**
- Modify: `backend/src/weighbridge/weighbridge.service.ts`
- Modify: `backend/src/warehouse/warehouse.service.ts`
- Create: `backend/src/warehouse/gsp-workflow.spec.ts`

**Interfaces:**
- `recordWeighIn`: assigns `PA_NOT_REQUIRED` strictly when `isProductPaExempt` is true, else `QC_VEHICLE_PENDING`.
- `startWarehouse`: permits starting when status is `QC_VEHICLE_PASSED` OR (`PA_NOT_REQUIRED` AND `isProductPaExempt`). Strictly blocks `QC_VEHICLE_PENDING`, `QC_RETEST_REQUIRED`, and `WAITING_UTILITY_DISPOSITION`.
- `completeWarehouse`: routes GSP directly to `WAREHOUSE_DONE` while keeping GBB at `INCOMING_CHECK_PENDING`.

- [ ] **Step 1: Write integration tests in `backend/src/warehouse/gsp-workflow.spec.ts`**

```typescript
// backend/src/warehouse/gsp-workflow.spec.ts
describe('GSP 4-Group Service Flow Tests', () => {
  it('assigns PA_NOT_REQUIRED to Solar at weigh-in and permits startWarehouse', async () => {
    // Assert status transition and activity log for Solar
  });

  it('strictly blocks Batubara, PAC, and Rapid Klen from startWarehouse prior to QC_VEHICLE_PASSED', async () => {
    // Expect BadRequestException if attempting startWarehouse while QC_VEHICLE_PENDING
  });

  it('routes GSP completion directly to WAREHOUSE_DONE and leaves GBB at INCOMING_CHECK_PENDING', async () => {
    // Complete warehouse for GSP and verify status is WAREHOUSE_DONE
    // Complete warehouse for GBB and verify status is INCOMING_CHECK_PENDING
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix backend test backend/src/warehouse/gsp-workflow.spec.ts`
Expected: FAIL

- [ ] **Step 3: Update `weighbridge.service.ts`**

In `backend/src/weighbridge/weighbridge.service.ts:240`:
```typescript
    let grossWeight: number | null = null;
    let tareWeight: number | null = null;
    let nextStatus: TransactionStatus;

    if (tx.processType === 'GSP' && isProductPaExempt(tx.processType, tx.cargoType, tx.cargoSubType)) {
      grossWeight = dto.weight;
      nextStatus = TransactionStatus.PA_NOT_REQUIRED;
    } else if (tx.processType === 'GBB' || tx.processType === 'GSP') {
      grossWeight = dto.weight;
      nextStatus = TransactionStatus.QC_VEHICLE_PENDING;
    } else if (tx.processType === 'GBJ') {
      tareWeight = dto.weight;
      nextStatus = TransactionStatus.QC_VEHICLE_PENDING;
    }
```
Add activity logging when `PA_NOT_REQUIRED` is applied:
```typescript
    if (nextStatus === TransactionStatus.PA_NOT_REQUIRED) {
      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'PA_EXEMPTION_APPLIED',
        module: 'WEIGHBRIDGE',
        referenceId: transactionId,
        description: 'SOP Exemption Rule v1.0: Solar fuel delivery is exempt from laboratory PA analysis.',
        status: 'SUCCESS',
      }).catch(() => {});
    }
```

- [ ] **Step 4: Update `warehouse.service.ts`**

In `startWarehouse` ([`warehouse.service.ts:240`](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/warehouse/warehouse.service.ts#L240)):
```typescript
    const isSolarExempt = tx.processType === 'GSP' && tx.status === TransactionStatus.PA_NOT_REQUIRED && isProductPaExempt(tx.processType, tx.cargoType, tx.cargoSubType);
    const isQcPassed = tx.status === TransactionStatus.QC_VEHICLE_PASSED;

    if (!isSolarExempt && !isQcPassed) {
      throw new BadRequestException({
        success: false,
        message: `Gudang tidak dapat memulai proses: Transaksi berstatus ${tx.status} belum memperoleh persetujuan RELEASE PA Analysis atau bukan produk berizin bypass PA.`,
        errors: [],
      });
    }

    assertValidStatusTransition(tx.status, TransactionStatus.WAREHOUSE_IN_PROGRESS);
```
In `completeWarehouse` ([`warehouse.service.ts:465`](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/warehouse/warehouse.service.ts#L465)):
```typescript
    let nextStatus: TransactionStatus;
    if (tx.processType === 'GBB') {
      nextStatus = TransactionStatus.INCOMING_CHECK_PENDING;
    } else {
      nextStatus = TransactionStatus.WAREHOUSE_DONE;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix backend test backend/src/warehouse/gsp-workflow.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/weighbridge/weighbridge.service.ts backend/src/warehouse/warehouse.service.ts backend/src/warehouse/gsp-workflow.spec.ts
git commit -m "feat(warehouse): guard gsp start and complete with pa exemption and direct warehouse_done"
```

---

### Task 4: Anti-Tamper & Auditable Operational Incident Handling in Corrections

**Files:**
- Modify: `backend/src/transactions/operation-log-correction.service.ts`
- Modify: `backend/src/transactions/operation-log-correction.service.spec.ts`

**Rules Enforced:**
1. If product is changed from exempt (Solar) to non-exempt (Batubara, PAC, Rapid Klen):
   - While still `PA_NOT_REQUIRED`: auto-downgrade status back to `QC_VEHICLE_PENDING`.
   - Once warehouse process has started (`WAREHOUSE_IN_PROGRESS`, `WAREHOUSE_DONE`, `COMPLETED`): **HARD BLOCK** standard product correction.
   - For post-unloading adjustments, only permit through an explicit *Operational Incident Procedure* (`RECORD_OPERATIONAL_INCIDENT`) requiring incident report reason, photo/document evidence, and supervisor acknowledgment. Never promise physical discharge cancellation.

- [ ] **Step 1: Write unit tests in `operation-log-correction.service.spec.ts`**

```typescript
it('auto-downgrades PA_NOT_REQUIRED to QC_VEHICLE_PENDING if product changed to Batubara before unloading', async () => {
  // test downgrade logic
});

it('strictly rejects standard product correction once warehouse has started and mandates operational incident handling', async () => {
  // test rejection and incident handling requirement
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix backend test backend/src/transactions/operation-log-correction.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement anti-tamper guards in `operation-log-correction.service.ts`**

Implement product correction checks:
- Verify cargo change semantics.
- Trigger status downgrade if changing from Solar to non-exempt prior to unloading.
- Reject product modification after `warehouseStartAt` is recorded, logging warning and requiring formal operational incident logging.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test backend/src/transactions/operation-log-correction.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/transactions/operation-log-correction.service*
git commit -m "feat(corrections): enforce anti-tamper on pa exemption and auditable operational incident handling"
```

---

### Task 5: QC/PA Multi-Round Analysis & Four-Eyes Disposition Service

**Files:**
- Create: `backend/src/qc/qc-product-analysis.service.ts`
- Create: `backend/src/qc/qc-product-analysis.controller.ts`
- Create: `backend/src/qc/dto/submit-product-analysis.dto.ts`
- Create: `backend/src/qc/dto/utility-disposition.dto.ts`
- Modify: `backend/src/qc/qc.module.ts`
- Create: `backend/src/qc/qc-product-analysis.spec.ts`

**Four-Eyes Principle Rule:**
- `submitUtilityDisposition`: Rejects with `ForbiddenException` if `user.id === productAnalysis.testedById` (tester cannot self-approve disposition). Requires authorized disposition officer role.

- [ ] **Step 1: Write unit tests in `qc-product-analysis.spec.ts`**

```typescript
it('creates testRound 1 for initial test and testRound 2 for retest', async () => { ... });
it('enforces Four-Eyes Principle: rejects disposition if user.id equals testedById', async () => { ... });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix backend test backend/src/qc/qc-product-analysis.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement `QcProductAnalysisService` and Controller**

Endpoints:
- `POST /api/qc/product-analysis/:transactionId` (Analis submit initial test or retest)
- `POST /api/qc/disposition/:transactionId` (Four-eyes disposition approval)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test backend/src/qc/qc-product-analysis.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/qc
git commit -m "feat(qc): implement multi-round product analysis and four-eyes utility disposition"
```

---

### Task 6: Frontend Status Display, UI Badges & Solar Exemption Neutrality

**Files:**
- Modify: `frontend/src/utils/statusLabel.js`
- Modify: `frontend/src/components/StatusBadge.vue`
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/views/GSPProcess.vue`
- Modify: `frontend/src/views/Dashboard.vue`
- Create: `frontend/src/__tests__/solar-exemption-badge.spec.js`

**Rules:**
- `PA_NOT_REQUIRED`:
  - Label: `"TIDAK PERLU PA"` (English/Technical: `"PA EXEMPTED"`).
  - Styling: Neutral Slate/Indigo background (`bg-slate-100 text-slate-700 border-slate-300`).
  - NEVER show green `QC PASSED` or "Lulus QC/PA".
- `GSPProcess.vue`:
  - Show "Mulai Bongkar GSP" button if `status === 'QC_VEHICLE_PASSED'` OR `status === 'PA_NOT_REQUIRED'`.
  - For Batubara, PAC, Rapid Klen: hide button and show "Menunggu Hasil QC/PA" badge when `QC_VEHICLE_PENDING`, `QC_RETEST_REQUIRED`, or `WAITING_UTILITY_DISPOSITION`.

- [ ] **Step 1: Write Vitest unit test in `solar-exemption-badge.spec.js`**

```javascript
import { describe, it, expect } from 'vitest';
import { getStatusLabel, getStatusBadgeClass } from '../utils/statusLabel';

describe('Solar PA Exemption Display Tests', () => {
  it('returns neutral "TIDAK PERLU PA" label and non-green badge class for PA_NOT_REQUIRED', () => {
    const label = getStatusLabel('PA_NOT_REQUIRED', 'GSP');
    expect(label).toBe('TIDAK PERLU PA');
    expect(label).not.toContain('LULUS');
    const badgeClass = getStatusBadgeClass('PA_NOT_REQUIRED');
    expect(badgeClass).not.toContain('bg-emerald');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix frontend test frontend/src/__tests__/solar-exemption-badge.spec.js`
Expected: FAIL

- [ ] **Step 3: Implement status label and component updates**

Update `statusLabel.js`, `StatusBadge.vue`, `TruckDetailsModal.vue`, and `GSPProcess.vue`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/__tests__/solar-exemption-badge.spec.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add neutral TIDAK PERLU PA badge and gsp button guards"
```

---

### Task 7: Frontend Dynamic QC/PA Form per Cargo Group

**Files:**
- Create: `frontend/src/components/qc/CoalAnalysisForm.vue`
- Create: `frontend/src/components/qc/ChemicalPacForm.vue`
- Create: `frontend/src/components/qc/ChemicalRapidKlenForm.vue`
- Modify: `frontend/src/views/QCVerification.vue`
- Create: `frontend/src/__tests__/qc-pa-forms.spec.js`

**Rules:**
- Dynamically render form matching the selected truck's group:
  - `Batubara`: Sensory (5 visual items), Moisture Analysis (Digital Moisture Analyzer with calorie selector), Proximate ASTM fields, Retest trigger, Utility disposition display.
  - `PAC`: Sensory (Visual, Foreign Matters, Kemasan), pH (3.5-5.0), Density (1.170-1.260), Al content (min 9%).
  - `Rapid Klen`: Sensory (Visual, Foreign Matters, Kemasan), Alkalinity Na2O (>35%), NaOH (>45.16%), pH (>12), Density (>1.400).
- Mark unratified standards and threshold values with helper tooltip `"Menunggu Pengesahan SOP Laboratorium SJA"`.

- [ ] **Step 1: Write Vitest tests in `qc-pa-forms.spec.js`**

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement components and connect into `QCVerification.vue`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --prefix frontend test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): dynamic qc-pa forms for coal, pac, and rapid klen"
```

---

### Task 8: Full End-to-End Automated Vitest & Jest Verification

**Files:**
- Run: Entire test suite across backend and frontend.

- [ ] **Step 1: Run all backend tests**

Run: `npm --prefix backend test`
Expected: All backend unit and e2e test suites PASS (0 failures).

- [ ] **Step 2: Run all frontend tests**

Run: `npm --prefix frontend test`
Expected: All frontend test suites PASS (0 failures).

- [ ] **Step 3: Build frontend production bundle**

Run: `npm --prefix frontend run build`
Expected: Build succeeds without TypeScript or asset errors.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "test(all): verify complete test suite passes for gsp 4 groups workflow"
```

---

### Task 9: Real Browser UAT Protocol for 4 Groups

**Files:**
- Execute automated browser testing via Chrome CDP on `http://localhost:8081`.
- Capture full evidence screenshots to `artifacts/screenshots_uat_gsp_4groups/`.

**Test Scenarios:**
1. **Skenario 1 (Solar — Happy Path Bypass PA):**
   - Register Truck `B9301SLR` (Cargo: `Fuel`, Sub: `Solar`).
   - Weigh-in gross: 25,000 kg.
   - Verify status beralih ke `PA_NOT_REQUIRED` (Badge: "TIDAK PERLU PA", no QC queue entry).
   - In GSP Process: Click "Mulai Bongkar GSP", status beralih ke `WAREHOUSE_IN_PROGRESS` (waktu `warehouseStartAt` tercatat tepat saat klik).
   - Complete warehouse: verify status beralih ke `WAREHOUSE_DONE` (NO incoming check pending).
   - Weigh-out tare: 10,000 kg ➔ `WEIGH_OUT_DONE`.
   - Gate-out: `COMPLETED`.
2. **Skenario 2 (PAC 280 AC — Happy Path Lolos QC/PA):**
   - Register Truck `B9302PAC` (Cargo: `Chemicals`, Sub: `PAC 280 AC`).
   - Weigh-in gross: 22,000 kg ➔ Status `QC_VEHICLE_PENDING`.
   - In GSP Process: verify "Mulai Bongkar" button is hidden/disabled.
   - In QC Verification: Open PA form, enter Sensory OK, pH 4.25, Density 1.25, click `RELEASE`.
   - Status beralih ke `QC_VEHICLE_PASSED`.
   - In GSP Process: "Mulai Bongkar GSP" button becomes active.
   - Complete warehouse ➔ `WAREHOUSE_DONE` ➔ Weigh-out ➔ Gate-out.
3. **Skenario 3 (Rapid Klen — Penolakan QC/PA):**
   - Register Truck `B9303RPD` (Cargo: `Chemicals`, Sub: `RAPID KLEEN`).
   - Weigh-in gross: 20,000 kg ➔ Status `QC_VEHICLE_PENDING`.
   - In QC Verification: Enter Alkalinity 28% (< 35%), click `REJECT`.
   - Status beralih ke `QC_VEHICLE_REJECTED`.
   - In GSP Process: Unloading blocked permanently.
   - Directed immediately to Weigh-out ➔ Gate-out.
4. **Skenario 4 (Batubara — Deviasi Kadar Air ➔ Uji Ulang ➔ Disposisi Utility):**
   - Register Truck `B9304COAL` (Cargo: `Coal`, Sub: `Batubara`).
   - Weigh-in gross: 30,000 kg ➔ Status `QC_VEHICLE_PENDING`.
   - QC Initial Test: Moisture 36% (> 33%) ➔ Status beralih ke `QC_RETEST_REQUIRED`.
   - In GSP Process: Unloading blocked.
   - QC Retest: Result 35% (> 33%) ➔ Status beralih ke `WAITING_UTILITY_DISPOSITION`.
   - Four-Eyes Disposition: Authorized Utility officer enters disposition acceptance ➔ Status beralih ke `QC_VEHICLE_PASSED`.
   - In GSP Process: "Mulai Bongkar GSP" becomes active.
   - Complete warehouse ➔ `WAREHOUSE_DONE` ➔ Weigh-out ➔ Gate-out.
5. **Skenario 5 (Anti-Tamper Product Correction):**
   - Register as Solar ➔ Weigh-in (`PA_NOT_REQUIRED`).
   - Attempt to correct product to Batubara: verify status downgrades to `QC_VEHICLE_PENDING`.
   - Test that once unloading has started, product change is blocked and routed to operational incident logging.

- [ ] **Step 1: Execute CDP automated runner for all 5 scenarios**
- [ ] **Step 2: Collect screenshots and verify DB logs**
- [ ] **Step 3: Document UAT report in `artifacts/laporan_uat_gsp_4_kelompok.md`**
