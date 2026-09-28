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

  it('converts 23 Sep 2026 17:30 UTC to 24 Sep 2026 00:30 WIB day boundaries', () => {
    const res = getPlantDay(new Date('2026-09-23T17:30:00.000Z'));
    expect(res.dateKey).toBe('20260924');
    expect(res.start.toISOString()).toBe('2026-09-23T17:00:00.000Z');
    expect(res.end.toISOString()).toBe('2026-09-24T17:00:00.000Z');
  });
});
