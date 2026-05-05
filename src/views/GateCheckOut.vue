<template>
  <div class="space-y-7">
    <!-- Header -->
    <PageHeader title="Gate Out" subtitle="Vehicles Ready for Exit" />

    <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
      <!-- Glossy Overlay -->
      <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
      
      <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex justify-between items-center z-10 relative">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
            <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">exit_to_app</span>
          </div>
          <div>
            <h2 class="text-xl font-black text-slate-800 tracking-tight">Ready for Exit</h2>
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
            <span class="text-xs font-black text-slate-700 tracking-wider">{{ completedTrucks.length }} ACTIVE LOGS</span>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
        <div class="absolute inset-0 pointer-events-none opacity-[0.08]" style="background-image: linear-gradient(#4A8BDF 1.5px, transparent 1.5px), linear-gradient(90deg, #4A8BDF 1.5px, transparent 1.5px); background-size: 30px 30px;"></div>
        
        <transition-group name="list" tag="div" class="relative z-10 space-y-4">
          <div v-for="(truck, i) in completedTrucks" :key="truck.id"
            class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] transition-all duration-500 border border-white hover:border-emerald-400 hover:border-opacity-40 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.12)] hover:-translate-y-1.5 overflow-hidden"
          >
            <div class="absolute left-0 top-4 bottom-4 w-1.5 rounded-r-full transition-all duration-300 bg-[#4A8BDF] opacity-70 group-hover:opacity-100"></div>
            
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pl-4">
              <!-- Info Section -->
              <div class="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Plate Number</div>
                  <div class="text-lg font-black text-slate-900 font-mono tracking-tight">{{ truck.plateNumber }}</div>
                </div>
                
                <div>
                  <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Vendor</div>
                  <div class="text-sm font-bold text-slate-700 truncate">{{ truck.vendor }}</div>
                </div>
                
                <div>
                  <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Gross / Tare</div>
                  <div class="flex items-center space-x-2 text-xs font-bold text-slate-700 font-mono">
                    <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">G {{ truck.weights.gross }}</span>
                    <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">T {{ truck.weights.tare }}</span>
                  </div>
                </div>

                <div>
                  <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Net Weight</div>
                  <div class="flex items-baseline">
                    <span class="text-xl font-black text-[#3A6ABF] font-mono tracking-tighter">{{ truck.weights.net }}</span>
                    <span class="text-xs font-bold text-[#4A8BDF]/70 ml-1">kg</span>
                  </div>
                </div>
              </div>

              <!-- Actions Section -->
              <div class="flex items-center space-x-3 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                <button @click="selectedTruck = truck; showDetailsModal = true"
                  class="flex items-center justify-center w-10 h-10 rounded-xl text-[#4A8BDF] bg-[#E6F0FA] border border-[#CCE0F5] hover:bg-indigo-100 hover:border-indigo-300 transition-all group-hover:shadow-[0_4px_12px_rgba(74,139,223,0.15)]"
                  title="View Details">
                  <span class="material-icons text-xl">visibility</span>
                </button>
                <button @click="processExit(truck)" 
                  class="relative overflow-hidden flex items-center justify-center space-x-2 px-6 h-10 rounded-xl font-black uppercase tracking-widest text-xs text-white bg-[#4A8BDF] hover:bg-[#66A2E1] shadow-[0_4px_12px_rgba(74,139,223,0.3)] hover:shadow-[0_4px_15px_rgba(74,139,223,0.4)] transition-all">
                  <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                  <span class="material-icons text-sm">local_shipping</span>
                  <span>CHECK OUT</span>
                </button>
              </div>
            </div>
          </div>
          
          <div v-if="completedTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
            <div class="relative mb-6">
              <div class="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center animate-gentle-float border border-slate-100">
                <span class="material-icons text-slate-300 text-5xl">cloud_queue</span>
              </div>
              <div class="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-[#E6F0FA] flex items-center justify-center animate-pulse">
                <span class="material-icons text-[#4A8BDF] text-xl">radar</span>
              </div>
            </div>
            <p class="text-base font-black text-slate-400 tracking-[0.3em] uppercase">No active operations</p>
            <p class="text-xs font-bold text-slate-400 mt-2 italic">Scanning for outgoing trucks...</p>
          </div>
        </transition-group>
      </div>
    </div>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'

const truckStore = useTruckStore()
const toast = useToast()
const { confirm } = useConfirm()
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const completedTrucks = computed(() => truckStore.trucks.filter(t => t.step === 'gate_out'))
const processExit = async (truck) => {
  const ok = await confirm({ title: 'Konfirmasi Gate Out', message: `Konfirmasi exit untuk ${truck.plateNumber}?`, type: 'success', confirmText: 'Check Out' })
  if (ok) {
    truckStore.updateTruckStatus(truck.id, 'completed', 'completed')
    toast.success(`${truck.plateNumber} berhasil check out!`)
  }
}
</script>
