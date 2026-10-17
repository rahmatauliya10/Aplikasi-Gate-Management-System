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
    <teleport to="body">
      <transition name="modal">
        <div v-if="isModalOpen"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"
          @click.self="closeModal">
          <div class="modal-panel w-[95vw] sm:max-w-2xl mx-auto rounded-[1.25rem] flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden relative"
            style="background:white;box-shadow:0 30px 80px rgba(0,0,0,0.4),0 0 0 1px rgba(74,139,223,0.1);">
            <!-- Modal Header -->
            <div class="px-4 sm:px-7 py-4 sm:py-5 flex items-center justify-between shrink-0" style="background:linear-gradient(135deg,#FFFFFF,#E6F0FA);border-bottom:1px solid rgba(74,139,223,0.15)">
              <div class="flex items-center space-x-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(74,139,223,0.25),rgba(160,0,109,0.1));border:1px solid rgba(74,139,223,0.3)">
                  <span class="material-icons text-[#4A8BDF] text-lg">how_to_reg</span>
                </div>
                <div>
                  <h2 class="text-base sm:text-lg font-black text-[#4A8BDF]" style="letter-spacing:-0.02em">Register New Truck</h2>
                  <p class="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Security Gate Entry</p>
                </div>
              </div>
              <button @click="closeModal"
                class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:text-red-400 hover:rotate-90 transition-all duration-300"
                style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06)">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            <div class="p-4 sm:p-7 overflow-y-auto custom-scrollbar flex-1">
              <TruckForm :is-submitting="isSubmitting" @submit="handleTruckSubmit" @cancel="closeModal" />
            </div>
          </div>
        </div>
      </transition>
    </teleport>

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
              <span class="text-[9px] sm:text-[10px] font-bold text-[#A0006D] uppercase hidden sm:block">{{ formatPlantDate(new Date()) }}</span>
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
      
      <div class="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 relative custom-scrollbar">
        <!-- Modern Grid Background -->
        <div class="absolute inset-0 pointer-events-none opacity-[0.03]" 
          style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
        
        <!-- Table Header (Hidden on Mobile) -->
        <div class="relative z-10 hidden md:grid grid-cols-[165px_minmax(180px,1.4fr)_80px_minmax(180px,1.2fr)_165px_95px_70px] items-center px-6 py-3.5 bg-slate-50/90 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-full min-w-[980px] border border-slate-200/80 border-b-0 rounded-t-xl select-none">
          <div>Plate No</div>
          <div class="px-2">Vendor / Info</div>
          <div class="text-center">Whse</div>
          <div class="px-2">Current Phase</div>
          <div class="text-center">Registered (WIB)</div>
          <div class="text-center">Elapsed</div>
          <div class="text-center">Action</div>
        </div>
        
        <transition-group name="list" tag="div" class="relative z-10 w-full min-w-[980px] border border-slate-200/80 bg-white rounded-b-xl shadow-xs overflow-hidden">
          <div v-for="(truck, i) in paginatedRegisteredTrucks" :key="truck.id"
            class="group relative bg-white hover:bg-slate-50/80 border-b border-slate-100 last:border-b-0 transition-colors duration-150 flex flex-wrap md:grid md:grid-cols-[165px_minmax(180px,1.4fr)_80px_minmax(180px,1.2fr)_165px_95px_70px] items-center px-6 py-3.5 gap-y-2 md:gap-y-0"
          >
            <!-- COL 1: Plate Number (Clean Badge) & Arrival Sequence -->
            <div class="w-full md:w-auto flex items-center space-x-2">
              <span v-if="truck.dailySequence" class="px-1.5 py-0.5 rounded text-[11px] font-semibold font-sans bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0 tabular-nums">
                #{{ String(truck.dailySequence).padStart(3, '0') }}
              </span>
              <div class="h-7.5 px-2.5 bg-slate-50 border border-slate-300/80 rounded-md flex items-center justify-center text-slate-800 font-sans font-bold text-xs tracking-wider shadow-2xs group-hover:border-slate-400 group-hover:bg-white transition-colors whitespace-nowrap">
                {{ getPlateNumber(truck) }}
              </div>
            </div>

            <!-- COL 2: Vendor & Driver / Cargo -->
            <div class="w-full md:w-auto min-w-0 px-2">
              <span class="font-semibold text-slate-800 text-xs leading-snug block truncate" :title="getDisplayVendor(truck)">
                {{ getDisplayVendor(truck) }}
              </span>
              <span v-if="getDriver(truck)" class="text-[11px] text-slate-500 font-normal leading-tight block truncate mt-0.5" :title="getDriver(truck)">
                Supir: {{ getDriver(truck) }}
              </span>
              <span v-else-if="getCargoDescription(truck) && getCargoDescription(truck) !== getDisplayVendor(truck)" class="text-[11px] text-slate-500 font-normal leading-tight block truncate mt-0.5" :title="getCargoDescription(truck)">
                Muatan: {{ getCargoDescription(truck) }}
              </span>
            </div>

            <!-- COL 3: Warehouse Pill -->
            <div class="w-auto md:w-auto flex justify-center">
              <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border shadow-2xs"
                   :class="getProcessType(truck) === 'GBB' ? 'bg-pink-50 text-pink-700 border-pink-200/70' : getProcessType(truck) === 'GBJ' ? 'bg-blue-50 text-blue-700 border-blue-200/70' : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'">
                {{ getProcessType(truck) }}
              </span>
            </div>

            <!-- COL 4: Current Phase / Status -->
            <div class="w-full md:w-auto min-w-0 px-2 flex items-center">
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-2xs max-w-full"
                   :class="getStatusBadgeClass(truck.status)">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="getStatusDotClass(truck.status)"></span>
                <span class="truncate">{{ getStepLabel(truck) }}</span>
              </div>
            </div>

            <!-- COL 5: Registered (WIB) -->
            <div class="w-auto md:w-auto text-center font-sans text-xs text-slate-600 font-medium tabular-nums">
              {{ formatPlantDateTime(getEntryTimestamp(truck)) }}
            </div>

            <!-- COL 6: Elapsed Duration -->
            <div class="w-auto md:w-auto flex justify-center">
              <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100/70 text-slate-600 text-xs font-medium font-sans tabular-nums border border-slate-200/60 shadow-2xs">
                <span class="material-icons text-[14px] text-slate-400">schedule</span>
                <span>{{ calculateDuration(getEntryTimestamp(truck)) }}</span>
              </div>
            </div>

            <!-- COL 7: Action Icons -->
            <div class="w-full md:w-auto flex items-center justify-end md:justify-center gap-1">
              <button v-if="truck.status === 'REGISTERED'" @click="cancelRegistration(truck)" class="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 border border-transparent transition-all duration-150" title="Cancel Registration">
                <span class="material-icons text-[18px]">cancel</span>
              </button>
              <button @click="viewDetails(truck)" class="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-[#4A8BDF] hover:border-blue-200 border border-transparent transition-all duration-150" title="View Details">
                <span class="material-icons text-[18px]">visibility</span>
              </button>
            </div>
          </div>
          
          <div v-if="filteredTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-24 relative">
            <div class="relative mb-4">
              <div class="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-xs">
                <span class="material-icons text-slate-300 text-4xl">cloud_queue</span>
              </div>
              <div class="absolute -right-2 -bottom-2 w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center animate-pulse border border-blue-100">
                <span class="material-icons text-[#4A8BDF] text-base">radar</span>
              </div>
            </div>
            <p class="text-xs font-semibold text-slate-500 tracking-wider uppercase">Tidak ada pendaftaran aktif</p>
            <p class="text-xs text-slate-400 mt-1">Memindai kedatangan truk di gerbang security...</p>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import TruckForm from '../components/TruckForm.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'
