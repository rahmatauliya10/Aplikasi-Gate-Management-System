<template>
  <div class="space-y-6">
    <PageHeader title="Rekap Transaksi (History)" subtitle="Analytics & Reconciliation" :showBadge="false">
      <button @click="exportData" class="btn-primary px-6 py-2.5 text-xs">
        <span class="material-icons text-lg">download</span><span class="font-black">Export CSV</span>
      </button>
    </PageHeader>

    <!-- Summary Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="ind-card p-5 cursor-default relative overflow-hidden animate-fadeInUp stagger-1" style="border-top:3px solid #94A3B8">
        <div class="absolute -right-2 -top-2 opacity-5"><span class="material-icons text-6xl">local_shipping</span></div>
        <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Total Completed</p>
        <p class="text-3xl font-black text-slate-900 mt-2 font-mono animate-number-pop">{{ completedTrucks.length }}</p>
      </div>
      <div class="ind-card p-5 cursor-default relative overflow-hidden animate-fadeInUp stagger-2" style="border-top:3px solid #800057">
        <div class="absolute -right-2 -top-2 opacity-5"><span class="material-icons text-6xl">inventory_2</span></div>
        <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Destination GBB</p>
        <p class="text-3xl font-black text-slate-900 mt-2 font-mono animate-number-pop stagger-1">{{ gbbCount }}</p>
      </div>
      <div class="ind-card p-5 cursor-default relative overflow-hidden animate-fadeInUp stagger-3" style="border-top:3px solid #4A8BDF">
        <div class="absolute -right-2 -top-2 opacity-5"><span class="material-icons text-6xl">warehouse</span></div>
        <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Destination GBJ</p>
        <p class="text-3xl font-black text-slate-900 mt-2 font-mono animate-number-pop stagger-2">{{ gbjCount }}</p>
      </div>
      <div class="ind-card p-5 cursor-default relative overflow-hidden animate-fadeInUp stagger-4" style="border-top:3px solid #3A6ABF">
        <div class="absolute -right-2 -top-2 opacity-5"><span class="material-icons text-6xl">precision_manufacturing</span></div>
        <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Destination GSP</p>
        <p class="text-3xl font-black text-slate-900 mt-2 font-mono animate-number-pop stagger-3">{{ gspCount }}</p>
      </div>
    </div>

    <!-- History Data Grid -->
    <div class="mt-6 ind-container overflow-hidden bg-slate-50 bg-opacity-60 backdrop-blur-xl border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
      <!-- Glossy Overlay -->
      <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/40 pointer-events-none"></div>

      <div class="px-5 sm:px-8 py-5 sm:py-6 bg-white/70 backdrop-blur-md border-b border-slate-100 flex flex-col md:flex-row md:justify-between md:items-center space-y-4 md:space-y-0 relative z-10 gap-4 md:gap-0">
        <div class="flex items-center space-x-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border shadow-inner group shrink-0" :class="currentMode === 'time' ? 'bg-indigo-50 border-indigo-100' : 'bg-red-50 border-red-100'">
            <span class="material-icons group-hover:scale-125 transition-transform duration-500 text-[20px] sm:text-[24px]" :class="currentMode === 'time' ? 'text-[#4A8BDF]' : 'text-red-500'">{{ currentMode === 'time' ? 'timer' : 'security' }}</span>
          </div>
          <div>
            <h3 v-if="currentMode === 'time'" class="text-base sm:text-xl font-black text-slate-800 tracking-tight leading-tight">Analisa Waktu &amp; Bottleneck</h3>
            <h3 v-else class="text-base sm:text-xl font-black text-slate-800 tracking-tight flex items-center flex-wrap leading-tight">Rekonsiliasi Berat &amp; Fraud Check
              <span class="ml-2 sm:ml-3 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest font-black" style="background:rgba(239,68,68,0.1);color:#EF4444">Beta</span>
            </h3>
            <div class="flex items-center mt-1 sm:mt-0.5 space-x-2">
              <span class="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical Data Analysis</span>
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
          <div class="flex items-center p-1.5 rounded-xl bg-slate-100/80 border border-slate-200/50 shadow-inner w-full sm:w-auto">
            <button @click="currentMode = 'time'" :class="currentMode === 'time' ? 'bg-white shadow-md text-[#4A8BDF] scale-105' : 'text-slate-600 hover:text-slate-800'" class="flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-300 flex items-center">
              <span class="material-icons text-[14px] sm:text-[16px] mr-1.5">schedule</span> Waktu
            </button>
            <button @click="currentMode = 'fraud'" :class="currentMode === 'fraud' ? 'bg-white shadow-md text-red-600 scale-105' : 'text-slate-600 hover:text-slate-800'" class="flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-300 flex items-center">
              <span class="material-icons text-[14px] sm:text-[16px] mr-1.5">policy</span> Integritas
            </button>
          </div>
        </div>
      </div>
      
      <div class="overflow-x-auto hide-scrollbar p-4 sm:p-6 relative z-10 w-full custom-scrollbar">
        <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
        <table class="w-full border-separate relative z-10 min-w-[900px]" style="border-spacing: 0 12px;">
          <thead>
            <tr>
              <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Vehicle ID</th>
              <template v-if="currentMode === 'time'">
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Registration</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Timb. In</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Warehouse</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">QC Check</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Timb. Out</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Total TAT</th>
              </template>
              <template v-else>
                <th class="px-6 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Net Weighbridge (kg)</th>
                <th class="px-6 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Actual Area Scale (kg)</th>
                <th class="px-6 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Weighbridge Deviation (%)</th>
                <th class="px-6 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Integrity Status</th>
              </template>
              <th class="px-6 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <transition-group name="list" tag="tbody">
            <tr v-for="(truck, i) in paginatedFilteredTrucks" :key="truck.id"
              class="group bg-white hover:bg-slate-50 transition-all duration-300 shadow-sm hover:shadow-md"
              :class="currentMode==='fraud'&&truck.fraud.status==='CRITICAL' ? 'shadow-[0_4px_15px_rgba(239,68,68,0.2)] border-red-200' : 'hover:-translate-y-0.5'">
              
              <!-- Floating Card Style Cells -->
              <td class="px-6 py-4 rounded-l-2xl border-y border-l" :class="currentMode==='fraud'&&truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100'">
                <div class="flex items-center space-x-3">
                  <div class="flex flex-col items-center justify-center bg-slate-900 px-3 py-1.5 rounded-lg shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-slate-700">
                    <span class="text-sm font-black text-[#4A8BDF] font-mono tracking-widest" style="text-shadow:0 0 8px rgba(255,255,255,0.4)">{{ truck.plateNumber }}</span>
                  </div>
                  <span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border" :style="truck.processType==='GBB'?'color:#A0006D;background:#FFFBEB;border-color:#FDE68A':truck.processType==='GBJ'?'color:#3A6ABF;background:#EEF2FF;border-color:#C7D2FE':'color: #4A8BDF;background:#ECFDF5;border-color:#A7F3D0'">{{ truck.processType }}</span>
                </div>
              </td>

              <template v-if="currentMode === 'time'">
                <td class="px-6 py-4 border-y border-slate-100 text-xs text-slate-700 font-medium">{{ formatTime(truck.timestamps.entry) }}</td>
                <td class="px-6 py-4 border-y border-slate-100 text-xs relative" :class="getHighlightClass(truck, 'waitingIn')">
                  <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full" :class="truck.bottleneck==='waitingIn'&&truck.durations.waitingIn>15?'bg-red-500':'bg-transparent'"></div>
                  <div class="flex flex-col"><span>{{ formatTime(truck.timestamps.weighbridge_in) }}</span><span class="font-black mt-1 text-sm" :class="truck.bottleneck==='waitingIn'&&truck.durations.waitingIn>15?'text-red-600 animate-pulse':'text-indigo-600'">{{ truck.durations.waitingIn }}m</span></div>
                </td>
                <td class="px-6 py-4 border-y border-slate-100 text-xs relative" :class="getHighlightClass(truck, 'warehouse')">
                  <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full" :class="truck.bottleneck==='warehouse'&&truck.durations.warehouse>15?'bg-red-500':'bg-transparent'"></div>
                  <div class="flex flex-col"><span>{{ formatTime(truck.timestamps.warehouse_end) }}</span><span class="font-black mt-1 text-sm" :class="truck.bottleneck==='warehouse'&&truck.durations.warehouse>15?'text-red-600 animate-pulse':'text-orange-600'">{{ truck.durations.warehouse }}m</span></div>
                </td>
                <td class="px-6 py-4 border-y border-slate-100 text-xs relative" :class="getHighlightClass(truck, 'qc')">
                  <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full" :class="truck.bottleneck==='qc'&&truck.durations.qc>15?'bg-red-500':'bg-transparent'"></div>
                  <div class="flex flex-col"><span>{{ formatTime(truck.timestamps.qc_end) }}</span><span class="font-black mt-1 text-sm" :class="truck.bottleneck==='qc'&&truck.durations.qc>15?'text-red-600 animate-pulse':'text-blue-600'">{{ truck.durations.qc }}m</span></div>
                </td>
                <td class="px-6 py-4 border-y border-slate-100 text-xs relative" :class="getHighlightClass(truck, 'waitingOut')">
                  <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full" :class="truck.bottleneck==='waitingOut'&&truck.durations.waitingOut>15?'bg-red-500':'bg-transparent'"></div>
                  <div class="flex flex-col"><span>{{ formatTime(truck.timestamps.weighbridge_out) }}</span><span class="font-black mt-1 text-sm" :class="truck.bottleneck==='waitingOut'&&truck.durations.waitingOut>15?'text-red-600 animate-pulse':'text-indigo-600'">{{ truck.durations.waitingOut }}m</span></div>
                </td>
                <td class="px-6 py-4 border-y border-slate-100">
                  <div class="inline-flex items-center px-3 py-1.5 rounded-xl border" :class="truck.durations.total>120?'bg-red-50 border-red-200 text-red-600':'bg-slate-50 border-slate-200 text-slate-800'">
                    <span class="text-lg font-black font-mono">{{ truck.durations.total }}</span><span class="text-xs font-black opacity-60 ml-1 uppercase">min</span>
                  </div>
                </td>
              </template>

              <template v-else>
                <td class="px-6 py-4 border-y text-sm font-mono text-right font-black text-slate-700" :class="truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100'">{{ formatWeight(truck.fraud.net) }}</td>
                <td class="px-6 py-4 border-y text-sm font-mono text-right font-black" :class="[truck.fraud.roll>0?'text-slate-800':'text-slate-600', truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100']">{{ formatWeight(truck.fraud.roll) }}</td>
                <td class="px-6 py-4 border-y text-right" :class="truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100'">
                  <div class="flex flex-col items-end">
                    <span class="font-mono text-base font-black tracking-tight" :class="truck.fraud.status==='CRITICAL'?'text-red-600':truck.fraud.status==='WARNING'?'text-orange-600':'text-[#3A6ABF]'">{{ truck.fraud.ratioPercent.toFixed(2) }}%</span>
                    <div class="flex items-center mt-1 space-x-1">
                      <span class="material-icons text-[14px]" :class="truck.fraud.direction === '+' ? 'text-emerald-500' : truck.fraud.direction === '-' ? 'text-red-500' : 'text-slate-400'">{{ truck.fraud.direction === '+' ? 'arrow_upward' : truck.fraud.direction === '-' ? 'arrow_downward' : 'remove' }}</span>
                      <span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider" :class="truck.fraud.status==='CRITICAL'?'bg-red-100 text-red-700':truck.fraud.status==='WARNING'?'bg-orange-100 text-orange-700':'bg-emerald-100 text-emerald-700'">{{ truck.fraud.direction }}{{ truck.fraud.deviationPercent.toFixed(1) }}% deviation</span>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 border-y text-left" :class="truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100'">
                  <span v-if="truck.fraud.status==='CRITICAL'" class="inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider font-black text-white animate-pulse" style="background:linear-gradient(135deg,#DC2626,#EF4444);box-shadow:0 4px 15px rgba(220,38,38,0.4)"><span class="material-icons text-[16px] mr-1.5">warning</span> CRITICAL — INVESTIGATE</span>
                  <span v-else-if="truck.fraud.status==='WARNING'" class="inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider font-black text-white" style="background:linear-gradient(135deg,#A0006D,#800057);box-shadow:0 4px 15px rgba(217,119,6,0.3)"><span class="material-icons text-[16px] mr-1.5">error_outline</span> SHRINKAGE</span>
                  <span v-else-if="truck.fraud.status==='SAFE'" class="inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider font-black border border-emerald-200 bg-emerald-50 text-emerald-700"><span class="material-icons text-[16px] mr-1.5">verified</span> SAFE</span>
                  <span v-else class="inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider font-black bg-slate-100 text-slate-700">N/A</span>
                </td>
              </template>

              <td class="px-6 py-4 rounded-r-2xl border-y border-r text-right" :class="currentMode==='fraud'&&truck.fraud.status==='CRITICAL' ? 'border-red-200 bg-red-50/10' : 'border-slate-100'">
                <button @click="viewDetails(truck)" class="w-10 h-10 rounded-full flex items-center justify-center text-[#4A8BDF] bg-[#E6F0FA] border border-[#CCE0F5] hover:bg-[#4A8BDF] hover:text-[#4A8BDF] hover:shadow-[0_4px_12px_rgba(74,139,223,0.3)] transition-all ml-auto">
                  <span class="material-icons text-[18px]">travel_explore</span>
                </button>
              </td>
            </tr>
            <tr v-if="analyzedTrucks.length === 0" key="empty-history">
              <td :colspan="currentMode==='time'?8:6" class="px-6 py-24 text-center">
                <div class="flex flex-col items-center justify-center opacity-50">
                  <span class="material-icons text-5xl text-slate-600 mb-3">history</span>
                  <p class="text-sm font-black uppercase tracking-widest text-slate-600">No completed transactions found</p>
                </div>
              </td>
            </tr>
          </transition-group>
        </table>
      </div>
      <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredAnalyzedTrucks.length > 0">
        <Pagination :current-page="currentPage" :total-items="filteredAnalyzedTrucks.length" @update:current-page="currentPage = $event" />
      </div>
    </div>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'
