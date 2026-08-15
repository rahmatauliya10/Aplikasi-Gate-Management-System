/**
 * Utility functions for canonical vehicle plate number normalization & hashing.
 */

export function normalizePlateNumber(plateNumber: string): string {
  if (!plateNumber) return '';
  const cleaned = plateNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const match = cleaned.match(/^([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{1,3})$/);
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]}`;
  }
  return cleaned;
}

export function getRawPlateNumber(plateNumber: string): string {
  return normalizePlateNumber(plateNumber).replace(/\s+/g, '');
}
