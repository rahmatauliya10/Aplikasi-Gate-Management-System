import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useTransactionDeepLink } from '../composables/useTransactionDeepLink'
import { useUnsavedWarning } from '../composables/useUnsavedWarning'

const warning = vi.hoisted(() => vi.fn())
vi.mock('../composables/useToast', () => ({ useToast: () => ({ warning }) }))
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); warning.mockClear() })

async function setup({ id = 'tx-1', fetchTrucks = vi.fn().mockResolvedValue(), rows = [{ id: 'tx-1' }, { id: 'tx-10' }] } = {}) {
  const selectedTruck = ref(null)
  const dirty = ref(false)
  const trucks = ref(rows)
  const selectTruck = vi.fn(truck => { selectedTruck.value = truck })
  const View = defineComponent({
    setup() {
      useUnsavedWarning(dirty)
      useTransactionDeepLink({ fetchTrucks, trucks, selectedTruck, selectTruck })
      return () => h('div', selectedTruck.value?.id || 'none')
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/process', component: View }] })
  await router.push({ path: '/process', query: id === undefined ? {} : { transactionId: id } })
  const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return { router, wrapper, selectedTruck, selectTruck, dirty, fetchTrucks }
}

describe('transaction deep links with real query navigation', () => {
  it('selects exact IDs after loading without prefix matches or repeated resets', async () => {
    const args = await setup()
    expect(args.selectedTruck.value.id).toBe('tx-1')
    await args.router.push('/process?transactionId=tx-10')
    await flushPromises()
    expect(args.selectedTruck.value.id).toBe('tx-10')
    await args.router.push('/process?transactionId=tx-10&tab=all')
    await flushPromises()
    expect(args.selectTruck).toHaveBeenCalledTimes(2)
  })

  it('retains selection and query when dirty switch is canceled, then switches on confirmation', async () => {
    const args = await setup()
    args.dirty.value = true
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await args.router.push('/process?transactionId=tx-10')
    expect(args.router.currentRoute.value.query.transactionId).toBe('tx-1')
    expect(args.selectedTruck.value.id).toBe('tx-1')
    confirm.mockReturnValue(true)
    await args.router.push('/process?transactionId=tx-10')
    await flushPromises()
    expect(args.selectedTruck.value.id).toBe('tx-10')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('does not prompt for unrelated queries or selecting the same ID', async () => {
    const args = await setup()
    args.dirty.value = true
    const confirm = vi.spyOn(window, 'confirm')
    await args.router.push('/process?transactionId=tx-1&tab=all')
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each(['missing', ['tx-1', 'tx-10'], ''])('clears unavailable or malformed ID %j without selecting another truck', async id => {
    const args = await setup({ id })
    await flushPromises()
    expect(args.selectedTruck.value).toBeNull()
    expect(args.selectTruck).not.toHaveBeenCalled()
    expect(args.router.currentRoute.value.query.transactionId).toBeUndefined()
    expect(warning).toHaveBeenCalledTimes(1)
  })

  it('clears the prior selection when browser navigation removes the transaction query', async () => {
    const args = await setup()
    await args.router.push('/process')
    await flushPromises()
    expect(args.selectedTruck.value).toBeNull()
  })

  it('does not select stale cached data when loading fails', async () => {
    const args = await setup({ fetchTrucks: vi.fn().mockRejectedValue(new Error('offline')) })
    expect(args.selectedTruck.value).toBeNull()
    expect(args.router.currentRoute.value.query.transactionId).toBe('tx-1')
    expect(warning).toHaveBeenCalled()
  })

  it('ignores an older navigation response and serializes the replacement load', async () => {
    let finishFirst
    const fetchTrucks = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValue(undefined)
    const args = await setup({ fetchTrucks })
    await args.router.push('/process?transactionId=tx-10')
    await flushPromises()
    expect(fetchTrucks).toHaveBeenCalledTimes(1)
    finishFirst()
    await flushPromises()
    expect(args.selectTruck).toHaveBeenCalledTimes(1)
    expect(args.selectedTruck.value.id).toBe('tx-10')
    expect(fetchTrucks).toHaveBeenCalledTimes(2)
  })

  it('ignores a pending response after unmount', async () => {
    let finish
    const args = await setup({ fetchTrucks: () => new Promise(resolve => { finish = resolve }) })
    args.wrapper.unmount()
    finish()
    await flushPromises()
    expect(args.selectTruck).not.toHaveBeenCalled()
  })
})
