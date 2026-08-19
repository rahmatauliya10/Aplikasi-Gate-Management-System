# Dashboard Center Date Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified global date range filter for Dashboard Center with presets (Hari Ini, Minggu Ini, Bulan Ini, Semua), custom calendar inputs, inclusive end-date, cohort consistency based on `Transaction.createdAt`, and a modular `DashboardFilterBar` component.

**Architecture:** 
- Backend: `DashboardController` & `DashboardService` accept `startDate`, `endDate`, `preset` query params, compute UTC timestamps for `Asia/Jakarta` boundaries (`00:00:00.000` to `< nextDay 00:00:00.000`), filter transactions by `createdAt`, and return `period` metadata alongside consistent metrics.
- Frontend: `DashboardFilterBar.vue` handles interactive presets and custom range validation, embedded in `PageHeader` slot of `Dashboard.vue`, updating all dashboard charts, bottlenecks, and fraud tables reactively.

**Tech Stack:** NestJS (Backend), Prisma ORM, Vue 3 Composition API, Tailwind CSS, TypeScript, Jest.

## Global Constraints
- Single date definition: All dashboard metrics are calculated based on `Transaction.createdAt`.
- Inclusive end-date: `< endDate + 1 day 00:00:00` in timezone `Asia/Jakarta` (UTC+7).
- Default preset: `Hari Ini` (`TODAY`).
- First card label: `Trucks Processed`.

---

### Task 1: Backend DTO, Date Scope Computation, and DashboardService Filtering

**Files:**
- Create: `backend/src/dashboard/dto/get-dashboard-stats.dto.ts`
- Modify: `backend/src/dashboard/dashboard.service.ts`
- Modify: `backend/src/dashboard/dashboard.controller.ts`
- Test: `backend/test/dashboard-date-filter.spec.ts`

**Interfaces:**
- Produces: `DashboardService.getStats(user: JwtPayloadUser, query?: GetDashboardStatsDto)`
- Returns: `{ success: boolean, message: string, data: { period: { startDate, endDate, timezone, preset, formattedLabel }, summary, avgTotalTAT, avgStageTimes, fraudStats, activeFraudAlerts, ... } }`

- [ ] **Step 1: Write the unit/integration test for DashboardService date filtering**

Create `backend/test/dashboard-date-filter.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';

describe('DashboardService Date Range Filter', () => {
  let service: DashboardService;
  let prisma: any;

  const mockUser: any = {
    id: 'usr-1',
    email: 'admin@gms.local',
    role: 'SUPER_ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      fraudCheck: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogsService, useValue: { logAction: jest.fn().mockResolvedValue(null) } },
        { provide: AuthorizationScopeService, useValue: { getTransactionScope: jest.fn().mockReturnValue({}) } },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should default to TODAY preset with Asia/Jakarta date bounds', async () => {
    const result = await service.getStats(mockUser, { preset: 'TODAY' });
    expect(result.success).toBe(true);
    expect(result.data.period).toBeDefined();
    expect(result.data.period.preset).toBe('TODAY');
    expect(result.data.period.timezone).toBe('Asia/Jakarta');
    expect(prisma.transaction.count).toHaveBeenCalled();
  });

  it('should handle custom date range with inclusive endDate', async () => {
    const result = await service.getStats(mockUser, {
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      preset: 'CUSTOM',
    });
    expect(result.success).toBe(true);
    expect(result.data.period.startDate).toBe('2026-08-01');
    expect(result.data.period.endDate).toBe('2026-08-19');
  });

  it('should handle ALL preset without date restriction', async () => {
    const result = await service.getStats(mockUser, { preset: 'ALL' });
    expect(result.success).toBe(true);
    expect(result.data.period.preset).toBe('ALL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest backend/test/dashboard-date-filter.spec.ts`
Expected: FAIL (DTO or parameters missing / not yet handling query)

- [ ] **Step 3: Implement `GetDashboardStatsDto` and updated `DashboardService` & `DashboardController`**

Create `backend/src/dashboard/dto/get-dashboard-stats.dto.ts`:
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, Matches } from 'class-validator';

export enum DashboardDatePreset {
  TODAY = 'TODAY',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  ALL = 'ALL',
  CUSTOM = 'CUSTOM',
}

