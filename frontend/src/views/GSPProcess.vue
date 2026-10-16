<template>
  <div class="space-y-6">
    <PageHeader title="Sparepart Warehouse" subtitle="Loading Operations" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" :process-type="getProcessType(selectedTruck)" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-slate-100/90 p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-300">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em]">Plate Number</span>
                  <span v-if="selectedTruck.dailySequence" class="px-1.5 py-0.5 rounded text-[10px] font-black font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                    #{{ String(selectedTruck.dailySequence).padStart(3, '0') }}
                  </span>
                </div>
                <span class="text-xl font-black truncate font-mono tracking-widest text-slate-900">{{ getPlateNumber(selectedTruck) }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Driver</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.driverName }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Vendor</span>
                <span class="text-sm font-black text-slate-700 truncate">{{ getVendor(selectedTruck) }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Delivery Note</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.suratJalanNumber || '-' }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">PO Number</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.poNumber || '-' }}</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Process</span>
                <span class="text-sm font-black text-[#3A6ABF]">Processing</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Warehouse Out</span>
                <span class="text-sm font-black text-slate-800 font-mono">{{ formatTime(getWarehouseEnd(selectedTruck)) }}</span>
              </div>
            </div>
            
            <div class="mt-6 relative z-10">
              <button @click="showDetailsModal = true" class="relative w-full overflow-hidden flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl transition-all duration-300 text-xs font-black uppercase tracking-widest text-indigo-600 bg-[#E6F0FA] border border-[#CCE0F5] hover:border-indigo-300 hover:shadow-[0_4px_20px_rgba(74,139,223,0.2)] group">
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-200/50 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                <span class="material-icons text-[18px]">travel_explore</span>
                <span>VIEW FULL ANALYSIS</span>
              </button>
            </div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9"><StepTimeline :current-step="selectedTruck.status" :process-type="selectedTruck.processType" /></div>
            
            <div class="mt-6 space-y-4">
              <!-- Missing Security Info (SJ / PO Hard Gate) -->
              <div v-if="(selectedTruck.status === 'QC_VEHICLE_PASSED' || selectedTruck.status === 'PA_NOT_REQUIRED') && (!selectedTruck.suratJalanNumber || !selectedTruck.poNumber)" class="space-y-4 p-5 rounded-2xl" style="background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDE68A">
                <div class="flex items-center space-x-2 text-[#800057] mb-2">
                  <span class="material-icons text-lg">warning_amber</span>
                  <span class="text-[11px] font-black uppercase tracking-wider">Lengkapi Data Surat Jalan & PO</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="space-y-1.5" v-if="!selectedTruck.suratJalanNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Delivery Note / Surat Jalan *</label>
                    <input v-model="suratJalanInput" id="input-gsp-surat-jalan" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="SJ-XXXXX">
                  </div>
                  <div class="space-y-1.5" v-if="!selectedTruck.poNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">No PO *</label>
                    <input v-model="poNumberInput" id="input-gsp-po-number" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="PO-XXXXX">
                  </div>
                </div>
                <button @click="saveSecurityInfo" :disabled="isProcessing" class="w-full btn-primary py-2.5 mt-2 flex justify-center items-center space-x-2" id="btn-save-security-gsp">
                  <span v-if="isProcessing" class="material-icons animate-spin">autorenew</span>
                  <span>Siapkan Data & Lanjutkan Pemeriksaan</span>
                </button>
              </div>

              <!-- Pre-Unloading Inspection Action Card (Triggers Popup Modal) -->
              <div
                v-if="(selectedTruck.status === 'QC_VEHICLE_PASSED' || selectedTruck.status === 'PA_NOT_REQUIRED') && selectedTruck.suratJalanNumber && selectedTruck.poNumber"
                class="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm"
                id="card-preunload-checklist"
              >
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div class="flex items-center space-x-2.5">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 border border-teal-200 text-teal-700">
                      <span class="material-icons text-xl">fact_check</span>
                    </div>
                    <div>
                      <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Tahap Inspeksi: Pemeriksaan Pra-Bongkar GSP</h4>
                      <p class="text-[10px] text-slate-500 font-medium">SOP-GSP-2026.1 &bull; 9 Parameter Kendaraan, Dokumen &amp; Fisik Muatan</p>
                    </div>
                  </div>
                  <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                    Wajib Sebelum Bongkar
                  </span>
                </div>

                <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p class="font-bold text-slate-800">Instruksi Pemeriksaan:</p>
                  <p class="text-[11px] text-slate-600 leading-relaxed">
                    Sesuai SOP Penerimaan GSP, fisik kendaraan, segel tangki/bak, kondisi kemasan, dan dokumen harus diverifikasi melalui form checklist pra-bongkar sebelum pembongkaran muatan diizinkan.
                  </p>
                </div>

                <button
                  type="button"
                  @click="openChecklistModal"
                  class="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-teal-600 hover:bg-teal-700 shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                  id="btn-open-checklist-modal"
                >
                  <span class="material-icons text-base">fact_check</span>
                  <span>BUKA PEMERIKSAAN PRA-BONGKAR GSP (9 PARAMETER)</span>
                </button>
              </div>

              <!-- Waiting GSP Checklist Disposition Card -->
              <div
                v-if="selectedTruck.status === 'WAITING_GSP_CHECKLIST_DISPOSITION'"
                class="space-y-4 p-5 rounded-2xl bg-white border border-amber-300 shadow-sm"
                id="card-waiting-checklist-disposition"
              >
                <div class="flex items-center justify-between pb-3 border-b border-amber-100">
                  <div class="flex items-center space-x-2.5">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 text-amber-800 border border-amber-300">
                      <span class="material-icons text-xl">gavel</span>
                    </div>
                    <div>
                      <h4 class="text-xs font-black text-amber-900 uppercase tracking-wider">Menunggu Keputusan Penerimaan GSP</h4>
                      <p class="text-[10px] text-amber-700 font-medium">Ketidaksesuaian Pra-Bongkar (Checklist NOT OK)</p>
                    </div>
                  </div>
                  <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                    Menunggu Keputusan
                  </span>
                </div>

                <div class="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
                  <p class="font-bold text-amber-950">Hasil Pemeriksaan Pra-Bongkar Memuat Butir NOT OK</p>
                  <p class="text-[11px] leading-relaxed text-amber-900">
                    Sistem tidak melakukan auto-reject. PIC Gudang GSP atau Administrator dapat menentukan keputusan penerimaan muatan: <b>Terima dengan Catatan (Konsesi)</b> atau <b>Tolak Muatan</b>.
                  </p>
                </div>

                <button
                  type="button"
                  @click="openChecklistDecisionModal"
                  class="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                  id="btn-open-checklist-decision-modal"
                >
                  <span class="material-icons text-base">rule</span>
                  <span>BUKA FORM KEPUTUSAN PENERIMAAN GSP</span>
                </button>
              </div>

              <!-- Waiting for QC / PA Analysis Notice -->
              <div v-if="['QC_VEHICLE_PENDING', 'QC_RETEST_REQUIRED'].includes(selectedTruck.status)" class="space-y-3 p-5 rounded-2xl bg-amber-50/80 border border-amber-200">
                <div class="flex items-center space-x-2 text-amber-800">
                  <span class="material-icons text-xl animate-pulse">pending</span>
                  <span class="text-xs font-black uppercase tracking-wider">Menunggu Hasil QC / PA Analysis</span>
                </div>
                <p class="text-xs font-medium text-amber-700 leading-relaxed">
                  Muatan ini memerlukan persetujuan lulus uji laboratorium (RELEASE) sebelum proses bongkar di gudang GSP dapat dimulai.
                </p>
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>Status: {{ getStatusLabel(selectedTruck.status, 'GSP') }}</span>
                </div>
              </div>

              <!-- GSP Chemical Quality Disposition Card -->
              <div
                v-if="selectedTruck.status === 'WAITING_GSP_DISPOSITION'"
                class="space-y-4 p-5 rounded-2xl bg-white border border-amber-200 shadow-sm"
                id="card-gsp-disposition"
              >
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div class="flex items-center space-x-2.5">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700">
                      <span class="material-icons text-xl">gavel</span>
                    </div>
                    <div>
                      <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Disposisi Mutu Gudang GSP</h4>
                      <p class="text-[10px] text-slate-500 font-medium">Hasil lab OOS memerlukan keputusan penerimaan terkendali</p>
                    </div>
                  </div>
                  <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Ronde {{ activePaRound }} dari 2
                  </span>
                </div>

                <!-- Parameters finding preview -->
                <div v-if="activePaData" class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div class="flex justify-between items-center text-[11px] font-bold text-slate-600">
                    <span>Produk: {{ activePaData.productName || selectedTruck.cargoSubType }}</span>
                    <span class="font-mono text-slate-500">{{ activePaData.productCategory }}</span>
                  </div>
                  <div class="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div v-if="activePaData.parameters?.ph != null" class="flex justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span class="text-slate-500">pH:</span>
                      <span class="font-black text-slate-800">{{ activePaData.parameters.ph }}</span>
                    </div>
                    <div v-if="activePaData.parameters?.density != null" class="flex justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span class="text-slate-500">Density:</span>
                      <span class="font-black text-slate-800">{{ activePaData.parameters.density }}</span>
                    </div>
                    <div v-if="activePaData.parameters?.alkalinityNa2O != null" class="flex justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span class="text-slate-500">Na₂O:</span>
                      <span class="font-black text-slate-800">{{ activePaData.parameters.alkalinityNa2O }}%</span>
                    </div>
                    <div v-if="activePaData.parameters?.alkalinityNaOH != null" class="flex justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span class="text-slate-500">NaOH:</span>
                      <span class="font-black text-slate-800">{{ activePaData.parameters.alkalinityNaOH }}%</span>
                    </div>
                    <div class="col-span-2 flex justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span class="text-slate-500">Sensori:</span>
                      <span class="font-medium text-slate-700 truncate">
                        {{ activePaData.parameters?.sensory?.visual || '-' }} | {{ activePaData.parameters?.sensory?.foreignMatters || '-' }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Critical defect warning banner -->
                <div v-if="hasCriticalDefect" class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                  <div class="flex items-center space-x-1.5 font-black text-xs">
                    <span class="material-icons text-rose-600 text-sm">block</span>
                    <span>Penyimpangan Kritis Terdeteksi</span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-rose-700">
                    Benda asing atau kerusakan kemasan tidak memenuhi syarat toleransi. Sesuai SOP GSP, muatan dengan cacat kritis tidak dapat diterima dengan catatan dan harus ditolak.
                  </p>
                </div>

                <!-- Inline Note input when Accept With Note clicked -->
                <div v-if="showAcceptWithNoteForm" class="space-y-2 p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <label class="block text-[10px] font-black uppercase tracking-wider text-emerald-900">
                    Alasan Penerimaan dengan Catatan (Wajib, min. 5 karakter) *
                  </label>
                  <textarea
                    v-model="dispositionNoteInput"
                    id="input-disposition-note"
                    rows="2"
                    class="w-full p-2.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="Contoh: Disetujui penerimaan dengan deviasi minor pH oleh PIC GSP..."
                  ></textarea>
                  <div class="flex space-x-2 pt-1">
                    <button
                      @click="showAcceptWithNoteForm = false"
                      class="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-200/80 hover:bg-slate-300 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      @click="executeDisposition('ACCEPT_WITH_NOTE')"
                      :disabled="isProcessing || !isDispositionNoteValid"
                      class="flex-1 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                      id="btn-confirm-accept-note"
                    >
                      Konfirmasi Penerimaan
                    </button>
                  </div>
                </div>

                <!-- 3 Controlled Action Buttons -->
                <div v-if="!showAcceptWithNoteForm" class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    @click="showAcceptWithNoteForm = true"
                    :disabled="isProcessing || hasCriticalDefect"
                    class="py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all flex items-center justify-center space-x-1.5"
                    id="btn-disposition-accept"
                    :title="hasCriticalDefect ? 'Tidak dapat diterima dengan catatan karena ada cacat kritis' : ''"
                  >
                    <span class="material-icons text-sm">assignment_turned_in</span>
                    <span>Terima Catatan</span>
                  </button>

                  <button
                    @click="promptRetest"
                    :disabled="isProcessing || isMaxRetestReached"
                    class="py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-1.5"
                    id="btn-disposition-retest"
                    :title="isMaxRetestReached ? 'Batas maksimum 2 ronde telah tercapai' : ''"
                  >
                    <span class="material-icons text-sm">replay</span>
                    <span>Uji Ulang</span>
                  </button>

                  <button
                    @click="promptReject"
                    :disabled="isProcessing"
                    class="py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center space-x-1.5 shadow-sm"
                    id="btn-disposition-reject"
                  >
                    <span class="material-icons text-sm">cancel</span>
                    <span>Tolak Muatan</span>
                  </button>
                </div>
              </div>

              <!-- GSP Waiting Utility Disposition (Legacy Read-Only Notice) -->
              <div
                v-else-if="selectedTruck.status === 'WAITING_UTILITY_DISPOSITION'"
                class="space-y-2 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-center shadow-sm"
                id="card-utility-legacy"
              >
                <div class="flex items-center justify-center gap-2 text-amber-800 font-black text-sm">
                  <span class="material-icons text-xl text-amber-600">hourglass_empty</span>
                  <span>Status Historis: Menunggu Disposisi Utility (Legacy)</span>
                </div>
                <p class="text-xs text-amber-700 font-medium">Transaksi ini berada pada status historis yang bersifat read-only. Tidak dapat diproses disposisi baru.</p>
              </div>
              <div v-if="selectedTruck.status === 'WAREHOUSE_IN_PROGRESS'" class="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm" id="card-gsp-receiving">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-indigo-600 text-xl">inventory_2</span>
                    <div>
                      <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Penerimaan Material GSP</h4>
                      <p class="text-[10px] text-slate-500 font-medium">Pencatatan kuantitas diterima sesuai satuan master material</p>
                    </div>
                  </div>
                </div>

                <!-- Missing receiptUnit Fail-Closed Alert -->
                <div v-if="!selectedTruck.receiptUnit" class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold" id="alert-missing-receipt-unit">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-red-600 text-lg">error</span>
                    <span>Satuan penerimaan (receiptUnit) transaksi GSP belum terkonfigurasi. Proses penerimaan ditahan.</span>
                  </div>
                </div>

                <!-- Receiving Form when receiptUnit is valid -->
                <div v-else class="space-y-4">
                  <!-- Read-only UOM Badge -->
                  <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span class="text-[11px] font-black text-slate-600 uppercase block">Satuan Penerimaan Material</span>
                      <span class="text-[10px] text-slate-400">Terkonfigurasi dari Master Product Catalog</span>
                    </div>
                    <span class="px-3.5 py-1.5 rounded-lg text-xs font-black bg-blue-100 text-blue-800 font-mono" id="badge-receipt-unit">
                      {{ selectedTruck.receiptUnit }}
                    </span>
                  </div>

                  <!-- Decimal String Quantity Input -->
                  <div>
                    <label class="block text-[11px] font-black text-slate-700 uppercase mb-1">
                      Jumlah Diterima ({{ selectedTruck.receiptUnit }}) *
                    </label>
                    <div class="relative">
                      <input
                        type="text"
                        v-model="receivedQuantityInput"
                        placeholder="Contoh: 8000.250"
                        id="input-gsp-received-quantity"
                        class="w-full h-11 px-3.5 pr-14 bg-white rounded-xl border text-sm font-mono font-bold text-slate-800 focus:outline-none transition-colors"
                        :class="isQuantityValid ? 'border-slate-200 focus:border-[#4A8BDF]' : 'border-red-400 bg-red-50/30'"
                      />
                      <span class="absolute right-3.5 top-3 text-xs font-mono font-bold text-slate-400">
                        {{ selectedTruck.receiptUnit }}
                      </span>
                    </div>
                    <p v-if="quantityValidationMessage" class="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">
                      <span class="material-icons text-sm">info</span>
                      {{ quantityValidationMessage }}
                    </p>
                    <p v-else class="text-[10px] text-slate-400 mt-1">
                      Maksimal 3 angka di belakang koma (contoh: 8000.250). Tanpa tanda koma atau notasi eksponen.
                    </p>
                  </div>

                  <!-- Submit Receiving Button -->
                  <button
                    type="button"
                    @click="handleCompleteReceiving"
                    :disabled="isProcessing || !isQuantityValid"
                    class="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2"
                    id="btn-complete-gsp-receiving"
                  >
                    <span v-if="isProcessing" class="material-icons text-base animate-spin">autorenew</span>
                    <span v-else class="material-icons text-base">save</span>
                    <span>Selesaikan Penerimaan GSP</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(74,139,223,0.06),rgba(160,0,109,0.03));border:1px solid rgba(74,139,223,0.1)"><span class="material-icons text-slate-600 text-3xl">inventory</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start processing</p>
          </div>
        </div>
      </transition>
      <div class="lg:col-span-1">
        <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
          <!-- Glossy Overlay -->
          <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
          
          <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 z-10 relative">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">inventory</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">GSP Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div class="relative">
                <input v-model="searchQuery" type="text" placeholder="Search Plate Number..." class="w-56 h-10 pl-10 pr-10 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  <span class="material-icons text-[16px]">close</span>
                </button>
              </div>
              <div class="flex items-center space-x-2 px-4 py-2 rounded-2xl bg-white shadow-sm border border-slate-100">
                <div class="relative">
                  <span class="block w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
                  <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
                </div>
                <span class="text-xs font-black text-slate-700 tracking-wider">{{ filteredGspTrucks.length }} PENDING TRUCKS</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedGspTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300 bg-[#4A8BDF]"
                  :style="{ opacity: selectedTruck?.id === truck.id ? '1' : '0.5' }"></div>
                
                <div class="flex justify-between items-start pl-3">
                  <div>
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 flex items-center space-x-1.5">
                      <span>Arrival Time</span>
                      <span v-if="truck.dailySequence" class="px-1.5 py-0.2 rounded text-[9px] font-black font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                        #{{ String(truck.dailySequence).padStart(3, '0') }}
                      </span>
                    </div>
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ getPlateNumber(truck) }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 font-mono border border-slate-200">
                    {{ formatTime(getEntryTimestamp(truck)) }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      :class="truck.status === 'WAREHOUSE_IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ getStepLabel(truck) }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#4A8BDF] text-white shadow-[0_4px_12px_rgba(74,139,223,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-[#3A6ABF]'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredGspTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
                <div class="relative mb-6">
                  <div class="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center animate-gentle-float border border-slate-100">
                    <span class="material-icons text-slate-300 text-5xl">cloud_queue</span>
                  </div>
                  <div class="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-[#E6F0FA] flex items-center justify-center animate-pulse">
                    <span class="material-icons text-[#4A8BDF] text-xl">radar</span>
                  </div>
                </div>
                <p class="text-base font-black text-slate-400 tracking-[0.3em] uppercase">No pending trucks</p>
                <p class="text-xs font-bold text-slate-400 mt-2 italic">Scanning for incoming trucks...</p>
              </div>
            </transition-group>
          </div>
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredGspTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredGspTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" size="wide" @close="showDetailsModal = false" />

    <!-- Modal 1: Popup Pemeriksaan Pra-Bongkar GSP -->
    <div
      v-if="selectedTruck"
      v-show="showPreUnloadModal"
      class="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style="background:rgba(2,8,23,0.75);backdrop-filter:blur(8px);"
      id="modal-preunload-checklist"
      @click.self="handleClosePreUnloadModal"
    >
      <div
        class="bg-white rounded-2xl overflow-hidden flex flex-col max-h-[92vh] w-[96vw] max-w-4xl shadow-2xl transition-all"
        style="box-shadow: 0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(13,148,136,0.15);"
      >
        <!-- Modal Header -->
        <div class="px-5 py-3.5 flex justify-between items-center bg-gradient-to-r from-teal-50 via-white to-slate-50 border-b border-teal-100">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-teal-100/80 border border-teal-200 text-teal-800 flex items-center justify-center">
              <span class="material-icons text-xl">fact_check</span>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-sm font-black text-slate-800 uppercase tracking-wider">Pemeriksaan Pra-Bongkar GSP</h3>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
                  SOP-GSP-2026.1
                </span>
              </div>
              <p class="text-[11px] font-bold text-slate-500 mt-0.5">
                Plat: <span class="font-mono text-slate-800">{{ getPlateNumber(selectedTruck) }}</span> &bull; Driver: {{ selectedTruck.driverName || '-' }} &bull; Muatan: {{ selectedTruck.cargoSubType || selectedTruck.cargoType || 'GSP' }}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-xs font-black px-2.5 py-1 rounded-full" :class="isChecklistComplete ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'">
              {{ answeredCount }}/9 Terjawab
            </span>
            <button @click="handleClosePreUnloadModal" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <span class="material-icons text-lg">close</span>
            </button>
          </div>
        </div>

        <!-- Modal Body (9 Items) -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50/50">
          <div class="p-3 bg-teal-50/60 rounded-xl border border-teal-200/70 text-xs text-teal-900 flex items-start space-x-2">
            <span class="material-icons text-teal-600 text-base mt-0.5">info</span>
            <p class="leading-relaxed font-medium">
              Periksa 9 butir fisik kendaraan, segel, dokumen, dan muatan sebelum memulai bongkar. <b>Jika ada item NOT OK</b>, sistem tidak langsung menolak, tetapi wajib mencantumkan catatan temuan dan melampirkan foto bukti.
            </p>
          </div>

          <div class="space-y-2.5">
            <div
              v-for="(item, idx) in GSP_PREUNLOAD_ITEMS"
              :key="item.code"
              class="p-3 sm:p-3.5 rounded-xl border transition-all text-xs bg-white shadow-sm"
              :class="checklistAnswers[item.code].result === 'OK' ? 'border-emerald-200 ring-1 ring-emerald-100' : (checklistAnswers[item.code].result === 'NOT_OK' ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/20' : 'border-slate-200')"
            >
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-start space-x-2.5 flex-1">
                  <span class="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {{ idx + 1 }}
                  </span>
                  <div>
                    <p class="font-black text-slate-800 text-xs leading-snug">{{ item.label }}</p>
                    <span class="font-mono text-[9px] text-slate-400">{{ item.code }}</span>
                  </div>
                </div>

                <!-- Choice Buttons -->
                <div class="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    @click="setChecklistResult(item.code, 'OK')"
                    class="px-3.5 py-1.5 rounded-lg font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    :class="checklistAnswers[item.code].result === 'OK' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'"
                    :id="`btn-chk-${item.code}-ok`"
                  >
                    <span class="material-icons text-sm">check</span>
                    <span>OK</span>
                  </button>

                  <button
                    type="button"
                    @click="setChecklistResult(item.code, 'NOT_OK')"
                    class="px-3.5 py-1.5 rounded-lg font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    :class="checklistAnswers[item.code].result === 'NOT_OK' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'"
                    :id="`btn-chk-${item.code}-notok`"
                  >
                    <span class="material-icons text-sm">close</span>
                    <span>NOT OK</span>
                  </button>
                </div>
              </div>

              <!-- Mandatory defect fields if NOT_OK -->
              <div v-if="checklistAnswers[item.code].result === 'NOT_OK'" class="mt-3 pt-3 border-t border-rose-200/80 space-y-2 bg-rose-50/40 p-2.5 rounded-lg">
                <div>
                  <label class="block text-[10px] font-black text-rose-800 uppercase tracking-wider mb-1">
                    Catatan Temuan Ketidaksesuaian (Wajib)*
                  </label>
                  <input
                    type="text"
                    v-model="checklistAnswers[item.code].notes"
                    placeholder="Contoh: Seal pintu bak robek / ada ceceran cairan..."
                    class="w-full h-8 px-2.5 text-xs bg-white rounded-lg border border-rose-300 focus:outline-none focus:border-rose-500 text-rose-900 font-medium"
                    :id="`input-note-${item.code}`"
                  />
                </div>

                <!-- Photo Proof Upload Zone -->
                <div>
                  <label class="block text-[10px] font-black text-rose-800 uppercase tracking-wider mb-1">
                    Foto Bukti Ketidaksesuaian (Wajib)*
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    @change="onPhotoFileChange(item.code, $event)"
                    class="hidden"
                    :id="`file-chk-${item.code}`"
                  />

                  <div v-if="!checklistAnswers[item.code].photoUrl" class="flex items-center space-x-2">
                    <button
                      type="button"
                      @click="triggerPhotoUpload(item.code)"
                      class="px-3 py-1.5 rounded-lg border border-dashed border-rose-400 bg-white hover:bg-rose-50 text-rose-700 font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                      :id="`btn-upload-photo-${item.code}`"
                    >
                      <span class="material-icons text-sm text-rose-600">add_a_photo</span>
                      <span>Unggah Foto Bukti</span>
                    </button>
                    <span class="text-[10px] text-rose-600 font-medium italic">Wajib melampirkan foto untuk butir NOT OK</span>
                  </div>

                  <div v-else class="flex items-center space-x-3 bg-white p-2 rounded-lg border border-rose-200">
                    <AuthenticatedImage
                      :src="checklistAnswers[item.code].photoUrl"
                      alt="Bukti Foto"
                      @click="previewPhotoModalUrl = $event || checklistAnswers[item.code].photoUrl"
                      img-class="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                      wrapper-class="w-12 h-12 shrink-0"
                    />
                    <div class="flex-1 text-[10px]">
                      <span class="font-bold text-emerald-700 flex items-center gap-1">
                        <span class="material-icons text-xs">check_circle</span> Foto Bukti Terlampir
                      </span>
                      <button
                        type="button"
                        @click="previewPhotoModalUrl = checklistAnswers[item.code].photoUrl"
                        class="text-blue-600 hover:underline block text-[9.5px] mt-0.5"
                      >
                        Lihat preview
                      </button>
                    </div>
                    <div class="flex items-center space-x-1.5">
                      <button
                        type="button"
                        @click="triggerPhotoUpload(item.code)"
                        class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                      >
                        Ganti
                      </button>
                      <button
                        type="button"
                        @click="removePhoto(item.code)"
                        class="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-bold"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-5 py-3.5 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="text-xs">
            <p v-if="checklistValidationWarning" class="text-amber-700 font-bold flex items-center gap-1.5">
              <span class="material-icons text-sm text-amber-500">warning</span>
              <span>{{ checklistValidationWarning }}</span>
            </p>
            <p v-else-if="isChecklistAllOk" class="text-emerald-700 font-bold flex items-center gap-1.5">
              <span class="material-icons text-sm text-emerald-600">verified</span>
              <span>Seluruh 9 butir compliant (OK). Siap memulai pembongkaran.</span>
            </p>
            <p v-else-if="isChecklistAnyNotOk" class="text-rose-700 font-bold flex items-center gap-1.5">
              <span class="material-icons text-sm text-rose-600">info</span>
              <span>Ditemukan ketidaksesuaian. Lanjut ke Keputusan Penerimaan GSP.</span>
            </p>
          </div>

          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              @click="showPreUnloadModal = false"
              class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>

            <!-- If ALL 9 OK -->
            <button
              v-if="isChecklistAllOk"
              type="button"
              @click="submitAllOkChecklist"
              :disabled="isProcessing"
              class="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-1.5 transition-all"
              id="btn-start-unload"
            >
              <span v-if="isProcessing" class="material-icons text-sm animate-spin">autorenew</span>
              <span v-else class="material-icons text-sm">play_arrow</span>
              <span>SIMPAN &amp; MULAI BONGKAR (ALL 9 OK)</span>
            </button>

            <!-- If ANY NOT OK: AJUKAN KE KEPUTUSAN PENERIMAAN GSP (NO AUTO REJECT) -->
            <button
              v-if="isChecklistAnyNotOk"
              type="button"
              @click="submitNotOkChecklist"
              :disabled="isProcessing"
              class="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-1.5 transition-all"
              id="btn-save-checklist-fail"
            >
              <span v-if="isProcessing" class="material-icons text-sm animate-spin">autorenew</span>
              <span v-else class="material-icons text-sm">gavel</span>
              <span>LANJUT KE KEPUTUSAN PENERIMAAN GSP</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 2: Popup Keputusan Penerimaan GSP (Disposisi Checklist) -->
    <div
      v-if="showChecklistDecisionModal && selectedTruck"
      class="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style="background:rgba(2,8,23,0.75);backdrop-filter:blur(8px);"
      id="modal-checklist-decision"
      @click.self="handleCloseChecklistDecisionModal"
    >
      <div
        class="bg-white rounded-2xl overflow-hidden flex flex-col max-h-[92vh] w-[94vw] max-w-2xl shadow-2xl transition-all"
        style="box-shadow: 0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,158,11,0.2);"
      >
        <!-- Modal Header -->
        <div class="px-5 py-3.5 flex justify-between items-center bg-gradient-to-r from-amber-50 via-white to-slate-50 border-b border-amber-200">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center">
              <span class="material-icons text-xl">gavel</span>
            </div>
            <div>
              <h3 class="text-sm font-black text-slate-800 uppercase tracking-wider">Keputusan Penerimaan GSP</h3>
              <p class="text-[11px] font-bold text-slate-500 mt-0.5">
                Disposisi Pemeriksaan Pra-Bongkar &bull; Plat: <span class="font-mono text-slate-800">{{ getPlateNumber(selectedTruck) }}</span>
              </p>
            </div>
          </div>
          <button @click="handleCloseChecklistDecisionModal" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <span class="material-icons text-lg">close</span>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          <!-- Summary of Defect Items -->
          <div v-if="notOkItemsList.length > 0" class="p-3.5 bg-rose-50 rounded-xl border border-rose-200 space-y-2">
            <div class="flex items-center space-x-1.5 text-xs font-black text-rose-800">
              <span class="material-icons text-sm text-rose-600">warning</span>
              <span>Temuan Ketidaksesuaian Checklist ({{ notOkItemsList.length }} Butir NOT OK):</span>
            </div>
            <div class="space-y-2 pt-1">
              <div v-for="defect in notOkItemsList" :key="defect.code" class="p-2.5 bg-white rounded-lg border border-rose-100 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">{{ defect.label }}</span>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-rose-100 text-rose-800 uppercase">NOT OK</span>
                </div>
                <p v-if="defect.notes" class="text-[11px] text-rose-900 mt-1 italic">
                  Catatan: "{{ defect.notes }}"
                </p>
                <div v-if="defect.photoUrl" class="mt-2 flex items-center space-x-2">
                  <AuthenticatedImage
                    :src="defect.photoUrl"
                    alt="Foto Temuan"
                    @click="previewPhotoModalUrl = $event || defect.photoUrl"
                    img-class="w-12 h-12 object-cover rounded border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                    wrapper-class="w-12 h-12 shrink-0"
                  />
                  <div class="text-[9px] text-slate-500 flex flex-col">
                    <span class="font-bold text-slate-700">Foto bukti terlampir</span>
                    <button type="button" @click="previewPhotoModalUrl = defect.photoUrl" class="text-blue-600 hover:underline text-left">Klik untuk perbesar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Non-concessible safety defect alert banner -->
          <div v-if="hasNonConcessibleChecklistDefect" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
            <span class="material-icons text-rose-600 text-sm mt-0.5">error</span>
            <div>
              <b class="block font-black uppercase text-[10px] tracking-wider text-rose-800">Larangan Konsesi SOP-GSP-2026.1</b>
              <span>Ditemukan cacat kritis keselamatan atau kontaminasi biologis (Tabung Gas Expired / Jejak Hama). Berdasarkan SOP resmi, temuan ini dilarang menerima konsesi dan muatan wajib DITOLAK.</span>
            </div>
          </div>

          <!-- Decision Options Cards -->
          <div class="space-y-2">
            <label class="block text-xs font-black text-slate-700 uppercase tracking-wider">Pilih Keputusan Penerimaan *</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Option 1: Terima dengan Catatan (KONSESI) -->
              <div
                @click="!hasNonConcessibleChecklistDefect && (checklistDecisionAction = 'ACCEPT_WITH_NOTE')"
                class="p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between"
                :class="[
                  hasNonConcessibleChecklistDefect
                    ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50'
                    : checklistDecisionAction === 'ACCEPT_WITH_NOTE'
                      ? 'border-amber-500 bg-amber-50/70 shadow-sm cursor-pointer'
                      : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
                ]"
                id="btn-decision-accept-note"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs font-black text-amber-900 uppercase">Terima dengan Catatan</span>
                  <span class="material-icons text-sm" :class="checklistDecisionAction === 'ACCEPT_WITH_NOTE' ? 'text-amber-600' : 'text-slate-300'">
                    {{ checklistDecisionAction === 'ACCEPT_WITH_NOTE' ? 'radio_button_checked' : 'radio_button_unchecked' }}
                  </span>
                </div>
                <p class="text-[11px] text-amber-800 font-medium leading-relaxed">
                  Konsesi operasional bersyarat. Muatan diizinkan untuk dibongkar di gudang GSP dengan catatan khusus.
                </p>
              </div>

              <!-- Option 2: Tolak Muatan -->
              <div
                @click="checklistDecisionAction = 'REJECT'"
                class="p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between"
                :class="checklistDecisionAction === 'REJECT' ? 'border-rose-500 bg-rose-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'"
                id="btn-decision-reject"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs font-black text-rose-900 uppercase">Tolak Muatan</span>
                  <span class="material-icons text-sm" :class="checklistDecisionAction === 'REJECT' ? 'text-rose-600' : 'text-slate-300'">
                    {{ checklistDecisionAction === 'REJECT' ? 'radio_button_checked' : 'radio_button_unchecked' }}
                  </span>
                </div>
                <p class="text-[11px] text-rose-800 font-medium leading-relaxed">
                  Muatan ditolak secara permanen. Proses bongkar diblokir dan kendaraan harus segera diarahkan keluar.
                </p>
              </div>
            </div>
          </div>

          <!-- Reason & Notes Form -->
          <div class="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <label class="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                Alasan Keputusan *
              </label>
              <select
                v-model="checklistDecisionReason"
                class="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold focus:outline-none focus:border-amber-500"
                id="select-checklist-decision-reason"
              >
                <option value="Disetujui PIC Gudang dengan Berita Acara Temuan Minor">Disetujui PIC Gudang dengan Berita Acara Temuan Minor</option>
                <option value="Disetujui Konsesi Toleransi Pihak Vendor / Supplier">Disetujui Konsesi Toleransi Pihak Vendor / Supplier</option>
                <option value="Ditolak karena Cacat Fisik / Resiko Kontaminasi Berat">Ditolak karena Cacat Fisik / Resiko Kontaminasi Berat</option>
                <option value="Ditolak karena Dokumen Tidak Lengkap / Tidak Sesuai">Ditolak karena Dokumen Tidak Lengkap / Tidak Sesuai</option>
                <option value="Lainnya">Lainnya (Tuliskan pada catatan)</option>
              </select>
            </div>

            <div>
              <label class="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                Catatan &amp; Justifikasi Keputusan (Wajib, min. 5 karakter) *
              </label>
              <textarea
                v-model="checklistDecisionNotes"
                rows="2"
                placeholder="Rincian justifikasi penerimaan atau penolakan muatan..."
                class="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-amber-500"
                id="input-checklist-decision-notes"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-5 py-3.5 bg-white border-t border-slate-100 flex items-center justify-end space-x-2">
          <button
            type="button"
            @click="handleCloseChecklistDecisionModal"
            class="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            @click="executeChecklistDecision"
            :disabled="isProcessing || !checklistDecisionReason || (checklistDecisionNotes || '').trim().length < 5"
            class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            :class="checklistDecisionAction === 'ACCEPT_WITH_NOTE' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'"
            id="btn-confirm-checklist-decision"
          >
            <span v-if="isProcessing" class="material-icons text-sm animate-spin">autorenew</span>
            <span v-else class="material-icons text-sm">{{ checklistDecisionAction === 'ACCEPT_WITH_NOTE' ? 'check' : 'close' }}</span>
            <span>{{ checklistDecisionAction === 'ACCEPT_WITH_NOTE' ? 'KONFIRMASI TERIMA DENGAN CATATAN' : 'KONFIRMASI TOLAK MUATAN' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Lightbox Photo Preview Modal -->
    <div
      v-if="previewPhotoModalUrl"
      class="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      @click="previewPhotoModalUrl = null"
    >
      <div class="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" @click.stop>
        <button @click="previewPhotoModalUrl = null" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 transition-colors z-10">
          <span class="material-icons text-lg">close</span>
        </button>
        <AuthenticatedImage
          :src="previewPhotoModalUrl"
          alt="Foto Bukti"
          img-class="max-w-full max-h-[80vh] object-contain rounded-xl mx-auto shadow-sm"
          wrapper-class="min-w-[280px] min-h-[220px]"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { formatPlantTime } from '../utils/displayTime'
import PageHeader from '../components/PageHeader.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import StepTimeline from '../components/StepTimeline.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import Pagination from '../components/Pagination.vue'
import { getStatusLabel } from '../utils/statusLabel'
import { useUnsavedWarning } from '../composables/useUnsavedWarning'
import api from '../services/api'

// Canonical GSP Pre-Unloading Checklist Items (SOP-GSP-2026.1 / GSP-PREUNLOAD-2026.1)
const GSP_PREUNLOAD_ITEMS = [
  { code: 'CLEAN_VEHICLE', label: 'Kendaraan bersih' },
  { code: 'DOOR_SEAL_GOOD', label: 'Seal pintu kendaraan baik' },
  {
    code: 'NO_EXPIRED_GAS_CYLINDER',
    label: 'Tidak ditemukan tabung gas yang sudah Exp date masa uji berlakunya',
  },
  { code: 'ITEMS_NEATLY_ARRANGED', label: 'Barang tertata rapi' },
  {
    code: 'NO_PEST_OR_ANIMAL_TRACE',
    label: 'Tidak ditemukan hama / binatang dan/atau jejak / bekas binatang',
  },
  {
    code: 'GOOD_CLEAN_SEALED',
    label: 'Barang baik dan bersih serta tersegel',
  },
  { code: 'COA_MATCHES_BATCH', label: 'CoA tersedia dan sesuai batchnya' },
  {
    code: 'QTY_TYPE_MATCHES_SJ',
    label: 'Jumlah dan jenis barang sesuai SJ',
  },
  {
    code: 'VEHICLE_NO_LEAK_GOOD',
    label: 'Kendaraan tidak bocor / kondisi baik',
  },
]

// Safety Helpers at the top
const getPlateNumber = (truck) => {
  if (!truck) return '-'
  return truck.plateNumber || truck.vehicle?.plateNumber || truck.licensePlate || '-'
}

const getVendor = (truck) => {
  if (!truck) return '-'
  return truck.vendorName || truck.vendor || truck.vehicle?.companyName || truck.companyName || truck.cargo?.supplierOrCustomer || '-'
}

const getProcessType = (truck) => {
  if (!truck) return '-'
  return truck.processType || truck.destination?.warehouseCode || truck.warehouseCode || truck.destination || '-'
}

const getStepLabel = (truck) => {
  if (!truck) return '-'
  let step = truck.step || truck.status || '-'
  const pType = getProcessType(truck)
  if ((pType === 'GBB' || pType === 'GSP') && String(step).startsWith('QC_VEHICLE')) {
    step = String(step).replace('QC_VEHICLE', 'QC_SAMPLING')
  }
  return String(step).replace(/_/g, ' ').toUpperCase()
}

const getEntryTimestamp = (truck) => {
  if (!truck) return null
  return truck.timestamps?.entry || truck.timestamps?.gateInAt || truck.gateInAt || truck.createdAt || null
}

const getWarehouseStart = (truck) => {
  if (!truck) return null
  return truck.timestamps?.warehouseStartAt || truck.timestamps?.warehouse_start || truck.warehouseStartAt || null
}

const getWarehouseEnd = (truck) => {
  if (!truck) return null
  return truck.timestamps?.warehouseEndAt || truck.timestamps?.warehouse_end || truck.warehouseEndAt || null
}

const router = useRouter()
const truckStore = useTruckStore()
const warehouseStore = useWarehouseStore()
const toast = useToast()
const { confirm } = useConfirm()

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[GSPProcess] Mount-time fetch failed, using store cache:', err.message)
  }
})

