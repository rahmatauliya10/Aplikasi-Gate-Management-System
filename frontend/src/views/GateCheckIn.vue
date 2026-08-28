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
      
      <div class="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 relative custom-scrollbar">
        <!-- Modern Grid Background -->
        <div class="absolute inset-0 pointer-events-none opacity-[0.03]" 
          style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
        
        <!-- Table Header (Hidden on Mobile) -->
        <div class="relative z-10 hidden md:flex items-center px-6 py-4 bg-[#f8fafc] text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] w-full border border-slate-100 border-b-0 rounded-t-xl shadow-sm">
          <div class="w-[130px] shrink-0">PLATE NO</div>
          <div class="flex-[2] min-w-0 px-3">VENDOR</div>
          <div class="w-[70px] shrink-0 text-center">WHSE</div>
          <div class="flex-[2] min-w-0 px-3">CURRENT PHASE</div>
          <div class="w-[90px] shrink-0 text-center">ARRIVED</div>
          <div class="w-[100px] shrink-0 text-center">ELAPSED</div>
          <div class="w-[50px] shrink-0 text-center">VIEW</div>
        </div>
        
        <transition-group name="list" tag="div" class="relative z-10 w-full border border-slate-100 bg-white rounded-b-xl shadow-sm">
          <div v-for="(truck, i) in paginatedRegisteredTrucks" :key="truck.id"
            class="group relative bg-white hover:bg-slate-50/80 border-b border-slate-100/80 last:border-b-0 first:rounded-t-none last:rounded-b-xl transition-all duration-200 flex flex-wrap md:flex-nowrap items-center px-6 py-4 md:py-3.5"
          >
            <!-- COL 1: Plate Number (Clean Box) -->
            <div class="w-full md:w-[130px] shrink-0 flex items-center">
              <div class="h-8 bg-slate-100/90 border border-slate-200 rounded-lg flex items-center justify-center text-slate-800 font-mono font-bold text-[11px] shadow-2xs tracking-wider px-2.5 whitespace-nowrap group-hover:border-slate-300 group-hover:bg-slate-100 transition-colors">
                {{ getPlateNumber(truck) }}
              </div>
            </div>

            <!-- COL 2: Vendor (Plain text) -->
            <div class="flex-[2] min-w-0 px-3">
              <span class="font-bold text-slate-800 text-[13px] leading-tight block truncate" :title="getVendor(truck)">
                {{ getDisplayVendor(truck).length > 40 ? getDisplayVendor(truck).substring(0, 40) + '...' : getDisplayVendor(truck) }}
              </span>
            </div>

            <!-- COL 3: Process Pill -->
            <div class="w-auto md:w-[70px] shrink-0 flex justify-center">
              <span class="inline-flex items-center justify-center w-[46px] py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                   :class="getProcessType(truck) === 'GBB' ? 'bg-[#FDF2F8] text-[#A0006D]' : getProcessType(truck) === 'GBJ' ? 'bg-[#EFF6FF] text-[#3A6ABF]' : 'bg-emerald-50 text-emerald-600'">
                {{ getProcessType(truck) }}
              </span>
            </div>

            <!-- COL 4: Status / Stage -->
            <div class="w-full md:w-auto flex-[2] min-w-0 flex items-center px-3">
              <div class="w-2 h-2 rounded-full mr-2.5 shrink-0" :class="truck.status.includes('PENDING') ? 'bg-[#F97316] shadow-[0_0_6px_rgba(249,115,22,0.5)]' : truck.status.includes('PASSED') ? 'bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.5)]' : truck.status.includes('REJECTED') ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]' : 'bg-[#4A8BDF] shadow-[0_0_6px_rgba(74,139,223,0.5)]'"></div>
              <span class="text-[11px] font-black uppercase tracking-[0.06em] truncate" 
                    :class="truck.status.includes('PENDING') ? 'text-[#F97316]' : truck.status.includes('PASSED') ? 'text-[#10B981]' : truck.status.includes('REJECTED') ? 'text-red-500' : 'text-slate-600'">
                {{ getStepLabel(truck) }}
              </span>
            </div>

            <!-- COL 5: Time -->
            <div class="w-auto md:w-[90px] shrink-0 text-center">
              <span class="text-[12px] font-mono text-slate-500 font-semibold tracking-tight">{{ formatTime(getEntryTimestamp(truck)) }}</span>
            </div>

            <!-- COL 6: Duration -->
            <div class="w-auto md:w-[100px] shrink-0 flex items-center justify-center gap-1.5 text-slate-400">
              <span class="material-icons text-[14px]">schedule</span>
              <span class="text-[11px] font-mono font-semibold">{{ calculateDuration(getEntryTimestamp(truck)) }}</span>
            </div>

            <!-- COL 7: Action Icon -->
            <div class="w-full md:w-[50px] shrink-0 flex items-center justify-end md:justify-center gap-1">
              <button v-if="truck.status === 'REGISTERED'" @click="cancelRegistration(truck)" class="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all duration-200" title="Cancel Registration">
                <span class="material-icons text-[17px]">cancel</span>
              </button>
              <button @click="viewDetails(truck)" class="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:bg-[#E6F0FA] hover:text-[#4A8BDF] transition-all duration-200" title="View Details">
                <span class="material-icons text-[17px]">visibility</span>
              </button>
            </div>
          </div>
          
          <div v-if="filteredTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative">
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
import { ref, computed, watch, onMounted } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import TruckForm from '../components/TruckForm.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'
import Pagination from '../components/Pagination.vue'

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
  let step = truck.step || truck.status || '-'
  const pType = getProcessType(truck)
  if ((pType === 'GBB' || pType === 'GSP') && String(step).startsWith('QC_VEHICLE')) {
    step = String(step).replace('QC_VEHICLE', 'QC_SAMPLING')
  }
  return String(step).replace(/_/g, ' ').toUpperCase()
}

const getEntryTimestamp = (truck) => {
  if (!truck) return null
  return truck.timestamps?.entry || truck.timestamps?.gateInAt || truck.gateInAt || truck.createdAt || null
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
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const calculateDuration = (isoString) => {
  if (!isoString) return '-';
  const diff = Math.floor((new Date() - new Date(isoString)) / 60000);
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

