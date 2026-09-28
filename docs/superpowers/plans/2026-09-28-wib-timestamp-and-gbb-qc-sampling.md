# WIB Timestamp Standardization & GBB/GSP QC Sampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize GMS timestamps on Asia/Jakarta (WIB) 24-hour format across all views, ensure midnight WIB sequence resets and History filter boundaries, and present GBB/GSP preliminary inspection as QC Sampling without database schema migrations.

**Architecture:** Presentation Layer Translation with Centralized Plant Day Utility. Internal state machine and database enums retain canonical `QC_VEHICLE_*` status. Pure utilities `plant-day.util.ts` and `displayTime.js` / `statusLabel.js` guarantee deterministic timezone handling across backend and frontend.

**Tech Stack:** NestJS, TypeScript, Jest, Vue 3, Vite, Vitest, Tailwind CSS, PostgreSQL, Prisma ORM.

## Global Constraints
- Zero database DDL migration (no changes to `schema.prisma` or PostgreSQL enum types).
- All timestamps stored in database remain absolute UTC instants (PostgreSQL `DateTime` / `TIMESTAMP(3)`).
- Timezone representation: strictly `Asia/Jakarta` (UTC+07:00), 24-hour format (`HH.mm` or `HH.mm.ss`).
- Tampilan registrasi: tanggal lengkap + jam 24 jam + penanda `WIB` (contoh: `24 Sep 2026 00.30 WIB`).
- GBB and GSP display label: `QC SAMPLING *`. GBJ display label: `QC VEHICLE *`.
- Do not modify or break `backend/src/dashboard/utils/dashboard-date-range.util.ts`.
- Code changes must be based on latest `origin/master` (`8050dc63c1ac0396f872a5ed9632d64198ecb0cc`).

---

### Task 1: Backend Plant Day Utility & Gate Service Rollover

**Files:**
- Create: `backend/src/common/utils/plant-day.util.ts`
- Create: `backend/src/common/utils/plant-day.util.spec.ts`
- Modify: `backend/src/gate/gate.service.ts`

**Interfaces:**
- Produces: `getPlantDay(now?: Date): { dateKey: string; start: Date; end: Date }`
  - `dateKey`: `YYYYMMDD` formatted string in Asia/Jakarta.
  - `start`: Date object representing 00:00:00 WIB of the current day.
  - `end`: Date object representing 00:00:00 WIB of the next day.

- [ ] **Step 1: Write failing unit test for `plant-day.util`**

```typescript
// backend/src/common/utils/plant-day.util.spec.ts
import { getPlantDay } from './plant-day.util';

describe('WIB operational day boundaries', () => {
  it('uses the next local date after 17:00 UTC for dashboard and transaction IDs', () => {
    expect(getPlantDay(new Date('2026-09-23T16:59:59.000Z'))).toEqual({
      dateKey: '20260923',
      start: new Date('2026-09-22T17:00:00.000Z'),
      end: new Date('2026-09-23T17:00:00.000Z'),
    });
    expect(getPlantDay(new Date('2026-09-23T17:00:00.000Z'))).toEqual({
      dateKey: '20260924',
      start: new Date('2026-09-23T17:00:00.000Z'),
      end: new Date('2026-09-24T17:00:00.000Z'),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend test backend/src/common/utils/plant-day.util.spec.ts`
Expected: FAIL (Cannot find module './plant-day.util')

- [ ] **Step 3: Implement `backend/src/common/utils/plant-day.util.ts`**

```typescript
// Indonesia western time has a fixed UTC+07:00 offset (no daylight saving time).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getPlantDay(now: Date = new Date()) {
  const localDate = new Date(now.getTime() + WIB_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const start = new Date(`${localDate}T00:00:00.000Z`);
  start.setTime(start.getTime() - WIB_OFFSET_MS);
  return {
    dateKey: localDate.replace(/-/g, ''),
    start,
    end: new Date(start.getTime() + DAY_MS),
  };
}
```

- [ ] **Step 4: Update `GateService.generateTransactionNumber`**

