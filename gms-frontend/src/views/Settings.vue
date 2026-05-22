<template>
  <div class="space-y-8 pb-10">
    <!-- Hero Header -->
    <PageHeader title="System Settings" subtitle="Configuration Parameters" :showBadge="false" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      <!-- Target TAT -->
      <div class="p-6 rounded-2xl animate-fadeInUp stagger-1" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
        <div class="flex items-center space-x-3 mb-5">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(160,0,109,0.1),rgba(160,0,109,0.05));border:1px solid rgba(160,0,109,0.2)">
            <span class="material-icons text-[#A0006D] text-lg">speed</span>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900">Target TAT</h3>
            <p class="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Turnaround Time (minutes)</p>
          </div>
        </div>
        <input type="number" v-model.number="settingsStore.targetTat"
          class="w-full px-4 py-3 rounded-xl outline-none font-black text-lg text-slate-900 transition-all"
          style="background:#F8FAFC;border:2px solid #E8EEF7"
          onfocus="this.style.borderColor='#4A8BDF';this.style.boxShadow='0 0 0 4px rgba(74,139,223,0.08)'"
          onblur="this.style.borderColor='#E8EEF7';this.style.boxShadow='none'"
          min="1">
        <p class="text-[11px] text-slate-600 mt-2 font-medium">Used to evaluate bottlenecks in the dashboard.</p>
      </div>

      <!-- Risk Threshold -->
      <div class="p-6 rounded-2xl animate-fadeInUp stagger-2" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
        <div class="flex items-center space-x-3 mb-5">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.2)">
            <span class="material-icons text-red-500 text-lg">gavel</span>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900">Risk Threshold</h3>
            <p class="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Fraud Deviation (%)</p>
          </div>
        </div>
        <input type="number" v-model.number="settingsStore.targetDeviation"
          class="w-full px-4 py-3 rounded-xl outline-none font-black text-lg transition-all"
          style="background:rgba(239,68,68,0.03);border:2px solid rgba(239,68,68,0.15);color:#DC2626"
          onfocus="this.style.borderColor='#EF4444';this.style.boxShadow='0 0 0 4px rgba(239,68,68,0.08)'"
          onblur="this.style.borderColor='rgba(239,68,68,0.15)';this.style.boxShadow='none'"
          step="0.1" min="0">
        <p class="text-[11px] text-slate-600 mt-2 font-medium">Tonnage discrepancies above this percentage will trigger alerts.</p>
      </div>
    </div>

    <!-- Save Button -->
    <div class="mt-8 flex justify-end max-w-3xl">
      <button @click="handleSave" class="px-8 py-3 rounded-xl font-black text-white flex items-center space-x-2 transition-all hover:shadow-lg active:scale-[0.98]" style="background: linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 4px 15px rgba(74,139,223,0.3);">
        <span class="material-icons text-[18px]">save</span>
        <span>Save Configuration</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import PageHeader from '../components/PageHeader.vue'
import { useToast } from '../composables/useToast'

const settingsStore = useSettingsStore()
const toast = useToast()

onMounted(() => {
  settingsStore.loadSettings()
})

const handleSave = () => {
  const tat = settingsStore.targetTat
  const dev = settingsStore.targetDeviation
  
  if (tat === null || tat === undefined || tat <= 0 || isNaN(tat)) {
    toast.error('Target TAT must be a positive number.')
    return
  }
  if (dev === null || dev === undefined || dev < 0 || isNaN(dev)) {
    toast.error('Risk Threshold must be a positive number.')
    return
  }
  
  settingsStore.saveSettings()
  toast.success('Configuration saved successfully!')
}
</script>
