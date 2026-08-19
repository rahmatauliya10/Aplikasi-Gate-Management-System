import { BadRequestException } from '@nestjs/common';
import {
  GetDashboardStatsDto,
  DashboardDatePreset,
} from '../dto/get-dashboard-stats.dto';

/**
 * Checks if a given year is a leap year.
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns number of days in a given month (1-12) for a given year.
 */
function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Strict calendar date parser and validator.
 * Rejects invalid strings, impossible dates (e.g. 2026-02-30, 2026-13-01, 2026-00-20, 2026-08-32).
 */
export function parseCalendarDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) return null;

  return { year, month, day };
}

/**
 * Returns current date string in Asia/Jakarta timezone (YYYY-MM-DD).
 */
export function getJakartaTodayString(): string {
  const tzOffsetMinutes = 7 * 60; // UTC+7
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakartaNow = new Date(utcMs + tzOffsetMinutes * 60000);

  const y = jakartaNow.getFullYear();
  const m = String(jakartaNow.getMonth() + 1).padStart(2, '0');
  const d = String(jakartaNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts a Jakarta date string (YYYY-MM-DD) to UTC Start Date (00:00:00 Asia/Jakarta).
 * e.g. "2026-08-01" -> 2026-07-31T17:00:00.000Z
 */
export function jakartaDateToUtcStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000+07:00`);
}

/**
 * Converts a Jakarta date string (YYYY-MM-DD) to UTC Exclusive End Date (next day 00:00:00 Asia/Jakarta).
 * e.g. "2026-08-19" -> 2026-08-19T17:00:00.000Z
 */
export function jakartaDateToUtcEndExclusive(dateStr: string): Date {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) {
    throw new BadRequestException(`Invalid date format: ${dateStr}`);
  }
  const baseDate = new Date(`${dateStr}T00:00:00.000+07:00`);
  baseDate.setDate(baseDate.getDate() + 1);
  return baseDate;
}

export interface ResolvedDashboardBounds {
  preset: DashboardDatePreset;
  startDate: string;
  endDate: string;
  timezone: 'Asia/Jakarta';
  formattedLabel: string;
  dateFilter: {
    createdAt: {
      gte: Date;
      lt: Date;
    };
  };
}

/**
 * Resolves deterministic dashboard date bounds in Asia/Jakarta with inclusive endDate semantics.
 */
export function resolveDashboardDateBounds(
  query?: GetDashboardStatsDto,
): ResolvedDashboardBounds {
  const todayStr = getJakartaTodayString();

  let startDateStr = query?.startDate?.trim() || null;
  let endDateStr = query?.endDate?.trim() || null;

  // If neither provided -> default to TODAY
  if (!startDateStr && !endDateStr) {
    startDateStr = todayStr;
    endDateStr = todayStr;
  } else if (!startDateStr || !endDateStr) {
    // If one is provided but not both -> reject
    throw new BadRequestException({
      success: false,
      message:
        'Both startDate and endDate must be provided for custom date range filter.',
    });
  }

  // Validate calendar validity
  const parsedStart = parseCalendarDate(startDateStr);
  if (!parsedStart) {
    throw new BadRequestException({
      success: false,
      message: `Invalid startDate: "${startDateStr}". Must be a valid existing calendar date in YYYY-MM-DD format.`,
    });
  }

  const parsedEnd = parseCalendarDate(endDateStr);
  if (!parsedEnd) {
    throw new BadRequestException({
      success: false,
      message: `Invalid endDate: "${endDateStr}". Must be a valid existing calendar date in YYYY-MM-DD format.`,
    });
  }

  // Validate startDate <= endDate
  if (startDateStr > endDateStr) {
    throw new BadRequestException({
      success: false,
      message: `startDate (${startDateStr}) cannot be greater than endDate (${endDateStr}).`,
    });
  }

  // Validate startDate <= today && endDate <= today (Asia/Jakarta)
  if (startDateStr > todayStr) {
    throw new BadRequestException({
      success: false,
      message: `startDate (${startDateStr}) cannot be in the future (today in Asia/Jakarta is ${todayStr}).`,
    });
  }
  if (endDateStr > todayStr) {
    throw new BadRequestException({
      success: false,
      message: `endDate (${endDateStr}) cannot be in the future (today in Asia/Jakarta is ${todayStr}).`,
    });
  }

  const preset =
    startDateStr === todayStr && endDateStr === todayStr
      ? DashboardDatePreset.TODAY
      : DashboardDatePreset.CUSTOM;

  const startUtc = jakartaDateToUtcStart(startDateStr);
  const endNextDayUtc = jakartaDateToUtcEndExclusive(endDateStr);

  const dateFilter = {
    createdAt: {
      gte: startUtc,
      lt: endNextDayUtc,
    },
  };

  // Format human-readable Indonesian label
  let formattedLabel = '';
  if (startDateStr === endDateStr) {
    const d = new Date(`${startDateStr}T00:00:00.000+07:00`);
    const day = d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
    formattedLabel = `Periode: ${day}`;
  } else {
    const d1 = new Date(`${startDateStr}T00:00:00.000+07:00`);
    const d2 = new Date(`${endDateStr}T00:00:00.000+07:00`);
    const s1 = d1.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
    const s2 = d2.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
    formattedLabel = `Periode: ${s1} – ${s2}`;
  }

  return {
    preset,
    startDate: startDateStr,
    endDate: endDateStr,
    timezone: 'Asia/Jakarta',
    formattedLabel,
    dateFilter,
  };
}
