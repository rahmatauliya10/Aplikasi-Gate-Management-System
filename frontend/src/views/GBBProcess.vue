<template>
  <div class="space-y-6">
    <PageHeader title="Raw Material Warehouse" subtitle="Unloading Operations" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-[#A0006D] uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" :process-type="getProcessType(selectedTruck)" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(160,0,109,0.15)] transition-all duration-300">
                <span class="text-[9px] font-black text-amber-400 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
                <span class="text-xl font-black truncate font-mono tracking-widest" style="color:#ffffff;text-shadow:0 0 12px rgba(255,255,255,0.4)">{{ getPlateNumber(selectedTruck) }}</span>
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
                <span class="text-sm font-black text-[#800057]">Unloading</span>
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

            <div class="mt-8 space-y-6">
              <!-- Otorisasi QC Sampling Awal Confirmation Card -->
              <!-- Passport Otorisasi Card -->
              <div v-if="selectedTruck.status === 'QC_VEHICLE_PASSED' || selectedTruck.status === 'WAREHOUSE_IN_PROGRESS'" class="p-4 sm:p-5 rounded-2xl border border-emerald-200/80 shadow-sm transition-all bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-emerald-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 shadow-sm">
                    <span class="material-icons text-xl">verified</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="text-xs font-black uppercase tracking-wider text-emerald-950">Initial QC Sampling Authorization</h4>
                      <span class="px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-600 text-white uppercase tracking-wider shrink-0 shadow-sm">APPROVED</span>
                    </div>
                    <p class="text-[11px] font-medium text-emerald-800 mt-0.5 leading-snug">Cargo authorized safe & eligible for unloading at GBB Warehouse.</p>
                  </div>
                </div>
                <div class="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2.5 sm:pt-0 border-emerald-200/60 shrink-0">
                  <span class="text-[9px] font-black uppercase text-emerald-700 tracking-widest">PIC SAMPLING QC</span>
                  <span class="text-xs font-black text-emerald-950 tracking-tight">{{ selectedTruck.qcVehicleChecks?.[0]?.inspector || selectedTruck.qcDetails?.pic || 'QC Lab Team' }}</span>
                </div>
              </div>

              <!-- Start Unloading Button when security data is already present -->
              <div v-if="selectedTruck.status === 'QC_VEHICLE_PASSED' && selectedTruck.suratJalanNumber && selectedTruck.poNumber" class="space-y-4">
                <button @click="startUnloadingProcess" :disabled="isProcessing" class="w-full py-4 rounded-2xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                  style="background:linear-gradient(135deg,#A0006D,#70004C);">
                  <span v-if="isProcessing" class="material-icons text-xl animate-spin">autorenew</span>
                  <span v-else class="material-icons text-xl">play_arrow</span>
                  <span class="text-base tracking-wide uppercase">{{ isProcessing ? 'Starting Process...' : 'Start Cargo Unloading & Roll Weight (GBB Unloading)' }}</span>
                </button>
              </div>

              <!-- Missing Security Info -->
              <div v-if="selectedTruck.status === 'QC_VEHICLE_PASSED' && (!selectedTruck.suratJalanNumber || !selectedTruck.poNumber)" class="space-y-4 p-5 rounded-2xl" style="background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDE68A">
                <div class="flex items-center space-x-2 text-[#800057] mb-2">
                  <span class="material-icons text-lg">warning_amber</span>
                  <span class="text-[11px] font-black uppercase tracking-wider">Complete Security Data</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="space-y-1.5" v-if="!selectedTruck.suratJalanNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Delivery Note No. *</label>
                    <input v-model="suratJalanInput" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="SJ-XXXXX">
                  </div>
                  <div class="space-y-1.5" v-if="!selectedTruck.poNumber">
                    <label class="text-[10px] font-black text-amber-800 uppercase tracking-wider">No PO *</label>
                    <input v-model="poNumberInput" type="text" class="w-full h-11 px-3 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all uppercase placeholder:font-normal" style="border:1px solid #FDE68A" placeholder="PO-XXXXX">
                  </div>
                </div>
                <button @click="saveSecurityInfo" :disabled="isProcessing" class="w-full btn-primary py-2.5 mt-2 flex justify-center items-center space-x-2">
                  <span v-if="isProcessing" class="material-icons animate-spin">autorenew</span>
                  <span>Save Security Data & Start Unloading</span>
                </button>
              </div>

              <div v-if="selectedTruck.status === 'WAREHOUSE_IN_PROGRESS' && isRollWeightUnlocked">
                <WeightInput label="Input Roll Weight GBB (KG)" :is-submitting="isProcessing" @save="handleWeightSave" />
              </div>

              <!-- Vehicle & Delivery Checklist Start / Resume -->
              <div v-if="selectedTruck.status === 'WAREHOUSE_IN_PROGRESS' && !isRollWeightUnlocked" class="mt-6">
                <button @click="openInspection" class="w-full py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;transform:translateZ(0)">
                  <span class="material-icons text-xl">fact_check</span>
                  <span class="font-black tracking-widest uppercase">📋Vehicle Inspection (Pre-Unloading)</span>
                </button>
              </div>

              <!-- Rejection Badge -->
              <div v-if="selectedTruck.status === 'INCOMING_CHECK_REJECTED'" class="mt-4 p-4 rounded-xl flex items-center space-x-3" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
                <span class="material-icons text-red-500 text-2xl">cancel</span>
                <div>
                  <p class="text-sm font-black text-red-700">Analysis REJECTED by QC / Admin</p>
                  <p class="text-[11px] text-red-500">Truck redirected to outbound weighbridge.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(160,0,109,0.06),rgba(74,139,223,0.03));border:1px solid rgba(160,0,109,0.1)"><span class="material-icons text-slate-600 text-3xl">warehouse</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start unloading</p>
          </div>
        </div>
      </transition>

      <!-- Queue -->
      <div class="lg:col-span-1">
        <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50/30 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
          <!-- Grid Pattern Background (covers entire container) -->
          <div class="absolute inset-0 pointer-events-none opacity-[0.03] z-[1]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
          <!-- Glossy Overlay -->
          <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none z-[2]"></div>
          
          <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 z-10 relative">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">warehouse</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">GBB Queue</h2>
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
                <span class="text-xs font-black text-slate-700 tracking-wider">{{ filteredGbbTrucks.length }} PENDING TRUCKS</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative z-[5]">
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedGbbTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <!-- Glowing Accent Line -->
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300 bg-[#A0006D]"
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
                      :class="truck.status === 'processing' ? 'bg-amber-50 text-[#800057] border border-amber-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ getStepLabel(truck) }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#A0006D] text-white shadow-[0_4px_12px_rgba(160,0,109,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-amber-50 group-hover:text-[#800057]'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredGbbTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredGbbTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredGbbTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
    <!-- Vehicle & Delivery Checklist Modal -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="showChecklistModal" class="fixed inset-0 z-[9998] flex items-center justify-center p-4" @click.self="closeInspectionModal">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md pointer-events-none"></div>
          <div class="relative w-[95vw] sm:max-w-3xl mx-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden" style="background:white;">
            <!-- Header -->
            <div class="px-8 py-5 flex justify-between items-center bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100/50 border border-blue-200">
                  <span class="material-icons text-[#4A8BDF] text-xl">fact_check</span>
                </div>
                <div>
                  <h3 class="text-base font-black text-slate-800 tracking-tight">Vehicle Inspection Checklist</h3>
                  <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    Physical Vehicle & Cargo Inspection Prior to Roll Weight Entry
                  </p>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <div class="flex flex-col items-end">
                  <span class="text-[10px] font-black" :class="isChecklistComplete ? 'text-[#3A6ABF]' : 'text-slate-500'">
                    {{ checklistDoneCount }}/{{ vehicleChecklist.length }} Done
                  </span>
                  <div class="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1">
                    <div class="h-full rounded-full transition-all duration-500 ease-out bg-[#4A8BDF]"
                      :style="{ width: (checklistDoneCount / vehicleChecklist.length * 100) + '%' }"></div>
                  </div>
                </div>
                <button @click="closeInspectionModal" class="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-slate-200 text-slate-500">
                  <span class="material-icons text-lg">close</span>
                </button>
              </div>
            </div>
            
            <!-- Body -->
            <div class="p-6 overflow-y-auto" style="background:#FAFBFF;">
              <div class="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                <div v-for="(item, index) in vehicleChecklist" :key="index" class="p-4 transition-colors hover:bg-slate-50" :style="index < vehicleChecklist.length - 1 ? 'border-bottom:1px solid #E2E8F0' : ''">
                  <div class="flex items-start justify-between">
                    <div class="text-[13px] leading-tight font-bold text-slate-700 w-2/3 mt-1">{{ index + 1 }}. {{ item }}</div>
                    <div class="flex space-x-2 shrink-0">
                      <button @click="checklistStates[index].status = 'ok'; checklistStates[index].photo = null"
                        class="px-4 py-1.5 rounded-lg text-xs font-black transition-all"
                        :class="checklistStates[index]?.status === 'ok' ? 'bg-[#4A8BDF] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'">OK</button>
                      <button @click="checklistStates[index].status = 'not_ok'"
                        class="px-4 py-1.5 rounded-lg text-xs font-black transition-all"
                        :class="checklistStates[index]?.status === 'not_ok' ? 'bg-red-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'">NOT OK</button>
                    </div>
                  </div>
                  <transition name="fade">
                    <div v-if="checklistStates[index]?.status === 'not_ok'" class="mt-4 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-50 border border-red-100">
                      <div class="flex items-center space-x-2 text-red-600">
                        <span class="material-icons text-sm">photo_camera</span>
                        <span class="text-[10px] font-black uppercase tracking-wider">Photo Attachment Required</span>
                      </div>
                      <div class="flex items-center bg-white p-2 rounded-lg border border-red-200 shadow-sm w-full sm:w-auto">
                        <input type="file" @change="handlePhotoUpload($event, index)" class="text-[10px] file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" accept="image/*" />
                        <span v-if="checklistStates[index].photo" class="text-[10px] text-emerald-600 font-black ml-2 whitespace-nowrap">✓ OK</span>
                      </div>
                    </div>
                  </transition>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-8 py-5 border-t border-slate-100 bg-white">
              <div v-if="!isChecklistComplete" class="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400">
                <span class="material-icons text-xl mb-1 animate-pulse">lock</span>
                <span class="text-[11px] font-black uppercase tracking-widest">Complete {{ checklistRemaining }} Checklist Items</span>
                <p class="text-[9px] font-bold mt-1 text-center">All items must be answered OK or NOT OK + photo attachment to proceed.</p>
              </div>
              <div v-else class="flex flex-col sm:flex-row gap-3">
                <button type="button" @click="submitChecklistAndUnlock" :disabled="isProcessing"
                  class="flex-1 py-4 rounded-xl text-sm font-black text-white flex items-center justify-center space-x-2 transition-all hover:shadow-lg active:scale-[0.98]"
                  :style="hasChecklistNotOk ? 'background:linear-gradient(135deg,#F59E0B,#D97706);box-shadow:0 4px 12px rgba(245,158,11,0.3)' : 'background:linear-gradient(135deg,#4A8BDF,#3A6ABF);box-shadow:0 4px 12px rgba(74,139,223,0.3)'">
                  <span v-if="isProcessing" class="material-icons text-lg animate-spin">autorenew</span>
                  <span v-else class="material-icons text-lg">{{ hasChecklistNotOk ? 'warning' : 'check_circle' }}</span>
                  <span>{{ hasChecklistNotOk ? 'SUBMIT WITH NOTE & UNLOCK ROLL WEIGHT' : 'SUBMIT CHECKLIST & UNLOCK ROLL WEIGHT' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" size="wide" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import PageHeader from '../components/PageHeader.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import StepTimeline from '../components/StepTimeline.vue'
import WeightInput from '../components/WeightInput.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

// --- Safety & Mapping Helpers (Placed at top to avoid ReferenceErrors in computed properties) ---
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
  return truck.timestamps?.warehouse_start || truck.timestamps?.warehouseStartAt || truck.warehouseStartAt || null
}

const getWarehouseEnd = (truck) => {
  if (!truck) return null
  return truck.timestamps?.warehouse_end || truck.timestamps?.warehouseEndAt || truck.warehouseEndAt || null
}

const router = useRouter()
const truckStore = useTruckStore()
const warehouseStore = useWarehouseStore()
const toast = useToast()
const { confirm } = useConfirm()
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const showChecklistModal = ref(false)
const isChecklistPassed = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const isProcessing = ref(false)

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[GBBProcess] Mount-time fetch failed:', err.message)
  }
})