const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const suratJalanInput = ref('')
const poNumberInput = ref('')
const isProcessing = ref(false)

// Pre-Unloading Checklist and Decision Modal State
const showPreUnloadModal = ref(false)
const showChecklistDecisionModal = ref(false)
const previewPhotoModalUrl = ref(null)

const checklistDecisionAction = ref('ACCEPT_WITH_NOTE')
const checklistDecisionReason = ref('Disetujui PIC Gudang dengan Berita Acara Temuan Minor')
const checklistDecisionNotes = ref('')

const NON_CONCESSIBLE_CODES = [
  'NO_EXPIRED_GAS_CYLINDER',
  'NO_PEST_OR_ANIMAL_TRACE',
  'VEHICLE_NO_LEAK_GOOD',
  'DOOR_SEAL_GOOD',
  'COA_MATCHES_BATCH',
  'GOOD_CLEAN_SEALED',
  'QTY_TYPE_MATCHES_SJ',
]

const hasNonConcessibleChecklistDefect = computed(() => {
  for (const code of NON_CONCESSIBLE_CODES) {
    if (checklistAnswers[code]?.result === 'NOT_OK') return true
  }
  const whProc = selectedTruck.value?.warehouseProcesses?.[0]
  const items = whProc?.checklistItems?.items || []
  return items.some(i => (i.result === 'NOT_OK' || i.ok === false) && NON_CONCESSIBLE_CODES.includes(i.code))
})

