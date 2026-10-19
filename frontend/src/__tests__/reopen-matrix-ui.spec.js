import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import {
  getAllowedReopenTargets,
  getReopenMatrix,
} from '../services/reopenPolicy'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const SERVER_MATRIX = {
  GBB: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
    'INCOMING_CHECK_PENDING',
  ],
  GSP: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
    'PA_NOT_REQUIRED',
  ],
  GBJ: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
  ],
}

describe('Frontend REOPEN matrix contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the authoritative matrix from the backend endpoint', async () => {
    api.get.mockResolvedValue({
      data: { success: true, data: SERVER_MATRIX },
    })

    await expect(getReopenMatrix()).resolves.toEqual(SERVER_MATRIX)
    expect(api.get).toHaveBeenCalledWith('/transactions/reopen-matrix')
  })

  it('fails closed when the backend response does not contain a matrix object', async () => {
    api.get.mockResolvedValue({ data: null })

    await expect(getReopenMatrix()).rejects.toThrow(
      'Respons matriks target REOPEN tidak valid.'
    )
  })

  it('preserves GBB and GBJ targets exactly as supplied by the server', () => {
    expect(getAllowedReopenTargets(SERVER_MATRIX, 'GBB')).toEqual(
      SERVER_MATRIX.GBB
    )
    expect(getAllowedReopenTargets(SERVER_MATRIX, 'GBJ')).toEqual(
      SERVER_MATRIX.GBJ
    )
  })

  it('narrows non-Solar GSP targets without adding local stages', () => {
    expect(getAllowedReopenTargets(SERVER_MATRIX, 'GSP', false)).toEqual([
      'REGISTERED',
      'QC_VEHICLE_PENDING',
      'QC_VEHICLE_PASSED',
    ])
  })

  it('narrows Solar GSP targets to REGISTERED and PA_NOT_REQUIRED', () => {
    expect(getAllowedReopenTargets(SERVER_MATRIX, 'GSP', true)).toEqual([
      'REGISTERED',
      'PA_NOT_REQUIRED',
    ])
  })

  it('returns no targets when the process is absent instead of falling back locally', () => {
    expect(getAllowedReopenTargets(SERVER_MATRIX, 'UNKNOWN')).toEqual([])
    expect(getAllowedReopenTargets(null, 'GBB')).toEqual([])
  })
})
