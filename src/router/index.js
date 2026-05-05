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

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
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
        }
    ]
})

export const isPageLoading = ref(false)

router.beforeEach((to, from, next) => {
  if (to.path !== from.path) {
    isPageLoading.value = true
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
