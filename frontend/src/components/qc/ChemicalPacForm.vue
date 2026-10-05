<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 bg-sky-50 rounded-2xl border border-sky-200">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black">
          <span class="material-icons text-xl">science</span>
        </div>
        <div>
          <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider">Analisis PA — Bahan Kimia PAC</h4>
          <p class="text-[11px] text-slate-500 font-medium">PAC 280 AC / POLYCOR P9 / IPAC CIP A200 (SOP-GSP-2026.1)</p>
        </div>
      </div>
      <span class="px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-800 border border-sky-300">
        Uji Tunggal Sebelum Bongkar
      </span>
    </div>

    <!-- 1. Sensory Evaluation -->
    <div class="space-y-3">
      <h5 class="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-sky-600"></span>
        1. Pemeriksaan Visual & Sensori
      </h5>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="flex items-start space-x-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
          <input type="checkbox" v-model="formData.sensory.visual" class="mt-0.5 rounded text-[#4A8BDF] focus:ring-0 w-4 h-4 cursor-pointer" />
          <div class="text-xs">
            <span class="font-bold text-slate-800 block">Kondisi Visual</span>
            <span class="text-slate-500 text-[11px]">Cairan jernih kekuningan / homogen</span>
          </div>
        </label>

        <label class="flex items-start space-x-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
          <input type="checkbox" v-model="formData.sensory.odor" class="mt-0.5 rounded text-[#4A8BDF] focus:ring-0 w-4 h-4 cursor-pointer" />
          <div class="text-xs">
            <span class="font-bold text-slate-800 block">Uji Bau</span>
            <span class="text-slate-500 text-[11px]">Khas PAC, bebas kontaminasi asing</span>
          </div>
        </label>

        <label class="flex items-start space-x-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
          <input type="checkbox" v-model="formData.sensory.packaging" class="mt-0.5 rounded text-[#4A8BDF] focus:ring-0 w-4 h-4 cursor-pointer" />
          <div class="text-xs">
            <span class="font-bold text-slate-800 block">Kemasan & Segel</span>
            <span class="text-slate-500 text-[11px]">Tangki / drum utuh, segel terpasang</span>
          </div>
        </label>
      </div>
    </div>

    <!-- 2. Laboratory Parameter Testing -->
    <div class="space-y-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
      <div class="flex items-center justify-between">
        <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span class="material-icons text-base text-sky-600">biotech</span>
          2. Parameter Fisika-Kimia Laboratorium
        </h5>
        <span class="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">Metode Uji Standar</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- pH -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">pH (25°C) *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: 3.50 - 5.00</span>
          </div>
          <input
            type="number"
            step="0.01"
            v-model.number="formData.ph"
            placeholder="Contoh: 4.20"
            id="input-pac-ph"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isPhValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
        </div>

        <!-- Specific Gravity / Density -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">Density (g/mL) *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: 1.170 - 1.260</span>
          </div>
          <input
            type="number"
            step="0.001"
            v-model.number="formData.density"
            placeholder="Contoh: 1.210"
            id="input-pac-density"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isDensityValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
        </div>

        <!-- Alumina Content -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">Al2O3 (%)</label>
            <span class="text-[10px] font-bold text-slate-400">Std: Min 9.0%</span>
          </div>
          <input
            type="number"
            step="0.1"
            v-model.number="formData.aluminaContent"
            placeholder="Contoh: 10.5"
            class="w-full h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#4A8BDF]"
          />
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Catatan Analis</label>
      <textarea
        v-model="formData.notes"
        rows="2"
        placeholder="Keterangan tambahan atau nomor batch COA supplier..."
        class="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#4A8BDF]"
      ></textarea>
    </div>

    <!-- Actions -->
    <div class="pt-4 border-t border-slate-100 flex flex-col md:flex-row gap-3">
      <button
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting || !isFormComplete || !isAllInSpec"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-pac-release"
      >
        <span class="material-icons text-base">send</span>
        <span>Kirim Hasil Analisis PA</span>
      </button>

      <button
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting"
        class="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all flex items-center justify-center gap-2"
        id="btn-pac-reject"
      >
        <span class="material-icons text-base">send</span>
        <span>Kirim Hasil Analisis PA</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed } from 'vue'

const props = defineProps({
  transaction: { type: Object, required: true },
  isSubmitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const formData = reactive({
  sensory: {
    visual: false,
    odor: false,
    packaging: false,
  },
  ph: null,
  density: null,
  aluminaContent: null,
  notes: '',
})

const isPhValid = computed(() => {
  if (formData.ph == null) return true
  return formData.ph >= 3.50 && formData.ph <= 5.00
})

const isDensityValid = computed(() => {
  if (formData.density == null) return true
  return formData.density >= 1.170 && formData.density <= 1.260
})

const isSensoryComplete = computed(() => {
  return formData.sensory.visual && formData.sensory.odor && formData.sensory.packaging
})

const isFormComplete = computed(() => {
  return isSensoryComplete.value && formData.ph != null && formData.density != null
})

const isAllInSpec = computed(() => {
  if (!isFormComplete.value) return false
  return isPhValid.value && isDensityValid.value
})

const submitAnalysis = () => {
  emit('submit', {
    productCategory: 'Chemicals',
    productName: props.transaction.cargoSubType || 'PAC 280 AC',
    testRound: 1,
    parameters: {
      sensory: formData.sensory,
      ph: formData.ph,
      density: formData.density,
      aluminaContent: formData.aluminaContent,
    },
    notes: formData.notes,
  })
}
</script>
