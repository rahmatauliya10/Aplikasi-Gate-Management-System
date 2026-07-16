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
import ChangePassword from '../views/ChangePassword.vue'
import Unauthorized from '../views/Unauthorized.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: Login
        },
        {
            path: '/change-password',
            name: 'change-password',
            component: ChangePassword,
            meta: { requiresAuth: true }
        },
        {
            path: '/',
            name: 'dashboard',
            component: Dashboard,
            meta: { requiresAuth: true, roles: ["ADMIN", "SECURITY", "WAREHOUSE", "QC"] }
        },
        {
            path: '/gate-in',
            name: 'gate-in',
            component: GateCheckIn,
            meta: { requiresAuth: true, roles: ["ADMIN", "SECURITY"] }
        },
        {
            path: '/weighbridge',
            name: 'weighbridge',
            component: Weighbridge,
            meta: { requiresAuth: true, roles: ["ADMIN", "SECURITY"] }
        },
        {
            path: '/gbb',
            name: 'gbb',
            component: GBBProcess,
            meta: { requiresAuth: true, roles: ["ADMIN", "WAREHOUSE"], warehouseCode: "GBB" }
        },
        {
            path: '/gbj',
            name: 'gbj',
            component: GBJProcess,
            meta: { requiresAuth: true, roles: ["ADMIN", "WAREHOUSE"], warehouseCode: "GBJ" }
        },
        {
            path: '/gsp',
            name: 'gsp',
            component: GSPProcess,
            meta: { requiresAuth: true, roles: ["ADMIN", "WAREHOUSE"], warehouseCode: "GSP" }
        },
        {
            path: '/qc',
            name: 'qc',
            component: QCVerification,
            meta: { requiresAuth: true, roles: ["ADMIN", "QC"] }
        },
        {
            path: '/gate-out',
            name: 'gate-out',
            component: GateCheckOut,
            meta: { requiresAuth: true, roles: ["ADMIN", "SECURITY"] }
        },
        {
            path: '/history',
            name: 'history',
            component: History,
            meta: { requiresAuth: true, roles: ["ADMIN", "SECURITY", "WAREHOUSE", "QC"] }
        },
        {
            path: '/settings',
            name: 'settings',
            component: Settings,
            meta: { requiresAuth: true, roles: ["ADMIN"] }
        },
        {
            path: '/users',
            name: 'users',
            component: () => import('../views/UserManagement.vue'),
            meta: { requiresAuth: true, roles: ["ADMIN"] }
        },
        {
            path: '/unauthorized',
            name: 'unauthorized',
            component: Unauthorized
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: NotFound
        }
    ]
})

export const isPageLoading = ref(false)

function hasRoleAccess(userRole, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (userRole === "ADMIN") return true;
  return allowedRoles.includes(userRole);
}

function hasWarehouseAccess(user, warehouseCode) {
  if (!warehouseCode) return true;
  if (user?.role === "ADMIN") return true;
  if (user?.role !== "WAREHOUSE") return false;
  return Array.isArray(user?.warehouseAccess) && user.warehouseAccess.includes(warehouseCode);
}

router.beforeEach(async (to, from, next) => {
  if (to.path !== from.path) {
    isPageLoading.value = true
  }
  
  // Use auth store
  const { useAuthStore } = await import('../stores/authStore')
  const authStore = useAuthStore()
  
  // Ensure auth is initialized from localStorage
  authStore.initializeAuth()
  
  // If not logged in and not heading to login page
  if (to.path !== '/login' && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    // If logged in and heading to login page, redirect to dashboard
    next('/')
  } else if (to.meta.requiresAuth && authStore.isAuthenticated) {
    const user = authStore.user;

    // Force redirect to change-password if mustChangePassword is set
    if (authStore.mustChangePassword && to.path !== '/change-password') {
      next('/change-password');
      return;
    }
    
    // Check role access
    if (to.meta.roles && !hasRoleAccess(user?.role, to.meta.roles)) {
      next('/unauthorized');
      return;
    }
    
    // Check warehouse access
    if (to.meta.warehouseCode && !hasWarehouseAccess(user, to.meta.warehouseCode)) {
      next('/unauthorized');
      return;
    }
    
    next();
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
