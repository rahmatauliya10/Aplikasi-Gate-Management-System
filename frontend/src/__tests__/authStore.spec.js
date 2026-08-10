import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../stores/authStore'

describe('authStore setToken', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should handle sequential setToken and token updates without losing state', () => {
    const authStore = useAuthStore()
    authStore.setToken('token-1')
    expect(authStore.token).toBe('token-1')

    authStore.setToken('token-2')
    expect(authStore.token).toBe('token-2')
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
