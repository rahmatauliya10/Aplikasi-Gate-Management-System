import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoalAnalysisForm from '../components/qc/CoalAnalysisForm.vue'
import ChemicalPacForm from '../components/qc/ChemicalPacForm.vue'
import ChemicalRapidKlenForm from '../components/qc/ChemicalRapidKlenForm.vue'

describe('QC PA Dynamic Forms Tests - Real Component Contract Tests', () => {
  describe('CoalAnalysisForm', () => {
    it('renders Batubara form and emits factual measurements WITHOUT client result or decision when within moisture spec', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      expect(wrapper.text()).toContain('Analisis PA — Batubara')
      expect(wrapper.text()).toContain('ASTM D3302')

      // Set moisture within limit (30% <= 33%)
      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(30)

      // Check all sensory boxes
      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      for (const cb of checkboxes) {
        await cb.setValue(true)
      }

      const releaseBtn = wrapper.find('#btn-coal-release')
      expect(releaseBtn.exists()).toBe(true)
      expect(releaseBtn.attributes('disabled')).toBeUndefined()
      expect(releaseBtn.text()).toContain('Kirim Hasil Analisis PA')

      // Click submit
      await releaseBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      // Assert factual parameters emitted
      expect(emittedPayload.productCategory).toBe('Coal')
      expect(emittedPayload.productName).toBe('Batubara')
      expect(emittedPayload.testRound).toBe(1)
      expect(emittedPayload.parameters.totalMoisture).toBe(30)
      expect(emittedPayload.parameters.sensory.visual).toBe(true)

      // CRITICAL ARCHITECTURAL CONTRACT: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })

    it('displays Retest indication in Round 1 when moisture exceeds limit and emits WITHOUT client result or decision', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(38) // 38% > 33%

      const retestBtn = wrapper.find('#btn-coal-retest')
      expect(retestBtn.exists()).toBe(true)
      expect(retestBtn.text()).toContain('Hasil di atas batas — akan dievaluasi untuk Retest')
      expect(wrapper.find('#btn-coal-release').exists()).toBe(false)

      await retestBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      expect(emittedPayload.productCategory).toBe('Coal')
      expect(emittedPayload.productName).toBe('Batubara')
      expect(emittedPayload.testRound).toBe(1)
      expect(emittedPayload.parameters.totalMoisture).toBe(38)

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })

    it('displays Reject indication in Round 2 when moisture exceeds limit and emits WITHOUT client result or decision (NO Utility Disposition)', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 2,
        },
      })

      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(36.5) // still exceeds limit in Round 2

      // Assert NO Utility disposition button exists
      expect(wrapper.find('#btn-coal-utility-disp').exists()).toBe(false)
      expect(wrapper.find('#btn-coal-retest').exists()).toBe(false)

      // Assert Round 2 rejection button is displayed
      const rejectBtn = wrapper.find('#btn-coal-reject')
      expect(rejectBtn.exists()).toBe(true)
      expect(rejectBtn.text()).toContain('Muatan Ditolak (REJECT)')

      await rejectBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      expect(emittedPayload.productCategory).toBe('Coal')
      expect(emittedPayload.productName).toBe('Batubara')
      expect(emittedPayload.testRound).toBe(2)
      expect(emittedPayload.parameters.totalMoisture).toBe(36.5)

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })
  })

  describe('ChemicalPacForm', () => {
    it('disables submit button when parameters out-of-spec, and on submit emits factual parameters WITHOUT client result or decision', async () => {
      const wrapper = mount(ChemicalPacForm, {
        props: {
          transaction: { id: 'tx-pac', cargoSubType: 'PAC 280 AC' },
        },
      })

      expect(wrapper.text()).toContain('PAC 280 AC')

      // Check sensory
      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      for (const cb of checkboxes) {
        await cb.setValue(true)
      }

      // Enter invalid pH (2.0 < 3.50)
      await wrapper.find('#input-pac-ph').setValue(2.0)
      await wrapper.find('#input-pac-density').setValue(1.20)

      const releaseBtn = wrapper.find('#btn-pac-release')
      expect(releaseBtn.attributes('disabled')).toBeDefined()

      // Fix pH to valid (4.25 in 3.50 - 5.00)
      await wrapper.find('#input-pac-ph').setValue(4.25)
      expect(releaseBtn.attributes('disabled')).toBeUndefined()
      expect(releaseBtn.text()).toContain('Kirim Hasil Analisis PA')

      // Submit
      await releaseBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      expect(emittedPayload.productCategory).toBe('Chemicals')
      expect(emittedPayload.productName).toBe('PAC 280 AC')
      expect(emittedPayload.testRound).toBe(1)
      expect(emittedPayload.parameters.ph).toBe(4.25)
      expect(emittedPayload.parameters.density).toBe(1.20)

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })
  })

  describe('ChemicalRapidKlenForm', () => {
    it('validates thresholds before permitting submission, and emits factual parameters WITHOUT client result or decision', async () => {
      const wrapper = mount(ChemicalRapidKlenForm, {
        props: {
          transaction: { id: 'tx-rapid', cargoSubType: 'Rapid Klen' },
        },
      })

      expect(wrapper.text()).toContain('Rapid Klen')

      // Check sensory
      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      for (const cb of checkboxes) {
        await cb.setValue(true)
      }

      // Set valid values
      await wrapper.find('#input-rapid-na2o').setValue(36.5)
      await wrapper.find('#input-rapid-ph').setValue(13.2)
      await wrapper.find('#input-rapid-density').setValue(1.42)

      const releaseBtn = wrapper.find('#btn-rapid-release')
      expect(releaseBtn.attributes('disabled')).toBeUndefined()
      expect(releaseBtn.text()).toContain('Kirim Hasil Analisis PA')

      // Submit
      await releaseBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      expect(emittedPayload.productCategory).toBe('Chemicals')
      expect(emittedPayload.productName).toBe('Rapid Klen')
      expect(emittedPayload.testRound).toBe(1)
      expect(emittedPayload.parameters.alkalinityNa2O).toBe(36.5)
      expect(emittedPayload.parameters.ph).toBe(13.2)
      expect(emittedPayload.parameters.density).toBe(1.42)

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })
  })
})
