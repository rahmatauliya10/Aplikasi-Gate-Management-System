<template>
  <div class="flex flex-col h-screen font-sans overflow-hidden" style="background: #EFFAFD;">
    <!-- Top Header Bar — Cyber Command Center -->
    <header class="h-20 flex items-center px-8 shrink-0 relative z-50 backdrop-blur-xl border-b border-white/40" 
            style="background: rgba(255, 255, 255, 0.7); box-shadow: 0 10px 40px rgba(15, 23, 42, 0.05);">
      
      <!-- Animated top accent line -->
      <div class="absolute top-0 left-0 right-0 h-[3px] overflow-hidden">
        <div class="h-full w-full" style="background: linear-gradient(90deg, transparent 0%, #4A8BDF 30%, #A0006D 60%, #4A8BDF 80%, transparent 100%); opacity: 0.6; animation: shimmerSweep 3s linear infinite;"></div>
      </div>

      <!-- Left: Sidebar Toggle + Brand -->
      <div class="flex items-center shrink-0" :class="sidebarOpen ? 'w-[300px]' : 'w-[60px]'" style="transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
        <button @click="sidebarOpen = !sidebarOpen"
          class="w-10 h-10 flex shrink-0 items-center justify-center text-slate-500 hover:text-[#4A8BDF] rounded-2xl bg-slate-50 hover:bg-[#E6F0FA] border border-slate-100 transition-all duration-300 active:scale-90"
        >
          <span class="material-icons text-[20px] transition-transform duration-500" :class="sidebarOpen ? 'rotate-0' : 'rotate-180'">{{ sidebarOpen ? 'menu_open' : 'menu' }}</span>
        </button>

        <div class="flex items-center space-x-3 ml-4 overflow-hidden transition-all duration-500" :class="sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'">
          <div class="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center relative group" 
               style="background: linear-gradient(135deg, #4A8BDF 0%, #3A6ABF 100%); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 8px 20px rgba(74,139,223,0.3);">
            <img src="/favicon.png" alt="Logo" class="w-7 h-7 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
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
      <div class="flex items-center space-x-6 ml-auto">
        <!-- Module: Clock (Modernized) -->
        <div class="flex items-center space-x-4 px-5 py-2.5 rounded-[1.5rem] bg-slate-50 border border-slate-100 group cursor-default hover:bg-white hover:shadow-md transition-all duration-500">
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
        <button class="relative w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-500 hover:text-[#A0006D] hover:shadow-lg transition-all duration-300 active:scale-90 group">
          <span class="material-icons text-2xl group-hover:animate-bounce">notifications_none</span>
          <span class="absolute top-3 right-3 w-3 h-3 rounded-full bg-[#A0006D] border-[3px] border-white shadow-sm"></span>
        </button>

        <!-- Profile (Glass Style) -->
        <div class="flex items-center space-x-3 pl-6 border-l border-slate-100 group cursor-pointer relative">
          <div class="flex flex-col text-right hidden sm:block">
            <p class="text-xs font-black text-slate-900 leading-none group-hover:text-[#4A8BDF] transition-colors">Rahmat Auliya</p>
            <p class="text-[9px] font-black text-[#A0006D] uppercase tracking-widest mt-1.5 opacity-80">Officer</p>
          </div>
          <div class="relative">
            <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-sm font-black transition-all duration-500 group-hover:rotate-[360deg] shadow-lg"
                 style="background: linear-gradient(135deg, #4A8BDF, #A0006D);">RA</div>
            <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
          </div>
        </div>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar — Futuristic Translucent -->
      <aside
        class="flex flex-col shrink-0 relative overflow-hidden"
        :class="sidebarOpen ? 'w-[332px]' : 'w-[92px]'"
        :style="{ transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }"
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
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Command Center</span></transition>
              <div v-if="sidebarOpen && $route.path === '/'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/gate-in" class="nav-link" :class="$route.path === '/gate-in' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Gate In' : ''">
              <span class="nav-icon material-icons-outlined">door_front</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Security Gate</span></transition>
              <div v-if="sidebarOpen && $route.path === '/gate-in'" class="ml-auto w-1.5 h-1.5 rounded-full bg-[#A0006D]"></div>
            </router-link>

            <router-link to="/weighbridge" class="nav-link" :class="$route.path === '/weighbridge' ? 'nav-active' : 'nav-inactive'" :title="!sidebarOpen ? 'Weighbridge' : ''">
              <span class="nav-icon material-icons-outlined">speed</span>
              <transition name="fade-slide"><span v-if="sidebarOpen" class="nav-text">Weight Analysis</span></transition>
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
                <span v-if="sidebarOpen" class="text-[11px] font-black text-slate-800 tracking-wide group-hover:text-teal-700 transition-colors duration-300">Rahmat Auliya</span>
              </div>
              <div v-if="sidebarOpen" class="mt-1 text-[7.5px] font-black text-teal-600 uppercase tracking-[0.2em] group-hover:text-teal-500 transition-colors duration-300">
                OPERATIONAL EXCELLENCE
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto" style="background-image: url('/Latar_belakang.png'); background-position: center; background-size: cover; background-repeat: no-repeat; background-attachment: fixed; background-color: #EFFAFD;">
        <div class="max-w-7xl mx-auto px-6 py-6 pb-24">
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
