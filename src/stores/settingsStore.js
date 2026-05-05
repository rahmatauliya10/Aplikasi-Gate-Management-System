import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    targetDeviation: 5.0,
    targetTat: 120
  }),
  actions: {
    updateSettings(deviation, tat) {
      this.targetDeviation = deviation
      this.targetTat = tat
    }
  }
})