import Pagination from '../components/Pagination.vue'
import { useToast } from '../composables/useToast'

const truckStore = useTruckStore()
const toast = useToast()
const currentMode = ref('time')
const showDetailsModal = ref(false)
const selectedTruck = ref({})
const searchQuery = ref('')

const completedTrucks = computed(() => [...truckStore.completedTrucks].sort((a, b) => new Date(b.timestamps.exit) - new Date(a.timestamps.exit)))

const currentPage = ref(1)
const analyzedTrucks = computed(() => completedTrucks.value.map(truck => {
  const durations = calculateDurations(truck)
  const bottleneck = Object.keys(durations).reduce((a, b) => (durations[a] > durations[b] && b !== 'total') ? a : b)
  const fraud = calculateFraudMetrics(truck)
  return { ...truck, durations, bottleneck, fraud }
}))
const filteredAnalyzedTrucks = computed(() => {
  if (!searchQuery.value) return analyzedTrucks.value
  return analyzedTrucks.value.filter(t => t.plateNumber.toLowerCase().includes(searchQuery.value.toLowerCase()))
})
const paginatedFilteredTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredAnalyzedTrucks.value.slice(start, end)
})
watch(searchQuery, () => { currentPage.value = 1 })

const calculateFraudMetrics = (truck) => {
  const net = truck.weights?.net || 0; const roll = truck.weights?.rollWeight || 0
  if (net === 0 || roll === 0) return { net, roll, diff: 0, ratioPercent: 0, deviationPercent: 0, direction: '=', status: 'NOT_RECORDED' }
  const ratioPercent = (roll / net) * 100
  const diff = roll - net
  const deviationPercent = Math.abs(100 - ratioPercent)
  const direction = diff > 0 ? '+' : diff < 0 ? '-' : '='
  let status = 'SAFE'; if (deviationPercent > 5) status = 'CRITICAL'; else if (deviationPercent > 2) status = 'WARNING'
  return { net, roll, diff: Math.abs(diff), ratioPercent, deviationPercent, direction, status }
}

