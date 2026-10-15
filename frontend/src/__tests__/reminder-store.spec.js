import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReminderStore } from '../stores/reminderStore'
import { formatArrivalSequence } from '../utils/arrivalSequence'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}))

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

  it('fetches reminders and updates summary counts', async () => {
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

  it('marks items as read and tracks unread count', async () => {
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

    // Check localStorage persistence
    const key = Object.keys(localStorage).find(k => k.startsWith('gms_read_reminder_ids'))
    const saved = JSON.parse(localStorage.getItem(key))
    expect(saved).toContain('rem-1')
  })

  it('dismisses login reminder modal in session', () => {
    const store = useReminderStore()
    expect(store.isLoginModalDismissed).toBe(false)

    store.dismissLoginModal()
    expect(store.isLoginModalDismissed).toBe(true)
    expect(sessionStorage.getItem('gms_login_reminder_dismissed')).toBe('true')
  })

  it('persists snoozed reminders in localStorage without modifying transaction state', async () => {
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
    // Bell badge suppresses snoozed items
    expect(store.needActionCount).toBe(1)
    expect(store.overdueCount).toBe(0)

    // Verify localStorage persistence
    const key = Object.keys(localStorage).find(k => k.startsWith('gms_snoozed_reminders'))
    const savedSnooze = JSON.parse(localStorage.getItem(key))
    expect(savedSnooze['rem-1']).toBeGreaterThan(Date.now())

    // Unsnooze
    await store.unsnoozeReminder('rem-1')
    expect(store.isSnoozed('rem-1')).toBe(false)
    expect(store.needActionCount).toBe(2)
    expect(store.overdueCount).toBe(1)
  })
})
