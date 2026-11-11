<template>
  <div class="space-y-6">
    <PageHeader title="Rekap Transaksi &amp; Analisa Operasional" subtitle="Gate-to-Gate Operations Intelligence &amp; Scale Audit" :showBadge="false">
      <div class="flex items-center space-x-3">
        <!-- Bulk PDF Download Button -->
        <button @click="downloadBulkPDF" :disabled="selectedTruckIds.length === 0" class="px-5 py-2.5 text-xs rounded-xl font-black flex items-center space-x-1.5 transition-all shadow-sm duration-300"
          :class="selectedTruckIds.length > 0 ? 'bg-rose-600 text-white hover:bg-rose-700 hover:scale-[1.02] cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'">
          <span class="material-icons text-base">picture_as_pdf</span>
          <span>PDF SELECTED ({{ selectedTruckIds.length }})</span>
        </button>

        <!-- Excel Export Button -->
        <button @click="exportExcel" class="px-5 py-2.5 text-xs rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all font-black flex items-center space-x-1.5 shadow-sm duration-300">
          <span class="material-icons text-base text-emerald-600">table_view</span>
          <span>EXPORT EXCEL</span>
        </button>

        <!-- CSV Export Button -->
        <button @click="exportData" class="px-5 py-2.5 text-xs rounded-xl bg-[#4A8BDF] text-white hover:bg-[#3B72C4] font-black flex items-center space-x-1.5 shadow-sm hover:shadow-md transition-all duration-300">
          <span class="material-icons text-base">download</span>
          <span>EXPORT CSV</span>
        </button>
      </div>
    </PageHeader>

    <!-- ═══ EXECUTIVE SUMMARY ANALYTICS PANEL ═══ -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fadeInUp">
      <!-- Stat 1: Avg TAT -->
      <div class="ind-card p-5 cursor-default relative overflow-hidden bg-white border border-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.03)] group hover:scale-[1.02] transition-all duration-300" style="border-top:4px solid #4A8BDF">
        <div class="absolute -right-3 -top-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500 text-slate-900">
          <span class="material-icons text-7xl">timer</span>
        </div>
        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Avg Turnaround Time</p>
        <div class="flex items-baseline mt-2.5 space-x-1.5">
          <span class="text-3xl font-black text-slate-900 font-mono tracking-tight">{{ avgTAT }}</span>
          <span class="text-xs font-black text-slate-500 uppercase">minutes</span>
        </div>
        <p class="mt-3 text-[10px] font-bold text-slate-500">SLA belum ditetapkan</p>
        <p class="mt-2 text-[10px] text-slate-500">Ringkasan durasi tercatat; bukan indikator kepatuhan SLA.</p>
      </div>

      <!-- Stat 2: Active Bottleneck -->
      <div class="ind-card p-5 cursor-default relative overflow-hidden bg-white border border-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.03)] group hover:scale-[1.02] transition-all duration-300" style="border-top:4px solid #A0006D">
        <div class="absolute -right-3 -top-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500 text-slate-900">
          <span class="material-icons text-7xl">hourglass_empty</span>
        </div>
        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Primary Bottleneck Area</p>
        <p class="text-lg font-black text-slate-900 mt-3 truncate">{{ majorBottleneck }}</p>
        <p class="mt-3 text-[10px] text-slate-500">Tahap terlama berdasarkan durasi tercatat; bukan pelanggaran SLA.</p>
      </div>

      <!-- Stat 3: Tonnage Reconciled -->
      <div class="ind-card p-5 cursor-default relative overflow-hidden bg-white border border-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.03)] group hover:scale-[1.02] transition-all duration-300" style="border-top:4px solid #10B981">
        <div class="absolute -right-3 -top-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500 text-slate-900">
          <span class="material-icons text-7xl">scale</span>
        </div>
        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Net Weight Recorded</p>
        <div class="flex items-baseline mt-2.5 space-x-1.5">
          <span class="text-3xl font-black text-slate-900 font-mono tracking-tight">{{ totalTonnage }}</span>
          <span class="text-xs font-black text-slate-500 uppercase">metric tons</span>
        </div>
        <p class="mt-3 text-[10px] text-slate-500">Berat net tercatat sesuai filter, bukan bukti volume bongkar atau kalibrasi.</p>
      </div>

      <!-- Stat 4: Security Integrity Check -->
      <div class="ind-card p-5 cursor-default relative overflow-hidden bg-white border border-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.03)] group hover:scale-[1.02] transition-all duration-300" style="border-top:4px solid #EF4444">
        <div class="absolute -right-3 -top-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500 text-slate-900">
          <span class="material-icons text-7xl">gavel</span>
        </div>
        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Weight Deviation Anomalies</p>
        <div class="flex items-baseline mt-2.5 space-x-1.5">
          <span class="text-3xl font-black font-mono tracking-tight" :class="anomalyCount > 0 ? 'text-red-600 animate-pulse' : 'text-slate-900'">{{ anomalyCount }}</span>
          <span class="text-xs font-black text-slate-500 uppercase">flagged cases</span>
        </div>
        <div class="mt-3 flex items-center space-x-1.5">
          <span class="w-1.5 h-1.5 rounded-full" :class="anomalyCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'"></span>
          <span class="text-[9.5px] font-black uppercase tracking-wider" :class="anomalyCount > 0 ? 'text-red-600' : 'text-emerald-600'">
            {{ anomalyCount > 0 ? 'Critical discrepancies detected' : 'All loads within safe thresholds' }}
          </span>
        </div>
        <!-- Integrity balance visual scale -->
        <div class="w-full h-8 mt-2 flex items-center justify-center relative">
          <div class="w-16 h-0.5 bg-slate-300"></div>
          <div class="absolute w-2 h-2 rounded-full bg-slate-400 -top-0.5"></div>
          <div class="absolute left-3 w-4 h-4 rounded-full border border-slate-400 bg-white flex items-center justify-center scale-75 rotate-12 transition-transform duration-500">
            <span class="material-icons text-[10px] text-slate-500">scale</span>
          </div>
          <div class="absolute right-3 w-4 h-4 rounded-full border border-slate-400 bg-white flex items-center justify-center scale-75 -rotate-12 transition-transform duration-500">
            <span class="material-icons text-[10px] text-slate-500">scale</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ FILTER CONTROL HUB ═══ -->
    <div class="bg-white border border-slate-200/80 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4 animate-fadeInUp">
      <!-- ROW 1: Search + Date Presets + Mode Toggle -->
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1 max-w-md">
          <input v-model="searchQuery" type="text" placeholder="Cari No. Plat, Nama Supir, atau Vendor..." 
            class="w-full h-11 pl-11 pr-10 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all">
          <span class="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            <span class="material-icons text-base">close</span>
          </button>
        </div>

        <!-- Date Range Quick Presets -->
        <div class="flex items-center space-x-1 p-1 rounded-2xl bg-slate-100/90 border border-slate-200/50 shadow-inner">
          <button v-for="p in [{ key: 'ALL', label: 'SEMUA' }, { key: 'TODAY', label: 'HARI INI' }, { key: 'THIS_WEEK', label: 'MINGGU INI' }, { key: 'THIS_MONTH', label: 'BULAN INI' }]" :key="p.key"
                  @click="applyDatePreset(p.key)"
                  :class="datePreset === p.key ? 'bg-white shadow-xs text-[#4A8BDF] font-black rounded-xl border-b-2 border-[#4A8BDF]' : 'text-slate-500 hover:text-slate-800 font-bold'"
                  class="px-4 py-2 text-[11px] tracking-wider transition-all duration-200">
            {{ p.label }}
          </button>
        </div>

        <!-- Mode Toggle -->
        <div class="flex items-center space-x-1 p-1 rounded-2xl bg-slate-100/90 border border-slate-200/50 shadow-inner shrink-0">
          <button @click="currentMode = 'time'" :class="currentMode === 'time' ? 'bg-white shadow-xs text-[#4A8BDF] font-black rounded-xl' : 'text-slate-500 hover:text-slate-800 font-bold'" class="px-4 py-2 text-[11px] tracking-wider transition-all duration-200 flex items-center">
            <span class="material-icons text-sm mr-1.5 text-[#4A8BDF]">schedule</span> TIMELINE
          </button>
          <button @click="currentMode = 'fraud'" :class="currentMode === 'fraud' ? 'bg-white shadow-xs text-rose-600 font-black rounded-xl' : 'text-slate-500 hover:text-slate-800 font-bold'" class="px-4 py-2 text-[11px] tracking-wider transition-all duration-200 flex items-center">
            <span class="material-icons text-sm mr-1.5 text-rose-500">policy</span> SCALE AUDIT
          </button>
        </div>
      </div>

      <div class="w-full h-px bg-slate-100"></div>

      <!-- ROW 2: Custom Date Range Picker -->
      <div class="flex items-center space-x-3">
        <span class="material-icons text-[#4A8BDF] text-xl">event</span>
        <span class="text-xs font-black text-slate-500 uppercase tracking-widest">PERIODE:</span>
        
        <div class="relative">
          <input type="date" v-model="startDate" @change="datePreset = 'CUSTOM'" class="h-11 px-4 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] cursor-pointer" title="Tanggal Mulai" />
        </div>
        <span class="text-xs font-bold text-slate-400">s/d</span>
        <div class="relative">
          <input type="date" v-model="endDate" @change="datePreset = 'CUSTOM'" class="h-11 px-4 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] cursor-pointer" title="Tanggal Akhir" />
        </div>
        <button v-if="startDate || endDate" @click="applyDatePreset('ALL')" class="text-rose-500 hover:bg-rose-50 rounded-xl px-2.5 py-1 text-xs font-black transition-colors" title="Reset Tanggal">
          ✕ Reset
        </button>
      </div>

      <!-- ROW 3: Operational Filter Cards + Sort Selector -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <!-- 1. Status Filter -->
        <div class="relative">
          <span class="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">format_list_bulleted</span>
          <select v-model="statusFilter" class="w-full h-11 pl-10 pr-8 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] transition-all cursor-pointer">
            <option value="ALL">Semua Status</option>
            <option value="COMPLETED">Completed Only</option>
            <option value="CANCELLED">Cancelled / Voided</option>
            <option value="ACTIVE">Active &amp; Reopened</option>
          </select>
        </div>

        <!-- 2. Hub Filter -->
        <div class="relative">
          <span class="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">hub</span>
          <select v-model="destinationFilter" class="w-full h-11 pl-10 pr-8 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] transition-all cursor-pointer">
            <option value="ALL">Semua Hub (GBB/GBJ/GSP)</option>
            <option value="GBB">GBB (Raw Materials)</option>
            <option value="GBJ">GBJ (Finished Goods)</option>
            <option value="GSP">GSP (Spareparts)</option>
          </select>
        </div>

        <!-- 3. Bottleneck Filter -->
        <div class="relative">
          <span class="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">filter_alt</span>
          <select v-model="bottleneckFilter" class="w-full h-11 pl-10 pr-8 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] transition-all cursor-pointer">
            <option value="ALL">Semua Bottleneck</option>
            <option value="waitingIn">Tahap terlama: Weigh In</option>
            <option value="warehouse">Tahap terlama: Warehouse</option>
            <option value="qc">Tahap terlama: Quality Control</option>
            <option value="waitingOut">Tahap terlama: Weigh Out</option>
          </select>
        </div>

        <!-- 4. Integrity Filter -->
        <div class="relative">
          <span class="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">extension</span>
          <select v-model="integrityFilter" class="w-full h-11 pl-10 pr-8 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#EF4444] transition-all cursor-pointer">
            <option value="ALL">Semua Integrasi</option>
            <option value="SAFE">SAFE (Sesuai)</option>
            <option value="WARNING">WARNING (Penyusutan)</option>
            <option value="CRITICAL">CRITICAL (Investigasi)</option>
          </select>
        </div>

        <!-- 5. Sort Selector -->
        <div class="relative">
          <span class="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">schedule</span>
          <select v-model="sortBy" class="w-full h-11 pl-10 pr-8 bg-white border border-slate-200 shadow-xs rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] transition-all cursor-pointer">
            <option value="gateInDesc">Datang Terbaru</option>
            <option value="gateInAsc">Datang Terawal (Pertama)</option>
            <option value="tatDesc">TAT Terlama</option>
            <option value="deviationDesc">Deviasi Terbesar</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ═══ HISTORY DATA GRID ═══ -->
    <div class="ind-container overflow-hidden bg-slate-50 bg-opacity-60 backdrop-blur-xl border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.04)] relative">
      <!-- Glossy grid overlay -->
      <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/30 pointer-events-none"></div>

      <div class="overflow-x-auto p-4 relative z-10 w-full custom-scrollbar">
        <table class="w-full border-separate relative z-10 min-w-[1180px]" style="border-spacing: 0 8px;">
          <thead>
            <tr class="text-[9.5px] font-black text-slate-500 uppercase tracking-widest bg-slate-100/70 border-b border-slate-200/80 rounded-xl">
              <th class="px-4 py-3 text-center w-[44px] min-w-[44px]">
                <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="accent-[#4A8BDF] rounded cursor-pointer w-4 h-4" />
              </th>
              <th class="px-4 py-3 text-left w-[260px] min-w-[260px]">Vehicle ID</th>
              <template v-if="currentMode === 'time'">
                <th class="px-4 py-3 text-left text-[#4A8BDF] w-[130px] min-w-[130px]">
                  <div class="flex items-center space-x-1">
                    <span class="material-icons text-xs">event</span>
                    <span>Kedatangan</span>
                  </div>
                </th>
                <th class="px-4 py-3 text-left w-[100px] min-w-[100px]">Timb. In</th>
                <th class="px-4 py-3 text-left w-[100px] min-w-[100px]">Warehouse</th>
                <th class="px-4 py-3 text-left w-[100px] min-w-[100px]">QC Check</th>
                <th class="px-4 py-3 text-left w-[100px] min-w-[100px]">Timb. Out</th>
                <th class="px-4 py-3 text-left w-[140px] min-w-[140px]">Process Timeline</th>
                <th class="px-4 py-3 text-right w-[95px] min-w-[95px]">Total TAT</th>
              </template>
              <template v-else>
                <th class="px-4 py-3 text-right w-[130px] min-w-[130px]">Weighbridge Net</th>
                <th class="px-4 py-3 text-right w-[130px] min-w-[130px]">Warehouse Scale</th>
                <th class="px-4 py-3 text-right w-[160px] min-w-[160px]">Reconciled Deviation</th>
                <th class="px-4 py-3 text-left w-[170px] min-w-[170px]">Scale Audit Verdict</th>
                <th class="px-4 py-3 text-center w-[100px] min-w-[100px]">Cargo Safety</th>
              </template>
              <th class="px-4 py-3 text-right w-[110px] min-w-[110px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="truck in paginatedFilteredTrucks" :key="truck.id">
              <!-- Regular Row -->
              <tr class="group bg-white hover:bg-slate-50 transition-all duration-300 shadow-xs hover:shadow-md border border-slate-100 cursor-pointer"
                :class="[
                  isRowExpanded(truck.id) ? 'shadow-md border-b-0 ring-1 ring-[#4A8BDF]/20' : '',
                  currentMode==='fraud'&&truck.fraud.status==='CRITICAL' ? 'shadow-[0_4px_15px_rgba(239,68,68,0.12)] border-red-200' : ''
                ]"
                @click="toggleRow(truck.id)">
                
                <!-- Checkbox -->
                <td class="px-4 py-3 rounded-l-xl border-y border-l border-slate-100 text-center w-[44px] min-w-[44px]" @click.stop>
                  <input type="checkbox" :value="truck.id" v-model="selectedTruckIds" class="accent-[#4A8BDF] rounded cursor-pointer w-4 h-4" />
                </td>

                <!-- Plate Number & Badges -->
                <td class="px-4 py-3 border-y border-slate-100 w-[260px] min-w-[260px]">
                  <div class="flex items-center space-x-2.5">
                    <!-- License Plate Clean Card -->
                    <div class="flex flex-col items-center justify-center bg-slate-100/90 px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0 min-w-[82px] group-hover:border-slate-300 group-hover:bg-slate-100 transition-colors">
                      <span class="text-xs font-black text-slate-800 font-mono tracking-wider leading-none">{{ getPlateNumber(truck) }}</span>
                      <span v-if="getVendor(truck) !== '-'" class="text-[8px] font-bold text-slate-500 mt-0.5 max-w-[75px] truncate leading-none" :title="getVendor(truck)">{{ getVendor(truck) }}</span>
                    </div>

                    <!-- Badges Column -->
                    <div class="flex flex-col space-y-1 min-w-0 flex-1">
                      <div class="flex items-center space-x-1 flex-wrap gap-y-1">
                        <span v-if="truck.dailySequence" class="px-1.5 py-0.5 rounded-md text-[8.5px] font-black font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                          #{{ String(truck.dailySequence).padStart(3, '0') }}
                        </span>
                        <span class="px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider border shrink-0" :style="getProcessBadgeStyle(truck)">
                          {{ getProcessType(truck) }}
                        </span>
                        
                        <span v-if="truck.status === 'CANCELLED'" class="px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-600 shrink-0">CANCELLED</span>
                        <span v-else-if="truck.status === 'COMPLETED'" class="px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">COMPLETED</span>
                        <span v-else class="px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-700 animate-pulse shrink-0">{{ getStatusLabel(truck.status, getProcessType(truck)) }}</span>
                      </div>

                      <div v-if="getCorrectionCount(truck) > 0">
                        <span class="inline-flex items-center px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 text-[8.5px] font-mono font-black rounded uppercase tracking-wider shadow-xs" :title="`${getCorrectionCount(truck)} Koreksi Admin dicatat`">
                          {{ getCorrectionCount(truck) }} KOREKSI
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- MODE 1: TIME TIMELINE ANALYTICS -->
                <template v-if="currentMode === 'time'">
                  <!-- Kedatangan (Tanggal & Waktu) -->
                  <td class="px-4 py-3 border-y border-slate-100 whitespace-nowrap w-[130px] min-w-[130px]">
                    <div class="flex flex-col">
                      <div class="flex items-center space-x-1 text-slate-800 font-bold text-[11px]">
                        <span class="material-icons text-slate-400 text-xs">calendar_today</span>
                        <span>{{ formatArrivalDateTime(truck.gateInAt || truck.timestamps?.gateInAt || truck.createdAt).date }}</span>
                      </div>
                      <div class="flex items-center space-x-1 text-[#4A8BDF] font-black font-mono text-[10.5px] mt-0.5">
                        <span class="material-icons text-xs">schedule</span>
                        <span>{{ formatArrivalDateTime(truck.gateInAt || truck.timestamps?.gateInAt || truck.createdAt).time }}</span>
                      </div>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 text-[11px] relative w-[100px] min-w-[100px]" :class="getHighlightClass(truck, 'waitingIn')">
                    <div class="flex flex-col">
                      <span class="text-slate-700 font-bold">{{ formatTime(truck.timestamps?.weighInAt || truck.weighInAt) }}</span>
                      <span class="font-black text-[9.5px] mt-0.5 text-slate-400">
                        {{ truck.durations.waitingIn }}m queue
                      </span>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 text-[11px] relative w-[100px] min-w-[100px]" :class="getHighlightClass(truck, 'warehouse')">
                    <div class="flex flex-col">
                      <span class="text-slate-700 font-bold">{{ formatTime(truck.timestamps?.warehouseEndAt || truck.warehouseEndAt) }}</span>
                      <span class="font-black text-[9.5px] mt-0.5 text-slate-400">
                        {{ truck.durations.warehouse }}m active
                      </span>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 text-[11px] relative w-[100px] min-w-[100px]" :class="getHighlightClass(truck, 'qc')">
                    <div class="flex flex-col">
                      <span class="text-slate-700 font-bold">{{ formatTime(getQCEndTime(truck)) }}</span>
                      <span class="font-black text-[9.5px] mt-0.5 text-slate-400">
                        {{ truck.durations.qc }}m check
                      </span>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 text-[11px] relative w-[100px] min-w-[100px]" :class="getHighlightClass(truck, 'waitingOut')">
                    <div class="flex flex-col">
                      <span class="text-slate-700 font-bold">{{ formatTime(truck.timestamps?.weighOutAt || truck.weighOutAt) }}</span>
                      <span class="font-black text-[9.5px] mt-0.5 text-slate-400">
                        {{ truck.durations.waitingOut }}m dispatch
                      </span>
                    </div>
                  </td>

                  <!-- Horizontal Flow Graphic Segment -->
                  <td class="px-4 py-3 border-y border-slate-100 w-[140px] min-w-[140px]">
                    <div class="flex items-center space-x-0.5 w-[120px] h-3 bg-slate-100 rounded-full overflow-hidden p-0.5">
                      <div class="h-full rounded-l-full bg-blue-400" :style="{ width: getPercentageWidth(truck.durations.waitingIn, truck.durations.total) + '%' }" title="Waiting In"></div>
                      <div class="h-full bg-indigo-400" :style="{ width: getPercentageWidth(truck.durations.warehouse, truck.durations.total) + '%' }" title="Warehouse"></div>
                      <div class="h-full bg-emerald-400" :style="{ width: getPercentageWidth(truck.durations.qc, truck.durations.total) + '%' }" title="QC Check"></div>
                      <div class="h-full rounded-r-full bg-teal-400" :style="{ width: getPercentageWidth(truck.durations.waitingOut, truck.durations.total) + '%' }" title="Weigh Out"></div>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 text-right w-[95px] min-w-[95px]">
                    <ProcessTimerBadge 
                      :start-time="truck.gateInAt || truck.timestamps?.gateInAt || truck.createdAt" 
                      :end-time="truck.completedAt || truck.cancelledAt || (truck.durations?.total ? new Date((new Date(truck.gateInAt || truck.createdAt)).getTime() + truck.durations.total * 60000) : null)"
                      :sla-minutes="null"
                      :compact="true"
                    />
                  </td>
                </template>

                <!-- MODE 2: WEIGHBRIDGE & DISCREPANCY RECONCILIATION -->
                <template v-else>
                  <td class="px-4 py-3 border-y text-xs font-mono text-right font-black text-slate-800 border-slate-100 w-[130px] min-w-[130px]">
                    <template v-if="formatWeight(truck.fraud.net) !== '-'">
                      {{ formatWeight(truck.fraud.net) }} <span class="text-[9px] text-slate-400">kg</span>
                    </template>
                    <template v-else>-</template>
                  </td>
                  <td class="px-4 py-3 border-y text-xs font-mono text-right font-black text-slate-800 border-slate-100 w-[130px] min-w-[130px]">
                    <template v-if="formatWeight(truck.fraud.roll) !== '-'">
                      {{ formatWeight(truck.fraud.roll) }} <span class="text-[9px] text-slate-400">kg</span>
                    </template>
                    <template v-else>-</template>
                  </td>
                  <td class="px-4 py-3 border-y border-slate-100 text-right w-[160px] min-w-[160px]">
                    <div class="flex flex-col items-end">
                      <span class="font-mono text-xs font-black tracking-tight" :class="truck.fraud.status==='CRITICAL'?'text-red-600':truck.fraud.status==='WARNING'?'text-orange-600':'text-[#3A6ABF]'">
                        {{ formatPercentage(truck.fraud.deviationPercent) }}
                      </span>
                      <span v-if="truck.fraud.status !== 'PENDING' && truck.fraud.status !== 'ERROR DATA'" class="text-[8px] font-black text-slate-400 uppercase mt-0.5 tracking-wider">
                        {{ truck.fraud.direction === '+' ? 'Overage' : truck.fraud.direction === '-' ? 'Shortage' : 'Matched' }} ({{ truck.fraud.diff === 0 ? '0' : formatWeight(truck.fraud.diff) }} kg)
                      </span>
                      <span v-else class="text-[8px] font-black text-slate-400 uppercase mt-0.5 tracking-wider">-</span>
                    </div>
                  </td>
                  
                  <td class="px-4 py-3 border-y border-slate-100 w-[170px] min-w-[170px]">
                    <span v-if="truck.fraud.status==='CRITICAL'" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[8.5px] uppercase tracking-wider font-black text-white animate-pulse" style="background:linear-gradient(135deg,#DC2626,#EF4444);box-shadow:0 3px 10px rgba(220,38,38,0.25)">
                      <span class="material-icons text-xs mr-1">warning</span> CRITICAL ANOMALY
                    </span>
                    <span v-else-if="truck.fraud.status==='WARNING'" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[8.5px] uppercase tracking-wider font-black text-white" style="background:linear-gradient(135deg,#D97706,#F59E0B);box-shadow:0 3px 10px rgba(217,119,6,0.2)">
                      <span class="material-icons text-xs mr-1">error_outline</span> SHRINKAGE
                    </span>
                    <span v-else-if="truck.fraud.status==='PENDING'" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[8.5px] uppercase tracking-wider font-black border border-slate-200 bg-slate-50 text-slate-600">
                      <span class="material-icons text-xs mr-1">hourglass_empty</span> PENDING
                    </span>
                    <span v-else-if="truck.fraud.status==='ERROR DATA'" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[8.5px] uppercase tracking-wider font-black border border-red-200 bg-red-50 text-red-700">
                      <span class="material-icons text-xs mr-1">error</span> ERROR DATA
                    </span>
                    <span v-else class="inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider font-black border border-emerald-100 bg-emerald-50 text-emerald-700">
                      <span class="material-icons text-sm mr-1">verified</span> SAFE (MATCHED)
                    </span>
                  </td>

                  <td class="px-4 py-3 border-y border-slate-100 text-center w-[100px] min-w-[100px]">
                    <!-- Progress meter -->
                    <div class="w-16 h-2 bg-slate-100 rounded-full mx-auto overflow-hidden p-[1px]">
                      <div class="h-full rounded-full" 
                        :class="truck.fraud.status==='CRITICAL'||truck.fraud.status==='ERROR DATA'?'bg-red-500':(truck.fraud.status==='WARNING'?'bg-orange-400':(truck.fraud.status==='PENDING'?'bg-slate-400':'bg-emerald-400'))"
                        :style="{ width: truck.fraud.status==='PENDING' ? '0%' : Math.max(20, Math.min(100, 100 - truck.fraud.deviationPercent * 5)) + '%' }">
                      </div>
                    </div>
                  </td>
                </template>

                <!-- Actions -->
                <td class="px-4 py-3 rounded-r-xl border-y border-r border-slate-100 text-right w-[110px] min-w-[110px]">
                  <div class="flex items-center justify-end space-x-1">
                    <button @click.stop="downloadSinglePDF(truck)" class="w-7 h-7 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-600 hover:text-white transition-all duration-300 active:scale-95" title="Download PDF Report">
                      <span class="material-icons text-[14px]">picture_as_pdf</span>
                    </button>
                    <button @click.stop="viewDetails(truck)" class="w-7 h-7 rounded-lg flex items-center justify-center text-[#4A8BDF] bg-blue-50 border border-blue-100 hover:bg-[#4A8BDF] hover:text-white transition-all active:scale-95" title="View Details">
                      <span class="material-icons text-[14px]">travel_explore</span>
                    </button>
                    <button @click.stop="toggleRow(truck.id)" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                      <span class="material-icons text-base transition-transform duration-300" :class="isRowExpanded(truck.id) ? 'rotate-180' : ''">expand_more</span>
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Expanded Details Row -->
              <tr v-if="isRowExpanded(truck.id)" :key="'expand-' + truck.id" class="bg-slate-50/50 hover:bg-slate-50/50">
                <td :colspan="currentMode==='time' ? 10 : 8" class="px-5 pb-5 pt-1 rounded-b-xl border-x border-b border-[#4A8BDF]/20 shadow-[inset_0_5px_15px_rgba(0,0,0,0.02)]">
                  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-100 animate-fadeInUp">
                    <!-- Column 1: Milestone Timeline -->
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                      <div class="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-50">
                        <span class="material-icons text-indigo-500 text-sm">route</span>
                        <h4 class="text-[9px] font-black text-slate-700 uppercase tracking-wider">Process Timestamps &amp; SLA</h4>
                      </div>
                      <div class="relative pl-5 border-l-2 border-slate-100 space-y-2.5 flex-1">
                        <div v-for="ts in getTimelineRows(truck)" :key="ts.label" class="relative group">
                          <div class="absolute -left-[26px] top-0.5 w-3 h-3 rounded-full bg-white border-2 flex items-center justify-center"
                            :class="ts.value ? 'border-[#4A8BDF]' : 'border-slate-200'">
                            <div class="w-1 h-1 rounded-full" :style="{ backgroundColor: ts.value ? '#4A8BDF' : '#CBD5E1' }"></div>
                          </div>
                          <div class="flex items-center justify-between text-[10px]">
                            <span class="font-black text-slate-400 uppercase tracking-widest text-[8px]">{{ ts.label }}</span>
                            <span class="font-bold text-slate-700 font-mono">{{ formatTimeFull(ts.value) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Column 2: Weight Reconciliation & Audit -->
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                      <div class="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-50">
                        <span class="material-icons text-emerald-500 text-sm">scale</span>
                        <h4 class="text-[9px] font-black text-slate-700 uppercase tracking-wider">Tonnage Audit &amp; Reconciliation</h4>
                      </div>
                      <div class="space-y-3 flex-1 flex flex-col justify-between">
                        <div class="grid grid-cols-2 gap-2">
                          <div class="bg-slate-50 p-2 rounded-lg text-center">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                              {{ truck.processType === 'GBJ' ? 'Scale Tare (IN)' : 'Scale Gross (IN)' }}
                            </span>
                            <span class="text-xs font-black text-slate-800 font-mono">
                              {{ formatWeightCustom(truck.processType === 'GBJ' ? (truck.weights?.tare || truck.tareWeight || truck.weighInWeight) : (truck.weights?.gross || truck.grossWeight || truck.weighInWeight)) }}
                            </span>
                          </div>
                          <div class="bg-slate-50 p-2 rounded-lg text-center">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                              {{ truck.processType === 'GBJ' ? 'Scale Gross (OUT)' : 'Scale Tare (OUT)' }}
                            </span>
                            <span class="text-xs font-black text-slate-800 font-mono">
                              {{ formatWeightCustom(truck.processType === 'GBJ' ? (truck.weights?.gross || truck.grossWeight || truck.weighOutWeight) : (truck.weights?.tare || truck.tareWeight || truck.weighOutWeight)) }}
                            </span>
                          </div>
                        </div>
                        <div class="p-2.5 rounded-lg text-white text-center"
                          :style="{ background: truck.fraud.status === 'ERROR DATA' ? 'linear-gradient(135deg, #64748B, #475569)' : truck.fraud.status === 'CRITICAL' ? 'linear-gradient(135deg, #DC2626, #EF4444)' : truck.fraud.status === 'WARNING' ? 'linear-gradient(135deg, #D97706, #F59E0B)' : 'linear-gradient(135deg, #10B981, #059669)' }">
                          <div class="text-[7.5px] font-black uppercase tracking-widest opacity-80">Scale Reconciliation Status</div>
                          <div class="text-xs font-black mt-0.5 tracking-wider">
                            {{ truck.fraud.status }}
                            <span v-if="truck.fraud.status !== 'PENDING' && truck.fraud.status !== 'ERROR DATA'">
                              ({{ formatPercentage(truck.fraud.deviationPercent) }} DIFF)
                            </span>
                          </div>
                        </div>
                        <!-- Balance Meter comparison bar -->
                        <div class="space-y-1">
                          <div class="flex justify-between text-[8px] font-black text-slate-400 uppercase">
                            <span>Net Scale: {{ formatWeightCustom(truck.fraud.net) }}</span>
                            <span>WH Realization: {{ formatWeightCustom(truck.fraud.roll) }}</span>
                          </div>
                          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                            <div class="h-full rounded-full" 
                              :class="truck.fraud.status==='CRITICAL'?'bg-red-500':truck.fraud.status==='WARNING'?'bg-orange-400':'bg-emerald-400'"
                              :style="{ width: Math.max(10, Math.min(100, (truck.fraud.roll / (truck.fraud.net || 1)) * 100)) + '%' }">
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Column 3: QC Lab Certificate / Vehicle Checklist & Metadata -->
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <div>
                        <div class="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-50">
                          <span class="material-icons text-sm" :class="truck.processType === 'GBJ' ? 'text-indigo-500' : 'text-blue-500'">{{ truck.processType === 'GBJ' ? 'local_shipping' : 'science' }}</span>
                          <h4 class="text-[9px] font-black text-slate-700 uppercase tracking-wider">{{ truck.processType === 'GBJ' ? 'QC Vehicle Checklist' : 'Quality Assurance Cert' }}</h4>
                        </div>
                        
                        <!-- GBB / GSP Metrics -->
                        <div v-if="truck.qcDetails && truck.processType !== 'GBJ'" class="grid grid-cols-3 gap-1.5 mb-2.5">
                          <div class="bg-slate-50 p-1.5 rounded text-center" v-if="truck.qcDetails.kadarAir !== null && truck.qcDetails.kadarAir !== undefined">
                            <span class="text-[7px] font-black text-slate-400 uppercase tracking-wider block">Moisture</span>
                            <span class="text-[10px] font-black text-slate-700 font-mono">{{ truck.qcDetails.kadarAir }}%</span>
                          </div>
                          <div class="bg-slate-50 p-1.5 rounded text-center" v-if="truck.qcDetails.totalFM !== null && truck.qcDetails.totalFM !== undefined">
                            <span class="text-[7px] font-black text-slate-400 uppercase tracking-wider block">Foreign Mat</span>
                            <span class="text-[10px] font-black text-slate-700 font-mono">{{ truck.qcDetails.totalFM }}%</span>
                          </div>
                          <div class="bg-slate-50 p-1.5 rounded text-center" v-if="truck.qcDetails.bijiOK !== null && truck.qcDetails.bijiOK !== undefined">
                            <span class="text-[7px] font-black text-slate-400 uppercase tracking-wider block">Biji Baik</span>
                            <span class="text-[10px] font-black text-slate-700 font-mono">{{ truck.qcDetails.bijiOK }}%</span>
                          </div>
                        </div>

                        <!-- GBJ Metrics -->
                        <div v-if="truck.qcDetails && truck.processType === 'GBJ'" class="grid grid-cols-3 gap-1.5 mb-2.5">
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.vehicleCleanliness">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Cleanliness</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.vehicleCleanliness === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.vehicleCleanliness }}</span>
                          </div>
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.vehicleOdor">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Odor</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.vehicleOdor === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.vehicleOdor }}</span>
                          </div>
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.pestEvidence">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Pest Free</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.pestEvidence === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.pestEvidence }}</span>
                          </div>
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.vehicleCondition">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Condition</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.vehicleCondition === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.vehicleCondition }}</span>
                          </div>
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.documentCompleteness">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Documents</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.documentCompleteness === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.documentCompleteness }}</span>
                          </div>
                          <div class="bg-slate-50 p-1 rounded text-center" v-if="truck.qcDetails.sealCondition">
                            <span class="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Seal</span>
                            <span class="text-[9px] font-black" :class="truck.qcDetails.sealCondition === 'PASS' ? 'text-emerald-600' : 'text-rose-600'">{{ truck.qcDetails.sealCondition }}</span>
                          </div>
                        </div>
                        <div class="text-[10px] space-y-1 text-slate-600">
                          <div class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[7.5px]">Driver Name</span><span class="font-bold">{{ truck.driverName }}</span></div>
                          <div class="flex justify-between" v-if="truck.driverPhone"><span class="font-black text-slate-400 uppercase text-[7.5px]">Phone</span><span class="font-bold">{{ truck.driverPhone }}</span></div>
                          <div class="flex justify-between" v-if="truck.poNumber"><span class="font-black text-slate-400 uppercase text-[7.5px]">Purchase Order</span><span class="font-bold font-mono">{{ truck.poNumber }}</span></div>
                          <div class="flex justify-between" v-if="truck.suratJalanNumber"><span class="font-black text-slate-400 uppercase text-[7.5px]">Delivery Note (SJ)</span><span class="font-bold font-mono">{{ truck.suratJalanNumber }}</span></div>
                          <div class="flex justify-between" v-if="truck.permitCard"><span class="font-black text-slate-400 uppercase text-[7.5px]">Permit ID</span><span class="font-bold font-mono">{{ truck.permitCard }}</span></div>
                        </div>
                      </div>
                      <div class="pt-3 border-t border-slate-50 mt-3 flex justify-between items-center text-[9px] font-bold text-slate-400 italic">
                        <span>Inspector: {{ truck.qcDetails?.pic || 'N/A' }}</span>
                        <span>Sign-off: {{ truck.securityName || 'Officer' }}</span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <!-- Loading State -->
            <tr v-if="loading" key="loading-history">
              <td :colspan="currentMode==='time' ? 10 : 8" class="px-5 py-24 text-center">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="relative w-12 h-12">
                    <div class="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                    <div class="absolute inset-0 rounded-full border-4 border-t-[#4A8BDF] animate-spin"></div>
                  </div>
                  <h4 class="text-xs font-black uppercase tracking-widest text-[#4A8BDF] animate-pulse">Retrieving Operations Log...</h4>
                </div>
              </td>
            </tr>
            <!-- Error State (Taste Skill / UI UX Pro Max: Explicit Interactive Failure State) -->
            <tr v-else-if="errorMessage" key="error-history">
              <td :colspan="currentMode === 'time' ? 10 : 8" class="px-5 py-20 text-center">
                <div class="flex flex-col items-center justify-center max-w-md mx-auto p-6 bg-rose-50/50 border border-rose-100 rounded-2xl shadow-sm">
                  <div class="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
                    <span class="material-icons text-2xl text-rose-600">cloud_off</span>
                  </div>
                  <h4 class="text-xs font-black uppercase tracking-widest text-slate-800">Server Synchronization Failed</h4>
                  <p class="text-[11px] font-bold text-rose-600 mt-1">{{ errorMessage }}</p>
                  <button @click="fetchHistory" class="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center space-x-1.5">
                    <span class="material-icons text-sm">refresh</span>
                    <span>Retry Connection</span>
                  </button>
                </div>
              </td>
            </tr>
            <!-- Empty State -->
            <tr v-else-if="filteredAnalyzedTrucks.length === 0" key="empty-history">
              <td :colspan="currentMode==='time' ? 10 : 8" class="px-5 py-24 text-center">
                <div class="flex flex-col items-center justify-center opacity-60">
                  <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <span class="material-icons text-3xl text-slate-400">history_toggle_off</span>
                  </div>
                  <h4 class="text-sm font-black uppercase tracking-wider text-slate-600">No Historical Records Found</h4>
                  <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">Try adjusting your filters or search keywords to view completed truck transaction logs.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="currentTotalItems > 0">
        <Pagination :current-page="currentPage" :total-items="currentTotalItems" :items-per-page="10" @update:current-page="currentPage = $event" />
      </div>
    </div>

    <!-- Main Detail Modal Overlay -->
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" @voided="handleTruckVoided" @corrected="handleTruckCorrected" />
  </div>
</template>

<script setup>
import { formatPlantDate, formatPlantTime, formatPlantDateTime, plantDateKey } from '../utils/displayTime'
import { getStatusLabel } from '../utils/statusLabel'
import { ref, computed, onMounted, watch } from 'vue'
import reportService from '../services/reportService'
import truckService from '../services/truckService'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import ProcessTimerBadge from '../components/ProcessTimerBadge.vue'
import PageHeader from '../components/PageHeader.vue'
import Pagination from '../components/Pagination.vue'
import { useToast } from '../composables/useToast'
import { printTruckReport } from '../utils/pdfGenerator'

// Stores and Composables
const toast = useToast()

// Reactive View State
const currentMode = ref('time')
const showDetailsModal = ref(false)
const selectedTruck = ref({})
const searchQuery = ref('')
const expandedRowId = ref(null)

// Advanced Filters & Date Range State
const statusFilter = ref('ALL')
const destinationFilter = ref('ALL')
const bottleneckFilter = ref('ALL')
const integrityFilter = ref('ALL')
const datePreset = ref('ALL')
const startDate = ref('')
const endDate = ref('')
const sortBy = ref('gateInDesc')
const currentPage = ref(1)
const selectedTruckIds = ref([])
const rawCompletedTrucks = ref([])
const loading = ref(false)
const errorMessage = ref(null)
const requestSequence = ref(0)
const serverMeta = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })
const serverSummary = ref({
  avgTatMinutes: 0,
  totalTonnageMetric: 0,
  anomalyCount: 0,
  majorBottleneck: null
})

const paginatedFilteredTrucks = computed(() => rawCompletedTrucks.value)
const filteredAnalyzedTrucks = computed(() => rawCompletedTrucks.value)
const currentTotalItems = computed(() => Number(serverMeta.value.total || 0))
const avgTAT = computed(() => Number(serverSummary.value.avgTatMinutes || 0))
const totalTonnage = computed(() => new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}).format(Number(serverSummary.value.totalTonnageMetric || 0)))
const anomalyCount = computed(() => Number(serverSummary.value.anomalyCount || 0))
const majorBottleneck = computed(() => ({
  waitingIn: 'Weigh In Scale Queue',
  warehouse: 'Warehouse Unloading',
  qc: 'Quality Control Lab',
  waitingOut: 'Weigh Out Dispatch'
}[serverSummary.value.majorBottleneck] || 'NO DELAYS'))

const isAllSelected = computed(() => {
  if (paginatedFilteredTrucks.value.length === 0) return false
  return paginatedFilteredTrucks.value.every((truck) =>
    selectedTruckIds.value.includes(truck.id),
  )
})

const toggleSelectAll = () => {
  const visibleTrucks = paginatedFilteredTrucks.value
  if (isAllSelected.value) {
    selectedTruckIds.value = selectedTruckIds.value.filter(
      (id) => !visibleTrucks.some((truck) => truck.id === id),
    )
    return
  }

  selectedTruckIds.value = [
    ...new Set([
      ...selectedTruckIds.value,
      ...visibleTrucks.map((truck) => truck.id),
    ]),
  ]
}

const handleTruckVoided = (updatedTruck) => {
  if (!updatedTruck?.id) return

  const index = rawCompletedTrucks.value.findIndex(
    (truck) => String(truck.id) === String(updatedTruck.id),
  )

  if (index !== -1) {
    rawCompletedTrucks.value[index] = {
      ...rawCompletedTrucks.value[index],
      ...updatedTruck,
      status: updatedTruck.status || 'CANCELLED',
      isVoided: updatedTruck.isVoided ?? true,
    }
  }

  selectedTruck.value = {
    ...selectedTruck.value,
    ...updatedTruck,
    status: updatedTruck.status || 'CANCELLED',
    isVoided: updatedTruck.isVoided ?? true,
  }

  fetchHistory()
}

const handleTruckCorrected = (updatedTruck) => {
  if (!updatedTruck?.id) return
  const index = rawCompletedTrucks.value.findIndex(
    (truck) => String(truck.id) === String(updatedTruck.id),
  )
  if (index !== -1) {
    rawCompletedTrucks.value[index] = {
      ...rawCompletedTrucks.value[index],
      ...updatedTruck,
    }
  }
  selectedTruck.value = {
    ...selectedTruck.value,
    ...updatedTruck,
  }
  fetchHistory()
}

const downloadBlob = (response, filename) => {
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const exportServerReport = async (format) => {
  try {
    const response = await reportService.exportReport({
      ...buildHistoryParams({ page: undefined, limit: undefined }),
      format,
    })
    downloadBlob(
      response,
      `GMS_Operations_Report_${new Date().toISOString().slice(0, 10)}.${format}`,
    )
    toast.success(`${format.toUpperCase()} report generated and downloaded!`)
  } catch (err) {
    toast.error(err.gmsMessage || err.response?.data?.message || 'Export failed')
  }
}

const exportData = () => exportServerReport('csv')
const exportExcel = () => exportServerReport('xls')

const getTransactionDetails = async (id) => {
  const response = await truckService.getById(id)
  return response.data?.data || response.data
}

const downloadSinglePDF = async (truck) => {
  if (!truck?.id) {
    toast.error('Transaction details are unavailable for PDF generation.')
    return
  }

  try {
    const details = await getTransactionDetails(truck.id)
    if (!details) throw new Error('Transaction details are unavailable.')
    printTruckReport(details)
  } catch (err) {
    toast.error(
      err.gmsMessage ||
        err.response?.data?.message ||
        'Failed to load transaction details for PDF generation',
    )
  }
}

const downloadBulkPDF = async () => {
  const ids = [...selectedTruckIds.value]
  if (ids.length === 0) return

  try {
    const details = new Array(ids.length)
    let nextIndex = 0
    const worker = async () => {
      while (true) {
        const index = nextIndex++
        if (index >= ids.length) return
        details[index] = await getTransactionDetails(ids[index])
      }
    }
    const workerCount = Math.min(4, ids.length)
    await Promise.all(Array.from({ length: workerCount }, worker))

    const printableDetails = details.filter(Boolean)
    if (printableDetails.length !== ids.length) {
      throw new Error('One or more selected transaction details are unavailable.')
    }
    printTruckReport(printableDetails)
    selectedTruckIds.value = []
  } catch (err) {
    toast.error(
      err.gmsMessage ||
        err.response?.data?.message ||
        'Failed to load selected transactions for PDF generation',
    )
  }
}

const buildHistoryParams = (extra = {}) => ({
  page: currentPage.value,
  limit: 10,
  search: searchQuery.value.trim() || undefined,
  status: statusFilter.value,
  processType: destinationFilter.value === 'ALL' ? undefined : destinationFilter.value,
  startDate: startDate.value || undefined,
  endDate: endDate.value || undefined,
  bottleneck: bottleneckFilter.value,
  integrity: integrityFilter.value,
  sort: sortBy.value,
  ...extra
})

const applyDatePreset = (preset) => {
  datePreset.value = preset
  const todayStr = plantDateKey(new Date())

  if (preset === 'TODAY') {
    startDate.value = todayStr
    endDate.value = todayStr
  } else if (preset === 'THIS_WEEK') {
    const localDay = new Date(`${todayStr}T00:00:00.000Z`)
    const day = localDay.getUTCDay()
    localDay.setUTCDate(localDay.getUTCDate() - (day === 0 ? 6 : day - 1))
    startDate.value = localDay.toISOString().slice(0, 10)
    endDate.value = todayStr
  } else if (preset === 'THIS_MONTH') {
    startDate.value = `${todayStr.slice(0, 7)}-01`
    endDate.value = todayStr
  } else if (preset === 'ALL') {
    startDate.value = ''
    endDate.value = ''
  }
  currentPage.value = 1
}

const fetchHistory = async () => {
  const requestId = ++requestSequence.value
  loading.value = true
  errorMessage.value = null
  try {
    const response = await reportService.getHistory(buildHistoryParams())
    if (requestId !== requestSequence.value) return
    const payload = response.data || {}
    rawCompletedTrucks.value = Array.isArray(payload.data) ? payload.data : []
    serverMeta.value = payload.meta || serverMeta.value
    serverSummary.value = payload.summary || serverSummary.value
  } catch (err) {
    if (requestId !== requestSequence.value) return
    const is403Redirect = err.response?.status === 403 && err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED'
    if (!is403Redirect) {
      const msg = err.gmsMessage || err.response?.data?.message || 'Failed to load history data'
      errorMessage.value = msg
      toast.error(msg)
    }
  } finally {
    if (requestId === requestSequence.value) loading.value = false
  }
}

onMounted(fetchHistory)

watch(
  [searchQuery, statusFilter, destinationFilter, bottleneckFilter, integrityFilter, startDate, endDate, sortBy],
  () => {
    currentPage.value = 1
    fetchHistory()
  },
  { flush: 'post' }
)

watch(currentPage, () => fetchHistory())

const formatArrivalDateTime = (isoString) => {
  return { date: formatPlantDate(isoString), time: formatPlantTime(isoString) }
}

// Toggle row expansion
const toggleRow = (id) => {
  expandedRowId.value = expandedRowId.value === id ? null : id
}

const isRowExpanded = (id) => expandedRowId.value === id

// Safety helper getters
const getPlateNumber = (truck) => {
  if (!truck) return '-'
  return truck.plateNumber || truck.vehicle?.plateNumber || truck.licensePlate || '-'
}

const getVendor = (truck) => {
  if (!truck) return '-'
  const val = truck.vendorName || truck.vendor || truck.vehicle?.companyName || truck.companyName || truck.cargo?.supplierOrCustomer || ''
  const plate = getPlateNumber(truck)
  if (!val || val === plate || val === truck.licensePlate) return '-'
  return val
}

const getProcessType = (truck) => {
  if (!truck) return '-'
  return truck.processType || truck.destination?.warehouseCode || truck.warehouseCode || truck.destination || '-'
}

const getProcessBadgeStyle = (truck) => {
  const type = getProcessType(truck)
  if (type === 'GBB') return 'color:#93005A;background:#FFF0F8;border-color:#FBCFE8'
  if (type === 'GBJ') return 'color:#1E40AF;background:#EFF6FF;border-color:#BFDBFE'
  return 'color:#065F46;background:#ECFDF5;border-color:#A7F3D0'
}

const getCorrectionCount = (truck) => {
  if (!truck) return 0
  if (Array.isArray(truck.corrections)) return truck.corrections.length
  if (typeof truck.correctionCount === 'number') return truck.correctionCount
  if (typeof truck._count?.corrections === 'number') return truck._count.corrections
  return 0
}

// --- HELPERS ---
const getPercentageWidth = (val, total) => {
  if (!total || isNaN(total) || isNaN(val)) return 0
  return Math.round((val / total) * 100)
}

const getHighlightClass = (truck, stage) => {
  if (!truck || currentMode.value !== 'time') return 'text-slate-700 font-bold'
  if (truck.bottleneck === stage && truck.durations && truck.durations[stage] > 0) {
    return 'bg-blue-50/50 border-r-2 border-r-blue-400'
  }
  return 'text-slate-700 font-bold'
}

const formatWeight = (val) => {
  if (val === undefined || val === null || val === '' || Number(val) === 0 || isNaN(Number(val))) return '-'
  return new Intl.NumberFormat('id-ID').format(val)
}

const formatWeightCustom = (val) => {
  if (val === undefined || val === null || val === '' || Number(val) === 0 || isNaN(Number(val))) return '-'
  return new Intl.NumberFormat('id-ID').format(val) + ' kg'
}

const formatPercentage = (val) => {
  if (val === undefined || val === null || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + '%'
}

const formatTime = (isoString) => {
  return formatPlantTime(isoString)
}

const getQCEndTime = (truck) => {
  if (!truck) return null
  const ts = truck.timestamps || {}
  return ts.qcVehicleEndAt || ts.incomingCheckEndAt || ts.incomingCheckAt || truck.qcEndAt || ts.qcVehicleStartAt || ts.incomingCheckStartAt || truck.warehouseEndAt || truck.weighOutAt
}

const formatTimeFull = (isoString) => {
  return formatPlantDateTime(isoString)
}

const getTimelineRows = (truck) => {
  if (!truck) return []
  const ts = truck.timestamps || {}
  
  const gateIn = ts.gateInAt || truck.gateInAt || truck.createdAt
  const weighIn = ts.weighInAt || truck.weighInAt
  const warehouseStart = ts.warehouseStartAt || truck.warehouseStartAt
  const warehouseEnd = ts.warehouseEndAt || truck.warehouseEndAt
  const qcStart = ts.qcVehicleStartAt || ts.incomingCheckStartAt || truck.qcStartAt || ts.qcVehicleStartAt || ts.incomingCheckStartAt || warehouseStart
  const qcEnd = ts.qcVehicleEndAt || ts.incomingCheckEndAt || ts.incomingCheckAt || truck.qcEndAt || ts.qcVehicleEndAt || ts.incomingCheckEndAt || ts.incomingCheckAt || warehouseEnd
  const weighOut = ts.weighOutAt || truck.weighOutAt
  const gateOut = ts.gateOutAt || truck.gateOutAt

  if (truck.processType === 'GBJ') {
    return [
      { label: 'Gate Entry', value: gateIn },
      { label: 'Weigh In scale', value: weighIn },
      { label: 'QC Yard Check', value: qcEnd || qcStart },
      { label: 'Warehouse Load', value: warehouseEnd || warehouseStart },
      { label: 'Weigh Out scale', value: weighOut },
      { label: 'Gate Out Dispatch', value: gateOut }
    ]
  }
  
  return [
    { label: 'Gate Entry', value: gateIn },
    { label: 'Weigh In scale', value: weighIn },
    { label: 'Warehouse Discharge', value: warehouseEnd || warehouseStart },
    { label: 'QC Laboratory', value: qcEnd || qcStart },
    { label: 'Weigh Out scale', value: weighOut },
    { label: 'Gate Out Dispatch', value: gateOut }
  ]
}

const viewDetails = (truck) => {
  selectedTruck.value = truck
  showDetailsModal.value = true
}

</script>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(15px);
}
</style>

