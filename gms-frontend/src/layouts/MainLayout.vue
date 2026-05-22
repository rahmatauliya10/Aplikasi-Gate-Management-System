<template>
  <div class="flex flex-col h-screen font-sans overflow-hidden" style="background: #EFFAFD;">
    <!-- Top Header Bar — Cyber Command Center -->
    <header class="h-16 md:h-20 flex items-center px-4 md:px-8 shrink-0 relative z-50 backdrop-blur-xl border-b border-white/40" 
            style="background: rgba(255, 255, 255, 0.7); box-shadow: 0 10px 40px rgba(15, 23, 42, 0.05);">
      
      <!-- Animated top accent line -->
      <div class="absolute top-0 left-0 right-0 h-[3px] overflow-hidden">
        <div class="h-full w-full" style="background: linear-gradient(90deg, transparent 0%, #4A8BDF 30%, #A0006D 60%, #4A8BDF 80%, transparent 100%); opacity: 0.6; animation: shimmerSweep 3s linear infinite;"></div>
      </div>

      <!-- Left: Sidebar Toggle + Brand -->
      <div class="flex items-center shrink-0" :class="sidebarOpen ? 'w-[250px] md:w-[300px]' : 'w-[60px]'" style="transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
        <button @click="sidebarOpen = !sidebarOpen"
          class="w-10 h-10 flex shrink-0 items-center justify-center text-slate-500 hover:text-[#4A8BDF] rounded-2xl bg-slate-50 hover:bg-[#E6F0FA] border border-slate-100 transition-all duration-300 active:scale-90"
        >
          <span class="material-icons text-[20px] transition-transform duration-500" :class="sidebarOpen ? 'rotate-0' : 'rotate-180'">{{ sidebarOpen ? 'menu_open' : 'menu' }}</span>
        </button>

        <div class="flex items-center space-x-3 ml-2 md:ml-4 overflow-hidden transition-all duration-500" :class="sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'">
          <div class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-2xl flex items-center justify-center relative group" 
               style="background: linear-gradient(135deg, #4A8BDF 0%, #3A6ABF 100%); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 8px 20px rgba(74,139,223,0.3);">
            <img src="/favicon.png" alt="Logo" class="w-6 h-6 md:w-7 md:h-7 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
            <div class="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
          <div class="truncate">
            <h1 class="text-[16px] font-black text-slate-900 tracking-tight leading-none truncate">GMS <span class="text-[#4A8BDF]">INTELLIGENCE</span></h1>
            <p class="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 leading-none mt-1.5 truncate">SANTOS JAYA ABADI</p>
          </div>
        </div>
      </div>

      <!-- ═══ Search Area ═══ -->
      <div class="hidden md:flex flex-1 max-w-md mx-10 relative group">
        <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <span class="material-icons text-slate-400 text-lg group-focus-within:text-[#4A8BDF] transition-colors">search</span>
        </div>
        <input type="text" placeholder="Search operations..."
          class="w-full h-12 pl-12 pr-4 rounded-2xl text-[13px] font-bold text-slate-700 bg-slate-50 border border-slate-100 focus:bg-white focus:border-[#4A8BDF] focus:border-opacity-40 focus:ring-4 focus:ring-[#4A8BDF] focus:ring-opacity-5 transition-all duration-300 outline-none"
        />
      </div>

      <!-- ═══ Right: Command Center Modules ═══ -->
      <div class="flex items-center space-x-2 md:space-x-6 ml-auto">
        <!-- Module: Clock (Modernized) -->
        <div class="hidden sm:flex items-center space-x-4 px-5 py-2.5 rounded-[1.5rem] bg-slate-50 border border-slate-100 group cursor-default hover:bg-white hover:shadow-md transition-all duration-500">
          <div class="flex flex-col text-right hidden lg:block">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">{{ currentDate.split(',')[0] }}</span>
            <span class="text-[11px] font-black text-slate-700 mt-1 leading-none">{{ currentDate.split(',')[1] }}</span>
          </div>
          <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100 group-hover:text-[#4A8BDF] transition-colors">
            <span class="material-icons text-[#4A8BDF] text-xl">schedule</span>
          </div>
          <div class="flex items-baseline space-x-0.5 relative">
            <span class="text-2xl font-black text-slate-900 tracking-tighter font-mono leading-none">{{ clockHour }}</span>
            <span class="text-2xl font-black leading-none text-[#4A8BDF] animate-pulse">:</span>
            <span class="text-2xl font-black text-slate-900 tracking-tighter font-mono leading-none">{{ clockMinute }}</span>
            <span class="text-xs font-black text-[#A0006D] font-mono ml-1.5 leading-none opacity-60">{{ clockSecond }}</span>
          </div>
        </div>

        <!-- Notifications -->
        <div class="relative">
          <button @click="showNotifications = !showNotifications; if(showNotifications) notificationStore.markAsRead()" class="relative w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-500 hover:text-[#A0006D] hover:shadow-lg transition-all duration-300 active:scale-90 group">
            <span class="material-icons text-2xl group-hover:animate-bounce">notifications_none</span>
            <span v-if="notificationStore.unreadCount > 0" class="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-[#A0006D] text-[9px] font-bold text-white border-2 border-white shadow-sm">{{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}</span>
          </button>
          
          <!-- Dropdown Notifications -->
          <transition name="fade-slide-up">
            <div v-if="showNotifications" class="absolute top-full right-[-50px] md:right-0 mt-3 w-[300px] md:w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
              <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm">
                <h3 class="font-black text-slate-800 text-[13px] uppercase tracking-wider">Activity Log</h3>
                <button @click="notificationStore.clearNotifications()" class="text-[10px] text-[#4A8BDF] hover:text-[#A0006D] font-black uppercase tracking-wider transition-colors">Clear All</button>
              </div>
              <div class="max-h-[360px] overflow-y-auto hide-scrollbar bg-white">
                <div v-if="notificationStore.notifications.length === 0" class="p-8 flex flex-col items-center justify-center text-center">
                  <span class="material-icons text-4xl text-slate-200 mb-2">notifications_paused</span>
                  <p class="text-[12px] font-bold text-slate-400">No active operations</p>
                </div>
                <div v-else class="divide-y divide-slate-50">
                  <div v-for="notif in notificationStore.notifications" :key="notif.id" 
                       class="p-4 hover:bg-slate-50/80 transition-colors group relative overflow-hidden"
                       :class="!notif.read ? 'bg-blue-50/20' : ''">
                    <div class="flex items-start gap-3 relative z-10">
                      <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                           :class="notif.type === 'success' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' : (notif.type === 'error' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-[#E6F0FA] text-[#4A8BDF] border border-blue-100')">
                        <span class="material-icons text-[16px]">{{ notif.type === 'success' ? 'check_circle' : (notif.type === 'error' ? 'error' : 'info') }}</span>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-[12px] font-black text-slate-800 leading-tight truncate group-hover:text-[#4A8BDF] transition-colors">{{ notif.title }}</p>
                        <p class="text-[11px] font-bold text-slate-500 mt-1 leading-snug">{{ notif.message }}</p>
                        <p class="text-[9px] font-black text-slate-400 mt-2 tracking-wider">{{ new Date(notif.timestamp).toLocaleTimeString() }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Profile (Glass Style) -->
        <div @click="handleLogout" class="flex items-center space-x-3 pl-6 border-l border-slate-100 group cursor-pointer relative hover:bg-slate-50 rounded-xl p-2 -my-2 transition-colors">
          <div class="flex flex-col text-right hidden sm:block">
            <p class="text-xs font-black text-slate-900 leading-none group-hover:text-[#4A8BDF] transition-colors">{{ authStore.user?.name || 'Loading...' }}</p>
            <p class="text-[9px] font-black text-[#A0006D] uppercase tracking-widest mt-1.5 opacity-80">{{ authStore.user?.role || 'SYSTEM' }}</p>
          </div>
          <div class="relative">
            <div class="w-9 h-9 md:w-11 md:h-11 rounded-2xl flex items-center justify-center text-white text-xs md:text-sm font-black transition-all duration-500 group-hover:rotate-[360deg] shadow-lg"
                 style="background: linear-gradient(135deg, #4A8BDF, #A0006D);">{{ authStore.user?.name ? authStore.user.name.substring(0,2).toUpperCase() : '?' }}</div>
            <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
          </div>
          <div class="absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none z-50 hidden md:block">
            Click to Logout
          </div>
        </div>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden relative">
      <!-- Mobile Backdrop -->
      <transition name="fade">
        <div v-if="sidebarOpen" @click="sidebarOpen = false" class="md:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm"></div>
      </transition>

      <!-- Sidebar — Futuristic Translucent -->
      <aside
        class="flex flex-col shrink-0 absolute md:relative z-40 h-full overflow-hidden"
        :class="[
          sidebarOpen ? 'w-[280px] md:w-[332px] translate-x-0' : 'w-[280px] md:w-[92px] -translate-x-full md:translate-x-0'
        ]"
        :style="{ transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }"
        style="background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%); border-right: 1px solid rgba(15, 23, 42, 0.05);"
      >
        <!-- Background Ambient Elements -->
        <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 blur-[100px] pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-64 h-64 bg-pink-50/30 blur-[100px] pointer-events-none"></div>

        <div class="relative z-10 flex flex-col h-full py-6">
          <nav class="flex-1 px-5 space-y-2 overflow-y-auto overflow-x-hidden hide-scrollbar">

            <div v-if="sidebarOpen" class="px-4 mb-4 mt-2">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Main Deck</span>
            </div>

            <router-link to="/" class="nav-link" :class="$route.path === '/' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Dashboard' : ''">
              <span class="nav-icon material-icons-outlined">space_dashboard</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Dashboard</span></transition>
              <div v-if="sidebarOpen && $route.path === '/'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/gate-in" class="nav-link" :class="$route.path === '/gate-in' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Gate In' : ''">
              <span class="nav-icon material-icons-outlined">door_front</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Security Gate</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gate-in'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/weighbridge" class="nav-link" :class="$route.path === '/weighbridge' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Weighbridge' : ''">
              <span class="nav-icon material-icons-outlined">speed</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Weighing Bridge</span></transition>
              <div v-if="sidebarOpen && $route.path === '/weighbridge'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <div class="pt-6 pb-2">
              <div v-if="sidebarOpen" class="px-4 mb-3">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Warehouse Hub</span>
              </div>
              <div v-else class="h-px bg-slate-100 mx-4"></div>
            </div>

            <router-link to="/gbb" class="nav-link" :class="$route.path === '/gbb' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'GBB Process' : ''">
              <span class="nav-icon material-icons-outlined">inventory_2</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Raw Materials</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gbb'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/gbj" class="nav-link" :class="$route.path === '/gbj' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'GBJ Process' : ''">
              <span class="nav-icon material-icons-outlined">grid_view</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Finished Goods</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gbj'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/gsp" class="nav-link" :class="$route.path === '/gsp' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'GSP Process' : ''">
              <span class="nav-icon material-icons-outlined">build</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Spareparts</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gsp'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/qc" class="nav-link" :class="$route.path === '/qc' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'QC Verification' : ''">
              <span class="nav-icon material-icons-outlined">verified</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Quality Control</span></transition>
              <div v-if="sidebarOpen && $route.path === '/qc'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/gate-out" class="nav-link" :class="$route.path === '/gate-out' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Gate Out' : ''">
              <span class="nav-icon material-icons-outlined">logout</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Exit Gate</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gate-out'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <div class="pt-6 pb-2">
              <div v-if="sidebarOpen" class="px-4 mb-3">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Reporting</span>
              </div>
              <div v-else class="h-px bg-slate-100 mx-4"></div>
            </div>

            <router-link to="/history" class="nav-link" :class="$route.path === '/history' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Rekap Transaksi' : ''">
              <span class="nav-icon material-icons-outlined">history</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Operations Log</span></transition>
              <div v-if="sidebarOpen && $route.path === '/history'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/settings" class="nav-link" :class="$route.path === '/settings' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Settings' : ''">
              <span class="nav-icon material-icons-outlined">settings_suggest</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">System Config</span></transition>
              <div v-if="sidebarOpen && $route.path === '/settings'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>
          </nav>

          <!-- Sidebar Footer (Interactive Profile/Status) -->
          <div class="px-4 pt-4 border-t border-slate-100 mt-4 mx-2 mb-4">
            <div class="rounded-xl p-4 flex flex-col transition-all duration-300 hover:shadow-sm hover:bg-slate-50/80 hover:-translate-y-1 cursor-pointer group border border-transparent hover:border-slate-100 bg-transparent">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-teal-600 text-[16px] group-hover:text-teal-500 transition-colors duration-300">eco</span>
                <span v-if="sidebarOpen" class="text-[11px] font-black text-slate-800 tracking-wide group-hover:text-teal-700 transition-colors duration-300">{{ authStore.user?.name || authStore.user?.username || authStore.user?.email || 'User' }}</span>
              </div>
              <div v-if="sidebarOpen" class="mt-1 text-[7.5px] font-black text-teal-600 uppercase tracking-[0.2em] group-hover:text-teal-500 transition-colors duration-300">
                {{ authStore.user?.role || 'OPERATIONAL EXCELLENCE' }}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto overflow-x-hidden relative w-full" style="background-image: url('/Latar_belakang.png'); background-position: center; background-size: cover; background-repeat: no-repeat; background-attachment: fixed; background-color: #EFFAFD;">
        <div class="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 min-w-0">
          <router-view v-slot="{ Component, route }">
            <transition name="page" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../stores/notificationStore'
import { useAuthStore } from '../stores/authStore'

const router = useRouter()
const notificationStore = useNotificationStore()
const authStore = useAuthStore()
const showNotifications = ref(false)

const handleLogout = () => {
  authStore.logout()
  notificationStore.addNotification('System Security', 'You have been logged out safely.', 'info')
  router.push('/login')
}

const sidebarOpen = ref(true)
const clockHour = ref('00')
const clockMinute = ref('00')
const clockSecond = ref('00')
const currentDate = ref('')
let timer = null

const updateClock = () => {
  const now = new Date()
  clockHour.value = String(now.getHours()).padStart(2, '0')
  clockMinute.value = String(now.getMinutes()).padStart(2, '0')
  clockSecond.value = String(now.getSeconds()).padStart(2, '0')
  
  const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }
  currentDate.value = now.toLocaleDateString('id-ID', options)
}

onMounted(() => {
  updateClock()
  timer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.nav-link {
  @apply flex items-center space-x-4 px-4 py-3 rounded-xl text-[13px] font-bold whitespace-nowrap;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-text {
  @apply truncate flex-1;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-active {
  color: #A0006D;
  background: linear-gradient(135deg, rgba(74,139,223,0.1) 0%, rgba(160,0,109,0.05) 100%);
  border: 1px solid rgba(74,139,223, 0.25);
  box-shadow: 0 0 16px rgba(74,139,223, 0.12);
}

.nav-active .nav-icon {
  color: #A0006D;
  filter: drop-shadow(0 0 4px rgba(160,0,109,0.4));
  transform: scale(1.1);
}

.nav-inactive {
  color: #4A8BDF;
  border: 1px solid transparent;
}

.nav-inactive:hover {
  color: #3A6ABF;
  background: rgba(74,139,223, 0.08);
  border-color: rgba(74,139,223, 0.15);
  transform: translateX(4px);
}

.nav-inactive:hover .nav-icon {
  color: #3A6ABF;
  transform: scale(1.15);
}

.nav-inactive:active {
  transform: translateX(1px) scale(0.98);
}
</style>