In `backend/src/gate/gate.service.ts`:
Replace:
```typescript
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `GMS-${dateStr}-`;

    const count = await txClient.transaction.count({
      where: {
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lt: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
    });
```
With:
```typescript
    const { dateKey, start, end } = getPlantDay();
    const prefix = `GMS-${dateKey}-`;

    const count = await txClient.transaction.count({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix backend test backend/src/common/utils/plant-day.util.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/src/common/utils/plant-day.util.ts backend/src/common/utils/plant-day.util.spec.ts backend/src/gate/gate.service.ts
git commit -m "fix(gate): use WIB plant day boundary for daily transaction number generation"
```

---

### Task 2: Backend QC Audit Trail Process Discrimination

**Files:**
- Modify: `backend/src/qc/qc.service.ts`

- [ ] **Step 1: Update QC Vehicle Status History Notes**

In `backend/src/qc/qc.service.ts`:
Update vehicle check status history notes:
```typescript
notes: `${tx.processType === 'GBJ' ? 'Vehicle Check' : 'Initial QC Sampling'}: ${result}`,
```

- [ ] **Step 2: Run backend tests for QC module**

Run: `npm --prefix backend test backend/src/qc`
Expected: PASS

- [ ] **Step 3: Commit Task 2**

```bash
git add backend/src/qc/qc.service.ts
git commit -m "fix(qc): label status history as Initial QC Sampling for GBB and GSP"
```

---

### Task 3: Frontend Time and Status Label Utilities

**Files:**
- Create: `frontend/src/utils/displayTime.js`
- Create: `frontend/src/utils/statusLabel.js`
- Create: `frontend/src/utils/__tests__/displayTime.spec.js`

**Interfaces:**
- Produces:
  - `formatPlantTime(value, withSeconds?: boolean): string`
  - `formatPlantDate(value): string`
  - `plantDateKey(value): string`
  - `formatPlantDateTime(value): string`
  - `plantClockParts(value?: Date): { hour: string; minute: string; second: string }`
  - `getStatusLabel(status: string, processType?: string): string`

- [ ] **Step 1: Write failing unit test for `displayTime` and `statusLabel`**

```javascript
// frontend/src/utils/__tests__/displayTime.spec.js
import { describe, expect, it } from 'vitest'
import { formatPlantDateTime, formatPlantTime, plantClockParts, plantDateKey } from '../displayTime'
import { getStatusLabel } from '../statusLabel'

describe('GMS display conventions', () => {
  it('shows registration at the same WIB instant across browser time zones', () => {
    expect(formatPlantDateTime('2026-09-23T17:30:00.000Z')).toBe('24 Sep 2026 00.30 WIB')
    expect(formatPlantTime('2026-09-24T05:22:29.000Z', true)).toBe('12.22.29')
    expect(plantClockParts('2026-09-23T17:30:00.000Z')).toEqual({ hour: '00', minute: '30', second: '00' })
    expect(plantDateKey('2026-09-23T17:30:00.000Z')).toBe('2026-09-24')
    expect(formatPlantDateTime(null)).toBe('-')
  })

  it('names the GBB and GSP checkpoint as sampling, while GBJ remains vehicle inspection', () => {
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GBB')).toBe('QC SAMPLING PASSED')
    expect(getStatusLabel('QC_VEHICLE_REJECTED', 'GSP')).toBe('QC SAMPLING REJECTED')
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GBJ')).toBe('QC VEHICLE PASSED')
    expect(getStatusLabel('REGISTERED', 'GBB')).toBe('REGISTERED')
  })
})
```

- [ ] **Step 2: Run vitest to verify it fails**

Run: `npm --prefix frontend run test:unit src/utils/__tests__/displayTime.spec.js`
Expected: FAIL

- [ ] **Step 3: Implement `frontend/src/utils/displayTime.js`**

