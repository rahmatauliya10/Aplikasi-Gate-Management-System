import axios from 'axios'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/authStore'
import router from '../router'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response Interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const toast = useToast()
    
    if (error.response) {
      const status = error.response.status
      if (status === 400) {
        toast.error('Data could not be saved. Please check the input and try again.')
      } else if (status === 401) {
        toast.error('Your session has expired. Please login again.')
        const authStore = useAuthStore()
        authStore.logout()
        router.push('/login')
      } else if (status === 403) {
        toast.error('You do not have permission to perform this action.')
      } else if (status === 404) {
        toast.error('Requested resource not found.')
      } else if (status === 500) {
        toast.error('Internal server error occurred.')
      } else if (status === 502) {
        toast.error('Server is temporarily unavailable. Please try again later.')
      } else {
        toast.error(error.response.data?.message || 'An unexpected error occurred.')
      }
    } else if (error.request) {
      toast.error('Server is temporarily unavailable. Please try again later.')
    } else {
      toast.error('An unexpected error occurred.')
    }
    
    return Promise.reject(error)
  }
)

export default api
