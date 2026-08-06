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
                <h2 class="text-lg sm:text-xl font-black text-[#4A8BDF] tracking-tight font-mono">{{ truck.plateNumber }}</h2>
                <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                  :class="truck.processType === 'GBB' ? 'bg-pink-50 text-[#A0006D] border border-pink-200' : truck.processType === 'GBJ' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'">
                  {{ truck.processType }}
                </span>
                <StatusBadge :status="truck.status" :process-type="truck.processType" />
              </div>
              <div class="flex items-center space-x-1.5 mt-0.5">
                <span class="text-[10px] font-bold text-slate-500">{{ truck.driverName }}</span>
                <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                <span class="text-[10px] font-bold text-slate-400">{{ truck.vehicleType || 'N/A' }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button v-if="isAdmin && (truck.status === 'COMPLETED' || truck.status === 'CANCELLED' || truck.status === 'IN_PROGRESS')" @click="openCorrectionModal"
              class="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center space-x-1.5 transition-all shadow-sm active:scale-95">
              <span class="material-icons text-sm text-amber-600">edit_note</span>
              <span>Koreksi Admin</span>
              <span v-if="truck.revision" class="ml-1 px-1.5 py-0.5 bg-amber-200/80 text-amber-950 rounded text-[9px] font-mono font-black">Rev #{{ truck.revision }}</span>
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
              <div v-if="truck.cargoItems && truck.cargoItems.length > 0" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center space-x-2 border-b border-slate-50 bg-slate-50/50">
                  <span class="material-icons text-amber-500 text-[14px]">inventory_2</span>
                  <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Cargo Manifest</h3>
                  <span class="ml-auto text-[9px] font-black text-slate-400">{{ truck.cargoItems.length }} item(s)</span>
                </div>
                <div class="p-3">
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="(item, idx) in truck.cargoItems" :key="idx"
                      class="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-800">
                      <span class="material-icons text-[12px] mr-1 text-amber-500">package_2</span>
                      {{ item.name || item }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 1. Initial QC Sampling Card (For GBB & GSP) -->
              <div v-if="(truck.processType === 'GBB' || truck.processType === 'GSP') && initialSamplingDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-indigo-500 text-[14px]">biotech</span>
                    <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Initial QC Sampling (Pre-Unloading)</h3>
                  </div>
                  <span class="text-[9px] font-bold text-slate-400">PIC: [SAMPLING QC] {{ initialSamplingDetails.pic || 'QC Inspector' }}</span>
                </div>
                <div class="p-3 space-y-2.5">
                  <div class="rounded-xl p-3 text-white relative overflow-hidden shadow-sm"
                       :style="{ background: initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #10B981, #047857)' }">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-white/90 text-sm">{{ initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'cancel' : 'verified' }}</span>
                      <span class="text-xs font-black tracking-widest uppercase">{{ initialSamplingDetails.status === 'REJECT' || initialSamplingDetails.status === 'REJECTED' ? 'REJECTED' : 'APPROVED' }}</span>
                    </div>
                    <p v-if="initialSamplingDetails.note" class="text-[11px] font-bold text-white mt-2 p-2.5 rounded-lg bg-black/15 border border-white/25 backdrop-blur-sm shadow-inner leading-relaxed">"{{ initialSamplingDetails.note }}"</p>
                  </div>
                </div>
              </div>

              <!-- 2. Quality Analysis (QC Lab) Card (For GBB & GSP) -->
              <div v-if="(truck.processType === 'GBB' || truck.processType === 'GSP') && qcLabDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
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
              <div v-if="truck.processType === 'GBJ' && qcDetails" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
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

              <!-- Incoming Checklist Results (when remarks contain checklist data or it is a warehouse rejection or vehicle check) -->
              <div v-if="parsedChecklist || isWarehouseRejection" class="rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm">
                <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-50" 
                     :style="checklistStatusInfo.headerStyle">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-[14px]" :style="checklistStatusInfo.iconStyle">{{ truck?.processType === 'GBJ' ? 'local_shipping' : 'assignment_turned_in' }}</span>
                    <h3 class="text-[10px] font-black uppercase tracking-[0.15em]" :style="checklistStatusInfo.titleStyle">{{ truck?.processType === 'GBJ' ? 'Vehicle & Goods Inspection' : 'Incoming QC Checklist' }}</h3>
                  </div>
                  <!-- Status Pill & PIC -->
                  <div class="flex items-center space-x-2.5">
                    <span v-if="checklistPicLabel && truck?.processType !== 'GBJ'" class="text-[9px] font-bold text-slate-400">PIC: {{ checklistPicLabel }}</span>
                    <div class="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase"
                          :class="checklistStatusInfo.badgeClass">
                      <span class="material-icons text-[10px]">{{ checklistStatusInfo.icon }}</span>
                      <span>{{ checklistStatusInfo.label }}</span>
                    </div>
                  </div>
                </div>

                <div class="p-3 space-y-4">
                  <!-- 1. Sampling Parameters Grid (3 columns) -->
                  <div v-if="parsedChecklist && parsedChecklist.samplings.length" class="space-y-1.5">
                    <h4 class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sampling Parameters</h4>
                    <div class="grid grid-cols-3 gap-2">
                      <div v-for="s in parsedChecklist.samplings" :key="s.label" 
                            class="flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all duration-300"
                            :class="s.compliant ? 'bg-emerald-50/20 border-emerald-100/60 text-emerald-800' : 'bg-rose-50/30 border-rose-100 text-rose-800'">
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">{{ s.label }}</span>
                        <div class="flex items-center space-x-1">
                          <span class="material-icons text-[12px]" :class="s.compliant ? 'text-emerald-500' : 'text-rose-500'">
                            {{ s.compliant ? 'check_circle' : 'cancel' }}
                          </span>
                          <span class="text-[11px] font-black tracking-tight" :class="s.compliant ? 'text-emerald-700' : 'text-rose-700'">
                            {{ s.compliant ? 'OK' : 'FAIL' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 2. Inspection Items Grid (2 columns) -->
                  <div v-if="parsedChecklist && parsedChecklist.items.length" class="space-y-1.5">
                    <h4 class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vehicle & Goods Inspection</h4>
                    <div class="grid grid-cols-2 gap-2">
                      <div v-for="c in parsedChecklist.items" :key="c.label" 
                            class="flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 hover:translate-y-[-1px] bg-slate-50/30"
                            :class="c.ok ? 'border-slate-100 text-slate-700 hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)]' : 'border-rose-100 text-rose-800 bg-rose-50/20'">
                        <div class="flex items-center space-x-2 truncate">
                          <span class="material-icons text-[13px]" :class="c.ok ? 'text-emerald-500' : 'text-rose-500'">
                            {{ c.ok ? 'check_circle' : 'cancel' }}
                          </span>
                          <span class="text-[11px] font-bold text-slate-700 truncate" :title="c.label">{{ c.label }}</span>
                        </div>
                        <div class="flex items-center space-x-2 shrink-0">
                          <span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
                                :class="c.ok ? 'bg-emerald-100/50 text-emerald-700' : 'bg-rose-100 text-rose-700'">
                            {{ c.ok ? 'OK' : 'NOT OK' }}
                          </span>
                          <button v-if="c.photo" @click="selectedPhoto = c.photo" title="View Attachment" class="flex items-center justify-center w-6 h-6 rounded bg-rose-100 hover:bg-rose-200 text-rose-600 transition-colors ml-2">
                            <span class="material-icons text-[14px]">image</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 3. Rejection Banner (only show if isWarehouseRejection is true) -->
                  <div v-if="isWarehouseRejection && qcDetails" class="rounded-xl p-3 text-white relative overflow-hidden bg-gradient-to-r from-red-500 to-red-600 shadow-sm">
                    <div class="flex items-center space-x-2">
                      <span class="material-icons text-white/80 text-sm">cancel</span>
                      <span class="text-xs font-black tracking-widest uppercase">REJECTED BY WAREHOUSE (INCOMING CHECKLIST FAIL)</span>
                    </div>
                    <p v-if="qcDetails.note" class="text-[10px] font-bold text-white/80 mt-1 italic">"{{ qcDetails.note }}"</p>
                    <span v-if="checklistPicLabel" class="absolute right-3 bottom-1.5 text-[8px] font-bold text-white/60">PIC: {{ checklistPicLabel }}</span>
                  </div>
                </div>
              </div>

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
                <div class="p-3 space-y-2">
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
                  <!-- 1. Weighing Inputs Grid -->
                  <div class="grid grid-cols-2 gap-2.5">
                    <template v-if="truck.processType === 'GBB' || truck.processType === 'GSP'">
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 relative">
                        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400/20"></div>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Gross (IN)</span>
                        <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(grossInVal) }}</div>
                        <span v-if="props.truck.weighInBy?.name" class="text-[8px] font-bold text-slate-400/80 block mt-1.5 leading-none">PIC: [TIMBANGAN] {{ props.truck.weighInBy.name }}</span>
                      </div>
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 relative">
                        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400/20"></div>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tare (OUT)</span>
                        <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(tareOutVal) }}</div>
                        <span v-if="props.truck.weighOutBy?.name" class="text-[8px] font-bold text-slate-400/80 block mt-1.5 leading-none">PIC: [TIMBANGAN] {{ props.truck.weighOutBy.name }}</span>
                      </div>
                    </template>
                    <template v-else-if="truck.processType === 'GBJ'">
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 relative">
                        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400/20"></div>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tare (IN)</span>
                        <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(tareInVal) }}</div>
                        <span v-if="props.truck.weighInBy?.name" class="text-[8px] font-bold text-slate-400/80 block mt-1.5 leading-none">PIC: [TIMBANGAN] {{ props.truck.weighInBy.name }}</span>
                      </div>
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 relative">
                        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400/20"></div>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Gross (OUT)</span>
                        <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ formatWeightCustom(grossOutVal) }}</div>
                        <span v-if="props.truck.weighOutBy?.name" class="text-[8px] font-bold text-slate-400/80 block mt-1.5 leading-none">PIC: [TIMBANGAN] {{ props.truck.weighOutBy.name }}</span>
                      </div>
                    </template>
                  </div>

                  <!-- 2. Reconciled Weights Grid -->
                  <div class="grid grid-cols-2 gap-2.5">
                    <div class="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100/50 relative">
                      <span class="text-[8px] font-black text-emerald-600/80 uppercase tracking-widest block mb-1">Bridge Net</span>
                      <div class="text-base font-black text-emerald-700 font-mono tracking-tight">{{ formatWeightCustom(nettoTimbanganJembatan) }}</div>
                    </div>
                    <div class="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100/50 relative">
                      <span class="text-[8px] font-black text-orange-600/80 uppercase tracking-widest block mb-1">Warehouse Realization</span>
                      <div class="text-base font-black text-orange-700 font-mono tracking-tight">{{ formatWeightCustom(warehouseRealization) }}</div>
                      <span v-if="props.truck.warehouseEndBy?.name || props.truck.warehouseStartBy?.name" class="text-[8px] font-bold text-orange-600/80 block mt-1.5 leading-none">PIC: [GUDANG] {{ props.truck.warehouseEndBy?.name || props.truck.warehouseStartBy?.name }}</span>
                    </div>
                  </div>

                  <!-- 3. Status and Alert Bar -->
                  <div class="p-3 rounded-xl border flex justify-between items-center gap-2"
                       :class="statusTonnage === 'OK' ? 'bg-emerald-50 border-emerald-200' : (statusTonnage === 'PENDING' ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200')">
                    <div class="flex flex-col">
                      <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Deviation</span>
                      <div class="flex items-center space-x-1.5">
                        <span class="text-base font-black font-mono" :class="statusTonnage === 'OK' ? 'text-emerald-700' : (statusTonnage === 'PENDING' ? 'text-slate-600' : 'text-red-700')">
                          {{ formatPercentageCustom(deviationPercentage) }}
                        </span>
                        <span v-if="statusTonnage === 'PENDING' && (!nettoTimbanganJembatan || !warehouseRealization)" class="text-[9px] font-bold text-slate-400 italic">
                          Waiting for weighbridge out
                        </span>
                      </div>
                    </div>
                    
                    <!-- Badge -->
                    <div class="flex items-center">
                      <span class="px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider font-black text-white"
                            :style="badgeStyle">
                        {{ statusTonnage }}
                      </span>
                    </div>
                  </div>

                  <!-- Alert Warning if triggerAlert is true and deviation > variance -->
                  <div v-if="shouldShowAlert" class="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-2.5">
                    <span class="material-icons text-red-600 text-base mt-0.5">warning</span>
                    <div class="flex-1">
                      <h4 class="text-[9px] font-black text-red-800 uppercase tracking-wider">Tonnage Deviation Alert!</h4>
                      <p class="text-[9px] font-bold text-red-600 leading-snug mt-0.5">
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
                        :class="ts.value ? 'border-[#4A8BDF] shadow-[0_0_6px_rgba(74,139,223,0.35)]' : 'border-slate-200'">
                        <!-- Glowing active pulse ring -->
                        <span v-if="idx === lastCompletedIdx" class="absolute -inset-[3px] rounded-full border border-[#4A8BDF]/50 bg-[#4A8BDF]/10 animate-ping"></span>
                        <div class="w-1.5 h-1.5 rounded-full z-10" :style="{ backgroundColor: ts.value ? '#4A8BDF' : '#CBD5E1' }"></div>
                      </div>
                      
                      <!-- Label and value -->
                      <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">{{ ts.label }}</span>
                      <div class="flex items-center space-x-1.5">
                        <span class="text-[11px] font-bold text-slate-700 font-mono">{{ formatTimeFull(ts.value) }}</span>
                        <span v-if="ts.value" class="material-icons text-[12px] text-emerald-500">check_circle</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Full-Width Audit Trail & Correction History (Admin Only / When Available) -->
          <div v-if="isAdmin && (historyLoading || auditHistory.length > 0 || truck.revision > 1)" class="mt-3.5 rounded-xl overflow-hidden bg-white border border-slate-200/90 shadow-sm">
            <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/80">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-amber-600 text-[16px]">history_edu</span>
                <h3 class="text-[11px] font-black text-slate-700 uppercase tracking-[0.15em]">Audit Trail & Operation Log History</h3>
                <span v-if="truck.revision" class="px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[9px] font-black font-mono">Rev #{{ truck.revision }}</span>
              </div>
              <button @click="fetchCorrectionHistory" class="text-[10px] font-bold text-slate-500 hover:text-amber-600 flex items-center gap-1 transition-colors">
                <span class="material-icons text-[13px]">refresh</span> Reload
              </button>
            </div>

            <!-- Loading state -->
            <div v-if="historyLoading" class="p-6 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <span class="material-icons animate-spin text-2xl text-amber-600">sync</span>
              <span class="text-xs font-bold">Memuat riwayat koreksi dan audit trail...</span>
            </div>

            <!-- Empty state -->
            <div v-else-if="!auditHistory.length" class="p-6 text-center text-slate-400">
              <p class="text-xs font-medium">Belum ada catatan koreksi log operasi pada transaksi ini.</p>
            </div>

            <!-- History List -->
            <div v-else class="divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
              <div v-for="(log, idx) in auditHistory" :key="idx" class="p-3 hover:bg-slate-50/60 transition-colors text-xs space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black tracking-wider text-white"
                      :class="log.action === 'MODIFY_FIELD' ? 'bg-amber-600' : log.action === 'OVERRIDE_STATUS' ? 'bg-red-600' : 'bg-blue-600'">
                      {{ log.action || 'MODIFY' }}
                    </span>
                    <span class="font-bold text-slate-700 font-mono text-[11px]">{{ log.module || 'TRANSACTION' }}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono">{{ formatTimeFull(log.createdAt) }}</span>
                </div>
                
                <div class="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 font-bold">Oleh Admin:</span>
                    <span class="font-black text-slate-800">{{ log.user?.name || log.userId || 'System Admin' }}</span>
                  </div>
                  <div v-if="log.evidenceUrl" class="flex items-center gap-1 text-[#4A8BDF] font-bold">
                    <span class="material-icons text-[13px]">attachment</span>
                    <a :href="log.evidenceUrl" target="_blank" class="hover:underline">Bukti Lampiran</a>
                  </div>
                  <span v-else class="text-slate-400 italic text-[10px]">Tanpa Lampiran</span>
                </div>

                <div class="text-slate-700 text-xs font-medium bg-white p-2 rounded border border-slate-100 shadow-2xs">
                  <span class="font-black text-slate-900">Alasan:</span> {{ log.reason || 'Koreksi operasional log admin.' }}
                </div>

                <!-- Field Level Diff Item if available -->
                <div v-if="log.items && log.items.length" class="mt-1 space-y-1">
                  <div v-for="(item, iIdx) in log.items" :key="iIdx" class="grid grid-cols-3 gap-2 bg-slate-50/90 border border-slate-200/70 rounded-lg p-2 text-[10px] font-mono items-center">
                    <div class="text-slate-600 font-bold truncate">Field: <span class="text-slate-900 font-black text-[11px]">{{ item.fieldName }}</span></div>
                    <div class="text-red-700 font-medium truncate">Old: <span class="line-through">{{ item.oldValue || '-' }}</span></div>
                    <div class="text-emerald-700 font-bold truncate">New: <span>{{ item.newValue || '-' }}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer (Compact) -->
        <div class="px-4 py-2.5 flex justify-between shrink-0" style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
          <button v-if="authStore.isAdmin" @click="handleDelete" class="group relative overflow-hidden flex items-center space-x-1.5 px-5 py-2 rounded-lg transition-all duration-300 hover:shadow-md active:scale-[0.97]"
            style="background: linear-gradient(135deg, #EF4444, #B91C1C); box-shadow: 0 2px 8px rgba(239,68,68,0.25);">
            <span class="material-icons text-white/80 text-[14px]">delete_forever</span>
            <span class="text-[10px] font-black text-white uppercase tracking-[0.12em]">Delete</span>
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
      <img :src="selectedPhoto" class="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain ring-1 ring-white/10" />
    </div>
  </transition>

  <!-- Admin Correction Modal Overlay (Fail-Closed & High-Accountability UI) -->
      <transition name="modal">
        <div v-if="showCorrectionModal" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="showCorrectionModal = false">
          <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-amber-600">edit_note</span>
                <h3 class="text-base font-black text-slate-800">Koreksi Log Operasi (Admin & Auditor)</h3>
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
                <button @click="fetchCorrectionHistory; showCorrectionModal = false" type="button" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-sm">
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

              <!-- 3. Lampiran (Opsional) -->
              <div>
                <label class="block font-bold text-slate-700 mb-1 text-[11px] uppercase tracking-wider">URL / Bukti Dokumen <span class="text-slate-400 font-normal">(Opsional)</span></label>
                <input v-model="correctionForm.evidenceUrl" type="url" placeholder="https://storage.gms.local/evidence/ticket-123.pdf" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-mono text-xs" />
              </div>

              <!-- 4. Target Nilai Koreksi -->
              <div class="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
                <h4 class="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                  <span class="material-icons text-sm text-amber-600">tune</span>
                  <span>Nilai Koreksi & Status (Old vs New Value)</span>
                </h4>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block font-bold text-slate-600 mb-1 text-[11px]">Gross Weight (kg)</label>
                    <input v-model.number="correctionForm.grossWeight" type="number" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-500 transition-all text-xs" />
                    <span class="text-[10px] font-mono text-slate-400 block mt-0.5">Current: {{ props.truck?.grossWeight || 0 }} kg</span>
                  </div>
                  <div>
                    <label class="block font-bold text-slate-600 mb-1 text-[11px]">Tare Weight (kg)</label>
                    <input v-model.number="correctionForm.tareWeight" type="number" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-amber-500 transition-all text-xs" />
                    <span class="text-[10px] font-mono text-slate-400 block mt-0.5">Current: {{ props.truck?.tareWeight || 0 }} kg</span>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block font-bold text-slate-600 mb-1 text-[11px]">Nama Supir / PIC</label>
                    <input v-model="correctionForm.driverName" type="text" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 transition-all text-xs font-semibold" />
                  </div>
                  <div>
                    <label class="block font-bold text-slate-600 mb-1 text-[11px]">Status Transaksi</label>
                    <select v-model="correctionForm.status" class="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all">
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="IN_PROGRESS">IN_PROGRESS (Reopen)</option>
                    </select>
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
  
  </teleport>
