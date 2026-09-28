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
