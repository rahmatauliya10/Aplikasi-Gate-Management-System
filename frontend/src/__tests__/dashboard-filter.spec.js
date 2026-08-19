import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardFilterBar from '../components/DashboardFilterBar.vue'

describe('DashboardFilterBar Component', () => {
  it('should render preset buttons and date inputs', () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'TODAY', startDate: '2026-08-19', endDate: '2026-08-19' },
        loading: false
      }
    })

    const buttons = wrapper.findAll('button')
    const buttonTexts = buttons.map(b => b.text())
    expect(buttonTexts.some(t => t.includes('Hari Ini'))).toBe(true)
    expect(buttonTexts.some(t => t.includes('Minggu Ini'))).toBe(true)
    expect(buttonTexts.some(t => t.includes('Bulan Ini'))).toBe(true)
    expect(buttonTexts.some(t => t.includes('Semua'))).toBe(true)
  })

  it('should emit update and change events when a preset is clicked', async () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'TODAY', startDate: '2026-08-19', endDate: '2026-08-19' },
        loading: false
      }
    })

    const allBtn = wrapper.findAll('button').find(b => b.text().includes('Semua'))
    expect(allBtn).toBeDefined()
    await allBtn.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('change')).toBeTruthy()
    const lastChange = wrapper.emitted('change')[0][0]
    expect(lastChange.preset).toBe('ALL')
    expect(lastChange.startDate).toBe('')
    expect(lastChange.endDate).toBe('')
  })

  it('should reset back to TODAY preset when reset button is clicked', async () => {
    const wrapper = mount(DashboardFilterBar, {
      props: {
        modelValue: { preset: 'CUSTOM', startDate: '2026-08-01', endDate: '2026-08-10' },
        loading: false
      }
    })

    const resetBtn = wrapper.findAll('button').find(b => b.text().includes('Reset') || b.attributes('title')?.includes('Reset'))
    expect(resetBtn).toBeDefined()
    await resetBtn.trigger('click')

    const lastChange = wrapper.emitted('change')[wrapper.emitted('change').length - 1][0]
    expect(lastChange.preset).toBe('TODAY')
  })
})
