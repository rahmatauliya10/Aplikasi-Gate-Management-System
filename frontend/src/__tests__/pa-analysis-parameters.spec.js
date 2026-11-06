import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PaAnalysisParameters from '../components/qc/PaAnalysisParameters.vue'

describe('PA parameter result panel', () => {
  it('keeps conflicting stored values visible and puts metadata in expandable details', () => {
    const wrapper = mount(PaAnalysisParameters, { props: { record: { parameters: { moisture: 29, totalMoisture: 31, metadata: { source: 'Lab asli' } } } } })
    expect(wrapper.text()).toContain('Ada nilai alias tersimpan yang berbeda')
    expect(wrapper.get('[data-pa-parameter="moisture"]').text()).toContain('29')
    expect(wrapper.get('[data-pa-parameter="totalMoisture"]').text()).toContain('31')
    expect(wrapper.text()).toContain('Sumber: moisture')
    expect(wrapper.text()).toContain('Sumber: totalMoisture')
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
    expect(wrapper.get('details').text()).toContain('Lab asli')
    expect(wrapper.text()).not.toContain('OOS')
    wrapper.unmount()
  })
  it('shows frozen rule references and badges without repeating legacy notices', () => {
    const wrapper = mount(PaAnalysisParameters, { props: { record: { parameters: { ph: 4.5, density: 1.2 }, specSnapshot: { profile: 'PAC_PA', provider: { version: 'historical-v1' }, effectiveThresholds: { phMin: 3.5, phMax: 4, densityMin: 1.17, densityMax: 1.26 } } } } })
    expect(wrapper.find('[data-testid="pa-legacy-spec-notice"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('historical-v1')
    expect(wrapper.get('[data-pa-parameter="ph"]').text()).toContain('OOS')
    expect(wrapper.get('[data-pa-parameter="ph"]').text()).toContain('3.5 – 4')
    expect(wrapper.get('[data-pa-parameter="density"]').text()).toContain('PASS')
    wrapper.unmount()
  })
  it('displays an empty state without default measurements or decisions', () => {
    const wrapper = mount(PaAnalysisParameters, { props: { record: { parameters: {} } } })
    expect(wrapper.text()).toContain('Belum ada parameter analisa yang tercatat')
    expect(wrapper.findAll('[data-pa-parameter]')).toHaveLength(0)
    wrapper.unmount()
  })
})
