<template>
  <span 
    :class="[badgeClasses, compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs']" 
    class="inline-flex items-center rounded-xl font-mono font-bold tracking-wide transition-all duration-300 select-none border shadow-2xs"
  >
    <!-- Live pulsing dot for active timer -->
    <span 
      v-if="!endTime" 
      class="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" 
      :class="dotClasses"
    ></span>
    <span v-else class="mr-1.5 text-[10px] text-slate-400">✓</span>

    <!-- Optional Label -->
    <span v-if="label" class="mr-1.5 font-sans font-bold text-[10px] uppercase tracking-wider opacity-75">{{ label }}:</span>
    
    <!-- Timer String (MM:SS or HH:MM:SS) -->
    <span class="tabular-nums font-semibold">{{ formattedDuration }}</span>

    <!-- SLA Breach warning tag -->
    <span v-if="isBreached && !endTime" class="ml-1.5 text-[9px] font-sans px-1.5 py-0.5 rounded-md bg-red-100/90 text-red-700 font-black uppercase border border-red-200/70">
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
    // Completed process style (clean neutral slate)
    return 'bg-slate-50 text-slate-600 border-slate-200/80 shadow-none'
  }
  if (isBreached.value) {
    // SLA Breached (Soft Red / Rose matching template)
    return 'bg-red-50/90 text-red-700 border-red-200/90'
  } else if (isCaution.value) {
    // Nearing SLA (Soft Amber Caution)
    return 'bg-amber-50/90 text-amber-800 border-amber-200/90'
  } else {
    // Normal Active Timer (Soft Slate matching template)
    return 'bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200/80'
  }
})

const dotClasses = computed(() => {
  if (isBreached.value) return 'bg-red-500 animate-pulse'
  if (isCaution.value) return 'bg-amber-500 animate-pulse'
  return 'bg-emerald-500 animate-pulse'
})
</script>
