# Remove Utility from Active GSP Flow Implementation Plan

## Goal
Completely remove Utility disposition from the active GSP workflow across backend, frontend, and test suites. Ensure new canonical GSP transactions never enter `WAITING_UTILITY_DISPOSITION` and enforce server-authoritative 2-round evaluation for Coal (`COAL_PA`) where Round 2 out-of-spec strictly transitions to `QC_VEHICLE_REJECTED`. Maintain backward compatibility for legacy records and retain strict fail-closed governance for chemical specifications without creating Utility roles or approvals.

## User & Scope Requirements
1. **Target GSP Lifecycle**:
   - `SECURITY` -> `TIMBANG IN` -> `GSP` -> `QC / PA` -> `BONGKAR` -> `TIMBANG OUT` -> `SECURITY OUT`
2. **Coal (`COAL_PA`) Branch**:
   - Round 1 compliant -> `QC_VEHICLE_PASSED` -> Bongkar
   - Round 1 out-of-spec -> `QC_RETEST_REQUIRED`
   - Round 2 compliant -> `QC_VEHICLE_PASSED` -> Bongkar
   - Round 2 out-of-spec -> `QC_VEHICLE_REJECTED` (Muatan ditolak, stop process)
   - Zero `WAITING_UTILITY_DISPOSITION` for new Coal flow.
3. **Solar (`PA_EXEMPT`)**:
   - `REGISTERED` -> `WEIGH IN` -> `PA_NOT_REQUIRED` -> `warehouse/unloading` -> `WEIGH OUT` -> `COMPLETED`. No QC PA, no Utility.
4. **Chemicals (`PAC_PA` and `RAPID_KLEN_PA`)**:
   - Never route to `WAITING_UTILITY_DISPOSITION`.
   - If approved specification exists -> `QC_VEHICLE_PASSED` (compliant) or `QC_VEHICLE_REJECTED` (non-compliant).
   - If operational specification is `PENDING_SIGNOFF` -> fail-closed with `BadRequestException` (governance blocker), NEVER route to Utility disposition.
5. **Frontend UI**:
   - Remove `btn-open-utility-disposition` from `QCVerification.vue`.
   - Update `CoalAnalysisForm.vue` to show `#btn-coal-reject` instead of Utility disposition on Round 2 moisture exceeded.
   - Show explicit informative cards for `QC_VEHICLE_PASSED` and `QC_VEHICLE_REJECTED` in `QCVerification.vue`.
   - Ensure `UtilityDispositionModal` is not reachable from active GSP flows.
6. **Legacy Safety**:
   - Keep enum `WAITING_UTILITY_DISPOSITION` in DB and `VALID_STATUS_TRANSITIONS` for historical records only.

---

## Detailed Task Breakdown

### Task 1: Backend Evaluation & Service Logic
- **Files**:
  - `backend/src/qc/constants/coal-specification.ts`
  - `backend/src/qc/qc-product-analysis.service.ts`
- **Changes**:
  1. In `coal-specification.ts`:
     - Set `OPERATIONAL_COAL_SPEC_METADATA.approvalStatus = 'APPROVED'`.
     - Update `evaluateCoalAnalysis`:
       - If `isWithinSpec`: return `result: 'PASS'`, `decision: 'RELEASE'`.
       - If `!isWithinSpec`:
         - if `!params.sensoryPassed`: return `result: 'REJECT'`, `decision: 'REJECT'`.
         - if `params.testRound === 1`: return `result: 'REJECT'`, `decision: 'RETEST_REQUIRED'`.
         - if `params.testRound >= 2`: return `result: 'REJECT'`, `decision: 'REJECT'`.
  2. In `qc-product-analysis.service.ts`:
     - Update `switch (authoritativeDecision)`:
       - `AnalysisDecision.PENDING_DISPOSITION`: Throw `BadRequestException` with governance blocker message instead of transitioning to `WAITING_UTILITY_DISPOSITION`.
       - Ensure new GSP transactions never produce `WAITING_UTILITY_DISPOSITION`.

