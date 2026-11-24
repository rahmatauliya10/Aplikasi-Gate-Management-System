<template>
  <teleport to="body">
  <transition name="modal">
    <div v-if="isOpen && truck" class="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"
      @click.self="close">
      <div class="modal-panel rounded-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh] transition-all duration-500 w-[97vw] sm:w-[90vw] lg:w-[80vw] max-w-5xl mx-auto"
        style="background: white; box-shadow: 0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,139,223,0.1);">

        <!-- Header (Compact) -->
        <div class="px-4 sm:px-5 py-2.5 sm:py-3 flex justify-between items-center shrink-0"
          style="background: linear-gradient(135deg, #FFFFFF, #E6F0FA); border-bottom: 1px solid rgba(74,139,223,0.15);">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center"
              style="background: linear-gradient(135deg, rgba(74,139,223,0.2), rgba(160,0,109,0.1)); border: 1px solid rgba(74,139,223,0.3);">
              <span class="material-icons text-[#4A8BDF] text-lg">local_shipping</span>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-lg sm:text-xl font-black text-[#4A8BDF] tracking-tight font-mono">{{ currentTruck.plateNumber }}</h2>
                <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                  :class="currentTruck.processType === 'GBB' ? 'bg-pink-50 text-[#A0006D] border border-pink-200' : currentTruck.processType === 'GBJ' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'">
                  {{ currentTruck.processType }}
                </span>
                <StatusBadge :status="currentTruck.status" :process-type="currentTruck.processType" />
                <ProcessTimerBadge
                  :start-time="activeStageStartTime"
                  :end-time="currentTruck.completedAt || currentTruck.cancelledAt"
                  :sla-minutes="null"
                  label="Durasi"
                  :compact="true"
                />
              </div>
              <div class="flex items-center space-x-1.5 mt-0.5">
                <span class="text-[10px] font-bold text-slate-500">{{ currentTruck.driverName }}</span>
                <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                <span class="text-[10px] font-bold text-slate-400">{{ currentTruck.vehicleType || 'N/A' }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button @click="downloadReceiptPDF"
              class="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
              title="Cetak Laporan Lengkap PDF Transaksi Ini">
              <span class="material-icons text-sm text-rose-600">picture_as_pdf</span>
              <span>Cetak PDF</span>
            </button>
            <button v-if="isAdmin && isTerminalTransaction" @click="openCorrectionModal"
              class="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center space-x-1.5 transition-all shadow-sm active:scale-95">
              <span class="material-icons text-sm text-amber-600">edit_note</span>
              <span>Koreksi Admin</span>
              <span v-if="correctionCount > 0" class="ml-1 px-1.5 py-0.5 bg-amber-200/80 text-amber-950 rounded text-[9px] font-mono font-black">{{ correctionCount }} Koreksi</span>
            </button>
            <button @click="close"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 hover:bg-red-50 hover:text-red-500 text-slate-400">
              <span class="material-icons text-lg">close</span>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="p-3 sm:p-4 overflow-y-auto flex-1 custom-scrollbar" style="background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">

            <!-- LEFT COLUMN -->
            <div class="space-y-3">

              <!-- Identity & Security -->
              <div class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50 bg-slate-50/50">
                  <span class="material-icons text-[#4A8BDF] text-[14px]">badge</span>
                  <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Identity & Security</h3>
                </div>
                <div class="p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div v-for="field in identityFields" :key="field.label" class="flex flex-col" :class="field.label === 'Remarks' ? 'col-span-2' : ''">
                    <span class="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">{{ field.label }}</span>
                    <span class="text-[12px] font-bold" :class="[field.highlight ? 'text-[#4A8BDF]' : 'text-slate-800', field.label === 'Remarks' ? 'whitespace-pre-wrap leading-snug' : 'truncate']">{{ field.value || '-' }}</span>
                  </div>
                </div>
              </div>

              <!-- Cargo Items -->
              <div v-if="currentTruck.cargoItems && currentTruck.cargoItems.length > 0" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50 bg-slate-50/50">
                  <span class="material-icons text-amber-500 text-[14px]">inventory_2</span>
                  <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Cargo Manifest</h3>
                  <span class="ml-auto text-[9px] font-black text-slate-400">{{ currentTruck.cargoItems.length }} item(s)</span>
                </div>
                <div class="p-3">
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="(item, idx) in currentTruck.cargoItems" :key="idx"
                      class="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-800">
                      <span class="material-icons text-[12px] mr-1 text-amber-500">package_2</span>
                      {{ item.name || item }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- ================= GSP DEDICATED SECTIONS ================= -->
              <template v-if="currentTruck.processType === 'GSP'">
                <!-- GSP 1. Analisis Laboratorium (QC PA) -->
                <!-- 1a. Solar PA Exempt Banner -->
                <div v-if="isSolarCommodity" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm p-3.5 space-y-2">
                  <div class="flex items-center justify-between border-b border-slate-50 pb-2">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-amber-500 text-[15px]">local_gas_station</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Analisis Laboratorium (QC PA) — Solar</h3>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                      Bebas Uji Lab (PA Exempt)
                    </span>
                  </div>
                  <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                    <p class="font-bold text-slate-800">Komoditas Solar (BBM)</p>
                    <p class="text-[11px] text-slate-500 leading-relaxed">
                      Sesuai kebijakan mutu operasional GSP, komoditas Solar dibebaskan dari pengujian laboratorium dan langsung diarahkan ke tahap penerimaan tangki gudang setelah penimbangan masuk.
                    </p>
                  </div>
                </div>

                <!-- 1b. Coal & Chemical QC Product Analysis Rounds -->
                <div v-else class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                    <div class="flex min-w-0 items-center gap-2">
                      <span class="material-icons shrink-0 text-blue-500 text-[18px]">science</span>
                      <h3 class="text-xs font-bold leading-relaxed text-slate-700">Analisis Laboratorium (QC PA)</h3>
                    </div>
                    <span class="min-w-0 break-words text-xs font-medium text-slate-500">
                      {{ currentTruck.gspAnalysisProfile || currentTruck.cargoSubType || 'GSP' }}
                    </span>
                  </div>
                  <div class="p-3 space-y-3">
                    <!-- If no PA rounds recorded yet -->
                    <div v-if="!gspPaRounds || gspPaRounds.length === 0" class="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
                      <span class="material-icons text-slate-300 text-2xl">biotech</span>
                      <p class="text-[11px] font-bold text-slate-500">Belum Ada Catatan Pengujian Laboratorium</p>
                      <p class="text-[10px] text-slate-400">Pengujian laboratorium QC belum dimulai atau belum selesai dicatat.</p>
                    </div>

                    <!-- PA Rounds List -->
                    <div v-for="round in gspPaRounds" :key="round.id || round.testRound" class="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/30">
                      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div class="min-w-0 space-y-2">
                          <h4 class="text-sm font-bold leading-relaxed text-slate-800">Uji laboratorium · Ronde {{ round.testRound }}</h4>
                          <div class="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                            <span class="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">Revisi {{ round.revision || '—' }}</span>
                            <span class="rounded-md px-2 py-0.5" :class="round.isCurrent === true && round.isVoided === false ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'">{{ round.isCurrent === true && round.isVoided === false ? 'Current' : 'Riwayat' }}</span>
                          </div>
                        </div>
                        <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase"
                          :class="getPaStatusBadgeClass(round.status || round.result)">
                          {{ getPaStatusLabel(round.status || round.result) }}
                        </span>
                      </div>

                      <p v-if="round.dispositionRequiresReview" class="rounded-lg bg-amber-50 p-2.5 text-xs font-medium leading-relaxed text-amber-800">Hasil dikoreksi Admin; disposisi sebelumnya memerlukan review.</p>
                      <div class="flex min-w-0 flex-col gap-1 py-1 text-xs leading-relaxed text-slate-500 sm:flex-row sm:flex-wrap sm:justify-between">
                        <span class="min-w-0 break-words">Penguji: <span class="font-medium text-slate-700">{{ round.testedBy?.name || round.testedById || 'Analis QC' }}</span></span>
                        <span class="min-w-0 break-words">{{ formatTimeFull(round.testedAt || round.createdAt) }}</span>
                      </div>

                      <PaAnalysisParameters :record="round" />

                      <!-- Round Notes if any -->
                      <div v-if="round.notes || round.parameters?.notes" class="text-[10px] font-medium text-slate-600 bg-white p-2 rounded-lg border border-slate-100 italic">
                        "{{ round.notes || round.parameters?.notes }}"
                      </div>
                    </div>
                  </div>
                </div>

                <!-- GSP 2. Disposisi Mutu Gudang GSP Card -->
                <div v-if="hasGspDisposition || currentTruck.status === 'WAITING_GSP_DISPOSITION' || currentTruck.status === 'WAITING_UTILITY_DISPOSITION'"
                  class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm p-3 space-y-2.5">
                  <div class="flex items-center justify-between border-b border-slate-50 pb-2">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-amber-600 text-[15px]">assignment_late</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Disposisi Mutu Gudang GSP</h3>
                    </div>
                    <span v-if="currentTruck.status === 'WAITING_GSP_DISPOSITION'" class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 uppercase tracking-wider animate-pulse border border-amber-300">
                      Menunggu Disposisi
                    </span>
                    <span v-else-if="currentTruck.status === 'WAITING_UTILITY_DISPOSITION'" class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-700 uppercase tracking-wider border border-slate-200">
                      Legacy Read-Only
                    </span>
                    <span v-else class="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                      :class="latestDisposedPa?.dispositionAction === 'ACCEPT_WITH_NOTE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : latestDisposedPa?.dispositionAction === 'REQUEST_RETEST' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-rose-100 text-rose-800 border border-rose-200'">
                      {{ getDispositionActionLabel(latestDisposedPa?.dispositionAction) }}
                    </span>
                  </div>

                  <!-- Waiting GSP Disposition Notice -->
                  <div v-if="currentTruck.status === 'WAITING_GSP_DISPOSITION'" class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                    <div class="flex items-center space-x-1.5 font-black text-xs text-amber-800">
                      <span class="material-icons text-sm text-amber-600">warning</span>
                      <span>Parameter Laboratorium OOS (Out-of-Specification)</span>
                    </div>
                    <p class="text-[11px] font-medium text-amber-900 leading-relaxed">
                      Hasil laboratorium memiliki parameter yang menyimpang dari spesifikasi mutu. Menunggu keputusan disposisi oleh PIC Gudang GSP atau Administrator: <b>Terima dengan Catatan</b>, <b>Uji Ulang (Retest)</b>, atau <b>Tolak Muatan</b>.
                    </p>
                  </div>

                  <!-- Legacy Read-Only Notice -->
                  <div v-else-if="currentTruck.status === 'WAITING_UTILITY_DISPOSITION'" class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 space-y-1">
                    <div class="flex items-center space-x-1.5 font-black text-xs text-slate-800">
                      <span class="material-icons text-sm text-slate-500">lock</span>
                      <span>Status Historis: WAITING_UTILITY_DISPOSITION</span>
                    </div>
                    <p class="text-[11px] font-medium text-slate-600 leading-relaxed">
                      Transaksi ini menggunakan alur terdahulu dan berstatus read-only (tidak dapat diajukan disposisi baru).
                    </p>
                  </div>

                  <!-- Executed Disposition Details -->
                  <div v-else-if="latestDisposedPa" class="p-3 rounded-xl border space-y-2"
                    :class="latestDisposedPa.dispositionAction === 'ACCEPT_WITH_NOTE' ? 'bg-amber-50/50 border-amber-200' : latestDisposedPa.dispositionAction === 'REQUEST_RETEST' ? 'bg-blue-50/50 border-blue-200' : 'bg-rose-50/50 border-rose-200'">
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="font-bold text-slate-600">
                        Disposisi Oleh: <b class="text-slate-900">{{ latestDisposedPa.dispositionBy?.name || latestDisposedPa.dispositionById || 'Gudang GSP / Admin' }}</b>
                      </span>
                      <span class="font-mono text-slate-500">{{ formatTimeFull(latestDisposedPa.dispositionAt) }}</span>
                    </div>
                    <div class="p-2.5 bg-white/90 rounded-lg border border-slate-100 text-xs text-slate-800 space-y-1">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Alasan & Justifikasi Disposisi:</span>
                      <p class="font-semibold italic">"{{ latestDisposedPa.dispositionReason || 'Tanpa catatan' }}"</p>
                    </div>
                    <p v-if="latestDisposedPa.dispositionRequiresReview" class="text-xs font-bold text-amber-900">Disposisi historis ini belum menyetujui hasil koreksi dan memerlukan review.</p>
                    <div v-if="latestDisposedPa.dispositionAction === 'ACCEPT_WITH_NOTE'" class="text-[9px] text-amber-800 bg-amber-100/60 p-2 rounded-md font-medium leading-normal border border-amber-200/50">
                      <b>Catatan Integritas Data:</b> Hasil pengujian teknis laboratorium tetap tercatat <b>REJECT (faktual)</b>. Penerimaan muatan adalah konsesi operasional bersyarat dari Gudang GSP.
                    </div>
                  </div>
                </div>

                <!-- GSP 3. Pemeriksaan Pra-Bongkar (9 Parameter) -->
                <div class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-teal-600 text-[15px]">fact_check</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Pemeriksaan Pra-Bongkar (9 Parameter)</h3>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                      :class="gspPreUnloadStatus.badgeClass">
                      {{ gspPreUnloadStatus.label }}
                    </span>
                  </div>
                  <div class="p-3">
                    <!-- If NO checklist conducted yet -->
                    <div v-if="!gspPreUnloadItems || gspPreUnloadItems.length === 0" class="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
                      <span class="material-icons text-slate-300 text-2xl">checklist_rtl</span>
                      <p class="text-[11px] font-black text-slate-500 uppercase tracking-wider">Belum Ada Pemeriksaan Pre-Unloading</p>
                      <p class="text-[10px] text-slate-400">Pemeriksaan 9 parameter pra-bongkar belum dicatat oleh tim gudang.</p>
                    </div>

                    <!-- 9 Checklist Items Grid -->
                    <div v-else class="space-y-2">
                      <div class="flex items-center justify-between text-[10px] text-slate-500 pb-1 border-b border-slate-100">
                        <span>Pemeriksa: <b class="text-slate-800">{{ gspPreUnloadMeta.inspector }}</b></span>
                        <span class="font-mono">{{ formatTimeFull(gspPreUnloadMeta.inspectedAt) }}</span>
                      </div>
                      <div class="space-y-1.5">
                        <div v-for="(item, idx) in gspPreUnloadItems" :key="item.code || idx"
                          class="p-2.5 rounded-lg border text-xs"
                          :class="item.ok === true ? 'bg-emerald-50/30 border-emerald-100 text-slate-700' : item.ok === false ? 'bg-rose-50/40 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'">
                          <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-1.5 truncate pr-2">
                              <span class="material-icons text-[14px]" :class="item.ok === true ? 'text-emerald-500' : item.ok === false ? 'text-rose-500' : 'text-slate-400'">
                                {{ item.ok === true ? 'check_circle' : item.ok === false ? 'cancel' : 'help_outline' }}
                              </span>
                              <span class="text-[11px] font-bold truncate" :title="item.label">{{ idx + 1 }}. {{ item.label }}</span>
                            </div>
                            <span class="text-[9px] font-mono font-black px-2 py-0.5 rounded shrink-0 uppercase"
                              :class="item.ok === true ? 'bg-emerald-100 text-emerald-800' : item.ok === false ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'">
                              {{ item.ok === true ? 'OK' : item.ok === false ? 'NOT OK' : '—' }}
                            </span>
                          </div>
                          <!-- Notes if present -->
                          <div v-if="item.notes" class="mt-1.5 text-[10px] font-medium text-slate-700 bg-white/80 p-1.5 rounded border border-slate-100 italic">
                            Catatan: "{{ item.notes }}"
                          </div>
                          <!-- Photo thumbnail if present -->
                          <div v-if="item.photoUrl" class="mt-2 flex items-center space-x-2">
                            <AuthenticatedImage
                              :src="item.photoUrl"
                              alt="Foto Bukti"
                              @click="activePreviewPhoto = $event || item.photoUrl"
                              img-class="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                              wrapper-class="w-12 h-12 shrink-0"
                            />
                            <div class="text-[9px] text-slate-500 flex flex-col">
                              <span class="font-bold text-slate-700">Foto Bukti Terlampir</span>
                              <button type="button" @click="activePreviewPhoto = item.photoUrl" class="text-blue-600 hover:underline text-left">Klik untuk perbesar</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- GSP 4. Keputusan Penerimaan GSP (Disposisi Checklist) Card -->
                <div v-if="hasChecklistDisposition || currentTruck.status === 'WAITING_GSP_CHECKLIST_DISPOSITION'"
                  class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm p-3 space-y-2.5">
                  <div class="flex items-center justify-between border-b border-slate-50 pb-2">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-amber-600 text-[15px]">verified_user</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Keputusan Penerimaan GSP (Checklist)</h3>
                    </div>
                    <span v-if="currentTruck.status === 'WAITING_GSP_CHECKLIST_DISPOSITION'" class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 uppercase tracking-wider animate-pulse border border-amber-300">
                      Menunggu Keputusan
                    </span>
                    <span v-else class="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                      :class="latestChecklistDisposition?.action === 'ACCEPT_WITH_NOTE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-rose-100 text-rose-800 border border-rose-200'">
                      {{ latestChecklistDisposition?.action === 'ACCEPT_WITH_NOTE' ? 'TERIMA DENGAN CATATAN (KONSESI)' : 'TOLAK MUATAN' }}
                    </span>
                  </div>

                  <!-- Waiting Checklist Decision Notice -->
                  <div v-if="currentTruck.status === 'WAITING_GSP_CHECKLIST_DISPOSITION'" class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                    <div class="flex items-center space-x-1.5 font-black text-xs text-amber-800">
                      <span class="material-icons text-sm text-amber-600">warning</span>
                      <span>Ditemukan Ketidaksesuaian Pada Checklist Pra-Bongkar</span>
                    </div>
                    <p class="text-[11px] font-medium text-amber-900 leading-relaxed">
                      Pemeriksaan fisik kendaraan atau dokumen memuat butir NOT OK. Menunggu keputusan penerimaan oleh PIC Gudang GSP atau Administrator: <b>Terima dengan Catatan (Konsesi)</b> atau <b>Tolak Muatan</b>.
                    </p>
                  </div>

                  <!-- Executed Disposition Details -->
                  <div v-else-if="latestChecklistDisposition" class="p-3 rounded-xl border space-y-2"
                    :class="latestChecklistDisposition.action === 'ACCEPT_WITH_NOTE' ? 'bg-amber-50/50 border-amber-200' : 'bg-rose-50/50 border-rose-200'">
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="font-bold text-slate-600">
                        Disposisi Oleh: <b class="text-slate-900">{{ latestChecklistDisposition.decidedByName || latestChecklistDisposition.decidedById || 'Gudang GSP / Admin' }}</b>
                      </span>
                      <span class="font-mono text-slate-500">{{ formatTimeFull(latestChecklistDisposition.decidedAt) }}</span>
                    </div>
                    <div class="p-2.5 bg-white/90 rounded-lg border border-slate-100 text-xs text-slate-800 space-y-1">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Alasan & Justifikasi Keputusan:</span>
                      <p class="font-semibold italic">"{{ latestChecklistDisposition.reason || 'Tanpa catatan' }}"</p>
                    </div>
                    <div v-if="latestChecklistDisposition.action === 'ACCEPT_WITH_NOTE'" class="text-[9px] text-amber-800 bg-amber-100/60 p-2 rounded-md font-medium leading-normal border border-amber-200/50">
                      <b>Catatan Integritas Data:</b> Hasil pemeriksaan fisik pra-bongkar tetap tercatat <b>NOT OK (faktual)</b>. Penerimaan muatan adalah konsesi operasional bersyarat dari Gudang GSP.
                    </div>
                  </div>
                </div>
              </template>

              <!-- ================= GBB / GBJ SECTIONS ================= -->
              <template v-else>
                <!-- 1. Initial QC Sampling Card / SAMPLING PARAMETERS (For GBB) -->
                <div v-if="currentTruck.processType === 'GBB' && initialSamplingDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm space-y-2 p-3">
                  <div class="flex items-center justify-between border-b border-slate-50 pb-2">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-indigo-500 text-[14px]">biotech</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">SAMPLING PARAMETERS</h3>
                    </div>
                    <span class="text-[9px] font-bold text-slate-400">PIC: [SAMPLING QC] {{ initialSamplingDetails.pic || 'QC Inspector' }}</span>
                  </div>

                  <!-- 3 Sampling Parameter Cards: MOISTURE, VISUAL, ODOR -->
                  <div class="grid grid-cols-3 gap-2.5">
                    <div v-for="item in initialSamplingMetrics" :key="item.label"
                         class="p-3 rounded-2xl border transition-all text-center flex flex-col items-center justify-center space-y-1.5"
                         :class="item.isOk ? 'border-emerald-200/80 bg-emerald-50/20' : 'border-rose-200/80 bg-rose-50/20'">
                      <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">{{ item.label }}</div>

                      <!-- Numeric Moisture Value Badge -->
                      <template v-if="!item.isText">
                        <div class="text-xs font-black font-mono text-emerald-700 bg-emerald-100/60 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                          {{ item.value }}
                        </div>
                      </template>

                      <!-- Icon + OK / NOT OK Badge for Visual & Odor -->
                      <template v-else>
                        <div class="flex items-center space-x-1 font-black text-xs" :class="item.isOk ? 'text-emerald-600' : 'text-rose-600'">
                          <span class="material-icons text-[14px]">{{ item.isOk ? 'check_circle' : 'cancel' }}</span>
                          <span>{{ item.value }}</span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Overall Status Banner -->
                  <div class="rounded-xl p-2.5 text-white relative overflow-hidden shadow-sm"
                       :style="{ background: initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #10B981, #047857)' }">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-white/90 text-sm">{{ initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'cancel' : 'verified' }}</span>
                      <span class="text-xs font-black tracking-widest uppercase">{{ initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'REJECTED' : 'APPROVED' }}</span>
                    </div>
                    <p v-if="initialSamplingDetails.note" class="text-[10px] font-bold text-white mt-1.5 p-2 rounded-lg bg-black/15 border border-white/25 backdrop-blur-sm shadow-inner leading-relaxed">"{{ initialSamplingDetails.note }}"</p>
                  </div>
                </div>

                <!-- 2. Quality Analysis (QC Lab) Card (For GBB) -->
                <div v-if="currentTruck.processType === 'GBB' && qcLabDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="px-4 py-2 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-blue-500 text-[14px]">science</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Quality Analysis (QC Lab)</h3>
                    </div>
                    <span v-if="!qcLabDetails.isSkipped" class="text-[9px] font-bold text-slate-400">PIC: [LAB QC] {{ qcLabDetails.pic || 'QC Lab Team' }}</span>
                  </div>
                  <div class="p-3">
                    <div v-if="qcLabDetails.isSkipped" class="rounded-xl p-3 text-slate-500 relative overflow-hidden bg-slate-50 border border-slate-200 shadow-sm flex items-center space-x-2">
                      <span class="material-icons text-slate-400 text-sm">next_plan</span>
                      <span class="text-[10px] font-black tracking-widest uppercase">SKIPPED ({{ qcLabDetails.reason }})</span>
                    </div>
                    <div v-else class="space-y-2.5">
                      <div v-if="qcMetrics.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                        <div v-for="item in qcMetrics" :key="item.label" class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                          <div class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{{ item.label }}</div>
                          <div class="text-sm font-black text-slate-800 font-mono">{{ item.value }}</div>
                        </div>
                      </div>
                      <div class="rounded-xl p-3 text-white relative overflow-hidden shadow-sm"
                           :style="{ background: qcLabDetails.status === 'REJECT' || qcLabDetails.status === 'REJECTED' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : (qcLabDetails.status?.includes('Note') || qcLabDetails.note?.includes('[DITERIMA DENGAN CATATAN]') ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'linear-gradient(135deg, #4A8BDF, #3A6ABF)') }">
                        <div class="flex items-center space-x-2">
                          <span class="material-icons text-white/90 text-sm">{{ qcLabDetails.status === 'REJECT' || qcLabDetails.status === 'REJECTED' ? 'cancel' : (qcLabDetails.status?.includes('Note') || qcLabDetails.note?.includes('[DITERIMA DENGAN CATATAN]') ? 'warning' : 'verified') }}</span>
                          <span class="text-xs font-black tracking-widest uppercase">{{ qcLabDetails.status === 'REJECT' || qcLabDetails.status === 'REJECTED' ? 'REJECTED' : (qcLabDetails.status?.includes('Note') || qcLabDetails.note?.includes('[DITERIMA DENGAN CATATAN]') ? '⚠️ APPROVED WITH NOTE (QUALITY CONCESSION)' : (qcLabDetails.status || 'ACCEPTED')) }}</span>
                        </div>
                        <p v-if="qcLabDetails.note" class="text-[11px] font-bold text-white mt-2 p-2.5 rounded-lg bg-black/15 border border-white/25 backdrop-blur-sm shadow-inner leading-relaxed">"{{ qcLabDetails.note }}"</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 3. QC Vehicle Card (For GBJ) -->
                <div v-if="currentTruck.processType === 'GBJ' && qcDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="px-4 py-2 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-indigo-500 text-[14px]">local_shipping</span>
                      <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">QC Vehicle Inspection</h3>
                    </div>
                    <span v-if="qcPicLabel" class="text-[9px] font-bold text-slate-400">PIC: {{ qcPicLabel }}</span>
                  </div>
                  <div class="p-3">
                    <div class="rounded-xl p-3 text-white relative overflow-hidden shadow-sm"
                         :style="{ background: qcDetails.status === 'REJECT' || qcDetails.status === 'REJECTED' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #4A8BDF, #3A6ABF)' }">
                      <div class="flex items-center space-x-2">
                        <span class="material-icons text-white/90 text-sm">{{ qcDetails.status === 'REJECT' || qcDetails.status === 'REJECTED' ? 'cancel' : 'verified' }}</span>
                        <span class="text-xs font-black tracking-widest uppercase">{{ qcDetails.status === 'REJECT' || qcDetails.status === 'REJECTED' ? 'REJECTED' : 'ACCEPTED' }}</span>
                      </div>
                      <p v-if="qcDetails.note" class="text-[11px] font-bold text-white mt-2 p-2.5 rounded-lg bg-black/15 border border-white/25 backdrop-blur-sm shadow-inner leading-relaxed">"{{ qcDetails.note }}"</p>
                    </div>
                  </div>
                </div>

                <!-- Incoming Checklist Results for GBJ -->
                <div v-if="currentTruck.processType === 'GBJ' && (parsedChecklist || isWarehouseRejection)" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-50"
                       :style="checklistStatusInfo.headerStyle">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-[14px]" :style="checklistStatusInfo.iconStyle">local_shipping</span>
                      <h3 class="text-[10px] font-black uppercase tracking-[0.15em]" :style="checklistStatusInfo.titleStyle">Vehicle &amp; Goods Inspection</h3>
                    </div>
                    <div class="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase"
                          :class="checklistStatusInfo.badgeClass">
                      <span class="material-icons text-[10px]">{{ checklistStatusInfo.icon }}</span>
                      <span>{{ checklistStatusInfo.label }}</span>
                    </div>
                  </div>
                  <div class="p-3 space-y-4">
                    <div v-if="parsedChecklist && parsedChecklist.items.length" class="space-y-1.5">
                      <div class="grid grid-cols-2 gap-2">
                        <div v-for="c in parsedChecklist.items" :key="c.label"
                              class="flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 bg-slate-50/30"
                              :class="c.ok ? 'border-slate-100 text-slate-700' : 'border-rose-100 text-rose-800 bg-rose-50/20'">
                          <div class="flex items-center space-x-2 truncate">
                            <span class="material-icons text-[13px]" :class="c.ok ? 'text-emerald-500' : 'text-rose-500'">
                              {{ c.ok ? 'check_circle' : 'cancel' }}
                            </span>
                            <span class="text-[11px] font-bold text-slate-700 truncate" :title="c.label">{{ c.label }}</span>
                          </div>
                          <span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase"
                                :class="c.ok ? 'bg-emerald-100/50 text-emerald-700' : 'bg-rose-100 text-rose-700'">
                            {{ c.ok ? 'OK' : 'NOT OK' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- GBJ Warehouse Loading & Delivery Checklist -->
                <div v-if="currentTruck.processType === 'GBJ' && gbjDeliveryData" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                  <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-50 bg-indigo-50/40">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-indigo-600 text-[15px]">fact_check</span>
                      <h3 class="text-[10px] font-black text-slate-800 uppercase tracking-[0.15em]">Delivery Checklist &amp; Product Manifest</h3>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                      Finished Goods
                    </span>
                  </div>
                  <div class="p-3.5 space-y-3">
                    <!-- Product Types Display -->
                    <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Product Types (Jenis Produk)</span>
                      <div class="flex flex-wrap gap-2">
                        <span v-for="(pName, pIdx) in gbjProductTypes" :key="pName" class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-black">
                          <span class="material-icons text-[14px] text-indigo-600">inventory_2</span>
                          <span>{{ pName }}</span>
                          <span class="text-[9px] font-bold text-indigo-500 uppercase ml-1">Produk {{ pIdx + 1 }}</span>
                        </span>
                        <span v-if="gbjProductTypes.length === 0" class="text-xs font-bold text-slate-400">Tidak tercatat</span>
                      </div>
                    </div>

                    <!-- Customer Destination & SJ -->
                    <div class="grid grid-cols-2 gap-2 text-xs">
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">Customer Destination</span>
                        <span class="font-bold text-slate-800">{{ gbjDeliveryData.customer || gbjDeliveryData.customerDestination || '-' }}</span>
                      </div>
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">Surat Jalan (SJ)</span>
                        <span class="font-bold text-slate-800 font-mono">{{ currentTruck.suratJalanNumber || gbjDeliveryData.suratJalanNumber || '-' }}</span>
                      </div>
                    </div>

                    <!-- Inspection Checklists (Condition & Documents) -->
                    <div v-if="gbjConditionItems.length || gbjDocumentItems.length" class="space-y-2 pt-1 border-t border-slate-100">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div class="space-y-1.5">
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Kondisi Produk</span>
                          <div v-for="(item, idx) in gbjConditionItems" :key="'c'+idx" class="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span class="font-bold text-slate-700 truncate mr-2">{{ item.label }}</span>
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-black shrink-0" :class="item.checked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ item.checked ? 'SESUAI' : '-' }}</span>
                          </div>
                        </div>
                        <div class="space-y-1.5">
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Kelengkapan Dokumen</span>
                          <div v-for="(item, idx) in gbjDocumentItems" :key="'d'+idx" class="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span class="font-bold text-slate-700 truncate mr-2">{{ item.label }}</span>
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-black shrink-0" :class="item.checked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ item.checked ? 'ADA' : '-' }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Fraud Recon (only show if data exists) -->
              <div v-if="fraudMetrics.status !== 'NOT_RECORDED'"
                class="rounded-xl overflow-hidden relative bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50"
                  :style="{ background: fraudMetrics.status === 'CRITICAL' ? 'rgba(254, 242, 242, 0.6)' : fraudMetrics.status === 'WARNING' ? 'rgba(255, 251, 235, 0.6)' : 'rgba(240, 253, 244, 0.6)' }">
                  <span class="material-icons text-[14px]"
                    :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">policy</span>
                  <h3 class="text-[10px] font-black uppercase tracking-[0.15em]"
                    :style="fraudMetrics.status === 'CRITICAL' ? 'color:#7F1D1D' : fraudMetrics.status === 'WARNING' ? 'color:#78350F' : 'color:#064E3B'">
                    Integrity Check
                  </h3>
                </div>
                <div v-if="isUomMismatch" class="p-3 text-center bg-slate-50 text-slate-500 rounded-xl text-xs space-y-1">
                  <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Metrik Deviasi Dinonaktifkan</span>
                  <p class="text-[10px] text-slate-500 font-medium">Satuan timbangan (KG) dan penerimaan (LITER) berbeda.</p>
                </div>
                <div v-else class="p-3 space-y-2">
                  <div class="grid grid-cols-3 gap-2">
                    <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ratio</span>
                      <span class="text-sm font-black font-mono"
                        :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                        {{ formatPercentageCustom1(fraudMetrics.ratioPercent) }}
                      </span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Deviation</span>
                      <span class="text-sm font-black font-mono"
                        :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                        {{ fraudMetrics.direction === '=' ? '0,0%' : fraudMetrics.direction + formatPercentageCustom1(fraudMetrics.deviationPercent) }}
                      </span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Diff</span>
                      <span class="text-sm font-black font-mono"
                        :style="fraudMetrics.status === 'CRITICAL' ? 'color:#EF4444' : fraudMetrics.status === 'WARNING' ? 'color:#800057' : 'color:#3A6ABF'">
                        {{ fraudMetrics.direction === '=' ? '0' : fraudMetrics.direction + formatWeight(fraudMetrics.diff) }}
                      </span>
                    </div>
                  </div>
                  <div class="p-2.5 rounded-xl text-white text-center"
                    :style="{ background: fraudMetrics.status === 'CRITICAL' ? 'linear-gradient(135deg, #DC2626, #EF4444)' : fraudMetrics.status === 'WARNING' ? 'linear-gradient(135deg, #A0006D, #800057)' : 'linear-gradient(135deg, #4A8BDF, #3A6ABF)' }">
                    <span class="text-[10px] font-black tracking-widest uppercase">{{ fraudMetrics.status }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT COLUMN -->
            <div class="space-y-3">

              <!-- Tonnage (only show if any weight > 0) -->
              <div v-if="hasWeightData" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50 bg-slate-50/50">
                  <span class="material-icons text-emerald-500 text-[14px]">scale</span>
                  <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Tonnage Analytics</h3>
                </div>
                <div class="p-3.5 space-y-3">
                  <!-- 1. Weighing Inputs Grid (GROSS IN & TARE OUT) -->
                  <div class="grid grid-cols-2 gap-3">
                    <template v-if="currentTruck.processType === 'GBB' || currentTruck.processType === 'GSP'">
                      <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">GROSS (IN)</span>
                          <div class="text-xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(grossInVal) }}</div>
                        </div>
                        <span v-if="currentTruck.weighInBy?.name" class="text-[9px] font-bold text-slate-400 block mt-2">PIC: [TIMBANGAN] {{ currentTruck.weighInBy.name }}</span>
                      </div>
                      <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">TARE (OUT)</span>
                          <div class="text-xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(tareOutVal) }}</div>
                        </div>
                        <span v-if="currentTruck.weighOutBy?.name" class="text-[9px] font-bold text-slate-400 block mt-2">PIC: [TIMBANGAN] {{ currentTruck.weighOutBy.name }}</span>
                      </div>
                    </template>
                    <template v-else-if="currentTruck.processType === 'GBJ'">
                      <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">TARE (IN)</span>
                          <div class="text-xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(tareInVal) }}</div>
                        </div>
                        <span v-if="currentTruck.weighInBy?.name" class="text-[9px] font-bold text-slate-400 block mt-2">PIC: [TIMBANGAN] {{ currentTruck.weighInBy.name }}</span>
                      </div>
                      <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">GROSS (OUT)</span>
                          <div class="text-xl font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(grossOutVal) }}</div>
                        </div>
                        <span v-if="currentTruck.weighOutBy?.name" class="text-[9px] font-bold text-slate-400 block mt-2">PIC: [TIMBANGAN] {{ currentTruck.weighOutBy.name }}</span>
                      </div>
                    </template>
                  </div>

                  <!-- 2. Reconciled Weights Grid (BRIDGE NET & WAREHOUSE REALIZATION) -->
                  <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 rounded-2xl bg-emerald-50/30 border border-emerald-200/60 flex flex-col justify-between">
                      <div>
                        <span class="text-[9px] font-black text-emerald-600/80 uppercase tracking-widest block mb-1">BRIDGE NET</span>
                        <div class="text-xl font-black text-emerald-700 font-mono tracking-tight">{{ formatWeightCustom(nettoTimbanganJembatan) }}</div>
                      </div>
                    </div>
                    <div class="p-3 rounded-2xl bg-amber-50/30 border border-amber-200/60 flex flex-col justify-between">
                      <div>
                        <span class="text-[9px] font-black text-amber-700/80 uppercase tracking-widest block mb-1">WAREHOUSE REALIZATION</span>
                        <div class="text-xl font-black text-amber-800 font-mono tracking-tight">{{ formattedRealizationDisplay }}</div>
                      </div>
                      <span v-if="currentTruck.warehouseEndBy?.name || currentTruck.warehouseStartBy?.name" class="text-[9px] font-bold text-amber-700/80 block mt-2">PIC: [GUDANG] {{ currentTruck.warehouseEndBy?.name || currentTruck.warehouseStartBy?.name }}</span>
                    </div>
                  </div>

                  <!-- 3. Status and Alert Bar (DEVIATION CARD & BUTTON) -->
                  <div v-if="isUomMismatch" class="p-4 rounded-2xl border border-sky-200 bg-sky-50/60 flex items-center space-x-3">
                    <span class="material-icons text-sky-600 text-xl flex-shrink-0">info</span>
                    <div class="flex-1">
                      <span class="text-[9px] font-black text-sky-800 uppercase tracking-widest block">INFO SATUAN BERBEDA</span>
                      <p class="text-[11px] font-bold text-sky-900 leading-snug mt-0.5">
                        Deviasi belum dapat dihitung — satuan timbangan (KG) dan penerimaan (LITER) berbeda.
                      </p>
                    </div>
                  </div>
                  <div v-else class="p-4 rounded-2xl border border-rose-200/70 bg-rose-50/40 flex items-center justify-between gap-3">
                    <div class="flex flex-col">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">DEVIATION</span>
                      <div class="text-2xl font-black text-rose-700 font-mono tracking-tight">
                        {{ formatPercentageCustom(deviationPercentage) }}
                      </div>
                    </div>

                    <div class="flex items-center">
                      <span class="px-5 py-2.5 rounded-2xl text-[10px] uppercase tracking-widest font-black text-white shadow-sm transition-all"
                            :class="statusTonnage === 'OK' ? 'bg-emerald-600' : (statusTonnage === 'PENDING' ? 'bg-slate-500' : 'bg-amber-600')">
                        {{ statusTonnage === 'OK' ? 'PASSED / NORMAL' : (statusTonnage === 'PENDING' ? 'PENDING' : 'CHECK / INVESTIGASI') }}
                      </span>
                    </div>
                  </div>

                  <!-- 4. Alert Warning if triggerAlert is true -->
                  <div v-if="shouldShowAlert && !isUomMismatch" class="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200 flex items-center space-x-3">
                    <span class="material-icons text-rose-600 text-xl flex-shrink-0">warning</span>
                    <div class="flex-1">
                      <h4 class="text-[10px] font-black text-rose-900 uppercase tracking-widest">TONNAGE DEVIATION ALERT!</h4>
                      <p class="text-[10px] font-bold text-rose-700 leading-snug mt-0.5">
                        Weight deviation ({{ formatPercentageCustom(deviationPercentage) }}) exceeds the Net Weight Variance tolerance of {{ toleranceLimit }}%.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- No Weight Yet Placeholder -->
              <div v-else class="rounded-xl bg-white border border-dashed border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                <span class="material-icons text-slate-200 text-3xl mb-2">scale</span>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weighing Pending</p>
                <p class="text-[9px] text-slate-400 mt-1">Truck has not been weighed yet</p>
              </div>

              <!-- Operational Timeline -->
              <div class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50 bg-slate-50/50">
                  <span class="material-icons text-[#4A8BDF] text-[14px]">route</span>
                  <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Operational Roadmap</h3>
                </div>
                <div class="p-3">
                  <div class="relative space-y-3">
                    <!-- Vertical Timeline Line (centered on the dots) -->
                    <div class="absolute left-[7px] top-[12px] bottom-[12px] w-[2px] bg-slate-100 z-0 rounded-full">
                      <!-- Active Progress Line -->
                      <div class="absolute top-0 left-0 w-full bg-gradient-to-b from-[#4A8BDF] to-[#3A6ABF] transition-all duration-500 ease-out rounded-full"
                        :style="{ height: activeLineHeight }">
                      </div>
                    </div>

                    <div v-for="(ts, idx) in timestampRows" :key="ts.label" class="relative pl-8 flex items-center justify-between group z-10">
                      <!-- Dot indicator -->
                      <div class="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                        :class="ts.value && ts.value !== 'NOT APPLICABLE' && ts.value !== 'N/A' ? 'border-[#4A8BDF] shadow-[0_0_6px_rgba(74,139,223,0.35)]' : (ts.value === 'NOT APPLICABLE' || ts.value === 'N/A' ? 'border-slate-300 bg-slate-50' : 'border-slate-200')">
                        <!-- Glowing active pulse ring -->
                        <span v-if="idx === lastCompletedIdx && ts.value !== 'NOT APPLICABLE'" class="absolute -inset-[3px] rounded-full border border-[#4A8BDF]/50 bg-[#4A8BDF]/10 animate-ping"></span>
                        <div class="w-1.5 h-1.5 rounded-full z-10" :style="{ backgroundColor: ts.value && ts.value !== 'NOT APPLICABLE' && ts.value !== 'N/A' ? '#4A8BDF' : (ts.value === 'NOT APPLICABLE' || ts.value === 'N/A' ? '#94A3B8' : '#CBD5E1') }"></div>
                      </div>

                      <!-- Label and value -->
                      <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">{{ ts.label }}</span>
                      <div class="flex items-center space-x-1.5">
                        <span v-if="ts.value === 'NOT APPLICABLE' || ts.value === 'N/A'" class="px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">NOT APPLICABLE</span>
                        <span v-else class="text-[11px] font-bold text-slate-700 font-mono">{{ formatTimeFull(ts.value) }}</span>
                        <span v-if="ts.value && ts.value !== 'NOT APPLICABLE' && ts.value !== 'N/A'" class="material-icons text-[12px] text-emerald-500">check_circle</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Full-Width Audit Trail & Correction History (Admin Only / When Available) -->
          <!-- Full-Width Unified Audit Trail & Correction History (Accessible by Scoped Authenticated Users) -->
          <div v-if="(isAdmin || isSecurity || isQc || isWarehouse) && (historyLoading || timelineData.length > 0 || correctionCount > 0 || historyError)" class="mt-3.5 rounded-xl overflow-hidden bg-white border border-slate-200/90 shadow-sm">
            <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/80">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-amber-600 text-[16px]">history_edu</span>
                <h3 class="text-[11px] font-black text-slate-700 uppercase tracking-[0.15em]">Audit Trail & Operation Log History</h3>
                <span class="px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[9px] font-black font-mono">{{ timelineData.length || correctionCount }} Entri</span>
              </div>
              <button @click="fetchCorrectionHistory" class="text-[10px] font-bold text-slate-500 hover:text-amber-600 flex items-center gap-1 transition-colors">
                <span class="material-icons text-[13px]">refresh</span> Reload
              </button>
            </div>

            <!-- Void Status Banner if Voided -->
            <div v-if="attributionData?.isVoided" class="px-4 py-2 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-rose-800">
              <div class="flex items-center gap-1.5">
                <span class="material-icons text-sm text-rose-600">block</span>
                <span class="uppercase tracking-wider font-black">Transaksi Void:</span>
                <span class="font-bold text-rose-950">[{{ attributionData.voidMetadata?.voidReasonCode || 'ADMIN_VOID' }}] {{ attributionData.voidMetadata?.voidReason || 'Dibatalkan secara administratif' }}</span>
              </div>
              <div v-if="attributionData.voidMetadata?.voidedBy" class="text-[10px] text-rose-700 font-mono">
                Oleh: {{ attributionData.voidMetadata.voidedBy }}
              </div>
            </div>

            <!-- Attribution Banner (Original Creator vs Last Corrected) -->
            <div v-if="attributionData" class="px-4 py-2 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-600">
              <div class="flex items-center gap-1.5">
                <span class="material-icons text-xs text-slate-400">person_outline</span>
                <span>Operator Awal:</span>
                <span class="font-bold text-slate-800">{{ attributionData.originalCreatedBy }}</span>
              </div>
              <div v-if="attributionData.lastCorrectedBy" class="flex items-center gap-1.5">
                <span class="material-icons text-xs text-amber-500">edit_note</span>
                <span>Koreksi Terakhir Oleh:</span>
                <span class="font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-200 text-[10px]">{{ attributionData.lastCorrectedBy }}</span>
              </div>
            </div>

            <!-- Loading state -->
            <div v-if="historyLoading" class="p-6 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <span class="material-icons animate-spin text-2xl text-amber-600">sync</span>
              <span class="text-xs font-bold">Memuat riwayat audit terpadu...</span>
            </div>

            <!-- Error state -->
            <div v-else-if="historyError" class="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between m-3">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-rose-600 text-base">error_outline</span>
                <span class="font-bold">{{ historyError }}</span>
              </div>
              <button @click="fetchCorrectionHistory" type="button" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all">
                <span class="material-icons text-xs">refresh</span> Reload
              </button>
            </div>

            <!-- Empty state -->
            <div v-else-if="!timelineData.length && !auditHistory.length" class="p-6 text-center text-slate-400">
              <p class="text-xs font-medium">Belum ada catatan audit atau koreksi log operasi pada transaksi ini.</p>
            </div>

            <!-- Unified Timeline List -->
            <div v-else class="divide-y divide-slate-100 max-h-64 overflow-y-auto custom-scrollbar">
              <div v-for="(item, idx) in (timelineData.length ? timelineData : auditHistory)" :key="idx" class="p-3 hover:bg-slate-50/60 transition-colors text-xs space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[9px] font-black tracking-wider text-white uppercase font-mono"
                      :class="item.eventType === 'DATA_CORRECTION' ? 'bg-amber-600' : item.eventType === 'WORKFLOW_REOPEN' ? 'bg-purple-600' : item.eventType === 'ADMIN_VOID' ? 'bg-rose-600' : 'bg-blue-600'">
                      {{ item.eventType ? item.eventType.replace('_', ' ') : (item.action || 'MODIFY') }}
                    </span>
                    <span v-if="item.module" class="font-bold text-slate-700 font-mono text-[11px]">{{ item.module }}</span>
                    <span v-if="item.correctionNumber" class="text-[9px] text-slate-400 font-mono">{{ item.correctionNumber }}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono">{{ formatTimeFull(item.timestamp || item.createdAt) }}</span>
                </div>

                <div class="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 font-bold">Oleh:</span>
                    <span class="font-black text-slate-800">{{ item.actor || item.user?.name || item.userId || 'Sistem' }}</span>
                  </div>
                  <div v-if="item.reasonCode" class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 font-bold">
                    {{ item.reasonCode }}
                  </div>
                </div>

                <div v-if="item.remark || item.notes || item.reason" class="text-slate-700 text-xs font-medium bg-white p-2 rounded border border-slate-100 shadow-2xs">
                  <span class="font-black text-slate-900">Keterangan:</span> {{ item.remark || item.notes || item.reason }}
                </div>

                <!-- Status Transition Details -->
                <div v-if="item.eventType === 'STATUS_TRANSITION' || (item.oldStatus && item.newStatus)" class="flex items-center gap-2 text-[10px] font-mono bg-blue-50/60 p-2 rounded border border-blue-100">
                  <span class="text-slate-500 font-bold">Transisi Status:</span>
                  <span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{{ getStatusLabel(item.oldStatus, currentTruck?.processType) || 'NONE' }}</span>
                  <span class="material-icons text-xs text-blue-600">arrow_forward</span>
                  <span class="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">{{ getStatusLabel(item.newStatus, currentTruck?.processType) }}</span>
                </div>

                <!-- Field Level Diff if single item -->
                <div v-if="item.fieldName" class="grid grid-cols-3 gap-2 bg-slate-50/90 border border-slate-200/70 rounded-lg p-2 text-[10px] font-mono items-center">
                  <div class="text-slate-600 font-bold truncate">Field: <span class="text-slate-900 font-black text-[11px]">{{ item.fieldName }}</span></div>
                  <div class="text-rose-700 font-medium truncate">Old: <span class="line-through">{{ item.oldValue !== undefined ? item.oldValue : '-' }}</span></div>
                  <div class="text-emerald-700 font-bold truncate">New: <span>{{ item.newValue !== undefined ? item.newValue : '-' }}</span></div>
                </div>

                <!-- Multi-item correction diffs if legacy items list -->
                <div v-if="item.items && item.items.length" class="mt-1 space-y-1">
                  <div v-for="(subItem, iIdx) in item.items" :key="iIdx" class="grid grid-cols-3 gap-2 bg-slate-50/90 border border-slate-200/70 rounded-lg p-2 text-[10px] font-mono items-center">
                    <div class="text-slate-600 font-bold truncate">Field: <span class="text-slate-900 font-black text-[11px]">{{ subItem.fieldName }}</span></div>
                    <div class="text-rose-700 font-medium truncate">Old: <span class="line-through">{{ subItem.oldValue !== undefined ? subItem.oldValue : '-' }}</span></div>
                    <div class="text-emerald-700 font-bold truncate">New: <span>{{ subItem.newValue !== undefined ? subItem.newValue : '-' }}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer (Compact) -->
        <div class="px-4 py-2.5 flex justify-between shrink-0" style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
          <button v-if="authStore.isAdmin && canVoidCurrentTransaction"
            @click="openVoidModal"
            title="Mengeluarkan transaksi dari operasional tanpa menghapus data historis (Void / Soft-Delete)"
            class="group relative overflow-hidden flex items-center space-x-1.5 px-4 py-2 rounded-lg transition-all duration-300 hover:shadow-md active:scale-[0.97]"
            style="background: linear-gradient(135deg, #EF4444, #B91C1C); box-shadow: 0 2px 8px rgba(239,68,68,0.25);">
            <span class="material-icons text-white/90 text-[14px]">block</span>
            <span class="text-[10px] font-black text-white uppercase tracking-[0.12em]">Void Transaksi</span>
          </button>
          <div v-else></div>
          <button @click="close" class="group relative overflow-hidden flex items-center space-x-1.5 px-5 py-2 rounded-lg transition-all duration-300 hover:shadow-md active:scale-[0.97]"
            style="background: linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 2px 8px rgba(74,139,223,0.25);">
            <span class="material-icons text-white/80 text-[14px]">logout</span>
            <span class="text-[10px] font-black text-white uppercase tracking-[0.12em]">Close</span>
          </button>
        </div>
      </div>
    </div>
  </transition>

  <!-- Photo Viewer Lightbox -->
  <transition name="fade">
    <div v-if="selectedPhoto" class="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-4" style="background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px);" @click.self="selectedPhoto = null">
      <!-- Top Toolbar -->
      <div class="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
        <div class="text-white font-black tracking-widest uppercase text-[10px] bg-black/30 px-3 py-1.5 rounded-full pointer-events-auto backdrop-blur-md">
          QC Attachment
        </div>
        <div class="flex items-center space-x-3 pointer-events-auto">
          <a :href="selectedPhoto" download="QC_Attachment.jpg" class="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg backdrop-blur-md">
            <span class="material-icons text-lg">download</span>
          </a>
          <button @click="selectedPhoto = null" class="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg backdrop-blur-md">
            <span class="material-icons text-lg">close</span>
          </button>
        </div>
      </div>

      <!-- Image Container -->
      <AuthenticatedImage :src="selectedPhoto" class="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain ring-1 ring-white/10" />
    </div>
  </transition>

  <!-- Admin Correction Modal Overlay (Fail-Closed & High-Accountability UI) -->
      <transition name="modal">
        <div v-if="showCorrectionModal" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="showCorrectionModal = false">
          <div class="bg-white rounded-2xl w-full max-w-4xl p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-amber-600">edit_note</span>
                <h3 class="text-base font-black text-slate-800">Koreksi Log Operasi (Admin)</h3>
              </div>
              <button @click="showCorrectionModal = false" class="text-slate-400 hover:text-slate-600 transition-colors">
                <span class="material-icons">close</span>
              </button>
            </div>

            <!-- Error Banner -->
            <div v-if="correctionError" class="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-start gap-2">
              <span class="material-icons text-base text-red-600 shrink-0">error_outline</span>
              <span>{{ correctionError }}</span>
            </div>

            <!-- OCC Concurrency Conflict Warning Banner (Fail-Closed) -->
            <div v-if="occConflictError" class="p-4 bg-amber-50 border-2 border-amber-400 text-amber-950 rounded-xl text-xs space-y-2">
              <div class="flex items-center gap-2 font-black">
                <span class="material-icons text-amber-600 text-base">verified_user</span>
                <span class="uppercase tracking-wide">Konflik Konkurensi (OCC Protect)</span>
              </div>
              <p class="font-medium text-slate-700">{{ occConflictError }}</p>
              <div class="flex justify-end pt-1">
                <button @click="refreshAfterConflict" type="button" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-sm">
                  <span class="material-icons text-[14px]">refresh</span> Refresh Data
                </button>
              </div>
            </div>

            <!-- Sensitive Change Confirmation Notice Box -->
            <div v-if="showSensitiveConfirm" class="p-4 bg-red-50/90 border-2 border-red-300 rounded-xl space-y-3 animate-fade">
              <div class="flex items-center space-x-2 text-red-800 font-black text-xs uppercase tracking-wider">
                <span class="material-icons text-red-600 text-base">warning</span>
                <span>Konfirmasi Perubahan Sensitif (Status / Bobot Ekstrim)</span>
              </div>
              <p class="text-xs text-slate-700 font-medium leading-relaxed">
                Anda mendeteksi modifikasi <b>Status Transaksi</b> atau perubahan angka signifikan yang berdampak pada rekonsiliasi tonase. Tindakan ini dicatat permanen dalam Audit Trail (Old/New Value).
              </p>
              <div class="flex justify-end space-x-2 pt-1">
                <button @click="showSensitiveConfirm = false" type="button" class="px-3 py-1.5 bg-white text-slate-700 font-bold text-xs rounded-lg border border-slate-200 hover:bg-slate-100">Batal</button>
                <button @click="executeCorrectionSubmission" type="button" class="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm">Ya, Lanjutkan Koreksi</button>
              </div>
            </div>

            <!-- Main Form (Hidden if confirming sensitive change) -->
            <div v-else class="space-y-4">
              <!-- 0. Jenis Tindakan Koreksi (Action) -->
              <div class="p-3 bg-amber-50/40 rounded-xl border border-amber-200/80 space-y-2">
                <label class="block font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Jenis Tindakan Koreksi <span class="text-red-500">*</span>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all"
                    :class="correctionForm.action === 'CORRECT_DATA' ? 'border-amber-500 bg-white ring-2 ring-amber-400/20 shadow-2xs' : 'border-slate-200 bg-slate-50/60 hover:bg-white'">
                    <input type="radio" v-model="correctionForm.action" value="CORRECT_DATA" class="mt-0.5 text-amber-600 focus:ring-amber-500" />
                    <div>
                      <div class="text-xs font-bold text-slate-800">Koreksi Data</div>
                      <div class="text-[10px] text-slate-500">Ubah nilai timbangan, identitas, atau QC</div>
                    </div>
                  </label>
                  <label class="flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all"
                    :class="correctionForm.action === 'REOPEN_WORKFLOW' ? 'border-amber-500 bg-white ring-2 ring-amber-400/20 shadow-2xs' : 'border-slate-200 bg-slate-50/60 hover:bg-white'">
                    <input type="radio" v-model="correctionForm.action" value="REOPEN_WORKFLOW" class="mt-0.5 text-amber-600 focus:ring-amber-500" />
                    <div>
                      <div class="text-xs font-bold text-slate-800">Buka Ulang Workflow</div>
                      <div class="text-[10px] text-slate-500">REOPEN ke tahap sebelumnya</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Explicit Target Tahap REOPEN (hanya jika action === 'REOPEN_WORKFLOW') -->
              <div v-if="correctionForm.action === 'REOPEN_WORKFLOW'" class="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 animate-fade">
                <label class="block font-bold text-amber-900 text-[11px] uppercase tracking-wider">
                  Target Tahap REOPEN <span class="text-red-500">*</span>
                </label>
                <select v-model="correctionForm.reopenTargetStatus" :disabled="reopenMatrixLoading || !!reopenMatrixError" class="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs shadow-2xs disabled:cursor-not-allowed disabled:bg-slate-100">
                  <option value="" disabled>-- Pilih Target Tahap REOPEN (Wajib) --</option>
                  <option v-for="target in allowedReopenTargets" :key="target.value" :value="target.value">
                    {{ target.label }}
                  </option>
                </select>
                <p v-if="reopenMatrixLoading" class="text-[10px] text-amber-800 font-medium">Memuat matriks target REOPEN...</p>
                <p v-else-if="reopenMatrixError" class="text-[10px] text-red-700 font-medium">{{ reopenMatrixError }}</p>
                <p v-else class="text-[10px] text-amber-800 font-medium">
                  * Matriks target REOPEN untuk tipe proses: <b class="uppercase">{{ currentProcessType }}</b>
                </p>
              </div>

              <!-- 1. Alasan Koreksi (Wajib) -->
              <div>
                <label class="block font-bold text-slate-700 mb-1 text-[11px] uppercase tracking-wider">Kategori Alasan Koreksi <span class="text-red-500">*</span></label>
                <select v-model="correctionForm.reasonCategory" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-xs">
                  <option value="" disabled>-- Pilih Kategori Alasan Koreksi (Wajib) --</option>
                  <option value="SALAH_INPUT_ANGKA">Salah Input Angka / Penimbangan</option>
                  <option value="PENYESUAIAN_DOKUMEN">Penyesuaian Dokumen / Surat Jalan</option>
                  <option value="PERUBAHAN_KONDISI_LAPANGAN">Perubahan Kondisi Aktual di Lapangan</option>
                  <option value="KOREKSI_STATUS_SENSITIF">Koreksi Status Transaksi (Sensitif)</option>
                  <option value="LAINNYA">Lainnya (Jelaskan di catatan)</option>
                </select>
              </div>

              <!-- 2. Catatan Singkat (Wajib, min 10 karakter) -->
              <div>
                <div class="flex justify-between items-center mb-1">
                  <label class="block font-bold text-slate-700 text-[11px] uppercase tracking-wider">Catatan Singkat & Penjelasan <span class="text-red-500">*</span></label>
                  <span class="text-[10px] font-mono font-bold" :class="correctionForm.remark.trim().length < 10 ? 'text-amber-600' : 'text-emerald-600'">
                    {{ correctionForm.remark.trim().length }} / min. 10 karakter
                  </span>
                </div>
                <textarea v-model="correctionForm.remark" rows="3" placeholder="Jelaskan secara akurat alasan koreksi ini agar dapat diverifikasi Auditor..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-xs"></textarea>
              </div>

              <!-- 3. Lampiran Bukti Dokumen / Foto (Opsional) -->
              <div>
                <label class="block font-bold text-slate-700 mb-1 text-[11px] uppercase tracking-wider">Lampiran Bukti Dokumen <span class="text-slate-400 font-normal">(Opsional)</span></label>
                <div class="flex flex-col gap-2">
                  <input v-model="correctionForm.evidenceUrl" type="url" placeholder="Reference URL legacy (bukan bukti fisik terverifikasi)" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-mono text-xs" />
                  <p class="text-[10px] text-slate-500">Bukti fisik resmi harus diunggah sebagai attachment agar ownership dan checksum dapat diverifikasi server.</p>
                  <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span class="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <span class="material-icons text-sm text-amber-600">upload_file</span> Unggah Bukti Fisik / Foto:
                    </span>
                    <input type="file" @change="handleEvidenceUpload" :disabled="evidenceUploadLoading" class="text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200 cursor-pointer disabled:opacity-50" accept="image/jpeg,image/png,application/pdf" />
                  </div>
                  <span v-if="evidenceUploadLoading" class="text-[10px] font-bold text-amber-700 flex items-center gap-1">Mengunggah dan memverifikasi attachment...</span>
                  <span v-if="evidenceUploadError" class="text-[10px] font-bold text-red-700 flex items-center gap-1">
                    {{ evidenceUploadError }}
                  </span>
                  <span v-if="correctionForm.evidencePhoto && correctionForm.evidenceAttachmentId" class="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                    ✓ File terlampir: {{ correctionForm.evidencePhoto }} (ID: {{ correctionForm.evidenceAttachmentId }})
                  </span>
                </div>
              </div>

              <!-- 4. Target Nilai Koreksi Per Modul (Tabs) -->
              <div v-if="correctionForm.action === 'CORRECT_DATA'" class="p-5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-4 shadow-2xs">
                <div class="space-y-2 border-b border-slate-200/80 pb-3">
                  <div class="flex items-center justify-between">
                    <h4 class="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <span class="w-6 h-6 rounded-lg bg-amber-100/80 border border-amber-200 flex items-center justify-center text-amber-700">
                        <span class="material-icons text-sm">tune</span>
                      </span>
                      <span>Modul Koreksi (Source Data vs Kalkulasi)</span>
                    </h4>
                    <span class="text-[10px] font-bold text-slate-400">Pilih modul yang akan dikoreksi</span>
                  </div>

                  <!-- Responsive process-aware module tabs -->
                  <div class="bg-slate-200/70 p-1 rounded-xl font-bold text-xs border border-slate-200/80">
                    <div class="flex flex-wrap gap-1 text-[11px]">
                      <button type="button" @click="activeCorrectionTab = 'WEIGHBRIDGE'"
                        :class="activeCorrectionTab === 'WEIGHBRIDGE' ? 'bg-[#4A8BDF] text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40 font-bold'"
                        class="flex-1 min-w-[7rem] py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase">
                        <span class="material-icons text-sm">scale</span><span>Timbangan</span>
                      </button>
                      <button type="button" @click="activeCorrectionTab = 'IDENTITY'"
                        :class="activeCorrectionTab === 'IDENTITY' ? 'bg-[#4A8BDF] text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40 font-bold'"
                        class="flex-1 min-w-[7rem] py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase">
                        <span class="material-icons text-sm">badge</span><span>Identitas</span>
                      </button>
                      <button v-if="currentProcessType === 'GBB' && imOriginal.id" type="button" @click="activeCorrectionTab = 'QC_LAB'"
                        :class="activeCorrectionTab === 'QC_LAB' ? 'bg-[#4A8BDF] text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40 font-bold'"
                        class="flex-1 min-w-[7rem] py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase">
                        <span class="material-icons text-sm">science</span><span>QC Biji GBB</span>
                      </button>
                      <button v-if="currentProcessType === 'GSP' && !isSolarCommodity && (paCorrectionRecord || paCorrectionAmbiguous)" type="button" @click="activeCorrectionTab = 'QC_PA'"
                        :class="activeCorrectionTab === 'QC_PA' ? 'bg-[#4A8BDF] text-white font-black' : 'text-slate-600 font-bold'"
                        class="flex-1 min-w-[7rem] py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 uppercase">
                        <span class="material-icons text-sm">biotech</span><span>Hasil Analisa PA GSP</span>
                      </button>
                      <button type="button" @click="activeCorrectionTab = 'QC_SAMPLING'"
                        :class="activeCorrectionTab === 'QC_SAMPLING' ? 'bg-[#4A8BDF] text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40 font-bold'"
                        class="flex-1 min-w-[7rem] py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase">
                        <span class="material-icons text-sm">fact_check</span>
                        <span>{{ currentProcessType === 'GBJ' ? 'QC Kendaraan GBJ' : currentProcessType === 'GSP' ? 'Pra-bongkar GSP' : 'Sampling Awal GBB' }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- TAB 1: WEIGHBRIDGE & REALIZATION (Source Data) -->
                <div v-if="activeCorrectionTab === 'WEIGHBRIDGE'" class="space-y-4 animate-fadeInUp">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <!-- Input 1: Gross Weight -->
                    <div class="space-y-1">
                      <label class="block text-[10px] font-black text-slate-600 uppercase tracking-wider">Gross Weight (kg) [Source: {{ weightRecordTypes.gross === 'IN' ? 'Timbangan Masuk (IN)' : 'Timbangan Keluar (OUT)' }}]</label>
                      <div class="relative">
                        <input v-model.number="correctionForm.grossWeight" type="number"
                          :disabled="!currentGrossRecord"
                          class="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          :class="Number(correctionForm.grossWeight) !== Number(currentGrossWeight) ? 'border-amber-400 ring-4 ring-amber-400/10 bg-amber-50/30' : ''" />
                      </div>
                      <span class="text-[10px] font-mono font-semibold text-slate-400 block pt-0.5">Current: {{ currentGrossWeight ?? '—' }} kg · {{ currentGrossRecord ? 'record current' : 'record current tidak tersedia' }}</span>
                    </div>

                    <!-- Input 2: Tare Weight -->
                    <div class="space-y-1">
                      <label class="block text-[10px] font-black text-slate-600 uppercase tracking-wider">Tare Weight (kg) [Source: {{ weightRecordTypes.tare === 'IN' ? 'Timbangan Masuk (IN)' : 'Timbangan Keluar (OUT)' }}]</label>
                      <div class="relative">
                        <input v-model.number="correctionForm.tareWeight" type="number"
                          :disabled="!currentTareRecord"
                          class="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          :class="Number(correctionForm.tareWeight) !== Number(currentTareWeight) ? 'border-amber-400 ring-4 ring-amber-400/10 bg-amber-50/30' : ''" />
                      </div>
                      <span class="text-[10px] font-mono font-semibold text-slate-400 block pt-0.5">Current: {{ currentTareWeight ?? '—' }} kg · {{ currentTareRecord ? 'record current' : 'record current tidak tersedia' }}</span>
                    </div>

                    <!-- Input 3: process-specific warehouse realization -->
                    <div class="space-y-1">
                      <label class="block text-[10px] font-black text-slate-600 uppercase tracking-wider">
                        {{ currentProcessType === 'GSP' ? `Jumlah Diterima (${currentReceivedUnit || '—'})` : currentProcessType === 'GBJ' ? `Jumlah Muat (${currentWarehouseUnit || '—'})` : 'Realisasi Gudang (kg)' }}
                      </label>
                      <div class="relative">
                        <input v-if="currentProcessType === 'GSP'" v-model="correctionForm.receivedQuantity" type="text" inputmode="decimal" placeholder="contoh: 1234.567"
                          :disabled="!currentWarehouseRecord || !gspReceivingUnitValid"
                          class="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" />
                        <input v-else-if="currentProcessType === 'GBJ'" v-model.number="correctionForm.actualQuantity" type="number" min="0" step="1" :disabled="!gbjWarehouseCorrectionValid" aria-label="Jumlah muat GBJ" class="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold disabled:bg-slate-100" />
                        <input v-else v-model.number="correctionForm.actualWeight" type="number"
                          :disabled="!currentWarehouseRecord"
                          class="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          :class="Number(correctionForm.actualWeight) !== Number(currentActualWeight) ? 'border-amber-400 ring-4 ring-amber-400/10 bg-amber-50/30' : ''" />
                      </div>
                      <span class="text-[10px] font-mono font-semibold text-slate-400 block pt-0.5">
                        Current: {{ currentProcessType === 'GSP' ? (currentReceivedQuantity ?? '—') : currentProcessType === 'GBJ' ? (currentActualQuantity ?? '—') : (currentActualWeight ?? '—') }} {{ currentProcessType === 'GSP' ? (currentReceivedUnit || '—') : currentProcessType === 'GBJ' ? (currentWarehouseUnit || '—') : 'kg' }} · {{ currentWarehouseRecord ? 'sumber WarehouseProcess current' : 'record WarehouseProcess current tidak tersedia' }}
                      </span>
                    </div>
                  </div>

                  <!-- Executive Calculated Card -->
                  <div class="p-4 bg-white border border-slate-200/90 rounded-2xl space-y-3 shadow-xs">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div class="flex items-center gap-1.5">
                        <span class="material-icons text-slate-400 text-base">lock</span>
                        <span class="text-[11px] font-black text-slate-800 uppercase tracking-wider">KALKULASI OTOMATIS SISTEM</span>
                      </div>
                      <span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-wider border border-slate-200/60">SOURCE-DRIVEN</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <!-- Box 1: Net Weight Kalkulasi -->
                      <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-1">
                        <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">NET WEIGHT (GROSS - TARE)</div>
                        <div class="text-lg font-black text-slate-900 font-mono flex items-baseline gap-1">
                          <span>{{ correctionNetWeight === null ? '—' : correctionNetWeight.toLocaleString() }}</span>
                          <span class="text-xs font-bold text-slate-500">kg</span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-semibold font-mono">Original Net: {{ currentTruck?.netWeight === null || currentTruck?.netWeight === undefined ? '—' : Number(currentTruck.netWeight).toLocaleString() }} kg</div>
                      </div>

                      <!-- Box 2: Warehouse Realization & Deviasi -->
                      <div class="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-1">
                        <div class="text-[9px] font-black text-amber-800 uppercase tracking-widest">WAREHOUSE REALIZATION &amp; DEVIASI</div>
                        <div class="text-xs font-bold text-amber-900 font-mono">Actual: {{ currentProcessType === 'GSP' ? (correctionForm.receivedQuantity ?? '—') : currentProcessType === 'GBJ' ? (correctionForm.actualQuantity ?? '—') : (correctionForm.actualWeight ?? '—') }} {{ currentProcessType === 'GSP' ? (currentReceivedUnit || '—') : currentProcessType === 'GBJ' ? (currentWarehouseUnit || '—') : 'kg' }}</div>
                        <div class="text-[10px] font-bold font-mono pt-0.5 flex items-center justify-between">
                          <div class="flex items-center gap-1">
                            <span class="text-slate-500">Deviasi:</span>
                            <span v-if="currentProcessType !== 'GBB'" class="text-sky-700 font-bold text-[10px]">Jumlah mengikuti unit sumber; tidak dibandingkan dengan net kg</span>
                            <span v-else-if="isUomMismatch" class="text-sky-700 font-bold text-[10px]">
                              UOM Berbeda ({{ gspReceiptUnit }})
                            </span>
                            <span v-else-if="currentProcessType !== 'GSP'" :class="isCorrectionDeviationExceeded ? 'text-rose-600 font-black' : 'text-slate-800 font-bold'">
                              {{ correctionDeviationKg === null ? '—' : correctionDeviationKg.toLocaleString() }} kg
                              <span v-if="correctionDeviationPct !== null" class="text-[9px] font-normal">
                                ({{ correctionDeviationPct.toFixed(2) }}% / max {{ toleranceLimit }}%)
                              </span>
                            </span>
                          </div>
                          <span v-if="isCorrectionDeviationExceeded" class="text-[9px] font-black px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded uppercase">
                            Exceeds Tol
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- TAB 2: IDENTITY -->
                <div v-if="activeCorrectionTab === 'IDENTITY'" class="space-y-3 animate-fade">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Nomor Polisi</label>
                      <input v-model="correctionForm.plateNumber" type="text" placeholder="B 1234 ABC..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono uppercase" :class="correctionForm.plateNumber !== (currentTruck?.plateNumber || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Nama Supir / PIC</label>
                      <input v-model="correctionForm.driverName" type="text" placeholder="Nama supir..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-semibold" :class="correctionForm.driverName !== (currentTruck?.driverName || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Vendor / Ekspedisi</label>
                      <input v-model="correctionForm.vendorName" type="text" placeholder="Nama perusahaan vendor..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-semibold" :class="correctionForm.vendorName !== (currentTruck?.vendorName || currentTruck?.vendor || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Jenis Kendaraan / Armada</label>
                      <input v-model="correctionForm.vehicleType" type="text" placeholder="Tronton / Wingbox / dll..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-semibold" :class="correctionForm.vehicleType !== (currentTruck?.vehicleType || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">No. HP Supir / Driver Phone</label>
                      <input v-model="correctionForm.driverPhone" type="text" placeholder="08123456789..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono" :class="correctionForm.driverPhone !== (currentTruck?.driverPhone || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">No. Surat Jalan / Delivery Note (SJ)</label>
                      <input v-model="correctionForm.suratJalanNumber" type="text" placeholder="Nomor surat jalan..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono" :class="correctionForm.suratJalanNumber !== (currentTruck?.suratJalanNumber || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Logistics PO / No. PO</label>
                      <input v-model="correctionForm.poNumber" type="text" placeholder="Nomor PO..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono" :class="correctionForm.poNumber !== (currentTruck?.poNumber || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Permit Card / No. VMS</label>
                      <input v-model="correctionForm.permitCardNumber" type="text" placeholder="Nomor Permit Card / VMS..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono" :class="correctionForm.permitCardNumber !== (currentTruck?.permitCardNumber || currentTruck?.permitCard || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">No. KTP / ID Number</label>
                      <input v-model="correctionForm.guestIdNumber" type="text" placeholder="Nomor KTP / Guest ID..." class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs font-mono" :class="correctionForm.guestIdNumber !== (currentTruck?.guestIdNumber || currentTruck?.guestId || '') ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    </div>
                  </div>
                </div>

                <!-- TAB 3: GBB Incoming Material Lab only -->
                <div v-if="activeCorrectionTab === 'QC_LAB' && currentProcessType === 'GBB' && imOriginal.id" class="space-y-3.5 animate-fade">
                  <div class="p-2.5 bg-blue-50/80 border border-blue-200/80 rounded-xl flex items-center gap-2 text-[11px] text-blue-900 font-medium shadow-2xs">
                    <span class="material-icons text-blue-600 text-sm shrink-0">science</span>
                    <span>Koreksi parameter Quality Analysis (QC Lab) & pengujian mutu material.</span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Hasil Status QC Lab</label>
                      <select v-model="correctionForm.imResult" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.imResult !== imOriginal.result ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                        <option :value="null">Tidak diubah</option>
                        <option value="APPROVED">APPROVED (Lolos Mutu)</option>
                        <option value="REJECTED">REJECTED (Ditolak Lab)</option>
                        <option value="APPROVED_WITH_NOTE">APPROVED WITH NOTE (Konsesi)</option>
                      </select>
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.rawResult || imOriginal.result }}</span>
                    </div>

                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Kadar Air (% Moisture)</label>
                      <input v-model.number="correctionForm.imMoisture" type="number" step="0.01" placeholder="0.00" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="Number(correctionForm.imMoisture) !== Number(imOriginal.moisture) ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.moisture }}%</span>
                    </div>

                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Total FM (% Foreign Matter)</label>
                      <input v-model.number="correctionForm.imForeignMatter" type="number" step="0.01" placeholder="0.00" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="Number(correctionForm.imForeignMatter) !== Number(imOriginal.foreignMatter) ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.foreignMatter }}%</span>
                    </div>

                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Berat Sample / Biji OK (gr)</label>
                      <input v-model.number="correctionForm.imSampleWeight" type="number" step="1" placeholder="0" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="Number(correctionForm.imSampleWeight) !== Number(imOriginal.sampleWeight) ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.sampleWeight }} gr</span>
                    </div>

                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Persentase Biji Baik (%)</label>
                      <input v-model.number="correctionForm.imGoodBeanPercentage" type="number" step="0.1" placeholder="0.0" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="Number(correctionForm.imGoodBeanPercentage) !== Number(imOriginal.goodBeanPercentage) ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.goodBeanPercentage }}%</span>
                    </div>

                    <div>
                      <label class="block font-bold text-slate-700 mb-1 text-[11px]">Pemeriksaan Bau (Odor) & Warna</label>
                      <div class="grid grid-cols-2 gap-2">
                        <select v-model="correctionForm.imOdor" class="w-full pl-2.5 pr-6 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.imOdor !== imOriginal.odor ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                          <option :value="null">Odor: tidak diubah</option>
                          <option value="PASS">Odor: PASS</option>
                          <option value="REJECT">Odor: REJECT</option>
                        </select>
                        <select v-model="correctionForm.imColor" class="w-full pl-2.5 pr-6 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.imColor !== imOriginal.color ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                          <option :value="null">Color: tidak diubah</option>
                          <option value="PASS">Color: PASS</option>
                          <option value="REJECT">Color: REJECT</option>
                        </select>
                      </div>
                      <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ imOriginal.odor || '—' }} / {{ imOriginal.color || '—' }}</span>
                    </div>
                  </div>

                  <div>
                    <label class="block font-bold text-slate-700 mb-1 text-[11px]">Catatan Defect & Alasan Konsesi Lab</label>
                    <input v-model="correctionForm.imNotes" type="text" placeholder="Catatan hasil inspeksi material..." class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="correctionForm.imNotes !== imOriginal.notes ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                  </div>
                </div>

                <div v-if="currentProcessType === 'GSP' && (paCorrectionRecord || paCorrectionAmbiguous)" v-show="activeCorrectionTab === 'QC_PA'" class="space-y-3.5">
                  <PaCorrectionEditor :key="paEditorKey" :record="paCorrectionRecord" :transaction="currentTruck"
                    :preview="paCorrectionPreview" :preview-error="paCorrectionPreviewError"
                    :loading="correctionLoading || paCorrectionLoading" :ambiguous="paCorrectionAmbiguous"
                    @preview="previewPaCorrection" @item="setPaCorrectionItem"
                    @dirty="paCorrectionDirty = $event" @invalidate="invalidatePaCorrectionPreview" />
                </div>

                <!-- TAB 4: process-specific sampling/read-only source -->
                <div v-if="activeCorrectionTab === 'QC_SAMPLING'" class="space-y-3.5 animate-fade">
                  <div class="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-start gap-2 text-[11px] text-indigo-900 font-medium shadow-2xs leading-relaxed">
                    <span class="material-icons text-indigo-600 text-sm shrink-0">assignment_turned_in</span>
                    <span v-if="currentProcessType === 'GBB'">Sampling awal GBB hanya memakai tiga parameter: visual, bau, dan estimasi moisture. Checklist gudang tidak dipetakan ke QC Vehicle.</span>
                    <span v-else-if="currentProcessType === 'GBJ'">QC Vehicle GBJ memiliki lima item resmi. Hasil checklist, bukti, dan keputusan dapat dikoreksi pada record current yang valid; severity tetap mengikuti policy server.</span>
                    <span v-else-if="currentProcessType === 'GSP'">PA GSP tetap hanya-baca. Hasil pemeriksaan pra-bongkar sembilan item dapat dikoreksi jika sesuai disposisi dan bukti existing. Tidak ada koreksi QC Vehicle legacy untuk GSP.</span>
                    <span v-else>Process tidak dikenali. Modul QC dinonaktifkan secara fail-closed.</span>
                  </div>

                  <template v-if="currentProcessType === 'GBB' && qcvOriginal.id">
                  <!-- 1. Form Utama Initial QC Sampling (Bau, Visual, Moisture) -->
                  <div class="p-3.5 bg-white rounded-2xl border border-indigo-100/90 space-y-3 shadow-2xs">
                    <div class="flex items-center justify-between border-b border-indigo-50 pb-2">
                      <h5 class="text-[10px] font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1.5">
                        <span class="material-icons text-sm text-indigo-600">biotech</span>
                        <span>1. Initial QC Sampling (Pre-Unloading)</span>
                      </h5>
                      <span class="text-[9px] font-mono text-indigo-400 uppercase tracking-wide">3 Parameter Sampling</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="block font-bold text-slate-700 mb-1 text-[11px]">Hasil Initial Sampling</label>
                        <select v-model="correctionForm.qcvResult" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.qcvResult !== qcvOriginal.result ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                          <option :value="null">Tidak diubah</option>
                          <option value="APPROVED">APPROVED (Lolos Sampling)</option>
                          <option value="REJECTED">REJECTED (Ditolak)</option>
                        </select>
                        <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ qcvOriginal.rawResult || qcvOriginal.result }}</span>
                      </div>

                      <div>
                        <label class="block font-bold text-slate-700 mb-1 text-[11px]">1. Pengecekan Bau (Odor Check)</label>
                        <select v-model="correctionForm.qcvOdor" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.qcvOdor !== qcvOriginal.vehicleOdor ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                          <option :value="null">Tidak diubah</option>
                          <option value="PASS">PASS (Bau Normal)</option>
                          <option value="REJECT">REJECT (Bau Abnormal)</option>
                        </select>
                        <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ qcvOriginal.vehicleOdor }}</span>
                      </div>

                      <div>
                        <label class="block font-bold text-slate-700 mb-1 text-[11px]">2. Pengecekan Visual (Inspection)</label>
                        <select v-model="correctionForm.qcvVisual" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer shadow-2xs" :class="correctionForm.qcvVisual !== qcvOriginal.vehicleCondition ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''">
                          <option :value="null">Tidak diubah</option>
                          <option value="PASS">PASS (Visual Normal)</option>
                          <option value="REJECT">REJECT (Defect Visual)</option>
                        </select>
                        <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ qcvOriginal.vehicleCondition }}</span>
                      </div>

                      <div>
                        <label class="block font-bold text-slate-700 mb-1 text-[11px]">3. Initial Moisture (% Kadar Air)</label>
                        <input v-model.number="correctionForm.qcvMoisture" type="number" step="0.01" placeholder="0.00" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="Number(correctionForm.qcvMoisture) !== Number(qcvOriginal.moisture) ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                        <span class="text-[10px] font-mono text-slate-400 block mt-1">Current: {{ qcvOriginal.moisture }}%</span>
                      </div>
                    </div>
                  </div>

                  </template>

                  <p v-if="currentProcessType === 'GBB' && !qcvOriginal.id" class="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-500">
                    Record current Sampling Awal GBB tidak tersedia atau ambigu. Editor sampling dinonaktifkan agar tidak membuat data sintetis.
                  </p>

                  <div v-if="currentProcessType === 'GBJ'" class="space-y-3">
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <div>
                          <h5 class="text-[10px] font-black text-slate-800 uppercase tracking-widest">Checklist QC Vehicle GBJ</h5>
                          <p class="mt-1 text-[10px] text-slate-500">Lima item resmi dari record QC Vehicle current. ADMIN dapat mengoreksi nilai yang valid dan seluruh perubahan masuk audit trail.</p>
                        </div>
                        <span class="shrink-0 text-[9px] font-black uppercase text-slate-400">{{ gbjCorrectionRecord ? 'CURRENT' : 'TIDAK TERSEDIA' }}</span>
                      </div>
                      <div v-if="gbjChecklistCorrectionValid" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div v-for="(item, index) in gbjCorrectionItems" :key="item.label" class="p-2 rounded-lg border bg-white" :class="item.ok === true ? 'border-emerald-200' : item.ok === false ? 'border-rose-200' : 'border-slate-200'">
                          <div class="flex items-start justify-between gap-2">
                            <span class="text-[10px] font-bold text-slate-700 leading-snug">{{ index + 1 }}. {{ item.label }}</span>
                            <select v-model="correctionForm.gbjChecklist[index]" class="w-24 px-1.5 py-1 rounded border border-slate-200 text-[9px] font-black" :aria-label="`Status ${item.label}`">
                              <option :value="true">PASS</option>
                              <option :value="false">REJECT</option>
                            </select>
                          </div>
                          <div class="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                            <span>{{ item.severity }} · bukti {{ correctionForm.gbjPhotos?.[index] ? 'tersedia' : 'wajib jika REJECT' }}</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" class="min-w-0 max-w-[160px]" :aria-label="`Bukti ${item.label}`" @change="handleGbjCorrectionPhoto($event, index)" />
                          </div>
                        </div>
                      </div>
                      <p v-else class="text-[10px] text-slate-500">Record current atau struktur lima item GBJ tidak lengkap/ambigu; editor checklist dinonaktifkan tanpa mengubah data historis.</p>
                      <p v-if="gbjCorrectionUnknownCount" class="text-[10px] text-amber-700">{{ gbjCorrectionUnknownCount }} item historis dengan label lain tetap dipertahankan; koreksi checklist diblokir agar tidak membuang data tersebut.</p>
                      <div v-if="gbjChecklistCorrectionValid" class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                        <label class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500 block mb-1">Decision mode</span><select v-model="correctionForm.gbjDecisionMode" class="w-full px-2 py-1 rounded border border-slate-200 text-[10px] font-bold"><option :value="null" disabled>— Pilih keputusan —</option><option value="NORMAL_PASS">NORMAL_PASS</option><option value="APPROVED_WITH_DEVIATION">APPROVED_WITH_DEVIATION</option><option value="REJECTED">REJECTED</option></select></label>
                        <label class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500 block mb-1">Alasan deviation</span><input v-model="correctionForm.gbjDeviationReason" class="w-full px-2 py-1 rounded border border-slate-200 text-[10px]" placeholder="Minimal 10 karakter untuk deviation" /></label>
                        <div class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500">Result server:</span> {{ gbjCorrectionEffectiveResult }}</div>
                        <div class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500">Has deviation:</span> {{ gbjCorrectionHasDeviation ? 'YES' : 'NO' }}</div>
                      </div>
                    </div>
                  </div>

                  <div v-if="currentProcessType === 'GSP'" class="space-y-3">
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <div>
                          <h5 class="text-[10px] font-black text-slate-800 uppercase tracking-widest">PA & Pra-bongkar GSP</h5>
                          <p class="mt-1 text-[10px] text-slate-500">PA dan disposisi PA tetap hanya-baca karena belum memiliki lineage revisi. Pra-bongkar dapat dikoreksi ADMIN hanya jika record Warehouse current dan schema canonical valid.</p>
                          <p class="mt-1 text-[10px] text-slate-500">Hanya hasil item yang dapat diubah; keputusan keseluruhan, disposisi pra-bongkar, catatan, bukti existing, pemeriksa, dan waktu tetap dipertahankan. NOT OK wajib memiliki catatan dan bukti existing yang valid. Perubahan yang memerlukan disposisi atau bukti baru belum didukung dan akan ditolak.</p>
                        </div>
                        <span class="shrink-0 text-[9px] font-black uppercase text-slate-400">{{ gspPreUnloadCorrectionValid ? 'EDITABLE' : 'READ-ONLY' }}</span>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                        <div class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500">Status PA terakhir:</span> {{ latestPaStatusLabel || '—' }}</div>
                        <div class="p-2 rounded-lg bg-white border border-slate-200"><span class="font-bold text-slate-500">Disposisi:</span> {{ getDispositionActionLabel(latestDisposedPa?.dispositionAction) || '—' }}</div>
                      </div>
                      <div v-if="gspPreUnloadCorrectionValid" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div v-for="(item, index) in gspPreUnloadItems" :key="item.code || index" class="p-2 rounded-lg border bg-white" :class="gspPreUnloadResults[index] === true ? 'border-emerald-200' : gspPreUnloadResults[index] === false ? 'border-rose-200' : 'border-slate-200'">
                          <div class="flex items-start justify-between gap-2"><span class="text-[10px] font-bold text-slate-700 leading-snug">{{ index + 1 }}. {{ item.label }}</span><select v-model="correctionForm.gspPreUnloadResults[index]" class="w-24 px-1.5 py-1 rounded border border-slate-200 text-[9px] font-black"><option :value="true">OK</option><option :value="false">NOT OK</option></select></div>
                          <div v-if="item.notes" class="mt-1 text-[9px] text-slate-500">{{ item.notes }}</div>
                        </div>
                      </div>
                      <p v-else class="text-[10px] text-slate-500">Record Warehouse current atau checklist canonical sembilan item tidak tersedia; editor dinonaktifkan.</p>
                    </div>
                  </div>

                  <div v-if="currentProcessType !== 'GBB'" class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-500 leading-relaxed">
                    <span v-if="currentProcessType === 'GSP'">PA/disposisi tetap read-only karena lineage belum tersedia. Pra-bongkar hanya dapat dikoreksi bila canonical dan current; receiving tetap memakai receivedQuantity dan UOM katalog melalui tab Timbangan.</span>
                    <span v-else-if="currentProcessType === 'GBJ'">Checklist lima item, result, decision mode, deviation, dan catatan QC Vehicle dapat dikoreksi ADMIN melalui validator canonical dan audit trail.</span>
                    <span v-else>Data QC tidak tersedia untuk proses yang tidak dikenali.</span>
                  </div>

                  <div>
                    <label class="block font-bold text-slate-700 mb-1 text-[11px]">Catatan Initial QC Sampling / Catatan Koreksi</label>
                    <input v-if="currentProcessType === 'GBB' || currentProcessType === 'GBJ'" v-model="correctionForm.qcvNotes" type="text" placeholder="Catatan pemeriksaan sampling atau QC Vehicle..." class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all shadow-2xs" :class="correctionForm.qcvNotes !== qcvOriginal.notes ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''" />
                    <div v-else class="p-2 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-500">Catatan QC generik tidak berlaku untuk proses ini.</div>
                  </div>
                </div>
              </div>

              <!-- Footer action -->
              <div class="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button @click="showCorrectionModal = false" type="button" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Batal</button>
                <button @click="submitCorrection" type="button" :disabled="correctionLoading" class="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50">
                  <span v-if="correctionLoading" class="material-icons animate-spin text-sm">sync</span>
                  <span class="material-icons text-sm" v-else>save</span>
                  <span>Simpan & Catat Audit</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- Admin Void Modal Overlay (Fail-Closed & High-Accountability UI) -->
      <transition name="modal">
        <div v-if="showVoidModal" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="showVoidModal = false">
          <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-red-600">block</span>
                <h3 class="text-base font-black text-slate-800">Void Transaksi (Pembatalan Administratif)</h3>
              </div>
              <button @click="showVoidModal = false" class="text-slate-400 hover:text-slate-600 transition-colors">
                <span class="material-icons">close</span>
              </button>
            </div>

            <div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-1">
              <div class="flex items-center gap-1.5 font-black text-red-900">
                <span class="material-icons text-base text-red-600">info</span>
                <span>Perhatian Audit & Keamanan</span>
              </div>
              <p class="text-[11px] leading-relaxed">
                Transaksi akan dikeluarkan dari antrean aktif dan ditandai sebagai <b>DIBATALKAN (VOID)</b>. Seluruh data historis, timbangan, QC, lampiran, dan Audit Trail <b>tetap tersimpan permanen</b> untuk kepatuhan ISO 27001/27002.
              </p>
            </div>

            <!-- Error Banner -->
            <div v-if="voidError" class="p-3 bg-red-100 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-start gap-2">
              <span class="material-icons text-base text-red-600 shrink-0">error_outline</span>
              <span>{{ voidError }}</span>
            </div>

            <form @submit.prevent="executeVoidSubmission" class="space-y-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-700">Kode Alasan Void <span class="text-red-500">*</span></label>
                <select v-model="voidForm.reasonCode" required class="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-red-500 outline-none">
                  <option value="" disabled>-- Pilih Alasan Void --</option>
                  <option value="DUPLICATE_TRANSACTION">DUPLICATE_TRANSACTION (Registrasi Ganda)</option>
                  <option value="WRONG_REGISTRATION">WRONG_REGISTRATION (Salah Registrasi/Tujuan)</option>
                  <option value="OPERATOR_INPUT_ERROR">OPERATOR_INPUT_ERROR (Kesalahan Input Operator)</option>
                  <option value="TEST_DATA">TEST_DATA (Data Uji Coba)</option>
                  <option value="INVALID_TRANSACTION">INVALID_TRANSACTION (Transaksi Tidak Sah)</option>
                  <option value="OTHER">OTHER (Alasan Lainnya)</option>
                </select>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-700">Penjelasan Lengkap Alasan <span class="text-red-500">*</span></label>
                <textarea v-model="voidForm.reason" rows="3" required placeholder="Tuliskan keterangan detail mengapa transaksi ini di-void (min. 5 karakter)..."
                  class="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-red-500 outline-none"></textarea>
              </div>

              <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                <span class="text-[10px] font-mono text-slate-400">OCC Rev: #{{ currentTruck?.revision || 1 }}</span>
                <div class="flex space-x-2">
                  <button type="button" @click="showVoidModal = false" class="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Batal</button>
                  <button type="submit" :disabled="voidLoading || !voidForm.reasonCode || voidForm.reason.trim().length < 5"
                    class="px-4 py-2 text-xs font-black text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm">
                    <span v-if="voidLoading" class="material-icons animate-spin text-sm">sync</span>
                    <span>{{ voidLoading ? 'Memproses...' : 'Konfirmasi Void Transaksi' }}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </transition>

    <!-- Photo Preview Modal -->
    <div v-if="activePreviewPhoto || selectedPhoto" class="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" @click="activePreviewPhoto = null; selectedPhoto = null">
      <div class="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" @click.stop>
        <button @click="activePreviewPhoto = null; selectedPhoto = null" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 transition-colors z-10">
          <span class="material-icons text-lg">close</span>
        </button>
        <AuthenticatedImage
          :src="activePreviewPhoto || selectedPhoto"
          alt="Preview Foto Bukti"
          img-class="max-w-full max-h-[80vh] object-contain rounded-xl mx-auto shadow-sm"
          wrapper-class="min-w-[280px] min-h-[220px]"
        />
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { formatPlantDate, formatPlantTime } from '../utils/displayTime'
import { getStatusLabel } from '../utils/statusLabel'
import { defineProps, defineEmits, computed, ref, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import ProcessTimerBadge from './ProcessTimerBadge.vue'
import AuthenticatedImage from './AuthenticatedImage.vue'
import { useAuthStore } from '../stores/authStore'
import { useTruckStore } from '../stores/truckStore'
import { useSettingsStore } from '../stores/settingsStore'
import truckService from '../services/truckService'
import qcService from '../services/qcService'
import { evaluatePaExemption, getAllowedReopenTargets, getReopenMatrix } from '../services/reopenPolicy'
import { normalizeChecklistItems, buildGbbSamplingPayload, hasSamplingChanged, isCanonicalGbjChecklist, buildGbjCorrectionItems, buildGspCorrectionChecklist } from '../utils/correctionPayload'
import { GBJ_VEHICLE_CHECKLIST } from '../utils/gbjQcFlow'
import { getWeightRecordTypes } from '../utils/weightHelpers'
import { printTruckReport } from '../utils/pdfGenerator'
import PaCorrectionEditor from './qc/PaCorrectionEditor.vue'
import { selectCurrentPaByRound, selectEffectiveCurrentPa, sortPaHistory } from '../utils/paCurrentSelector'
import PaAnalysisParameters from './qc/PaAnalysisParameters.vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  truck: { type: Object, default: () => ({}) },
  size: { type: String, default: 'normal' }
})
const emit = defineEmits(['close', 'corrected', 'voided'])
const close = () => emit('close')

