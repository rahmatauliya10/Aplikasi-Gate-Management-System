import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import PendingReminderBell from '../components/PendingReminderBell.vue'
import LoginPendingReminderModal from '../components/LoginPendingReminderModal.vue'
import { useAuthStore } from '../stores/authStore'
import { useReminderStore } from '../stores/reminderStore'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks() })

async function setup(Component) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { role: 'WAREHOUSE', warehouseAccess: ['GBJ'] }
  auth.token = 'test-token'
  const store = useReminderStore()
  store.isLoginModalDismissed = false
  vi.spyOn(store, 'fetchReminders').mockResolvedValue()
  vi.spyOn(store, 'markAsRead').mockResolvedValue()
  vi.spyOn(store, 'dismissLoginModal')
  store.reminders = [{
    id: 'rem-1', transactionId: 'tx-click', routePath: '/gbj-process',
    plateNumber: 'B 1234', category: 'NEED_ACTION', isMyAction: true,
  }]
  store.summary = { needAction: 1, total: 1 }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'dashboard', component: { template: '<div />' } },
    { path: '/gbj', name: 'gbj', component: { template: '<div />' }, meta: { roles: ['ADMIN', 'WAREHOUSE'], warehouseCode: 'GBJ' } },
  ] })
  await router.push('/')
  const wrapper = mount(Component, { global: { plugins: [pinia, router] } })
  wrappers.push(wrapper)
  return { wrapper, store, router, auth }
}

describe.each([PendingReminderBell, LoginPendingReminderModal])('reminder component navigation', Component => {
  it('uses the shared route resolver and carries transactionId', async () => {
    const { wrapper, store, router } = await setup(Component)
    if (Component === PendingReminderBell) {
      await wrapper.get('#pending-reminder-bell-btn').trigger('click')
      await wrapper.findAll('button').find(button => button.text().includes('Buka Transaksi')).trigger('click')
    } else await wrapper.get('#login-reminder-view-all-btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/gbj?transactionId=tx-click')
    expect(store.markAsRead).toHaveBeenCalledWith('rem-1')
  })

  it('retains unread state when access is denied', async () => {
    const { wrapper, store, router, auth } = await setup(Component)
    auth.user = { role: 'WAREHOUSE', warehouseAccess: ['GSP'] }
    if (Component === PendingReminderBell) {
      await wrapper.get('#pending-reminder-bell-btn').trigger('click')
      await wrapper.findAll('button').find(button => button.text().includes('Buka Transaksi')).trigger('click')
    } else await wrapper.get('#login-reminder-view-all-btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(store.markAsRead).not.toHaveBeenCalled()
    expect(store.dismissLoginModal).not.toHaveBeenCalled()
  })
})
