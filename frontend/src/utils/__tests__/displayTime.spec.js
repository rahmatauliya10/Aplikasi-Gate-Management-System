import { describe, expect, it } from 'vitest'
import { formatPlantDateTime, formatPlantTime, plantClockParts, plantDateKey } from '../displayTime'
import { getStatusLabel } from '../statusLabel'

describe('GMS display conventions', () => {
  it('shows registration at the same WIB instant across browser time zones', () => {
    expect(formatPlantDateTime('2026-09-23T17:30:00.000Z')).toBe('24 Sep 2026 00.30 WIB')
    expect(formatPlantTime('2026-09-24T05:22:29.000Z', true)).toBe('12.22.29')
    expect(plantClockParts('2026-09-23T17:30:00.000Z')).toEqual({ hour: '00', minute: '30', second: '00' })
    expect(plantDateKey('2026-09-23T17:30:00.000Z')).toBe('2026-09-24')
    expect(formatPlantDateTime(null)).toBe('-')
  })

  it('names the GBB and GSP checkpoint as sampling, while GBJ remains vehicle inspection', () => {
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GBB')).toBe('QC SAMPLING PASSED')
    expect(getStatusLabel('QC_VEHICLE_REJECTED', 'GSP')).toBe('QC SAMPLING REJECTED')
    expect(getStatusLabel('QC_VEHICLE_PASSED', 'GBJ')).toBe('QC VEHICLE PASSED')
    expect(getStatusLabel('REGISTERED', 'GBB')).toBe('REGISTERED')
  })
})