const detailedTruck = ref(null)
const gspPaRounds = ref([])
const paCorrectionPreview = ref(null)
const paCorrectionPreviewError = ref('')
const paCorrectionLoading = ref(false)
const paCorrectionItem = ref(null)
const paCorrectionDirty = ref(false)
const paEditorKey = ref(0)
const paCorrectionRecord = computed(() => selectEffectiveCurrentPa(gspPaRounds.value))
const paCorrectionAmbiguous = computed(() => selectCurrentPaByRound(gspPaRounds.value).ambiguousRounds.length > 0)
let paPreviewEpoch = 0
const invalidatePaCorrectionPreview = () => {
  paPreviewEpoch += 1
  paCorrectionPreview.value = null
  paCorrectionPreviewError.value = ''
  paCorrectionItem.value = null
  paCorrectionLoading.value = false
}
const previewPaCorrection = async (payload) => {
  invalidatePaCorrectionPreview()
  const epoch = paPreviewEpoch
  paCorrectionLoading.value = true
  try {
    const response = await qcService.previewPaCorrection(currentTruck.value.id, payload)
    if (epoch === paPreviewEpoch) paCorrectionPreview.value = response?.data?.data || response?.data
  } catch (error) {
    if (epoch === paPreviewEpoch) paCorrectionPreviewError.value = error?.response?.data?.message || 'Preview koreksi PA gagal. Muat ulang jika revisi berubah.'
  } finally {
    if (epoch === paPreviewEpoch) paCorrectionLoading.value = false
  }
}
const setPaCorrectionItem = (item) => { paCorrectionItem.value = item }
const loadingDetails = ref(false)
const activePreviewPhoto = ref(null)