</template>

<script setup>
import { defineProps, defineEmits, computed, ref, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import { useAuthStore } from '../stores/authStore'
import { useTruckStore } from '../stores/truckStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useConfirm } from '../composables/useConfirm'
import truckService from '../services/truckService'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  truck: { type: Object, default: () => ({}) },
  size: { type: String, default: 'normal' }
})
const emit = defineEmits(['close', 'deleted'])
const close = () => emit('close')

const authStore = useAuthStore()
const truckStore = useTruckStore()
const settingsStore = useSettingsStore()
const { confirm } = useConfirm()

const selectedPhoto = ref(null)

const isAdmin = computed(() => {
  const role = authStore.user?.role || authStore.role
  return role === 'ADMIN'
})

const showCorrectionModal = ref(false)
const correctionLoading = ref(false)
const correctionError = ref(null)
const occConflictError = ref(null)
const showSensitiveConfirm = ref(false)
const auditHistory = ref([])
const historyLoading = ref(false)

const correctionForm = ref({
  grossWeight: null,
  tareWeight: null,
  driverName: '',
  status: 'COMPLETED',
  reasonCategory: '',
  remark: '',
  evidenceUrl: '',
})

const fetchCorrectionHistory = async () => {
  if (!props.truck?.id || !isAdmin.value) return
  historyLoading.value = true
  try {
    const res = await truckStore.fetchOperationLogCorrections(props.truck.id)
    auditHistory.value = res?.data || []
  } catch (err) {
    try {
      const resOld = await truckService.getCorrections(props.truck.id)
      auditHistory.value = resOld.data?.data || []
    } catch (e) {
      auditHistory.value = []
    }
  } finally {
    historyLoading.value = false
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    fetchCorrectionHistory()
  }
}, { immediate: true })

