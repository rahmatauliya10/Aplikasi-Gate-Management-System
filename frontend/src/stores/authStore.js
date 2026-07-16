import { defineStore } from 'pinia'
import authService from '../services/authService'
import { getErrorMessage } from '../utils/errorMessage'

export const useAuthStore = defineStore('auth', {
  state: () => {
    let user = null
    const token = localStorage.getItem('access_token') || null
    const userStr = localStorage.getItem('user')
    
    if (userStr && token) {
      try {
        user = JSON.parse(userStr)
      } catch (e) {
        console.error('Invalid user JSON in state initialization', e)
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
        sessionStorage.clear()
      }
    } else {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      sessionStorage.clear()
    }
    
    return {
      user,
      token,
      mustChangePassword: false,
      loading: false,
      error: null
    }
  },
  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    userRole: (state) => state.user?.role || null,
    warehouseAccess: (state) => state.user?.warehouseAccess || [],
    isAdmin: (state) => state.user?.role === 'ADMIN',
    isSecurity: (state) => state.user?.role === 'SECURITY',
    isWarehouse: (state) => state.user?.role === 'WAREHOUSE',
    isQC: (state) => state.user?.role === 'QC'
  },
  actions: {
    async login(credentials) {
      this.loading = true
      this.error = null
      try {
        const response = await authService.login(credentials)
        const responseData = response.data
        let authData = null
        
        if (responseData && responseData.success && responseData.data) {
          authData = responseData.data
        } else {
          authData = responseData
        }

        const { accessToken, refreshToken, user, mustChangePassword } = authData || {}
        if (!accessToken || !user) {
          throw new Error('Invalid response data from server')
        }

        this.token = accessToken
        this.user = user
        this.mustChangePassword = !!mustChangePassword

        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('user', JSON.stringify(user))
        if (mustChangePassword) {
          localStorage.setItem('mustChangePassword', '1')
        } else {
          localStorage.removeItem('mustChangePassword')
        }

        this.loading = false
        return { success: true, user, mustChangePassword }
      } catch (err) {
        this.clearAuth()
        const message = err.gmsMessage || getErrorMessage(err);
        this.error = message
        this.loading = false
        return { success: false, message }
      }
    },
    
    async logout() {
      try {
        if (this.token) {
          await authService.logout()
        }
      } catch (err) {
        console.error('API logout failed, clearing local tokens anyway:', err)
      } finally {
        this.clearAuth()
      }
    },

    async fetchMe() {
      this.loading = true
      this.error = null
      try {
        const response = await authService.me()
        const responseData = response.data
        let userData = null
        
        if (responseData && responseData.success && responseData.data) {
          userData = responseData.data.user || responseData.data
        } else {
          userData = responseData.user || responseData
        }

        if (!userData) {
          throw new Error('Invalid user info from server')
        }

        this.user = userData
        localStorage.setItem('user', JSON.stringify(userData))
        this.loading = false
        return { success: true, user: userData }
      } catch (err) {
        const message = err.gmsMessage || getErrorMessage(err);
        this.error = message
        this.loading = false
        return { success: false, message }
      }
    },

    async refreshAccessToken() {
      this.loading = true
      this.error = null
      try {
        const response = await authService.refreshToken()
        const responseData = response.data
        let authData = null
        
        if (responseData && responseData.success && responseData.data) {
          authData = responseData.data
        } else {
          authData = responseData
        }

        const { accessToken, refreshToken } = authData || {}
        if (!accessToken) {
          throw new Error('No access token returned from refresh request')
        }

        this.token = accessToken
        localStorage.setItem('access_token', accessToken)
        
        this.loading = false
        return { success: true, accessToken }
      } catch (err) {
        const message = err.gmsMessage || getErrorMessage(err);
        this.error = message
        this.loading = false
        this.clearAuth()
        return { success: false, message }
      }
    },

    initializeAuth() {
      const token = localStorage.getItem('access_token') || null
      const userStr = localStorage.getItem('user')

      this.token = token
      this.mustChangePassword = localStorage.getItem('mustChangePassword') === '1'

      if (userStr && token) {
        try {
          this.user = JSON.parse(userStr)
        } catch (e) {
          console.error('Invalid JSON for user in localStorage, clearing auth.', e)
          this.clearAuth()
        }
      } else {
        this.clearAuth()
      }
    },

    clearAuth() {
      this.user = null
      this.token = null
      this.mustChangePassword = false
      this.error = null
      this.loading = false

      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      localStorage.removeItem('mustChangePassword')
      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('user')
      
      // Also clear axios authorization header just in case
      import('../services/api').then(({ default: api }) => {
        delete api.defaults.headers.common['Authorization']
      })
    },
    
    updateProfile(data) {
      if (this.user) {
        this.user = { ...this.user, ...data }
        localStorage.setItem('user', JSON.stringify(this.user))
      }
    }
  }
})