const currentTruck = computed(() => detailedTruck.value || props.truck || {})

const latestByTestRound = (records = []) => selectEffectiveCurrentPa(records)

const selectDisplayRecord = (records = []) => {
  if (!Array.isArray(records) || records.length === 0) return null
  const current = records.filter(record => record?.isCurrent === true)
  if (current.length === 1) return current[0]
  if (current.length > 1) return null
  if (records.some(record => Object.prototype.hasOwnProperty.call(record || {}, 'isCurrent'))) return null
  return records.length === 1 ? records[0] : null
}

const downloadReceiptPDF = () => {
  if (currentTruck.value) {
    printTruckReport(currentTruck.value)
  }
}

const authStore = useAuthStore()
const truckStore = useTruckStore()
const settingsStore = useSettingsStore()
const selectedPhoto = ref(null)

const isAdmin = computed(() => {
  const role = authStore.user?.role || authStore.role
  return role === 'ADMIN'
})

const isSecurity = computed(() => {
  const role = authStore.user?.role || authStore.role
  return role === 'SECURITY'
})

const isQc = computed(() => {
  const role = authStore.user?.role || authStore.role
  return role === 'QC'
})

const isWarehouse = computed(() => {
  const role = authStore.user?.role || authStore.role
  return role === 'WAREHOUSE'
})

