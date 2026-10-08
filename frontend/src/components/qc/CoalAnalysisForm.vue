<template>
  <div class="space-y-6">
    <!-- Header with Round Indicator -->
    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-black">
          <span class="material-icons text-xl">grain</span>
        </div>
        <div>
          <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider">Analisis PA — Batubara</h4>
          <p class="text-[11px] text-slate-500 font-medium">Standard Operating Procedure: SOP-GSP-2026.1</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="testRound > 1" class="px-3 py-1 rounded-full text-xs font-black bg-orange-100 text-orange-700 border border-orange-300 animate-pulse">
          Uji Ulang (Round {{ testRound }})
        </span>
        <span v-else class="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-700 border border-blue-300">
          Uji Awal (Round 1)
        </span>
      </div>
    </div>

    <!-- 1. Factual Visual & Sensory Examination -->
    <div class="space-y-3">
      <h5 class="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-slate-700"></span>
        1. Pemeriksaan Faktual Visual Batubara (Authoritative Sensory)
      </h5>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-slate-50/60 rounded-2xl border border-slate-200">
        <!-- Kondisi -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Kondisi *</label>
          <select
            v-model="formData.visual.kondisi"
            id="select-coal-kondisi"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="formData.visual.kondisi === 'BASAH' ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
          >
            <option value="KERING">KERING (Normal)</option>
            <option value="LEMBAB">LEMBAB (Normal)</option>
            <option value="BASAH">BASAH (OOS)</option>
          </select>
        </div>

        <!-- Warna -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Warna *</label>
          <select
            v-model="formData.visual.warna"
            id="select-coal-warna"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="formData.visual.warna === 'COKLAT_KEHITAMAN' ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
          >
            <option value="HITAM_MENGKILAP">HITAM MENGKILAP (Normal)</option>
            <option value="HITAM_KUSAM">HITAM KUSAM (Normal)</option>
            <option value="COKLAT_KEHITAMAN">COKLAT KEHITAMAN (OOS)</option>
          </select>
        </div>

        <!-- Level / Rank -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Level / Rank *</label>
          <select
            v-model="formData.visual.levelRank"
            id="select-coal-level-rank"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="formData.visual.levelRank === 'LOW_GRADE' ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
          >
            <option value="HIGH_GRADE">HIGH GRADE (Normal)</option>
            <option value="MEDIUM_GRADE">MEDIUM GRADE (Normal)</option>
            <option value="LOW_GRADE">LOW GRADE (OOS)</option>
          </select>
        </div>

        <!-- Kilap -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Kilap *</label>
          <select
            v-model="formData.visual.kilap"
            id="select-coal-kilap"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="formData.visual.kilap === 'KUSAM' ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
          >
            <option value="MENGKILAP">MENGKILAP (Normal)</option>
            <option value="AGAK_MENGKILAP">AGAK MENGKILAP (Normal)</option>
            <option value="KUSAM">KUSAM (OOS)</option>
          </select>
        </div>

        <!-- Bahan Pengotor -->
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Bahan Pengotor *</label>
          <select
            v-model="formData.visual.bahanPengotor"
            id="select-coal-bahan-pengotor"
            class="w-full h-10 px-3 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
            :class="formData.visual.bahanPengotor === 'ADA_BANYAK' ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
          >
            <option value="TIDAK_ADA">TIDAK ADA (Normal)</option>
            <option value="ADA_SEDIKIT">ADA SEDIKIT (Normal)</option>
            <option value="ADA_BANYAK">ADA BANYAK (OOS)</option>
          </select>
        </div>
      </div>
      <p v-if="isVisualOos" class="text-[11px] font-bold text-orange-600 flex items-center gap-1">
        <span class="material-icons text-sm">warning</span>
        Pemeriksaan visual OOS (di luar spesifikasi normal). Round 1: Wajib Retest. Round 2: REJECT.
      </p>
    </div>

    <!-- 2. Moisture Analysis -->
    <div class="space-y-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-200">
      <div class="flex items-center justify-between">
        <h5 class="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
          <span class="material-icons text-base text-amber-600">water_drop</span>
          2. Uji Kadar Air (Total Moisture Analysis)
        </h5>
        <span class="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">ASTM D3302 (Digital Analyzer)</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Target Kalori Batubara</label>
          <select
            v-model="formData.targetCalorie"
            id="select-coal-calorie"
            class="w-full h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#4A8BDF]"
          >
            <option value="COAL_5600_6000">5600 - 6000 kcal/kg (Batas Max TM: 33%)</option>
            <option value="COAL_GT_6000">> 6000 kcal/kg (Batas Max TM: 25%)</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Hasil Uji Total Moisture (% AR) *</label>
          <div class="relative">
            <input
              type="number"
              step="0.1"
              v-model.number="formData.totalMoisture"
              placeholder="Contoh: 31.5"
              id="input-coal-moisture"
              class="w-full h-10 px-3 pr-10 bg-white rounded-xl border text-xs font-bold text-slate-800 focus:outline-none transition-colors"
              :class="isMoistureExceeded ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 focus:border-[#4A8BDF]'"
            />
            <span class="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
          </div>
          <p v-if="isMoistureExceeded" class="text-[11px] font-bold text-orange-600 mt-1 flex items-center gap-1">
            <span class="material-icons text-sm">warning</span>
            Total Moisture melebihi batas max ({{ maxAllowedMoisture }}%). Round 1: Wajib Uji Ulang. Round 2: Muatan Ditolak (REJECT).
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Notes / Remarks -->
    <div>
      <label class="block text-[11px] font-black text-slate-600 uppercase mb-1">Catatan Analis Laboratorium</label>
      <textarea
        v-model="formData.notes"
        rows="2"
        placeholder="Tambahkan observasi khusus atau deviasi sampel..."
        class="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#4A8BDF]"
      ></textarea>
    </div>

    <!-- Decision Action Buttons -->
    <div class="pt-4 border-t border-slate-100 flex flex-col md:flex-row gap-3">
      <!-- Normal Submission (within spec preview) -->
      <button
        v-if="!isAnyOos"
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting || !isFormComplete"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-release"
      >
        <span class="material-icons text-base">send</span>
        <span>Kirim Hasil Analisis PA</span>
      </button>

      <!-- Retest Required Indication (Round 1 exceeded) -->
      <button
        v-if="isAnyOos && testRound === 1"
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting || !isFormComplete"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-retest"
      >
        <span class="material-icons text-base">refresh</span>
        <span>Hasil di atas batas — akan dievaluasi untuk Retest</span>
      </button>

      <!-- Rejection Indication (Round 2 exceeded) -->
      <button
        v-if="isAnyOos && testRound > 1"
        type="button"
        @click="submitAnalysis"
        :disabled="isSubmitting || !isFormComplete"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-reject"
      >
        <span class="material-icons text-base">cancel</span>
        <span>Hasil di atas batas pada Uji Ulang — Muatan Ditolak (REJECT)</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed } from 'vue'