const openInspection = () => {
  showChecklistModal.value = true
}

const closeInspectionModal = () => {
  showChecklistModal.value = false
}

const rollWeightInput = ref(null)
const suratJalanInput = ref('')
const poNumberInput = ref('')
const checklistStates = ref([])
const compiledChecklistString = ref('')

const vehicleChecklist = [
  "Vehicle is clean",
  "Vehicle door seal is intact",
  "Vehicle & goods have no abnormal odor",
  "Goods are neatly arranged",
  "No pests/animals or traces of living or dead animals found",
  "No foreign objects present",
  "Packaging is intact and complete",
  "CoA is available and matches batch",
  "Goods quantity matches delivery note (for non-coffee bean items)",
  "Vehicle has no leaks / in good condition"
]

const hasChecklistNotOk = computed(() => checklistStates.value.some(s => s.status === 'not_ok'))
const gbbTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PASSED' || t.status === 'WAREHOUSE_IN_PROGRESS') && getProcessType(t) === 'GBB'))
const filteredGbbTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  if (!keyword) return gbbTrucks.value
  return gbbTrucks.value.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
})
const totalPages = computed(() => Math.ceil(filteredGbbTrucks.value.length / 10) || 1)
const paginatedGbbTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredGbbTrucks.value.slice(start, end)
})
watch(filteredGbbTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })

