import { getPlantDay } from './plant-day.util';

describe('WIB operational day boundaries (GMS-YYYYMMDD-XXXX)', () => {
  it('rolls over exactly at 00:00:00 WIB (17:00:00 UTC)', () => {
    // 23:59:59 WIB on 2026-09-29 -> 2026-09-29T16:59:59.000Z UTC
    const beforeMidnight = getPlantDay(new Date('2026-09-29T16:59:59.000Z'));
    expect(beforeMidnight.dateKey).toBe('20260929');
    expect(beforeMidnight.start.toISOString()).toBe('2026-09-28T17:00:00.000Z'); // 2026-09-29 00:00:00 WIB
    expect(beforeMidnight.end.toISOString()).toBe('2026-09-29T17:00:00.000Z');   // 2026-09-30 00:00:00 WIB

    // 00:00:00 WIB on 2026-09-30 -> 2026-09-29T17:00:00.000Z UTC (EXACT MIDNIGHT ROLLOVER)
    const atMidnight = getPlantDay(new Date('2026-09-29T17:00:00.000Z'));
    expect(atMidnight.dateKey).toBe('20260930');
    expect(atMidnight.start.toISOString()).toBe('2026-09-29T17:00:00.000Z'); // 2026-09-30 00:00:00 WIB
    expect(atMidnight.end.toISOString()).toBe('2026-09-30T17:00:00.000Z');   // 2026-10-01 00:00:00 WIB

    // 06:59:59 WIB on 2026-09-30 -> 2026-09-29T23:59:59.000Z UTC (SAME DAY, BEFORE MORNING SHIFT)
    const morningShift = getPlantDay(new Date('2026-09-29T23:59:59.000Z'));
    expect(morningShift.dateKey).toBe('20260930');
    expect(morningShift.start.toISOString()).toBe('2026-09-29T17:00:00.000Z'); // 2026-09-30 00:00:00 WIB
    expect(morningShift.end.toISOString()).toBe('2026-09-30T17:00:00.000Z');   // 2026-09-30 24:00:00 / 2026-10-01 00:00:00 WIB
  });

  it('verifies transaction number prefix rollover behavior across critical hours', () => {
    const times = [
      { timeUtc: '2026-09-29T16:59:59.000Z', label: '23.59.59 WIB', expectedDateKey: '20260929', expectedPrefix: 'GMS-20260929-' },
      { timeUtc: '2026-09-29T17:00:00.000Z', label: '00.00.00 WIB', expectedDateKey: '20260930', expectedPrefix: 'GMS-20260930-' },
      { timeUtc: '2026-09-29T23:59:59.000Z', label: '06.59.59 WIB', expectedDateKey: '20260930', expectedPrefix: 'GMS-20260930-' },
      { timeUtc: '2026-09-30T00:00:00.000Z', label: '07.00.00 WIB', expectedDateKey: '20260930', expectedPrefix: 'GMS-20260930-' },
    ];

    for (const { timeUtc, expectedDateKey, expectedPrefix } of times) {
      const res = getPlantDay(new Date(timeUtc));
      expect(res.dateKey).toBe(expectedDateKey);
      expect(`GMS-${res.dateKey}-`).toBe(expectedPrefix);
    }
  });
});