const checklistAnswers = reactive({})
const initChecklist = () => {
  GSP_PREUNLOAD_ITEMS.forEach(item => {
    checklistAnswers[item.code] = {
      result: null, // 'OK' | 'NOT_OK' | null
      notes: '',
      photoUrl: null,
    }
  })
}
initChecklist()

const openChecklistModal = () => {
  showPreUnloadModal.value = true
}

const openChecklistDecisionModal = () => {
  if (hasNonConcessibleChecklistDefect.value) {
    checklistDecisionAction.value = 'REJECT'
    checklistDecisionReason.value = 'Ditolak karena Cacat Fisik / Resiko Kontaminasi Berat'
  } else {
    checklistDecisionAction.value = 'ACCEPT_WITH_NOTE'
    checklistDecisionReason.value = 'Disetujui PIC Gudang dengan Berita Acara Temuan Minor'
  }
  checklistDecisionNotes.value = ''
  showChecklistDecisionModal.value = true
}

const isFormDirty = computed(() => {
  if (showPreUnloadModal.value) {
    return Object.values(checklistAnswers).some(a => a.result !== null || (a.notes && a.notes.length > 0))
  }
  if (showChecklistDecisionModal.value) {
    return (checklistDecisionNotes.value || '').trim().length > 0
  }
  return false
})

