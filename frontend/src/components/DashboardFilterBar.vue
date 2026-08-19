<template>
  <div class="flex flex-col xl:flex-row items-stretch xl:items-center gap-2 sm:gap-3 w-full xl:w-auto">
    <!-- Presets Selector -->
    <div class="flex items-center p-1 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-md overflow-x-auto hide-scrollbar shrink-0">
      <button
        v-for="p in presets"
        :key="p.key"
        @click="selectPreset(p.key)"
        :class="[
          currentPreset === p.key
            ? 'bg-[#4A8BDF] text-white font-black shadow-sm'
            : 'text-slate-600 hover:text-slate-900 font-bold hover:bg-slate-50/80'
        ]"
        class="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-[11px] uppercase tracking-wider rounded-xl transition-all duration-200 whitespace-nowrap flex items-center space-x-1.5 active:scale-95"
      >
        <span>{{ p.label }}</span>
      </button>
    </div>

    <!-- Date Range Inputs + Reset Button -->
    <div class="flex items-center gap-2 sm:gap-2.5 p-1 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-md shrink-0">
      <div class="flex items-center space-x-1.5 pl-2 text-slate-400">
        <span class="material-icons text-sm sm:text-base text-[#4A8BDF]">event</span>
      </div>

      <div class="relative">
        <input
          type="date"
          v-model="internalStartDate"
          :max="todayStr"
          @change="handleCustomDateChange"
          class="h-8 sm:h-9 px-2 sm:px-3 bg-slate-50/80 hover:bg-white border border-slate-200 rounded-xl text-[11px] sm:text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:bg-white transition-all cursor-pointer shadow-2xs font-mono"
          title="Tanggal Mulai"
        />
      </div>

      <span class="text-[10px] sm:text-xs font-black text-slate-400 select-none">s/d</span>

      <div class="relative">
        <input
          type="date"
          v-model="internalEndDate"
          :max="todayStr"
          @change="handleCustomDateChange"
          class="h-8 sm:h-9 px-2 sm:px-3 bg-slate-50/80 hover:bg-white border border-slate-200 rounded-xl text-[11px] sm:text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:bg-white transition-all cursor-pointer shadow-2xs font-mono"
          title="Tanggal Akhir"
        />
      </div>

      <button
        @click="resetToDefault"
        class="h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-200 flex items-center space-x-1 active:scale-95 shrink-0"
        title="Reset ke Hari Ini"
      >
        <span class="material-icons text-sm" :class="{ 'animate-spin': loading }">refresh</span>
        <span class="hidden sm:inline">Reset</span>
      </button>
    </div>

    <!-- Future Extension Slot (e.g. Process Filter) -->
    <slot name="extra-filters"></slot>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from '../composables/useToast'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ preset: 'TODAY', startDate: '', endDate: '' })
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])
const toast = useToast()

const presets = [
  { key: 'TODAY', label: 'Hari Ini' },
  { key: 'THIS_WEEK', label: 'Minggu Ini' },
  { key: 'THIS_MONTH', label: 'Bulan Ini' },
  { key: 'ALL', label: 'Semua' }
]

const currentPreset = ref(props.modelValue?.preset || 'TODAY')
const internalStartDate = ref(props.modelValue?.startDate || '')
const internalEndDate = ref(props.modelValue?.endDate || '')

// Jakarta Today format YYYY-MM-DD
const getJakartaTodayStr = () => {
  const now = new Date()
  const tzOffset = 7 * 60
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const jakarta = new Date(utcMs + tzOffset * 60000)
  const y = jakarta.getFullYear()
  const m = String(jakarta.getMonth() + 1).padStart(2, '0')
  const d = String(jakarta.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const todayStr = computed(() => getJakartaTodayStr())

// Sync when external modelValue changes
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      currentPreset.value = newVal.preset || 'TODAY'
      internalStartDate.value = newVal.startDate || ''
      internalEndDate.value = newVal.endDate || ''
    }
  },
  { deep: true }
)

const selectPreset = (presetKey) => {
  currentPreset.value = presetKey
  const today = getJakartaTodayStr()

  if (presetKey === 'TODAY') {
    internalStartDate.value = today
    internalEndDate.value = today
  } else if (presetKey === 'THIS_WEEK') {
    const now = new Date()
    const tzOffset = 7 * 60
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
    const jakarta = new Date(utcMs + tzOffset * 60000)
    const day = jakarta.getDay()
    const distToMon = day === 0 ? 6 : day - 1
    const mon = new Date(jakarta)
    mon.setDate(jakarta.getDate() - distToMon)
    const y = mon.getFullYear()
    const m = String(mon.getMonth() + 1).padStart(2, '0')
    const d = String(mon.getDate()).padStart(2, '0')
    internalStartDate.value = `${y}-${m}-${d}`
    internalEndDate.value = today
  } else if (presetKey === 'THIS_MONTH') {
    const now = new Date()
    const tzOffset = 7 * 60
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
    const jakarta = new Date(utcMs + tzOffset * 60000)
    const y = jakarta.getFullYear()
    const m = String(jakarta.getMonth() + 1).padStart(2, '0')
    internalStartDate.value = `${y}-${m}-01`
    internalEndDate.value = today
  } else if (presetKey === 'ALL') {
    internalStartDate.value = ''
    internalEndDate.value = ''
  }

  notifyChange()
}

const handleCustomDateChange = () => {
  if (!internalStartDate.value || !internalEndDate.value) {
    // Wait until both are filled
    return
  }

  if (internalStartDate.value > internalEndDate.value) {
    toast.warning('Tanggal mulai tidak boleh melebihi tanggal akhir')
    internalStartDate.value = internalEndDate.value
  }

  if (internalEndDate.value > todayStr.value) {
    toast.warning('Tanggal akhir tidak boleh melebihi hari ini')
    internalEndDate.value = todayStr.value
  }

  currentPreset.value = 'CUSTOM'
  notifyChange()
}

const resetToDefault = () => {
  selectPreset('TODAY')
}

const notifyChange = () => {
  const payload = {
    preset: currentPreset.value,
    startDate: internalStartDate.value,
    endDate: internalEndDate.value
  }
  emit('update:modelValue', payload)
  emit('change', payload)
}

onMounted(() => {
  if (!internalStartDate.value && !internalEndDate.value && currentPreset.value === 'TODAY') {
    const today = getJakartaTodayStr()
    internalStartDate.value = today
    internalEndDate.value = today
  }
})
</script>