const selectTruck = (truck) => {
  const isSameTruck = selectedTruck.value && String(selectedTruck.value.id) === String(truck.id)
  selectedTruck.value = truck
  rollWeightInput.value = truck.actualWeight || truck.weights?.rollWeight || null
  suratJalanInput.value = truck.suratJalanNumber || ''
  poNumberInput.value = truck.poNumber || ''

  // Only reset checklist if selecting a DIFFERENT truck
  if (!isSameTruck || truck.status === 'WAREHOUSE_IN_PROGRESS') {
    checklistStates.value = vehicleChecklist.map(() => ({ status: null, photo: null }))
    isChecklistPassed.value = false
  }
}

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const saveSecurityInfo = async () => {
  if (!suratJalanInput.value || !poNumberInput.value) { toast.warning('Please complete the Delivery Note and PO Number fields'); return }
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const sj = suratJalanInput.value.toUpperCase();
    const po = poNumberInput.value.toUpperCase();
    const response = await warehouseStore.startProcess(selectedTruck.value.id, { suratJalanNumber: sj, poNumber: po })
    
    // Explicitly update local state for immediate UI reflection
    if (selectedTruck.value) {
      selectedTruck.value.suratJalanNumber = sj;
      selectedTruck.value.poNumber = po;
    }

    const updatedTruck = response?.data || response;
    if (updatedTruck) truckStore.upsertTruck(updatedTruck);
    toast.success('Security data saved. Unloading started.')
  } catch (error) {
    //
  } finally { isProcessing.value = false; }
}

