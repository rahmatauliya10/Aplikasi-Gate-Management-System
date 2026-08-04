<template>
  <div class="w-full pt-3 pb-8 overflow-x-auto hide-scrollbar">
    <div class="min-w-[580px] px-3 relative">
      <!-- Background & Progress Track -->
      <div class="flex items-start justify-between relative">
        <!-- Connecting Line (Centered Vertically at 22px behind 44px circles) -->
        <div class="absolute left-10 right-10 top-[22px] -translate-y-1/2 h-1 z-0 bg-slate-200/80 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700 ease-out"
            :style="{ width: progressWidth, background: 'linear-gradient(90deg, #4A8BDF, #A0006D)', boxShadow: '0 0 12px rgba(74,139,223,0.4)' }"
          ></div>
        </div>
.
        <!-- Step Items -->
        <div
          v-for="(step, index) in steps"
          :key="step.key"
          class="flex flex-col items-center relative z-10 w-20 text-center group"
        >
          <!-- Step Indicator Icon Circle -->
          <div class="relative flex items-center justify-center">
            <div
              class="w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-500 shadow-md cursor-help group-hover:scale-105"
              :class="getStepClasses(step.key)"
              :style="getStepStyle(step.key)"
            >
              <span v-if="isCompleted(step.key)" class="material-icons text-lg text-white">done_all</span>
              <span v-else-if="isCurrent(step.key)" class="material-icons text-lg text-white animate-pulse">sync</span>
              <span v-else class="text-[11px] font-black tracking-widest">{{ index + 1 }}</span>
            </div>

            <!-- Active Glow Pulse Ring -->
            <div v-if="isCurrent(step.key)"
              class="absolute -inset-1 rounded-2xl animate-ping opacity-30 border-2 border-[#4A8BDF] pointer-events-none"></div>
          </div>

          <!-- Label -->
          <div class="mt-2.5 flex flex-col items-center justify-start h-9">
            <span class="text-[9px] font-black uppercase tracking-wider leading-tight transition-colors duration-300 px-0.5"
                  :class="isCompleted(step.key) ? 'text-slate-600' : isCurrent(step.key) ? 'text-[#4A8BDF] font-black' : 'text-slate-400'">
              {{ step.label }}
            </span>
            <div v-if="isCurrent(step.key)" class="w-1.5 h-1.5 rounded-full bg-[#4A8BDF] mt-1 shadow-[0_0_6px_#4A8BDF]"></div>
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
  processType: { type: String, default: 'GBB' }
})

const steps = computed(() => {
  if (props.processType === 'GBJ') { 
    return [
      { key: 'gate_in', label: 'Gate In' },
      { key: 'weigh_in', label: 'WB In' },
      { key: 'qc_vehicle', label: 'QC Vehicle' },
      { key: 'warehouse', label: 'Loading GBJ' },
      { key: 'weigh_out', label: 'WB Out' },
      { key: 'completed', label: 'Dispatch' }
    ]
  } else if (props.processType === 'GSP') { 
    return [
      { key: 'gate_in', label: 'Gate In' },
      { key: 'weigh_in', label: 'WB In' },
      { key: 'qc_vehicle', label: 'Sampling GSP' },
      { key: 'warehouse', label: 'Process GSP' },
      { key: 'incoming_check', label: 'Material Check' },
      { key: 'weigh_out', label: 'WB Out' },
      { key: 'completed', label: 'Dispatch' }
    ]
  }
  
  return [
    { key: 'gate_in', label: 'Gate In' },
    { key: 'weigh_in', label: 'WB In' },
    { key: 'qc_vehicle', label: 'QC Sampling' },
    { key: 'warehouse', label: 'Loading GBB' },
    { key: 'incoming_check', label: 'QC Lab' },
    { key: 'weigh_out', label: 'WB Out' },
    { key: 'completed', label: 'Dispatch' }
  ]
})

const mappedStepKey = computed(() => {
  const status = props.currentStep;
  if (status === 'REGISTERED') return 'weigh_in';
  if (status === 'WEIGH_IN_DONE') return 'qc_vehicle';
  if (status === 'QC_VEHICLE_PENDING') return 'qc_vehicle';
  if (status === 'QC_VEHICLE_IN_PROGRESS') return 'qc_vehicle';
  if (status === 'QC_VEHICLE_PASSED') return 'warehouse';
  if (status === 'WAREHOUSE_IN_PROGRESS') return 'warehouse';
  if (status === 'WAREHOUSE_DONE') {
    return props.processType === 'GBJ' ? 'weigh_out' : 'incoming_check';
  }
  if (status === 'INCOMING_CHECK_PENDING') return 'incoming_check';
  if (status === 'INCOMING_CHECK_IN_PROGRESS') return 'incoming_check';
  if (status === 'INCOMING_CHECK_PASSED') return 'weigh_out';
  if (status === 'INCOMING_CHECK_REJECTED') return 'incoming_check';
  if (status === 'QC_VEHICLE_REJECTED') return 'weigh_out';
  if (status === 'WEIGH_OUT_DONE') return 'completed';
  if (status === 'COMPLETED') return 'completed';
  return 'gate_in';
})

const stepOrder = computed(() => steps.value.map(s => s.key))

const progressWidth = computed(() => {
  const currentIndex = stepOrder.value.indexOf(mappedStepKey.value)
  if (currentIndex <= 0) return '0%'
  const total = steps.value.length - 1
  return `${(currentIndex / total) * 100}%`
})

const getStepClasses = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(mappedStepKey.value)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  if (stepIndex < currentIndex || props.currentStep === 'COMPLETED') {
    return 'border-white/20'
  } else if (stepKey === mappedStepKey.value) {
    return 'border-white/30'
  } else {
    return 'bg-white border-slate-100 text-slate-300'
  }
}

const getStepStyle = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(mappedStepKey.value)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  if (stepKey === mappedStepKey.value && props.currentStep.includes('REJECTED')) {
    return 'background: linear-gradient(135deg, #EF4444, #B91C1C); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 12px 25px rgba(239,68,68,0.3);'
  } else if (stepIndex < currentIndex || props.currentStep === 'COMPLETED') {
    return 'background: linear-gradient(135deg, #10B981, #059669); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 20px rgba(16,185,129,0.2);'
  } else if (stepKey === mappedStepKey.value) {
    return 'background: linear-gradient(135deg, #4A8BDF, #3A6ABF); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 12px 25px rgba(74,139,223,0.3);'
  }
  return 'border: 1px solid #F1F5F9;'
}

const isCurrent = (stepKey) => stepKey === mappedStepKey.value && props.currentStep !== 'COMPLETED'
const isCompleted = (stepKey) => {
  const currentIndex = stepOrder.value.indexOf(mappedStepKey.value)
  const stepIndex = stepOrder.value.indexOf(stepKey)
  return stepIndex < currentIndex || props.currentStep === 'COMPLETED'
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
