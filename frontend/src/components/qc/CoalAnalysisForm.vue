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

    <!-- 1. Sensory Checklist -->
    <div class="space-y-3">
      <h5 class="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-slate-700"></span>
        1. Pemeriksaan Visual & Sensori (Sensory Evaluation)
      </h5>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label v-for="(item, key) in sensoryItems" :key="key" class="flex items-start space-x-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
          <input type="checkbox" v-model="formData.sensory[key]" class="mt-0.5 rounded text-[#4A8BDF] focus:ring-0 w-4 h-4 cursor-pointer" />
          <div class="text-xs">
            <span class="font-bold text-slate-800 block">{{ item.title }}</span>
            <span class="text-slate-500 text-[11px]">{{ item.desc }}</span>
          </div>
        </label>
      </div>
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
          <select v-model="formData.targetCalorie" class="w-full h-10 px-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#4A8BDF]">
            <option value="3800">3800 kcal/kg (Batas Max TM: 36%)</option>
            <option value="4200">4200 kcal/kg (Batas Max TM: 33%)</option>
            <option value="4800">4800 kcal/kg (Batas Max TM: 30%)</option>
            <option value="5000">5000 kcal/kg (Batas Max TM: 28%)</option>
            <option value="5500">5500+ kcal/kg (Batas Max TM: 26% — High Calorie)</option>
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
            Melebihi batas spesifikasi max ({{ maxAllowedMoisture }}%). Perlu Uji Ulang atau Disposisi Utility.
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
      <!-- Normal Release (when within spec) -->
      <button
        v-if="!isMoistureExceeded"
        type="button"
        @click="submitDecision('RELEASE')"
        :disabled="isSubmitting || !isSensoryComplete || formData.totalMoisture == null"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-release"
      >
        <span class="material-icons text-base">check_circle</span>
        <span>Lulus Uji & Izinkan Bongkar (RELEASE)</span>
      </button>

      <!-- Retest Required (Round 1 exceeded) -->
      <button
        v-if="isMoistureExceeded && testRound === 1"
        type="button"
        @click="submitDecision('RETEST_REQUIRED')"
        :disabled="isSubmitting"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-retest"
      >
        <span class="material-icons text-base">refresh</span>
        <span>Kadar Air Melebihi Batas — Lakukan Uji Ulang (RETEST)</span>
      </button>

      <!-- Utility Disposition Required (Round 2 exceeded) -->
      <button
        v-if="isMoistureExceeded && testRound > 1"
        type="button"
        @click="submitDecision('PENDING_DISPOSITION')"
        :disabled="isSubmitting"
        class="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 shadow-md transition-all flex items-center justify-center gap-2"
        id="btn-coal-utility-disp"
      >
        <span class="material-icons text-base">gavel</span>
        <span>Teruskan ke Disposisi Utility (Four-Eyes Principle)</span>
      </button>

      <!-- Reject Button -->
      <button
        type="button"
        @click="submitDecision('REJECT')"
        :disabled="isSubmitting"
        class="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all flex items-center justify-center gap-2"
        id="btn-coal-reject"
      >
        <span class="material-icons text-base">cancel</span>
        <span>Tolak Mutu (REJECT)</span>
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

const sensoryItems = {
  visual: { title: 'Warna & Homogenitas', desc: 'Hitam pekat, tidak bercampur tanah atau lumpur' },
  odor: { title: 'Bau Normal', desc: 'Tidak ada bau terbakar atau bahan kimia asing' },
  foreignMatter: { title: 'Bebas Benda Asing', desc: 'Bebas dari batu besar, kayu, plastik, logam' },
  sizeConsistency: { title: 'Keseragaman Ukuran', desc: 'Sesuai fraksi pesanan, tidak dominan debu' },
  moistureCondition: { title: 'Kondisi Permukaan', desc: 'Tidak ada genangan air bebas (free-standing water)' },
}

const formData = reactive({
  sensory: {
    visual: false,
    odor: false,
    foreignMatter: false,
    sizeConsistency: false,
    moistureCondition: false,
  },
  targetCalorie: '4200',
  totalMoisture: null,
  notes: '',
})

const maxAllowedMoisture = computed(() => {
  switch (formData.targetCalorie) {
    case '3800': return 36.0
    case '4200': return 33.0
    case '4800': return 30.0
    case '5000': return 28.0
    case '5500': return 26.0
    default: return 33.0
  }
})

const isMoistureExceeded = computed(() => {
  if (formData.totalMoisture == null) return false
  return formData.totalMoisture > maxAllowedMoisture.value
})

const isSensoryComplete = computed(() => {
  return Object.values(formData.sensory).every(v => v === true)
})

const submitDecision = (decision) => {
  const result = (decision === 'RELEASE') ? 'PASSED' : 'REJECTED'
  emit('submit', {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: props.testRound,
    parameters: {
      sensory: formData.sensory,
      targetCalorie: formData.targetCalorie,
      totalMoisture: formData.totalMoisture,
      maxAllowedMoisture: maxAllowedMoisture.value,
    },
    result,
    decision,
    notes: formData.notes,
  })
}
</script>
