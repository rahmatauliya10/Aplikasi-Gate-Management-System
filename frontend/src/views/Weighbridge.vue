<template>
  <div class="space-y-6">
    <PageHeader title="Weighbridge Operations" subtitle="Scale Management Console" />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div v-for="row in truckInfoRows" :key="row.label" 
                class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(74,139,223,0.08)] transition-all duration-300 backdrop-blur-sm"
                :class="row.label === 'Plate Number' ? 'col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 border-none' : ''">
                <span class="text-[9px] font-black uppercase tracking-[0.15em] mb-1.5"
                  :class="row.label === 'Plate Number' ? 'text-[#4A8BDF]' : 'text-slate-600'">{{ row.label }}</span>
                <span class="text-sm font-black truncate" :class="row.cls || (row.label === 'Plate Number' ? 'text-[#4A8BDF]' : 'text-slate-800')" :style="row.style || ''">{{ row.value }}</span>
              </div>
            </div>
            
            <div class="mt-6 relative z-10">
              <button @click="showDetailsModal = true" class="relative w-full overflow-hidden flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl transition-all duration-300 text-xs font-black uppercase tracking-widest text-indigo-600 bg-[#E6F0FA] border border-[#CCE0F5] hover:border-indigo-300 hover:shadow-[0_4px_20px_rgba(74,139,223,0.2)] group">
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-200/50 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                <span class="material-icons text-[18px]">travel_explore</span>
                <span>VIEW FULL ANALYSIS</span>
              </button>
            </div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9">
              <StepTimeline :current-step="selectedTruck?.status || selectedTruck?.step || '-'" :process-type="getProcessType(selectedTruck)" />
            </div>
          </div>
          <WeightInput :label="weighingLabel" :previous-weight="previousWeight" :is-submitting="isProcessing" @save="handleWeightSubmit" />
          <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
        </div>

        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
           <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(74,139,223,0.06),rgba(160,0,109,0.03));border:1px solid rgba(74,139,223,0.1)">
              <span class="material-icons text-slate-600 text-3xl">scale</span>
            </div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start weighing</p>
          </div>
        </div>
      </transition>

      <div class="lg:col-span-1">
        <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
          <!-- Glossy Overlay -->
          <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
          
          <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 z-10 relative">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">scale</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">Weighbridge Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-nowrap items-center gap-2 sm:gap-3 shrink min-w-0 overflow-x-auto hide-scrollbar pb-1 -mb-1">
              <div class="relative shrink-0 w-[140px] sm:w-[160px]">
                <input v-model="searchQuery" type="text" placeholder="Search Truck" class="w-full h-10 pl-9 sm:pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm">
                <span class="material-icons absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  <span class="material-icons text-[16px]">close</span>
                </button>
              </div>
              <div class="relative shrink-0 w-[140px] sm:w-[160px]">
                <select v-model="filterStatus" class="w-full h-10 pl-3 sm:pl-4 pr-8 sm:pr-10 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm appearance-none cursor-pointer">
                  <option value="ALL">All Status</option>
                  <option value="REGISTERED">Registered</option>
                  <option value="INCOMING_CHECK_PASSED">Incoming Check Passed</option>
                  <option value="INCOMING_CHECK_REJECTED">Incoming Check Rejected</option>
                  <option value="WAREHOUSE_DONE">Warehouse Done</option>
                  <option value="QC_VEHICLE_REJECTED">QC Vehicle Rejected</option>
                </select>
                <span class="material-icons absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">filter_list</span>
              </div>
              <div class="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 h-10 rounded-xl bg-white shadow-sm border border-slate-100 shrink-0 whitespace-nowrap">
                <div class="relative">
                  <span class="block w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#4A8BDF]"></span>
                  <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
                </div>
                <span class="text-xs sm:text-sm font-bold text-slate-700 tracking-wide">{{ filteredQueueTrucks.length }} PENDING</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <!-- Background Decoration -->
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedQueueTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <!-- Glowing Accent Line -->
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300"
                  :style="{ backgroundColor: getProcessType(truck) === 'GBB' ? '#800057' : getProcessType(truck) === 'GBJ' ? '#4A8BDF' : '#3A6ABF', opacity: selectedTruck?.id === truck.id ? '1' : '0.5' }"></div>
                
                <div class="flex justify-between items-start pl-3">
                  <div>
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{{ getStepLabel(truck) }}</div>
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ getPlateNumber(truck) }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest"
                    :style="{ 
                      backgroundColor: getProcessType(truck) === 'GBB' ? 'rgba(160,0,109,0.1)' : getProcessType(truck) === 'GBJ' ? 'rgba(74,139,223,0.1)' : 'rgba(74,139,223,0.1)',
                      color: getProcessType(truck) === 'GBB' ? '#A0006D' : getProcessType(truck) === 'GBJ' ? '#3A6ABF' : '#4A8BDF'
                    }">
                    {{ getProcessType(truck) }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-1.5 text-slate-700">
                    <span class="material-icons text-[14px]">local_shipping</span>
                    <span class="text-xs font-bold">{{ truck.vehicleType || 'Truck' }}</span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#4A8BDF] text-white shadow-[0_4px_12px_rgba(74,139,223,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-[#E6F0FA] group-hover:text-indigo-600'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredQueueTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
                <div class="relative mb-6">
                  <div class="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center animate-gentle-float border border-slate-100">
                    <span class="material-icons text-slate-300 text-5xl">cloud_queue</span>
                  </div>
                  <div class="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-[#E6F0FA] flex items-center justify-center animate-pulse">
                    <span class="material-icons text-[#4A8BDF] text-xl">radar</span>
                  </div>
                </div>
                <p class="text-base font-black text-slate-400 tracking-[0.3em] uppercase">No pending trucks</p>
                <p class="text-xs font-bold text-slate-400 mt-2 italic">Scanning for incoming trucks...</p>
              </div>
            </transition-group>
          </div>
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredQueueTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredQueueTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useWeighbridgeStore } from '../stores/weighbridgeStore'
import { useToast } from '../composables/useToast'
import StatusBadge from '../components/StatusBadge.vue'
import PageHeader from '../components/PageHeader.vue'
import StepTimeline from '../components/StepTimeline.vue'
import WeightInput from '../components/WeightInput.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