```javascript
// Operational timestamps are stored as absolute instants (ISO/UTC) and shown in plant time.
export const PLANT_TIME_ZONE = 'Asia/Jakarta'

const parseTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatPlantTime = (value, withSeconds = false) => {
  const date = parseTime(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23'
  }).format(date)
}

export const formatPlantDate = (value) => {
  const date = parseTime(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(date)
}

export const plantDateKey = (value) => {
  const date = parseTime(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLANT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

export const formatPlantDateTime = (value) => {
  const date = parseTime(value)
  return date ? `${formatPlantDate(date)} ${formatPlantTime(date)} WIB` : '-'
}

export const plantClockParts = (value = new Date()) => {
  const date = parseTime(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(part => ['hour', 'minute', 'second'].includes(part.type)).map(part => [part.type, part.value]))
}
```

- [ ] **Step 4: Implement `frontend/src/utils/statusLabel.js`**

```javascript
// The shared database state records the preliminary QC checkpoint for every process.
// GBB/GSP perform initial sampling here; GBJ performs a vehicle inspection.
export const getStatusLabel = (status, processType) => {
  if (!status) return '-'
  const displayStatus = ['GBB', 'GSP'].includes(processType) && status.startsWith('QC_VEHICLE_')
    ? status.replace('QC_VEHICLE_', 'QC_SAMPLING_')
    : status
  return displayStatus.replace(/_/g, ' ')
}
```

- [ ] **Step 5: Run vitest to verify it passes**

Run: `npm --prefix frontend run test:unit src/utils/__tests__/displayTime.spec.js`
Expected: PASS

- [ ] **Step 6: Commit Task 3**

```bash
git add frontend/src/utils/displayTime.js frontend/src/utils/statusLabel.js frontend/src/utils/__tests__/displayTime.spec.js
git commit -m "feat(ui): add centralized plant time and QC status label utilities"
```

---

### Task 4: Frontend Core View Alignment (Gate, Dashboard, Layout, Modal, Form)

**Files:**
- Modify: `frontend/src/components/StatusBadge.vue`
- Modify: `frontend/src/components/TruckDetailsModal.vue`
- Modify: `frontend/src/components/TruckForm.vue`
- Modify: `frontend/src/layouts/MainLayout.vue`
- Modify: `frontend/src/views/Dashboard.vue`
- Modify: `frontend/src/views/GateCheckIn.vue`

- [ ] **Step 1: Update `StatusBadge.vue`**
- Import `getStatusLabel` from `../utils/statusLabel`
- Use `computed(() => getStatusLabel(props.status, props.processType))`

- [ ] **Step 2: Update `TruckDetailsModal.vue`**
- Import `formatPlantDate`, `formatPlantTime` from `../utils/displayTime`
- Update `formatTimeFull`: `${formatPlantTime(d, true)}, ${formatPlantDate(d)} WIB`
- Update `allowedReopenTargets`: dynamically inspect `selectedTruck?.processType` or fallback. If GBJ -> `QC Vehicle Pending (Menunggu QC Kendaraan)`, if GBB/GSP -> `QC Sampling Pending (Menunggu Sampling Awal)`.

- [ ] **Step 3: Update `TruckForm.vue`**
- Import `formatPlantDate`, `formatPlantTime` from `../utils/displayTime`
- In `updateDateTime`: `form.entryDate = formatPlantDate(now)`, `form.entryTime = formatPlantTime(now)`

- [ ] **Step 4: Update `MainLayout.vue`**
- Import `plantClockParts`, `PLANT_TIME_ZONE` from `../utils/displayTime`
- Update `updateClock`: extract `hour`, `minute`, `second` from `plantClockParts(now)`
- Add `WIB` badge next to the clock display

- [ ] **Step 5: Update `Dashboard.vue`**
- Import `formatPlantDateTime` from `../utils/displayTime`
- Import `getStatusLabel` from `../utils/statusLabel`
- Header column: `Registered (WIB)`
- Table cells: use `formatPlantDateTime(truck?.gateInAt || truck?.createdAt)`
- Table status text: use `getStatusLabel(truck?.status, truck?.processType)`

