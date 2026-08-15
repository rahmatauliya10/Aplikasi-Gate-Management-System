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

// Attach access_token from in-memory Pinia store to every request
api.interceptors.request.use(
  async (config) => {
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
