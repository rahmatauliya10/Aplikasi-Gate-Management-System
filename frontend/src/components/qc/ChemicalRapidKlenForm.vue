<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 bg-purple-50 rounded-2xl border border-purple-200">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black">
          <span class="material-icons text-xl">sanitizer</span>
        </div>
        <div>
          <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider">Analisis PA — Bahan Kimia Pembersih CIP</h4>
          <p class="text-[11px] text-slate-500 font-medium">Rapid Klen / PRO-CIP B++ (SOP-GSP-2026.1)</p>
        </div>
      </div>
      <span class="px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-300">
        Uji Tunggal Sebelum Bongkar
      </span>
    </div>

    <!-- 1. Sensory Evaluation -->
    <div class="space-y-3">
      <h5 class="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-purple-700"></span>
        1. Pemeriksaan Visual & Kemasan (Authoritative Laboratory Sheet)
      </h5>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Visual -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Kondisi Visual *</label>
          <select
            v-model="formData.sensory.visual"
            id="select-rapid-visual"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isVisualValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          >
            <option value="Jernih">Jernih (Sesuai)</option>
            <option value="Keruh">Keruh (OOS)</option>
            <option value="Berwarna">Berwarna (OOS)</option>
          </select>
        </div>

        <!-- Foreign Matters -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Foreign Matters *</label>
          <select
            v-model="formData.sensory.foreignMatters"
            id="select-rapid-foreign-matters"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isForeignMattersValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          >
            <option value="Tidak ada kontaminasi">Tidak ada kontaminasi (Sesuai)</option>
            <option value="Ada kontaminasi">Ada kontaminasi (OOS)</option>
          </select>
        </div>

        <!-- Kemasan -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Integritas Kemasan *</label>
          <select
            v-model="formData.sensory.packagingLabel"
            id="select-rapid-packaging"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isPackagingValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          >
            <option value="Kemasan & label tidak rusak">Kemasan & label tidak rusak (Sesuai)</option>
            <option value="Kemasan rusak / Segel terbuka">Kemasan rusak / Segel terbuka (OOS)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. Laboratory Parameter Testing -->
    <div class="space-y-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
      <div class="flex items-center justify-between">
        <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span class="material-icons text-base text-purple-700">science</span>
          2. Parameter Alkalinitas & Fisika Laboratorium
        </h5>
        <span class="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">Batas Wajib Strict (>)</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Alkalinity Na2O -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">Na2O (%) *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: &gt; 35.00%</span>
          </div>
          <input
            type="number"
            step="0.01"
            v-model.number="formData.alkalinityNa2O"
            placeholder="Contoh: 36.20"
            id="input-rapid-na2o"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isNa2OValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
          <p v-if="formData.alkalinityNa2O != null && !isNa2OValid" class="text-[10px] font-bold text-red-500 mt-1">
            Wajib &gt; 35.00% (batas persis = GAGAL)
          </p>
        </div>

        <!-- Alkalinity NaOH -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">NaOH (%) *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: &gt; 45.16%</span>
          </div>
          <input
            type="number"
            step="0.01"
            v-model.number="formData.alkalinityNaOH"
            placeholder="Contoh: 46.50"
            id="input-rapid-naoh"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isNaOHValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
          <p v-if="formData.alkalinityNaOH != null && !isNaOHValid" class="text-[10px] font-bold text-red-500 mt-1">
            Wajib &gt; 45.16% (batas persis = GAGAL)
          </p>
        </div>

        <!-- pH -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">pH *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: &gt; 12.000</span>
          </div>
          <input
            type="number"
            step="0.001"
            v-model.number="formData.ph"
            placeholder="Contoh: 13.000"
            id="input-rapid-ph"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isPhValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
          <p v-if="formData.ph != null && !isPhValid" class="text-[10px] font-bold text-red-500 mt-1">
            Wajib &gt; 12.000 (batas persis = GAGAL)
          </p>
        </div>

        <!-- Density -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-[11px] font-black text-slate-600 uppercase">Density (g/mL) *</label>
            <span class="text-[10px] font-bold text-slate-400">Std: &gt; 1.400</span>
          </div>
          <input
            type="number"
            step="0.001"
            v-model.number="formData.density"
            placeholder="Contoh: 1.425"
            id="input-rapid-density"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="isDensityValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/50'"
          />
          <p v-if="formData.density != null && !isDensityValid" class="text-[10px] font-bold text-red-500 mt-1">
            Wajib &gt; 1.400 (batas persis = GAGAL)
          </p>
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Catatan Analis</label>
      <textarea
        v-model="formData.notes"
        rows="2"
        placeholder="Keterangan hasil titrasi atau nomor batch supplier..."
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
        id="btn-rapid-release"
      >
        <span class="material-icons text-base">send</span>
        <span>Kirim Hasil Analisis PA</span>
      </button>

      <button
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting || !isFormComplete"
        class="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all flex items-center justify-center gap-2"
        id="btn-rapid-reject"
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
    visual: 'Jernih',
    foreignMatters: 'Tidak ada kontaminasi',
    packagingLabel: 'Kemasan & label tidak rusak',
  },
  alkalinityNa2O: null,
  alkalinityNaOH: null,
  ph: null,
  density: null,
  notes: '',
})