const isTerminalTransaction = computed(() =>
  ['COMPLETED', 'CANCELLED'].includes(currentTruck.value?.status),
)

// The backend permits administrative void only for non-COMPLETED, non-voided rows.
// Keep this derived from the fresh detail snapshot so stale parent props cannot re-enable it.
const canVoidCurrentTransaction = computed(() => {
  const transaction = currentTruck.value
  return Boolean(
    transaction?.id &&
    !transaction.isVoided &&
    transaction.status &&
    transaction.status !== 'COMPLETED',
  )
})

const weightRecordTypes = computed(() => getWeightRecordTypes(currentTruck.value?.processType))

const refreshAfterConflict = async () => {
  showCorrectionModal.value = false
  occConflictError.value = null
  detailedTruck.value = null
  await fetchTruckDetails()
  await fetchCorrectionHistory()
}

const activeStageStartTime = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const status = t.status || ''

  if (['COMPLETED', 'CANCELLED', 'DISPATCHED'].includes(status)) {
    return t.gateInAt || t.createdAt
  }
  if (['INCOMING_CHECK_PENDING', 'INCOMING_CHECK_IN_PROGRESS', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_IN_PROGRESS'].includes(status)) {
    return t.qcStartAt || t.weighInAt || t.gateInAt || t.createdAt
  }
  if (['WAREHOUSE_IN_PROGRESS', 'WAREHOUSE_DONE'].includes(status)) {
    return t.warehouseStartAt || t.qcStartAt || t.weighInAt || t.gateInAt || t.createdAt
  }
  if (['WEIGH_IN_DONE', 'WEIGH_OUT_DONE'].includes(status)) {
    return t.weighInAt || t.gateInAt || t.createdAt
  }
  return t.gateInAt || t.createdAt
})

