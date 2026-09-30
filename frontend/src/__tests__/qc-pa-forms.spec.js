import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoalAnalysisForm from '../components/qc/CoalAnalysisForm.vue'
import ChemicalPacForm from '../components/qc/ChemicalPacForm.vue'
import ChemicalRapidKlenForm from '../components/qc/ChemicalRapidKlenForm.vue'

describe('QC PA Dynamic Forms Tests (Task 7)', () => {
  describe('CoalAnalysisForm', () => {
    it('renders Batubara form and displays RELEASE button when within moisture spec', async () => {
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
    })

    it('displays RETEST_REQUIRED button in Round 1 when moisture exceeds limit', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 1,
        },
      })

      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(36) // 36% > 33%

      expect(wrapper.find('#btn-coal-retest').exists()).toBe(true)
      expect(wrapper.find('#btn-coal-release').exists()).toBe(false)
    })

    it('displays PENDING_DISPOSITION button in Round 2 when moisture still exceeds limit', async () => {
      const wrapper = mount(CoalAnalysisForm, {
        props: {
          transaction: { id: 'tx-coal', cargoSubType: 'Batubara' },
          testRound: 2,
        },
      })

      const moistureInput = wrapper.find('#input-coal-moisture')
      await moistureInput.setValue(35.5) // still exceeds limit

      expect(wrapper.find('#btn-coal-utility-disp').exists()).toBe(true)
      expect(wrapper.find('#btn-coal-retest').exists()).toBe(false)
    })
  })

  describe('ChemicalPacForm', () => {
    it('disables release button when pH or density are out of specification', async () => {
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
    })
  })

  describe('ChemicalRapidKlenForm', () => {
    it('validates alkalinity and pH thresholds before permitting release', async () => {
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
    })
  })
})
