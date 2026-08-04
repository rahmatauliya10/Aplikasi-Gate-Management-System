<template>
  <div class="space-y-6">
    <PageHeader title="Sparepart Warehouse" subtitle="Loading Operations" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" :process-type="getProcessType(selectedTruck)" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(74,139,223,0.15)] transition-all duration-300">
                <span class="text-[9px] font-black text-emerald-400 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
                <span class="text-xl font-black truncate font-mono tracking-widest" style="color:#ffffff;text-shadow:0 0 12px rgba(255,255,255,0.4)">{{ getPlateNumber(selectedTruck) }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Driver</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.driverName }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Vendor</span>
                <span class="text-sm font-black text-slate-700 truncate">{{ getVendor(selectedTruck) }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Delivery Note</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.suratJalanNumber || '-' }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">PO Number</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.poNumber || '-' }}</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Process</span>
                <span class="text-sm font-black text-[#3A6ABF]">Processing</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Warehouse Out</span>
                <span class="text-sm font-black text-slate-800 font-mono">{{ formatTime(getWarehouseEnd(selectedTruck)) }}</span>
              </div>
            </div>
            
            <div class="mt-6 relative z-10">
              <button @click="showDetailsModal = true" class="relative w-full overflow-hidden flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl transition-all duration-300 text-xs font-black uppercase tracking-widest text-indigo-600 bg-[#E6F0FA] border border-[#CCE0F5] hover:border-indigo-300 hover:shadow-[0_4px_20px_rgba(74,139,223,0.2)] group">
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-200/50 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                <span class="material-icons text-[18px]">travel_explore</span>
                <span>VIEW FULL ANALYSIS</span>
              </button>
            </div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9"><StepTimeline :current-step="selectedTruck.status" :process-type="selectedTruck.processType" /></div>
            
            <div class="mt-6 space-y-4">
              <!-- Missing Security Info -->
              <div v-if="selectedTruck.status === 'QC_VEHICLE_PASSED' && (!selectedTruck.suratJalanNumber || !selectedTruck.poNumber)" class="space-y-4 p-5 rounded-2xl" style="background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDE68A">
                <div class="flex items-center space-x-2 text-[#800057] mb-2">
                  <span class="material-icons text-lg">warning_amber</span>
                  <span class="text-[11px] font-black uppercase tracking-wider">Complete Security Data</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="space-y-1.5" v-if="!selectedTruck.suratJalanNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Delivery Note No. *</label>
                    <input v-model="suratJalanInput" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="SJ-XXXXX">
                  </div>
                  <div class="space-y-1.5" v-if="!selectedTruck.poNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">No PO *</label>
                    <input v-model="poNumberInput" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="PO-XXXXX">
                  </div>
                </div>
                <button @click="saveSecurityInfo" :disabled="isProcessing" class="w-full btn-primary py-2.5 mt-2 flex justify-center items-center space-x-2">
                  <span v-if="isProcessing" class="material-icons animate-spin">autorenew</span>
                  <span>Save Security Data & Start Processing</span>
                </button>
              </div>

              <!-- Weight Input (processing) -->
              <div v-if="selectedTruck.status === 'WAREHOUSE_IN_PROGRESS'">
                <WeightInput label="Input Actual Weight GSP (KG)" :is-submitting="isProcessing" @save="handleWeightSave" />
              </div>

              <!-- Incoming Material Check -->
              <div v-if="selectedTruck.status === 'INCOMING_CHECK_PENDING' || selectedTruck.status === 'INCOMING_CHECK_IN_PROGRESS'" class="mt-6">
                <button @click="openChecklist" class="w-full py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;transform:translateZ(0)">
                  <span class="material-icons text-xl">fact_check</span>
                  <span class="font-black tracking-widest uppercase">
                    {{ selectedTruck.status === 'INCOMING_CHECK_IN_PROGRESS' ? 'Lanjutkan Incoming Material Check' : 'Start Incoming Material Check' }}
                  </span>
                </button>
              </div>

              <!-- Sampling Result Badge -->
              <div v-if="selectedTruck.status === 'INCOMING_CHECK_REJECTED'" class="mt-4 p-4 rounded-xl flex items-center space-x-3" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
                <span class="material-icons text-red-500 text-2xl">cancel</span>
                <div>
                  <p class="text-sm font-black text-red-700">Checklist REJECTED</p>
                  <p class="text-[11px] text-red-500">Truck redirected to outbound weighbridge.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(74,139,223,0.06),rgba(160,0,109,0.03));border:1px solid rgba(74,139,223,0.1)"><span class="material-icons text-slate-600 text-3xl">inventory</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start processing</p>
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
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">inventory</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">GSP Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div class="relative">
                <input v-model="searchQuery" type="text" placeholder="Search Plate Number..." class="w-56 h-10 pl-10 pr-10 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm">
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
                <span class="text-xs font-black text-slate-700 tracking-wider">{{ filteredGspTrucks.length }} PENDING TRUCKS</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedGspTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300 bg-[#4A8BDF]"
                  :style="{ opacity: selectedTruck?.id === truck.id ? '1' : '0.5' }"></div>
                
                <div class="flex justify-between items-start pl-3">
                  <div>
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Arrival Time</div>
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ getPlateNumber(truck) }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 font-mono border border-slate-200">
                    {{ formatTime(getEntryTimestamp(truck)) }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      :class="truck.status === 'INCOMING_CHECK_PENDING' ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ getStepLabel(truck) }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#4A8BDF] text-white shadow-[0_4px_12px_rgba(74,139,223,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-[#3A6ABF]'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredGspTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredGspTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredGspTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- Incoming Material Check Modal -->
    <div v-if="showChecklistModal && selectedTruck" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showChecklistModal = false"></div>
      <div class="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
        
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-xl font-black text-slate-800 tracking-tight">Incoming Material Check</h3>
            <p class="text-xs font-bold text-slate-500 mt-1">{{ selectedTruck.plateNumber }} &middot; Cargo Type: {{ selectedTruck.cargoType || 'General Goods' }}</p>
          </div>
          <button @click="showChecklistModal = false" class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <span class="material-icons">close</span>
          </button>
        </div>

        <div class="p-6 overflow-y-auto hide-scrollbar space-y-6">
          <div class="space-y-4">
            <div v-for="(item, index) in currentChecklist" :key="index" 
              class="group relative overflow-hidden rounded-2xl transition-all duration-300"
              :class="checklistStates[index] === true ? 'bg-emerald-50 border border-emerald-200' : (checklistStates[index] === false ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200')">
              <div class="p-4 flex items-center justify-between">
                <div class="flex-1 pr-6">
                  <div class="flex items-center space-x-3 mb-2">
                    <span class="flex items-center justify-center w-6 h-6 rounded-full bg-white text-[10px] font-black border border-slate-200"
                      :class="checklistStates[index] === true ? 'text-emerald-600 border-emerald-200' : (checklistStates[index] === false ? 'text-red-600 border-red-200' : 'text-slate-400')">
                      {{ index + 1 }}
                    </span>
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">Inspection Item</span>
                  </div>
                  <p class="text-sm font-bold text-slate-700 leading-relaxed">{{ item }}</p>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                  <button @click="checklistStates[index] = false" class="w-12 h-12 rounded-xl flex items-center justify-center transition-all border"
                    :class="checklistStates[index] === false ? 'bg-red-500 text-white border-red-600 shadow-inner' : 'bg-white text-slate-400 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'">
                    <span class="material-icons text-lg">close</span>
                  </button>
                  <button @click="checklistStates[index] = true" class="w-12 h-12 rounded-xl flex items-center justify-center transition-all border"
                    :class="checklistStates[index] === true ? 'bg-emerald-500 text-white border-emerald-600 shadow-inner' : 'bg-white text-slate-400 border-slate-200 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-200'">
                    <span class="material-icons text-lg">check</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div v-if="hasChecklistReject" class="animate-fade-in space-y-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Rejection Reason *</label>
            <textarea v-model="rejectComment" rows="3" class="w-full p-4 bg-red-50/50 rounded-2xl text-sm font-bold text-slate-700 outline-none border border-red-100 focus:border-red-300 focus:ring-4 focus:ring-red-500/10 transition-all resize-none placeholder:text-red-300/50" placeholder="Please provide details for the rejection..."></textarea>
          </div>
        </div>

        <div v-if="!hasChecklistReject" class="p-6 border-t border-slate-100 bg-white grid grid-cols-2 gap-4">
          <button @click="showChecklistModal = false" class="py-4 rounded-xl font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancel
          </button>
          <button @click="acceptChecklist(false)" :disabled="!isChecklistComplete || isProcessing" class="py-4 rounded-xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);">
            <span v-if="isProcessing" class="material-icons text-lg animate-spin">autorenew</span>
            <span v-else class="material-icons text-lg">verified</span>
            <span>Pass Inspection</span>
          </button>
        </div>
        <div v-else class="p-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
          <button @click="rejectChecklist" :disabled="!rejectComment.trim() || isProcessing" class="flex-1 py-4 rounded-xl font-black text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 shadow-md">
            <span v-if="isProcessing" class="material-icons text-lg animate-spin">autorenew</span>
            <span v-else class="material-icons text-lg">cancel</span>
            <span>Reject Inspection</span>
          </button>
          <button @click="acceptChecklist(true)" :disabled="isProcessing" class="flex-1 py-4 rounded-xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-md hover:shadow-lg" style="background:linear-gradient(135deg,#F59E0B,#D97706);">
            <span v-if="isProcessing" class="material-icons text-lg animate-spin">autorenew</span>
            <span v-else class="material-icons text-lg">warning</span>
            <span>Terima With Note</span>
          </button>
        </div>
      </div>
    </div>
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" size="wide" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import PageHeader from '../components/PageHeader.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import StepTimeline from '../components/StepTimeline.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

// Safety Helpers at the top
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

const getWarehouseStart = (truck) => {
  if (!truck) return null
  return truck.timestamps?.warehouseStartAt || truck.timestamps?.warehouse_start || truck.warehouseStartAt || null
}

const getWarehouseEnd = (truck) => {
  if (!truck) return null
  return truck.timestamps?.warehouseEndAt || truck.timestamps?.warehouse_end || truck.warehouseEndAt || null
}

const router = useRouter()
const truckStore = useTruckStore()
const warehouseStore = useWarehouseStore()
const toast = useToast()
const { confirm } = useConfirm()

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[GSPProcess] Mount-time fetch failed, using store cache:', err.message)
  }
})

