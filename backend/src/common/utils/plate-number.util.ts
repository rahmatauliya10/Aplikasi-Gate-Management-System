/**
 * Normalizes license plate numbers for canonical storage and index lookup.
 * Example: "  B 1234  XYZ " -> "B1234XYZ"
 */
export function normalizePlateNumber(plateNumber: string): string {
  if (!plateNumber) return '';
  return plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