export class GetDashboardStatsDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-19', description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ enum: DashboardDatePreset, example: DashboardDatePreset.TODAY })
  @IsOptional()
  @IsEnum(DashboardDatePreset)
  preset?: DashboardDatePreset;
}
```

Update `backend/src/dashboard/dashboard.service.ts`:
Implement timezone-aware date range calculation (`Asia/Jakarta`, UTC+7):
```typescript
// Helper to parse Asia/Jakarta date bounds
private resolveDateBounds(query?: GetDashboardStatsDto) {
  const preset = query?.preset || (query?.startDate && query?.endDate ? DashboardDatePreset.CUSTOM : DashboardDatePreset.TODAY);
  const tzOffset = 7 * 60; // Asia/Jakarta UTC+7 in minutes

  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const jakartaNow = new Date(utcMs + (tzOffset * 60000));

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let startDateStr = query?.startDate;
  let endDateStr = query?.endDate;

  if (preset === DashboardDatePreset.TODAY) {
    startDateStr = formatYMD(jakartaNow);
    endDateStr = formatYMD(jakartaNow);
  } else if (preset === DashboardDatePreset.THIS_WEEK) {
    const dayOfWeek = jakartaNow.getDay(); // 0 is Sunday
    const distToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(jakartaNow);
    monday.setDate(jakartaNow.getDate() - distToMonday);
    startDateStr = formatYMD(monday);
    endDateStr = formatYMD(jakartaNow);
  } else if (preset === DashboardDatePreset.THIS_MONTH) {
    const firstDay = new Date(jakartaNow.getFullYear(), jakartaNow.getMonth(), 1);
    startDateStr = formatYMD(firstDay);
    endDateStr = formatYMD(jakartaNow);
  } else if (preset === DashboardDatePreset.ALL) {
    startDateStr = undefined;
    endDateStr = undefined;
  }

  let dateFilter: any = {};
  if (startDateStr && endDateStr) {
    const startUtc = new Date(`${startDateStr}T00:00:00.000+07:00`);
    const endNextDay = new Date(`${endDateStr}T00:00:00.000+07:00`);
    endNextDay.setDate(endNextDay.getDate() + 1);

    dateFilter = {
      createdAt: {
        gte: startUtc,
        lt: endNextDay,
      },
    };
  } else if (startDateStr) {
    const startUtc = new Date(`${startDateStr}T00:00:00.000+07:00`);
    dateFilter = { createdAt: { gte: startUtc } };
  } else if (endDateStr) {
    const endNextDay = new Date(`${endDateStr}T00:00:00.000+07:00`);
    endNextDay.setDate(endNextDay.getDate() + 1);
    dateFilter = { createdAt: { lt: endNextDay } };
  }

  return {
    preset,
    startDate: startDateStr,
    endDate: endDateStr,
    timezone: 'Asia/Jakarta',
    dateFilter,
  };
}
```
Apply `dateFilter` uniformly across `totalPeriod` (mapped to `totalToday` for compatibility), `totalCompleted`, `totalCancelled`, `totalActive` (transactions created in period not completed/cancelled), `completedTx` (completed transactions created in period), and `fraudChecks` (fraud checks on transactions created in period).

Update `backend/src/dashboard/dashboard.controller.ts`:
```typescript
@Get('stats')
@ApiOperation({
  summary: 'Get dashboard statistics',
  description: 'Returns filtered counts and breakdowns by date range',
})
@ApiResponse({ status: 200, description: 'Dashboard statistics retrieved' })
getStats(
  @CurrentUser() user: JwtPayloadUser,
  @Query() query: GetDashboardStatsDto,
) {
  return this.dashboardService.getStats(user, query);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest backend/test/dashboard-date-filter.spec.ts`
Expected: PASS

---

### Task 2: Frontend Service & `DashboardFilterBar.vue` Component

**Files:**
- Create: `frontend/src/components/DashboardFilterBar.vue`
- Modify: `frontend/src/services/dashboardService.js`

**Interfaces:**
- `dashboardService.getStats(params?: { startDate?: string, endDate?: string, preset?: string })`
- `DashboardFilterBar.vue` Props: `modelValue: { preset: string, startDate: string, endDate: string }`, `loading: boolean`
- `DashboardFilterBar.vue` Emits: `update:modelValue`, `change`

- [ ] **Step 1: Update `dashboardService.js`**

Modify `frontend/src/services/dashboardService.js`:
```javascript
import api from './api'

const dashboardService = {
  /**
   * Get overview statistics with date range filtering
   * @param {Object} [params] - { startDate, endDate, preset }
   */
  getStats(params = {}) {
    return api.get('/dashboard/stats', { params })
  }
}

export default dashboardService
```

- [ ] **Step 2: Create `DashboardFilterBar.vue`**

Create `frontend/src/components/DashboardFilterBar.vue`:
Features:
- Presets: `[ Hari Ini ]` `[ Minggu Ini ]` `[ Bulan Ini ]` `[ Semua ]`
- Date Range Inputs: `[ Start Date 📅 ]` — `[ End Date 📅 ]`
- Reset button with rotation icon
- Validation: Alert if `startDate > endDate` or `endDate > today`
- Responsive layout: Flex wrapping gracefully on smaller screens
- High aesthetic calibration: Glassmorphism tokens, `#4A8BDF` blue active pills, subtle focus rings.

---

### Task 3: `Dashboard.vue` Integration & Dynamic Period Header

**Files:**
- Modify: `frontend/src/views/Dashboard.vue`

- [ ] **Step 1: Replace static header subtitle and embed `DashboardFilterBar`**

Update `Dashboard.vue`:
- Import `DashboardFilterBar`
- Define state: `activeFilter = ref({ preset: 'TODAY', startDate: '', endDate: '' })`
- Compute `periodSubtitle`:
  - E.g. "Periode: 19 Agu 2026" or "Periode: 01 Agu 2026 – 19 Agu 2026" or "Periode: Seluruh Data Operasional"
- Place `<DashboardFilterBar v-model="activeFilter" :loading="isFetching" @change="fetchDashboardStats" />` in `<PageHeader>` slot.
- First metric card label: "Trucks Processed".
- Update polling interval to pass `activeFilter.value` to `fetchDashboardStats(activeFilter.value)`.
- Keep existing cards visible with soft loading opacity during refresh.

---

### Task 4: End-to-End Verification & Polish

**Files:**
- Run backend & frontend test suites
- Test interactive filter operations and responsive design

- [ ] **Step 1: Run backend tests**
Run: `npm test` in backend directory

- [ ] **Step 2: Verify frontend builds without errors**
Run: `npm run build` or linter in frontend directory

- [ ] **Step 3: Document walkthrough and finalize**
Update `walkthrough.md` with screenshots and verification evidence.
