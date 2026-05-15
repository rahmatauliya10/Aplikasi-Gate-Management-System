<template>
  <div>
    <!-- Page Header -->
    <PageHeader title="Gate Check-In (Security)" subtitle="Truck Registration Portal">
      <button @click="openModal" 
        class="group relative overflow-hidden flex items-center space-x-3 px-6 py-3 rounded-2xl transition-all duration-500 hover:shadow-[0_15px_30px_-10px_rgba(74,139,223,0.6)] hover:-translate-y-1 active:scale-95 active:translate-y-0"
        style="background: linear-gradient(135deg, #4A8BDF 0%, #3A6ABF 50%, #A0006D 100%);">
        
        <!-- Animated Background Glow -->
        <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
          style="background: radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%);"></div>
        
        <!-- Shimmer Effect -->
        <div class="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none"
          style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); skewX(-20deg);"></div>

        <!-- Content -->
        <div class="relative flex items-center space-x-2">
          <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 group-hover:rotate-90 transition-transform duration-500">
            <span class="material-icons text-lg text-white">add</span>
          </div>
          <span class="text-sm font-black text-white uppercase tracking-wider">Register New Truck</span>
        </div>

        <!-- Bottom Reflection -->
        <div class="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      </button>
    </PageHeader>

    <!-- Registration Modal -->
    <transition name="modal">
      <div v-if="isModalOpen"
        class="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8 backdrop-animate"
        @click.self="closeModal">
        <div class="modal-panel w-full max-w-2xl mx-4 rounded-[1.25rem] overflow-hidden relative"
          style="background:white;box-shadow:0 30px 80px rgba(0,0,0,0.4),0 0 0 1px rgba(74,139,223,0.1);">
          <!-- Modal Header -->
          <div class="px-7 py-5 flex items-center justify-between" style="background:linear-gradient(135deg,#FFFFFF,#E6F0FA);border-bottom:1px solid rgba(74,139,223,0.15)">
            <div class="flex items-center space-x-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(74,139,223,0.25),rgba(160,0,109,0.1));border:1px solid rgba(74,139,223,0.3)">
                <span class="material-icons text-[#4A8BDF] text-lg">how_to_reg</span>
              </div>
              <div>
                <h2 class="text-lg font-black text-[#4A8BDF]" style="letter-spacing:-0.02em">Register New Truck</h2>
                <p class="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Security Gate Entry</p>
              </div>
            </div>
            <button @click="closeModal"
              class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:text-red-400 hover:rotate-90 transition-all duration-300"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06)">
              <span class="material-icons text-lg">close</span>
            </button>
          </div>
          <div class="p-7">
            <TruckForm @submit="handleTruckSubmit" @cancel="closeModal" />
          </div>
        </div>
      </div>
    </transition>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />

    <!-- List -->
    <div class="ind-container flex flex-col h-[700px] overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
      <!-- Glossy Overlay -->
      <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
      
      <div class="px-5 sm:px-8 py-5 sm:py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 relative">
        <div class="flex items-center space-x-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help shrink-0">
            <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">pending_actions</span>
          </div>
          <div>
            <h2 class="text-lg sm:text-xl font-black text-slate-800 tracking-tight leading-tight">Registration Logs</h2>
            <div class="flex items-center mt-1 space-x-2 flex-wrap">
              <span class="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
              <span class="w-1 h-1 rounded-full bg-slate-300 hidden sm:block"></span>
              <span class="text-[9px] sm:text-[10px] font-bold text-[#A0006D] uppercase hidden sm:block">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div class="relative w-full sm:w-auto">
            <input v-model="searchQuery" type="text" placeholder="Search Plate Number..." class="w-full sm:w-56 h-10 pl-10 pr-10 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm">
            <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              <span class="material-icons text-[16px]">close</span>
            </button>
          </div>
          <div class="flex items-center space-x-2 px-4 py-2 rounded-2xl bg-white shadow-sm border border-slate-100">
            <div class="relative">
              <span class="block w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
              <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
            </div>
            <span class="text-xs font-black text-slate-700 tracking-wider">{{ filteredTrucks.length }} ACTIVE LOGS</span>
          </div>
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 space-y-5 relative custom-scrollbar">
        <!-- Modern Grid Background -->
        <div class="absolute inset-0 pointer-events-none opacity-[0.03]" 
          style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
        
        <transition-group name="list" tag="div" class="relative z-10 space-y-3 w-full">
          <div v-for="(truck, i) in paginatedRegisteredTrucks" :key="truck.id"
            class="group relative bg-white backdrop-blur-md rounded-[1rem] border border-slate-100 hover:border-indigo-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-wrap md:flex-nowrap items-center px-4 py-4 md:py-3 gap-4 md:gap-3 lg:gap-6"
          >
            <div class="flex items-center gap-3 sm:gap-4 w-full md:w-auto">
              <!-- COL 1: Plate Number (Dark Box) -->
              <div class="flex-shrink-0">
                <div class="h-10 sm:h-12 bg-[#1A1F2C] rounded-xl flex items-center justify-center text-white font-mono font-bold text-[12px] sm:text-[13px] shadow-sm tracking-wider px-3 min-w-[3rem]">
                  {{ truck.plateNumber.length > 10 ? truck.plateNumber.substring(0,10) : truck.plateNumber }}
                </div>
              </div>

              <!-- COL 2: Vendor (Plain text) -->
              <div class="flex-1 md:w-[150px] lg:w-[250px] xl:w-[350px]">
                <span class="font-black text-slate-800 text-[13px] sm:text-[14px] leading-tight block line-clamp-2 break-words" :title="truck.vendor">
                  {{ (truck.vendor || truck.plateNumber).length > 100 ? (truck.vendor || truck.plateNumber).substring(0, 100) + '...' : (truck.vendor || truck.plateNumber) }}
                </span>
              </div>

              <!-- COL 3: Process Pill -->
              <div class="flex-shrink-0 flex justify-center">
                <span class="inline-block px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-center indent-[0.05em]"
                     :class="truck.processType === 'GBB' ? 'bg-[#FDF2F8] text-[#A0006D]' : 'bg-[#EFF6FF] text-[#3A6ABF]'">
                  {{ truck.processType }}
                </span>
              </div>
            </div>

            <div class="flex flex-1 items-center justify-between md:justify-end gap-3 sm:gap-4 w-full md:w-auto flex-wrap sm:flex-nowrap mt-2 md:mt-0">
              <!-- COL 4: Status / Stage -->
              <div class="flex-1 flex items-center min-w-[120px]">
                <div class="w-2 h-2 rounded-full bg-[#4A8BDF] shadow-[0_0_8px_rgba(74,139,223,0.6)] mr-2"></div>
                <span class="text-[10px] sm:text-[12px] font-black text-slate-700 uppercase tracking-[0.1em] truncate">{{ truck.step.replace('_', ' ') }}</span>
              </div>

              <!-- COL 5 & 6: Time and Duration -->
              <div class="flex items-center gap-3 sm:gap-4">
                <div class="flex-shrink-0 text-right">
                  <span class="text-[12px] sm:text-[14px] font-mono text-slate-600 font-bold tracking-tight">{{ formatTime(truck.timestamps.entry) }}</span>
                </div>
                <div class="flex-shrink-0 flex items-center justify-end gap-1.5 sm:gap-2 text-slate-500">
                  <span class="material-icons text-[14px] sm:text-[16px]">schedule</span>
                  <span class="text-[11px] sm:text-[13px] font-mono font-bold">{{ calculateDuration(truck.timestamps.entry) }}</span>
                </div>
              </div>

              <!-- COL 7: Action Button -->
              <div class="flex-shrink-0 ml-auto sm:ml-0 pl-0 md:pl-2">
                <button @click="viewDetails(truck)" class="px-4 sm:px-5 py-2 rounded-xl border-2 border-[#E6F0FA] text-[#4A8BDF] hover:bg-[#4A8BDF] hover:text-white hover:border-[#4A8BDF] transition-all duration-300 flex items-center justify-center">
                  <span class="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em]">INSPECT</span>
                </button>
              </div>
            </div>
          </div>
          
          <div v-if="registeredTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative">
            <div class="relative mb-6">
              <div class="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center animate-gentle-float border border-slate-100">
                <span class="material-icons text-slate-300 text-5xl">cloud_queue</span>
              </div>
              <div class="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-[#E6F0FA] flex items-center justify-center animate-pulse">
                <span class="material-icons text-[#4A8BDF] text-xl">radar</span>
              </div>
            </div>
            <p class="text-base font-black text-slate-400 tracking-[0.3em] uppercase">No active registrations</p>
            <p class="text-xs font-bold text-slate-400 mt-2 italic">Scanning for incoming gate entries...</p>
          </div>
        </transition-group>
      </div>
      <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredTrucks.length > 0">
        <Pagination :current-page="currentPage" :total-items="filteredTrucks.length" @update:current-page="currentPage = $event" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import TruckForm from '../components/TruckForm.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'
import Pagination from '../components/Pagination.vue'

const truckStore = useTruckStore()
const toast = useToast()
const isModalOpen = ref(false)
const showDetailsModal = ref(false)
const selectedTruck = ref(null)
const currentPage = ref(1)
const searchQuery = ref('')
const registeredTrucks = computed(() => [...truckStore.trucks].reverse())
const filteredTrucks = computed(() => {
  if (!searchQuery.value) return registeredTrucks.value
  return registeredTrucks.value.filter(t => t.plateNumber.toLowerCase().includes(searchQuery.value.toLowerCase()))
})
const paginatedRegisteredTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredTrucks.value.slice(start, end)
})
watch(searchQuery, () => { currentPage.value = 1 })

const openModal = () => { isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false }
const handleTruckSubmit = (truckData) => { truckStore.addTruck(truckData); closeModal(); toast.success(`Truck ${truckData.plateNumber} registered successfully!`) }
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const calculateDuration = (isoString) => {
  if (!isoString) return '-';
  const diff = Math.floor((new Date() - new Date(isoString)) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}
const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
</script>
