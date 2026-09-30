import { describe, it, expect } from 'vitest'
import { getStatusLabel, getStatusBadgeClass } from '../utils/statusLabel'

describe('Solar PA Exemption Display Tests', () => {
  it('returns neutral "TIDAK PERLU PA" label and non-green badge class for PA_NOT_REQUIRED', () => {
    const label = getStatusLabel('PA_NOT_REQUIRED', 'GSP')
    expect(label).toBe('TIDAK PERLU PA')
    expect(label).not.toContain('LULUS')
    expect(label).not.toContain('PASSED')

    const badgeClass = getStatusBadgeClass('PA_NOT_REQUIRED')
    expect(badgeClass).toContain('bg-slate-100')
    expect(badgeClass).toContain('text-slate-700')
    expect(badgeClass).not.toContain('bg-emerald')
  })

  it('returns appropriate labels and orange badge styling for retest and disposition states', () => {
    expect(getStatusLabel('QC_RETEST_REQUIRED', 'GSP')).toBe('UJI ULANG DIPERLUKAN')
    expect(getStatusLabel('WAITING_UTILITY_DISPOSITION', 'GSP')).toBe('MENUNGGU DISPOSISI UTILITY')

    const retestClass = getStatusBadgeClass('QC_RETEST_REQUIRED')
    expect(retestClass).toContain('bg-orange-50')
    expect(retestClass).toContain('text-orange-600')

    const dispClass = getStatusBadgeClass('WAITING_UTILITY_DISPOSITION')
    expect(dispClass).toContain('bg-orange-50')
    expect(dispClass).toContain('text-orange-600')
  })
})
