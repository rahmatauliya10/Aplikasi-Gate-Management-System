<template>
  <transition name="modal">
    <div v-if="isOpen && truck" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-animate"
      @click.self="close">
      <div class="modal-panel rounded-[1.5rem] overflow-hidden flex flex-col max-h-[90vh] transition-all duration-500 w-[95vw] sm:w-[90vw] lg:w-[85vw] max-w-7xl mx-auto"
        style="background: white; box-shadow: 0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,139,223,0.1);">

        <!-- Header -->
        <div class="px-8 py-5 flex justify-between items-center sticky top-0 z-10"
          style="background: linear-gradient(135deg, #FFFFFF, #E6F0FA); border-bottom: 1px solid rgba(74,139,223,0.15);">
          <div class="flex items-center space-x-4 animate-fadeInLeft">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center"
              style="background: linear-gradient(135deg, rgba(74,139,223,0.2), rgba(160,0,109,0.1)); border: 1px solid rgba(74,139,223,0.3); box-shadow: 0 0 20px rgba(74,139,223,0.2);">
              <span class="material-icons text-[#4A8BDF] text-2xl">local_shipping</span>
            </div>
            <div>
              <h2 class="text-2xl font-black text-[#4A8BDF] tracking-tight" style="letter-spacing: -0.04em;">{{ truck.plateNumber }}</h2>
              <div class="flex items-center space-x-2 mt-1">
                <span class="text-xs font-bold text-slate-600 uppercase tracking-widest">{{ truck.driverName }}</span>
                <span class="w-1 h-1 rounded-full bg-slate-600"></span>
                <span class="text-xs font-black uppercase tracking-widest"
                  :style="truck.processType === 'GBB' ? 'color:#800057' : truck.processType === 'GBJ' ? 'color:#818CF8' : 'color:#34D399'">
                  {{ truck.processType }}
                </span>
              </div>
            </div>
          </div>
          <button @click="close"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:rotate-90"
            style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);"
            onmouseover="this.style.background='rgba(239,68,68,0.15)';this.style.borderColor='rgba(239,68,68,0.3)';this.querySelector('span').style.color='#F87171'"
            onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.08)';this.querySelector('span').style.color='#94A3B8'"
          >
            <span class="material-icons text-slate-600 text-lg transition-colors duration-200">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="p-8 overflow-y-auto flex-1 relative" style="background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);">
          <!-- Background Grid Overlay -->
          <div class="absolute inset-0 pointer-events-none opacity-[0.02]" 
            style="background-image: radial-gradient(#4A8BDF 1px, transparent 1px); background-size: 20px 20px;"></div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">

            <!-- Left: Identity & QC -->
            <div class="space-y-8">
              <!-- Identity Card (Glass Style) -->
              <div class="rounded-[2.5rem] overflow-hidden animate-fadeInUp shadow-[0_10px_40px_rgba(15,23,42,0.04)] border border-white" style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px);">
                <div class="px-8 py-5 flex items-center justify-between border-b border-slate-100" style="background: rgba(255, 255, 255, 0.4);">
                  <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                      <span class="material-icons text-[#4A8BDF] text-lg">badge</span>
                    </div>
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Primary Identity</h3>
                  </div>
                  <div class="px-4 py-1.5 rounded-full bg-white/80 border border-slate-100 shadow-sm flex items-center whitespace-nowrap">
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></div>
                    <span class="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none">Security Verified</span>
                  </div>
                </div>
                <div class="p-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                  <div v-for="(field, idx) in identityFields" :key="field.label" class="flex flex-col animate-fadeInLeft group p-3 -m-3 rounded-2xl transition-colors duration-300 hover:bg-white/60 cursor-default" :style="{ animationDelay: `${idx * 50}ms` }">
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 group-hover:text-[#4A8BDF] transition-colors">{{ field.label }}</span>
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-black tracking-tight transition-colors" :class="field.highlight ? 'text-[#4A8BDF]' : 'text-slate-800 group-hover:text-slate-900'">{{ field.value || '-' }}</span>
                      <div v-if="field.highlight" class="w-1.5 h-1.5 rounded-full bg-[#4A8BDF] animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- QC Results (High-Tech Style) -->
              <div v-if="truck.qcDetails" class="rounded-[2.5rem] overflow-hidden animate-fadeInUp shadow-[0_15px_50px_rgba(74,139,223,0.08)] border border-white" 
                   style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); animation-delay: 0.1s;">
                <div class="px-8 py-5 flex items-center space-x-3 border-b border-slate-100" style="background: rgba(255, 255, 255, 0.4);">
                  <div class="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
                    <span class="material-icons text-blue-500 text-lg">biotech</span>
                  </div>
                  <h3 class="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Quality Analysis</h3>
                </div>
                <div class="p-8">
                  <div class="grid grid-cols-2 gap-4 mb-6">
                    <div v-for="item in qcMetrics" :key="item.label" 
                         class="p-4 rounded-3xl bg-white border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-500 group">
                      <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">{{ item.label }}</div>
                      <div class="text-lg font-black text-slate-800 font-mono tracking-tight">{{ item.value }}</div>
                    </div>
                  </div>
                  <div class="relative rounded-[2rem] p-6 overflow-hidden group shadow-xl"
                       :style="{ background: truck.qcDetails.status === 'REJECT' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #4A8BDF, #3A6ABF)' }">
                    <!-- Glossy overlay -->
                    <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 pointer-events-none"></div>
                    <div class="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform duration-1000"><span class="material-icons text-9xl">verified</span></div>
                    
                    <div class="relative z-10">
                      <span class="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] mb-1 block">Decision Status</span>
                      <div class="flex items-center space-x-3">
                        <span class="text-2xl font-black text-white tracking-[0.1em]">{{ truck.qcDetails.status || 'PENDING' }}</span>
                        <div class="w-2 h-2 rounded-full bg-white animate-ping"></div>
                      </div>
                    </div>
                  </div>
                  <div v-if="truck.qcDetails.note" class="mt-4 p-5 rounded-2xl bg-blue-50/50 border border-blue-100/50">
                    <p class="text-[11px] text-blue-800 font-bold italic tracking-wide">"{{ truck.qcDetails.note }}"</p>
                  </div>
                </div>
              </div>

              <!-- Fraud Recon (Policy Integration) -->
              <div v-if="fraudMetrics.status !== 'NOT_RECORDED'"
                class="rounded-[2.5rem] overflow-hidden relative animate-fadeInUp shadow-[0_10px_40px_rgba(15,23,42,0.04)] border border-white"
                :style="{ background: fraudMetrics.status === 'CRITICAL' ? 'rgba(254, 242, 242, 0.6)' : fraudMetrics.status === 'WARNING' ? 'rgba(255, 251, 235, 0.6)' : 'rgba(240, 253, 244, 0.6)', backdropFilter: 'blur(10px)' }"
              >
                <div class="px-8 py-5 flex items-center space-x-3 border-b border-slate-100">
                  <span class="material-icons text-lg"
                    :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">policy</span>
                  <h3 class="text-xs font-black uppercase tracking-[0.2em]"
                    :style="fraudMetrics.status === 'CRITICAL' ? 'color:#7F1D1D' : fraudMetrics.status === 'WARNING' ? 'color:#78350F' : 'color:#064E3B'">
                    Integrity Reconciliation
                  </h3>
                </div>
                <div class="p-8 space-y-4">
                  <div class="flex items-center justify-between p-5 rounded-3xl bg-white border border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rasio Timbangan</span>
                    <div class="flex items-center space-x-2">
                      <span class="text-2xl font-black font-mono"
                        :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                        {{ fraudMetrics.ratioPercent.toFixed(2) }}%
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between p-5 rounded-3xl bg-white border border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selisih Berat</span>
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-lg" :class="fraudMetrics.direction === '+' ? 'text-emerald-500' : fraudMetrics.direction === '-' ? 'text-red-500' : 'text-slate-400'">{{ fraudMetrics.direction === '+' ? 'arrow_upward' : fraudMetrics.direction === '-' ? 'arrow_downward' : 'remove' }}</span>
                      <span class="text-2xl font-black font-mono"
                        :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                        {{ fraudMetrics.direction }}{{ formatWeight(fraudMetrics.diff) }} kg
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between p-5 rounded-3xl bg-white border border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deviasi</span>
                    <span class="text-2xl font-black font-mono"
                      :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                      {{ fraudMetrics.direction }}{{ fraudMetrics.deviationPercent.toFixed(2) }}%
                    </span>
                  </div>
                  <!-- Status Banner -->
                  <div class="p-6 rounded-[2rem] text-white overflow-hidden relative group"
                    :style="{ background: fraudMetrics.status === 'CRITICAL' ? 'linear-gradient(135deg, #DC2626, #EF4444)' : fraudMetrics.status === 'WARNING' ? 'linear-gradient(135deg, #A0006D, #800057)' : 'linear-gradient(135deg, #4A8BDF, #3A6ABF)' }">
                    <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 pointer-events-none"></div>
                    <div class="flex items-center mb-1">
                      <span class="material-icons text-white/80 mr-2 text-sm">{{ fraudMetrics.status === 'SAFE' ? 'verified_user' : 'report_problem' }}</span>
                      <span class="font-black text-xs tracking-widest uppercase">{{ fraudMetrics.status === 'CRITICAL' ? 'KRITIS' : fraudMetrics.status === 'WARNING' ? 'PERINGATAN' : 'AMAN' }}</span>
                    </div>
                    <p class="text-[11px] font-bold text-white/90">
                      {{ fraudMetrics.status === 'CRITICAL' ? 'Selisih signifikan terdeteksi (>5%). Perlu investigasi segera.' : 
                         fraudMetrics.status === 'WARNING' ? 'Penyusutan di ambang peringatan (>2%). Periksa kemungkinan kesalahan data.' : 
                         'Realisasi dalam batas toleransi yang diterima (<2%).' }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Weights & Timeline -->
            <div class="space-y-8">
              <!-- Weight Analysis (Premium Card) -->
              <div class="rounded-[2.5rem] overflow-hidden animate-fadeInUp shadow-[0_15px_50px_rgba(16,185,129,0.08)] border border-white" 
                   style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); animation-delay: 0.15s;">
                <div class="px-8 py-5 flex items-center space-x-3 border-b border-slate-100" style="background: rgba(255, 255, 255, 0.4);">
                  <div class="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                    <span class="material-icons text-emerald-500 text-lg">scale</span>
                  </div>
                  <h3 class="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Tonnage Analytics</h3>
                </div>
                <div class="p-8">
                  <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="p-5 rounded-3xl bg-white border border-slate-100 relative group overflow-hidden">
                      <div class="absolute bottom-0 left-0 right-0 h-1 bg-blue-400/20"></div>
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Gross (IN)</span>
                      <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeight(truck.weights?.gross) }} <span class="text-[10px] text-slate-400">kg</span></div>
                    </div>
                    <div class="p-5 rounded-3xl bg-white border border-slate-100 relative group overflow-hidden">
                      <div class="absolute bottom-0 left-0 right-0 h-1 bg-red-400/20"></div>
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tare (OUT)</span>
                      <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeight(truck.weights?.tare) }} <span class="text-[10px] text-slate-400">kg</span></div>
                    </div>
                  </div>
                  
                  <!-- Main Result -->
                  <div class="p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl transition-all duration-700 hover:scale-[1.02]" 
                       style="background: linear-gradient(135deg, #10B981, #059669);">
                    <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 pointer-events-none"></div>
                    <div class="absolute -right-6 -bottom-6 opacity-10 group-hover:rotate-12 transition-transform duration-1000"><span class="material-icons text-9xl text-white">analytics</span></div>
                    <span class="text-[11px] font-black text-emerald-100/60 uppercase tracking-[0.4em] mb-2 block relative z-10">Net Manifest Weight</span>
                    <div class="flex items-baseline space-x-2 relative z-10">
                      <span class="text-5xl font-black text-white font-mono tracking-tighter">{{ formatWeight(truck.weights?.net) }}</span>
                      <span class="text-xl font-bold text-emerald-200">KILOGRAMS</span>
                    </div>
                  </div>
                  <!-- Warehouse Realization -->
                  <div v-if="truck.weights?.rollWeight > 0" class="mt-4 p-5 rounded-3xl bg-white border border-orange-100 flex justify-between items-center group hover:border-orange-200 transition-colors">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Warehouse Realization</span>
                    <span class="text-xl font-black text-orange-600 font-mono tracking-tight">{{ formatWeight(truck.weights?.rollWeight) }} kg</span>
                  </div>
                </div>
              </div>

              <!-- Activity Roadmap (Timeline) -->
              <div class="rounded-[2.5rem] overflow-hidden animate-fadeInUp shadow-[0_10px_40px_rgba(15,23,42,0.04)] border border-white" 
                   style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); animation-delay: 0.2s;">
                <div class="px-8 py-5 flex items-center space-x-3 border-b border-slate-100" style="background: rgba(255, 255, 255, 0.4);">
                  <div class="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                    <span class="material-icons text-[#4A8BDF] text-lg">route</span>
                  </div>
                  <h3 class="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Operational Roadmap</h3>
                </div>
                <div class="p-8">
                  <div class="relative pl-8 border-l-2 border-indigo-100 space-y-8">
                    <div v-for="(ts, idx) in timestampRows" :key="ts.label" class="relative group animate-fadeInLeft" :style="{ animationDelay: `${idx * 70}ms` }">
                      <!-- Active dot -->
                      <div class="absolute -left-[45px] top-1.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-100 flex items-center justify-center transition-all duration-500 group-hover:border-[#4A8BDF] group-hover:scale-125">
                        <div class="w-2 h-2 rounded-full transition-all duration-500" :style="{ backgroundColor: ts.value ? '#4A8BDF' : '#CBD5E1' }"></div>
                      </div>
                      <div class="flex flex-col p-3 rounded-2xl transition-colors duration-300 group-hover:bg-indigo-50/60 -mt-3 -ml-3 cursor-default">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-[#4A8BDF] transition-colors">{{ ts.label }}</span>
                        <div class="flex items-center space-x-2">
                          <span class="text-[13px] font-black text-slate-700 font-mono tracking-wider transition-colors group-hover:text-slate-900">{{ formatTimeFull(ts.value) }}</span>
                          <span v-if="ts.value" class="material-icons text-[14px] text-emerald-500 transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12">check_circle</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 flex justify-end" style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
          <button @click="close" class="group relative overflow-hidden flex items-center space-x-2 px-6 py-2.5 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97]"
            style="background: linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 2px 8px rgba(74,139,223,0.25);">
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none"></div>
            <span class="material-icons text-white/80 text-[16px] relative z-10 group-hover:translate-x-0.5 transition-transform duration-300">logout</span>
            <span class="relative z-10 text-[11px] font-black text-white uppercase tracking-[0.15em]">Tutup</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  truck: { type: Object, default: () => ({}) },
  size: { type: String, default: 'normal' }
})
const emit = defineEmits(['close'])
const close = () => emit('close')