const openCorrectionModal = () => {
  correctionForm.value = {
    grossWeight: props.truck?.grossWeight || null,
    tareWeight: props.truck?.tareWeight || null,
    driverName: props.truck?.driverName || '',
    status: props.truck?.status || 'COMPLETED',
    reasonCategory: '',
    remark: '',
    evidenceUrl: '',
  }
  correctionError.value = null
  occConflictError.value = null
  showSensitiveConfirm.value = false
  showCorrectionModal.value = true
}

const submitCorrection = () => {
  if (!correctionForm.value.reasonCategory) {
    correctionError.value = 'Kategori / Alasan koreksi wajib dipilih.'
    return
  }
  if (!correctionForm.value.remark || correctionForm.value.remark.trim().length < 10) {
    correctionError.value = 'Catatan singkat koreksi wajib diisi minimal 10 karakter.'
    return
  }

  // Check for sensitive changes (status change or huge weight deviation)
  const statusChanged = correctionForm.value.status !== props.truck?.status
  const grossDiff = Math.abs((Number(correctionForm.value.grossWeight) || 0) - (Number(props.truck?.grossWeight) || 0))
  if ((statusChanged || grossDiff >= 1000) && !showSensitiveConfirm.value) {
    showSensitiveConfirm.value = true
    return
  }

  executeCorrectionSubmission()
}

