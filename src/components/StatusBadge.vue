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
    required: true,
    validator: (value) => ['waiting', 'processing', 'completed'].includes(value)
  }
})

const badgeClasses = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'bg-[#A0006D]/10 text-[#A0006D] border border-[#A0006D]/20 shadow-sm'
    case 'processing':
      return 'bg-[#4A8BDF]/10 text-[#4A8BDF] border border-[#4A8BDF]/20 shadow-sm'
    case 'completed':
      return 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
    default:
      return 'bg-slate-50 text-slate-500 border border-slate-200'
  }
})

const dotClasses = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'bg-[#A0006D] animate-pulse'
    case 'processing':
      return 'bg-[#4A8BDF] animate-pulse'
    case 'completed':
      return 'bg-emerald-500'
    default:
      return 'bg-slate-400'
  }
})

const label = computed(() => props.status)
</script>