const startUnloadingProcess = async () => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const response = await warehouseStore.startProcess(selectedTruck.value.id, { 
      suratJalanNumber: selectedTruck.value.suratJalanNumber || '-', 
      poNumber: selectedTruck.value.poNumber || '-' 
    });
    const updatedTruck = response?.data || response;
    if (updatedTruck) {
      truckStore.upsertTruck(updatedTruck);
      selectedTruck.value = updatedTruck;
    }
    toast.success('Pembongkaran muatan GBB dimulai!');
  } catch (error) {
    toast.error('Gagal memulai proses bongkar');
  } finally {
    isProcessing.value = false;
  }
};

const handlePhotoUpload = (event, index) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      const MAX_SIZE = 800;
      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Compress to JPEG with 0.6 quality to keep it lightweight for DB storage
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      checklistStates.value[index].photo = dataUrl;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

const isChecklistComplete = computed(() => {
  if (checklistStates.value.length === 0) return false
  return checklistStates.value.every(state => {
    if (state.status === 'ok') return true
    if (state.status === 'not_ok' && state.photo) return true
    return false
  })
})

const checklistDoneCount = computed(() => {
  return checklistStates.value.filter(s => s.status === 'ok' || (s.status === 'not_ok' && s.photo)).length
})

const checklistRemaining = computed(() => {
  return vehicleChecklist.length - checklistDoneCount.value
})

