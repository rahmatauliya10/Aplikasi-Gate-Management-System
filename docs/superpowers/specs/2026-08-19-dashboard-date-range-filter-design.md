# Design Specification: Dashboard Center Date Range Filter & Global Context

## 1. Overview
This specification defines the implementation of a global date-range filter system for **Dashboard Center** in the Gate Management System (GMS). The static date subtitle (`WEDNESDAY, 19 AUGUST 2026`) is replaced by an interactive period indicator and a dedicated `DashboardFilterBar` component embedded in the `PageHeader` slot.

---

## 2. Core Architecture & Requirements

### A. Date Definition & Cohort Consistency
1. **Single Source of Truth**: All dashboard metrics (Total Trucks, Completed Trucks, Turnaround Time / TAT, Stage Bottlenecks, Weighbridge Deviations, and Deviation Investigation alerts) are calculated strictly based on **`Transaction.createdAt`** within the selected period.
2. **Inclusive End-Date**:
   - `startDate` (e.g. `2026-08-01`) is evaluated from `2026-08-01 00:00:00` in `Asia/Jakarta` (UTC+7).
   - `endDate` (e.g. `2026-08-19`) is inclusive, evaluated until `< 2026-08-20 00:00:00` in `Asia/Jakarta` (UTC+7).
3. **Timezone Awareness**: Server parses dates respecting `Asia/Jakarta` (+07:00).
4. **Default Setting**: **`Hari Ini` (TODAY)** upon initial page load.

---

## 3. Presets & Date Calculation Rules

| Preset | Start Date (`Asia/Jakarta`) | End Date (`Asia/Jakarta`) |
| :--- | :--- | :--- |
| **Hari Ini (`TODAY`)** | `00:00:00` hari ini | Sekarang / `23:59:59.999` hari ini |
| **Minggu Ini (`THIS_WEEK`)** | Senin minggu berjalan `00:00:00` | Sekarang / `23:59:59.999` hari ini |
| **Bulan Ini (`THIS_MONTH`)** | Tanggal 1 bulan berjalan `00:00:00` | Sekarang / `23:59:59.999` hari ini |
| **Semua (`ALL`)** | Tanpa batas bawah (unbounded / initial data) | Tanpa batas atas |
| **Kustom (`CUSTOM`)** | Input `startDate` `00:00:00` | Input `endDate` `23:59:59.999` |

---

## 4. API Contract: `GET /dashboard/stats`

### Query Parameters:
- `startDate` (optional, string format `YYYY-MM-DD`)
- `endDate` (optional, string format `YYYY-MM-DD`)
- `preset` (optional, enum: `TODAY`, `THIS_WEEK`, `THIS_MONTH`, `ALL`, `CUSTOM`)

### Response Format:
```json
{
  "success": true,
  "message": "Dashboard statistics retrieved successfully",
  "data": {
    "period": {
      "startDate": "2026-08-01",
      "endDate": "2026-08-19",
      "timezone": "Asia/Jakarta",
      "preset": "CUSTOM",
      "formattedLabel": "Periode: 01 Aug 2026 – 19 Aug 2026"
    },
    "summary": {
      "totalPeriod": 142,
      "totalCompleted": 138,
      "totalActive": 4,
      "totalCancelled": 0
    },
    "byStatus": [
      { "status": "COMPLETED", "count": 138 },
      { "status": "WAREHOUSE_PROCESS", "count": 3 },
      { "status": "QC_VERIFYING", "count": 1 }
    ],
    "byProcessType": [
      { "processType": "GBB", "count": 60 },
      { "processType": "GBJ", "count": 72 },
      { "processType": "GSP", "count": 10 }
    ],
    "avgStageTimes": {
      "waitingIn": 12,
      "warehouse": 28,
      "qc": 15,
      "waitingOut": 8
    },
    "avgTotalTAT": 63,
    "fraudStats": {
      "GBB": { "totalNet": 1500000, "totalProcessed": 1498000, "avgDiscrepancy": 0.13 },
      "GBJ": { "totalNet": 1800000, "totalProcessed": 1802000, "avgDiscrepancy": 0.11 },
      "GSP": { "totalNet": 300000, "totalProcessed": 300500, "avgDiscrepancy": 0.17 }
    },
    "activeFraudAlerts": [ ... ]
  }
}
```

*Note: Backward-compatible keys like `summary.totalToday` will map to `summary.totalPeriod` so existing components remain resilient.*

---

## 5. UI / UX Design & Components

### A. Header Layout
- **Page Title**: `Dashboard Center`
- **Dynamic Period Subtitle**:
  - Today: `Periode: 19 Aug 2026`
  - Range: `Periode: 01 Aug 2026 – 19 Aug 2026`
  - All: `Periode: Seluruh Data Operasional`
- **Right Header Slot (`DashboardFilterBar`)**:
  - **Quick Preset Pills**: `[ Hari Ini ]` `[ Minggu Ini ]` `[ Bulan Ini ]` `[ Semua ]`
    - Active preset highlighted with `#4A8BDF` blue accent and soft shadow.
  - **Custom Range Inputs**: `[ Start Date 📅 ]` — `[ End Date 📅 ]`
    - High-contrast date input controls with native browser picker.
    - Triggers API fetch automatically once both dates are valid.
  - **Reset Button**: `[ ↺ Reset ]` (resets to default `Hari Ini`).
  - **Extensible Slot**: Prepared for future dropdown filter (e.g. `Process: [ Semua | GBB | GBJ | GSP ]`).

### B. Metric Card & Content Alignment
- Card 1: Label **`Trucks Processed`** with metric count.
- Smooth loading state: Skeletons or subtle opacity indicator during data refresh without clearing layout.
- Validation: Alert / toast if `startDate > endDate` or `endDate > today`.

---

## 6. Testing & Verification Plan
1. **Unit & Integration Test (Backend)**:
   - Verify `DashboardService.getStats` with `startDate`, `endDate`, and presets (`TODAY`, `THIS_WEEK`, `THIS_MONTH`, `ALL`).
   - Verify inclusive boundary timestamps (`00:00:00.000` to `< nextDay 00:00:00.000` in Asia/Jakarta).
2. **Frontend UI/UX Verification**:
   - Verify default `Hari Ini` on initial load.
   - Verify switching between `Hari Ini`, `Minggu Ini`, `Bulan Ini`, `Semua`, and `Custom Range`.
   - Verify card counts, TAT calculations, bottlenecks, and fraud deviation tables dynamically update.
   - Verify responsive layout on mobile, tablet, and desktop viewports.
