import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notification', () => {
    const notifications = ref([])
    const unreadCount = ref(0)

    const addNotification = (title, message, type = 'info') => {
        notifications.value.unshift({
            id: Date.now(),
            title,
            message,
            type,
            timestamp: new Date().toISOString(),
            read: false
        })
        unreadCount.value++
    }

    const markAsRead = () => {
        notifications.value.forEach(n => n.read = true)
        unreadCount.value = 0
    }

    const clearNotifications = () => {
        notifications.value = []
        unreadCount.value = 0
    }

    return {
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        clearNotifications
    }
})
