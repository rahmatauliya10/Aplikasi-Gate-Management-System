import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'
import { useAuthStore } from './authStore'

export const useReminderStore = defineStore('reminder', () => {
  const authStore = useAuthStore()

  const reminders = ref([])
  const summary = ref({
    needAction: 0,
    inProgress: 0,
    waitingOther: 0,
    overdue: 0,
    total: 0
  })
  const isLoading = ref(false)
  const error = ref(null)

  // Per-user isolated storage helpers
  const getStorageKey = (prefix) => {
    const userId = authStore.user?.id || authStore.user?.username || 'shared'
    return `${prefix}_${userId}`
  }

  // Read reminder state
  const readReminderIds = ref(new Set())
  const loadLocalReadIds = () => {
    try {
      const saved = localStorage.getItem(getStorageKey('gms_read_reminder_ids'))
      if (saved) {
        readReminderIds.value = new Set(JSON.parse(saved))
      } else {
        readReminderIds.value = new Set()
      }
    } catch (e) {
      readReminderIds.value = new Set()
    }
  }

  // Snoozed reminder state: map of { [id]: timestamp }
  const snoozedReminderMap = ref({})
  const loadLocalSnoozeMap = () => {
    try {
      const saved = localStorage.getItem(getStorageKey('gms_snoozed_reminders'))
      if (saved) {
        snoozedReminderMap.value = JSON.parse(saved)
      } else {
        snoozedReminderMap.value = {}
      }
    } catch (e) {
      snoozedReminderMap.value = {}
    }
  }

  loadLocalReadIds()
  loadLocalSnoozeMap()

  // Session-scoped login reminder dismissal state
  const isLoginModalDismissed = ref(
    sessionStorage.getItem('gms_login_reminder_dismissed') === 'true'
  )

  const isSnoozed = (id) => {
    const expireAt = snoozedReminderMap.value[id]
    return typeof expireAt === 'number' && expireAt > Date.now()
  }

  const persistSnooze = () => {
    try {
      localStorage.setItem(getStorageKey('gms_snoozed_reminders'), JSON.stringify(snoozedReminderMap.value))
    } catch (e) {
      console.warn('[ReminderStore] Failed to persist snoozed reminders', e)
    }
  }

  const persistReadIds = () => {
    try {
      localStorage.setItem(
        getStorageKey('gms_read_reminder_ids'),
        JSON.stringify(Array.from(readReminderIds.value))
      )
    } catch (e) {
      console.warn('[ReminderStore] Failed to persist read IDs to localStorage', e)
    }
  }

  const snoozeReminder = async (id, durationMinutes = 30) => {
    const expireAt = Date.now() + durationMinutes * 60 * 1000
    snoozedReminderMap.value = {
      ...snoozedReminderMap.value,
      [id]: expireAt
    }
    persistSnooze()

    try {
      await api.post(`/transactions/pending-reminders/${id}/snooze`, { minutes: durationMinutes })
    } catch (err) {
      console.warn('[ReminderStore] Backend snooze sync failed, local snooze active:', err?.message)
    }
  }

  const unsnoozeReminder = async (id) => {
    const copy = { ...snoozedReminderMap.value }
    delete copy[id]
    snoozedReminderMap.value = copy
    persistSnooze()

    try {
      await api.post(`/transactions/pending-reminders/${id}/unsnooze`)
    } catch (err) {
      console.warn('[ReminderStore] Backend unsnooze sync failed:', err?.message)
    }
  }

  // Need action count respects active snoozed state for bell notification badge
  const needActionCount = computed(() => {
    if (reminders.value.length === 0) return summary.value.needAction || 0
    return reminders.value.filter(
      r => (r.category === 'NEED_ACTION' || r.category === 'OVERDUE' || r.isMyAction) && !isSnoozed(r.id)
    ).length
  })

  // Overdue count only counts items with verified official SLA breach that are unsnoozed
  const overdueCount = computed(() => {
    if (reminders.value.length === 0) return summary.value.overdue || 0
    return reminders.value.filter(
      r => (r.isOverdue || r.category === 'OVERDUE') && !isSnoozed(r.id)
    ).length
  })

  const unreadNeedActionCount = computed(() => {
    return reminders.value.filter(
      r => (r.category === 'NEED_ACTION' || r.isMyAction) &&
           !readReminderIds.value.has(r.id) &&
           !isSnoozed(r.id)
    ).length
  })

  const fetchReminders = async () => {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.get('/transactions/pending-reminders')
      if (res.data?.data) {
        const rawReminders = res.data.data.reminders || []

        // Hydrate backend per-user snooze and read states
        rawReminders.forEach(r => {
          if (r.isSnoozed && typeof r.snoozeExpireAt === 'number') {
            snoozedReminderMap.value[r.id] = r.snoozeExpireAt
          }
          if (r.isRead) {
            readReminderIds.value.add(r.id)
          }
        })
        persistSnooze()
        persistReadIds()

        reminders.value = rawReminders.map(r => ({
          ...r,
          licensePlate: r.licensePlate || r.plateNumber || '-',
          plateNumber: r.plateNumber || r.licensePlate || '-',
          durationMinutes: r.durationMinutes ?? r.waitingDurationMin ?? 0,
          waitingDurationMin: r.waitingDurationMin ?? r.durationMinutes ?? 0,
          slaMinutes: r.slaMinutes ?? null,
          responsibleRole: r.responsibleRole || r.assignedRole || 'ADMIN',
          assignedRole: r.assignedRole || r.responsibleRole || 'ADMIN',
          routePath: r.routePath || r.targetRoute || null,
          targetRoute: r.targetRoute || r.routePath || null,
          isOverdue: Boolean(r.isOverdue || r.category === 'OVERDUE'),
        }))
        const rawSummary = res.data.data.summary || {}
        summary.value = {
          needAction: rawSummary.needActionCount ?? rawSummary.needAction ?? 0,
          inProgress: rawSummary.inProgressCount ?? rawSummary.inProgress ?? 0,
          waitingOther: rawSummary.waitingOtherCount ?? rawSummary.waitingOther ?? 0,
          overdue: rawSummary.overdueCount ?? rawSummary.overdue ?? 0,
          total: rawSummary.totalActiveCount ?? rawSummary.total ?? 0,
        }
      }
    } catch (err) {
      console.warn('[ReminderStore] Failed to fetch pending reminders:', err?.message)
      error.value = err?.message
    } finally {
      isLoading.value = false
    }
  }

  const markAsRead = async (id) => {
    readReminderIds.value.add(id)
    persistReadIds()
    try {
      await api.post(`/transactions/pending-reminders/${id}/read`)
    } catch (err) {
      console.warn('[ReminderStore] Backend mark read sync failed:', err?.message)
    }
  }

  const markAllAsRead = async () => {
    const ids = reminders.value.map(r => r.id)
    ids.forEach(id => readReminderIds.value.add(id))
    persistReadIds()
    try {
      await api.post('/transactions/pending-reminders/read-all', { ids })
    } catch (err) {
      console.warn('[ReminderStore] Backend mark all read sync failed:', err?.message)
    }
  }

  const dismissLoginModal = () => {
    isLoginModalDismissed.value = true
    try {
      sessionStorage.setItem('gms_login_reminder_dismissed', 'true')
    } catch (e) {}
  }

  return {
    reminders,
    summary,
    isLoading,
    error,
    readReminderIds,
    snoozedReminderMap,
    isLoginModalDismissed,
    needActionCount,
    overdueCount,
    unreadNeedActionCount,
    isSnoozed,
    snoozeReminder,
    unsnoozeReminder,
    fetchReminders,
    markAsRead,
    markAllAsRead,
    dismissLoginModal
  }
})
