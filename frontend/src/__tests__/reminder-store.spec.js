import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReminderStore } from '../stores/reminderStore'
import { useAuthStore } from '../stores/authStore'
import { formatArrivalSequence } from '../utils/arrivalSequence'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}))

function createDeferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ReminderStore & ArrivalSequence Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('correctly formats arrival sequence numbers', () => {
    expect(formatArrivalSequence(1)).toBe('#001')
    expect(formatArrivalSequence(23)).toBe('#023')
    expect(formatArrivalSequence(145)).toBe('#145')
    expect(formatArrivalSequence(null)).toBeNull()
    expect(formatArrivalSequence(undefined)).toBeNull()
  })

  it('fetches reminders and updates summary counts for authenticated user', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'test-user-1' }

    const mockData = {
      summary: {
        needAction: 2,
        inProgress: 1,
        waitingOther: 1,
        overdue: 1,
        total: 4
      },
      reminders: [
        {
          id: 'rem-1',
          transactionNumber: 'TRX-001',
          dailySequence: 1,
          category: 'NEED_ACTION',
          isOverdue: true
        },
        {
          id: 'rem-2',
          transactionNumber: 'TRX-002',
          dailySequence: 2,
          category: 'NEED_ACTION',
          isOverdue: false
        },
        {
          id: 'rem-3',
          transactionNumber: 'TRX-003',
          dailySequence: 3,
          category: 'IN_PROGRESS',
          isOverdue: false
        }
      ]
    }

    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: mockData
      }
    })

    const store = useReminderStore()
    await store.fetchReminders()

    expect(store.reminders.length).toBe(3)
    expect(store.needActionCount).toBe(2)
    expect(store.overdueCount).toBe(1)
    expect(store.unreadNeedActionCount).toBe(2)
  })

  it('marks items as read and tracks unread count for authenticated user', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'test-user-1' }

    const mockData = {
      summary: { needAction: 2, inProgress: 0, waitingOther: 0, overdue: 0, total: 2 },
      reminders: [
        { id: 'rem-1', category: 'NEED_ACTION' },
        { id: 'rem-2', category: 'NEED_ACTION' }
      ]
    }
    api.get.mockResolvedValueOnce({ data: { success: true, data: mockData } })

    const store = useReminderStore()
    await store.fetchReminders()

    expect(store.unreadNeedActionCount).toBe(2)
    await store.markAsRead('rem-1')
    expect(store.unreadNeedActionCount).toBe(1)

    // Check localStorage persistence under user-scoped key
    const key = `gms_read_reminder_ids_test-user-1`
    const saved = JSON.parse(localStorage.getItem(key))
    expect(saved).toContain('rem-1')
  })

  it('persists snoozed reminders in localStorage under user key', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'test-user-1' }

    const mockData = {
      summary: { needAction: 2, inProgress: 0, waitingOther: 0, overdue: 1, total: 2 },
      reminders: [
        { id: 'rem-1', category: 'NEED_ACTION', isOverdue: true },
        { id: 'rem-2', category: 'NEED_ACTION', isOverdue: false }
      ]
    }
    api.get.mockResolvedValueOnce({ data: { success: true, data: mockData } })

    const store = useReminderStore()
    await store.fetchReminders()

    expect(store.needActionCount).toBe(2)
    expect(store.overdueCount).toBe(1)
    expect(store.isSnoozed('rem-1')).toBe(false)

    // Snooze rem-1 for 30 minutes
    await store.snoozeReminder('rem-1', 30)

    expect(store.isSnoozed('rem-1')).toBe(true)
    expect(store.needActionCount).toBe(1)
    expect(store.overdueCount).toBe(0)

    // Verify localStorage persistence under user key
    const key = `gms_snoozed_reminders_test-user-1`
    const savedSnooze = JSON.parse(localStorage.getItem(key))
    expect(savedSnooze['rem-1']).toBeGreaterThan(Date.now())

    // Unsnooze
    await store.unsnoozeReminder('rem-1')
    expect(store.isSnoozed('rem-1')).toBe(false)
    expect(store.needActionCount).toBe(2)
    expect(store.overdueCount).toBe(1)
  })

  // ==========================================
  // COR-09 Contractual Test Groups
  // ==========================================

  describe('COR09-01: Direct Cross-Session Isolation (User A -> User B)', () => {
    it('resets in-memory state and isolates storage when switching user identity directly', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()

      // Seed User A reminders
      api.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            summary: { needAction: 1, inProgress: 0, waitingOther: 0, overdue: 0, total: 1 },
            reminders: [{ id: 'rem-a', category: 'NEED_ACTION' }]
          }
        }
      })
      await store.fetchReminders()
      await store.markAsRead('rem-a')
      await store.snoozeReminder('rem-a', 15)

      expect(store.reminders.length).toBe(1)
      expect(store.readReminderIds.has('rem-a')).toBe(true)
      expect(store.isSnoozed('rem-a')).toBe(true)

      // Direct switch to User B
      authStore.user = { id: 'user-b' }

      // In-memory state of A must be cleared immediately
      expect(store.reminders.length).toBe(0)
      expect(store.summary.total).toBe(0)
      expect(store.readReminderIds.has('rem-a')).toBe(false)
      expect(store.isSnoozed('rem-a')).toBe(false)

      // Verify User A storage remains untouched in localStorage
      const userAReads = JSON.parse(localStorage.getItem('gms_read_reminder_ids_user-a'))
      expect(userAReads).toContain('rem-a')

      // Verify User B storage key has not inherited User A's data
      expect(localStorage.getItem('gms_read_reminder_ids_user-b')).toBeNull()
    })
  })

  describe('COR09-02: Login Modal Dismissal Boundaries', () => {
    it('Scenario A: User B does not inherit dismissal from User A on direct switch', () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      expect(store.isLoginModalDismissed).toBe(false)

      store.dismissLoginModal()
      expect(store.isLoginModalDismissed).toBe(true)
      expect(sessionStorage.getItem('gms_login_reminder_dismissed_user-a')).toBe('true')

      // Direct switch to User B
      authStore.user = { id: 'user-b' }
      expect(store.isLoginModalDismissed).toBe(false)
      expect(sessionStorage.getItem('gms_login_reminder_dismissed_user-b')).toBeNull()
    })

    it('Scenario B: clearAuth removes session dismissal, preserves localStorage read/snooze on re-login', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      store.dismissLoginModal()
      await store.markAsRead('rem-a1')
      await store.snoozeReminder('rem-a1', 20)

      expect(store.isLoginModalDismissed).toBe(true)
      expect(sessionStorage.getItem('gms_login_reminder_dismissed_user-a')).toBe('true')

      // Logout User A via clearAuth
      authStore.clearAuth()
      expect(store.isLoginModalDismissed).toBe(false)
      expect(sessionStorage.getItem('gms_login_reminder_dismissed_user-a')).toBeNull()

      // User A logs back in
      authStore.user = { id: 'user-a' }
      // Modal is eligible to show again
      expect(store.isLoginModalDismissed).toBe(false)

      // But read IDs and snoozes in localStorage are preserved and rehydrated
      expect(store.readReminderIds.has('rem-a1')).toBe(true)
      expect(store.isSnoozed('rem-a1')).toBe(true)
    })
  })

  describe('COR09-03: In-Flight Request Cancellation on Session Switch & Rapid A -> Logout -> A', () => {
    it('discards late in-flight response when session switched to User B', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      const deferredA = createDeferred()
      api.get.mockReturnValueOnce(deferredA.promise)

      const fetchPromise = store.fetchReminders()
      expect(store.isLoading).toBe(true)

      // Identity changes to User B while User A request is in-flight
      authStore.user = { id: 'user-b' }

      // Resolve User A's slow request
      deferredA.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 5, inProgress: 0, waitingOther: 0, overdue: 0, total: 5 },
            reminders: [{ id: 'rem-a-stale', category: 'NEED_ACTION' }]
          }
        }
      })
      await fetchPromise

      // User A's payload must be discarded; store for User B remains clean
      expect(store.reminders.length).toBe(0)
      expect(store.summary.total).toBe(0)
      expect(localStorage.getItem('gms_read_reminder_ids_user-b')).toBeNull()
    })

    it('discards late in-flight response (success & failure) on rapid A -> logout -> A cycle', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      const deferredSuccess = createDeferred()
      api.get.mockReturnValueOnce(deferredSuccess.promise)

      const oldFetchPromise = store.fetchReminders()

      // Rapid A -> logout -> A
      authStore.clearAuth()
      authStore.user = { id: 'user-a' }

      // Old request resolves with stale data
      deferredSuccess.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 3, inProgress: 0, waitingOther: 0, overdue: 0, total: 3 },
            reminders: [{ id: 'stale-trx', category: 'NEED_ACTION' }]
          }
        }
      })
      await oldFetchPromise

      // Stale data must not contaminate new session of User A
      expect(store.reminders.length).toBe(0)
      expect(store.summary.total).toBe(0)

      // Test stale error response as well
      const deferredError = createDeferred()
      api.get.mockReturnValueOnce(deferredError.promise)
      const errorFetchPromise = store.fetchReminders()

      authStore.clearAuth()
      authStore.user = { id: 'user-a' }

      deferredError.reject(new Error('Network error from prior session'))
      await errorFetchPromise.catch(() => {})

      expect(store.error).toBeNull()
    })
  })

  describe('COR09-04: Concurrent Request Ordering & Loading State Guards', () => {
    it('Order 1: Request 2 completes first -> Request 1 completes later -> latest data not overwritten', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      const deferred1 = createDeferred()
      const deferred2 = createDeferred()

      api.get.mockReturnValueOnce(deferred1.promise)
      const p1 = store.fetchReminders()

      api.get.mockReturnValueOnce(deferred2.promise)
      const p2 = store.fetchReminders()

      // Request 2 completes first with fresh data
      deferred2.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 1, inProgress: 0, waitingOther: 0, overdue: 0, total: 1 },
            reminders: [{ id: 'rem-fresh', category: 'NEED_ACTION' }]
          }
        }
      })
      await p2

      expect(store.reminders.map(r => r.id)).toEqual(['rem-fresh'])
      expect(store.summary.total).toBe(1)

      // Request 1 completes later with stale data
      deferred1.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 9, inProgress: 0, waitingOther: 0, overdue: 0, total: 9 },
            reminders: [{ id: 'rem-stale', category: 'NEED_ACTION' }]
          }
        }
      })
      await p1

      // Stale data must NOT overwrite fresh data
      expect(store.reminders.map(r => r.id)).toEqual(['rem-fresh'])
      expect(store.summary.total).toBe(1)
    })

    it('Order 1 (Failure variation): Stale error does not overwrite fresh data or set error', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      const deferred1 = createDeferred()
      const deferred2 = createDeferred()

      api.get.mockReturnValueOnce(deferred1.promise)
      const p1 = store.fetchReminders()

      api.get.mockReturnValueOnce(deferred2.promise)
      const p2 = store.fetchReminders()

      // Request 2 resolves successfully
      deferred2.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 1, inProgress: 0, waitingOther: 0, overdue: 0, total: 1 },
            reminders: [{ id: 'rem-fresh', category: 'NEED_ACTION' }]
          }
        }
      })
      await p2
      expect(store.error).toBeNull()

      // Request 1 rejects with error later
      deferred1.reject(new Error('Stale network failure'))
      await p1.catch(() => {})

      // Error must NOT be written to store
      expect(store.error).toBeNull()
      expect(store.reminders.length).toBe(1)
    })

    it('Order 2: Request 1 completes while Request 2 is pending -> isLoading remains true', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      const deferred1 = createDeferred()
      const deferred2 = createDeferred()

      api.get.mockReturnValueOnce(deferred1.promise)
      const p1 = store.fetchReminders()

      api.get.mockReturnValueOnce(deferred2.promise)
      const p2 = store.fetchReminders()

      expect(store.isLoading).toBe(true)

      // Request 1 completes while Request 2 is still pending
      deferred1.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 1, inProgress: 0, waitingOther: 0, overdue: 0, total: 1 },
            reminders: [{ id: 'rem-stale', category: 'NEED_ACTION' }]
          }
        }
      })
      await p1

      // isLoading MUST remain true because Request 2 is still active and pending!
      expect(store.isLoading).toBe(true)

      // Now Request 2 completes
      deferred2.resolve({
        data: {
          success: true,
          data: {
            summary: { needAction: 2, inProgress: 0, waitingOther: 0, overdue: 0, total: 2 },
            reminders: [{ id: 'rem-active', category: 'NEED_ACTION' }]
          }
        }
      })
      await p2

      // isLoading now becomes false
      expect(store.isLoading).toBe(false)
      expect(store.reminders.map(r => r.id)).toEqual(['rem-active'])
    })
  })

  describe('COR09-05: Real clearAuth Integration', () => {
    it('completely clears in-memory reminder state when authStore.clearAuth is invoked', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-a' }

      const store = useReminderStore()
      api.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            summary: { needAction: 2, inProgress: 0, waitingOther: 0, overdue: 0, total: 2 },
            reminders: [{ id: 'rem-1', category: 'NEED_ACTION' }]
          }
        }
      })
      await store.fetchReminders()
      store.dismissLoginModal()

      expect(store.reminders.length).toBe(1)
      expect(store.summary.total).toBe(2)
      expect(store.isLoginModalDismissed).toBe(true)

      // Invoke clearAuth directly
      authStore.clearAuth()

      // Verify store was reset
      expect(store.reminders.length).toBe(0)
      expect(store.summary.total).toBe(0)
      expect(store.isLoginModalDismissed).toBe(false)
      expect(store.error).toBeNull()
      expect(store.isLoading).toBe(false)
    })
  })

  describe('COR09-06: Strict No-Op When Unauthenticated & Rehydration', () => {
    it('performs strict no-op without mutations, requests, or shared keys when unauthenticated', async () => {
      const authStore = useAuthStore()
      authStore.user = null // Unauthenticated

      const store = useReminderStore()

      // fetchReminders should not call api.get
      await store.fetchReminders()
      expect(api.get).not.toHaveBeenCalled()
      expect(store.isLoading).toBe(false)

      // snoozeReminder should not call api.post or mutate state/storage
      await store.snoozeReminder('rem-x', 30)
      expect(api.post).not.toHaveBeenCalled()
      expect(store.isSnoozed('rem-x')).toBe(false)

      // unsnoozeReminder should not call api.post
      await store.unsnoozeReminder('rem-x')
      expect(api.post).not.toHaveBeenCalled()

      // markAsRead should not call api.post or mutate state/storage
      await store.markAsRead('rem-x')
      expect(api.post).not.toHaveBeenCalled()
      expect(store.readReminderIds.has('rem-x')).toBe(false)

      // markAllAsRead should not call api.post
      await store.markAllAsRead()
      expect(api.post).not.toHaveBeenCalled()

      // dismissLoginModal should not mutate state or write sessionStorage
      store.dismissLoginModal()
      expect(store.isLoginModalDismissed).toBe(false)

      // Ensure NO key containing 'shared' exists in storage
      const localKeys = Object.keys(localStorage)
      const sessionKeys = Object.keys(sessionStorage)
      expect(localKeys.some(k => k.includes('shared'))).toBe(false)
      expect(sessionKeys.some(k => k.includes('shared'))).toBe(false)
    })

    it('rehydrates user preferences when user logs in and does not reset on same-ID profile update', async () => {
      // Seed storage for user-x
      localStorage.setItem('gms_read_reminder_ids_user-x', JSON.stringify(['rem-saved-1']))
      localStorage.setItem(
        'gms_snoozed_reminders_user-x',
        JSON.stringify({ 'rem-saved-1': Date.now() + 60000 })
      )

      const authStore = useAuthStore()
      const store = useReminderStore()

      // Store starts unauthenticated
      expect(store.readReminderIds.size).toBe(0)

      // User logs in
      authStore.user = { id: 'user-x', name: 'User X' }

      // Preferences must rehydrate
      expect(store.readReminderIds.has('rem-saved-1')).toBe(true)
      expect(store.isSnoozed('rem-saved-1')).toBe(true)

      // Profile update with same ID does not wipe preferences
      authStore.user = { id: 'user-x', name: 'User X Updated' }
      expect(store.readReminderIds.has('rem-saved-1')).toBe(true)
      expect(store.isSnoozed('rem-saved-1')).toBe(true)
    })
  })
})