const showCorrectionModal = ref(false)
const correctionLoading = ref(false)
const correctionError = ref(null)
const occConflictError = ref(null)
const showSensitiveConfirm = ref(false)
const auditHistory = ref([])
const timelineData = ref([])
const historyLoading = ref(false)
const historyError = ref(null)
const activeCorrectionTab = ref('WEIGHBRIDGE')
const attributionData = ref(null)

const showVoidModal = ref(false)
const voidLoading = ref(false)
const voidError = ref(null)
const evidenceUploadLoading = ref(false)
const evidenceUploadError = ref(null)
const detailRequestSequence = ref(0)
const voidForm = ref({
  reasonCode: '',
  reason: ''
})

const normalizeQcResult = (val) => {
  if (val === null || val === undefined || val === '') return null
  const v = String(val).toUpperCase()
  if (v === 'PASS' || v === 'APPROVED' || v === 'ACCEPTED' || v === 'LOKAL' || v === 'OK') return 'APPROVED'
  if (v === 'FAIL' || v === 'REJECT' || v === 'REJECTED') return 'REJECTED'
  if (v.includes('NOTE') || v.includes('CONCESSION') || v.includes('CATATAN')) return 'APPROVED_WITH_NOTE'
  return null
}

// Current-only relation queries are the normal production contract. The
// legacy fallback is allowed only when a fixture has no isCurrent metadata.
const selectCurrentRecord = (records = []) => {
  if (!Array.isArray(records) || records.length === 0) return null
  const explicitlyCurrent = records.filter(record => record?.isCurrent === true)
  if (explicitlyCurrent.length === 1) return explicitlyCurrent[0]
  if (explicitlyCurrent.length > 1) return null
  if (records.some(record => Object.prototype.hasOwnProperty.call(record || {}, 'isCurrent'))) return null
  return records.length === 1 ? records[0] : null
}

const imOriginal = computed(() => {
  const checks = currentTruck.value?.incomingMaterialChecks || []
  const imCheck = selectCurrentRecord(checks)
  if (!imCheck) {
    return {
      id: undefined, rawResult: null, result: null, moisture: null,
      foreignMatter: null, sampleWeight: null, goodBeanPercentage: null,
      odor: null, color: null, notes: null,
    }
  }
  const rawRes = imCheck.result ?? null
  return {
    id: imCheck.id,
    rawResult: rawRes,
    result: rawRes == null ? null : normalizeQcResult(rawRes),
    moisture: imCheck.moisture ?? null,
    foreignMatter: imCheck.foreignMatter ?? null,
    sampleWeight: imCheck.sampleWeight ?? null,
    goodBeanPercentage: imCheck.goodBeanPercentage ?? null,
    odor: imCheck.odor ?? null,
    color: imCheck.color ?? null,
    notes: imCheck.notes ?? imCheck.defectNotes ?? null,
  }
})

const qcvOriginal = computed(() => {
  const qcvCheck = selectCurrentRecord(currentTruck.value?.qcVehicleChecks || [])
  const rawResult = qcvCheck?.result ?? null
  const normalized = normalizeChecklistItems(qcvCheck?.checklistItems)
  const persistedItems = normalized.items
  const findItem = (label) => persistedItems.find(item => String(item?.label || '').toLowerCase() === label.toLowerCase())
  const getStatus = (fieldName, label) => {
    const item = findItem(label)
    if (item) return item.ok === true ? 'PASS' : item.ok === false ? 'REJECT' : null
    const value = qcvCheck?.[fieldName]
    return value === 'PASS' || value === 'REJECT' ? value : null
  }

  return {
    id: qcvCheck?.id,
    rawResult,
    result: normalizeQcResult(rawResult),
    vehicleOdor: getStatus('vehicleOdor', 'Sampling Bau'),
    vehicleCondition: getStatus('vehicleCondition', 'Sampling Visual'),
    moisture: normalized.initialMoisture,
    vehicleCleanliness: getStatus('vehicleCleanliness', 'Vehicle Cleanliness'),
    vehicleCleanlinessPhoto: findItem('Vehicle Cleanliness')?.photo ?? null,
    sealCondition: getStatus('sealCondition', 'Door Seal Intact'),
    sealConditionPhoto: findItem('Door Seal Intact')?.photo ?? null,
    odorCheck: getStatus('vehicleOdor', 'Odor/Smell Check'),
    odorCheckPhoto: findItem('Odor/Smell Check')?.photo ?? null,
    arrangement: getStatus(null, 'Arrangement'),
    arrangementPhoto: findItem('Arrangement')?.photo ?? null,
    pestEvidence: getStatus('pestEvidence', 'Pest/Animal Control'),
    pestEvidencePhoto: findItem('Pest/Animal Control')?.photo ?? null,
    foreignObjects: getStatus(null, 'Foreign Objects'),
    foreignObjectsPhoto: findItem('Foreign Objects')?.photo ?? null,
    packaging: getStatus(null, 'Packaging Integrity'),
    packagingPhoto: findItem('Packaging Integrity')?.photo ?? null,
    coa: getStatus('documentCompleteness', 'CoA Validation'),
    coaPhoto: findItem('CoA Validation')?.photo ?? null,
    quantity: getStatus(null, 'Quantity Verification'),
    quantityPhoto: findItem('Quantity Verification')?.photo ?? null,
    leakage: getStatus('vehicleCondition', 'Leakage & Condition'),
    leakagePhoto: findItem('Leakage & Condition')?.photo ?? null,
    notes: qcvCheck?.notes ?? null,
    _checklistEntries: persistedItems,
  }
})

const gbjCorrectionRecord = computed(() => {
  if (currentProcessType.value !== 'GBJ') return null
  return selectCurrentRecord(currentTruck.value?.qcVehicleChecks || [])
})

const gbjChecklistCorrectionValid = computed(() => isCanonicalGbjChecklist(gbjCorrectionRecord.value?.checklistItems))

const handleGbjCorrectionPhoto = async (event, index) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) {
    correctionError.value = 'Bukti GBJ wajib gambar JPEG/PNG/WebP, tidak kosong, maksimal 2 MB.'
    event.target.value = ''
    return
  }
  try {
    const photo = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Bukti foto gagal dibaca.'))
      reader.readAsDataURL(file)
    })
    correctionForm.value.gbjPhotos[index] = photo
    correctionError.value = null
  } catch (error) { correctionError.value = error.message }
}

const gbjCorrectionItems = computed(() => {
  const record = gbjCorrectionRecord.value
  if (!record) return []
  const persistedItems = normalizeChecklistItems(record.checklistItems).items
  return GBJ_VEHICLE_CHECKLIST.map((label, index) => {
    const matched = persistedItems.find(item =>
      String(item?.label || '').trim().toLowerCase() === label.trim().toLowerCase(),
    )
    const ok = matched?.ok === true ? true : matched?.ok === false ? false : null
    return {
      label,
      severity: ['CRITICAL', 'CRITICAL', 'CONDITIONAL', 'CRITICAL', 'CONDITIONAL'][index],
      ok,
      photo: matched?.photo ?? null,
    }
  })
})

const gbjCorrectionUnknownCount = computed(() => {
  const persistedItems = normalizeChecklistItems(gbjCorrectionRecord.value?.checklistItems).items
  const knownLabels = new Set(GBJ_VEHICLE_CHECKLIST.map(label => label.trim().toLowerCase()))
  return persistedItems.filter(item => !knownLabels.has(String(item?.label || '').trim().toLowerCase())).length
})

const gbjCorrectionHasDeviation = computed(() =>
  Array.isArray(correctionForm.value.gbjChecklist) && correctionForm.value.gbjChecklist.some(value => value === false),
)

const gbjCorrectionEffectiveResult = computed(() =>
  !correctionForm.value.gbjDecisionMode ? '—' : correctionForm.value.gbjDecisionMode === 'REJECTED' ? 'REJECT' : 'PASS',
)

const gspPreUnloadCorrectionValid = computed(() => {
  const record = currentWarehouseRecord.value
  const rawChecklist = record?.checklistItems
  const rawItems = rawChecklist && typeof rawChecklist === 'object' && !Array.isArray(rawChecklist)
    ? rawChecklist.items
    : null
  const items = gspPreUnloadItems.value
  const canonicalCodes = canonicalGspChecklistItems.map(item => item.code)
  const validItems = Array.isArray(rawItems) && rawItems.length === canonicalCodes.length && rawItems.every((item, index) =>
    item?.code === canonicalCodes[index] &&
    item?.label === canonicalGspChecklistItems[index].label &&
    ['OK', 'NOT_OK'].includes(String(item?.result)),
  )
  return currentProcessType.value === 'GSP' &&
    Boolean(record?.id) &&
    rawChecklist?.version === 'GSP-PREUNLOAD-2026.1' &&
    validItems &&
    items.length === canonicalCodes.length
})

const gspPreUnloadResults = computed(() => correctionForm.value.gspPreUnloadResults || [])

const currentWarehouseRecord = computed(() =>
  selectCurrentRecord(currentTruck.value?.warehouseProcesses || [])
)

const currentGrossRecord = computed(() => {
  const records = Array.isArray(currentTruck.value?.weighbridgeRecords)
    ? currentTruck.value.weighbridgeRecords
    : []
  const matches = records.filter(record =>
    record?.isCurrent === true && record.type === weightRecordTypes.value.gross,
  )
  return matches.length === 1 ? matches[0] : null
})

const currentTareRecord = computed(() => {
  const records = Array.isArray(currentTruck.value?.weighbridgeRecords)
    ? currentTruck.value.weighbridgeRecords
    : []
  const matches = records.filter(record =>
    record?.isCurrent === true && record.type === weightRecordTypes.value.tare,
  )
  return matches.length === 1 ? matches[0] : null
})

const currentGrossWeight = computed(() => currentGrossRecord.value?.weight ?? null)
const currentTareWeight = computed(() => currentTareRecord.value?.weight ?? null)

const currentActualWeight = computed(() => {
  const value = currentWarehouseRecord.value?.actualWeight
  return value === undefined || value === null ? null : value
})

const currentActualQuantity = computed(() => currentWarehouseRecord.value?.actualQuantity ?? null)
const currentWarehouseUnit = computed(() => currentWarehouseRecord.value?.unit ?? null)
const gbjWarehouseCorrectionValid = computed(() => currentProcessType.value === 'GBJ' && Boolean(currentWarehouseRecord.value?.id) && ['BAG', 'PALLET', 'ROLL', 'PCS', 'KG', 'LITER'].includes(currentWarehouseUnit.value) && currentActualQuantity.value !== null && Number.isSafeInteger(Number(currentActualQuantity.value)) && Number(currentActualQuantity.value) >= 0)

const currentReceivedQuantity = computed(() => {
  const value = currentWarehouseRecord.value?.receivedQuantity
  return value === undefined || value === null || value === '' ? null : String(value)
})

const currentReceivedUnit = computed(() => {
  const value = currentWarehouseRecord.value?.receivedUnit
  return value ? String(value).toUpperCase() : null
})

const gspReceivingUnitValid = computed(() => {
  if (currentProcessType.value !== 'GSP' || !currentWarehouseRecord.value) return false
  const catalogUnit = currentTruck.value?.productCatalog?.receiptUnit
  return Boolean(
    catalogUnit &&
    currentReceivedUnit.value &&
    String(catalogUnit).toUpperCase() === currentReceivedUnit.value,
  )
})

const reopenMatrix = ref(null)
const reopenMatrixError = ref(null)
const reopenMatrixLoading = ref(false)

const correctionForm = ref({
  action: 'CORRECT_DATA',
  reopenTargetStatus: '',
  plateNumber: '',
  driverName: '',
  driverPhone: '',
  suratJalanNumber: '',
  vendorName: '',
  vehicleType: '',
  grossWeight: null,
  tareWeight: null,
  actualWeight: null,
  actualQuantity: null,
  receivedQuantity: null,
  receivedUnit: null,
  reasonCategory: '',
  remark: '',
  evidenceUrl: '',
  evidenceAttachmentId: '',
  evidencePhoto: null,
  imResult: null,
  imMoisture: null,
  imForeignMatter: null,
  imSampleWeight: null,
  imGoodBeanPercentage: null,
  imOdor: null,
  imColor: null,
  imNotes: null,
  qcvResult: null,
  qcvOdor: null,
  qcvVisual: null,
  qcvMoisture: null,
  qcvNotes: null,
  gbjChecklist: [],
  gbjPhotos: [],
  gbjDecisionMode: null,
  gbjDeviationReason: '',
  gspPreUnloadResults: [],
})

const currentProcessType = computed(() => {
  const processType = currentTruck.value?.processType
  return typeof processType === 'string' ? processType.toUpperCase() : null
})

const paExemption = computed(() => {
  const t = currentTruck.value || {}
  return evaluatePaExemption(t.productCatalog, {
    productCatalogId: t.productCatalogId,
    processType: t.processType,
    cargoSubType: t.cargoSubType,
  })
})

const isSolarCommodity = computed(() => paExemption.value.isExempt)

const reopenTargetLabels = {
  REGISTERED: 'Registered (Registrasi Utama)',
  QC_VEHICLE_PENDING: 'QC Vehicle Pending (Menunggu QC Kendaraan)',
  QC_VEHICLE_PASSED: 'Warehouse Ready (Menunggu Start Gudang)',
  PA_NOT_REQUIRED: 'Post-Weighin / PA Not Required (Siap Gudang)',
  INCOMING_CHECK_PENDING: 'Incoming Check Pending (Menunggu QC Material)',
}

const allowedReopenTargets = computed(() => {
  return getAllowedReopenTargets(
    reopenMatrix.value,
    currentProcessType.value,
    paExemption.value
  ).map((value, index) => ({
    value,
    label: `${index + 1}. ${reopenTargetLabels[value] || value}`,
  }))
})

const loadReopenMatrix = async () => {
  reopenMatrixLoading.value = true
  reopenMatrixError.value = null
  try {
    reopenMatrix.value = await getReopenMatrix()
  } catch (err) {
    reopenMatrix.value = null
    reopenMatrixError.value = 'Matriks target REOPEN tidak dapat dimuat. Silakan coba lagi.'
  } finally {
    reopenMatrixLoading.value = false
  }
}

watch(() => correctionForm.value.action, (action) => {
  if (action === 'REOPEN_WORKFLOW' && !reopenMatrix.value && !reopenMatrixLoading.value) {
    loadReopenMatrix()
  }
})

watch(allowedReopenTargets, (targets) => {
  if (correctionForm.value.reopenTargetStatus && !targets.some((target) => target.value === correctionForm.value.reopenTargetStatus)) {
    correctionForm.value.reopenTargetStatus = ''
  }
})