const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const showChecklistModal = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const suratJalanInput = ref('')
const poNumberInput = ref('')
const rejectComment = ref('')
const isProcessing = ref(false)

// Checklists by Cargo Type
const CHECKLISTS = {
  Chemicals: ["Cek MSDS (Material Safety Data Sheet)", "Cek Kemasan Bocor"],
  Fuel: ["Cek Segel Tangki", "Cek Tera Flowmeter"],
  'Batu Bara': ["Cek Terpal Penutup", "Visual Kondisi Basah/Kering"],
  default: ["Cek Kesesuaian PO", "Visual Kondisi Kemasan"]
}
const currentChecklist = computed(() => {
  if (!selectedTruck.value) return CHECKLISTS.default
  return CHECKLISTS[selectedTruck.value.cargoType] || CHECKLISTS.default
})
const checklistStates = ref([])

const isChecklistComplete = computed(() => checklistStates.value.every(s => s !== null))
const hasChecklistReject = computed(() => checklistStates.value.some(s => s === false))

const gspTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PASSED' || t.status === 'WAREHOUSE_IN_PROGRESS' || t.status === 'INCOMING_CHECK_PENDING' || t.status === 'INCOMING_CHECK_IN_PROGRESS') && getProcessType(t) === 'GSP'))
const filteredGspTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  if (!keyword) return gspTrucks.value
  return gspTrucks.value.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
})
const totalPages = computed(() => Math.ceil(filteredGspTrucks.value.length / 10) || 1)
const paginatedGspTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredGspTrucks.value.slice(start, end)
})

