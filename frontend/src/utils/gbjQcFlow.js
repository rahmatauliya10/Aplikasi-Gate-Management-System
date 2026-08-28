/**
 * GBJ QC Vehicle Flow & Checklist Evaluation Utility
 * Production module used by both QCVerification.vue and regression test suites.
 */

export const GBJ_VEHICLE_CHECKLIST = [
  "Tidak ditemukan hama / No pest found",
  "Bebas dari barang haram dan najis / Free of haram and najis material",
  "Truk dalam kondisi bersih dan tidak berbau / Truck in clean condition and odour free",
  "Tidak ditemukan bahan kimia atau kontaminan lain / No chemical or other contaminant found",
  "Terdapat alas jika lantai truk kotor atau berlubang / There is a cover if the floor is holey or dirty"
]

/**
 * GBJ Vehicle Checklist — CRITICAL/CONDITIONAL Severity Policy
 * 
 * TEMPORARY BUSINESS POLICY
 * Pending formal QC/SOP owner confirmation.
 * Do NOT document as "Sesuai SOP QC SJA" until SOP is formally verified.
 * 
 * CRITICAL    = Hard Reject. Approve With Deviation NOT allowed.
 * CONDITIONAL = Mitigatable. Approve With Deviation allowed with valid reason.
 */
export const GBJ_CHECKLIST_SEVERITY = [
  'CRITICAL',      // 0: Hama
  'CRITICAL',      // 1: Haram/najis
  'CONDITIONAL',   // 2: Bersih & tidak berbau
  'CRITICAL',      // 3: Bahan kimia/kontaminan
  'CONDITIONAL',   // 4: Alas lantai
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

  const notOkItems = safeStates
    .map((s, idx) => {
      if (s?.status !== 'not_ok') return null
      return {
        index: idx,
        label: checklistLabels[idx] || 'Checklist item',
        severity: GBJ_CHECKLIST_SEVERITY[idx] || 'CONDITIONAL',
        hasPhoto: Boolean(s?.photo),
        photo: s?.photo || null,
      }
    })
    .filter(Boolean)

  const hasCriticalNotOk = notOkItems.some(item => item.severity === 'CRITICAL')
  const hasConditionalNotOk = notOkItems.some(item => item.severity === 'CONDITIONAL')
  const canApproveWithDeviation = isComplete && hasNotOk && !hasCriticalNotOk

  const notOkLabels = notOkItems.map(item => `${item.index + 1}. ${item.label}`)

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
    notOkItems,
    hasCriticalNotOk,
    hasConditionalNotOk,
    canApproveWithDeviation,
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
 * 
 * Server is the authority for computing hasDeviation and validating decisionMode.
 * hasDeviation is NOT sent in client payload.
 */
export function buildGbjQcPayload(
  states,
  checklistLabels = GBJ_VEHICLE_CHECKLIST,
  { decisionMode = undefined, deviationReason = undefined } = {}
) {
  const safeStates = Array.isArray(states) ? states : []
  const evaluation = evaluateGbjChecklist(safeStates, checklistLabels)

  const payload = {
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

  if (decisionMode) {
    payload.decisionMode = decisionMode
  }

  if (decisionMode === 'APPROVED_WITH_DEVIATION' && deviationReason) {
    payload.deviationReason = deviationReason.trim()
  }

  return payload
}
