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

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true
})

// ── Request Interceptor ──────────────────────────────
// Attach access_token from localStorage to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

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

    if (error.response && error.response.status === 401) {
      // Token expired or invalid — clear auth data
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')

      const isLoginRequest = error.config && error.config.url && error.config.url.includes('/login');

      // Redirect to login if not already there (SPA friendly)
      import('../router').then(({ default: router }) => {
        if (router.currentRoute.value.path !== '/login') {
           router.push('/login?expired=1')
        }
      })

      if (isLoginRequest) {
        error.gmsMessage = error.response?.data?.message || 'Username atau password salah.';
      } else {
        error.gmsMessage = 'Sesi login sudah habis. Silakan login ulang.';
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
      // Attach our human-readable message directly to the error object 
      // so stores can just use error.gmsMessage
      error.gmsMessage = getErrorMessage(error);
    }

    return Promise.reject(error)
  }
)

export default api