import Pagination from '../components/Pagination.vue'
import { formatPlantDate, formatPlantDateTime } from '../utils/displayTime'
import { getStatusLabel } from '../utils/statusLabel'

const truckStore = useTruckStore()
const toast = useToast()
const { confirm } = useConfirm()

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[GateCheckIn] Mount-time fetch failed, using store cache:', err.message)
  }
})

const isModalOpen = ref(false)
const showDetailsModal = ref(false)
const selectedTruck = ref(null)
const currentPage = ref(1)
const searchQuery = ref('')
const registeredTrucks = computed(() => [...truckStore.activeTrucks].reverse())
const filteredTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  if (!keyword) return registeredTrucks.value
  return registeredTrucks.value.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
})
const totalPages = computed(() => Math.ceil(filteredTrucks.value.length / 10) || 1)
const paginatedRegisteredTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredTrucks.value.slice(start, end)
})

watch(filteredTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })

const getPlateNumber = (truck) => {
  if (!truck) return '-'
  return truck.plateNumber || truck.vehicle?.plateNumber || truck.licensePlate || '-'
}

const getVendor = (truck) => {
  if (!truck) return '-'
  return truck.vendorName || truck.vendor || truck.vehicle?.companyName || truck.companyName || truck.cargo?.supplierOrCustomer || '-'
}

