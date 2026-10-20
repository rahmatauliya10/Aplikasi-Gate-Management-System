<template>
  <section class="space-y-4" data-testid="pa-correction-editor">
    <header class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
      <h4 class="font-black text-slate-800">Koreksi Hasil Analisa PA GSP · Ronde {{ record?.testRound }} · Revisi {{ record?.revision }}</h4>
      <p>Penguji asli: {{ record?.testedBy?.name || record?.testedById || '—' }} · {{ record?.testedAt || '—' }}</p>
      <p>Hasil tersimpan: {{ record?.result || '—' }} / {{ record?.status || '—' }}. Koreksi tidak mengubah status transaksi atau memberi persetujuan disposisi.</p>
      <p v-if="legacy" class="text-amber-800" data-testid="legacy-spec-warning">Spesifikasi asli historis tidak tersedia. Preview menggunakan spesifikasi operasional terverifikasi saat koreksi, bukan spesifikasi historis.</p>
      <p v-else>Basis spesifikasi: {{ record?.specSnapshot?.provider?.version || '—' }} · {{ record?.specSnapshot?.provider?.documentSource || '—' }}</p>
    </header>
    <p v-if="!profile || ambiguous" class="text-xs text-rose-700">Profil atau target PA tidak dapat ditentukan secara aman. Koreksi dinonaktifkan.</p>
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label v-for="field in fields" :key="field.key" class="space-y-1 text-xs font-bold text-slate-700">
          <span>{{ field.label }}</span>
          <select v-if="field.options" :id="`pa-correction-${field.key}`" v-model="form[field.key]" :disabled="disabled" class="w-full h-10 px-2 border rounded-lg bg-white">
            <option value="">— Tidak tersedia / tidak diubah —</option>
            <option v-for="option in optionsFor(field)" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else :id="`pa-correction-${field.key}`" v-model="form[field.key]" type="number" step="any" :disabled="disabled" class="w-full h-10 px-2 border rounded-lg font-mono" />
        </label>
      </div>
      <p v-if="validationError" class="text-xs text-rose-700">{{ validationError }}</p>
      <div v-if="preview" class="p-3 rounded-xl border border-blue-200 bg-blue-50 text-xs space-y-2" data-testid="pa-correction-preview">
        <p class="font-black">Preview server: {{ preview.result }} / {{ preview.status }}</p>
        <p>Basis: {{ preview.evaluationSource }} · {{ preview.specSnapshot?.provider?.version }}</p>
        <p class="font-bold text-amber-900">Disposisi lama dipertahankan sebagai riwayat dan memerlukan review; tidak otomatis berlaku pada hasil koreksi.</p>
        <label v-if="legacy" class="flex gap-2 items-start"><input id="pa-correction-ack" v-model="acknowledged" type="checkbox" :disabled="disabled" />Saya memahami dan menyetujui evaluasi eksplisit dengan spesifikasi saat koreksi.</label>
      </div>
      <p v-if="previewError" class="text-xs text-rose-700">{{ previewError }}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="px-3 py-2 rounded-lg bg-slate-100 text-xs font-bold" :disabled="disabled" @click="reset">Reset PA</button>
        <button type="button" class="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50" :disabled="disabled || !dirty || !!validationError" @click="requestPreview">Preview evaluasi</button>
        <button type="button" class="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50" :disabled="disabled || !ready" @click="useCorrection">Gunakan koreksi PA</button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { buildPaCorrectionPatch } from '../../utils/correctionPayload'
