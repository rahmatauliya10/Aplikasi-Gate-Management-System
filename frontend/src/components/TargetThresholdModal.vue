<template>
  <teleport to="body">
  <transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)">
      
      <!-- Modal Content -->
      <div class="bg-white rounded-3xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden shadow-2xl relative transition-all"
           style="border:1px solid rgba(255,255,255,0.2)">
        
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div class="flex items-center space-x-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.2)">
              <span class="material-icons text-emerald-500 text-xl">tune</span>
            </div>
            <div>
              <h2 class="text-lg font-black text-slate-800 tracking-tight">Target & Threshold Setting</h2>
              <p class="text-[11px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">Manage operational targets, weight tolerance, and alert thresholds.</p>
            </div>
          </div>
          <button @click="$emit('close')" class="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-colors">
            <span class="material-icons">close</span>
          </button>
        </div>

        <div class="flex flex-1 overflow-hidden min-h-[400px]">
          <!-- Sidebar Tabs -->
          <div class="w-64 border-r border-slate-100 bg-slate-50/30 p-4 space-y-2 overflow-y-auto">
            <button @click="activeTab = 'weightTolerance'" :class="['w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all', activeTab === 'weightTolerance' ? 'bg-white border-slate-200 shadow-sm text-[#4A8BDF] font-black' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800 font-bold']" style="border-width: 1px;">
              <span class="material-icons text-[18px]">scale</span>
              <span class="text-xs">Weight Tolerance</span>
            </button>
            <button @click="activeTab = 'kpiTarget'" :class="['w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all', activeTab === 'kpiTarget' ? 'bg-white border-slate-200 shadow-sm text-[#4A8BDF] font-black' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800 font-bold']" style="border-width: 1px;">
              <span class="material-icons text-[18px]">insights</span>
              <span class="text-xs">Dashboard KPI Target</span>
            </button>
          </div>

          <!-- Content Area -->
          <div class="flex-1 overflow-y-auto p-6 bg-white">
            
            <!-- Weight Tolerance Setting -->
            <div v-if="activeTab === 'weightTolerance'" class="space-y-6 animate-fadeIn">
              <div>
                <h3 class="text-sm font-black text-slate-800">Weight Tolerance Setting</h3>
                <p class="text-xs text-slate-500 font-medium">Configure acceptable deviations and limits for weighing operations.</p>
              </div>
              
              <div class="space-y-4">
                <!-- targetDeviation -->
                <div class="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 flex items-center justify-between">
                  <div class="space-y-0.5">
                    <p class="text-xs font-black text-slate-800">Global Dashboard Deviation Tolerance</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Used in dashboard charts and gauges</p>
                  </div>
                  <div class="flex items-center space-x-2">
                    <input type="number" step="0.1" v-model.number="settingsStore.targetDeviation" @input="settingsStore.saveToStorage()" class="w-24 h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-black text-slate-800 outline-none focus:border-[#4A8BDF]" />
                    <span class="text-xs font-black text-slate-500">%</span>
                  </div>
                </div>

                <!-- Net Weight Variance -->
                <div class="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 flex items-center justify-between">
                  <div class="space-y-0.5">
                    <p class="text-xs font-black text-slate-800">Net Weight Variance Limit (Fraud Check)</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Triggers fraud alerts on weight discrepancies</p>
                  </div>
                  <div class="flex items-center space-x-2">
                    <input type="number" step="0.1" v-model.number="settingsStore.weightTolerances[2].toleranceValue" @input="settingsStore.saveToStorage()" class="w-24 h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-black text-slate-800 outline-none focus:border-[#4A8BDF]" />
                    <span class="text-xs font-black text-slate-500">%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dashboard KPI Target -->
            <div v-if="activeTab === 'kpiTarget'" class="space-y-6 animate-fadeIn">
              <div>
                <h3 class="text-sm font-black text-slate-800">Dashboard KPI Target</h3>
                <p class="text-xs text-slate-500 font-medium">Standard baseline targets for dashboard KPI metrics.</p>
              </div>

              <!-- targetTat -->
              <div class="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 flex items-center justify-between">
                <div class="space-y-0.5">
                  <p class="text-xs font-black text-slate-800">Global Average Turnaround Time Target</p>
                  <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Target completion duration from Gate In to Gate Out</p>
                </div>
                <div class="flex items-center space-x-2">
                  <input type="number" v-model.number="settingsStore.targetTat" @input="settingsStore.saveToStorage()" class="w-24 h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-black text-slate-800 outline-none focus:border-[#4A8BDF]" />
                  <span class="text-xs font-black text-slate-500">Mins</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </transition>
  </teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

defineProps({
  isOpen: Boolean
})

defineEmits(['close'])

const settingsStore = useSettingsStore()
const activeTab = ref('weightTolerance')
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.animate-fadeIn {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