const getDisplayVendor = (truck) => {
  const v = getVendor(truck)
  return v !== '-' ? v : getPlateNumber(truck)
}

const getProcessType = (truck) => {
  if (!truck) return '-'
  return truck.processType || truck.destination?.warehouseCode || truck.warehouseCode || truck.destination || '-'
}

const getStepLabel = (truck) => {
  if (!truck) return '-'
  return getStatusLabel(truck.step || truck.status, getProcessType(truck)).toUpperCase()
}

const getEntryTimestamp = (truck) => {
  if (!truck) return null
  return truck.timestamps?.entry || truck.timestamps?.gateInAt || truck.gateInAt || truck.createdAt || null
}

const getDriver = (truck) => {
  if (!truck) return ''
  return truck.driverName || truck.driver?.name || truck.driver || ''
}

const getCargoDescription = (truck) => {
  if (!truck) return ''
  return truck.cargoSubType || truck.cargoType || truck.cargo?.type || ''
}

const getStatusBadgeClass = (status) => {
  if (!status) return 'bg-slate-50 text-slate-700 border-slate-200/80'
  const s = String(status).toUpperCase()
  if (s.includes('PENDING')) {
    return 'bg-amber-50 text-amber-700 border-amber-200/80'
  }
  if (s.includes('PASSED') || s.includes('COMPLETED') || s.includes('DONE')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
  }
  if (s.includes('REJECTED') || s.includes('CANCELLED')) {
    return 'bg-rose-50 text-rose-700 border-rose-200/80'
  }
  return 'bg-blue-50 text-blue-700 border-blue-200/80'
}

const getStatusDotClass = (status) => {
  if (!status) return 'bg-slate-400'
  const s = String(status).toUpperCase()
  if (s.includes('PENDING')) return 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
  if (s.includes('PASSED') || s.includes('COMPLETED') || s.includes('DONE')) return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
  if (s.includes('REJECTED') || s.includes('CANCELLED')) return 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
  return 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]'
}

const openModal = () => { isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false }
const isSubmitting = ref(false)
const handleTruckSubmit = async (truckData) => { 
  if (isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    await truckStore.addTruck(truckData); 
    closeModal(); 
    toast.success(`Truck ${truckData.plateNumber} registered successfully!`);
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message || 'Failed to register truck';
    toast.error(errorMsg);
  } finally {
    isSubmitting.value = false;
  }
}
const calculateDuration = (isoString) => {
  if (!isoString) return '-';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000));
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}
const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
const cancelRegistration = async (truck) => {
  const plate = getPlateNumber(truck)
  const ok = await confirm({
    title: 'Cancel Registration?',
    message: `Are you sure you want to cancel registration for truck ${plate}? This action is permanent and will remove it from active operations.`,
    type: 'danger',
    confirmText: 'Yes, Cancel'
  })
  if (ok) {
    try {
      await truckStore.cancelTruck(truck.id, 'Cancelled by Security Officer')
    } catch (e) {
      toast.error('Failed to cancel truck registration.')
    }
  }
}
</script>

