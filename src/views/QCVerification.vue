<template>
  <div class="space-y-6">
    <PageHeader title="QC Verification" subtitle="Quality Control Laboratory" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-sky-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(14,165,233,0.15)] transition-all duration-300">
                <span class="text-[9px] font-black text-sky-400 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
                <span class="text-xl font-black truncate font-mono tracking-widest" style="color:#ffffff;text-shadow:0 0 12px rgba(255,255,255,0.4)">{{ selectedTruck.plateNumber }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Driver</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.driverName }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Process</span>
                <span class="text-sm font-black" :style="selectedTruck.processType==='GBB'?'color:#A0006D':selectedTruck.processType==='GBJ'?'color: #4A8BDF':'color: #4A8BDF'">{{ selectedTruck.processType }}</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Warehouse Out</span>
                <span class="text-sm font-black text-slate-800 font-mono">{{ formatTime(selectedTruck.timestamps.warehouse_end) }}</span>
              </div>
            </div>
            <div class="mt-5"><button @click="showDetailsModal = true" class="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest" style="color: #4A8BDF;background:rgba(74,139,223,0.05);border:1px solid rgba(74,139,223,0.15)"><span class="material-icons text-[16px]">visibility</span><span>Lihat Analisa Lengkap</span></button></div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9"><StepTimeline :current-step="selectedTruck.step" :process-type="selectedTruck.processType" /></div>

            <div class="mt-6 space-y-5">
              <!-- GBB QC Form -->
              <div v-if="selectedTruck.status === 'processing' && selectedTruck.processType === 'GBB'" class="space-y-4 p-5 rounded-2xl" style="background:linear-gradient(135deg,#EFF6FF,#EEF2FF);border:1px solid #BFDBFE">
                <div class="flex items-center space-x-2 text-indigo-600 mb-2">
                  <span class="material-icons text-lg">science</span>
                  <span class="text-[11px] font-black uppercase tracking-wider">Parameter Verifikasi GBB</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Bau *</label>
                    <div class="relative">
                      <select v-model="qcForm.bau" class="w-full h-11 pl-3 pr-10 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer" style="border:1px solid #BFDBFE">
                        <option value="" disabled>Pilih Status Bau</option><option value="Normal">Normal</option><option value="Tidak Normal">Tidak Normal</option>
                      </select>
                      <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Warna *</label>
                    <div class="relative">
                      <select v-model="qcForm.warna" class="w-full h-11 pl-3 pr-10 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer" style="border:1px solid #BFDBFE">
                        <option value="" disabled>Pilih Status Warna</option><option value="Normal">Normal</option><option value="Tidak Normal">Tidak Normal</option>
                      </select>
                      <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Kadar Air *</label>
                    <div class="relative">
                      <input v-model.number="qcForm.kadarAir" type="number" step="0.01" class="w-full h-11 pl-3 pr-8 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none" style="border:1px solid #BFDBFE" placeholder="11.65">
                      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-black select-none">%</span>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Total FM *</label>
                    <div class="relative">
                      <input v-model.number="qcForm.totalFM" type="number" step="0.01" class="w-full h-11 pl-3 pr-8 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none" style="border:1px solid #BFDBFE" placeholder="0.56">
                      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-black select-none">%</span>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Biji OK *</label>
                    <div class="relative">
                      <input v-model.number="qcForm.bijiOK" type="number" step="0.01" class="w-full h-11 pl-3 pr-8 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none" style="border:1px solid #BFDBFE" placeholder="89.37">
                      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-black select-none">%</span>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Status *</label>
                    <div class="relative">
                      <select v-model="qcForm.status" class="w-full h-11 pl-3 pr-10 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer" style="border:1px solid #BFDBFE">
                        <option value="" disabled>Pilih Status Akhir</option><option value="DITERIMA">DITERIMA</option><option value="DITERIMA (Note)">DITERIMA (Note)</option><option value="DITOLAK">DITOLAK</option>
                      </select>
                      <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
                    </div>
                  </div>
                  <div class="space-y-1.5 md:col-span-2">
                    <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Note (Opsional)</label>
                    <textarea v-model="qcForm.note" class="w-full p-3 bg-white rounded-xl text-sm font-medium text-slate-800 outline-none resize-none h-20 placeholder:font-normal" style="border:1px solid #BFDBFE" placeholder="Tambahkan catatan khusus bila perlu..."></textarea>
                  </div>
                </div>
              </div>

              <div v-if="selectedTruck.status === 'processing'" class="flex space-x-4">
                <button @click="verifyTruck(selectedTruck, false)" class="flex-1 py-3.5 rounded-xl font-black flex items-center justify-center space-x-2 transition-all"
                  style="background:white;color:#EF4444;border:2px solid rgba(239,68,68,0.2)"
                  onmouseover="this.style.borderColor='#EF4444';this.style.background='rgba(239,68,68,0.04)'"
                  onmouseout="this.style.borderColor='rgba(239,68,68,0.2)';this.style.background='white'">
                  <span class="material-icons text-lg">cancel</span><span class="text-sm">Reject</span>
                </button>
                <button @click="verifyTruck(selectedTruck, true)" class="flex-1 py-3.5 rounded-xl font-black text-[#4A8BDF] flex items-center justify-center space-x-2 transition-all"
                  style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);box-shadow:0 4px 14px rgba(74,139,223,0.35)">
                  <span class="material-icons text-lg">verified</span><span class="text-sm">Pass Verification</span>
                </button>
              </div>
              <button v-else @click="startQC(selectedTruck)" class="w-full btn-primary py-3.5">
                <span class="material-icons text-lg">fact_check</span><span class="font-black">Start Verification</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(59,130,246,0.06),rgba(74,139,223,0.03));border:1px solid rgba(59,130,246,0.1)"><span class="material-icons text-slate-600 text-3xl">fact_check</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start verification</p>
          </div>
        </div>
      </transition>

      <!-- Queue -->
      <div class="lg:col-span-1">
        <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
          <!-- Glossy Overlay -->
          <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
          
          <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex justify-between items-center z-10 relative">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">fact_check</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">QC Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end">
              <div class="flex items-center space-x-2 px-4 py-2 rounded-2xl bg-white shadow-sm border border-slate-100">
                <div class="relative">
                  <span class="block w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
                  <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
                </div>
                <span class="text-xs font-black text-slate-700 tracking-wider">{{ qcTrucks.length }} PENDING TRUCKS</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedQcTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300 bg-sky-500"
                  :style="{ opacity: selectedTruck?.id === truck.id ? '1' : '0.5' }"></div>
                
                <div class="flex justify-between items-start pl-3">
                  <div>
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Process Type</div>
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ truck.plateNumber }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 font-mono border border-slate-200"
                    :style="truck.processType==='GBB'?'color:#A0006D':truck.processType==='GBJ'?'color: #4A8BDF':'color: #4A8BDF'">
                    {{ truck.processType }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      :class="truck.status === 'processing' ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ truck.status }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-sky-500 text-[#4A8BDF] shadow-[0_4px_12px_rgba(14,165,233,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-sky-50 group-hover:text-sky-600'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="qcTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="qcTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="qcTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import PageHeader from '../components/PageHeader.vue'
import StepTimeline from '../components/StepTimeline.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

const truckStore = useTruckStore()
const toast = useToast()
const { confirm } = useConfirm()
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const currentPage = ref(1)
const qcForm = ref({ bau: '', warna: '', kadarAir: null, totalFM: null, bijiOK: null, status: '', note: '' })
const qcTrucks = computed(() => truckStore.trucks.filter(t => t.step === 'qc'))
const paginatedQcTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return qcTrucks.value.slice(start, end)
})

