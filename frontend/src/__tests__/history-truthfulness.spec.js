import { describe, expect, it } from 'vitest'
import source from '../views/History.vue?raw'

describe('History presentation contract', () => {
  it('does not claim SLA, calibration, or static trend evidence that is not supplied', () => {
    expect(source).toContain('SLA belum ditetapkan')
    expect(source).toContain('Net Weight Recorded')
    expect(source).toContain(':sla-minutes="null"')
    for (const unsupported of ['SLA Target: Achieved', 'SLA Alert: Delayed', '100% Scales Calibrated', 'ACTION REQUIRED', 'Delay:', '> 15', 'M 0 15 Q 15 5']) {
      expect(source).not.toContain(unsupported)
    }
  })
})
