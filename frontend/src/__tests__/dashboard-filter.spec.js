import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardFilterBar from '../components/DashboardFilterBar.vue'

describe('DashboardFilterBar Component', () => {
  it('should render date inputs and reset button without quick preset buttons', () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'TODAY', startDate: '2026-08-19', endDate: '2026-08-19' },
        loading: false
      }
    })

    const buttons = wrapper.findAll('button')
    const buttonTexts = buttons.map(b => b.text())
    
    // Quick preset buttons must be removed
    expect(buttonTexts.some(t => t.includes('Hari Ini'))).toBe(false)
    expect(buttonTexts.some(t => t.includes('Minggu Ini'))).toBe(false)
    expect(buttonTexts.some(t => t.includes('Bulan Ini'))).toBe(false)
    expect(buttonTexts.some(t => t.includes('Semua'))).toBe(false)

    // Reset button and inputs must exist
    expect(buttonTexts.some(t => t.includes('RESET'))).toBe(true)
    const inputs = wrapper.findAll('input[type="date"]')
    expect(inputs.length).toBe(2)
  })

  it('should emit update and change events when custom date is changed', async () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'TODAY', startDate: '2026-08-19', endDate: '2026-08-19' },
        loading: false
      }
    })

    const inputs = wrapper.findAll('input[type="date"]')
    await inputs[0].setValue('2026-08-10')
    await inputs[0].trigger('change')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('change')).toBeTruthy()
    const lastChange = wrapper.emitted('change')[wrapper.emitted('change').length - 1][0]
    expect(lastChange.startDate).toBe('2026-08-10')
  })

  it('should reset back to TODAY when reset button is clicked', async () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'CUSTOM', startDate: '2026-08-01', endDate: '2026-08-10' },
        loading: false
      }
    })

    const resetBtn = wrapper.findAll('button').find(b => b.text().includes('RESET') || b.attributes('title')?.includes('Reset'))
    expect(resetBtn).toBeDefined()
    await resetBtn.trigger('click')

    const lastChange = wrapper.emitted('change')[wrapper.emitted('change').length - 1][0]
    expect(lastChange.preset).toBe('TODAY')
    expect(lastChange.startDate).toBeTruthy()
    expect(lastChange.endDate).toBeTruthy()
  })
})
