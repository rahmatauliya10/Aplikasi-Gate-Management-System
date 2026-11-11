import { describe, it, expect } from 'vitest'
import { formatPaParameters } from '../utils/paParameterDisplay'

const visual = { kondisi: 'Kering (Tidak Basah)', warna: 'Hitam', levelRank: 'High Rank Coal', kilap: 'Hitam Mengkilap', bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah' }
const legacy = { parameters: { kilap: visual.kilap, warna: visual.warna, visual, kondisi: visual.kondisi, levelRank: visual.levelRank, calorieBand: 'COAL_5600_6000', bahanPengotor: visual.bahanPengotor, targetCalorie: 'COAL_5600_6000', totalMoisture: 31, maxAllowedMoisture: 33 } }

describe('Readable PA parameter presentation', () => {
  it('flattens screenshot legacy facts, combines matching aliases and preserves the source', () => {
    const before = JSON.stringify(legacy)
    const rows = formatPaParameters(legacy)
    const main = rows.filter(row => row.group !== 'additional')
    expect(main.map(row => row.label)).toEqual(['Target kalori', 'Total moisture (%)', 'Kondisi', 'Warna', 'Peringkat batubara', 'Kilap', 'Bahan pengotor'])
    expect(main[0].value).toBe('5.600–6.000')
    expect(main.every(row => row.isOk === null)).toBe(true)
    expect(main.some(row => row.value.includes('{'))).toBe(false)
    expect(rows.find(row => row.key === 'maxAllowedMoisture')).toMatchObject({ group: 'additional', isOk: null })
    expect(JSON.stringify(legacy)).toBe(before)
  })
  it('shows conflicting aliases with their sources instead of silently selecting one', () => {
    const rows = formatPaParameters({ ...legacy, parameters: { ...legacy.parameters, moisture: 29, visual: { ...visual, warna: 'Coklat' } } })
    expect(rows.filter(row => row.label.startsWith('Total moisture'))).toHaveLength(2)
    expect(rows.filter(row => row.label.startsWith('Warna'))).toHaveLength(2)
    expect(rows.filter(row => row.conflict).map(row => row.source)).toEqual(expect.arrayContaining(['moisture', 'totalMoisture', 'visual.warna', 'warna']))
    expect(rows.filter(row => row.conflict).every(row => row.isOk === null)).toBe(true)
  })
  it('does not manufacture missing numbers or evaluate legacy saved limits', () => {
    expect(formatPaParameters({ parameters: {} })).toEqual([])
    const rows = formatPaParameters({ parameters: { totalMoisture: 0, maxAllowedMoisture: 33 } })
    expect(rows.find(row => row.label === 'Total moisture (%)')).toMatchObject({ value: '0', isOk: null })
    expect(rows.every(row => row.isOk === null)).toBe(true)
  })
  it('keeps unfamiliar nested facts accessible without raw JSON tiles', () => {
    const rows = formatPaParameters({ parameters: { metadata: { source: 'Lab lama', batch: { number: 'A-01' } }, other: [1, 2], notes: 'separate' } })
    expect(rows.every(row => row.group === 'additional')).toBe(true)
    expect(rows.map(row => row.value)).toEqual(['Lab lama', 'A-01', '1', '2'])
    expect(rows.some(row => row.value.includes('{'))).toBe(false)
    expect(rows.some(row => row.key === 'notes')).toBe(false)
  })
  it('formats PAC and Rapid facts while using only frozen specification rules', () => {
    const rows = formatPaParameters({ parameters: { ph: 4.5, density: 1.2, sensory: { visual: 'Kuning' }, aluminaContent: 30 }, specSnapshot: { profile: 'PAC_PA', effectiveThresholds: { phMin: 3.5, phMax: 4, densityMin: 1.17, densityMax: 1.26 }, sensoryRules: { visual: ['Kuning'] } } })
    expect(rows.find(row => row.label === 'pH')).toMatchObject({ isOk: false, specText: '3.5 – 4' })
    expect(rows.find(row => row.key === 'aluminaContent')).toMatchObject({ isOk: null, specText: 'Informasi / tidak dievaluasi' })
    const rapid = formatPaParameters({ parameters: { alkalinityNa2O: 35, alkalinityNa2o: 35 }, specSnapshot: { profile: 'RAPID_KLEN_PA', effectiveThresholds: { na2oMin: 35 } } })
    expect(rapid).toHaveLength(1)
    expect(rapid[0]).toMatchObject({ label: 'Alkalinitas Na₂O (%)', value: '35', isOk: false })
  })
})
