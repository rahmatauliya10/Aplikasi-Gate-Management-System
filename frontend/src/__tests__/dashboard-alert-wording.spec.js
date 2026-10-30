import { describe, expect, it } from 'vitest'
import source from '../views/Dashboard.vue?raw'

describe('Dashboard alert wording contract', () => {
  it('describes an empty alert list without claiming all data is safe', () => {
    expect(source).toContain('No Active Alerts')
    expect(source).toContain('No active alerts in the selected period and filters.')
    expect(source).toContain('Display setting · not formal SLA approval')
    expect(source).toContain('Not formal policy approval')
    expect(source).not.toContain('No Critical Deviations Detected')
    expect(source).not.toContain('All weighbridge data is within safe tolerance limits.')
  })
})
