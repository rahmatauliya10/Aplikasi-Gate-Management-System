import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const saved = localStorage.getItem('gms_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return {
          targetDeviation: parsed.targetDeviation ?? 5.0,
          targetTat: parsed.targetTat ?? 120,
          weightTolerances: parsed.weightTolerances ?? [
            { id: 1, parameterName: 'Gross Weight vs DO', toleranceValue: 5, unit: '%', triggerAlert: true, requireAdminApproval: true, status: true },
            { id: 2, parameterName: 'Tare Weight History', toleranceValue: 200, unit: 'Kg', triggerAlert: true, requireAdminApproval: false, status: true },
            { id: 3, parameterName: 'Net Weight Variance', toleranceValue: 2, unit: '%', triggerAlert: true, requireAdminApproval: true, status: true }
          ]
        }
      } catch (e) {
        console.error('[settingsStore] Failed to load saved settings:', e)
      }
    }

    return {
      targetDeviation: 5.0,
      targetTat: 120,
      weightTolerances: [
        { id: 1, parameterName: 'Gross Weight vs DO', toleranceValue: 5, unit: '%', triggerAlert: true, requireAdminApproval: true, status: true },
        { id: 2, parameterName: 'Tare Weight History', toleranceValue: 200, unit: 'Kg', triggerAlert: true, requireAdminApproval: false, status: true },
        { id: 3, parameterName: 'Net Weight Variance', toleranceValue: 2, unit: '%', triggerAlert: true, requireAdminApproval: true, status: true }
      ]
    }
  },
  actions: {
    saveToStorage() {
      localStorage.setItem('gms_settings', JSON.stringify({
        targetDeviation: this.targetDeviation,
        targetTat: this.targetTat,
        weightTolerances: this.weightTolerances
      }))
    },
    updateSettings(deviation, tat) {
      this.targetDeviation = deviation
      this.targetTat = tat
      this.saveToStorage()
    }
  }
})
