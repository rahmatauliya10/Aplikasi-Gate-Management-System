<template>
  <div v-if="show" class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden transform transition-all">
      <!-- Modal Header -->
      <div class="p-6 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex justify-between items-center">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
            <span class="material-icons text-xl">gavel</span>
          </div>
          <div>
            <h3 class="text-base font-black tracking-tight">Disposisi Utility (Four-Eyes Principle)</h3>
            <p class="text-xs text-amber-100 font-medium">Otoritas Keputusan Deviasi Mutu Batubara</p>
          </div>
        </div>
        <button @click="$emit('close')" class="text-white/80 hover:text-white transition-colors">
          <span class="material-icons text-2xl">close</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-5">
        <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          <span class="font-bold block mb-1">Prinsip Pemisahan Wewenang (Four-Eyes Principle):</span>
          Sistem memastikan pejabat penyetuju disposisi berbeda dari analis laboratorium yang melakukan pengujian sampel.
        </div>

        <div>
          <label class="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Keputusan Disposisi *</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              @click="action = 'ACCEPT_WITH_DEVIATION'"
              class="p-3.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              :class="action === 'ACCEPT_WITH_DEVIATION' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/20' : 'border-slate-200 text-slate-600 hover:border-slate-300'"
              id="btn-disp-accept"
            >
              <span class="material-icons text-base">check_circle</span>
              <span>Terima Bersyarat</span>
            </button>

            <button
              type="button"
              @click="action = 'REJECT'"
              class="p-3.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              :class="action === 'REJECT' ? 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-400/20' : 'border-slate-200 text-slate-600 hover:border-slate-300'"
              id="btn-disp-reject"
            >
              <span class="material-icons text-base">cancel</span>
              <span>Tolak Muatan</span>
            </button>
          </div>
        </div>

        <div>
          <label class="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
            Alasan Teknis & Dasar Persetujuan Disposisi *
          </label>
          <textarea
            v-model="reason"
            rows="3"
            placeholder="Contoh: Kadar air 35.5% diterima bersyarat dengan rekomendasi penyesuaian rasio blending boiler line 2..."
            id="input-disp-reason"
            class="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#4A8BDF]"
          ></textarea>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
        <button
          type="button"
          @click="$emit('close')"
          class="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Batal
        </button>

        <button
          type="button"
          @click="submit"
          :disabled="isSubmitting || !reason.trim() || reason.trim().length < 10"
          class="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center gap-2"
          id="btn-submit-disposition"
        >
          <span v-if="isSubmitting" class="material-icons text-sm animate-spin">autorenew</span>
          <span>Sahkan Keputusan Disposisi</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isSubmitting: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit'])

const action = ref('ACCEPT_WITH_DEVIATION')
const reason = ref('')

const submit = () => {
  emit('submit', {
    dispositionAction: action.value,
    dispositionReason: reason.value,
  })
}
</script>