const handleEvidenceUpload = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  const transactionId = currentTruck.value?.id
  if (!transactionId) {
    evidenceUploadError.value = 'ID transaksi tidak tersedia; lampiran tidak dapat diunggah.'
    return
  }

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf'])
  if (!allowedTypes.has(file.type)) {
    evidenceUploadError.value = 'Format lampiran harus JPEG, PNG, atau PDF.'
    return
  }

  evidenceUploadLoading.value = true
  evidenceUploadError.value = null
  correctionForm.value.evidenceAttachmentId = ''
  correctionForm.value.evidencePhoto = null

  try {
    const response = await truckService.uploadAttachment(transactionId, file, {
      module: 'general',
      description: 'Bukti koreksi Operation Log',
    })
    const payload = response?.data?.data || response?.data || response
    const attachment = payload?.data || payload
    const attachmentId = attachment?.id || payload?.attachmentId

    if (!attachmentId) {
      throw new Error('Respons upload tidak memuat ID attachment yang tervalidasi.')
    }

    correctionForm.value.evidenceAttachmentId = String(attachmentId)
    correctionForm.value.evidencePhoto = file.name
  } catch (err) {
    evidenceUploadError.value = err?.response?.data?.message || err?.message || 'Gagal mengunggah lampiran bukti.'
  } finally {
    evidenceUploadLoading.value = false
  }
}

const fetchCorrectionHistory = async () => {
  const transactionId = currentTruck.value?.id
  if (!transactionId) return
  historyLoading.value = true
  historyError.value = null
  try {
    const res = await truckService.getAuditHistory(transactionId)
    const resData = res?.data || res
    timelineData.value = resData?.timeline || []
    auditHistory.value = resData?.data || []
    attributionData.value = resData?.attribution || null
  } catch (err) {
    historyError.value = err?.message || 'Gagal memuat riwayat audit'
    timelineData.value = []
    auditHistory.value = []
    attributionData.value = null
  } finally {
    historyLoading.value = false
  }
}

const correctionCount = computed(() => {
  if (Array.isArray(auditHistory.value) && auditHistory.value.length > 0) {
    return auditHistory.value.length
  }
  const transaction = currentTruck.value
  if (Array.isArray(transaction?.corrections)) {
    return transaction.corrections.length
  }
  if (typeof transaction?.correctionCount === 'number') {
    return transaction.correctionCount
  }
  if (typeof transaction?._count?.corrections === 'number') {
    return transaction._count.corrections
  }
  return 0
})

const fetchTruckDetails = async () => {
  const transactionId = props.truck?.id
  if (!transactionId) return

  const requestId = ++detailRequestSequence.value
  loadingDetails.value = true
  try {
    const res = await truckService.getById(transactionId)
    const detail = res.data?.data || res.data || res
    if (requestId !== detailRequestSequence.value || String(props.truck?.id) !== String(transactionId)) return
    if (!detail?.id || !Number.isInteger(Number(detail.revision)) || Number(detail.revision) < 1) {
      detailedTruck.value = null
      gspPaRounds.value = []
      return
    }
    detailedTruck.value = detail

    const pType = detail?.processType
    if (pType === 'GSP') {
      try {
        const paRes = await qcService.getProductAnalysisHistory(transactionId)
        if (requestId !== detailRequestSequence.value || String(props.truck?.id) !== String(transactionId)) return
        invalidatePaCorrectionPreview()
        paCorrectionDirty.value = false
        gspPaRounds.value = sortPaHistory(paRes.data?.data || paRes.data || [])
      } catch (err) {
        if (requestId === detailRequestSequence.value) {
          console.warn('Gagal memuat riwayat PA:', err)
          gspPaRounds.value = []
        }
      }
    } else {
      gspPaRounds.value = []
    }
  } catch (err) {
    if (requestId === detailRequestSequence.value) {
      console.warn('Gagal memuat detail transaksi:', err)
      detailedTruck.value = null
      gspPaRounds.value = []
    }
  } finally {
    if (requestId === detailRequestSequence.value) loadingDetails.value = false
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    detailedTruck.value = null
    fetchTruckDetails().then(() => fetchCorrectionHistory())
  } else {
    detailedTruck.value = null
    gspPaRounds.value = []
    detailRequestSequence.value += 1
  }
}, { immediate: true })

watch(() => props.truck?.id, (newId, oldId) => {
  if (newId && oldId && newId !== oldId && props.isOpen) {
    detailedTruck.value = null
    detailRequestSequence.value += 1
    fetchTruckDetails().then(() => fetchCorrectionHistory())
  }
})

const openCorrectionModal = () => {
  invalidatePaCorrectionPreview()
  paCorrectionDirty.value = false
  paEditorKey.value += 1
  const im = imOriginal.value
  const qcv = qcvOriginal.value

  const t = currentTruck.value || {}
  correctionForm.value = {
    action: 'CORRECT_DATA',
    reopenTargetStatus: '',
    plateNumber: t.plateNumber || '',
    driverName: t.driverName || '',
    driverPhone: t.driverPhone || '',
    suratJalanNumber: t.suratJalanNumber || '',
    vendorName: t.vendorName || t.vendor || '',
    vehicleType: t.vehicleType || '',
    poNumber: t.poNumber || '',
    permitCardNumber: t.permitCardNumber || t.permitCard || '',
    guestIdNumber: t.guestIdNumber || t.guestId || '',
    grossWeight: currentGrossWeight.value,
    tareWeight: currentTareWeight.value,
    actualWeight: currentActualWeight.value !== null ? currentActualWeight.value : null,
    actualQuantity: currentActualQuantity.value,
    receivedQuantity: currentReceivedQuantity.value,
    receivedUnit: currentReceivedUnit.value,
    reasonCategory: '',
    remark: '',
    evidenceUrl: '',
    evidenceAttachmentId: '',
    evidencePhoto: null,
    imResult: im.result,
    imMoisture: im.moisture,
    imForeignMatter: im.foreignMatter,
    imSampleWeight: im.sampleWeight,
    imGoodBeanPercentage: im.goodBeanPercentage,
    imOdor: im.odor,
    imColor: im.color,
    imNotes: im.notes,
    qcvResult: qcv.result,
    qcvOdor: qcv.vehicleOdor,
    qcvVisual: qcv.vehicleCondition,
    qcvMoisture: qcv.moisture,
    qcvNotes: qcv.notes,
    gbjChecklist: gbjCorrectionItems.value.map(item => item.ok),
    gbjDecisionMode: gbjCorrectionRecord.value?.decisionMode ?? null,
    gbjPhotos: gbjCorrectionItems.value.map(item => item.photo),
    gbjDeviationReason: gbjCorrectionRecord.value?.deviationReason || '',
    gspPreUnloadResults: gspPreUnloadItems.value.map(item => item.ok),
  }
  activeCorrectionTab.value = 'WEIGHBRIDGE'
  correctionError.value = null
  occConflictError.value = null
  evidenceUploadError.value = null
  showSensitiveConfirm.value = false
  showCorrectionModal.value = true
}

const submitCorrection = () => {
  if (!currentTruck.value?.id || !Number.isInteger(Number(currentTruck.value?.revision)) || Number(currentTruck.value.revision) < 1) {
    correctionError.value = 'Detail transaksi terbaru belum siap. Segarkan detail sebelum melakukan koreksi.'
    return
  }
  if (evidenceUploadLoading.value) {
    correctionError.value = 'Tunggu hingga unggahan lampiran selesai sebelum menyimpan koreksi.'
    return
  }
  if (correctionForm.value.evidenceUrl?.trim().toLowerCase().startsWith('data:')) {
    correctionError.value = 'Data URI tidak dapat digunakan sebagai bukti resmi. Unggah attachment terverifikasi.'
    return
  }
  if (paCorrectionLoading.value || (paCorrectionDirty.value && !paCorrectionItem.value)) {
    correctionError.value = 'Preview dan gunakan koreksi PA terbaru, atau reset pengukuran PA sebelum menyimpan.'
    return
  }
  if (paCorrectionItem.value && correctionForm.value.action === 'REOPEN_WORKFLOW') {
    correctionError.value = 'Simpan koreksi PA terpisah dari tindakan buka ulang alur.'
    return
  }
  if (!correctionForm.value.reasonCategory) {
    correctionError.value = 'Kategori / Alasan koreksi wajib dipilih.'
    return
  }
  if (!correctionForm.value.remark || correctionForm.value.remark.trim().length < 10) {
    correctionError.value = 'Catatan singkat koreksi wajib diisi minimal 10 karakter.'
    return
  }

  // Check for sensitive changes (status change or huge weight deviation)
  const grossDiff = currentGrossWeight.value === null || correctionForm.value.grossWeight === null
    ? 0
    : Math.abs(Number(correctionForm.value.grossWeight) - Number(currentGrossWeight.value))
  if (grossDiff >= 1000 && !showSensitiveConfirm.value) {
    showSensitiveConfirm.value = true
    return
  }

  executeCorrectionSubmission()
}

const executeCorrectionSubmission = async () => {
  correctionLoading.value = true
  correctionError.value = null
  occConflictError.value = null

  if (correctionForm.value.action === 'REOPEN_WORKFLOW' && (reopenMatrixError.value || !reopenMatrix.value)) {
    correctionError.value = reopenMatrixError.value || 'Matriks target REOPEN belum tersedia.'
    correctionLoading.value = false
    return
  }

  try {
    const t = currentTruck.value || {}
    if (!t.id || !Number.isInteger(Number(t.revision)) || Number(t.revision) < 1) {
      correctionError.value = 'Revision transaksi terbaru tidak tersedia. Segarkan detail sebelum melakukan koreksi.'
      correctionLoading.value = false
      return
    }
    const items = []
    if (paCorrectionItem.value) items.push(paCorrectionItem.value)
    if (correctionForm.value.plateNumber !== undefined && correctionForm.value.plateNumber !== (t.plateNumber || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'plateNumber', newValue: String(correctionForm.value.plateNumber).trim() })
    }
    if (correctionForm.value.driverName !== undefined && correctionForm.value.driverName !== (t.driverName || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'driverName', newValue: String(correctionForm.value.driverName) })
    }
    if (correctionForm.value.driverPhone !== undefined && correctionForm.value.driverPhone !== (t.driverPhone || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'driverPhone', newValue: String(correctionForm.value.driverPhone) })
    }
    if (correctionForm.value.suratJalanNumber !== undefined && correctionForm.value.suratJalanNumber !== (t.suratJalanNumber || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'suratJalanNumber', newValue: String(correctionForm.value.suratJalanNumber) })
    }
    if (correctionForm.value.vendorName !== undefined && correctionForm.value.vendorName !== (t.vendorName || t.vendor || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'vendorName', newValue: String(correctionForm.value.vendorName) })
    }
    if (correctionForm.value.vehicleType !== undefined && correctionForm.value.vehicleType !== (t.vehicleType || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'vehicleType', newValue: String(correctionForm.value.vehicleType) })
    }
    if (correctionForm.value.poNumber !== undefined && correctionForm.value.poNumber !== (t.poNumber || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'poNumber', newValue: String(correctionForm.value.poNumber) })
    }
    if (correctionForm.value.permitCardNumber !== undefined && correctionForm.value.permitCardNumber !== (t.permitCardNumber || t.permitCard || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'permitCardNumber', newValue: String(correctionForm.value.permitCardNumber) })
    }
    if (correctionForm.value.guestIdNumber !== undefined && correctionForm.value.guestIdNumber !== (t.guestIdNumber || t.guestId || '')) {
      items.push({ targetModule: 'TRANSACTION', fieldName: 'guestIdNumber', newValue: String(correctionForm.value.guestIdNumber) })
    }

    if (correctionForm.value.grossWeight !== null && currentGrossRecord.value?.id && Number(correctionForm.value.grossWeight) !== Number(currentGrossWeight.value)) {
      items.push({ targetModule: 'WEIGHBRIDGE', targetRecordId: currentGrossRecord.value.id, fieldName: 'weight', newValue: Number(correctionForm.value.grossWeight) })
    }

    if (correctionForm.value.tareWeight !== null && currentTareRecord.value?.id && Number(correctionForm.value.tareWeight) !== Number(currentTareWeight.value)) {
      items.push({ targetModule: 'WEIGHBRIDGE', targetRecordId: currentTareRecord.value.id, fieldName: 'weight', newValue: Number(correctionForm.value.tareWeight) })
    }

    if (currentProcessType.value === 'GSP') {
      const nextQuantity = correctionForm.value.receivedQuantity
      if (currentWarehouseRecord.value?.id && gspReceivingUnitValid.value && nextQuantity !== null && nextQuantity !== undefined && String(nextQuantity) !== String(currentReceivedQuantity.value ?? '')) {
        items.push({ targetModule: 'WAREHOUSE', targetRecordId: currentWarehouseRecord.value.id, fieldName: 'receivedQuantity', newValue: String(nextQuantity).trim() })
      }
    } else if (currentProcessType.value === 'GBJ' && gbjWarehouseCorrectionValid.value && correctionForm.value.actualQuantity !== null && correctionForm.value.actualQuantity !== '' && Number(correctionForm.value.actualQuantity) !== Number(currentActualQuantity.value)) {
      items.push({ targetModule: 'WAREHOUSE', targetRecordId: currentWarehouseRecord.value.id, fieldName: 'actualQuantity', newValue: Number(correctionForm.value.actualQuantity) })
    } else if (currentProcessType.value === 'GBB' && currentWarehouseRecord.value?.id && correctionForm.value.actualWeight !== null && Number(correctionForm.value.actualWeight) !== Number(currentActualWeight.value)) {
      items.push({ targetModule: 'WAREHOUSE', targetRecordId: currentWarehouseRecord.value.id, fieldName: 'actualWeight', newValue: Number(correctionForm.value.actualWeight) })
    }

    const qcvChecks = t.qcVehicleChecks || []
    const qcvRec = selectCurrentRecord(qcvChecks)
    if (qcvRec && currentProcessType.value !== 'GSP') {
      if (correctionForm.value.qcvNotes !== undefined && correctionForm.value.qcvNotes !== qcvOriginal.value.notes) {
        items.push({ targetModule: 'QC_VEHICLE', targetRecordId: qcvRec.id, fieldName: 'notes', newValue: correctionForm.value.qcvNotes })
      }
      if (currentProcessType.value === 'GBB') {
        const samplingChanged = ['qcvOdor', 'qcvVisual', 'qcvMoisture'].some((key, index) => {
          const original = [qcvOriginal.value.vehicleOdor, qcvOriginal.value.vehicleCondition, qcvOriginal.value.moisture][index]
          return correctionForm.value[key] !== original
        })
        if (['APPROVED', 'REJECTED'].includes(correctionForm.value.qcvResult) && correctionForm.value.qcvResult !== qcvOriginal.value.result) {
          items.push({ targetModule: 'QC_VEHICLE', targetRecordId: qcvRec.id, fieldName: 'result', newValue: correctionForm.value.qcvResult === 'APPROVED' ? 'PASS' : 'REJECT' })
        }
        for (const [formKey, fieldName, original] of [
          ['qcvOdor', 'vehicleOdor', qcvOriginal.value.vehicleOdor],
          ['qcvVisual', 'vehicleCondition', qcvOriginal.value.vehicleCondition],
        ]) {
          if (['PASS', 'REJECT'].includes(correctionForm.value[formKey]) && correctionForm.value[formKey] !== original) {
            items.push({ targetModule: 'QC_VEHICLE', targetRecordId: qcvRec.id, fieldName, newValue: correctionForm.value[formKey] })
          }
        }
        if (samplingChanged) {
          const samplingPayload = buildGbbSamplingPayload(correctionForm.value, qcvRec.checklistItems)
          if (samplingPayload && hasSamplingChanged(qcvRec.checklistItems, samplingPayload)) {
            items.push({ targetModule: 'QC_VEHICLE', targetRecordId: qcvRec.id, fieldName: 'checklistItems', newValue: samplingPayload })
          }
        }
      }
      if (currentProcessType.value === 'GBJ' && gbjChecklistCorrectionValid.value) {
        items.push(...buildGbjCorrectionItems(qcvRec, correctionForm.value))
      }
    }
    if (currentProcessType.value === 'GSP' && gspPreUnloadCorrectionValid.value) {
      const correctedChecklist = buildGspCorrectionChecklist(currentWarehouseRecord.value.checklistItems, correctionForm.value.gspPreUnloadResults)
      if (correctedChecklist) {
        items.push({ targetModule: 'WAREHOUSE', targetRecordId: currentWarehouseRecord.value.id, fieldName: 'checklistItems', newValue: correctedChecklist })
      }
    }

    // Incoming Material mapping — use current revision record
    const imChecks = t.incomingMaterialChecks || []
    const imRec = selectCurrentRecord(imChecks)
    if (currentProcessType.value === 'GBB' && imRec) {
      if (correctionForm.value.imResult !== undefined && correctionForm.value.imResult !== imOriginal.value.result) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'result', newValue: correctionForm.value.imResult })
      }
      if (correctionForm.value.imMoisture !== null && correctionForm.value.imMoisture !== undefined && (imOriginal.value.moisture === null || Number(correctionForm.value.imMoisture) !== Number(imOriginal.value.moisture))) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'moisture', newValue: Number(correctionForm.value.imMoisture) })
      }
      if (correctionForm.value.imForeignMatter !== null && correctionForm.value.imForeignMatter !== undefined && (imOriginal.value.foreignMatter === null || Number(correctionForm.value.imForeignMatter) !== Number(imOriginal.value.foreignMatter))) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'foreignMatter', newValue: Number(correctionForm.value.imForeignMatter) })
      }
      if (correctionForm.value.imSampleWeight !== null && correctionForm.value.imSampleWeight !== undefined && (imOriginal.value.sampleWeight === null || Number(correctionForm.value.imSampleWeight) !== Number(imOriginal.value.sampleWeight))) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'sampleWeight', newValue: Number(correctionForm.value.imSampleWeight) })
      }
      if (correctionForm.value.imGoodBeanPercentage !== null && correctionForm.value.imGoodBeanPercentage !== undefined && (imOriginal.value.goodBeanPercentage === null || Number(correctionForm.value.imGoodBeanPercentage) !== Number(imOriginal.value.goodBeanPercentage))) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'goodBeanPercentage', newValue: Number(correctionForm.value.imGoodBeanPercentage) })
      }
      if (correctionForm.value.imOdor !== undefined && correctionForm.value.imOdor !== imOriginal.value.odor) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'odor', newValue: correctionForm.value.imOdor })
      }
      if (correctionForm.value.imColor !== undefined && correctionForm.value.imColor !== imOriginal.value.color) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'color', newValue: correctionForm.value.imColor })
      }
      if (correctionForm.value.imNotes !== undefined && correctionForm.value.imNotes !== imOriginal.value.notes) {
        items.push({ targetModule: 'INCOMING_MATERIAL', targetRecordId: imRec.id, fieldName: 'notes', newValue: correctionForm.value.imNotes })
      }
    }

    let action = 'CORRECT_DATA'
    let reopenTargetStatus = undefined
    if (correctionForm.value.action === 'REOPEN_WORKFLOW') {
      action = 'REOPEN_WORKFLOW'
      reopenTargetStatus = correctionForm.value.reopenTargetStatus
      if (!reopenTargetStatus) {
        correctionError.value = 'Target stage/status untuk REOPEN_WORKFLOW wajib dipilih secara eksplisit.'
        correctionLoading.value = false
        return
      }
    }

    if (items.length === 0 && action !== 'REOPEN_WORKFLOW') {
      correctionError.value = 'Tidak ada perubahan data yang terdeteksi (No-Op). Silakan ubah minimal satu nilai untuk melakukan koreksi.'
      correctionLoading.value = false
      return
    }

    const payload = {
      action,
      reopenTargetStatus: action === 'REOPEN_WORKFLOW' ? reopenTargetStatus : undefined,
      reasonCode: correctionForm.value.reasonCategory,
      remark: correctionForm.value.remark.trim(),
      evidenceUrl: correctionForm.value.evidenceUrl?.trim() || undefined,
      evidenceAttachmentId: correctionForm.value.evidenceAttachmentId || undefined,
      expectedRevision: Number(t.revision),
      items: action === 'REOPEN_WORKFLOW' ? undefined : items
    }

    let res = null
    try {
      res = await truckStore.correctOperationLogTruck(t.id, payload)
    } catch (apiErr) {
      const status = apiErr?.response?.status
      const msg = apiErr?.response?.data?.message || apiErr?.message || ''
      if (status === 409 || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('revision') || msg.toLowerCase().includes('konkurensi')) {
        occConflictError.value = 'Konflik Konkurensi! Data telah diubah oleh operator/Admin lain (OCC protect). Silakan segarkan data (Refresh) terlebih dahulu.'
        correctionLoading.value = false
        return
      }
      throw apiErr
    }

    const updatedRecord = res?.updatedTx || res?.data?.updatedTx || res?.data || res
    if (!updatedRecord?.id) {
      throw new Error('Respons koreksi tidak memuat transaksi terbaru.')
    }

    detailedTruck.value = updatedRecord
    showCorrectionModal.value = false
    showSensitiveConfirm.value = false
    await fetchCorrectionHistory()
    await fetchTruckDetails()
    emit('corrected', updatedRecord)
  } catch (err) {
    correctionError.value = err.gmsMessage || err.response?.data?.message || err.message || 'Gagal menyimpan koreksi (Transaksi dibatalkan secara atomik / fail-closed).'
  } finally {
    correctionLoading.value = false
  }
}

const openVoidModal = () => {
  voidError.value = null
  voidForm.value = {
    reasonCode: '',
    reason: ''
  }
  showVoidModal.value = true
}

const executeVoidSubmission = async () => {
  if (!canVoidCurrentTransaction.value) {
    voidError.value = 'Transaksi terbaru tidak memenuhi kebijakan Void atau detail belum tersinkron.'
    return
  }
  if (!voidForm.value.reasonCode || voidForm.value.reason.trim().length < 5) {
    voidError.value = 'Kode alasan dan penjelasan detail (minimal 5 karakter) wajib diisi.'
    return
  }
  voidLoading.value = true
  voidError.value = null
  try {
    const t = currentTruck.value || {}
    const payload = {
      reasonCode: voidForm.value.reasonCode,
      reason: voidForm.value.reason.trim(),
      expectedRevision: t.revision
    }
    if (!t.id || !Number.isInteger(Number(t.revision)) || Number(t.revision) < 1) {
      voidError.value = 'Revision transaksi terbaru tidak tersedia. Segarkan detail sebelum melakukan void.'
      return
    }
    payload.expectedRevision = Number(t.revision)
    const updatedRecord = await truckStore.voidTruck(t.id, payload)
    showVoidModal.value = false
    detailedTruck.value = updatedRecord || { ...t, status: 'CANCELLED', isVoided: true }
    await fetchTruckDetails()
    await fetchCorrectionHistory()
    const latest = currentTruck.value?.id === t.id ? currentTruck.value : updatedRecord
    emit('voided', latest || { ...t, status: 'CANCELLED', isVoided: true })
    close()
  } catch (err) {
    voidError.value = err.gmsMessage || err.response?.data?.message || err.message || 'Gagal membatalkan transaksi (Void).'
  } finally {
    voidLoading.value = false
  }
}