watch(filteredGspTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })
const selectTruck = (truck) => { 
  const isSameTruck = selectedTruck.value && String(selectedTruck.value.id) === String(truck.id)
  selectedTruck.value = truck 
  suratJalanInput.value = truck.suratJalanNumber || ''
  poNumberInput.value = truck.poNumber || ''

  if (!isSameTruck || truck.status === 'INCOMING_CHECK_PENDING') {
    const listLen = currentChecklist.value ? currentChecklist.value.length : 0
    checklistStates.value = Array(listLen).fill(null)
    rejectComment.value = ''
  }
}
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const saveSecurityInfo = async () => {
  if (!suratJalanInput.value || !poNumberInput.value) { toast.warning('Please complete the Delivery Note and PO Number fields'); return }
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const sj = suratJalanInput.value.toUpperCase();
    const po = poNumberInput.value.toUpperCase();
    const response = await warehouseStore.startProcess(selectedTruck.value.id, { suratJalanNumber: sj, poNumber: po })
    
    // Explicitly update local state for immediate UI reflection
    if (selectedTruck.value) {
      selectedTruck.value.suratJalanNumber = sj;
      selectedTruck.value.poNumber = po;
    }
    
    const updatedTruck = response?.data || response;
    if (updatedTruck) truckStore.upsertTruck(updatedTruck);
    toast.success('Security data saved. Processing started.')
  } catch(e) {} finally { isProcessing.value = false; }
}

