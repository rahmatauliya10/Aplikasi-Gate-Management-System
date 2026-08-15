import { defineStore } from 'pinia'
import authService from '../services/authService'
import { getErrorMessage } from '../utils/errorMessage'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: null,
    mustChangePassword: false,
    loading: false,
    error: null,
    isInitialized: false
  }),
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

        const { accessToken, user, mustChangePassword } = authData || {}
        if (!accessToken || !user) {
          throw new Error('Invalid response data from server')
        }

        this.token = accessToken
        this.user = user
        this.mustChangePassword = !!mustChangePassword
        this.isInitialized = true

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

        const { accessToken } = authData || {}
        if (!accessToken) {
          throw new Error('No access token returned from refresh request')
        }

        this.token = accessToken
        
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

    async initializeAuth() {
      if (this.isInitialized) return;
      this.isInitialized = true;
      this.mustChangePassword = localStorage.getItem('mustChangePassword') === '1';

      if (!this.token) {
        try {
          const refreshRes = await this.refreshAccessToken();
          if (refreshRes.success) {
            await this.fetchMe();
          }
        } catch (e) {
          this.clearAuth();
        }
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
      
      import('../services/api').then(({ default: api }) => {
        delete api.defaults.headers.common['Authorization']
      })
    },
    
    setToken(token) {
      this.token = token
    },

    updateProfile(data) {
      if (this.user) {
        this.user = { ...this.user, ...data }
      }
    }
  }
})
