import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: {
      name: 'OFFICER BAMBANG',
      role: 'SECURITY'
    }
  }),
  actions: {
    login(userData) {
      this.user = userData
    },
    logout() {
      this.user = null
    }
  }
})
