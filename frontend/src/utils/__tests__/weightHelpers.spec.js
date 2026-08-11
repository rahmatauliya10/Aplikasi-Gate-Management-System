import { describe, it, expect } from 'vitest'
import { getWeightRecordTypes } from '../weightHelpers.js'

describe('getWeightRecordTypes', () => {
  it('returns IN = gross and OUT = tare for GBB and GKG processes', () => {
    const gbb = getWeightRecordTypes('GBB')
    expect(gbb.gross).toBe('IN')
    expect(gbb.tare).toBe('OUT')

    const gkg = getWeightRecordTypes('GKG')
    expect(gkg.gross).toBe('IN')
    expect(gkg.tare).toBe('OUT')
  })

  it('returns IN = tare and OUT = gross for GBJ processes', () => {
    const gbj = getWeightRecordTypes('GBJ')
    expect(gbj.gross).toBe('OUT')
    expect(gbj.tare).toBe('IN')
  })
})
