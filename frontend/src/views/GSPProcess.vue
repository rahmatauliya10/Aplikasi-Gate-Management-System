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
                <span class="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
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

              <!-- Canonical 9-Point Pre-Unloading Checklist Panel -->
              <div
                v-if="(selectedTruck.status === 'QC_VEHICLE_PASSED' || selectedTruck.status === 'PA_NOT_REQUIRED') && selectedTruck.suratJalanNumber && selectedTruck.poNumber"
                class="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm"
                id="card-preunload-checklist"
              >
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-emerald-600 text-xl">fact_check</span>
                    <div>
                      <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Pemeriksaan Pra-Bongkar (Pre-Unloading)</h4>
                      <p class="text-[10px] text-slate-500 font-medium">Versi Standar: GSP-PREUNLOAD-2026.1 (9 Poin Wajib)</p>
                    </div>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" :class="isChecklistComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">
                    {{ answeredCount }}/9 Terjawab
                  </span>
                </div>

                <!-- 9 Items List -->
                <div class="space-y-3">
                  <div
                    v-for="(item, idx) in GSP_PREUNLOAD_ITEMS"
                    :key="item.code"
                    class="p-3 rounded-xl border transition-all text-xs"
                    :class="checklistAnswers[item.code].result === 'OK' ? 'bg-emerald-50/40 border-emerald-200' : (checklistAnswers[item.code].result === 'NOT_OK' ? 'bg-rose-50/50 border-rose-200' : 'bg-slate-50/50 border-slate-200')"
                  >
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div class="flex items-start space-x-2 flex-1">
                        <span class="font-bold text-slate-400 text-[11px] mt-0.5">{{ idx + 1 }}.</span>
                        <div>
                          <p class="font-bold text-slate-800 leading-snug">{{ item.label }}</p>
                          <span class="font-mono text-[9px] text-slate-400">{{ item.code }}</span>
                        </div>
                      </div>

                      <!-- Action Radios -->
                      <div class="flex items-center space-x-2">
                        <button
                          type="button"
                          @click="setChecklistResult(item.code, 'OK')"
                          class="px-3 py-1 rounded-lg font-black text-xs transition-all flex items-center gap-1"
                          :class="checklistAnswers[item.code].result === 'OK' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'"
                          :id="`btn-chk-${item.code}-ok`"
                        >
                          <span class="material-icons text-sm">check</span>
                          OK
                        </button>

                        <button
                          type="button"
                          @click="setChecklistResult(item.code, 'NOT_OK')"
                          class="px-3 py-1 rounded-lg font-black text-xs transition-all flex items-center gap-1"
                          :class="checklistAnswers[item.code].result === 'NOT_OK' ? 'bg-rose-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'"
                          :id="`btn-chk-${item.code}-notok`"
                        >
                          <span class="material-icons text-sm">close</span>
                          NOT OK
                        </button>
                      </div>
                    </div>

                    <!-- Notes input if NOT_OK or optional -->
                    <div v-if="checklistAnswers[item.code].result === 'NOT_OK'" class="mt-2 pt-2 border-t border-rose-100">
                      <input
                        type="text"
                        v-model="checklistAnswers[item.code].notes"
                        placeholder="Keterangan temuan ketidaksesuaian..."
                        class="w-full h-8 px-2.5 text-xs bg-white rounded-lg border border-rose-200 focus:outline-none focus:border-rose-400 text-rose-800 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <!-- Dual Action Buttons -->
                <div class="pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <!-- ALL 9 OK: MULAI BONGKAR -->
                  <button
                    v-if="isChecklistAllOk"
                    type="button"
                    @click="handleStartUnload"
                    :disabled="isProcessing || !isChecklistComplete"
                    class="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2"
                    id="btn-start-unload"
                  >
                    <span v-if="isProcessing" class="material-icons text-base animate-spin">autorenew</span>
                    <span v-else class="material-icons text-base">play_arrow</span>
                    <span>MULAI BONGKAR (START UNLOAD)</span>
                  </button>

                  <!-- ANY NOT_OK: SIMPAN HASIL PEMERIKSAAN -->
                  <button
                    v-if="isChecklistAnyNotOk"
                    type="button"
                    @click="handleSaveFailedChecklist"
                    :disabled="isProcessing || !isChecklistComplete"
                    class="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md transition-all flex items-center justify-center gap-2"
                    id="btn-save-checklist-fail"
                  >
                    <span v-if="isProcessing" class="material-icons text-base animate-spin">autorenew</span>
                    <span v-else class="material-icons text-base">warning</span>
                    <span>SIMPAN HASIL PEMERIKSAAN (BONGKAR DITAHAN)</span>
                  </button>

                  <!-- Incomplete message -->
                  <p v-if="!isChecklistComplete" class="text-center text-xs font-bold text-amber-600 py-2">
                    Lengkapi seluruh 9 poin pemeriksaan pra-bongkar sebelum melanjutkan.
                  </p>
                </div>
              </div>

              <!-- Waiting for QC / PA Analysis Notice -->
              <div v-if="['QC_VEHICLE_PENDING', 'QC_RETEST_REQUIRED', 'WAITING_UTILITY_DISPOSITION'].includes(selectedTruck.status)" class="space-y-3 p-5 rounded-2xl bg-amber-50/80 border border-amber-200">
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

              <!-- Material-Specific GSP Receiving Card (Decimal Safe) -->
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
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Arrival Time</div>
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
import Pagination from '../components/Pagination.vue'
import { getStatusLabel } from '../utils/statusLabel'

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