const selectTruck = (truck) => {
  selectedTruck.value = truck
  qcForm.value = { bau: truck.qcDetails?.bau || '', warna: truck.qcDetails?.warna || '', kadarAir: truck.qcDetails?.kadarAir || null, totalFM: truck.qcDetails?.totalFM || null, bijiOK: truck.qcDetails?.bijiOK || null, status: truck.qcDetails?.status || '', note: truck.qcDetails?.note || '' }
}

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const startQC = (truck) => { truckStore.updateTruckStatus(truck.id, 'processing', 'qc') }

const verifyTruck = async (truck, passed) => {
  if (truck.processType === 'GBB') {
    const { bau, warna, kadarAir, totalFM, bijiOK, status, note } = qcForm.value
    if (!bau || !warna || kadarAir === null || totalFM === null || bijiOK === null || !status) { toast.warning('Mohon isi seluruh parameter Verifikasi QC utama secara lengkap sebelum melanjutkan!'); return }
    truckStore.updateTruckDetails(truck.id, { qcDetails: { bau: bau.toUpperCase(), warna: warna.toUpperCase(), kadarAir, totalFM, bijiOK, status: status.toUpperCase(), note } })
  }
  if (passed) {
    const ok = await confirm({ title: 'Approve Verification?', message: `Approve verification for ${truck.plateNumber}?`, type: 'success', confirmText: 'Approve' })
    if (ok) { truckStore.updateTruckStatus(truck.id, 'waiting', 'weighbridge_out'); toast.success(`${truck.plateNumber} verification passed!`); selectedTruck.value = null }
  } else {
    const ok = await confirm({ title: 'Reject Verification?', message: `Reject verification for ${truck.plateNumber}?`, type: 'danger', confirmText: 'Ya, Tolak' })
    if (ok) { truckStore.updateTruckStatus(truck.id, 'completed', 'qc'); toast.error(`${truck.plateNumber} verification rejected.`); selectedTruck.value = null }
  }
}
</script>
