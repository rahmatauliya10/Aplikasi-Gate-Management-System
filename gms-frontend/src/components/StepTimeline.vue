<template>
  <div class="w-full py-8">
    <div class="flex items-center justify-between relative px-2">
      <!-- Background Track (Cyber Style) -->
      <div class="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-1 rounded-full -z-10 transition-all duration-500 overflow-hidden"
        style="background: rgba(74,139,223,0.05); border: 1px solid rgba(74,139,223,0.05);">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"></div>
      </div>
      
      <!-- Progress Track (Glowing Gradient) -->
      <div
        class="absolute left-10 top-1/2 -translate-y-1/2 h-1 -z-10 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden"
        :style="{ width: progressWidth, background: 'linear-gradient(90deg, #4A8BDF, #A0006D)', boxShadow: '0 0 20px rgba(74,139,223,0.4)' }"
      >
        <div class="absolute inset-0 shimmer-effect"></div>
      </div>

      <div
        v-for="(step, index) in steps"
        :key="step.key"
        class="flex flex-col items-center relative group"
      >
        <!-- Step Indicator -->
        <div class="relative z-10">
          <div
            class="w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-700 animate-scaleSpringIn shadow-lg cursor-help group-hover:scale-110"
            :class="getStepClasses(step.key)"
            :style="[getStepStyle(step.key), { animationDelay: `${index * 120}ms` }]"
          >
            <span v-if="isCompleted(step.key)" class="material-icons text-[18px] text-white">done_all</span>
            <span v-else-if="isCurrent(step.key)" class="material-icons text-[18px] text-white animate-pulse">sync</span>
            <span v-else class="text-[11px] font-black tracking-widest">{{ index + 1 }}</span>
          </div>

          <!-- Active Glow Pulse -->
          <div v-if="isCurrent(step.key)"
            class="absolute -inset-2 rounded-[1.5rem] animate-pulse -z-10"
            style="background: radial-gradient(circle, rgba(74,139,223,0.2) 0%, transparent 70%);"></div>
          
          <div v-if="isCurrent(step.key)"
            class="absolute -inset-1 rounded-[1.25rem] border border-[#4A8BDF]/40 animate-ping opacity-40 -z-10"></div>
        </div>

        <!-- Label (High-Tech Style) -->
        <div
          class="mt-4 absolute w-24 text-center transition-all duration-500 animate-fadeInUp"
          :style="{ bottom: '-35px', animationDelay: `${index * 120 + 80}ms` }"
        >
          <div class="flex flex-col items-center">
            <span class="text-[9px] font-black uppercase tracking-[0.2em] transition-colors duration-500"
                  :class="isCompleted(step.key) ? 'text-slate-500' : isCurrent(step.key) ? 'text-[#4A8BDF]' : 'text-slate-400'">
              {{ step.label }}
            </span>
            <div v-if="isCurrent(step.key)" class="w-1.5 h-1.5 rounded-full bg-[#4A8BDF] mt-1 shadow-[0_0_8px_#4A8BDF]"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentStep: { type: String, required: true },
  processType: { type: String, default: 'Unloading' }
})

const steps = computed(() => {
  let warehouseLabel = 'Inbound'
  let warehouseKey = 'gbb'
  if (props.processType === 'GBJ') { warehouseLabel = 'Outbound'; warehouseKey = 'gbj' }
  else if (props.processType === 'GSP' || props.currentStep === 'gsp') { warehouseLabel = 'Service'; warehouseKey = 'gsp' }
  return [
    { key: 'security', label: 'Security' },
    { key: 'weighbridge_in', label: 'WB In' },
    { key: warehouseKey, label: warehouseLabel },
    { key: 'qc', label: 'QC Audit' },
    { key: 'weighbridge_out', label: 'WB Out' },
    { key: 'completed', label: 'Dispatch' }
  ]
})

const stepOrder = computed(() => steps.value.map(s => s.key))

const progressWidth = computed(() => {
  const currentIndex = stepOrder.value.indexOf(props.currentStep)
  if (currentIndex <= 0) return '0%'
  const total = steps.value.length - 1
  return `${(currentIndex / total) * 100}%`
})

const getStepClasses = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(props.currentStep)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  if (stepIndex < currentIndex || props.currentStep === 'completed') {
    return 'border-white/20'
  } else if (stepKey === props.currentStep) {
    return 'border-white/30'
  } else {
    return 'bg-white border-slate-100 text-slate-300'
  }
}

const getStepStyle = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(props.currentStep)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  if (stepIndex < currentIndex || props.currentStep === 'completed') {
    return 'background: linear-gradient(135deg, #10B981, #059669); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 20px rgba(16,185,129,0.2);'
  } else if (stepKey === props.currentStep) {
    return 'background: linear-gradient(135deg, #4A8BDF, #3A6ABF); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 12px 25px rgba(74,139,223,0.3);'
  }
  return 'border: 1px solid #F1F5F9;'
}

const isCurrent = (stepKey) => stepKey === props.currentStep
const isCompleted = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(props.currentStep)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  return stepIndex < currentIndex || props.currentStep === 'completed'
}
</script>

<style scoped>
.shimmer-effect {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
