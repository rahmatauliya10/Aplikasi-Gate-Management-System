<template>
  <span :class="badgeClasses" class="inline-flex items-center px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest animate-scaleSpringIn" style="transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);">
    <span class="w-1.5 h-1.5 rounded-full mr-2 shrink-0" :class="dotClasses"></span>
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { getStatusLabel } from '../utils/statusLabel'

const props = defineProps({
  status: {
    type: String,
    default: ''
  },
  processType: {
    type: String,
    default: ''
  }
})

const safeStatus = computed(() => props.status || '')

const badgeClasses = computed(() => {
  const s = safeStatus.value
  // PA_NOT_REQUIRED: neutral slate — never green/emerald (not a QC pass)
  if (s === 'PA_NOT_REQUIRED') {
    return 'bg-slate-100 text-slate-700 border border-slate-300 shadow-sm'
  }
  // Retest/disposition: distinct orange-warning styling
  if (
    s === 'QC_RETEST_REQUIRED' ||
    s === 'WAITING_GSP_DISPOSITION' ||
    s === 'WAITING_GSP_CHECKLIST_DISPOSITION' ||
    s === 'WAITING_UTILITY_DISPOSITION'
  ) {
    return 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
  }
  if (s.includes('PENDING')) {
    return 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm'
  } else if (s.includes('IN_PROGRESS') || s === 'REGISTERED') {
    return 'bg-[#4A8BDF]/10 text-[#4A8BDF] border border-[#4A8BDF]/20 shadow-sm'
  } else if (s.includes('DONE') || s.includes('PASSED') || s === 'COMPLETED') {
    return 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
  } else if (s.includes('REJECTED') || s.includes('HOLD')) {
    return 'bg-red-50 text-red-600 border border-red-200 shadow-sm'
  } else {
    return 'bg-slate-50 text-slate-500 border border-slate-200'
  }
})

const dotClasses = computed(() => {
  const s = safeStatus.value
  if (s === 'PA_NOT_REQUIRED') {
    return 'bg-slate-500'
  }
  if (
    s === 'QC_RETEST_REQUIRED' ||
    s === 'WAITING_GSP_DISPOSITION' ||
    s === 'WAITING_GSP_CHECKLIST_DISPOSITION' ||
    s === 'WAITING_UTILITY_DISPOSITION'
  ) {
    return 'bg-orange-500 animate-pulse'
  }
  if (s.includes('PENDING')) {
    return 'bg-amber-500 animate-pulse'
  } else if (s.includes('IN_PROGRESS') || s === 'REGISTERED') {
    return 'bg-[#4A8BDF] animate-pulse'
  } else if (s.includes('DONE') || s.includes('PASSED') || s === 'COMPLETED') {
    return 'bg-emerald-500'
  } else if (s.includes('REJECTED') || s.includes('HOLD')) {
    return 'bg-red-500'
  } else {
    return 'bg-slate-400'
  }
})

const label = computed(() => getStatusLabel(safeStatus.value, props.processType))
</script>