useUnsavedWarning(isFormDirty)

const handleClosePreUnloadModal = () => {
  if (isFormDirty.value) {
    if (!window.confirm('Pemeriksaan checklist belum disimpan. Apakah Anda yakin ingin menutup formulir?')) {
      return
    }
  }
  showPreUnloadModal.value = false
}

const handleCloseChecklistDecisionModal = () => {
  if (isFormDirty.value) {
    if (!window.confirm('Keputusan checklist belum disimpan. Apakah Anda yakin ingin menutup formulir?')) {
      return
    }
  }
  showChecklistDecisionModal.value = false
}

const triggerPhotoUpload = (code) => {
  const el = document.getElementById(`file-chk-${code}`)
  if (el) el.click()
}

const onPhotoFileChange = (code, event) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.error('Ukuran foto maksimal 5 MB')
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    if (checklistAnswers[code]) {
      checklistAnswers[code].photoUrl = e.target.result
    }
  }
  reader.readAsDataURL(file)
}

const removePhoto = (code) => {
  if (checklistAnswers[code]) {
    checklistAnswers[code].photoUrl = null
  }
  const el = document.getElementById(`file-chk-${code}`)
  if (el) el.value = ''
}

const setChecklistResult = (code, result) => {
  if (checklistAnswers[code]) {
    checklistAnswers[code].result = result
  }
}