const handleWeightSave = async (weight) => {
  if (!selectedTruck.value || isProcessing.value) return
  const ok = await confirm({ title: 'Processing Complete?', message: `Save Processed Weight: ${weight}kg for ${selectedTruck.value.plateNumber}?`, type: 'success', confirmText: 'Yes, Save' })
  if (ok) {
    isProcessing.value = true;
    try {
      const response = await warehouseStore.completeProcess(selectedTruck.value.id, { actualWeight: weight })
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);
      toast.success(`Processed Weight ${weight}kg saved — proceed to Incoming Material Check.`)
      selectedTruck.value = null
    } catch(e) {} finally { isProcessing.value = false; }
  }
}

const openChecklist = () => {
  if (selectedTruck.value && selectedTruck.value.status === 'INCOMING_CHECK_PENDING') {
    const listLen = currentChecklist.value ? currentChecklist.value.length : 0
    checklistStates.value = Array(listLen).fill(null)
    rejectComment.value = ''
    truckStore.updateTruckStatus(selectedTruck.value.id, 'INCOMING_CHECK_IN_PROGRESS')
  }
  showChecklistModal.value = true
}

const acceptChecklist = async (isNote = false) => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const checks = currentChecklist.value.map((item, idx) => `Item ${idx+1}: ${checklistStates.value[idx] ? 'OK' : 'NOT OK'}`);
    let resultStrs = [];
    if (isNote || hasChecklistReject.value) {
      resultStrs.push('DITERIMA DENGAN CATATAN');
    }
    resultStrs.push(`Checklist: [${checks.join(' | ')}]`);
    const remarks = resultStrs.join(' | ');

    const response = await warehouseStore.submitIncomingCheck(selectedTruck.value.id, { decision: 'passed', remarks })
    const updatedTruck = response?.data || response;
    if (updatedTruck) {
      updatedTruck.compiledChecklist = remarks;
      truckStore.upsertTruck(updatedTruck);
    }
    showChecklistModal.value = false
    toast.success(isNote || hasChecklistReject.value ? 'Incoming Check Passed (With Note) — Proceed to outbound weighbridge.' : 'Incoming Check Complete — Proceed to outbound weighbridge.')
    selectedTruck.value = null
  } catch(e) {} finally { isProcessing.value = false; }
}

const rejectChecklist = async () => {
  const ok = await confirm({ title: 'Confirm Rejection', message: `REJECT inspection for ${selectedTruck.value.plateNumber}? Truck will be redirected to outbound weighbridge.`, type: 'danger', confirmText: 'Yes, Reject' })
  if (ok) {
    if (isProcessing.value) return;
    isProcessing.value = true;
    try {
      const response = await warehouseStore.submitIncomingCheck(selectedTruck.value.id, { decision: 'rejected', rejectReason: rejectComment.value.trim() })
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);
      toast.error(`${selectedTruck.value.plateNumber} rejected — ${rejectComment.value.trim()}`)
      rejectComment.value = ''
      showChecklistModal.value = false
      selectedTruck.value = null
    } catch(e) {} finally { isProcessing.value = false; }
  }
}
</script>