- [ ] **Step 6: Update `GateCheckIn.vue`**
- Import `formatPlantDate`, `formatPlantDateTime` from `../utils/displayTime`
- Import `getStatusLabel` from `../utils/statusLabel`
- Header tracker: `formatPlantDate(new Date())`
- Column header: `REGISTERED (WIB)` (width `w-[165px]`)
- Table cells: `formatPlantDateTime(getEntryTimestamp(truck))`
- Step label: `getStatusLabel(truck.step || truck.status, getProcessType(truck)).toUpperCase()`
- Duration calculation: `diff = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000))`

- [ ] **Step 7: Run frontend unit tests and verify**

Run: `npm --prefix frontend run test:unit`
Expected: PASS

- [ ] **Step 8: Commit Task 4**

```bash
git add frontend/src/components/StatusBadge.vue frontend/src/components/TruckDetailsModal.vue frontend/src/components/TruckForm.vue frontend/src/layouts/MainLayout.vue frontend/src/views/Dashboard.vue frontend/src/views/GateCheckIn.vue
git commit -m "fix(ui): standardize registration time to WIB 24h and align QC labels in core views"
```

---

### Task 5: Frontend Warehouse & History Views Alignment

**Files:**
- Modify: `frontend/src/views/GBBProcess.vue`
- Modify: `frontend/src/views/GSPProcess.vue`
- Modify: `frontend/src/views/GBJProcess.vue`
- Modify: `frontend/src/views/QCVerification.vue`
- Modify: `frontend/src/views/Weighbridge.vue`
- Modify: `frontend/src/views/History.vue`

- [ ] **Step 1: Update Warehouse & QC Views**
- In `GBBProcess.vue`, `GSPProcess.vue`, `GBJProcess.vue`, `QCVerification.vue`, `Weighbridge.vue`:
  - Import `formatPlantTime` from `../utils/displayTime`
  - Set `const formatTime = formatPlantTime`

- [ ] **Step 2: Update `History.vue`**
- Import `formatPlantDate`, `formatPlantTime`, `formatPlantDateTime`, `plantDateKey` from `../utils/displayTime`
- Update `applyDatePreset`: calculate presets using `plantDateKey` to avoid UTC day shift
- Update `formatArrivalDateTime`: `{ date: formatPlantDate(isoString), time: formatPlantTime(isoString) }`
- Update `filteredAnalyzedTrucks`: compare date with `plantDateKey(arrTime)`
- Update `formatTime`: `formatPlantTime(isoString)`
- Update `formatTimeFull`: `formatPlantDateTime(isoString)`

- [ ] **Step 3: Run frontend unit tests**

Run: `npm --prefix frontend run test:unit`
Expected: PASS

- [ ] **Step 4: Commit Task 5**

```bash
git add frontend/src/views/GBBProcess.vue frontend/src/views/GSPProcess.vue frontend/src/views/GBJProcess.vue frontend/src/views/QCVerification.vue frontend/src/views/Weighbridge.vue frontend/src/views/History.vue
git commit -m "fix(history,whse): align time formatting and WIB date filtering across all operational views"
```

---

### Task 6: Comprehensive Verification, Builds, Lint & GMS-PRAS Delta Audit

- [ ] **Step 1: Check git diff hygiene**
Run: `git diff --check`
Expected: No trailing whitespace or merge conflict markers

- [ ] **Step 2: Run all backend tests**
Run: `npm --prefix backend test`
Expected: PASS

- [ ] **Step 3: Run all backend linting**
Run: `npm --prefix backend run lint`
Expected: PASS

- [ ] **Step 4: Build backend and frontend**
Run: `npm --prefix backend run build`
Run: `npm --prefix frontend run build`
Expected: Both builds succeed with 0 errors

- [ ] **Step 5: Perform UAT on running application**
- Verify Gate Check In: entry date, time, and arrival column formatting
- Verify Dashboard: table column header, status label for GBB (QC SAMPLING PASSED), time matching Gate
- Verify History: table date and time, WIB filter behavior
- Verify Truck Details Modal: arrival time format, dynamic reopen target label for GBB vs GBJ

- [ ] **Step 6: Document GMS-PRAS Delta Audit & Final Report**
- Compile Initial SHA -> Final SHA
- Compile full list of changed files
- Verify all critical safety gates
- State release verdict based on evidence