const executeCorrectionSubmission = async () => {
  correctionLoading.value = true
  correctionError.value = null
  occConflictError.value = null

  try {
    const combinedReason = `[${correctionForm.value.reasonCategory}] ${correctionForm.value.remark.trim()}`
    const items = []
    if (correctionForm.value.grossWeight !== null && Number(correctionForm.value.grossWeight) !== Number(props.truck?.grossWeight)) {
      items.push({ fieldName: 'grossWeight', oldValue: String(props.truck?.grossWeight || 0), newValue: String(correctionForm.value.grossWeight) })
    }
    if (correctionForm.value.tareWeight !== null && Number(correctionForm.value.tareWeight) !== Number(props.truck?.tareWeight)) {
      items.push({ fieldName: 'tareWeight', oldValue: String(props.truck?.tareWeight || 0), newValue: String(correctionForm.value.tareWeight) })
    }
    if (correctionForm.value.driverName && correctionForm.value.driverName !== props.truck?.driverName) {
      items.push({ fieldName: 'driverName', oldValue: String(props.truck?.driverName || ''), newValue: String(correctionForm.value.driverName) })
    }
    if (correctionForm.value.status && correctionForm.value.status !== props.truck?.status) {
      items.push({ fieldName: 'status', oldValue: String(props.truck?.status || ''), newValue: String(correctionForm.value.status) })
    }

    const payload = {
      targetModule: 'TRANSACTION',
      action: correctionForm.value.status !== props.truck?.status ? 'OVERRIDE_STATUS' : 'MODIFY_FIELD',
      reason: combinedReason,
      evidenceUrl: correctionForm.value.evidenceUrl?.trim() || undefined,
      expectedRevision: props.truck?.revision || 1,
      items: items.length > 0 ? items : undefined,
      grossWeight: correctionForm.value.grossWeight ? Number(correctionForm.value.grossWeight) : undefined,
      tareWeight: correctionForm.value.tareWeight ? Number(correctionForm.value.tareWeight) : undefined,
      driverName: correctionForm.value.driverName || undefined,
    }

    try {
      await truckStore.correctOperationLogTruck(props.truck.id, payload)
    } catch (apiErr) {
      const status = apiErr?.response?.status
      const msg = apiErr?.response?.data?.message || apiErr?.message || ''
      if (status === 409 || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('revision') || msg.toLowerCase().includes('konkurensi')) {
        occConflictError.value = 'Konflik Konkurensi! Data telah diubah oleh operator/Admin lain (OCC protect). Silakan segarkan data (Refresh) terlebih dahulu.'
        correctionLoading.value = false
        return
      }
      if (status === 404) {
        await truckStore.correctTruck(props.truck.id, {
          reason: combinedReason,
          evidenceUrl: correctionForm.value.evidenceUrl?.trim() || undefined,
          grossWeight: payload.grossWeight,
          tareWeight: payload.tareWeight,
          driverName: payload.driverName,
        })
      } else {
        throw apiErr
      }
    }

    showCorrectionModal.value = false
    showSensitiveConfirm.value = false
    await fetchCorrectionHistory()
  } catch (err) {
    correctionError.value = err.gmsMessage || err.response?.data?.message || err.message || 'Gagal menyimpan koreksi (Transaksi dibatalkan secara atomik / fail-closed).'
  } finally {
    correctionLoading.value = false
  }
}