const gbjDeliveryData = computed(() => {
  const t = currentTruck.value || {}
  if (t.deliveryChecklist) {
    if (typeof t.deliveryChecklist === 'string') {
      try { return JSON.parse(t.deliveryChecklist) } catch { return null }
    }
    return t.deliveryChecklist
  }
  const wh = selectDisplayRecord(t.warehouseProcesses)
  if (wh?.checklistItems) {
    if (typeof wh.checklistItems === 'string') {
      try { return JSON.parse(wh.checklistItems) } catch { return null }
    }
    return wh.checklistItems
  }
  return null
})

const gbjProductTypes = computed(() => {
  const d = gbjDeliveryData.value
  if (!d) return []
  if (Array.isArray(d.productTypes) && d.productTypes.length > 0) {
    return d.productTypes
  }
  if (d.productType) {
    return [d.productType]
  }
  return []
})

const gbjConditionItems = computed(() => {
  const d = gbjDeliveryData.value
  if (!d || !Array.isArray(d.productCondition)) return []
  const labels = [
    "Menggunakan pallet",
    "Dalam kondisi baik",
    "Jenis & jumlah tepat",
    "Disusun dengan baik"
  ]
  return d.productCondition.map((val, idx) => ({
    label: labels[idx] || `Kondisi ${idx + 1}`,
    checked: val === true
  }))
})

const gbjDocumentItems = computed(() => {
  const d = gbjDeliveryData.value
  if (!d || !Array.isArray(d.documentAvailability)) return []
  const labels = [
    "Surat Jalan (SJ)",
    "Dokumen CoA",
    "Sertifikat Halal",
    "Purchasing Order (PO)"
  ]
  return d.documentAvailability.map((val, idx) => ({
    label: labels[idx] || `Dokumen ${idx + 1}`,
    checked: val === true
  }))
})

const identityFields = computed(() => {
  const t = currentTruck.value || {}
  const permitCardVal = t.permitCardNumber || t.permitCard
  const guestIdVal = t.guestIdNumber || t.guestId

  const fields = []

  const seqVal = t.dailySequence != null
    ? `#${String(t.dailySequence).padStart(3, '0')}`
    : null
  if (seqVal) {
    fields.push({ label: 'No. Urut Kedatangan', value: seqVal, highlight: true })
  }

  fields.push(
    { label: 'Driver Name', value: t.driverName },
    { label: 'Carrier Vendor', value: t.vendorName || t.vendor },
    { label: 'Vehicle Type', value: t.vehicleType },
    { label: 'Process Type', value: t.processType === 'GBB' ? 'Raw Material (Unloading)' : t.processType === 'GBJ' ? 'Finished Goods (Loading)' : t.processType === 'GSP' ? 'Sparepart Warehouse' : t.processType },
  )

  if (t.processType === 'GBJ' && gbjProductTypes.value.length > 0) {
    fields.push({ label: 'Finished Goods', value: gbjProductTypes.value.join(' & '), highlight: true })
  }

  if (t.driverPhone || true) fields.push({ label: 'Driver Phone', value: t.driverPhone, highlight: true })
  if (t.suratJalanNumber || true) fields.push({ label: 'Delivery Note (SJ)', value: t.suratJalanNumber, highlight: true })
  if (t.poNumber || true) fields.push({ label: 'Logistics PO', value: t.poNumber, highlight: true })
  if (permitCardVal || true) fields.push({ label: 'Permit Card / VMS', value: permitCardVal })
  if (guestIdVal || true) fields.push({ label: `${t.idType || 'ID'} Number`, value: guestIdVal })

  if (t.guestCount && t.guestCount > 1) fields.push({ label: 'Guest Count', value: `${t.guestCount} persons` })
  if (t.securityName) fields.push({ label: 'Security Officer', value: t.securityName })
  if (t.remarks) {
    const isChecklist = t.remarks.includes('Sampling:') || t.remarks.includes('Checklist:')
    if (!isChecklist) {
      fields.push({ label: 'Remarks', value: t.remarks })
    }
  }
  return fields
})

const isInitialSamplingRejected = computed(() => {
  const t = currentTruck.value
  if (!t) return false
  if (t.status === 'QC_VEHICLE_REJECTED') return true;
  if (t.qcVehicleChecks && t.qcVehicleChecks.length > 0) {
    const check = selectDisplayRecord(t.qcVehicleChecks);
    if (check?.result === 'REJECT' || check?.result === 'REJECTED') return true;
  }
  if (t.qcSamplingDetails?.status === 'REJECTED' || t.qcSamplingDetails?.status === 'REJECT') return true;
  if (t.qcDetails && (t.qcDetails.status === 'REJECT' || t.qcDetails.status === 'REJECTED') && t.qcDetails.kadarAir === undefined) {
    return true;
  }
  return false;
});

const extractMoistureValue = (target) => {
  if (!target) return null;

  // 1. Direct property check
  if (target.moisture !== undefined && target.moisture !== null) return Number(target.moisture);
  if (target.kadarAir !== undefined && target.kadarAir !== null) return Number(target.kadarAir);
  if (target.initialMoisture !== undefined && target.initialMoisture !== null) return Number(target.initialMoisture);
  if (target.moistureEst !== undefined && target.moistureEst !== null) return Number(target.moistureEst);

  // 2. ChecklistItems array or object
  const items = target.checklistItems;
  if (Array.isArray(items)) {
    const mItem = items.find(i => i && i.label && (
      i.label.toLowerCase().includes('moisture') ||
      i.label.toLowerCase().includes('kadar air') ||
      i.label.toLowerCase().includes('estimasi')
    ));
    if (mItem && mItem.value !== undefined && mItem.value !== null && mItem.value !== '') {
      return Number(mItem.value);
    }
  } else if (typeof items === 'object' && items !== null) {
    if (items.initialMoisture !== undefined && items.initialMoisture !== null) return Number(items.initialMoisture);
    if (items.moisture !== undefined && items.moisture !== null) return Number(items.moisture);
    if (items.kadarAir !== undefined && items.kadarAir !== null) return Number(items.kadarAir);
    if (Array.isArray(items.items)) {
      const mItem = items.items.find(i => i && i.label && (
        i.label.toLowerCase().includes('moisture') ||
        i.label.toLowerCase().includes('kadar air') ||
        i.label.toLowerCase().includes('estimasi')
      ));
      if (mItem && mItem.value !== undefined && mItem.value !== null && mItem.value !== '') {
        return Number(mItem.value);
      }
    }
  }

  // 3. qcVehicleChecks / incomingMaterialChecks on the current detail object
  const im = selectDisplayRecord(target.incomingMaterialChecks)
  if (im?.moisture !== undefined && im.moisture !== null) return Number(im.moisture)

  const qv = selectDisplayRecord(target.qcVehicleChecks)
  if (qv) {
    const val = extractMoistureValue(qv)
    if (val !== null && !isNaN(val)) return val
  }
  if (target.qcDetails) {
    if (target.qcDetails.kadarAir !== undefined && target.qcDetails.kadarAir !== null) return Number(target.qcDetails.kadarAir);
    if (target.qcDetails.moisture !== undefined && target.qcDetails.moisture !== null) return Number(target.qcDetails.moisture);
    if (target.qcDetails.initialMoisture !== undefined && target.qcDetails.initialMoisture !== null) return Number(target.qcDetails.initialMoisture);
  }

  return null;
}

const initialSamplingDetails = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  if (t.processType !== 'GBB' && t.processType !== 'GSP') return null;

  let pic = null
  let status = null
  let note = null
  let bau = null
  let visual = null
  let moisture = null

  if (t.qcVehicleChecks && t.qcVehicleChecks.length > 0) {
    const check = selectDisplayRecord(t.qcVehicleChecks);
    if (!check) return null
    pic = check.checkedBy?.name || check.inspector || null
    status = check.result === 'PASS' || check.result === 'APPROVED' ? 'APPROVED' : check.result === 'REJECT' || check.result === 'REJECTED' ? 'REJECTED' : check.result || null
    note = check.notes ?? check.notesStr ?? null
    bau = check.vehicleOdor ?? null
    visual = check.vehicleCondition ?? null
    moisture = extractMoistureValue(check) ?? extractMoistureValue(t)
  } else if (t.qcSamplingDetails) {
    return t.qcSamplingDetails;
  } else if (t.qcDetails) {
    pic = t.qcDetails.pic ?? null
    status = (t.qcDetails.status === 'REJECT' || t.qcDetails.status === 'REJECTED' || t.status === 'QC_VEHICLE_REJECTED') ? 'REJECTED' : t.qcDetails.status ?? null
    note = t.qcDetails.note ?? t.qcDetails.samplingNotes ?? null
    bau = t.qcDetails.samplingBau ?? t.qcDetails.bau ?? null
    visual = t.qcDetails.samplingVisual ?? t.qcDetails.visual ?? null
    moisture = extractMoistureValue(t.qcDetails) ?? extractMoistureValue(t)
  } else if (t.status === 'QC_VEHICLE_REJECTED' || t.status === 'QC_VEHICLE_PASSED' || t.status === 'QC_VEHICLE_IN_PROGRESS') {
    status = t.status === 'QC_VEHICLE_REJECTED' ? 'REJECTED' : t.status === 'QC_VEHICLE_PASSED' ? 'APPROVED' : null
    moisture = extractMoistureValue(t)
  } else {
    return null
  }

  if (moisture === null || moisture === undefined) {
    moisture = extractMoistureValue(t)
  }

  return { pic, status, note, bau, visual, moisture }
});

const initialSamplingMetrics = computed(() => {
  if (!initialSamplingDetails.value) return []
  const d = initialSamplingDetails.value

  const odorKnown = d.bau !== null && d.bau !== undefined && d.bau !== ''
  const visualKnown = d.visual !== null && d.visual !== undefined && d.visual !== ''
  const odorPass = odorKnown && (d.bau === 'PASS' || d.bau === 'Normal' || d.bau === 'COMPLIANT' || d.bau === 'OK')
  const visualPass = visualKnown && (d.visual === 'PASS' || d.visual === 'Normal' || d.visual === 'COMPLIANT' || d.visual === 'OK')

  const extractedM = d.moisture !== null && d.moisture !== undefined ? Number(d.moisture) : extractMoistureValue(currentTruck.value)
  const moistureVal = (extractedM !== undefined && extractedM !== null && !isNaN(extractedM)) ? `${Number(extractedM).toFixed(2)}%` : '—'

  return [
    { label: 'MOISTURE', value: moistureVal, isOk: extractedM !== null && extractedM !== undefined && !isNaN(extractedM), isText: false },
    { label: 'VISUAL', value: !visualKnown ? '—' : visualPass ? 'OK' : 'NOT OK', isOk: visualKnown ? visualPass : null, isText: true },
    { label: 'ODOR', value: !odorKnown ? '—' : odorPass ? 'OK' : 'NOT OK', isOk: odorKnown ? odorPass : null, isText: true },
  ]
})

const qcLabDetails = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  if (t.processType !== 'GBB' && t.processType !== 'GSP') return null;

  if (isInitialSamplingRejected.value) {
    return { isSkipped: true, reason: 'REJECTED AT INITIAL QC SAMPLING' };
  }

  if (t.incomingMaterialChecks && t.incomingMaterialChecks.length > 0) {
    const check = selectDisplayRecord(t.incomingMaterialChecks);
    if (!check) return null
    return {
      pic: check.checkedBy?.name || 'QC Lab Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      sampleWeight: check.sampleWeight,
      bijiOK: check.goodBeanPercentage !== undefined && check.goodBeanPercentage !== null ? check.goodBeanPercentage : 0
    };
  }

  if (t.qcDetails && (t.qcDetails.kadarAir !== undefined || t.status?.startsWith('INCOMING_CHECK'))) {
    return t.qcDetails;
  }

  return null;
});

const qcDetails = computed(() => {
  const sourceDetails = currentTruck.value?.qcDetails;
  let relationDetails = null;

  if (currentTruck.value?.incomingMaterialChecks && currentTruck.value.incomingMaterialChecks.length > 0) {
    const check = selectDisplayRecord(currentTruck.value.incomingMaterialChecks);
    if (!check) return null
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      sampleWeight: check.sampleWeight,
      bijiOK: check.goodBeanPercentage !== undefined && check.goodBeanPercentage !== null ? check.goodBeanPercentage : 0
    };
  }
  else if (currentTruck.value?.qcVehicleChecks && currentTruck.value.qcVehicleChecks.length > 0) {
    const check = selectDisplayRecord(currentTruck.value.qcVehicleChecks);
    if (!check) return null
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || '',
      kadarAir: null,
      totalFM: null,
      bijiOK: null
    };
  }

  if (sourceDetails && relationDetails) {
    return {
      ...relationDetails,
      ...sourceDetails,
      status: sourceDetails.status || relationDetails.status,
      note: sourceDetails.note !== undefined ? sourceDetails.note : relationDetails.note,
      bau: sourceDetails.bau !== undefined ? sourceDetails.bau : relationDetails.bau,
      warna: sourceDetails.warna !== undefined ? sourceDetails.warna : relationDetails.warna,
      pic: sourceDetails.pic && sourceDetails.pic !== 'N/A' ? sourceDetails.pic : relationDetails.pic
    };
  }

  return sourceDetails || relationDetails;
});

const isWarehouseRejection = computed(() => {
  const t = currentTruck.value
  if (!t) return false
  const isGbbOrGsp = t.processType === 'GBB' || t.processType === 'GSP'
  const qcStart = t.timestamps?.qcStartAt || t.qcStartAt || null
  const hasReject = t.incomingMaterialChecks?.some(c => c.result === 'REJECT') ||
                    qcDetails.value?.status === 'REJECT' ||
                    qcDetails.value?.status === 'REJECTED'
  return isGbbOrGsp && hasReject && !qcStart
})

const qcPicLabel = computed(() => {
  if (!qcDetails.value || !qcDetails.value.pic) return ''
  const dept = currentTruck.value?.processType === 'GBJ' ? 'QC VEHICLE' : 'LAB QC'
  return `[${dept}] ${qcDetails.value.pic}`
})

const qcMetrics = computed(() => {
  const metrics = []
  if (isWarehouseRejection.value) return metrics
  const details = qcDetails.value
  if (!details) return metrics
  if (currentTruck.value?.processType === 'GBJ') return metrics // Empty for GBJ since it uses the detailed checklist below
  if (details.bau) metrics.push({ label: 'Odor', value: details.bau })
  if (details.warna) metrics.push({ label: 'Color', value: details.warna })
  if (details.kadarAir !== null && details.kadarAir !== undefined) metrics.push({ label: 'Moisture', value: details.kadarAir + '%' })
  if (details.totalFM !== null && details.totalFM !== undefined) metrics.push({ label: 'Total FM', value: details.totalFM + '%' })
  if (details.bijiOK !== null && details.bijiOK !== undefined) metrics.push({ label: 'Good Beans', value: details.bijiOK + '%' })

  // If it's a vehicle check (GBJ)
  if (currentTruck.value?.processType === 'GBJ' && currentTruck.value.qcVehicleChecks && currentTruck.value.qcVehicleChecks.length > 0) {
    const check = selectDisplayRecord(currentTruck.value.qcVehicleChecks);
    if (!check) return metrics
    if (check.vehicleCleanliness) metrics.push({ label: 'Cleanliness', value: check.vehicleCleanliness })
    if (check.vehicleOdor) metrics.push({ label: 'Odor', value: check.vehicleOdor })
    if (check.pestEvidence) metrics.push({ label: 'Pest Evidence', value: check.pestEvidence })
    if (check.vehicleCondition) metrics.push({ label: 'Condition', value: check.vehicleCondition })
    if (check.documentCompleteness) metrics.push({ label: 'Documents', value: check.documentCompleteness })
    if (check.sealCondition) metrics.push({ label: 'Seal', value: check.sealCondition })
  }
  return metrics
})

// Parse remarks string into structured checklist/sampling data
const parsedChecklist = computed(() => {
  const t = currentTruck.value
  if (!t) return null

  // If GBJ, populate checklist from qcVehicleChecks
  if (t.processType === 'GBJ' && t.qcVehicleChecks && t.qcVehicleChecks.length > 0) {
    const check = selectDisplayRecord(currentTruck.value.qcVehicleChecks);
    if (!check) return null
    const norm = normalizeChecklistItems(check.checklistItems);
    let items = norm.items;

    // Use new checklistItems format if available (includes photos)
    if (items.length === 0) {
      // Fallback for old data
      if (check.vehicleCleanliness && check.vehicleCleanliness !== 'NA') {
        items.push({ label: 'Vehicle Cleanliness', ok: check.vehicleCleanliness === 'PASS' })
      }
      if (check.sealCondition && check.sealCondition !== 'NA') {
        items.push({ label: 'Door Seal Intact', ok: check.sealCondition === 'PASS' })
      }
      if (check.vehicleOdor && check.vehicleOdor !== 'NA') {
        items.push({ label: 'Odor/Smell Check', ok: check.vehicleOdor === 'PASS' })
      }
      if (check.pestEvidence && check.pestEvidence !== 'NA') {
        items.push({ label: 'Pest/Animal Control', ok: check.pestEvidence === 'PASS' })
      }
      if (check.documentCompleteness && check.documentCompleteness !== 'NA') {
        items.push({ label: 'CoA Validation', ok: check.documentCompleteness === 'PASS' })
      }
      if (check.vehicleCondition && check.vehicleCondition !== 'NA') {
        items.push({ label: 'Leakage & Condition', ok: check.vehicleCondition === 'PASS' })
      }
    }
    const hasIssue = check.result === 'REJECT' || check.hasDeviation === true || items.some(i => i.ok === false)
    return {
      hasIssue,
      samplings: [],
      items,
      decisionMode: check.decisionMode,
      hasDeviation: check.hasDeviation,
      deviationReason: check.deviationReason,
    }
  }

  const warehouseProcess = selectDisplayRecord(t.warehouseProcesses)
  const remarksStr = t.remarks || t.compiledChecklist || warehouseProcess?.remarks || ''
  if (!remarksStr || (!remarksStr.includes('Sampling:') && !remarksStr.includes('Checklist:'))) return null

  const hasIssue = remarksStr.includes('DITERIMA DENGAN CATATAN') || remarksStr.includes('NON-COMPLIANT') || remarksStr.includes('NOT OK')

  // Parse Sampling: [Odor: COMPLIANT, Color: NON-COMPLIANT, ...]
  const samplings = []
  const samplingMatch = remarksStr.match(/Sampling:\s*\[([^\]]+)\]/)
  if (samplingMatch) {
    samplingMatch[1].split(',').forEach(s => {
      const [label, status] = s.trim().split(':').map(x => x.trim())
      if (label && status) {
        samplings.push({ label, compliant: status === 'COMPLIANT' || status === 'OK' })
      }
    })
  }

  const vehicleChecklistLabels = [
    "Vehicle Cleanliness",
    "Door Seal Intact",
    "Odor/Smell Check",
    "Arrangement",
    "Pest/Animal Control",
    "Foreign Objects",
    "Packaging Integrity",
    "CoA Validation",
    "Quantity Verification",
    "Leakage & Condition"
  ]

  // Parse Checklist: [Item 1: OK, Item 2: NOT OK||IMG:data:image..., ...]
  const items = []
  const checklistMatch = remarksStr.match(/Checklist:\s*\[([^\]]+)\]/)
  if (checklistMatch) {
    // Detect separator: new format uses ' | ' to prevent base64 comma conflicts, old format uses ','
    const sep = checklistMatch[1].includes(' | Item') ? ' | ' : ','
    checklistMatch[1].split(sep).forEach(c => {
      // Split by '||IMG:' safely since the label won't contain it
      const hasImg = c.includes('||IMG:')
      const textPart = hasImg ? c.split('||IMG:')[0] : c
      const photo = hasImg ? c.split('||IMG:')[1].trim() : null

      const parts = textPart.trim().match(/^(.+?):\s*(OK|NOT OK)$/)
      if (parts) {
        let label = parts[1].trim()
        const matchItemNum = label.match(/Item (\d+)/)
        if (matchItemNum) {
          const index = parseInt(matchItemNum[1], 10) - 1
          if (vehicleChecklistLabels[index]) {
            label = vehicleChecklistLabels[index]
          }
        }
        items.push({ label, ok: parts[2] === 'OK', photo })
      }
    })
  }

  if (samplings.length === 0 && items.length === 0) return null
  return { hasIssue, samplings, items }
})

const checklistStatusInfo = computed(() => {
  if (isWarehouseRejection.value || isRejected.value) {
    return {
      status: 'REJECTED',
      label: 'REJECTED',
      badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
      headerStyle: { background: 'rgba(239, 68, 68, 0.05)' },
      iconStyle: 'color: #E11D48',
      titleStyle: 'color: #9F1239',
      icon: 'cancel'
    }
  }

  const checklist = parsedChecklist.value
  if (checklist?.decisionMode === 'APPROVED_WITH_DEVIATION') {
    return {
      status: 'APPROVED_WITH_DEVIATION',
      label: 'APPROVED WITH DEVIATION',
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
      headerStyle: { background: 'rgba(245, 158, 11, 0.06)' },
      iconStyle: 'color: #D97706',
      titleStyle: 'color: #92400E',
      icon: 'warning'
    }
  }

  const hasIssue = checklist?.hasIssue ||
                   checklist?.samplings?.some(s => s.compliant === false) ||
                   checklist?.items?.some(i => i.ok === false)

  if (hasIssue) {
    return {
      status: 'ACCEPTED_NOTE',
      label: 'TERIMA WITH NOTE',
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
      headerStyle: { background: 'rgba(245, 158, 11, 0.06)' },
      iconStyle: 'color: #D97706',
      titleStyle: 'color: #92400E',
      icon: 'warning'
    }
  }

  return {
    status: 'ACCEPTED',
    label: 'TERIMA',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    headerStyle: { background: 'rgba(16, 185, 129, 0.04)' },
    iconStyle: 'color: #059669',
    titleStyle: 'color: #064E3B',
    icon: 'check_circle'
  }
})

const getWeightVal = (val) => {
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  if (isNaN(num)) return null
  return num
}

const grossInVal = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const types = getWeightRecordTypes(t.processType)
  if (types.gross !== 'IN') return null
  let val = getWeightVal(t.weights?.gross)
  if (val === null) val = getWeightVal(t.grossWeight)
  if (val === null) val = getWeightVal(t.weighInWeight)
  return val
})

const tareOutVal = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const types = getWeightRecordTypes(t.processType)
  if (types.tare !== 'OUT') return null
  let val = getWeightVal(t.weights?.tare)
  if (val === null) val = getWeightVal(t.tareWeight)
  if (val === null) val = getWeightVal(t.weighOutWeight)
  return val
})

const tareInVal = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const types = getWeightRecordTypes(t.processType)
  if (types.tare !== 'IN') return null
  let val = getWeightVal(t.weights?.tare)
  if (val === null) val = getWeightVal(t.tareWeight)
  if (val === null) val = getWeightVal(t.weighInWeight)
  return val
})

const grossOutVal = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const types = getWeightRecordTypes(t.processType)
  if (types.gross !== 'OUT') return null
  let val = getWeightVal(t.weights?.gross)
  if (val === null) val = getWeightVal(t.grossWeight)
  if (val === null) val = getWeightVal(t.weighOutWeight)
  return val
})

