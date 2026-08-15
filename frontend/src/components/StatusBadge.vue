<template>
  <span :class="badgeClasses" class="inline-flex items-center px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest animate-scaleSpringIn" style="transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);">
    <span class="w-1.5 h-1.5 rounded-full mr-2 shrink-0" :class="dotClasses"></span>
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    required: true
  },
  processType: {
    type: String,
    default: ''
  }
})

const badgeClasses = computed(() => {
  if (props.status.includes('PENDING')) {
    return 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm'
  } else if (props.status.includes('IN_PROGRESS') || props.status === 'REGISTERED') {
    return 'bg-[#4A8BDF]/10 text-[#4A8BDF] border border-[#4A8BDF]/20 shadow-sm'
  } else if (props.status.includes('DONE') || props.status.includes('PASSED') || props.status === 'COMPLETED') {
    return 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
  } else if (props.status.includes('REJECTED') || props.status.includes('HOLD')) {
    return 'bg-red-50 text-red-600 border border-red-200 shadow-sm'
  } else {
    return 'bg-slate-50 text-slate-500 border border-slate-200'
  }
})

const dotClasses = computed(() => {
  if (props.status.includes('PENDING')) {
    return 'bg-amber-500 animate-pulse'
  } else if (props.status.includes('IN_PROGRESS') || props.status === 'REGISTERED') {
    return 'bg-[#4A8BDF] animate-pulse'
  } else if (props.status.includes('DONE') || props.status.includes('PASSED') || props.status === 'COMPLETED') {
    return 'bg-emerald-500'
  } else if (props.status.includes('REJECTED') || props.status.includes('HOLD')) {
    return 'bg-red-500'
  } else {
    return 'bg-slate-400'
  }
})

const label = computed(() => {
  let s = props.status || ''
  if ((props.processType === 'GBB' || props.processType === 'GSP') && s.startsWith('QC_VEHICLE')) {
    s = s.replace('QC_VEHICLE', 'QC_SAMPLING')
  }
  return s.replace(/_/g, ' ')
})
</script>