const handleDelete = async () => {
  const ok = await confirm({
    title: 'Delete Data?',
    message: 'Are you sure you want to completely delete this truck data? This action cannot be undone!',
    type: 'danger',
    confirmText: 'Yes, Delete'
  })
  if (ok) {
    await truckStore.deleteTruck(props.truck.id)
    emit('deleted', props.truck.id)
    close()
  }
}

const identityFields = computed(() => {
  const fields = [
    { label: 'Driver Name', value: props.truck?.driverName },
    { label: 'Carrier Vendor', value: props.truck?.vendorName || props.truck?.vendor },
    { label: 'Vehicle Type', value: props.truck?.vehicleType },
    { label: 'Process Type', value: props.truck?.processType === 'GBB' ? 'Raw Material (Unloading)' : props.truck?.processType === 'GBJ' ? 'Finished Goods (Loading)' : props.truck?.processType === 'GSP' ? 'Sparepart Warehouse' : props.truck?.processType },
  ]
  // Only add these if they have values
  if (props.truck?.driverPhone) fields.push({ label: 'Driver Phone', value: props.truck.driverPhone, highlight: true })
  if (props.truck?.suratJalanNumber) fields.push({ label: 'Delivery Note (SJ)', value: props.truck.suratJalanNumber, highlight: true })
  if (props.truck?.poNumber) fields.push({ label: 'Logistics PO', value: props.truck.poNumber, highlight: true })
  const permitCardVal = props.truck?.permitCard || props.truck?.permitCardNumber
  const guestIdVal = props.truck?.guestId || props.truck?.guestIdNumber
  if (permitCardVal) fields.push({ label: 'Permit Card / VMS', value: permitCardVal })
  if (guestIdVal) fields.push({ label: `${props.truck?.idType || 'ID'} Number`, value: guestIdVal })
  if (props.truck?.guestCount && props.truck.guestCount > 1) fields.push({ label: 'Guest Count', value: `${props.truck.guestCount} persons` })
  if (props.truck?.securityName) fields.push({ label: 'Security Officer', value: props.truck.securityName })
  if (props.truck?.remarks) {
    const isChecklist = props.truck.remarks.includes('Sampling:') || props.truck.remarks.includes('Checklist:')
    if (!isChecklist) {
      fields.push({ label: 'Remarks', value: props.truck.remarks })
    }
  }
  return fields
})