const identityFields = computed(() => [
  { label: 'Carrier Vendor', value: props.truck?.vendor },
  { label: 'Surat Jalan ID', value: props.truck?.suratJalanNumber, highlight: true },
  { label: 'Logistics PO', value: props.truck?.poNumber, highlight: true },
  { label: 'Security Remarks', value: props.truck?.remarks },
])

const qcMetrics = computed(() => [
  { label: 'Odor Profile', value: props.truck?.qcDetails?.bau || '-' },
  { label: 'Visual Color', value: props.truck?.qcDetails?.warna || '-' },
  { label: 'Moisture Level', value: props.truck?.qcDetails?.kadarAir !== null ? props.truck.qcDetails.kadarAir + '%' : '-' },
  { label: 'Foreign Matter', value: props.truck?.qcDetails?.totalFM !== null ? props.truck.qcDetails.totalFM + '%' : '-' }
])

const timestampRows = computed(() => [
  { label: 'Initial Gate Entry', value: props.truck?.timestamps?.entry },
  { label: 'Inbound Weighing', value: props.truck?.timestamps?.weighbridge_in },
  { label: 'Warehouse Processing', value: props.truck?.timestamps?.warehouse_start },
  { label: 'QC Verification', value: props.truck?.timestamps?.qc },
  { label: 'Outbound Weighing', value: props.truck?.timestamps?.weighbridge_out },
  { label: 'Final Dispatch', value: props.truck?.timestamps?.exit || props.truck?.timestamps?.gate_out },
])

