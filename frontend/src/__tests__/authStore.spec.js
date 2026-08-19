import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../stores/authStore'
import authService from '../services/authService'

describe('authStore Enterprise In-Memory Security', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('should handle sequential setToken and token updates in memory', () => {
    const authStore = useAuthStore()
    authStore.setToken('token-1')
    expect(authStore.token).toBe('token-1')
    expect(localStorage.getItem('access_token')).toBeNull()

    authStore.setToken('token-2')
    expect(authStore.token).toBe('token-2')
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('should NEVER write access_token or user to localStorage/sessionStorage on login', async () => {
    const authStore = useAuthStore()
    vi.spyOn(authService, 'login').mockResolvedValue({
      data: {
        success: true,
        data: {
          accessToken: 'jwt-access-token-123',
          user: { id: 'usr-1', name: 'Admin', role: 'ADMIN' },
          mustChangePassword: false
        }
      }
    })

    const res = await authStore.login({ identifier: 'admin@gms.local', password: 'Password123!' })
    expect(res.success).toBe(true)
    expect(authStore.token).toBe('jwt-access-token-123')
    expect(authStore.user.id).toBe('usr-1')
    expect(authStore.isAuthenticated).toBe(true)

    // Verify localStorage & sessionStorage are completely free of access_token and user
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(sessionStorage.getItem('access_token')).toBeNull()
    expect(sessionStorage.getItem('user')).toBeNull()
  })

  it('should restore session in initializeAuth via HttpOnly refreshAccessToken -> fetchMe', async () => {
    const authStore = useAuthStore()
    vi.spyOn(authService, 'refreshToken').mockResolvedValue({
      data: {
        success: true,
        data: { accessToken: 'silent-refreshed-token' }
      }
    })
    vi.spyOn(authService, 'me').mockResolvedValue({
      data: {
        success: true,
        data: { user: { id: 'usr-42', name: 'Security User', role: 'SECURITY' } }
      }
    })

    await authStore.initializeAuth()

    expect(authStore.token).toBe('silent-refreshed-token')
    expect(authStore.user.id).toBe('usr-42')
    expect(authStore.isAuthenticated).toBe(true)
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('should return to anonymous state if refreshAccessToken fails during initializeAuth', async () => {
    const authStore = useAuthStore()
    vi.spyOn(authService, 'refreshToken').mockRejectedValue(new Error('Refresh cookie expired'))

    await authStore.initializeAuth()

    expect(authStore.token).toBeNull()
    expect(authStore.user).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
  })

  it('should clear all in-memory state on logout', async () => {
    const authStore = useAuthStore()
    authStore.token = 'existing-token'
    authStore.user = { id: 'usr-1' }
    vi.spyOn(authService, 'logout').mockResolvedValue({ data: { success: true } })

    await authStore.logout()

    expect(authStore.token).toBeNull()
    expect(authStore.user).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
  })

  it('should correctly process queued requests after setToken refresh', async () => {
    const authStore = useAuthStore()
    const failedQueue = []
    
    const processQueue = (error, token = null) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error)
        } else {
          prom.resolve(token)
        }
      })
      failedQueue.length = 0
    }

    const req1 = new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
    const req2 = new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
    const req3 = new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))

    authStore.setToken('refreshed-jwt-token')
    processQueue(null, authStore.token)

    const [t1, t2, t3] = await Promise.all([req1, req2, req3])
    expect(t1).toBe('refreshed-jwt-token')
    expect(t2).toBe('refreshed-jwt-token')
    expect(t3).toBe('refreshed-jwt-token')
    expect(authStore.token).toBe('refreshed-jwt-token')
  })
})
