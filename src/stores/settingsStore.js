import { defineStore } from 'pinia'
import api from '../services/api'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    targetDeviation: 5.0,
    targetTat: 120
  }),
  actions: {
    async loadSettings() {
      try {
        // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
        const response = await api.get('/settings')
        if (response.data.targetDeviation !== undefined) this.targetDeviation = response.data.targetDeviation
        if (response.data.targetTat !== undefined) this.targetTat = response.data.targetTat
      } catch (err) {
        console.warn('API loadSettings failed, falling back to localStorage', err)
        const saved = localStorage.getItem('gms_settings_config')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (parsed.targetDeviation !== undefined) this.targetDeviation = parsed.targetDeviation
            if (parsed.targetTat !== undefined) this.targetTat = parsed.targetTat
          } catch (e) {
            console.error("Failed to load settings from localStorage", e)
          }
        }
      }
    },
    updateSettings(deviation, tat) {
      if (deviation !== undefined) this.targetDeviation = deviation
      if (tat !== undefined) this.targetTat = tat
    },
    async saveSettings() {
      const config = {
        targetDeviation: this.targetDeviation,
        targetTat: this.targetTat
      }
      try {
        // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
        await api.patch('/settings', config)
        // Ensure local storage is also updated as backup
        localStorage.setItem('gms_settings_config', JSON.stringify(config))
      } catch (err) {
        console.warn('API saveSettings failed, using mock fallback to localStorage', err)
        localStorage.setItem('gms_settings_config', JSON.stringify(config))
      }
    }
  }
})
