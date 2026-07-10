<template>
  <div class="rounded-2xl border overflow-hidden shadow-sm animate-fadeInUp transition-all duration-300 hover:shadow-md" style="background: white; border-color: #E8EEF7;">
    <div class="flex items-center space-x-3 p-4 border-b border-slate-100" style="background: #FAFBFF;">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center animate-scaleSpringIn" style="background: rgba(74,139,223,0.1); border: 1px solid rgba(74,139,223,0.2);">
        <span class="material-icons text-[#4A8BDF] text-[16px]">scale</span>
      </div>
      <div>
        <h3 class="text-xs font-black text-slate-800 tracking-tight">{{ label }}</h3>
        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Weighbridge Input</p>
      </div>
    </div>

    <div class="p-5 space-y-5">
      <!-- Input Field -->
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Digital Scale Reading</label>
          <span class="flex h-1.5 w-1.5 relative">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#66A2E1] opacity-75"></span>
            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#4A8BDF]"></span>
          </span>
        </div>
        <div class="relative bg-white rounded-xl p-1 shadow-[inset_0_2px_8px_rgba(0,0,0,0.03)] border border-slate-200 focus-within:border-[#4A8BDF] focus-within:shadow-[0_0_0_3px_rgba(74,139,223,0.1)] transition-all duration-300 group">
          <div class="absolute inset-0 bg-slate-50/50 pointer-events-none rounded-xl"></div>
          <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xl z-10 transition-colors group-focus-within:text-[#4A8BDF]">monitor_weight</span>
          <input
            type="number"
            v-model.number="weightValue"
            class="w-full h-14 pl-10 pr-12 bg-transparent text-2xl font-black text-right outline-none transition-all relative z-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-800 placeholder:text-slate-300"
            style="font-family: 'JetBrains Mono', 'Courier New', monospace;"
            placeholder="0"
            min="0"
          />
          <div class="absolute inset-y-0 right-4 flex items-center pointer-events-none z-10">
            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-[#4A8BDF] transition-colors">kg</span>
          </div>
        </div>
      </div>

      <!-- Previous Weight & Deviation -->
      <transition name="fade-slide" appear>
        <div v-if="previousWeight" class="flex flex-col space-y-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1.5">
              <span class="material-icons text-slate-400 text-[14px]">history</span>
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Previous Reading</span>
            </div>
            <span class="font-black font-mono text-slate-700 text-sm">{{ previousWeight.toLocaleString() }}
              <span class="text-[9px] font-bold text-slate-400 ml-0.5">KG</span>
            </span>
          </div>
          
          <transition name="fade" mode="out-in">
            <div v-if="weightValue > 0" class="flex items-center justify-between pt-2.5 border-t border-slate-200/80">
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Deviation</span>
              <div class="flex items-center space-x-1.5">
                <span class="text-xs font-black font-mono" :class="deviationClass">
                  {{ deviationValue > 0 ? '+' : '' }}{{ deviationValue.toLocaleString() }} KG
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded font-black font-mono"
                      :class="deviationBgClass">
                  {{ deviationPercent }}%
                </span>
              </div>
            </div>
          </transition>
        </div>
      </transition>

      <!-- Submit Button -->
      <button
        @click="submitWeight"
        :disabled="!isValid || isSubmitting"
        class="relative w-full py-3.5 rounded-xl overflow-hidden transition-all duration-300 group flex items-center justify-center space-x-2"
        :class="(!isValid || isSubmitting) ? 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-[#4A8BDF] text-white hover:bg-[#3A6ABF] hover:shadow-[0_6px_20px_rgba(74,139,223,0.3)] active:scale-[0.98] border border-transparent'"
      >
        <div v-if="isValid && !isSubmitting" class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none"></div>
        <span v-if="isSubmitting" class="material-icons font-bold text-[16px] relative z-10 transition-transform animate-spin">autorenew</span>
        <span v-else class="material-icons font-bold text-[16px] relative z-10 transition-transform group-hover:scale-110">fingerprint</span>
        <span class="uppercase font-black tracking-widest text-[10px] relative z-10">{{ isSubmitting ? 'SAVING...' : 'Save Weight' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  label: { type: String, default: 'Scale Input' },
  previousWeight: { type: Number, default: null },
  isSubmitting: { type: Boolean, default: false }
})

const emit = defineEmits(['save'])
const weightValue = ref(null)
const isValid = computed(() => weightValue.value !== null && weightValue.value > 0)

const deviationValue = computed(() => {
  if (!weightValue.value || !props.previousWeight) return 0
  return weightValue.value - props.previousWeight
})

const deviationPercent = computed(() => {
  if (!weightValue.value || !props.previousWeight) return '0.00'
  return ((Math.abs(deviationValue.value) / props.previousWeight) * 100).toFixed(2)
})

const deviationClass = computed(() => {
  const pct = parseFloat(deviationPercent.value)
  if (pct <= 2) return 'text-emerald-600'
  if (pct <= 5) return 'text-amber-600'
  return 'text-red-600'
})

const deviationBgClass = computed(() => {
  const pct = parseFloat(deviationPercent.value)
  if (pct <= 2) return 'bg-emerald-100/50 text-emerald-700'
  if (pct <= 5) return 'bg-amber-100/50 text-amber-700'
  return 'bg-red-100/50 text-red-700'
})

const submitWeight = () => {
  if (isValid.value) {
    emit('save', weightValue.value)
    weightValue.value = null
  }
}
</script>