const router = useRouter()
const truckStore = useTruckStore()
const weighbridgeStore = useWeighbridgeStore()
const toast = useToast()
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const filterStatus = ref('ALL')
const isProcessing = ref(false)

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[Weighbridge] Mount-time fetch failed:', err.message)
  }
})

const getPlateNumber = (truck) => {
  if (!truck) return '-'
  return truck.plateNumber || truck.vehicle?.plateNumber || truck.licensePlate || '-'
}

const getVendor = (truck) => {
  if (!truck) return '-'
  return truck.vendorName || truck.vendor || truck.vehicle?.companyName || truck.companyName || truck.cargo?.supplierOrCustomer || '-'
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

const queueTrucks = computed(() => {
  return truckStore.trucks.filter(t => {
    const process = getProcessType(t);
    // Timbang Pertama (Gross atau Tare awal)
    if (t.status === 'REGISTERED') return true;
    
    // Timbang Kedua untuk GBJ (Selesai Loading ATAU QC Ditolak)
    if (process === 'GBJ') {
      return t.status === 'WAREHOUSE_DONE' || t.status === 'QC_VEHICLE_REJECTED';
    }
    
    // Timbang Kedua untuk GBB (Lolos Inspeksi ATAU Inspeksi Ditolak ATAU Sampling Ditolak ATAU Bongkar Selesai)
    if (process === 'GBB') {
      return t.status === 'INCOMING_CHECK_PASSED' || t.status === 'INCOMING_CHECK_REJECTED' || t.status === 'QC_VEHICLE_REJECTED' || t.status === 'WAREHOUSE_DONE';
    }
    
    // Timbang Kedua untuk GSP (Lolos Inspeksi ATAU Inspeksi Ditolak ATAU Sampling Ditolak ATAU Bongkar Selesai)
    if (process === 'GSP') {
      return t.status === 'INCOMING_CHECK_PASSED' || t.status === 'INCOMING_CHECK_REJECTED' || t.status === 'QC_VEHICLE_REJECTED' || t.status === 'WAREHOUSE_DONE';
    }
    
    return false;
  });
});
const filteredQueueTrucks = computed(() => {
  let list = queueTrucks.value
  
  if (filterStatus.value !== 'ALL') {
    list = list.filter(t => t.status === filterStatus.value)
  }
  
  const keyword = searchQuery.value.toLowerCase().trim()
  if (keyword) {
    list = list.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
  }
  
  return list
})

const totalPages = computed(() => Math.ceil(filteredQueueTrucks.value.length / 10) || 1)

const paginatedQueueTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredQueueTrucks.value.slice(start, end)
})

watch(filteredQueueTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })

