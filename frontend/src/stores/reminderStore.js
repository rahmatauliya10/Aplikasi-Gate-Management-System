import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
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
  const readReminderIds = ref(new Set())
  const snoozedReminderMap = ref({})
  const isLoginModalDismissed = ref(false)

  let activeFetchEpoch = 0

  const getUserId = () => {
    return authStore.user?.id || authStore.user?.username || null
  }

  // Per-user isolated storage helpers (returns null if unauthenticated, NO 'shared' fallback)
  const getStorageKey = (prefix) => {
    const userId = getUserId()
    if (!userId) return null
    return `${prefix}_${userId}`
  }

  const getDismissalKey = (userId) => {
    const uid = userId || getUserId()
    if (!uid) return null
    return `gms_login_reminder_dismissed_${uid}`
  }

  const resetStore = () => {
    activeFetchEpoch++
    reminders.value = []
    summary.value = {
      needAction: 0,
      inProgress: 0,
      waitingOther: 0,
      overdue: 0,
      total: 0
    }
    isLoading.value = false
    error.value = null
    readReminderIds.value = new Set()
    snoozedReminderMap.value = {}
    isLoginModalDismissed.value = false
  }

  const rehydrateForUser = (userId) => {
    resetStore()
    if (!userId) return

    // Load read IDs for user
    try {
      const readKey = getStorageKey('gms_read_reminder_ids')
      const savedRead = readKey ? localStorage.getItem(readKey) : null
      if (savedRead) {
        readReminderIds.value = new Set(JSON.parse(savedRead))
      }
    } catch (e) {
      readReminderIds.value = new Set()
    }

    // Load snooze map for user
    try {
      const snoozeKey = getStorageKey('gms_snoozed_reminders')
      const savedSnooze = snoozeKey ? localStorage.getItem(snoozeKey) : null
      if (savedSnooze) {
        snoozedReminderMap.value = JSON.parse(savedSnooze)
      }
    } catch (e) {
      snoozedReminderMap.value = {}
    }

    // Load session dismissal for user
    try {
      const dismissKey = getDismissalKey(userId)
      if (dismissKey) {
        isLoginModalDismissed.value = sessionStorage.getItem(dismissKey) === 'true'
      }
    } catch (e) {
      isLoginModalDismissed.value = false
    }
  }

  // Synchronous watcher on authenticated user identity
  watch(
    () => authStore.user?.id || authStore.user?.username || null,
    (newUid, oldUid) => {
      if (newUid !== oldUid) {
        rehydrateForUser(newUid)
      }
    },
    { flush: 'sync' }
  )

  // Initial rehydration if user already authenticated upon store creation
  const initialUserId = getUserId()
  if (initialUserId) {
    rehydrateForUser(initialUserId)
  }

  const isSnoozed = (id) => {
    const expireAt = snoozedReminderMap.value[id]
    return typeof expireAt === 'number' && expireAt > Date.now()
  }

  const persistSnooze = () => {
    const key = getStorageKey('gms_snoozed_reminders')
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify(snoozedReminderMap.value))
    } catch (e) {
      console.warn('[ReminderStore] Failed to persist snoozed reminders', e)
    }
  }

  const persistReadIds = () => {
    const key = getStorageKey('gms_read_reminder_ids')
    if (!key) return
    try {
      localStorage.setItem(
        key,
        JSON.stringify(Array.from(readReminderIds.value))
      )
    } catch (e) {
      console.warn('[ReminderStore] Failed to persist read IDs to localStorage', e)
    }
  }

  const snoozeReminder = async (id, durationMinutes = 30) => {
    if (!getUserId()) return

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
    if (!getUserId()) return

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
    const targetUserId = getUserId()
    if (!targetUserId) return

    const currentEpoch = ++activeFetchEpoch
    isLoading.value = true
    error.value = null

    const isRequestActive = () => {
      const currentUserId = getUserId()
      return currentEpoch === activeFetchEpoch && currentUserId === targetUserId
    }

    try {
      const res = await api.get('/transactions/pending-reminders')
      if (!isRequestActive()) {
        return
      }

      if (res.data?.data) {
        const rawReminders = res.data.data.reminders || []

        // Hydrate backend per-user snooze and read states (bidirectional sync across devices)
        rawReminders.forEach(r => {
          if (r.isSnoozed && typeof r.snoozeExpireAt === 'number') {
            snoozedReminderMap.value[r.id] = r.snoozeExpireAt
          } else {
            delete snoozedReminderMap.value[r.id]
          }
          if (r.isRead) {
            readReminderIds.value.add(r.id)
          } else {
            readReminderIds.value.delete(r.id)
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
      if (!isRequestActive()) {
        return
      }
      console.warn('[ReminderStore] Failed to fetch pending reminders:', err?.message)
      error.value = err?.message
    } finally {
      if (isRequestActive()) {
        isLoading.value = false
      }
    }
  }

  const markAsRead = async (id) => {
    if (!getUserId()) return

    readReminderIds.value.add(id)
    persistReadIds()
    try {
      await api.post(`/transactions/pending-reminders/${id}/read`)
    } catch (err) {
      console.warn('[ReminderStore] Backend mark read sync failed:', err?.message)
    }
  }

  const markAllAsRead = async () => {
    if (!getUserId()) return

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
    const uid = getUserId()
    if (!uid) return

    isLoginModalDismissed.value = true
    try {
      const key = getDismissalKey(uid)
      if (key) {
        sessionStorage.setItem(key, 'true')
      }
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
    dismissLoginModal,
    resetStore,
    rehydrateForUser
  }
})