// Pre-Unloading Checklist state
const checklistAnswers = reactive({})
const initChecklist = () => {
  GSP_PREUNLOAD_ITEMS.forEach(item => {
    checklistAnswers[item.code] = {
      result: null, // 'OK' | 'NOT_OK' | null
      notes: '',
    }
  })
}
initChecklist()

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

const gspTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PASSED' || t.status === 'PA_NOT_REQUIRED' || t.status === 'WAREHOUSE_IN_PROGRESS') && getProcessType(t) === 'GSP'))
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

const selectTruck = (truck) => { 
  selectedTruck.value = truck 
  suratJalanInput.value = truck.suratJalanNumber || ''
  poNumberInput.value = truck.poNumber || ''
  receivedQuantityInput.value = ''
  initChecklist()
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
  }))
}

const handleStartUnload = async () => {
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
    toast.success('Pemeriksaan pra-bongkar 9/9 OK. Proses bongkar GSP dimulai.')
  } catch (err) {
    toast.error(err?.response?.data?.message || err?.message || 'Gagal memulai proses bongkar GSP')
  } finally {
    isProcessing.value = false
  }
}

const handleSaveFailedChecklist = async () => {
  if (!selectedTruck.value || isProcessing.value || !isChecklistAnyNotOk.value) return
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

    await warehouseStore.startProcess(selectedTruck.value.id, payload)
    toast.warning('Hasil pemeriksaan tercatat. Proses bongkar DITAHAN.')
  } catch (err) {
    const backendErrors = err?.response?.data?.errors || []
    if (backendErrors.includes('PREUNLOAD_CHECKLIST_ITEMS_NOT_OK')) {
      // Proved that backend validated 9 items, recorded ActivityLog GSP_PREUNLOAD_CHECKLIST_FAILED, and blocked start
      toast.warning('Hasil NOT_OK tercatat, bongkar ditahan: temuan ketidaksesuaian tersimpan pada sistem.')
    } else {
      // Any other error (network failure, 500, invalid structure, etc.) - DO NOT fake audit success!
      toast.error(
        err?.response?.data?.message ||
        'Gagal mencatat audit checklist: silakan periksa koneksi atau kelengkapan data.'
      )
    }
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
