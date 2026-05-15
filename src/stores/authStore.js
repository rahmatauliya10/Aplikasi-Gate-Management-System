import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('gms_user')) || null
  }),
  getters: {
    isAuthenticated: (state) => !!state.user
  },
  actions: {
    login(username, password) {
      if (username === 'admin' && password === 'admin123') {
        const userData = {
          name: 'System Admin',
          role: 'ADMIN',
          username: 'admin'
        }
        this.user = userData
        localStorage.setItem('gms_user', JSON.stringify(userData))
        return { success: true }
      }
      return { success: false, message: 'Invalid username or password' }
    },
    logout() {
      this.user = null
      localStorage.removeItem('gms_user')
    }
  }
})
