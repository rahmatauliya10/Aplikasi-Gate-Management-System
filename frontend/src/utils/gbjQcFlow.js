/**
 * GBJ QC Vehicle Flow & Checklist Evaluation Utility
 * Production module used by both QCVerification.vue and regression test suites.
 */

export const GBJ_VEHICLE_CHECKLIST = [
  "Tidak ditemukan hama / No pest found",
  "Bebas dari barang haram dan najis / Free of haram and najis material",
  "Truk dalam kondisi bersih dan tidak berbau / Truck in clean condition and odour free",
  "Tidak ditemukan bahan kimia atau kontaminan lain / No chemical or other contaminent found",
  "Terdapat alas jika lantai truk kotor atau berlubang / There is a cover if the floor is holey or dirty"
]

/**
 * Determines the mode of Stage 1 QC modal for a given transaction.
 * - 'GBJ_VEHICLE_CHECK' if process type is GBJ
 * - 'SAMPLING_AWAL' for GBB or GSP
 * - 'UNKNOWN' for missing, corrupt, or unrecognized process types (fail-closed)
 */
export function getQcStage1Mode(truck) {
  const type = truck?.processType || truck?.process_type
  if (type === 'GBJ') return 'GBJ_VEHICLE_CHECK'
  if (type === 'GBB' || type === 'GSP') return 'SAMPLING_AWAL'
  return 'UNKNOWN'
}

/**
 * Evaluates the 5-item GBJ QC Vehicle checklist.
 * @param {Array<{ status: 'ok' | 'not_ok' | null, photo: string | null }>} states 
 * @param {Array<string>} [checklistLabels=GBJ_VEHICLE_CHECKLIST] 
 */
export function evaluateGbjChecklist(states, checklistLabels = GBJ_VEHICLE_CHECKLIST) {
  const safeStates = Array.isArray(states) ? states : []
  const totalCount = checklistLabels.length

  const doneCount = safeStates.filter(
    s => s?.status === 'ok' || (s?.status === 'not_ok' && Boolean(s?.photo))
  ).length

  const isComplete = safeStates.length === totalCount && doneCount === totalCount
  const hasNotOk = safeStates.some(s => s?.status === 'not_ok')
  const passed = isComplete && !hasNotOk

  const notOkLabels = safeStates
    .map((s, idx) => s?.status === 'not_ok' ? `${idx + 1}. ${checklistLabels[idx] || 'Checklist item'}` : null)
    .filter(Boolean)

  const defaultNotes = passed
    ? 'Lolos QC Vehicle Checklist GBJ'
    : `[REJECT QC VEHICLE GBJ] Temuan NOT OK (${notOkLabels.length} item): ${notOkLabels.join('; ')}`

  return {
    isComplete,
    doneCount,
    remainingCount: totalCount - doneCount,
    hasNotOk,
    passed,
    result: passed ? 'PASS' : 'REJECT',
    notOkLabels,
    defaultNotes
  }
}

/**
 * Builds the backend payload for GBJ QC Vehicle inspection.
 * Accurately aligns typed fields with GBJ checklist semantics:
 * - pestEvidence: item 0 ("Tidak ditemukan hama")
 * - vehicleCleanliness: item 2 ("Truk dalam kondisi bersih dan tidak berbau")
 * - vehicleOdor: item 2 ("Truk dalam kondisi bersih dan tidak berbau")
 * - vehicleCondition: overall passed boolean
 * - documentCompleteness: undefined (omitted)
 * - sealCondition: undefined (omitted)
 */
export function buildGbjQcPayload(states, checklistLabels = GBJ_VEHICLE_CHECKLIST) {
  const safeStates = Array.isArray(states) ? states : []
  const evaluation = evaluateGbjChecklist(safeStates, checklistLabels)

  return {
    result: evaluation.result,
    pestEvidence: safeStates[0]?.status === 'ok',
    vehicleCleanliness: safeStates[2]?.status === 'ok',
    vehicleOdor: safeStates[2]?.status === 'ok',
    vehicleCondition: evaluation.passed,
    documentCompleteness: undefined,
    sealCondition: undefined,
    checklistItems: {
      initialMoisture: 0,
      items: safeStates.map((s, idx) => ({
        label: checklistLabels[idx] || 'Checklist item',
        ok: s?.status === 'ok',
        photo: s?.photo || null
      }))
    },
    notes: evaluation.defaultNotes
  }
}
