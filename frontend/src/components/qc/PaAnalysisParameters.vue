<template>
  <div class="min-w-0 space-y-3" data-testid="pa-analysis-parameters">
    <div v-if="!record.specSnapshot" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600" data-testid="pa-legacy-spec-notice">
      <p class="font-semibold text-slate-700">Spesifikasi historis tidak tersedia</p>
      <p>Nilai ditampilkan sesuai catatan asli. Status hasil tersimpan tidak dihitung ulang.</p>
    </div>
    <p v-else class="break-words text-xs leading-relaxed text-slate-500">
      Referensi spesifikasi: {{ record.specSnapshot.provider?.version || 'Snapshot tersimpan' }}<template v-if="record.specSnapshot.provider?.documentSource"> · {{ record.specSnapshot.provider.documentSource }}</template>
    </p>
    <p v-if="hasConflict" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Ada nilai alias tersimpan yang berbeda. Semua nilai ditampilkan beserta sumbernya; tidak dipilih atau diubah otomatis.</p>
    <section v-for="group in groups" :key="group.key" class="min-w-0 space-y-2">
      <h4 class="text-xs font-bold text-slate-700">{{ group.title }}</h4>
      <dl class="grid min-w-0 grid-cols-1 gap-x-5 rounded-lg border border-slate-200 bg-white px-3 lg:grid-cols-2">
        <div v-for="param in group.rows" :key="param.key" class="min-w-0 border-b border-slate-100 py-3 last:border-b-0" :data-pa-parameter="param.key">
          <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <dt class="min-w-0 break-words text-xs font-medium text-slate-500">{{ param.label }}</dt>
            <dd v-if="param.isOk !== null" class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" :class="param.isOk ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'">{{ param.isOk ? 'PASS' : 'OOS' }}</dd>
          </div>
          <dd class="mt-1 break-words text-sm font-semibold leading-relaxed [overflow-wrap:anywhere]" :class="param.conflict ? 'text-amber-800' : param.isOk === false ? 'text-rose-700' : 'text-slate-800'">{{ param.value }}</dd>
          <dd v-if="param.conflict" class="mt-1 break-all text-[11px] text-amber-700">Sumber: {{ param.source }}</dd>
          <dd v-else-if="record.specSnapshot && param.isOk !== null" class="mt-1 break-words text-[11px] leading-relaxed text-slate-500">Spesifikasi: {{ param.specText }}</dd>
          <dd v-else-if="record.specSnapshot && param.specText !== 'Informasi / tidak dievaluasi'" class="mt-1 text-[11px] text-slate-500">{{ param.specText }}</dd>
        </div>
      </dl>
    </section>
    <details v-if="additional.length" class="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <summary class="cursor-pointer text-xs font-semibold text-slate-600">Rincian tambahan ({{ additional.length }})</summary>
      <p class="mt-2 text-[11px] leading-relaxed text-slate-500">Informasi tersimpan, bukan dasar penilaian ulang.</p>
      <dl class="divide-y divide-slate-200">
        <div v-for="param in additional" :key="param.key" class="min-w-0 py-2">
          <dt class="break-words text-xs text-slate-500">{{ param.label }}</dt>
          <dd class="mt-1 break-words text-xs font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{{ param.value }}</dd>
        </div>
      </dl>
    </details>
    <p v-if="!rows.length" class="py-2 text-xs text-slate-500">Belum ada parameter analisa yang tercatat.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatPaParameters } from '../../utils/paParameterDisplay'
const props = defineProps({ record: { type: Object, required: true } })
const rows = computed(() => formatPaParameters(props.record))
const hasConflict = computed(() => rows.value.some(row => row.conflict))
const additional = computed(() => rows.value.filter(row => row.group === 'additional'))
const groups = computed(() => [
  { key: 'measurements', title: 'Hasil pengukuran' },
  { key: 'sensory', title: 'Pemeriksaan visual / sensori' },
].map(group => ({ ...group, rows: rows.value.filter(row => row.group === group.key) })).filter(group => group.rows.length))
</script>
