import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProcessTimerBadge from '../components/ProcessTimerBadge.vue'

describe('ProcessTimerBadge SLA evidence', () => {
  afterEach(() => vi.useRealTimers())

  it.each([null, 0, -1, Number.NaN])('shows duration without SLA warnings for %s', (slaMinutes) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const wrapper = mount(ProcessTimerBadge, {
      props: { startTime: '2026-10-19T08:00:00Z', slaMinutes }
    })
    expect(wrapper.text()).toContain('04:00:00')
    expect(wrapper.text()).not.toContain('OVER SLA')
    expect(wrapper.classes().join(' ')).not.toContain('bg-red')
    expect(wrapper.classes().join(' ')).not.toContain('bg-amber')
    wrapper.unmount()
  })

  it('does not assert overdue for a completed timer without a matching SLA', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const wrapper = mount(ProcessTimerBadge, {
      props: {
        startTime: '2026-10-19T08:00:00Z',
        endTime: '2026-10-19T12:00:00Z',
        slaMinutes: null
      }
    })
    expect(wrapper.text()).toContain('04:00:00')
    expect(wrapper.text()).not.toContain('OVER SLA')
    wrapper.unmount()
  })

  it('retains warnings when an explicit positive SLA is provided', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const wrapper = mount(ProcessTimerBadge, {
      props: { startTime: '2026-10-19T08:00:00Z', slaMinutes: 90 }
    })
    expect(wrapper.text()).toContain('OVER SLA')
    wrapper.unmount()
  })
})