const isRejected = computed(() => {
  const t = currentTruck.value
  if (!t) return false
  return t.status === 'INCOMING_CHECK_REJECTED' ||
         t.status === 'QC_VEHICLE_REJECTED' ||
         t.incomingMaterialChecks?.some(c => c.result === 'REJECT') ||
         t.qcVehicleChecks?.some(c => c.result === 'REJECT')
})

const warehouseRealization = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  if (isRejected.value) return null
  if (t.processType === 'GBB') {
    return t.nettoTimbanganRoll !== undefined && t.nettoTimbanganRoll !== null ? t.nettoTimbanganRoll : (t.weights?.nettoTimbanganRoll !== undefined && t.weights?.nettoTimbanganRoll !== null ? t.weights.nettoTimbanganRoll : (t.actualWeight !== undefined && t.actualWeight !== null ? t.actualWeight : (t.weights?.rollWeight !== undefined && t.weights?.rollWeight !== null ? t.weights.rollWeight : (t.rollWeight !== undefined && t.rollWeight !== null ? t.rollWeight : null))))
  }
  if (t.processType === 'GSP') {
    const whProcess = currentWarehouseRecord.value
    if (whProcess?.receivedQuantity !== undefined && whProcess?.receivedQuantity !== null && whProcess?.receivedQuantity !== '') {
      return whProcess.receivedQuantity
    }
    return null
  }
  if (t.processType === 'GBJ') {
    const whProcess = currentWarehouseRecord.value
    return whProcess?.actualQuantity !== undefined && whProcess?.actualQuantity !== null
      ? whProcess.actualQuantity
      : null
  }
  return null
})

const isGspProcess = computed(() => {
  const p = currentTruck.value?.processType
  return p === 'GSP'
})

const gspReceiptUnit = computed(() => {
  const catalogUnit = currentTruck.value?.productCatalog?.receiptUnit
  if (catalogUnit) return String(catalogUnit).toUpperCase()
  return currentReceivedUnit.value
})

const isUomMismatch = computed(() => {
  if (!isGspProcess.value) return false
  const catalogUnit = currentTruck.value?.productCatalog?.receiptUnit
  return !catalogUnit || !currentReceivedUnit.value || String(catalogUnit).toUpperCase() !== currentReceivedUnit.value
})

const formattedRealizationDisplay = computed(() => {
  const val = warehouseRealization.value
  if (val === undefined || val === null || val === '' || Number(val) === 0 || isNaN(Number(val))) return '-'
  const formattedNum = new Intl.NumberFormat('id-ID').format(Number(val))
  if (isGspProcess.value) {
    return `${formattedNum} ${gspReceiptUnit.value}`
  }
  return `${formattedNum} kg`
})

const isDataCompleteForCalc = computed(() => {
  const t = currentTruck.value
  if (!t) return false
  if (isRejected.value) return true
  if (isUomMismatch.value) return false
  const area = t.processType
  const whReal = warehouseRealization.value

  if (whReal === null || whReal === undefined || whReal === '') return false

  if (area === 'GBB' || area === 'GSP') {
    const gIn = grossInVal.value
    const tOut = tareOutVal.value
    if (gIn === null || gIn === 0 || tOut === null || tOut === 0) return false
    if (tOut > gIn) return false
    const bridgeNet = gIn - tOut
    if (bridgeNet <= 0) return false
    return true
  } else if (area === 'GBJ') {
    const tIn = tareInVal.value
    const gOut = grossOutVal.value
    if (tIn === null || tIn === 0 || gOut === null || gOut === 0) return false
    if (tIn > gOut) return false
    const bridgeNet = gOut - tIn
    if (bridgeNet <= 0) return false
    return true
  }
  return false
})

const nettoTimbanganJembatan = computed(() => {
  const t = currentTruck.value
  if (!t) return null
  const area = t.processType
  if (area === 'GBB' || area === 'GSP') {
    const gIn = grossInVal.value
    const tOut = tareOutVal.value
    if (gIn === null || tOut === null) return null
    return Math.max(0, gIn - tOut)
  } else if (area === 'GBJ') {
    const tIn = tareInVal.value
    const gOut = grossOutVal.value
    if (tIn === null || gOut === null) return null
    return Math.max(0, gOut - tIn)
  }
  return null
})

const persentaseAnalisa = computed(() => {
  if (isRejected.value) return 100
  if (isUomMismatch.value) return null
  if (!isDataCompleteForCalc.value) return null
  const bridgeNet = nettoTimbanganJembatan.value
  const whReal = warehouseRealization.value
  if (!bridgeNet || !whReal) return null
  return (whReal / bridgeNet) * 100
})

const deviationPercentage = computed(() => {
  if (isRejected.value) return 0
  if (isUomMismatch.value) return null
  if (!isDataCompleteForCalc.value) return null
  const pct = persentaseAnalisa.value
  if (pct === null) return null
  return Math.abs(pct - 100)
})

const netWeightVarianceObj = computed(() => {
  return settingsStore.weightTolerances?.find(t => t.parameterName === 'Net Weight Variance')
})

const toleranceLimit = computed(() => {
  return netWeightVarianceObj.value ? netWeightVarianceObj.value.toleranceValue : 2.0
})

const correctionWeightValue = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

const correctionNetWeight = computed(() => {
  const gross = correctionWeightValue(correctionForm.value.grossWeight)
  const tare = correctionWeightValue(correctionForm.value.tareWeight)
  return gross === null || tare === null || gross < tare ? null : gross - tare
})

const correctionDeviationKg = computed(() => {
  const net = correctionNetWeight.value
  const act = correctionWeightValue(correctionForm.value.actualWeight)
  return net === null || act === null ? null : Math.abs(net - act)
})

const correctionDeviationPct = computed(() => {
  const net = correctionNetWeight.value
  const act = correctionWeightValue(correctionForm.value.actualWeight)
  if (net === null || net <= 0 || act === null || act <= 0) return null
  return Math.abs(((act / net) * 100) - 100)
})

const isCorrectionDeviationExceeded = computed(() => {
  if (currentProcessType.value !== 'GBB') return false
  if (isUomMismatch.value) return false
  if (correctionDeviationPct.value === null) return false
  return correctionDeviationPct.value > toleranceLimit.value
})

const statusTonnage = computed(() => {
  const t = currentTruck.value
  if (!t) return 'PENDING'
  if (isUomMismatch.value) return 'UOM_DIFFERENT'
  const area = t.processType
  const whReal = warehouseRealization.value

  if (area === 'GBB' || area === 'GSP') {
    const gIn = grossInVal.value
    const tOut = tareOutVal.value

    if (tOut === null || tOut === undefined || tOut === 0) {
      return 'PENDING'
    }
    if (gIn === null || gIn === undefined || gIn === 0) {
      return 'PENDING'
    }
    if (tOut > gIn) {
      return 'ERROR DATA'
    }
    const bridgeNet = gIn - tOut
    if (bridgeNet <= 0) {
      return 'ERROR DATA'
    }
    if (whReal === null || whReal === undefined || whReal === '') {
      return 'PENDING'
    }
  } else if (area === 'GBJ') {
    const tIn = tareInVal.value
    const gOut = grossOutVal.value

    if (gOut === null || gOut === undefined || gOut === 0) {
      return 'PENDING'
    }
    if (tIn === null || tIn === undefined || tIn === 0) {
      return 'PENDING'
    }
    if (tIn > gOut) {
      return 'ERROR DATA'
    }
    const bridgeNet = gOut - tIn
    if (bridgeNet <= 0) {
      return 'ERROR DATA'
    }
    if (whReal === null || whReal === undefined || whReal === '') {
      return 'PENDING'
    }
  } else {
    return 'PENDING'
  }

  const devPct = deviationPercentage.value
  if (devPct === null) return 'PENDING'

  if (devPct <= toleranceLimit.value) {
    return 'OK'
  } else {
    return 'CHECK / INVESTIGASI'
  }
})

const shouldShowAlert = computed(() => {
  if (statusTonnage.value !== 'CHECK / INVESTIGASI') return false
  return netWeightVarianceObj.value ? netWeightVarianceObj.value.triggerAlert : true
})

const hasWeightData = computed(() => {
  const gIn = grossInVal.value
  const tIn = tareInVal.value
  const gOut = grossOutVal.value
  const tOut = tareOutVal.value
  const whReal = warehouseRealization.value
  return (gIn !== null && gIn > 0) || (tIn !== null && tIn > 0) || (gOut !== null && gOut > 0) || (tOut !== null && tOut > 0) || (whReal !== null && whReal > 0)
})

const getTimestampVal = (key) => {
  return currentTruck.value?.timestamps?.[key] || currentTruck.value?.[key] || null;
}

const timestampRows = computed(() => {
  const t = currentTruck.value;
  const pType = t?.processType || 'GBB';
  const isSamplingRejected = t?.status === 'QC_VEHICLE_REJECTED';

  if (pType === 'GBJ') {
    return [
      { label: 'Gate Entry', value: getTimestampVal('gateInAt') },
      { label: 'Weigh In', value: getTimestampVal('weighInAt') },
      { label: 'QC Vehicle', value: selectDisplayRecord(t?.qcVehicleChecks)?.completedAt || getTimestampVal('qcStartAt') },
      { label: 'GBJ Loading', value: isSamplingRejected ? null : (getTimestampVal('warehouseEndAt') || getTimestampVal('warehouseStartAt')) },
      { label: 'Weigh Out', value: getTimestampVal('weighOutAt') },
      { label: 'Dispatched', value: getTimestampVal('gateOutAt') }
    ]
  }

  if (pType === 'GSP') {
    const isSolar = isSolarCommodity.value;
    const latestPaRound = latestByTestRound(gspPaRounds.value)
    const paTime = isSolar ? 'PA EXEMPT' : (latestPaRound?.testedAt || getTimestampVal('qcEndAt') || getTimestampVal('qcStartAt'));

    // Disposisi Mutu jika OOS (atau NOT APPLICABLE jika compliant/tidak ada OOS)
    const isDispApplicable = hasGspDisposition.value || t?.status === 'WAITING_GSP_DISPOSITION' || t?.status === 'WAITING_UTILITY_DISPOSITION';
    const dispTime = latestDisposedPa.value?.dispositionAt ||
                     (hasGspDisposition.value ? (getTimestampVal('qcEndAt') || getTimestampVal('updatedAt')) : null);
    const dispVal = isDispApplicable ? (dispTime || getTimestampVal('updatedAt')) : 'NOT APPLICABLE';

    // Checklist Pra-Bongkar (9 parameter)
    const whProcess = selectDisplayRecord(t?.warehouseProcesses);
    const checklistTime = whProcess?.startAt || whProcess?.startedAt || getTimestampVal('warehouseStartAt') || null;

    // Disposisi Pra-Bongkar (jika ada NOT OK atau disposisi checklist)
    const isChkDispApplicable = hasChecklistDisposition.value || t?.status === 'WAITING_GSP_CHECKLIST_DISPOSITION';
    const chkDispTime = latestChecklistDisposition.value?.decidedAt || (hasChecklistDisposition.value ? getTimestampVal('updatedAt') : null);
    const chkDispVal = isChkDispApplicable ? (chkDispTime || getTimestampVal('updatedAt')) : 'NOT APPLICABLE';

    // Bongkar GSP / Proses Gudang
    const processTime = (t?.status === 'WAREHOUSE_IN_PROGRESS' || t?.status === 'COMPLETED' || t?.status === 'DISPATCHED' || t?.warehouseEndAt)
      ? (getTimestampVal('warehouseStartAt') || whProcess?.startAt || null)
      : null;

    // Receiving Gudang / Konfirmasi Penerimaan
    const receivingTime = getTimestampVal('warehouseEndAt') || whProcess?.completedAt || null;

    return [
      { label: 'Gate Entry', value: getTimestampVal('gateInAt') },
      { label: 'Weigh In', value: getTimestampVal('weighInAt') },
      { label: isSolar ? 'QC PA (Exempt)' : 'QC PA Lab', value: paTime },
      { label: 'Disposisi Mutu', value: dispVal },
      { label: 'Pemeriksaan Pra-Bongkar', value: checklistTime },
      { label: 'Disposisi Pra-Bongkar', value: chkDispVal },
      { label: 'Bongkar GSP', value: processTime },
      { label: 'Receiving Gudang', value: receivingTime },
      { label: 'Weigh Out', value: getTimestampVal('weighOutAt') },
      { label: 'Dispatched', value: getTimestampVal('gateOutAt') }
    ];
  }

  const unloadLabel = 'GBB Unloading';

  return [
    { label: 'Gate Entry', value: getTimestampVal('gateInAt') },
    { label: 'Weigh In', value: getTimestampVal('weighInAt') },
    { label: 'QC Sampling', value: selectDisplayRecord(t?.qcVehicleChecks)?.completedAt || getTimestampVal('qcStartAt') },
    { label: unloadLabel, value: isSamplingRejected ? null : (getTimestampVal('warehouseStartAt') || getTimestampVal('warehouseEndAt')) },
    { label: 'QC Lab Check', value: isSamplingRejected ? null : (selectDisplayRecord(t?.incomingMaterialChecks)?.completedAt || (t?.status?.startsWith('INCOMING_CHECK') ? getTimestampVal('qcEndAt') : null)) },
    { label: 'Weigh Out', value: getTimestampVal('weighOutAt') },
    { label: 'Dispatched', value: getTimestampVal('gateOutAt') }
  ]
})

const lastCompletedIdx = computed(() => {
  const rows = timestampRows.value;
  let lastIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].value && rows[i].value !== 'NOT APPLICABLE' && rows[i].value !== 'N/A') {
      lastIdx = i;
    }
  }
  return lastIdx;
})

const activeLineHeight = computed(() => {
  const total = timestampRows.value.length;
  if (total <= 1 || lastCompletedIdx.value <= 0) return '0%';
  const pct = (lastCompletedIdx.value / (total - 1)) * 100;
  return `${pct}%`;
})

const fraudMetrics = computed(() => {
  const t = currentTruck.value
  if (!t) return { status: 'NOT_RECORDED' }
  const net = nettoTimbanganJembatan.value || 0
  const roll = warehouseRealization.value || 0
  if (isUomMismatch.value || net === 0 || roll === 0) {
    return { net, roll, diff: 0, ratioPercent: 0, deviationPercent: 0, direction: '=', status: 'NOT_RECORDED' }
  }
  const ratioPercent = (roll / net) * 100
  const rawDiff = roll - net
  const diff = Math.abs(rawDiff)
  const deviationPercent = Math.abs(100 - ratioPercent)
  const direction = rawDiff > 0 ? '+' : rawDiff < 0 ? '-' : '='

  let status = 'SAFE'
  const tol = toleranceLimit.value
  if (deviationPercent > tol) status = 'CRITICAL'
  else if (deviationPercent > tol / 2) status = 'WARNING'

  return { net, roll, diff, ratioPercent, deviationPercent, direction, status }
})

const formatWeight = (val) => {
  if (val === undefined || val === null || val === '' || Number(val) === 0 || isNaN(Number(val))) return '-'
  const num = Number(val)
  return new Intl.NumberFormat('id-ID').format(num)
}

const formatWeightCustom = (val) => {
  if (val === undefined || val === null || val === '' || Number(val) === 0 || isNaN(Number(val))) return '-'
  const num = Number(val)
  return new Intl.NumberFormat('id-ID').format(num) + ' kg'
}

const formatPercentageCustom = (val) => {
  if (val === undefined || val === null || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + '%'
}

const formatPercentageCustom1 = (val) => {
  if (val === undefined || val === null || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num) + '%'
}

const formatTimeFull = (isoString) => {
  if (!isoString) return '-'
  if (isoString === 'NOT APPLICABLE' || isoString === 'N/A' || isoString === 'PA EXEMPT' || isoString === 'EXEMPT') {
    return isoString
  }
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return typeof isoString === 'string' ? isoString : '-'
  return `${formatPlantTime(d, true)}, ${formatPlantDate(d)} WIB`
}

// ================= GSP SPECIFIC COMPUTEDS & HELPERS =================
const canonicalGspChecklistItems = [
  { code: 'CLEAN_VEHICLE', label: 'Kendaraan bersih' },
  { code: 'DOOR_SEAL_GOOD', label: 'Seal pintu kendaraan baik' },
  { code: 'NO_EXPIRED_GAS_CYLINDER', label: 'Tidak ditemukan tabung gas yang sudah Exp date masa uji berlakunya' },
  { code: 'ITEMS_NEATLY_ARRANGED', label: 'Barang tertata rapi' },
  { code: 'NO_PEST_OR_ANIMAL_TRACE', label: 'Tidak ditemukan hama / binatang dan/atau jejak / bekas binatang' },
  { code: 'GOOD_CLEAN_SEALED', label: 'Barang baik dan bersih serta tersegel' },
  { code: 'COA_MATCHES_BATCH', label: 'CoA tersedia dan sesuai batchnya' },
  { code: 'QTY_TYPE_MATCHES_SJ', label: 'Jumlah dan jenis barang sesuai SJ' },
  { code: 'VEHICLE_NO_LEAK_GOOD', label: 'Kendaraan tidak bocor / kondisi baik' },
]

const latestChecklistDisposition = computed(() => {
  const t = currentTruck.value
  if (!t || t.processType !== 'GSP') return null
  const whProcesses = t.warehouseProcesses || []
  for (const proc of whProcesses) {
    const rawChecklist = proc.checklistItems
    if (rawChecklist?.disposition) {
      return rawChecklist.disposition
    }
  }
  if (t.checklistDisposition) return t.checklistDisposition
  return null
})

const hasChecklistDisposition = computed(() => {
  return latestChecklistDisposition.value !== null
})

const gspPreUnloadMeta = computed(() => {
  const t = currentTruck.value
  if (!t || t.processType !== 'GSP') return {}
  const whProcess = selectDisplayRecord(t.warehouseProcesses)
  const rawChecklist = whProcess?.checklistItems || t.preUnloadChecklist
  const inspector = whProcess?.startBy?.name || whProcess?.startedBy?.name || rawChecklist?.inspectedBy?.name || t.warehouseStartBy?.name || 'Tim Gudang GSP'
  const inspectedAt = whProcess?.startAt || whProcess?.startedAt || rawChecklist?.inspectedAt || t.warehouseStartAt
  return { inspector, inspectedAt }
})

const gspPreUnloadItems = computed(() => {
  const t = currentTruck.value
  if (!t || t.processType !== 'GSP') return []
  const whProcess = selectDisplayRecord(t.warehouseProcesses)
  const rawChecklist = whProcess?.checklistItems || t.preUnloadChecklist
  if (!rawChecklist) return []

  const items = Array.isArray(rawChecklist)
    ? rawChecklist
    : (Array.isArray(rawChecklist.items) ? rawChecklist.items : [])

  if (items.length === 0) return []

  return canonicalGspChecklistItems.map(canonical => {
    const matched = items.find(i => (i.code && i.code === canonical.code) || (i.label && i.label.toLowerCase() === canonical.label.toLowerCase()))
    const rawResult = String(matched?.result || '').toUpperCase()
    const isOk = matched
      ? rawResult === 'OK' || rawResult === 'PASS' || matched.ok === true
      : null
    const isNotOk = matched
      ? rawResult === 'NOT_OK' || rawResult === 'NOT OK' || rawResult === 'REJECT' || rawResult === 'FAIL' || matched.ok === false
      : false
    const resolved = isNotOk ? false : isOk ? true : null
    return {
      code: canonical.code,
      label: canonical.label,
      ok: resolved,
      result: resolved === true ? 'OK' : resolved === false ? 'NOT OK' : null,
      notes: matched?.notes || matched?.note || '',
      photoUrl: matched?.photoUrl || null
    }
  })
})

const gspPreUnloadStatus = computed(() => {
  const items = gspPreUnloadItems.value
  if (!items || items.length === 0) {
    return {
      label: 'BELUM ADA PEMERIKSAAN',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200'
    }
  }
  if (items.some(i => i.ok === null)) {
    return {
      label: 'DATA BELUM LENGKAP',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200'
    }
  }
  const allOk = items.every(i => i.ok === true)
  if (allOk) {
    return {
      label: 'COMPLIANT (9/9)',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    }
  }
  return {
    label: hasChecklistDisposition.value ? 'DEFECT (DISPOSISI KONSESI)' : 'ADA DEFECT (NOT OK)',
    badgeClass: hasChecklistDisposition.value ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
  }
})

const latestDisposedPa = computed(() => {
  const current = latestByTestRound(gspPaRounds.value)
  return current?.dispositionAction ? current : null
})

const latestPaStatusLabel = computed(() => {
  const latest = latestByTestRound(gspPaRounds.value)
  return latest ? getPaStatusLabel(latest.status || latest.result) : null
})

const hasGspDisposition = computed(() => {
  return latestDisposedPa.value !== null
})

const getPaStatusBadgeClass = (status) => {
  if (!status) return 'bg-slate-100 text-slate-700'
  const s = String(status).toUpperCase()
  if (s === 'PASS' || s === 'APPROVED') return 'bg-emerald-100 text-emerald-800 border border-emerald-200'
  if (s === 'REJECT' || s === 'REJECTED' || s === 'FAIL') return 'bg-rose-100 text-rose-800 border border-rose-200'
  if (s.includes('NOTE') || s.includes('CONCESSION') || s.includes('ACCEPT')) return 'bg-amber-100 text-amber-800 border border-amber-200'
  if (s.includes('RETEST')) return 'bg-blue-100 text-blue-800 border border-blue-200'
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

const getPaStatusLabel = (status) => {
  if (!status) return '-'
  const s = String(status).toUpperCase()
  if (s === 'PASS' || s === 'APPROVED') return 'PASS'
  if (s === 'REJECT' || s === 'REJECTED' || s === 'FAIL') return 'REJECT (OOS)'
  if (s.includes('NOTE') || s.includes('CONCESSION')) return 'TERIMA DENGAN CATATAN'
  if (s.includes('RETEST')) return 'RETEST'
  return s
}

const getDispositionActionLabel = (action) => {
  if (!action) return '-'
  const a = String(action).toUpperCase()
  if (a === 'ACCEPT_WITH_NOTE') return 'TERIMA DENGAN CATATAN (KONSESI)'
  if (a === 'REQUEST_RETEST') return 'UJI ULANG (RETEST)'
  if (a === 'REJECT') return 'TOLAK MUATAN'
  return a
}

</script>

<style scoped>
.modal-enter-active { transition: opacity 0.35s ease-out; }
.modal-leave-active { transition: opacity 0.2s ease-in; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.modal-enter-active .modal-panel {
  animation: modalSpringUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.modal-leave-active .modal-panel {
  animation: modalDown 0.2s ease-in forwards;
}
@keyframes modalSpringUp {
  0%   { opacity: 0; transform: translateY(40px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes modalDown {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(14px) scale(0.97); }
}
</style>