const isInitialSamplingRejected = computed(() => {
  if (!props.truck) return false;
  const t = props.truck;
  if (t.status === 'QC_VEHICLE_REJECTED') return true;
  if (t.qcVehicleChecks && t.qcVehicleChecks.length > 0) {
    const check = t.qcVehicleChecks[0];
    if (check.result === 'REJECT' || check.result === 'REJECTED') return true;
  }
  if (t.qcSamplingDetails?.status === 'REJECTED' || t.qcSamplingDetails?.status === 'REJECT') return true;
  if (t.qcDetails && (t.qcDetails.status === 'REJECT' || t.qcDetails.status === 'REJECTED') && t.qcDetails.kadarAir === undefined) {
    return true;
  }
  return false;
});

const initialSamplingDetails = computed(() => {
  if (!props.truck) return null;
  const t = props.truck;
  if (t.processType !== 'GBB' && t.processType !== 'GSP') return null;

  if (t.qcVehicleChecks && t.qcVehicleChecks.length > 0) {
    const check = t.qcVehicleChecks[0];
    return {
      pic: check.checkedBy?.name || check.inspector || 'QC Inspector',
      status: check.result === 'PASS' ? 'APPROVED' : check.result === 'REJECT' ? 'REJECTED' : check.result || 'APPROVED',
      note: check.notes || check.notesStr || ''
    };
  }

  if (t.qcSamplingDetails) {
    return t.qcSamplingDetails;
  }

  if (t.qcDetails && t.qcDetails.kadarAir === undefined) {
    return {
      pic: t.qcDetails.pic || 'QC Inspector',
      status: (t.qcDetails.status === 'REJECT' || t.qcDetails.status === 'REJECTED' || t.status === 'QC_VEHICLE_REJECTED') ? 'REJECTED' : 'APPROVED',
      note: t.qcDetails.note || ''
    };
  }

  if (t.status === 'QC_VEHICLE_REJECTED' || t.status === 'QC_VEHICLE_PASSED' || t.status === 'QC_VEHICLE_IN_PROGRESS') {
    return {
      pic: 'QC Inspector',
      status: t.status === 'QC_VEHICLE_REJECTED' ? 'REJECTED' : 'APPROVED',
      note: ''
    };
  }

  return null;
});

const qcLabDetails = computed(() => {
  if (!props.truck) return null;
  const t = props.truck;
  if (t.processType !== 'GBB' && t.processType !== 'GSP') return null;

  if (isInitialSamplingRejected.value) {
    return { isSkipped: true, reason: 'REJECTED AT INITIAL QC SAMPLING' };
  }

  if (t.incomingMaterialChecks && t.incomingMaterialChecks.length > 0) {
    const check = t.incomingMaterialChecks[0];
    return {
      pic: check.checkedBy?.name || 'QC Lab Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      bijiOK: check.sampleWeight
    };
  }

  if (t.qcDetails && (t.qcDetails.kadarAir !== undefined || t.status?.startsWith('INCOMING_CHECK'))) {
    return t.qcDetails;
  }

  return null;
});

