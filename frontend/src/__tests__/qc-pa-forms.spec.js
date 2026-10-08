import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoalAnalysisForm from '../components/qc/CoalAnalysisForm.vue'
import ChemicalPacForm from '../components/qc/ChemicalPacForm.vue'
import ChemicalRapidKlenForm from '../components/qc/ChemicalRapidKlenForm.vue'
import { evaluateCoalAnalysis } from '../../../backend/src/qc/constants/coal-specification'

describe('QC PA Dynamic Forms Tests - Real Component Contract Tests', () => {
  describe('CoalAnalysisForm', () => {
    it('renders Batubara form with locked calorie bands and emits factual measurements WITHOUT client result or decision when within spec', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      expect(wrapper.text()).toContain('Analisis PA — Batubara')
      expect(wrapper.text()).toContain('Digital Moisture Analyzer')
      expect(wrapper.text()).not.toContain('ASTM D3302')

      // Assert only locked calorie bands exist (filtering disabled prompt)
      const calorieSelect = wrapper.find('#select-coal-calorie')
      expect(calorieSelect.exists()).toBe(true)
      const options = calorieSelect.findAll('option')
      const optionValues = options.filter(o => !o.element.disabled).map(o => o.element.value)
      expect(optionValues).toEqual(['COAL_5600_6000', 'COAL_GT_6000'])

      // Form is incomplete initially before operator selections (P1-04 UX)
      const releaseBtn = wrapper.find('#btn-coal-release')
      expect(releaseBtn.attributes('disabled')).toBeDefined()

      // Select COAL_5600_6000 (max TM: 33%)
      await calorieSelect.setValue('COAL_5600_6000')

      // Set moisture within limit (30% <= 33%)
      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(30)

      // Ensure visual selects are explicitly confirmed by operator
      await wrapper.find('#select-coal-kondisi').setValue('Kering (Tidak Basah)')
      await wrapper.find('#select-coal-warna').setValue('Hitam')
      await wrapper.find('#select-coal-level-rank').setValue('High Rank Coal')
      await wrapper.find('#select-coal-kilap').setValue('Hitam Mengkilap')
      await wrapper.find('#select-coal-bahan-pengotor').setValue('Tidak ada kontaminasi batuan maupun tanah')

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
      expect(emittedPayload.parameters.visual.kondisi).toBe('Kering (Tidak Basah)')
      expect(emittedPayload.parameters.kondisi).toBe('Kering (Tidak Basah)')
      expect(emittedPayload.parameters.calorieBand).toBe('COAL_5600_6000')

      // CRITICAL ARCHITECTURAL CONTRACT: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })

    it('displays Retest indication in Round 1 when moisture exceeds limit (or visual OOS) and emits WITHOUT client result or decision', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      await wrapper.find('#select-coal-calorie').setValue('COAL_5600_6000')
      await wrapper.find('#select-coal-kondisi').setValue('Kering (Tidak Basah)')
      await wrapper.find('#select-coal-warna').setValue('Hitam')
      await wrapper.find('#select-coal-level-rank').setValue('High Rank Coal')
      await wrapper.find('#select-coal-kilap').setValue('Hitam Mengkilap')
      await wrapper.find('#select-coal-bahan-pengotor').setValue('Tidak ada kontaminasi batuan maupun tanah')

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

    it('displays Retest indication in Round 1 when factual visual is OOS even if moisture is OK', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      // Moisture OK
      await wrapper.find('#input-coal-moisture').setValue(28)
      // Visual OOS (Basah (Kandungan Air Berlebih))
      await wrapper.find('#select-coal-kondisi').setValue('Basah (Kandungan Air Berlebih)')

      const retestBtn = wrapper.find('#btn-coal-retest')
      expect(retestBtn.exists()).toBe(true)
      expect(wrapper.find('#btn-coal-release').exists()).toBe(false)
    })

    it('INTEGRATION: exact payload emitted by CoalAnalysisForm is accepted by evaluateCoalAnalysis server evaluator without fixture translation', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal-e2e', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      // Explicitly set compliant parameters via form UI
      await wrapper.find('#select-coal-calorie').setValue('COAL_5600_6000')
      await wrapper.find('#select-coal-kondisi').setValue('Kering (Tidak Basah)')
      await wrapper.find('#select-coal-warna').setValue('Hitam')
      await wrapper.find('#select-coal-level-rank').setValue('High Rank Coal')
      await wrapper.find('#select-coal-kilap').setValue('Hitam Mengkilap')
      await wrapper.find('#select-coal-bahan-pengotor').setValue('Tidak ada kontaminasi batuan maupun tanah')
      await wrapper.find('#input-coal-moisture').setValue(31.5)

      const releaseBtn = wrapper.find('#btn-coal-release')
      expect(releaseBtn.exists()).toBe(true)
      await releaseBtn.trigger('click')

      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      // DIRECT EVALUATION: Pass the EXACT form parameters into backend evaluateCoalAnalysis
      const evalResult = evaluateCoalAnalysis({
        calorieBand: emittedPayload.parameters.calorieBand,
        targetCalorie: emittedPayload.parameters.calorieBand,
        totalMoisture: emittedPayload.parameters.totalMoisture,
        testRound: emittedPayload.testRound,
        visual: emittedPayload.parameters.visual,
      })

      expect(evalResult.isConfigured).toBe(true)
      expect(evalResult.visualPassed).toBe(true)
      expect(evalResult.moisturePassed).toBe(true)
      expect(evalResult.result).toBe('PASS')
      expect(evalResult.decision).toBe('RELEASE')
    })

    it('displays Reject indication in Round 2 when moisture or visual exceeds limit and emits WITHOUT client result or decision (NO Utility Disposition)', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 2,
        },
      })

      await wrapper.find('#select-coal-calorie').setValue('COAL_5600_6000')
      await wrapper.find('#select-coal-kondisi').setValue('Kering (Tidak Basah)')
      await wrapper.find('#select-coal-warna').setValue('Hitam')
      await wrapper.find('#select-coal-level-rank').setValue('High Rank Coal')
      await wrapper.find('#select-coal-kilap').setValue('Hitam Mengkilap')
      await wrapper.find('#select-coal-bahan-pengotor').setValue('Tidak ada kontaminasi batuan maupun tanah')

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
    it('does NOT render PENDING_SIGNOFF governance banner or Al2O3 field, validates spec, and emits factual parameters WITHOUT client result/decision', async () => {
      const wrapper = mount(ChemicalPacForm, {
        props: {
          transaction: { id: 'tx-pac', cargoSubType: 'PAC 280 AC' },
        },
      })

      expect(wrapper.text()).toContain('PAC 280 AC')

      // Assert governance banner does NOT exist
      expect(wrapper.find('#banner-pac-governance').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('PENDING_SIGNOFF')

      // Assert Al2O3 is NOT present
      expect(wrapper.text()).not.toContain('Al2O3')

      // Sensory is valid by default
      expect(wrapper.find('#select-pac-visual').element.value).toBe('Kuning')
      expect(wrapper.find('#select-pac-foreign-matters').element.value).toBe('Tidak ada kontaminasi')

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
      expect(emittedPayload.parameters.sensory.visual).toBe('Kuning')

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })
  })

  describe('ChemicalRapidKlenForm', () => {
    it('does NOT render PENDING_SIGNOFF banner, enforces strict greater-than thresholds, and emits factual parameters WITHOUT client result/decision', async () => {
      const wrapper = mount(ChemicalRapidKlenForm, {
        props: {
          transaction: { id: 'tx-rapid', cargoSubType: 'Rapid Klen' },
        },
      })

      expect(wrapper.text()).toContain('Rapid Klen')

      // Assert governance banner does NOT exist
      expect(wrapper.find('#banner-rapid-governance').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('PENDING_SIGNOFF')

      // Exact boundary values must FAIL (Na2O = 35.00, NaOH = 45.16, pH = 12.000, Density = 1.400)
      await wrapper.find('#input-rapid-na2o').setValue(35.00)
      await wrapper.find('#input-rapid-naoh').setValue(45.16)
      await wrapper.find('#input-rapid-ph').setValue(12.000)
      await wrapper.find('#input-rapid-density').setValue(1.400)

      const releaseBtn = wrapper.find('#btn-rapid-release')
      expect(releaseBtn.attributes('disabled')).toBeDefined()

      // Set values strictly greater than boundaries
      await wrapper.find('#input-rapid-na2o').setValue(35.01)
      await wrapper.find('#input-rapid-naoh').setValue(45.17)
      await wrapper.find('#input-rapid-ph').setValue(12.001)
      await wrapper.find('#input-rapid-density').setValue(1.401)

      expect(releaseBtn.attributes('disabled')).toBeUndefined()
      expect(releaseBtn.text()).toContain('Kirim Hasil Analisis PA')

      // Submit
      await releaseBtn.trigger('click')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const emittedPayload = wrapper.emitted('submit')[0][0]

      expect(emittedPayload.productCategory).toBe('Chemicals')
      expect(emittedPayload.productName).toBe('Rapid Klen')
      expect(emittedPayload.testRound).toBe(1)
      expect(emittedPayload.parameters.alkalinityNa2O).toBe(35.01)
      expect(emittedPayload.parameters.alkalinityNaOH).toBe(45.17)
      expect(emittedPayload.parameters.ph).toBe(12.001)
      expect(emittedPayload.parameters.density).toBe(1.401)

      // Server-authoritative contract: No client result or decision
      expect(emittedPayload.result).toBeUndefined()
      expect(emittedPayload.decision).toBeUndefined()
    })
  })
})