const answeredCount = computed(() => {
  return GSP_PREUNLOAD_ITEMS.filter(item => checklistAnswers[item.code]?.result !== null).length
})

const isChecklistComplete = computed(() => {
  return answeredCount.value === GSP_PREUNLOAD_ITEMS.length
})

const isChecklistAllOk = computed(() => {
  if (!isChecklistComplete.value) return false
  return GSP_PREUNLOAD_ITEMS.every(item => checklistAnswers[item.code]?.result === 'OK')
})

const isChecklistAnyNotOk = computed(() => {
  return GSP_PREUNLOAD_ITEMS.some(item => checklistAnswers[item.code]?.result === 'NOT_OK')
})

const notOkItemsList = computed(() => {
  return GSP_PREUNLOAD_ITEMS.filter(item => checklistAnswers[item.code]?.result === 'NOT_OK').map(item => ({
    code: item.code,
    label: item.label,
    notes: checklistAnswers[item.code]?.notes,
    photoUrl: checklistAnswers[item.code]?.photoUrl,
  }))
})

const isChecklistValidToSubmit = computed(() => {
  if (!isChecklistComplete.value) return false
  if (isChecklistAllOk.value) return true
  for (const item of GSP_PREUNLOAD_ITEMS) {
    const ans = checklistAnswers[item.code]
    if (ans.result === 'NOT_OK') {
      if (!ans.notes || !ans.notes.trim()) return false
      if (!ans.photoUrl || !ans.photoUrl.trim()) return false
    }
  }
  return true
})