const isVisualValid = computed(() => {
  return formData.sensory.visual === 'Jernih'
})

const isForeignMattersValid = computed(() => {
  return formData.sensory.foreignMatters === 'Tidak ada kontaminasi'
})

const isPackagingValid = computed(() => {
  return formData.sensory.packagingLabel === 'Kemasan & label tidak rusak'
})

// Authoritative rule: STRICTLY > (greater than)
const isNa2OValid = computed(() => {
  if (formData.alkalinityNa2O == null) return true
  return formData.alkalinityNa2O > 35.00
})

const isNaOHValid = computed(() => {
  if (formData.alkalinityNaOH == null) return true
  return formData.alkalinityNaOH > 45.16
})

const isPhValid = computed(() => {
  if (formData.ph == null) return true
  return formData.ph > 12.000
})

const isDensityValid = computed(() => {
  if (formData.density == null) return true
  return formData.density > 1.400
})

const isSensoryComplete = computed(() => {
  return isVisualValid.value && isForeignMattersValid.value && isPackagingValid.value
})

const isFormComplete = computed(() => {
  return (
    Boolean(formData.sensory.visual) &&
    Boolean(formData.sensory.foreignMatters) &&
    Boolean(formData.sensory.packagingLabel) &&
    formData.alkalinityNa2O != null &&
    formData.alkalinityNaOH != null &&
    formData.ph != null &&
    formData.density != null
  )
})

const isAllInSpec = computed(() => {
  if (!isFormComplete.value) return false
  return (
    isSensoryComplete.value &&
    isNa2OValid.value &&
    isNaOHValid.value &&
    isPhValid.value &&
    isDensityValid.value
  )
})

const submitAnalysis = () => {
  emit('submit', {
    productCategory: 'Chemicals',
    productName: props.transaction.cargoSubType || 'Rapid Klen',
    testRound: 1,
    parameters: {
      sensory: {
        visual: formData.sensory.visual,
        foreignMatters: formData.sensory.foreignMatters,
        packagingLabel: formData.sensory.packagingLabel,
        packaging: formData.sensory.packagingLabel,
      },
      visual: formData.sensory.visual,
      foreignMatters: formData.sensory.foreignMatters,
      packagingCondition: formData.sensory.packagingLabel,
      alkalinityNa2O: formData.alkalinityNa2O,
      alkalinityNaOH: formData.alkalinityNaOH,
      ph: formData.ph,
      density: formData.density,
    },
    notes: formData.notes,
  })
}
</script>