import { resolvePaEditorProfile } from '../../utils/paCurrentSelector'
const props = defineProps({ record: Object, transaction: Object, preview: Object, previewError: String, loading: Boolean, ambiguous: Boolean })
const emit = defineEmits(['preview', 'item', 'invalidate', 'dirty'])
const profile = computed(() => resolvePaEditorProfile(props.record, props.transaction))
const legacy = computed(() => !props.record?.specSnapshot)
const disabled = computed(() => props.loading || props.ambiguous || !props.record?.id)
const form = reactive({})
const acknowledged = ref(false)
const select = (key, label, options, group) => ({ key, label, options, group })
const number = (key, label) => ({ key, label })
const fields = computed(() => {
  const p = props.record?.parameters || {}
  if (profile.value === 'COAL_PA') return [
    select(Object.hasOwn(p, 'calorieBand') ? 'calorieBand' : Object.hasOwn(p, 'targetCalorie') ? 'targetCalorie' : 'calorieBand', 'Target kalori', ['COAL_5600_6000', 'COAL_GT_6000']),
    select('kondisi', 'Kondisi', ['Kering (Tidak Basah)', 'Basah (Kandungan Air Berlebih)'], 'visual'),
    select('warna', 'Warna', ['Hitam', 'Hitam Kecoklatan', 'Coklat', 'Coklat Terang / Pudar'], 'visual'),
    select('levelRank', 'Level / rank', ['High Rank Coal', 'Medium Rank Coal', 'Low Rank Coal', 'Lignite / Non-Boiler Grade'], 'visual'),
    select('kilap', 'Kilap', ['Hitam Mengkilap', 'Hitam Kecoklatan', 'Mudah Lapuk', 'Kusam / Pudar'], 'visual'),
    select('bahanPengotor', 'Bahan pengotor', ['Tidak ada kontaminasi batuan maupun tanah', 'Terkontaminasi batuan dan tanah'], 'visual'),
    number(Object.hasOwn(p, 'moisture') ? 'moisture' : 'totalMoisture', 'Total moisture (%)'),
  ]
  const sensory = [select('visual', 'Kondisi visual', profile.value === 'PAC_PA' ? ['Kuning', 'Coklat Jernih', 'Keruh', 'Hitam Pekat'] : ['Jernih', 'Keruh', 'Berwarna'], 'sensory'), select('foreignMatters', 'Foreign matters', ['Tidak ada kontaminasi', 'Ada kontaminasi'], 'sensory'), select('packagingLabel', 'Kemasan / label', ['Kemasan & label tidak rusak', 'Kemasan rusak / Segel terbuka'], 'sensory')]
  if (profile.value === 'PAC_PA') return [...sensory, number('ph', 'pH'), number('density', 'Density (g/mL)'), number('aluminaContent', 'Alumina (%) — informasi')]
  if (profile.value === 'RAPID_KLEN_PA') return [...sensory, number(Object.hasOwn(p, 'alkalinityNa2o') ? 'alkalinityNa2o' : 'alkalinityNa2O', 'Alkalinity Na₂O (%)'), number(Object.hasOwn(p, 'alkalinityNaoh') ? 'alkalinityNaoh' : 'alkalinityNaOH', 'Alkalinity NaOH (%)'), number('ph', 'pH'), number('density', 'Density (g/mL)')]
  return []
})
function originalValue(field) {
  const p = props.record?.parameters || {}
  return field.group ? p[field.group]?.[field.key] ?? (profile.value === 'COAL_PA' ? p[field.key] : undefined) : p[field.key]
}
function optionsFor(field) { const value = originalValue(field); return value && !field.options.includes(value) ? [value, ...field.options] : field.options }
const dirty = computed(() => fields.value.some(field => String(form[field.key] ?? '') !== String(originalValue(field) ?? '')))
const proposal = computed(() => {
  try {
    const next = {}
    for (const field of fields.value) {
      const value = form[field.key]
      if (String(value ?? '') === String(originalValue(field) ?? '')) continue
      if (value === '' || value == null) throw new Error('Pengukuran tidak boleh dikosongkan. Isi nilai faktual atau reset.')
      const parsed = field.options ? value : Number(value)
      if (field.group) { next[field.group] ||= {}; next[field.group][field.key] = parsed }
      else next[field.key] = parsed
    }
    return { patch: buildPaCorrectionPatch(profile.value, props.record?.parameters, next), error: '' }
  } catch (error) { return { patch: null, error: error.message } }
})
const validationError = computed(() => proposal.value.error)
const ready = computed(() => dirty.value && !validationError.value && props.preview?.fingerprint && (!legacy.value || acknowledged.value))
function reset() { for (const field of fields.value) form[field.key] = originalValue(field) ?? ''; acknowledged.value = false; emit('dirty', false); emit('invalidate') }
function requestPreview() {
  if (!dirty.value || validationError.value || disabled.value) return
  emit('preview', { targetRecordId: props.record.id, expectedRevision: props.transaction.revision, expectedPaRevision: props.record.revision, parameters: proposal.value.patch })
}
function useCorrection() {
  if (!ready.value || disabled.value) return
  emit('item', { targetModule: 'QC_PRODUCT_ANALYSIS', targetRecordId: props.record.id, fieldName: 'parameters', newValue: proposal.value.patch, expectedRecordRevision: props.record.revision, evaluationFingerprint: props.preview.fingerprint, acknowledgeCurrentSpec: legacy.value && acknowledged.value })
}
watch(() => props.record, reset, { immediate: true })
watch(() => JSON.stringify(form), () => { acknowledged.value = false; emit('dirty', dirty.value); emit('invalidate') }, { flush: 'sync' })
watch(acknowledged, () => { if (!acknowledged.value && legacy.value) emit('invalidate') })
</script>