const formatTime = (ts) => {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const truckInfoRows = computed(() => {
  if (!selectedTruck.value) return []
  const t = selectedTruck.value
  return [
    { label: 'Plate Number', value: getPlateNumber(t), cls: 'text-[#4A8BDF] font-mono text-lg tracking-widest drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' },
    { label: 'Driver', value: t.driverName || '-' },
    { label: 'Vendor', value: getVendor(t), cls: 'text-slate-700' },
    { label: 'Process', value: getProcessType(t), style: getProcessType(t)==='GBB'?'color:#A0006D':getProcessType(t)==='GBJ'?'color: #4A8BDF':'color: #4A8BDF' },
    { label: 'Current Step', value: getStepLabel(t), cls: 'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600' },
    { label: 'Arrival Time', value: formatTime(getEntryTimestamp(t)), last: true },
  ]
})



const weighLabelMap = {
  GBB: { 
    REGISTERED: 'Gross Weight (First Weighing)', 
    INCOMING_CHECK_PASSED: 'Tare Weight (Second Weighing)',
    INCOMING_CHECK_REJECTED: 'Tare Weight (Second Weighing)',
    QC_VEHICLE_REJECTED: 'Tare Weight (Second Weighing)',
    WAREHOUSE_DONE: 'Tare Weight (Second Weighing)'
  },
  GBJ: { 
    REGISTERED: 'Tare Weight (First Weighing)', 
    WAREHOUSE_DONE: 'Gross Weight (Second Weighing)',
    QC_VEHICLE_REJECTED: 'Gross Weight (Second Weighing)'
  },
  GSP: { 
    REGISTERED: 'Gross Weight (First Weighing)', 
    INCOMING_CHECK_PASSED: 'Tare Weight (Second Weighing)',
    INCOMING_CHECK_REJECTED: 'Tare Weight (Second Weighing)',
    WAREHOUSE_DONE: 'Tare Weight (Second Weighing)',
    QC_VEHICLE_REJECTED: 'Tare Weight (Second Weighing)'
  }
}
const weighingLabel = computed(() => {
  if (!selectedTruck.value) return 'Weighing Input'
  const pt = getProcessType(selectedTruck.value)
  const status = selectedTruck.value.status
  return weighLabelMap[pt]?.[status] || 'Weighing Input'
})
const previousWeight = computed(() => {
  if (!selectedTruck.value || selectedTruck.value.status === 'REGISTERED') return null
  const t = selectedTruck.value
  const pt = getProcessType(t)
  const inRecord = t.weighbridgeRecords?.find?.(r => r.type === 'IN')
  if (pt === 'GBB' || pt === 'GSP') {
    return t.grossWeight ?? inRecord?.weight ?? t.weights?.gross ?? null
  }
  return t.tareWeight ?? inRecord?.weight ?? t.weights?.tare ?? null
})

const selectTruck = (truck) => { selectedTruck.value = truck }
const handleWeightSubmit = async (weight) => {
  if (!selectedTruck.value || isProcessing.value) return
  isProcessing.value = true
  const truck = selectedTruck.value
  const isFirst = truck.status === 'REGISTERED'
  const pType = getProcessType(truck)
  
  try {
    if (pType === 'GBB' || pType === 'GSP') {
      if (isFirst) { 
        const response = await weighbridgeStore.submitWeighIn(truck.id, { weight })
        const updatedTruck = response?.data || response;
        if (updatedTruck) truckStore.upsertTruck(updatedTruck);
        toast.success(`Gross Weight Saved: ${weight} kg. Proceed to ${pType}.`) 
      } else { 
        const response = await weighbridgeStore.submitWeighOut(truck.id, { weight })
        const updatedTruck = response?.data || response;
        if (updatedTruck) truckStore.upsertTruck(updatedTruck);
        toast.success(`Tare Weight Saved: ${weight} kg. Proceed to Gate Out.`); selectedTruck.value = null; return 
      }
    } else {
      if (isFirst) { 
        const response = await weighbridgeStore.submitWeighIn(truck.id, { weight })
        const updatedTruck = response?.data || response;
        if (updatedTruck) truckStore.upsertTruck(updatedTruck);
        toast.success(`Tare Weight Saved: ${weight} kg. Proceed to QC.`) 
      } else { 
        const response = await weighbridgeStore.submitWeighOut(truck.id, { weight })
        const updatedTruck = response?.data || response;
        if (updatedTruck) truckStore.upsertTruck(updatedTruck);
        toast.success(`Gross Weight Saved: ${weight} kg. Proceed to Gate Out.`); selectedTruck.value = null; return 
      }
    }
    selectedTruck.value = null
  } catch (error) {
    // error handled by store
  } finally {
    isProcessing.value = false
  }
}
</script>

