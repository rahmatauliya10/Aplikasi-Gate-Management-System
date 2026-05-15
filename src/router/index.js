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
  
  // Use auth store
  const { useAuthStore } = await import('../stores/authStore')
  const authStore = useAuthStore()
  
  // If not logged in and not heading to login page
  if (to.path !== '/login' && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    // If logged in and heading to login page, redirect to dashboard
    next('/')
  } else {
    next()
  }
})

router.afterEach(() => {
  // Artificial delay to make the curtain transition feel premium and visible
  setTimeout(() => {
    isPageLoading.value = false
  }, 600)
})

export default router