const checklistValidationWarning = computed(() => {
  if (!isChecklistComplete.value) {
    return 'Lengkapi seluruh 9 butir pemeriksaan pra-bongkar sebelum melanjutkan.'
  }
  for (const item of GSP_PREUNLOAD_ITEMS) {
    const ans = checklistAnswers[item.code]
    if (ans.result === 'NOT_OK') {
      if (!ans.notes || !ans.notes.trim()) {
        return `Catatan temuan wajib diisi untuk butir NOT OK (${item.label}).`
      }
      if (!ans.photoUrl || !ans.photoUrl.trim()) {
        return `Foto bukti wajib dilampirkan untuk butir NOT OK (${item.label}).`
      }
    }
  }
  return null
})

// Receiving Quantity Input state
const receivedQuantityInput = ref('')

const quantityValidationMessage = computed(() => {
  const val = (receivedQuantityInput.value || '').trim()
  if (!val) return null
  if (val.includes(',')) return 'Gunakan titik (.) untuk desimal, bukan tanda koma (,).'
  if (val.toLowerCase().includes('e')) return 'Notasi eksponensial (scientific) tidak diizinkan.'
  if (!/^\d+(\.\d{1,3})?$/.test(val)) {
    if (val.includes('.') && val.split('.')[1].length > 3) {
      return 'Maksimal 3 angka di belakang koma (contoh: 8000.250).'
    }
    return 'Format angka tidak valid. Gunakan angka positif maksimal 3 desimal.'
  }
  const num = Number(val)
  if (num <= 0) return 'Jumlah diterima harus lebih besar dari 0.'
  if (num > 999999999.999) return 'Jumlah melebihi batas maksimum penerimaan.'
  return null
})

