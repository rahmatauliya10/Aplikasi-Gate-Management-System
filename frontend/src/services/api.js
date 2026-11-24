/**
 * ============================================
 * GMS - Axios Base Instance
 * ============================================
 * Central API client configuration.
 * All service modules import this instance.
 * 
 * - BaseURL from .env (VITE_API_BASE_URL)
 * - Auto-attach Bearer token from localStorage
 * - Global 401 handler (auto-logout on expired token)
 * ============================================
 */

import axios from 'axios'
import { getErrorMessage } from '../utils/errorMessage'

/**
 * Resolves the immutable trusted API origin from application configuration.
 * Must NOT be computed dynamically from request-level config overrides.
 * Rejects invalid, malformed, or protocol-relative configurations fail-closed.
 */
export function resolveConfiguredApiOrigin(rawBaseUrl = import.meta.env.VITE_API_BASE_URL) {
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'

  // Default to '/api' only when configuration is omitted (undefined or null)
  const effectiveConfig = rawBaseUrl === undefined || rawBaseUrl === null ? '/api' : rawBaseUrl

  if (typeof effectiveConfig !== 'string') {
    throw new Error('Konfigurasi VITE_API_BASE_URL tidak valid: harus berupa string.')
  }

  if (/[\0\r\n\t\\]/.test(effectiveConfig)) {
    throw new Error('Konfigurasi VITE_API_BASE_URL tidak valid: karakter kontrol atau backslash tidak diizinkan.')
  }

  const trimmed = effectiveConfig.trim()
  if (!trimmed) {
    throw new Error('Konfigurasi VITE_API_BASE_URL tidak valid: string kosong tidak diizinkan.')
  }

  // Handle valid relative paths
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      throw new Error('Konfigurasi VITE_API_BASE_URL tidak valid: bentuk protocol-relative (//) tidak diizinkan.')
    }
    return currentOrigin
  }

  // Handle absolute URLs
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch (e) {
    throw new Error(`Konfigurasi VITE_API_BASE_URL tidak valid: format URL malformed (${trimmed}).`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Konfigurasi VITE_API_BASE_URL tidak valid: skema protokol (${parsed.protocol}) harus http: atau https:.`)
  }

  if (!parsed.hostname) {
    throw new Error('Konfigurasi VITE_API_BASE_URL tidak valid: hostname tidak ditemukan.')
  }

  return parsed.origin
}

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const TRUSTED_API_ORIGIN = resolveConfiguredApiOrigin(RAW_API_BASE_URL)
const EFFECTIVE_API_BASE_URL = RAW_API_BASE_URL === undefined || RAW_API_BASE_URL === null
  ? '/api'
  : RAW_API_BASE_URL.trim()

const api = axios.create({
  baseURL: EFFECTIVE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true
})

/**
 * Validates request destination before dispatch.
 * Prevents credential leakage (Bearer token and cookies) to unapproved origins.
 * Resolves URI against the actual runtime page context (currentOrigin) and verifies
 * it against the immutable trusted API origin (expectedOrigin).
 */
export function assertSafeRequestDestination(config, expectedOrigin = TRUSTED_API_ORIGIN) {
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'

  const requestedUrl = typeof config?.url === 'string' ? config.url : ''
  const requestedBase = typeof config?.baseURL === 'string' ? config.baseURL : ''

  // 1. Reject control characters, newlines, tabs, and backslashes in URL or baseURL
  if (/[\0\r\n\t\\]/.test(requestedUrl) || /[\0\r\n\t\\]/.test(requestedBase)) {
    throw new Error('Permintaan ditolak: URL memuat karakter tidak valid atau ambigu.')
  }

  // 2. Reject unsupported schemes on requested URL or requested baseURL
  const urlSchemeMatch = requestedUrl.match(/^([a-z][a-z0-9+.-]*):/i)
  if (urlSchemeMatch) {
    const scheme = urlSchemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      throw new Error('Permintaan ditolak: Skema protokol URL tidak diizinkan.')
    }
  }

  const baseSchemeMatch = requestedBase.match(/^([a-z][a-z0-9+.-]*):/i)
  if (baseSchemeMatch) {
    const scheme = baseSchemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      throw new Error('Permintaan ditolak: Skema protokol URL tidak diizinkan.')
    }
  }

  // 3. Calculate full effective URI using the Axios instance's effective configuration
  let resolvedUri
  try {
    resolvedUri = api.getUri(config)
  } catch (e) {
    throw new Error('Permintaan ditolak: Format URL target tidak valid.')
  }

  // 4. Resolve effective target URL against the ACTUAL BROWSER PAGE ORIGIN (currentOrigin), NOT expectedOrigin!
  let targetUrl
  try {
    targetUrl = new URL(resolvedUri, currentOrigin)
  } catch (e) {
    throw new Error('Permintaan ditolak: Format URL target tidak valid.')
  }

  // 5. Enforce allowed schemes on resolved target
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error('Permintaan ditolak: Skema protokol URL tidak diizinkan.')
  }

  // 6. Strict Origin Confinement: Target origin MUST match expectedOrigin exactly
  if (targetUrl.origin !== expectedOrigin) {
    throw new Error('Permintaan ditolak: Tujuan transport berada di luar origin API resmi.')
  }

  return targetUrl
}

// Attach access_token from in-memory Pinia store to every request
api.interceptors.request.use(
  async (config) => {
    // 1. Strictly validate request destination BEFORE credentials or tokens are attached
    assertSafeRequestDestination(config)

    // 2. Attach access_token only AFTER destination is proven safe
    try {
      const { useAuthStore } = await import('../stores/authStore')
      const authStore = useAuthStore()
      if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`
      }
    } catch (e) {
      // Store not initialized yet
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// ── Response Interceptor ─────────────────────────────
// Handle 401 Unauthorized globally & parse Blob error payloads
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Log technical details only for developers
    if (import.meta.env.DEV) {
      console.error('[API Error]', error);
    }

    // Convert Blob error response to JSON object if applicable
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text();
        error.response.data = JSON.parse(text);
      } catch (e) {
        // Failed to parse blob text as JSON, retain original blob
      }
    }

    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      const isLoginRequest = originalRequest.url && originalRequest.url.includes('/login');
      const isRefreshRequest = originalRequest.url && originalRequest.url.includes('/refresh');
      
      if (isLoginRequest || isRefreshRequest) {
        if (isLoginRequest) {
          error.gmsMessage = error.response?.data?.message || 'Username atau password salah.';
        } else {
          error.gmsMessage = 'Sesi login sudah habis. Silakan login ulang.';
          try {
            const { useAuthStore } = await import('../stores/authStore')
            useAuthStore().clearAuth()
            const { default: router } = await import('../router')
            if (router.currentRoute.value.path !== '/login') {
              router.push('/login?expired=1')
            }
          } catch (e) {}
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { useAuthStore } = await import('../stores/authStore')
        const authStore = useAuthStore()
        
        // Attempt to refresh token
        const refreshResponse = await api.post('/auth/refresh', {}, { _retry: true });
        if (refreshResponse.data && refreshResponse.data.data && refreshResponse.data.data.accessToken) {
          const newToken = refreshResponse.data.data.accessToken;
          authStore.setToken(newToken);
          
          processQueue(null, newToken);
          
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          throw new Error('No token returned');
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        
        // Refresh failed, clear auth and logout
        try {
          const { useAuthStore } = await import('../stores/authStore')
          useAuthStore().clearAuth()
          const { default: router } = await import('../router')
          if (router.currentRoute.value.path !== '/login') {
             router.push('/login?expired=1')
          }
        } catch (e) {}

        error.gmsMessage = 'Sesi login sudah habis. Silakan login ulang.';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    } else if (error.response && error.response.status === 403) {
      if (error.response.data && error.response.data.code === 'PASSWORD_CHANGE_REQUIRED') {
        error.gmsMessage = 'Anda wajib mengganti temporary password sebelum menggunakan aplikasi.';
        import('../router').then(({ default: router }) => {
          if (router.currentRoute.value.path !== '/change-password') {
             router.push('/change-password')
          }
        })
      } else {
        error.gmsMessage = error.response?.data?.message || 'Anda tidak memiliki akses ke halaman ini.';
      }
    } else {
      error.gmsMessage = getErrorMessage(error);
    }

    return Promise.reject(error)
  }
)

export default api
