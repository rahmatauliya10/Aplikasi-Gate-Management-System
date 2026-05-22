import { createRouter, createWebHistory } from 'vue-router'
import { ref } from 'vue'
import Dashboard from '../views/Dashboard.vue'
import GateCheckIn from '../views/GateCheckIn.vue'
import Weighbridge from '../views/Weighbridge.vue'
import GBBProcess from '../views/GBBProcess.vue'
import GBJProcess from '../views/GBJProcess.vue'
import GSPProcess from '../views/GSPProcess.vue'
import QCVerification from '../views/QCVerification.vue'
import GateCheckOut from '../views/GateCheckOut.vue'
import History from '../views/History.vue'
import Settings from '../views/Settings.vue'
import NotFound from '../views/NotFound.vue'
import Login from '../views/Login.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: Login
        },
        {
            path: '/',
            name: 'dashboard',
            component: Dashboard
        },
        {
            path: '/gate-in',
            name: 'gate-in',
            component: GateCheckIn
        },
        {
            path: '/weighbridge',
            name: 'weighbridge',
            component: Weighbridge
        },
        {
            path: '/gbb',
            name: 'gbb',
            component: GBBProcess
        },
        {
            path: '/gbj',
            name: 'gbj',
            component: GBJProcess
        },
        {
            path: '/gsp',
            name: 'gsp',
            component: GSPProcess
        },
        {
            path: '/qc',
            name: 'qc',
            component: QCVerification
        },
        {
            path: '/gate-out',
            name: 'gate-out',
            component: GateCheckOut
        },
        {
            path: '/history',
            name: 'history',
            component: History
        },
        {
            path: '/settings',
            name: 'settings',
            component: Settings
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: NotFound
        }
    ]
})

export const isPageLoading = ref(false)

router.beforeEach(async (to, from, next) => {
  if (to.path !== from.path) {
    isPageLoading.value = true
  }
  
  const { useAuthStore } = await import('../stores/authStore')
  const { useNotificationStore } = await import('../stores/notificationStore')
  const authStore = useAuthStore()
  const notificationStore = useNotificationStore()
  
  if (authStore.token && !authStore.user) {
    await authStore.initAuth()
  }

  const isAuthenticated = authStore.isAuthenticated
  const role = authStore.user?.role

  if (to.path !== '/login' && !isAuthenticated) {
    next('/login')
    return
  } 
  
  if (to.path === '/login' && isAuthenticated) {
    next('/')
    return
  }

  // Role-based Access Control
  if (to.path !== '/login' && to.path !== '/' && role !== 'ADMIN') {
    let allowed = true
    
    if (['/gate-in', '/gate-out'].includes(to.path) && role !== 'GATE_SECURITY') {
      allowed = false
    } else if (to.path === '/weighbridge' && role !== 'WEIGHBRIDGE_OPERATOR') {
      allowed = false
    } else if (['/gbb', '/gbj', '/gsp'].includes(to.path) && role !== 'WAREHOUSE_STAFF') {
      allowed = false
    } else if (to.path === '/qc' && role !== 'QC_INSPECTOR') {
      allowed = false
    } else if (to.path === '/settings' && role !== 'ADMIN') {
      allowed = false // Only ADMIN can access settings
    }
    
    if (!allowed) {
      notificationStore.addNotification('Access Denied', 'You do not have permission to access this page.', 'error')
      next(from.path !== '/' ? '/' : false)
      return
    }
  }

  next()
})

router.afterEach(() => {
  // Artificial delay to make the curtain transition feel premium and visible
  setTimeout(() => {
    isPageLoading.value = false
  }, 600)
})

export default router
