import api from './api'

/**
 * Evaluates the catalog object returned by the API.  A missing, inactive,
 * mismatched, or PA-required catalog must never expose PA_NOT_REQUIRED.
 */
export function evaluatePaExemption(catalog, context = {}) {
  if (!catalog || catalog.isActive !== true) {
    return { isExempt: false, reason: 'CATALOG_UNVERIFIED' }
  }

  const processType = String(context.processType || '').toUpperCase()
  if (processType && String(catalog.processType || '').toUpperCase() !== processType) {
    return { isExempt: false, reason: 'PROCESS_MISMATCH' }
  }

  if (context.productCatalogId && catalog.id !== context.productCatalogId) {
    return { isExempt: false, reason: 'CATALOG_ID_MISMATCH' }
  }

  const cargoSubType = String(context.cargoSubType || '').trim().toLowerCase()
  const catalogName = String(catalog.name || '').trim().toLowerCase()
  const catalogSubCategory = String(catalog.subCategory || '').trim().toLowerCase()
  if (
    cargoSubType &&
    (!catalogName || (cargoSubType !== catalogName && cargoSubType !== catalogSubCategory))
  ) {
    return { isExempt: false, reason: 'NAME_MISMATCH' }
  }

  if (catalog.isPaRequired !== false || !String(catalog.policyVersion || '').trim()) {
    return { isExempt: false, reason: 'PA_REQUIRED_OR_POLICY_MISSING' }
  }

  return {
    isExempt: true,
    policyVersion: catalog.policyVersion,
    reason: 'VERIFIED_ACTIVE_CATALOG_EXEMPTION',
  }
}

/**
 * Filters only the targets supplied by the server. For GSP the exemption
 * result is deliberately required; an absent result fails closed.
 */
export function getAllowedReopenTargets(matrix, processType, exemptionResult = null) {
  const normalizedProcessType = String(processType || '').toUpperCase()
  const targets = matrix?.[normalizedProcessType]

  if (!Array.isArray(targets)) return []
  if (normalizedProcessType !== 'GSP') return targets

  const isExempt = exemptionResult?.isExempt === true
  if (isExempt) {
    return targets.filter((target) => target === 'REGISTERED' || target === 'PA_NOT_REQUIRED')
  }
  return targets.filter((target) => target !== 'PA_NOT_REQUIRED')
}

export async function getReopenMatrix() {
  const response = await api.get('/transactions/reopen-matrix')
  const matrix = response?.data?.data || response?.data

  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    throw new Error('Respons matriks target REOPEN tidak valid.')
  }

  return matrix
}