const fraudMetrics = computed(() => {
  if (!props.truck?.weights) return { status: 'NOT_RECORDED' }
  const net = props.truck.weights.net || 0
  const roll = props.truck.weights.rollWeight || 0
  if (net === 0 || roll === 0) return { net, roll, diff: 0, ratioPercent: 0, deviationPercent: 0, direction: '=', status: 'NOT_RECORDED' }
  const ratioPercent = (roll / net) * 100
  const rawDiff = roll - net
  const diff = Math.abs(rawDiff)
  const deviationPercent = Math.abs(100 - ratioPercent)
  const direction = rawDiff > 0 ? '+' : rawDiff < 0 ? '-' : '='
  let status = 'SAFE'
  if (deviationPercent > 5) status = 'CRITICAL'
  else if (deviationPercent > 2) status = 'WARNING'
  return { net, roll, diff, ratioPercent, deviationPercent, direction, status }
})

const formatWeight = (val) => {
  if (val === undefined || val === null || val === 0) return '0'
  return new Intl.NumberFormat('id-ID').format(val)
}

const formatTimeFull = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB, ' + d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<style scoped>
.modal-enter-active { transition: opacity 0.35s ease-out; }
.modal-leave-active { transition: opacity 0.2s ease-in; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.modal-enter-active .modal-panel {
  animation: modalSpringUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.modal-leave-active .modal-panel {
  animation: modalDown 0.2s ease-in forwards;
}
@keyframes modalSpringUp {
  0%   { opacity: 0; transform: translateY(40px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes modalDown {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(14px) scale(0.97); }
}
</style>