### Task 2: Backend Unit & Integration Tests
- **Files**:
  - `backend/src/qc/constants/coal-specification.spec.ts`
  - `backend/src/qc/qc-product-analysis.spec.ts`
  - `backend/test/gsp-4groups-uat.spec.ts`
  - `backend/src/warehouse/gsp-workflow.spec.ts`
  - `backend/test/gsp-adversarial-negative-path.spec.ts`
  - `backend/test/gsp-utility-removal-regression.spec.ts` (new dedicated suite)
- **Changes**:
  1. Update existing tests in `coal-specification.spec.ts` to assert `REJECT` on Round 2 exceeded instead of `PENDING_DISPOSITION`.
  2. Update `qc-product-analysis.spec.ts` to assert:
     - Round 1 OOS -> `QC_RETEST_REQUIRED`
     - Round 2 OOS -> `QC_VEHICLE_REJECTED`
     - Round 1 PASS -> `QC_VEHICLE_PASSED`
     - Round 2 PASS -> `QC_VEHICLE_PASSED`
  3. Create dedicated regression suite `gsp-utility-removal-regression.spec.ts` verifying all 8 invariants:
     - Case 1: Coal Round 1 PASS -> `QC_VEHICLE_PASSED`
     - Case 2: Coal Round 1 OOS -> `QC_RETEST_REQUIRED`
     - Case 3: Coal Round 2 PASS -> `QC_VEHICLE_PASSED`
     - Case 4: Coal Round 2 OOS -> `QC_VEHICLE_REJECTED` (Assert: NEVER `WAITING_UTILITY_DISPOSITION`)
     - Case 5: Solar -> `PA_NOT_REQUIRED`
     - Case 6: PAC compliant with approved spec -> `QC_VEHICLE_PASSED`
     - Case 7: PAC OOS with approved spec -> `QC_VEHICLE_REJECTED`
     - Case 8: PAC with pending spec -> fail-closed BadRequestException (NEVER `WAITING_UTILITY_DISPOSITION`)
     - Case 9: Rapid Klen with pending spec -> fail-closed BadRequestException (NEVER `WAITING_UTILITY_DISPOSITION`)
  4. Update `gsp-4groups-uat.spec.ts` scenario 4 to test Round 2 OOS -> `QC_VEHICLE_REJECTED` instead of `WAITING_UTILITY_DISPOSITION`.

### Task 3: Frontend Cleanup
- **Files**:
  - `frontend/src/views/QCVerification.vue`
  - `frontend/src/components/qc/CoalAnalysisForm.vue`
  - `frontend/src/__tests__/qc-pa-forms.spec.js`
  - `frontend/src/__tests__/qc-gsp-pa-flow.spec.js`
  - `frontend/src/__tests__/qc-profile-routing.spec.js`
- **Changes**:
  1. In `QCVerification.vue`:
     - Remove active button `#btn-open-utility-disposition`.
     - Add explicit informative status cards for `QC_VEHICLE_PASSED` and `QC_VEHICLE_REJECTED`.
  2. In `CoalAnalysisForm.vue`:
     - Remove Utility disposition button and update to `#btn-coal-reject` with text "Hasil di atas batas pada Uji Ulang — Muatan Ditolak (REJECT)".
     - Update helper text to remove Utility disposition mention.
  3. Update frontend tests to verify that Utility buttons are completely absent and rejection button is rendered.

### Task 4: Scripts & CI Smoke Tests Alignment
- **Files**:
  - `scripts/ci-e2e-smoke.js`
  - `backend/scripts/run-live-browser-uat.mjs`
- **Changes**:
  1. Align `ci-e2e-smoke.js` to ensure Batubara and chemical test assertions match new status transitions.
  2. Verify that live browser UAT runs and passes 100%.

### Task 5: Verification & Remote CI Push
- Run full backend tests (`npm test` in `backend`).
- Run full frontend tests (`npm run test:unit` in `frontend`).
- Run lint checks.
- Commit all changes cleanly.
- Push to remote `fix/gsp-process-audit-improvements`.
- Monitor GitHub Actions CI run until 10/10 jobs pass.
- Verify PR #27 remains OPEN.
