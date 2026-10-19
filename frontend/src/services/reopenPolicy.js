import api from './api'

export function getAllowedReopenTargets(matrix, processType, isSolarCommodity = false) {
  const normalizedProcessType = String(processType || '').toUpperCase()
  const targets = matrix?.[normalizedProcessType]

  if (!Array.isArray(targets)) return []

  return targets.filter((target) => {
    if (normalizedProcessType !== 'GSP') return true
    if (isSolarCommodity) {
      return target === 'REGISTERED' || target === 'PA_NOT_REQUIRED'
    }
    return target !== 'PA_NOT_REQUIRED'
  })
}

export async function getReopenMatrix() {
  const response = await api.get('/transactions/reopen-matrix')
  const matrix = response?.data?.data || response?.data

  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    throw new Error('Respons matriks target REOPEN tidak valid.')
  }

  return matrix
}
