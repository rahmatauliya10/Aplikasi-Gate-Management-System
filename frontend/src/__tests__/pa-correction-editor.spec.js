import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PaCorrectionEditor from '../components/qc/PaCorrectionEditor.vue'
import { buildPaCorrectionPatch } from '../utils/correctionPayload'
import { selectEffectiveCurrentPa, resolvePaEditorProfile } from '../utils/paCurrentSelector'
import { formatPaParameters } from '../utils/paParameterDisplay'

const record = { id: 'pa-1', analysisProfile: 'PAC_PA', testRound: 1, revision: 2, isCurrent: true, isVoided: false, parameters: { ph: 6, density: 1.2, sensory: { visual: 'Kuning', foreignMatters: 'Tidak ada kontaminasi', packagingLabel: 'Kemasan & label tidak rusak' } } }
describe('PA factual correction editor', () => {
  it('requires server preview and explicit legacy acknowledgement, then emits a sparse item', async () => {
    const wrapper = mount(PaCorrectionEditor, { props: { record, transaction: { revision: 4 } } })
    await wrapper.get('#pa-correction-ph').setValue('4.5')
    await wrapper.findAll('button').find(b => b.text() === 'Preview evaluasi').trigger('click')
    expect(wrapper.emitted('preview')[0][0]).toMatchObject({ expectedRevision: 4, expectedPaRevision: 2, targetRecordId: 'pa-1', parameters: { ph: 4.5 } })
    await wrapper.setProps({ preview: { fingerprint: 'fp', result: 'PASS', status: 'RELEASE' } })
    const use = wrapper.findAll('button').find(b => b.text() === 'Gunakan koreksi PA')
    expect(use.attributes('disabled')).toBeDefined()
    await wrapper.get('#pa-correction-ack').setValue(true)
    await use.trigger('click')
    expect(wrapper.emitted('item')[0][0]).toMatchObject({ targetModule: 'QC_PRODUCT_ANALYSIS', newValue: { ph: 4.5 }, evaluationFingerprint: 'fp', acknowledgeCurrentSpec: true })
    await wrapper.get('#pa-correction-ph').setValue('4')
    expect(wrapper.emitted('invalidate').length).toBeGreaterThan(1)
    wrapper.unmount()
  })
  it('does not fabricate missing measurements and rejects clearing a persisted value', async () => {
    const wrapper = mount(PaCorrectionEditor, { props: { record: { ...record, parameters: { ph: 6 } }, transaction: { revision: 4 } } })
    expect(wrapper.get('#pa-correction-density').element.value).toBe('')
    await wrapper.get('#pa-correction-ph').setValue('')
    expect(wrapper.text()).toContain('tidak boleh dikosongkan')
    wrapper.unmount()
  })
  it('preserves sparse nested changes and blocks metadata/boolean writes', () => {
    expect(buildPaCorrectionPatch('PAC_PA', record.parameters, { sensory: { visual: 'Keruh' } })).toEqual({ sensory: { visual: 'Keruh' } })
    expect(() => buildPaCorrectionPatch('PAC_PA', {}, { sensory: { approvedBy: 'admin' } })).toThrow()
    expect(() => buildPaCorrectionPatch('PAC_PA', {}, { ph: true })).toThrow()
  })
  it('selects per-round current evidence and fails closed on duplicates or invalid rounds', () => {
    expect(selectEffectiveCurrentPa([{ ...record, id: 'old', isCurrent: false }, record, { ...record, id: 'round2', testRound: 2 }]).id).toBe('round2')
    expect(selectEffectiveCurrentPa([record, { ...record, id: 'duplicate' }])).toBeNull()
    expect(selectEffectiveCurrentPa([record, { ...record, testRound: 3 }])).toBeNull()
    expect(resolvePaEditorProfile(record, { gspAnalysisProfile: 'COAL_PA' })).toBe('')
  })
  it('uses frozen thresholds and treats legacy values neutrally', () => {
    expect(formatPaParameters(record).every(f => f.isOk === null)).toBe(true)
    const rows = formatPaParameters({ ...record, parameters: { ph: 4.5 }, specSnapshot: { profile: 'PAC_PA', effectiveThresholds: { phMin: 3.5, phMax: 4 }, sensoryRules: {} } })
    expect(rows.find(r => r.label === 'pH')).toMatchObject({ isOk: false, specText: '3.5 – 4' })
  })
})
