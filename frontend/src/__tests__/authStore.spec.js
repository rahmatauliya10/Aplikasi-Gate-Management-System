import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../stores/authStore'

describe('authStore setToken', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should set token in state using setToken action', () => {
    const authStore = useAuthStore()
    expect(authStore.token).toBeNull()

    const newToken = 'mock-jwt-refreshed-token-12345'
    authStore.setToken(newToken)

    expect(authStore.token).toBe(newToken)
  })
})