const qcDetails = computed(() => {
  const sourceDetails = props.truck?.qcDetails;
  let relationDetails = null;

  if (props.truck?.incomingMaterialChecks && props.truck.incomingMaterialChecks.length > 0) {
    const check = props.truck.incomingMaterialChecks[0];
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      bijiOK: check.sampleWeight
    };
  }
  else if (props.truck?.qcVehicleChecks && props.truck.qcVehicleChecks.length > 0) {
    const check = props.truck.qcVehicleChecks[0];
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
  if (!props.truck) return false
  const t = props.truck
  const isGbbOrGsp = t.processType === 'GBB' || t.processType === 'GSP'
  const qcStart = t.timestamps?.qcStartAt || t.qcStartAt || null
  const hasReject = t.incomingMaterialChecks?.some(c => c.result === 'REJECT') || 
                    qcDetails.value?.status === 'REJECT' || 
                    qcDetails.value?.status === 'REJECTED'
  return isGbbOrGsp && hasReject && !qcStart
})

const qcPicLabel = computed(() => {
  if (!qcDetails.value || !qcDetails.value.pic) return ''
  const dept = props.truck?.processType === 'GBJ' ? 'QC VEHICLE' : 'LAB QC'
  return `[${dept}] ${qcDetails.value.pic}`
})

const checklistPicLabel = computed(() => {
  if (!props.truck) return ''
  if (isWarehouseRejection.value) {
    return `[GUDANG] ${qcDetails.value?.pic || 'Admin'}`
  }
  const opName = props.truck.warehouseEndBy?.name || 
                 props.truck.warehouseStartBy?.name || 
                 props.truck.warehouseProcesses?.[0]?.endBy?.name ||
                 'Staff Gudang'
  return `[GUDANG] ${opName}`
})