const props = defineProps({
  transaction: { type: Object, required: true },
  testRound: { type: Number, default: 1 },
  isSubmitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const formData = reactive({
  visual: {
    kondisi: 'KERING',
    warna: 'HITAM_MENGKILAP',
    levelRank: 'HIGH_GRADE',
    kilap: 'MENGKILAP',
    bahanPengotor: 'TIDAK_ADA',
  },
  targetCalorie: 'COAL_5600_6000',
  totalMoisture: null,
  notes: '',
})

const maxAllowedMoisture = computed(() => {
  switch (formData.targetCalorie) {
    case 'COAL_GT_6000':
      return 25.0
    case 'COAL_5600_6000':
    default:
      return 33.0
  }
})

const isMoistureExceeded = computed(() => {
  if (formData.totalMoisture == null) return false
  return formData.totalMoisture > maxAllowedMoisture.value
})

const isVisualOos = computed(() => {
  return (
    formData.visual.kondisi === 'BASAH' ||
    formData.visual.warna === 'COKLAT_KEHITAMAN' ||
    formData.visual.levelRank === 'LOW_GRADE' ||
    formData.visual.kilap === 'KUSAM' ||
    formData.visual.bahanPengotor === 'ADA_BANYAK'
  )
})

const isAnyOos = computed(() => {
  return isMoistureExceeded.value || isVisualOos.value
})

const isFormComplete = computed(() => {
  return (
    formData.totalMoisture != null &&
    Boolean(formData.visual.kondisi) &&
    Boolean(formData.visual.warna) &&
    Boolean(formData.visual.levelRank) &&
    Boolean(formData.visual.kilap) &&
    Boolean(formData.visual.bahanPengotor)
  )
})

const submitAnalysis = () => {
  emit('submit', {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: props.testRound,
    parameters: {
      calorieBand: formData.targetCalorie,
      targetCalorie: formData.targetCalorie,
      totalMoisture: formData.totalMoisture,
      maxAllowedMoisture: maxAllowedMoisture.value,
      visual: {
        kondisi: formData.visual.kondisi,
        warna: formData.visual.warna,
        levelRank: formData.visual.levelRank,
        kilap: formData.visual.kilap,
        bahanPengotor: formData.visual.bahanPengotor,
      },
      kondisi: formData.visual.kondisi,
      warna: formData.visual.warna,
      levelRank: formData.visual.levelRank,
      kilap: formData.visual.kilap,
      bahanPengotor: formData.visual.bahanPengotor,
    },
    notes: formData.notes,
  })
}
</script>
