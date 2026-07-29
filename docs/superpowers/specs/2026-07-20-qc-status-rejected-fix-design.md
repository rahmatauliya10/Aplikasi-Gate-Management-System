# Design Spec: Fix QC Rejected Status Displaying as Pending

## 1. Problem Description
During quality control (QC) check execution, if a truck is rejected (i.e. status is `REJECT` or `REJECTED`), the Quality Analysis card in the `TruckDetailsModal.vue` incorrectly shows the status as `PENDING`. 

### Root Cause
1. In `History.vue`, the `qcDetails` object mapped dynamically onto the `truck` object is incomplete:
   ```javascript
   qcDetails = {
     kadarAir: im.moisture,
     totalFM: im.foreignMatter,
     bijiOK: im.beanCondition === 'PASS' || im.result === 'PASS' ? 100 : 0,
     pic: im.checkedBy?.name || 'N/A'
   }
   ```
   This object lacks the `status` and `note` fields entirely.
2. In `TruckDetailsModal.vue`, the computed property `qcDetails` returns `props.truck.qcDetails` directly if it exists:
   ```javascript
   if (props.truck?.qcDetails) return props.truck.qcDetails;
   ```
   Because it returns this incomplete object directly, the modal template evaluates `qcDetails.status` as `undefined` (falsy), falling back to `'PENDING'`:
   ```vue
   {{ qcDetails.status || 'PENDING' }}
   ```
   This overrides the relation data check fallback which would otherwise map `check.result` (e.g. `'REJECT'`).

---

## 2. Proposed Design

### Option A: Complete the Mapping in History.vue and Safely Merge in TruckDetailsModal.vue (Recommended)
We will update `History.vue` to map the `status` and `note` fields correctly. Furthermore, we will update the computed `qcDetails` in `TruckDetailsModal.vue` to dynamically merge `props.truck.qcDetails` with details parsed from `incomingMaterialChecks` or `qcVehicleChecks` relations to guarantee all metrics (like `bau`, `warna`, `status`, `note`) are present, even when accessed via `History.vue`.

**Trade-offs**: 
- **Pros**: Solves the bug completely regardless of which view mounts `TruckDetailsModal`.
- **Cons**: Modifies two frontend files slightly, but is extremely robust and future-proof.

### Option B: Fix Only History.vue
We only modify `History.vue` to include the `status` and `note` fields when building `qcDetails`.

**Trade-offs**:
- **Pros**: Minimal changes.
- **Cons**: If other views in the future construct custom `qcDetails` without all parameters, the modal will break/show incorrect labels again.

---

## 3. Detailed Changes

### 3.1 Modify [History.vue](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/frontend/src/views/History.vue)
Include `status` and `note` properties inside `qcDetails` constructor:
```javascript
// GBB / GSP
qcDetails = {
  status: im.result,
  note: im.notes || im.defectNotes || '',
  kadarAir: im.moisture,
  totalFM: im.foreignMatter,
  bijiOK: im.beanCondition === 'PASS' || im.result === 'PASS' ? 100 : 0,
  pic: im.checkedBy?.name || 'N/A'
}

// GBJ
qcDetails = {
  status: qv.result,
  note: qv.notes || '',
  kadarAir: null,
  totalFM: null,
  bijiOK: qv.result === 'PASS' ? 100 : 0,
  pic: qv.checkedBy?.name || 'N/A'
}
```

### 3.2 Modify [TruckDetailsModal.vue](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/frontend/src/components/TruckDetailsModal.vue)
Enhance `qcDetails` computed property to safely merge parameters and fallback to relations if fields are missing:
```javascript
const qcDetails = computed(() => {
  const sourceDetails = props.truck?.qcDetails;
  let relationDetails = null;

  // Extract from relations if present
  if (props.truck?.incomingMaterialChecks && props.truck.incomingMaterialChecks.length > 0) {
    const check = props.truck.incomingMaterialChecks[0];
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      bijiOK: check.sampleWeight
    };
  } else if (props.truck?.qcVehicleChecks && props.truck.qcVehicleChecks.length > 0) {
    const check = props.truck.qcVehicleChecks[0];
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || '',
      kadarAir: null,
      totalFM: null,
      bijiOK: check.result === 'PASS' ? 100 : 0
    };
  }

  // Merge sourceDetails and relationDetails if both exist
  if (sourceDetails && relationDetails) {
    return {
      ...relationDetails,
      ...sourceDetails,
      status: sourceDetails.status || relationDetails.status,
      note: sourceDetails.note !== undefined ? sourceDetails.note : relationDetails.note,
      bau: sourceDetails.bau !== undefined ? sourceDetails.bau : relationDetails.bau,
      warna: sourceDetails.warna !== undefined ? sourceDetails.warna : relationDetails.warna,
      pic: sourceDetails.pic && sourceDetails.pic !== 'N/A' ? sourceDetails.pic : relationDetails.pic
    };
  }

  return sourceDetails || relationDetails;
});
```

---

## 4. Verification Plan
- Open History view, click on a rejected truck, and verify that the Quality Analysis card shows the red `REJECT` or `REJECTED` status banner rather than the blue `PENDING` button.
- Check normal dashboard/weighbridge views for both GBB and GBJ processes to verify that their detail modals still correctly display QC status.