const submitChecklistAndUnlock = () => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    let resultStrs = []
    if (hasChecklistNotOk.value) {
      resultStrs.push('ACCEPTED WITH NOTE')
    }
    const checks = checklistStates.value.map((s, idx) => {
      let statusStr = s.status === 'ok' ? 'OK' : 'NOT OK';
      if (s.photo) statusStr += `||IMG:${s.photo}`;
      return `Item ${idx+1}: ${statusStr}`;
    })
    resultStrs.push(`Checklist: [${checks.join(' | ')}]`)
    
    compiledChecklistString.value = resultStrs.join(' | ')

    if (selectedTruck.value) {
      selectedTruck.value.compiledChecklist = compiledChecklistString.value
      truckStore.upsertTruck(selectedTruck.value);
    }
    
    isChecklistPassed.value = true
    showChecklistModal.value = false
    toast.success('Vehicle Checklist Complete — You can now input the Roll Weight.')
  } finally {
    isProcessing.value = false;
  }
}

const isRollWeightUnlocked = computed(() => {
  if (!selectedTruck.value) return false;
  return selectedTruck.value.qcAnalysisCompleted === true || isChecklistPassed.value || Boolean(selectedTruck.value.compiledChecklist);
})

const handleWeightSave = async (weight) => {
  if (!selectedTruck.value || isProcessing.value) return
  const ok = await confirm({ title: 'Unloading Complete?', message: `Save Roll Weight: ${weight}kg for ${getPlateNumber(selectedTruck.value)}?`, type: 'success', confirmText: 'Yes, Save' })
  if (ok) {
    isProcessing.value = true;
    try {
      const payload = { actualWeight: weight }
      if (compiledChecklistString.value) {
        payload.remarks = compiledChecklistString.value
      } else if (selectedTruck.value.compiledChecklist) {
        payload.remarks = selectedTruck.value.compiledChecklist
      }
      const response = await warehouseStore.completeProcess(selectedTruck.value.id, payload)
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);
      const nextStep = 'QC Verification (Lab)';
      toast.success(`Roll Weight ${weight}kg saved — proceed to ${nextStep}.`)
      selectedTruck.value = null
      rollWeightInput.value = null
      isChecklistPassed.value = false
      compiledChecklistString.value = ''
    } catch(error) {
      //
    } finally { isProcessing.value = false; }
  }
}
</script>

