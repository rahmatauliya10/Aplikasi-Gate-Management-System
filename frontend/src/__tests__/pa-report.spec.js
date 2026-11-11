import { describe, it, expect } from 'vitest'
import { generatePrintHTML } from '../utils/pdfGenerator'

describe('PA report version and specification evidence', () => {
  const row = { id: 'pa-current', testRound: 1, revision: 2, isCurrent: true, isVoided: false, result: 'REJECT', status: 'WAITING_DISPOSITION', parameters: { ph: 4.5 }, specSnapshot: { profile: 'PAC_PA', effectiveThresholds: { phMin: 3.5, phMax: 4 }, sensoryRules: {} }, dispositionRequiresReview: true }
  const truck = { id: 'tx', processType: 'GSP', status: 'COMPLETED', transactionNumber: 'PA-REPORT', qcProductAnalyses: [row, { ...row, id: 'old', isCurrent: false, parameters: { ph: 99 } }] }
  it('prints current evidence using frozen thresholds, not array-last or current constants', () => {
    const html = generatePrintHTML([truck])
    expect(html).toContain('3.5 – 4')
    expect(html).toContain('4.5')
    expect(html).toContain('OOS')
    expect(html).toContain('Disposisi memerlukan review')
    expect(html).not.toContain('3.50 - 5.00')
  })
  it('keeps conflicting measurement sources explicit in the report', () => {
    const html = generatePrintHTML([{ ...truck, qcProductAnalyses: [{ ...row, specSnapshot: null, parameters: { moisture: 29, totalMoisture: 31 } }] }])
    expect(html).toContain('Total moisture (%) (moisture)')
    expect(html).toContain('Total moisture (%) (totalMoisture)')
    expect(html).toContain('Nilai tersimpan berbeda')
  })
  it('labels unavailable historical specifications instead of manufacturing a PASS', () => {
    const html = generatePrintHTML([{ ...truck, qcProductAnalyses: [{ ...row, specSnapshot: null }] }])
    expect(html).toContain('Referensi spesifikasi historis tidak tersedia')
  })
})
