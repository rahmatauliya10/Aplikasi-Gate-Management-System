import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { routes } from '../router'
import { useTruckStore } from '../stores/truckStore'
import { useAuthStore } from '../stores/authStore'
import api from '../services/api'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.clearAllMocks() })

async function setup(name, processType, status, id = 'tx-1') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { role: 'ADMIN', name: 'Admin' }
  const store = useTruckStore()
  const rows = ['tx-1', 'tx-2'].map(id => ({
    id, processType, status, revision: 1, plateNumber: `B ${id}`, driverName: id,
    createdAt: new Date().toISOString(), suratJalanNumber: 'SJ', poNumber: 'PO',
  }))
  vi.spyOn(store, 'fetchTrucks').mockImplementation(async () => { store.trucks = rows })
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name, query: { transactionId: id } })
  const wrapper = mount({ render: () => h(RouterView) }, {
    global: { plugins: [pinia, router], stubs: {
      TruckDetailsModal: true, StepTimeline: true, ProcessTimerBadge: true,
      PageHeader: true, StatusBadge: true, Pagination: true,
    } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { router, wrapper, store, View: routes.find(r => r.name === name).component }
}

describe('real operational pages consume reminder deep links', () => {
  it.each([
    ['gbb', 'GBB', 'WAREHOUSE_IN_PROGRESS'],
    ['gbj', 'GBJ', 'WAREHOUSE_IN_PROGRESS'],
    ['gsp', 'GSP', 'WAREHOUSE_IN_PROGRESS'],
    ['qc', 'GBJ', 'QC_VEHICLE_PENDING'],
    ['weighbridge', 'GBB', 'REGISTERED'],
    ['gate-out', 'GBJ', 'WEIGH_OUT_DONE'],
  ])('%s selects on mount and same-page switch without workflow mutations', async (name, process, status) => {
    const { router, wrapper, View } = await setup(name, process, status)
    const view = wrapper.findComponent(View)
    expect(view.vm.selectedTruck.id).toBe('tx-1')
    await router.push({ name, query: { transactionId: 'tx-2' } })
    await flushPromises()
    expect(view.vm.selectedTruck.id).toBe('tx-2')
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it.each([
    ['qc', 'GBJ', 'REGISTERED'],
    ['qc', 'GBB', 'WEIGH_IN_DONE'],
    ['qc', 'GSP', 'WAREHOUSE_DONE'],
    ['gate-out', 'GBJ', 'QC_VEHICLE_REJECTED'],
    ['dashboard', 'GBB', 'UNCONFIGURED_STAGE'],
  ])('%s opens existing details for non-actionable reminder stage %s / %s', async (name, process, status) => {
    const { wrapper, View } = await setup(name, process, status)
    const view = wrapper.findComponent(View)
    expect(view.vm.selectedTruck.id).toBe('tx-1')
    expect(view.vm.showDetailsModal).toBe(true)
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('does not select a transaction outside the page queue', async () => {
    const { wrapper, router, View } = await setup('gbj', 'GSP', 'WAREHOUSE_IN_PROGRESS')
    expect(wrapper.findComponent(View).vm.selectedTruck).toBeNull()
    expect(router.currentRoute.value.query.transactionId).toBeUndefined()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('preserves GBJ form input and URL when a transaction switch is canceled', async () => {
    const { wrapper, router, View } = await setup('gbj', 'GBJ', 'WAREHOUSE_IN_PROGRESS')
    const view = wrapper.findComponent(View)
    view.vm.sjInput = 'UNSAVED SJ'
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await router.push({ name: 'gbj', query: { transactionId: 'tx-2' } })
    await flushPromises()
    expect(view.vm.selectedTruck.id).toBe('tx-1')
    expect(view.vm.sjInput).toBe('UNSAVED SJ')
    expect(router.currentRoute.value.query.transactionId).toBe('tx-1')
  })
})
