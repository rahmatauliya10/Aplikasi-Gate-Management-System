<template>
  <div class="space-y-8 pb-10">
    <!-- Header -->
    <PageHeader title="Intelligence Center" :subtitle="currentDate" />

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div class="ind-card p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-1 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-slate-300 opacity-40 group-hover:bg-[#4A8BDF] transition-colors"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-slate-100 text-slate-500 group-hover:bg-slate-200">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">local_shipping</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Area</span>
        </div>
        <div>
          <p class="text-4xl font-black text-slate-900 tracking-tighter font-mono animate-number-pop">{{ totalTrucks }}</p>
          <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Trucks Processed Today</p>
        </div>
      </div>

      <div class="ind-card p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-2 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#4A8BDF] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#4A8BDF]/10 text-[#4A8BDF]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">task_alt</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Completed</span>
        </div>
        <div>
          <p class="text-4xl font-black text-slate-900 tracking-tighter font-mono animate-number-pop stagger-1">{{ completedTruckCount }}</p>
          <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Successfully Exited</p>
        </div>
      </div>

      <div class="ind-card p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-3 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#A0006D] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#A0006D]/10 text-[#A0006D]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">speed</span>
          </div>
          <div class="text-right">
             <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block">Target TAT</span>
             <span class="text-xs font-bold text-[#A0006D] block font-mono">{{ targetTat }}m</span>
          </div>
        </div>
        <div>
           <p class="text-4xl font-black tracking-tighter font-mono" :class="avgTotalTAT > targetTat ? 'text-red-500' : 'text-slate-900'">{{ avgTotalTAT }}<span class="text-xl font-bold ml-1 text-slate-500">m</span></p>
          <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Turnaround Time</p>
        </div>
      </div>

      <div class="ind-card p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-4 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#4A8BDF] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="absolute -right-4 -bottom-4 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity"><span class="material-icons text-9xl text-[#4A8BDF]">radar</span></div>
        <div class="flex items-center justify-between mb-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#4A8BDF]/10 text-[#4A8BDF]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">factory</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active Inside</span>
        </div>
        <div class="relative z-10">
           <p class="text-4xl font-black text-[#4A8BDF] tracking-tighter font-mono animate-number-pop stagger-3">{{ activeTruckCount }}</p>
          <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Currently in Factory</p>
        </div>
      </div>
    </div>

    <!-- Analytics Dashboard Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      <!-- Fraud Monitor -->
      <div class="xl:col-span-2 space-y-6">
       <div class="rounded-2xl shadow-card overflow-hidden relative" style="background:white;border:1px solid #E8EEF7">
           <!-- Subtle Background Pattern -->
           <div class="absolute inset-0 pointer-events-none opacity-[0.015]" style="background-image: radial-gradient(#4A8BDF 1px, transparent 1px); background-size: 20px 20px;"></div>

           <!-- Header -->
           <div class="relative z-10 px-8 py-6 flex justify-between items-end" style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
             <div>
               <div class="flex items-center space-x-2 mb-1">
                 <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.12)">
                   <span class="material-icons text-red-400 text-lg">gavel</span>
                 </div>
                 <h2 class="text-lg font-black text-slate-900 tracking-tight">Monitor Selisih Timbangan</h2>
               </div>
               <p class="text-xs font-bold text-slate-500 ml-11">Pengecekan selisih real-time antara Jembatan Timbang dan Timbangan Area.</p>
             </div>
             <div class="text-right shrink-0">
               <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Batas Toleransi</span>
               <div class="px-3 py-1.5 rounded-lg text-xs font-black" style="background:rgba(239,68,68,0.06);color:#EF4444;border:1px solid rgba(239,68,68,0.12)">
                 &gt; {{ targetDeviation }}% Selisih
               </div>
             </div>
           </div>

           <div class="relative z-10 p-8">
             <!-- Deviation Stats -->
             <div class="grid grid-cols-3 gap-4 mb-8">
                <div v-for="type in ['GBB', 'GBJ', 'GSP']" :key="type" class="p-5 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md group"
                     :style="type === 'GBB' ? 'background:linear-gradient(135deg,#FFF7ED,#FFF1F2);border:1px solid #FDDCB5' : type === 'GBJ' ? 'background:linear-gradient(135deg,#EEF2FF,#F0F5FF);border:1px solid #C7D2FE' : 'background:linear-gradient(135deg,#ECFDF5,#F0FDF4);border:1px solid #A7F3D0'">
                  <span class="text-[10px] font-black uppercase tracking-widest block mb-3"
                        :class="type === 'GBB' ? 'text-amber-600' : type === 'GBJ' ? 'text-indigo-500' : 'text-emerald-600'">{{ type }} Selisih</span>
                  <div class="flex items-end justify-between">
                    <div>
                      <span class="text-3xl font-black font-mono tracking-tighter" :class="getDiscrepancyColor(getStatFor(type).avgDiscrepancy)">
                        {{ getStatFor(type).avgDiscrepancy.toFixed(2) }}%
                      </span>
                      <span class="text-[10px] text-slate-400 uppercase font-black ml-1">RATA-RATA</span>
                    </div>
                    <span class="material-icons text-3xl transition-transform duration-300 group-hover:scale-110"
                          :class="type === 'GBB' ? 'text-amber-200' : type === 'GBJ' ? 'text-indigo-200' : 'text-emerald-200'">{{ type === 'GBB' ? 'category' : type === 'GBJ' ? 'check_box' : 'science' }}</span>
                  </div>
                </div>
             </div>

             <!-- Alerts Table -->
             <div>
                <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest pl-3 mb-4 flex items-center" style="border-left:3px solid #EF4444">
                  Investigasi Aktif ({{ alertList.length }})
                </h3>
                <div v-if="alertList.length > 0" class="overflow-hidden rounded-xl relative" style="background:white;border:1px solid #E8EEF7">
                  <div class="absolute inset-0 pointer-events-none opacity-[0.08]" style="background-image: linear-gradient(#4A8BDF 1.5px, transparent 1.5px), linear-gradient(90deg, #4A8BDF 1.5px, transparent 1.5px); background-size: 30px 30px;"></div>
                  <table class="min-w-full relative z-10">
                    <thead>
                      <tr style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
                        <th v-for="h in ['Plat / ID','Gudang','Netto JT (kg)','Realisasi Area (kg)','Selisih']" :key="h"
                            class="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider"
                            :class="h==='Selisih'?'text-red-500 text-right':h.includes('(kg)')?'text-right text-slate-400':'text-slate-400'">{{ h }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="alert in alertList" :key="alert.id" class="transition-colors hover:bg-slate-50/60" style="border-top:1px solid #F1F5F9">
                        <td class="px-5 py-3.5 whitespace-nowrap">
                          <span class="text-xs font-black text-[#4A8BDF] bg-[#E6F0FA] px-2 py-1 rounded-lg">{{ alert.plate }}</span>
                        </td>
                        <td class="px-5 py-3.5 whitespace-nowrap">
                          <span class="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg"
                                :style="alert.type==='GBB'?'color:#A0006D;background:rgba(160,0,109,0.06)':alert.type==='GBJ'?'color:#4A8BDF;background:rgba(74,139,223,0.06)':'color:#059669;background:rgba(5,150,105,0.06)'">{{ alert.type }}</span>
                        </td>
                        <td class="px-5 py-3.5 whitespace-nowrap text-xs font-mono font-bold text-slate-600 text-right">{{ alert.net.toLocaleString() }}</td>
                        <td class="px-5 py-3.5 whitespace-nowrap text-xs font-mono font-bold text-slate-600 text-right">{{ alert.processed.toLocaleString() }}</td>
                        <td class="px-5 py-3.5 whitespace-nowrap text-right">
                           <span class="px-2.5 py-1 rounded-lg text-[11px] font-black font-mono" style="background:rgba(239,68,68,0.08);color:#EF4444;border:1px solid rgba(239,68,68,0.15)">
                             {{ alert.diffPercent }}%
                           </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="p-10 rounded-2xl text-center" style="background:#FAFBFF;border:1px dashed #D5DDE8">
                   <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style="background:rgba(74,139,223,0.06);border:1px solid rgba(74,139,223,0.1)">
                     <span class="material-icons text-[#4A8BDF] text-2xl">verified_user</span>
                   </div>
                   <p class="text-sm font-black text-slate-700">Tidak Ada Selisih Kritis Terdeteksi</p>
                   <p class="text-xs font-bold text-slate-400 mt-1">Semua data timbangan berada dalam batas toleransi aman.</p>
                </div>
             </div>
           </div>
        </div>
      </div>

      <!-- Bottlenecks -->
      <div class="xl:col-span-1">
        <div class="p-8 rounded-2xl shadow-card h-full flex flex-col" style="background:white;border:1px solid #E8EEF7">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="text-lg font-black text-slate-900 tracking-tight flex items-center"><span class="material-icons text-[#4A8BDF] mr-2 text-xl">model_training</span> Bottlenecks</h3>
              <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Global Process Times (AVG)</p>
            </div>
          </div>
          
          <div class="flex-1 flex flex-col justify-center space-y-6">
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">Gate → WB IN</span>
                <span class="text-lg font-black text-slate-800 font-mono">{{ avgStageTimes.waitingIn }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000 animate-fill" style="background:linear-gradient(90deg,#818CF8,#3A6ABF)" :style="{ width: Math.min(avgStageTimes.waitingIn * 5, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">Warehouse</span>
                <span class="text-lg font-black text-orange-600 font-mono">{{ avgStageTimes.warehouse }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000 animate-fill stagger-2" style="background:linear-gradient(90deg,#FBBF24,#A0006D)" :style="{ width: Math.min(avgStageTimes.warehouse * 2, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">QC Verify</span>
                <span class="text-lg font-black text-indigo-600 font-mono">{{ avgStageTimes.qc }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000" style="background:linear-gradient(90deg,#818CF8,#4338CA)" :style="{ width: Math.min(avgStageTimes.qc * 5, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">QC → Gate OUT</span>
                 <span class="text-lg font-black text-[#3A6ABF] font-mono">{{ avgStageTimes.waitingOut }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000" style="background:linear-gradient(90deg,#34D399,#4A8BDF)" :style="{ width: Math.min(avgStageTimes.waitingOut * 5, 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-2xl shadow-card overflow-hidden" style="background:white;border:1px solid #E8EEF7">
      <div class="px-8 py-6 flex justify-between items-center" style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
        <h3 class="text-lg font-black text-slate-900 tracking-tight flex items-center">
          <span class="material-icons text-[#4A8BDF] mr-2">precision_manufacturing</span> 
          Active Operations In-Progress
        </h3>
        <div class="flex items-center space-x-2">
          <span class="w-2 h-2 rounded-full bg-[#4A8BDF] animate-pulse"></span>
          <span class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-widest">{{ activeTruckCount }} Live</span>
        </div>
      </div>
      <div class="overflow-x-auto relative">
        <div class="absolute inset-0 pointer-events-none opacity-[0.08]" style="background-image: linear-gradient(#4A8BDF 1.5px, transparent 1.5px), linear-gradient(90deg, #4A8BDF 1.5px, transparent 1.5px); background-size: 30px 30px;"></div>
        <table class="min-w-full table-fixed relative z-10">
          <thead>
            <tr style="background:white;border-bottom:1px solid #F1F5F9">
              <th class="w-[15%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Plate No</th>
              <th class="w-[20%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Vendor / Transport</th>
              <th class="w-[12%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Warehouse</th>
              <th class="w-[18%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Phase</th>
              <th class="w-[13%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Arrived</th>
              <th class="w-[12%] px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Elapsed</th>
              <th class="w-[10%] px-8 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="truck in activeTrucks" :key="truck.id" class="transition-colors hover:bg-[#E6F0FA]/30 group">
              <td class="px-8 py-5 whitespace-nowrap">
                <div class="inline-flex items-center justify-center bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
                  <span class="text-xs font-black text-[#4A8BDF] font-mono tracking-widest">{{ truck.plateNumber }}</span>
                </div>
              </td>
              <td class="px-8 py-5 whitespace-nowrap">
                <div class="text-sm font-black text-slate-800 truncate">{{ truck.vendor }}</div>
              </td>
              <td class="px-8 py-5 whitespace-nowrap">
                <span class="px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest border"
                  :style="truck.processType==='GBB'?'color:#A0006D;background:rgba(160,0,109,0.05);border-color:rgba(160,0,109,0.1)':truck.processType==='GBJ'?'color: #4A8BDF;background:rgba(74,139,223,0.05);border-color:rgba(74,139,223,0.1)':'color: #4A8BDF;background:rgba(74,139,223,0.05);border-color:rgba(74,139,223,0.1)'">
                  {{ truck.processType }}
                </span>
              </td>
              <td class="px-8 py-5 whitespace-nowrap">
                <div class="flex items-center">
                  <div class="w-1.5 h-1.5 rounded-full bg-[#4A8BDF] animate-pulse mr-2"></div>
                  <span class="text-[10px] font-black text-slate-600 uppercase tracking-wider">{{ truck?.step ? truck.step.replace('_', ' ') : '-' }}</span>
                </div>
              </td>
              <td class="px-8 py-5 whitespace-nowrap text-xs font-bold text-slate-500 font-mono">{{ formatTime(truck?.timestamps?.entry) }}</td>
              <td class="px-8 py-5 whitespace-nowrap">
                <div class="text-xs font-black text-slate-700 font-mono flex items-center">
                  <span class="material-icons text-[14px] mr-1 text-slate-400">schedule</span>
                  {{ getDuration(truck?.timestamps?.entry) }}
                </div>
              </td>
              <td class="px-8 py-5 whitespace-nowrap text-right">
                 <button @click="viewDetails(truck)" class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 bg-white border border-[#4A8BDF]/20 text-[#4A8BDF] hover:bg-[#4A8BDF] hover:text-white hover:shadow-md">
                   Inspect
                 </button>
              </td>
            </tr>
            <tr v-if="activeTrucks.length === 0">
              <td colspan="7" class="px-8 py-24 text-center">
                 <div class="w-16 h-16 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                   <span class="material-icons text-slate-200 text-3xl">check_circle</span>
                 </div>
                 <p class="text-sm font-black text-slate-800 uppercase tracking-widest">Facility Clear</p>
                 <p class="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">No active trucks are currently in process.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useSettingsStore } from '../stores/settingsStore'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'

const truckStore = useTruckStore()
const settingsStore = useSettingsStore()
const showDetailsModal = ref(false)
const selectedTruck = ref(null)

const targetDeviation = computed(() => settingsStore.targetDeviation)
const targetTat = computed(() => settingsStore.targetTat)

const currentDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const activeTrucks = computed(() => truckStore.activeTrucks)
const totalTrucks = computed(() => truckStore.trucks.length)
const activeTruckCount = computed(() => activeTrucks.value.length)
const completedTrucks = computed(() => truckStore.completedTrucks)
const completedTruckCount = computed(() => completedTrucks.value.length)

const statsData = computed(() => {
  let alerts = []; let stats = { GBB: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 }, GBJ: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 }, GSP: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 } }
  completedTrucks.value.forEach(t => {
      const net = t?.weights?.net || 0; const processed = t?.weights?.rollWeight || 0; const type = t?.processType || 'UNKNOWN'
      if (net > 0 && processed > 0 && stats[type]) {
          stats[type].totalNet += net; stats[type].totalProcessed += processed
          const ratioPercent = (processed / net) * 100; const deviationPercent = Math.abs(100 - ratioPercent)
          if (deviationPercent > targetDeviation.value) alerts.push({ id: t.id, plate: t.plateNumber, type: type, net, processed, diffPercent: deviationPercent.toFixed(2) })
      }
  })
  ;['GBB', 'GBJ', 'GSP'].forEach(type => { if (stats[type].totalNet > 0) { const ratio = (stats[type].totalProcessed / stats[type].totalNet) * 100; stats[type].avgDiscrepancy = Math.abs(100 - ratio) } })
  return { alerts, stats }
})

const alertList = computed(() => statsData.value?.alerts || [])
const defaultStat = { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 }
const getStatFor = (type) => statsData.value?.stats?.[type] || defaultStat
const getDiscrepancyColor = (val) => { if (!val || val === 0) return 'text-slate-400'; if (val <= 2) return 'text-emerald-600'; if (val <= 5) return 'text-amber-500'; return 'text-red-500' }

const getMinutes = (start, end) => { if (!start || !end) return 0; return (new Date(end) - new Date(start)) / 60000 }

const avgStageTimes = computed(() => {
  const completed = completedTrucks.value
  if (completed.length === 0) return { waitingIn: 0, warehouse: 0, qc: 0, waitingOut: 0 }
  const sum = completed.reduce((acc, t) => ({ waitingIn: acc.waitingIn + getMinutes(t?.timestamps?.entry, t?.timestamps?.weighbridge_in), warehouse: acc.warehouse + getMinutes(t?.timestamps?.warehouse_start, t?.timestamps?.warehouse_end), qc: acc.qc + getMinutes(t?.timestamps?.qc_start, t?.timestamps?.qc_end), waitingOut: acc.waitingOut + getMinutes(t?.timestamps?.qc_end, t?.timestamps?.weighbridge_out) }), { waitingIn: 0, warehouse: 0, qc: 0, waitingOut: 0 })
  return { waitingIn: Math.round(sum.waitingIn / completed.length), warehouse: Math.round(sum.warehouse / completed.length), qc: Math.round(sum.qc / completed.length), waitingOut: Math.round(sum.waitingOut / completed.length) }
})

const avgTotalTAT = computed(() => {
  const completed = completedTrucks.value
  if (completed.length === 0) return 0
  const totalMin = completed.reduce((sum, t) => sum + getMinutes(t?.timestamps?.entry, t?.timestamps?.exit), 0)
  return Math.round(totalMin / completed.length)
})

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const getDuration = (startTime) => {
  if (!startTime) return '-'
  const diffMs = new Date() - new Date(startTime); const diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000); const diffHrs = Math.floor((diffMs % 86400000) / 3600000)
  return `${diffHrs}h ${diffMins}m`
}
const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
</script>
