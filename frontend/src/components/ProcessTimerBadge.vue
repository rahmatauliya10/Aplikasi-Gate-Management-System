<template>
  <span 
    :class="[badgeClasses, compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs']" 
    class="inline-flex items-center rounded-lg font-mono font-bold tracking-wide transition-all duration-300 select-none border shadow-sm"
  >
    <!-- Live pulsing dot for active timer -->
    <span 
      v-if="!endTime" 
      class="w-1.5 h-1.5 rounded-full mr-2 shrink-0 animate-pulse" 
      :class="dotClasses"
    ></span>
    <span v-else class="mr-1.5 text-[10px] opacity-70">✓</span>

    <!-- Optional Label -->
    <span v-if="label" class="mr-1.5 font-sans font-semibold text-[10px] opacity-80 uppercase tracking-wider">{{ label }}:</span>
    
    <!-- Timer String (MM:SS or HH:MM:SS) -->
    <span class="tabular-nums">{{ formattedDuration }}</span>

    <!-- SLA Breach warning icon -->
    <span v-if="isBreached && !endTime" class="ml-1.5 text-[10px] font-sans px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-extrabold uppercase animate-pulse">
      OVER SLA
    </span>
  </span>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  startTime: {
    type: [String, Number, Date],
    required: false,
    default: null
  },
  endTime: {
    type: [String, Number, Date],
    required: false,
    default: null
  },
  slaMinutes: {
    type: Number,
    default: 30
  },
  label: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: false
  }
})

const now = ref(Date.now())
let timerInterval = null

onMounted(() => {
  if (!props.endTime) {
    timerInterval = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

watch(() => props.endTime, (newVal) => {
  if (newVal && timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  } else if (!newVal && !timerInterval) {
    timerInterval = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
})

const elapsedSeconds = computed(() => {
  if (!props.startTime) return 0
  const start = new Date(props.startTime).getTime()
  if (isNaN(start)) return 0
  
  const end = props.endTime ? new Date(props.endTime).getTime() : now.value
  const diff = Math.max(0, Math.floor((end - start) / 1000))
  return diff
})

const elapsedMinutes = computed(() => {
  return elapsedSeconds.value / 60
})

const isCaution = computed(() => {
  return !props.endTime && elapsedMinutes.value >= (props.slaMinutes * 0.75) && elapsedMinutes.value < props.slaMinutes
})

const isBreached = computed(() => {
  return !props.endTime && elapsedMinutes.value >= props.slaMinutes
})

const formattedDuration = computed(() => {
  const totalSec = elapsedSeconds.value
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  
  const pad = (n) => n.toString().padStart(2, '0')
  
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
  }
  return `${pad(mins)}:${pad(secs)}`
})

const badgeClasses = computed(() => {
  if (props.endTime) {
    // Completed process style
    return 'bg-slate-100 text-slate-700 border-slate-200 shadow-none'
  }
  if (isBreached.value) {
    // SLA Breached (Industrial Crimson Alert)
    return 'bg-[#0F172A] text-red-400 border-red-500/60 shadow-md ring-1 ring-red-500/30'
  } else if (isCaution.value) {
    // Nearing SLA (Industrial Amber Caution)
    return 'bg-[#0F172A] text-amber-400 border-amber-500/50 shadow-md'
  } else {
    // Normal Active Timer (Industrial Emerald Control)
    return 'bg-[#0F172A] text-emerald-400 border-slate-700/80 shadow-md'
  }
})

const dotClasses = computed(() => {
  if (isBreached.value) return 'bg-red-500 shadow-[0_0_8px_#ef4444]'
  if (isCaution.value) return 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
  return 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
})
</script>