const calculateDurations = (truck) => {
  const ts = truck.timestamps
  const getDiff = (s, e) => { if (!s || !e) return 0; return Math.round((new Date(e) - new Date(s)) / 60000) }
  return { waitingIn: getDiff(ts.entry, ts.weighbridge_in), warehouse: getDiff(ts.warehouse_start, ts.warehouse_end), qc: getDiff(ts.qc_start, ts.qc_end), waitingOut: getDiff(ts.qc_end, ts.weighbridge_out), total: getDiff(ts.entry, ts.exit) }
}

const getHighlightClass = (truck, stage) => {
  if (currentMode.value !== 'time') return 'text-slate-700 font-medium'
  if (truck.bottleneck === stage && truck.durations[stage] > 15) return 'bg-red-50/50'
  return 'text-slate-700 font-medium'
}

const formatWeight = (val) => { if (val === undefined || val === null) return '0'; return new Intl.NumberFormat('id-ID').format(val) }
const gbbCount = computed(() => completedTrucks.value.filter(t => t.processType === 'GBB').length)
const gbjCount = computed(() => completedTrucks.value.filter(t => t.processType === 'GBJ').length)
const gspCount = computed(() => completedTrucks.value.filter(t => t.processType === 'GSP').length)
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
const exportData = () => { toast.info('Exporting data to CSV...') }
</script>