const qcMetrics = computed(() => {
  const metrics = []
  if (isWarehouseRejection.value) return metrics
  const details = qcDetails.value
  if (!details) return metrics
  if (props.truck?.processType === 'GBJ') return metrics // Empty for GBJ since it uses the detailed checklist below
  if (details.bau) metrics.push({ label: 'Odor', value: details.bau })
  if (details.warna) metrics.push({ label: 'Color', value: details.warna })
  if (details.kadarAir !== null && details.kadarAir !== undefined) metrics.push({ label: 'Moisture', value: details.kadarAir + '%' })
  if (details.totalFM !== null && details.totalFM !== undefined) metrics.push({ label: 'Total FM', value: details.totalFM + '%' })
  if (details.bijiOK !== null && details.bijiOK !== undefined) metrics.push({ label: 'Good Beans', value: details.bijiOK + '%' })
  
  // If it's a vehicle check (GBJ)
  if (props.truck?.processType === 'GBJ' && props.truck.qcVehicleChecks && props.truck.qcVehicleChecks.length > 0) {
    const check = props.truck.qcVehicleChecks[0];
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
  if (!props.truck) return null

  // If GBJ, populate checklist from qcVehicleChecks
  if (props.truck.processType === 'GBJ' && props.truck.qcVehicleChecks && props.truck.qcVehicleChecks.length > 0) {
    const check = props.truck.qcVehicleChecks[0];
    let items = []
    
    // Use new checklistItems format if available (includes photos)
    if (check.checklistItems && Array.isArray(check.checklistItems)) {
      items = check.checklistItems;
    } else {
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
    return { hasIssue: check.result === 'REJECT', samplings: [], items }
  }

  const remarksStr = props.truck.remarks || props.truck.compiledChecklist || props.truck.warehouseProcesses?.[0]?.remarks || ''
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
  const hasIssue = checklist?.hasIssue || 
                   checklist?.samplings?.some(s => !s.compliant) || 
                   checklist?.items?.some(i => !i.ok)

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
  if (!props.truck) return null
  const t = props.truck
  let val = getWeightVal(t.weights?.gross)
  if (val === null) val = getWeightVal(t.grossWeight)
  if (val === null && t.processType !== 'GBJ') val = getWeightVal(t.weighInWeight)
  return val
})

const tareOutVal = computed(() => {
  if (!props.truck) return null
  const t = props.truck
  let val = getWeightVal(t.weights?.tare)
  if (val === null) val = getWeightVal(t.tareWeight)
  if (val === null && t.processType !== 'GBJ') val = getWeightVal(t.weighOutWeight)
  return val
})

const tareInVal = computed(() => {
  if (!props.truck) return null
  const t = props.truck
  let val = getWeightVal(t.weights?.tare)
  if (val === null) val = getWeightVal(t.tareWeight)
  if (val === null && t.processType === 'GBJ') val = getWeightVal(t.weighInWeight)
  return val
})

const grossOutVal = computed(() => {
  if (!props.truck) return null
  const t = props.truck
  let val = getWeightVal(t.weights?.gross)
  if (val === null) val = getWeightVal(t.grossWeight)
  if (val === null && t.processType === 'GBJ') val = getWeightVal(t.weighOutWeight)
  return val
})

const isRejected = computed(() => {
  if (!props.truck) return false
  const t = props.truck
  return t.status === 'INCOMING_CHECK_REJECTED' || 
         t.status === 'QC_VEHICLE_REJECTED' || 
         t.incomingMaterialChecks?.some(c => c.result === 'REJECT') || 
         t.qcVehicleChecks?.some(c => c.result === 'REJECT')
})

const warehouseRealization = computed(() => {
  if (!props.truck) return null
  if (isRejected.value) return 0
  const t = props.truck
  if (t.processType === 'GBB') {
    return t.nettoTimbanganRoll !== undefined && t.nettoTimbanganRoll !== null ? t.nettoTimbanganRoll : (t.weights?.nettoTimbanganRoll !== undefined && t.weights?.nettoTimbanganRoll !== null ? t.weights.nettoTimbanganRoll : (t.actualWeight !== undefined && t.actualWeight !== null ? t.actualWeight : (t.weights?.rollWeight !== undefined && t.weights?.rollWeight !== null ? t.weights.rollWeight : (t.rollWeight !== undefined && t.rollWeight !== null ? t.rollWeight : null))))
  }
  if (t.processType === 'GSP') {
    return t.jumlahNettoGSP !== undefined && t.jumlahNettoGSP !== null ? t.jumlahNettoGSP : (t.weights?.jumlahNettoGSP !== undefined && t.weights?.jumlahNettoGSP !== null ? t.weights.jumlahNettoGSP : (t.actualWeight !== undefined && t.actualWeight !== null ? t.actualWeight : (t.weights?.rollWeight !== undefined && t.weights?.rollWeight !== null ? t.weights.rollWeight : (t.rollWeight !== undefined && t.rollWeight !== null ? t.rollWeight : null))))
  }
  if (t.processType === 'GBJ') {
    return t.nettoInstantCoffee !== undefined && t.nettoInstantCoffee !== null ? t.nettoInstantCoffee : (t.weights?.nettoInstantCoffee !== undefined && t.weights?.nettoInstantCoffee !== null ? t.weights.nettoInstantCoffee : (t.actualWeight !== undefined && t.actualWeight !== null ? t.actualWeight : (t.weights?.rollWeight !== undefined && t.weights?.rollWeight !== null ? t.weights.rollWeight : (t.rollWeight !== undefined && t.rollWeight !== null ? t.rollWeight : null))))
  }
  return null
})

const isDataCompleteForCalc = computed(() => {
  if (!props.truck) return false
  if (isRejected.value) return true
  const t = props.truck
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
  if (!props.truck) return null
  const t = props.truck
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
  if (!isDataCompleteForCalc.value) return null
  const bridgeNet = nettoTimbanganJembatan.value
  const whReal = warehouseRealization.value
  if (!bridgeNet || !whReal) return null
  return (whReal / bridgeNet) * 100
})

const deviationPercentage = computed(() => {
  if (isRejected.value) return 0
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

const statusTonnage = computed(() => {
  if (!props.truck) return 'PENDING'
  const t = props.truck
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

const badgeStyle = computed(() => {
  const status = statusTonnage.value
  if (status === 'OK') {
    return 'background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 2px 8px rgba(16,185,129,0.25);'
  }
  if (status === 'PENDING') {
    return 'background: linear-gradient(135deg, #64748B, #475569); box-shadow: 0 2px 8px rgba(100,116,139,0.25);'
  }
  if (status === 'ERROR DATA') {
    return 'background: linear-gradient(135deg, #EF4444, #B91C1C); box-shadow: 0 2px 8px rgba(239,68,68,0.25);'
  }
  return 'background: linear-gradient(135deg, #F59E0B, #D97706); box-shadow: 0 2px 8px rgba(245,158,11,0.25);'
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
  return props.truck?.timestamps?.[key] || props.truck?.[key] || null;
}

const timestampRows = computed(() => {
  const pType = props.truck?.processType || 'GBB';
  const isSamplingRejected = props.truck?.status === 'QC_VEHICLE_REJECTED';

  if (pType === 'GBJ') {
    return [
      { label: 'Gate Entry', value: getTimestampVal('gateInAt') },
      { label: 'Weigh In', value: getTimestampVal('weighInAt') },
      { label: 'QC Vehicle', value: props.truck?.qcVehicleChecks?.[0]?.completedAt || getTimestampVal('qcStartAt') },
      { label: 'GBJ Loading', value: isSamplingRejected ? null : (getTimestampVal('warehouseEndAt') || getTimestampVal('warehouseStartAt')) },
      { label: 'Weigh Out', value: getTimestampVal('weighOutAt') },
      { label: 'Dispatched', value: getTimestampVal('gateOutAt') }
    ]
  }
  
  const unloadLabel = pType === 'GSP' ? 'GSP Processing' : 'GBB Unloading';

  return [
    { label: 'Gate Entry', value: getTimestampVal('gateInAt') },
    { label: 'Weigh In', value: getTimestampVal('weighInAt') },
    { label: 'QC Sampling', value: props.truck?.qcVehicleChecks?.[0]?.completedAt || getTimestampVal('qcStartAt') },
    { label: unloadLabel, value: isSamplingRejected ? null : (getTimestampVal('warehouseStartAt') || getTimestampVal('warehouseEndAt')) },
    { label: 'QC Lab Check', value: isSamplingRejected ? null : (props.truck?.incomingMaterialChecks?.[0]?.completedAt || (props.truck?.status?.startsWith('INCOMING_CHECK') ? getTimestampVal('qcEndAt') : null)) },
    { label: 'Weigh Out', value: getTimestampVal('weighOutAt') },
    { label: 'Dispatched', value: getTimestampVal('gateOutAt') }
  ]
})

const lastCompletedIdx = computed(() => {
  const rows = timestampRows.value;
  let lastIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].value) {
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
  if (!props.truck) return { status: 'NOT_RECORDED' }
  const net = nettoTimbanganJembatan.value || 0
  const roll = warehouseRealization.value || 0
  if (net === 0 || roll === 0) return { net, roll, diff: 0, ratioPercent: 0, deviationPercent: 0, direction: '=', status: 'NOT_RECORDED' }
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
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ', ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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
