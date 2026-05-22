import { defineStore } from 'pinia'
import api from '../services/api'

// Role mapping function to standardize backend roles
const mapBackendRole = (role) => {
  if (!role) return 'USER'
  const r = role.toUpperCase()
  if (r === 'ADMIN') return 'ADMIN'
  if (r === 'SECURITY') return 'GATE_SECURITY'
  if (r === 'QC') return 'QC_INSPECTOR'
  if (r === 'WAREHOUSE') return 'WAREHOUSE_STAFF'
  if (r === 'WEIGHBRIDGE') return 'WEIGHBRIDGE_OPERATOR'
  return r
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('gms_user')) || null,
    token: localStorage.getItem('gms_token') || null
  }),
  getters: {
    isAuthenticated: (state) => !!state.user && !!state.token
  },
  actions: {
    async login(username, password) {
      try {
        // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
        const response = await api.post('/auth/login', { username, password })
        const { accessToken, user } = response.data
        
        if (user && user.role) {
          user.role = mapBackendRole(user.role)
        }
        
        this.token = accessToken
        this.user = user
        localStorage.setItem('gms_token', accessToken)
        localStorage.setItem('gms_user', JSON.stringify(user))
        
        return { success: true }
      } catch (error) {
        console.warn('API login failed, attempting mock fallback', error)
        
        const mockUsers = [
          { userId: 1, name: 'Admin', username: 'admin', email: 'admin@gms.local', role: 'ADMIN', password: 'admin123', token: 'mock_jwt_admin' },
          { userId: 2, name: 'Frengky Wahudi', username: 'qc', email: 'qc@gms.local', role: 'QC_INSPECTOR', password: 'qc123', token: 'mock_jwt_qc' },
          { userId: 3, name: 'Arga Vebrianto', username: 'warehouse', email: 'warehouse@gms.local', role: 'WAREHOUSE_STAFF', password: 'warehouse123', token: 'mock_jwt_wh' },
          { userId: 4, name: 'Enggar', username: 'security', email: 'security@gms.local', role: 'GATE_SECURITY', password: 'security123', token: 'mock_jwt_gate' },
          { userId: 5, name: 'Weighbridge Operator', username: 'weighbridge', email: 'weighbridge@gms.local', role: 'WEIGHBRIDGE_OPERATOR', password: 'weighbridge123', token: 'mock_jwt_wb' }
        ]

        const foundUser = mockUsers.find(u => 
          (u.username === username || u.email === username) && u.password === password
        )

        if (foundUser) {
          const { password: _p, token, ...userData } = foundUser
          this.token = token
          this.user = userData
          localStorage.setItem('gms_token', token)
          localStorage.setItem('gms_user', JSON.stringify(userData))
          return { success: true }
        }

        return { success: false, message: 'Invalid username/email or password' }
      }
    },
    async initAuth() {
      if (!this.token) return
      try {
        // TODO(Backend Integration): ASSUMED ENDPOINT - Replace with actual NestJS route when available
        const response = await api.get('/auth/me')
        const user = response.data
        if (user && user.role) {
          user.role = mapBackendRole(user.role)
        }
        this.user = user
        localStorage.setItem('gms_user', JSON.stringify(user))
      } catch (error) {
        console.warn('Failed to fetch user data, keeping existing session if valid', error)
      }
    },
    logout() {
      this.user = null
      this.token = null
      localStorage.removeItem('gms_user')
      localStorage.removeItem('gms_token')
    }
  }
})
