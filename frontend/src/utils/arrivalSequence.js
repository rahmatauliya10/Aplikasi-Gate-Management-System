/**
 * Formats daily arrival sequence number as a canonical 3-digit padded badge (e.g. #001, #002)
 * Returns null if no sequence number is present (prevents guessing on historical records).
 */
export function formatArrivalSequence(seq) {
  if (seq === null || seq === undefined || seq === '') return null;
  const num = Number(seq);
  if (isNaN(num) || num <= 0) return null;
  return `#${String(num).padStart(3, '0')}`;
}