const isQuantityValid = computed(() => {
  const val = (receivedQuantityInput.value || '').trim()
  if (!val) return false
  return quantityValidationMessage.value === null
})

const gspTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PASSED' || t.status === 'PA_NOT_REQUIRED' || t.status === 'WAREHOUSE_IN_PROGRESS' || t.status === 'WAITING_GSP_DISPOSITION' || t.status === 'WAITING_UTILITY_DISPOSITION' || t.status === 'WAITING_GSP_CHECKLIST_DISPOSITION') && getProcessType(t) === 'GSP'))
const filteredGspTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  if (!keyword) return gspTrucks.value
  return gspTrucks.value.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
})
const totalPages = computed(() => Math.ceil(filteredGspTrucks.value.length / 10) || 1)
const paginatedGspTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredGspTrucks.value.slice(start, end)
})

watch(filteredGspTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })

// GSP Chemical Quality Disposition State
const activePaData = ref(null)
const showAcceptWithNoteForm = ref(false)
const dispositionNoteInput = ref('')

const fetchActivePaData = async (truckId) => {
  if (!truckId) return
  try {
    const res = await api.get(`/qc/product-analysis/${truckId}`)
    const analyses = res.data?.data || []
    if (analyses.length > 0) {
      analyses.sort((a, b) => (b.testRound || 1) - (a.testRound || 1))
      activePaData.value = analyses[0]
    } else {
      activePaData.value = null
    }
  } catch (err) {
    console.warn('[GSPProcess] Failed to fetch PA data for disposition:', err)
    activePaData.value = null
  }
}

const activePaRound = computed(() => {
  return activePaData.value?.testRound || selectedTruck.value?.testRound || 1
})

const isMaxRetestReached = computed(() => {
  return activePaRound.value >= 2
})

const hasCriticalDefect = computed(() => {
  if (!activePaData.value?.parameters?.sensory) return false
  const sensory = activePaData.value.parameters.sensory
  const isForeignOk = sensory.foreignMatters === 'Tidak ada kontaminasi'
  const isPkgOk = sensory.packagingLabel === 'Kemasan & label tidak rusak'
  return !isForeignOk || !isPkgOk
})

const isDispositionNoteValid = computed(() => {
  return (dispositionNoteInput.value || '').trim().length >= 5
})

const executeDisposition = async (action, reason) => {
  if (!selectedTruck.value || isProcessing.value) return
  isProcessing.value = true
  try {
    const finalReason = reason || dispositionNoteInput.value
    await api.post(`/qc/product-analysis/${selectedTruck.value.id}/disposition`, {
      action,
      reason: finalReason,
      revision: selectedTruck.value.revision,
    })
    toast.success(`Disposisi Gudang GSP berhasil dicatat (${action})`)
    showAcceptWithNoteForm.value = false
    dispositionNoteInput.value = ''
    await truckStore.fetchTrucks()
    const targetId = selectedTruck.value.id
    const updated = truckStore.trucks.find(t => String(t.id) === String(targetId))
    if (updated) {
      selectTruck(updated)
    } else {
      selectedTruck.value = null
    }
  } catch (err) {
    toast.error(err.response?.data?.message || 'Gagal mencatat disposisi mutu')
  } finally {
    isProcessing.value = false
  }
}

const promptRetest = async () => {
  const confirmed = await confirm({
    title: 'Minta Uji Ulang (Retest)',
    message: 'Ajukan permintaan uji ulang (retest) sampel ke QC? Ronde baru (Ronde 2) akan dijadwalkan.',
    confirmText: 'Minta Retest',
    confirmClass: 'btn-primary',
  })
  if (confirmed) {
    await executeDisposition('REQUEST_RETEST', 'Permintaan uji ulang sampel oleh Gudang GSP')
  }
}

const promptReject = async () => {
  const confirmed = await confirm({
    title: 'Tolak Muatan Kimia',
    message: 'Apakah Anda yakin ingin MENOLAK muatan ini secara permanen? Izin bongkar di gudang GSP akan diblokir.',
    confirmText: 'Tolak Muatan',
    confirmClass: 'btn-danger',
  })
  if (confirmed) {
    await executeDisposition('REJECT', 'Ditolak oleh Gudang GSP karena ketidaksesuaian mutu OOS')
  }
}

