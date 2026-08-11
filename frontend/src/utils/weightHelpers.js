/**
 * Weight helper utilities for GBJ vs non-GBJ process types.
 */

/**
 * Returns record type mapping for gross and tare weights based on processType.
 * GBB/GKG: gross = IN, tare = OUT
 * GBJ: gross = OUT, tare = IN
 */
export function getWeightRecordTypes(processType) {
  if (processType === 'GBJ') {
    return {
      gross: 'OUT',
      tare: 'IN',
    }
  }

  return {
    gross: 'IN',
    tare: 'OUT',
  }
}
