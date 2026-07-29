# Design Spec: Fix Warehouse Unloading Reject Bug

## 1. Problem Description
During GBB / GSP warehouse unloading process, the transaction status is `WAREHOUSE_IN_PROGRESS`. If the warehouse worker detects a non-compliant sampling parameter (e.g. live lice / "kutu hidup") and tries to reject the truck, the "Reject" button does not execute the action.

### Root Cause
1. The frontend (`GBBProcess.vue` and `GSPProcess.vue`) makes a POST request to `/api/warehouse/incoming-check/:transactionId` with payload `{ decision: 'rejected', rejectReason: ... }`.
2. The backend service method `submitIncomingCheck` in `warehouse.service.ts` validates the status strictly:
   ```typescript
   if (tx.status !== 'INCOMING_CHECK_PENDING') {
     throw new BadRequestException({ ... });
   }
   ```
   Since the status is `WAREHOUSE_IN_PROGRESS`, the backend throws a `BadRequestException` and the action fails.

---

## 2. Proposed Design
We will update `warehouse.service.ts` to allow the `/warehouse/incoming-check/:transactionId` endpoint to accept transactions in `WAREHOUSE_IN_PROGRESS` status ONLY when the decision is `'rejected'`. This maintains strict security because:
- Approved transitions (`decision === 'passed'`) still require `INCOMING_CHECK_PENDING` (which is set after the unloading process finishes successfully).
- Only rejections are allowed to shortcut from `WAREHOUSE_IN_PROGRESS` directly to `INCOMING_CHECK_REJECTED` to abort the process early.
- User authorization (role check and warehouse access permissions) is fully preserved.

---

## 3. Detailed Changes

### 3.1 Modify [warehouse.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/warehouse/warehouse.service.ts)
Update the allowed status check in `submitIncomingCheck`:
```typescript
    const allowedStatuses = ['INCOMING_CHECK_PENDING'];
    if (dto.decision === 'rejected') {
      allowedStatuses.push('WAREHOUSE_IN_PROGRESS');
    }

    if (!allowedStatuses.includes(tx.status)) {
      throw new BadRequestException({
        success: false,
        message: `Transaction must be in [${allowedStatuses.join(', ')}] status (current: ${tx.status})`,
        errors: [],
      });
    }
```

---

## 4. Verification Plan
- Attempt to reject a truck in GBB/GSP Process queue (during `WAREHOUSE_IN_PROGRESS`) and verify it completes successfully, redirecting the truck to the outbound weighbridge.
- Ensure that passing a check still correctly requires `INCOMING_CHECK_PENDING` status.