const selectTruck = (truck) => { 
  selectedTruck.value = truck 
  suratJalanInput.value = truck.suratJalanNumber || ''
  poNumberInput.value = truck.poNumber || ''
  receivedQuantityInput.value = ''
  showAcceptWithNoteForm.value = false
  dispositionNoteInput.value = ''
  initChecklist()
  if (truck?.status === 'WAITING_GSP_DISPOSITION' || truck?.status === 'WAITING_UTILITY_DISPOSITION') {
    fetchActivePaData(truck.id)
  } else {
    activePaData.value = null
  }
}
const formatTime = formatPlantTime

const saveSecurityInfo = async () => {
  if (!suratJalanInput.value || !poNumberInput.value) {
    toast.warning('Harap lengkapi nomor Surat Jalan dan PO')
    return
  }
  if (isProcessing.value) return
  isProcessing.value = true
  try {
    const sj = suratJalanInput.value.toUpperCase()
    const po = poNumberInput.value.toUpperCase()
    
    // Explicitly update local state for immediate UI reflection
    if (selectedTruck.value) {
      selectedTruck.value.suratJalanNumber = sj
      selectedTruck.value.poNumber = po
    }
    toast.info('Data Surat Jalan & PO telah disiapkan di form; akan disimpan permanen saat verifikasi pra-bongkar diajukan.')
  } catch (err) {
    toast.error('Gagal menyimpan data Surat Jalan & PO')
  } finally {
    isProcessing.value = false
  }
}

const buildChecklistPayload = () => {
  return GSP_PREUNLOAD_ITEMS.map(item => ({
    code: item.code,
    result: checklistAnswers[item.code].result,
    notes: checklistAnswers[item.code].notes?.trim() || undefined,
    photoUrl: checklistAnswers[item.code].photoUrl || undefined,
  }))
}

const submitAllOkChecklist = async () => {
  if (!selectedTruck.value || isProcessing.value || !isChecklistAllOk.value) return
  isProcessing.value = true
  try {
    const sj = (selectedTruck.value.suratJalanNumber || suratJalanInput.value || '').toUpperCase()
    const po = (selectedTruck.value.poNumber || poNumberInput.value || '').toUpperCase()
    const payload = {
      suratJalanNumber: sj,
      poNumber: po,
      preUnloadChecklist: {
        items: buildChecklistPayload(),
      },
    }

    const response = await warehouseStore.startProcess(selectedTruck.value.id, payload)
    const updatedTruck = response?.data || response
    if (updatedTruck) {
      truckStore.upsertTruck(updatedTruck)
      selectedTruck.value = { ...selectedTruck.value, ...updatedTruck }
    }
    showPreUnloadModal.value = false
    toast.success('Pemeriksaan pra-bongkar 9/9 OK. Proses bongkar GSP dimulai.')
  } catch (err) {
    toast.error(err?.response?.data?.message || err?.message || 'Gagal memulai proses bongkar GSP')
  } finally {
    isProcessing.value = false
  }
}

const submitNotOkChecklist = async () => {
  if (!selectedTruck.value || isProcessing.value || !isChecklistAnyNotOk.value) return
  isProcessing.value = true
  try {
    const sj = (selectedTruck.value.suratJalanNumber || suratJalanInput.value || '').toUpperCase()
    const po = (selectedTruck.value.poNumber || poNumberInput.value || '').toUpperCase()
    const payload = {
      suratJalanNumber: sj,
      poNumber: po,
      process: 'submit_checklist_for_decision',
      preUnloadChecklist: {
        items: buildChecklistPayload(),
      },
    }

    const response = await warehouseStore.startProcess(selectedTruck.value.id, payload)
    const updatedTruck = response?.data || response
    if (updatedTruck) {
      truckStore.upsertTruck(updatedTruck)
      selectedTruck.value = { ...selectedTruck.value, ...updatedTruck }
    }
    showPreUnloadModal.value = false
    toast.warning('Hasil checklist tersimpan dengan temuan NOT OK. Masuk ke tahap Keputusan Penerimaan GSP.')
    openChecklistDecisionModal()
  } catch (err) {
    const backendErrors = err?.response?.data?.errors || []
    if (backendErrors.includes('PREUNLOAD_CHECKLIST_ITEMS_NOT_OK')) {
      toast.warning('Hasil NOT_OK tercatat, bongkar ditahan: temuan ketidaksesuaian tersimpan pada sistem.')
      showPreUnloadModal.value = false
      openChecklistDecisionModal()
    } else {
      toast.error(
        err?.response?.data?.message ||
        'Gagal mencatat audit checklist: silakan periksa kelengkapan catatan dan foto bukti.'
      )
    }
  } finally {
    isProcessing.value = false
  }
}

const handleStartUnload = async () => {
  await submitAllOkChecklist()
}

const handleSaveFailedChecklist = async () => {
  await submitNotOkChecklist()
}

const executeChecklistDecision = async () => {
  if (!selectedTruck.value || isProcessing.value || !checklistDecisionReason.value) return
  isProcessing.value = true
  try {
    const payload = {
      action: checklistDecisionAction.value,
      reason: checklistDecisionReason.value.trim(),
      remarks: checklistDecisionNotes.value?.trim() || undefined,
      revision: selectedTruck.value.revision,
    }

    const res = await warehouseStore.submitChecklistDisposition(selectedTruck.value.id, payload)
    const updated = res?.data || res
    if (updated) {
      truckStore.upsertTruck(updated)
      selectedTruck.value = { ...selectedTruck.value, ...updated }
    }
    showChecklistDecisionModal.value = false
    if (payload.action === 'ACCEPT_WITH_NOTE') {
      toast.success('Keputusan Terima dengan Catatan (Konsesi) berhasil dicatat. Proses bongkar diizinkan.')
    } else {
      toast.warning('Muatan ditolak berdasarkan keputusan pemeriksaan pra-bongkar.')
    }
    await truckStore.fetchTrucks()
  } catch (err) {
    toast.error(err?.response?.data?.message || err?.message || 'Gagal menyimpan keputusan penerimaan GSP')
  } finally {
    isProcessing.value = false
  }
}

const handleCompleteReceiving = async () => {
  if (!selectedTruck.value || isProcessing.value || !isQuantityValid.value) return
  if (!selectedTruck.value.receiptUnit) {
    toast.error('Satuan penerimaan belum terkonfigurasi. Penerimaan ditahan.')
    return
  }

  const qty = receivedQuantityInput.value.trim()
  const unit = selectedTruck.value.receiptUnit

  const ok = await confirm({
    title: 'Konfirmasi Penerimaan Material',
    message: `Selesaikan penerimaan kuantitas: ${qty} ${unit} untuk kendaraan ${getPlateNumber(selectedTruck.value)}?`,
    type: 'success',
    confirmText: 'Ya, Selesaikan',
  })

  if (ok) {
    isProcessing.value = true
    try {
      const response = await warehouseStore.completeProcess(selectedTruck.value.id, {
        receivedQuantity: qty,
        receivedUnit: unit,
      })
      const updatedTruck = response?.data || response
      if (updatedTruck) truckStore.upsertTruck(updatedTruck)
      toast.success(`Penerimaan material ${qty} ${unit} berhasil dicatat.`)
      selectedTruck.value = null
      receivedQuantityInput.value = ''
      await truckStore.fetchTrucks()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Gagal menyelesaikan penerimaan GSP')
    } finally {
      isProcessing.value = false
    }
  }
}
</script>
