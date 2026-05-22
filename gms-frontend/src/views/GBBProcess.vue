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
              <StatusBadge :status="selectedTruck.status" class="shadow-sm" />
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(160,0,109,0.15)] transition-all duration-300">
                <span class="text-[9px] font-black text-amber-400 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
                <span class="text-xl font-black truncate font-mono tracking-widest" style="color:#ffffff;text-shadow:0 0 12px rgba(255,255,255,0.4)">{{ selectedTruck.plateNumber }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Driver</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.driverName }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Vendor</span>
                <span class="text-sm font-black text-slate-700 truncate">{{ selectedTruck.vendor }}</span>
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
                <span class="text-sm font-black text-slate-800 font-mono">{{ formatTime(selectedTruck.timestamps.warehouse_end) }}</span>
              </div>
            </div>
            
            <div class="mt-6 relative z-10">
              <button @click="showDetailsModal = true" class="relative w-full overflow-hidden flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl transition-all duration-300 text-xs font-black uppercase tracking-widest text-indigo-600 bg-[#E6F0FA] border border-[#CCE0F5] hover:border-indigo-300 hover:shadow-[0_4px_20px_rgba(74,139,223,0.2)] group">
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-200/50 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                <span class="material-icons text-[18px]">travel_explore</span>
                <span>VIEW FULL ANALYSIS</span>
              </button>
            </div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9"><StepTimeline :current-step="selectedTruck.step" :process-type="selectedTruck.processType" /></div>

            <div class="mt-6 space-y-4">
              <!-- Missing Security Info -->
              <div v-if="selectedTruck.status === 'waiting' && (!selectedTruck.suratJalanNumber || !selectedTruck.poNumber)" class="space-y-4 p-5 rounded-2xl" style="background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDE68A">
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
                <button @click="saveSecurityInfo" class="w-full btn-primary py-2.5 mt-2">Save Security Data</button>
              </div>

              <!-- Roll Weight Input (processing) -->
              <div v-if="selectedTruck.status === 'processing'">
                <WeightInput label="Input Roll Weight GBB (KG)" @save="handleWeightSave" />
              </div>

              <div v-if="selectedTruck.status === 'waiting' && selectedTruck.suratJalanNumber && selectedTruck.poNumber && !samplingDecision" class="mt-6">
                <button @click="openInspection" class="w-full py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;transform:translateZ(0)">
                  <span class="material-icons text-xl">fact_check</span><span class="font-black tracking-widest uppercase">Start Vehicle & Quality Inspection</span>
                </button>
              </div>

              <!-- Sampling Result Badge -->
              <div v-if="samplingDecision === 'rejected'" class="mt-4 p-4 rounded-xl flex items-center space-x-3" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
                <span class="material-icons text-red-500 text-2xl">cancel</span>
                <div>
                  <p class="text-sm font-black text-red-700">Sampling REJECTED</p>
                  <p class="text-[11px] text-red-500">Truck redirected to outbound weighbridge without unloading.</p>
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
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ truck.plateNumber }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 font-mono border border-slate-200">
                    {{ formatTime(truck.timestamps.warehouse_start) }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      :class="truck.status === 'processing' ? 'bg-amber-50 text-[#800057] border border-amber-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ truck.status }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#A0006D] text-white shadow-[0_4px_12px_rgba(160,0,109,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-amber-50 group-hover:text-[#800057]'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="gbbTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
    
    <!-- Reject Comment Modal -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="showRejectModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" @click.self="showRejectModal = false">
          <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
          <div class="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style="background:white;">
            <!-- Header -->
            <div class="p-5 flex items-center space-x-3" style="background:linear-gradient(135deg,#FEE2E2,#FFF1F2);border-bottom:1px solid #FECACA;">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(220,38,38,0.1);">
                <span class="material-icons text-red-500 text-xl">report_problem</span>
              </div>
              <div>
                <h3 class="text-base font-black text-red-800">Rejection Reason</h3>
                <p class="text-[10px] font-bold text-red-400 uppercase tracking-widest">Required before rejecting</p>
              </div>
            </div>
            <!-- Body -->
            <div class="p-5 space-y-4">
              <div class="p-3 rounded-xl flex items-center space-x-2" style="background:#FEF2F2;border:1px solid #FECACA;">
                <span class="material-icons text-red-400 text-sm">info</span>
                <span class="text-[11px] font-bold text-red-600">{{ selectedTruck?.plateNumber }} — Sampling NON-COMPLIANT</span>
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-black text-slate-600 uppercase tracking-wider">Comment / Rejection Reason *</label>
                <textarea v-model="rejectComment" rows="4" class="w-full p-3 bg-slate-50 rounded-xl text-sm font-medium text-slate-800 outline-none resize-none placeholder:text-slate-600 placeholder:font-normal transition-all focus:ring-2 focus:ring-red-300" style="border:1px solid #E2E8F0;" placeholder="Write the rejection reason in detail..."></textarea>
                <p v-if="rejectCommentError" class="text-[10px] text-red-500 font-bold">⚠ Comment is required, minimum 10 characters</p>
              </div>
            </div>
            <!-- Footer -->
            <div class="px-5 pb-5 flex space-x-3">
              <button @click="showRejectModal = false; rejectComment = ''; rejectCommentError = false"
                class="flex-1 py-3 rounded-xl text-sm font-black transition-all hover:bg-slate-100" style="border:1px solid #E2E8F0;color:#64748B;">
                Cancel
              </button>
              <button @click="submitReject"
                class="flex-1 py-3 rounded-xl text-sm font-black text-white transition-all hover:shadow-lg active:scale-[0.98]"
                style="background:linear-gradient(135deg,#DC2626,#EF4444);box-shadow:0 4px 12px rgba(220,38,38,0.3)">
                <span class="flex items-center justify-center space-x-2"><span class="material-icons text-base">block</span><span>Reject</span></span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Inspection Modal (Checklist & Sampling) -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="showChecklistModal" class="fixed inset-0 z-[9998] flex items-center justify-center p-4" @click.self="showChecklistModal = false">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md pointer-events-none"></div>
          <div class="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden" style="background:white;">
            <!-- Header -->
            <div class="px-8 py-5 flex justify-between items-center bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100/50 border border-blue-200">
                  <span class="material-icons text-[#4A8BDF] text-xl">{{ inspectionStep === 1 ? 'fact_check' : 'science' }}</span>
                </div>
                <div>
                  <h3 class="text-base font-black text-slate-800 tracking-tight">
                    {{ inspectionStep === 1 ? 'Vehicle Checklist' : 'Initial Sampling — Quality Inspection' }}
                  </h3>
                  <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    Step {{ inspectionStep }} of 2
                  </p>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <div class="flex flex-col items-end" v-if="inspectionStep === 1">
                  <span class="text-[10px] font-black" :class="isChecklistComplete ? 'text-[#3A6ABF]' : 'text-slate-500'">
                    {{ checklistDoneCount }}/{{ vehicleChecklist.length }} Done
                  </span>
                  <div class="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1">
                    <div class="h-full rounded-full transition-all duration-500 ease-out bg-[#4A8BDF]"
                      :style="{ width: (checklistDoneCount / vehicleChecklist.length * 100) + '%' }"></div>
                  </div>
                </div>
                <button @click="showChecklistModal = false" class="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-slate-200 text-slate-500">
                  <span class="material-icons text-lg">close</span>
                </button>
              </div>
            </div>
            
            <!-- Body -->
            <div class="p-6 overflow-y-auto" style="background:#FAFBFF;">
              <!-- Step 1: Checklist -->
              <transition name="fade-slide" mode="out-in">
                <div v-if="inspectionStep === 1" key="step1" class="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
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

                <!-- Step 2: Sampling Awal -->
                <div v-else-if="inspectionStep === 2" key="step2" class="space-y-4">
                  <div class="p-5 rounded-2xl" style="background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDE68A">
                    <div class="space-y-3">
                      <div v-for="(param, idx) in samplingParams" :key="idx" class="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm" style="border:1px solid rgba(253,224,71,0.5)">
                        <div class="flex items-center space-x-4">
                          <span class="material-icons text-[#A0006D] text-2xl">{{ param.icon }}</span>
                          <div>
                            <div class="text-[14px] font-black text-slate-800">{{ param.label }}</div>
                            <div class="text-[11px] text-slate-600 font-medium">{{ param.desc }}</div>
                          </div>
                        </div>
                        <div class="flex space-x-2">
                          <button type="button" @click="samplingStates[idx] = 'ok'"
                            class="px-4 py-2 rounded-lg text-[11px] font-black transition-all"
                            :style="samplingStates[idx] === 'ok' ? 'background:#4A8BDF;color:white;border:1px solid #2A4A9F;box-shadow:0 2px 8px rgba(58,106,191,0.3)' : 'background:white;color:#64748B;border:1px solid #E2E8F0'">COMPLIANT</button>
                          <button type="button" @click="samplingStates[idx] = 'not_ok'"
                            class="px-4 py-2 rounded-lg text-[11px] font-black transition-all"
                            :style="samplingStates[idx] === 'not_ok' ? 'background:#DC2626;color:white;border:1px solid #B91C1C;box-shadow:0 2px 8px rgba(220,38,38,0.3)' : 'background:white;color:#64748B;border:1px solid #E2E8F0'">NON-COMPLIANT</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
            </div>

            <!-- Footer -->
            <div class="px-8 py-5 border-t border-slate-100 bg-white">
              <transition name="fade" mode="out-in">
                <!-- Footer Step 1 -->
                <div v-if="inspectionStep === 1" key="footer1">
                  <div v-if="!isChecklistComplete" class="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400">
                    <span class="material-icons text-xl mb-1 animate-pulse">lock</span>
                    <span class="text-[11px] font-black uppercase tracking-widest">Complete {{ checklistRemaining }} Checklist Items</span>
                    <p class="text-[9px] font-bold mt-1 text-center">All items must be answered OK or NOT OK + photo attachment to proceed.</p>
                  </div>
                  <button v-else @click="inspectionStep = 2" class="w-full flex justify-center items-center py-4 rounded-xl space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;">
                    <span class="text-sm font-black uppercase tracking-widest text-white">Proceed to Quality Sampling</span>
                    <span class="material-icons text-lg animate-bounce-right">arrow_forward</span>
                  </button>
                </div>

                <!-- Footer Step 2 -->
                <div v-else-if="inspectionStep === 2" key="footer2">
                  <div v-if="!isSamplingFilled" class="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400">
                    <span class="material-icons text-xl mb-1 animate-pulse">lock</span>
                    <span class="text-[11px] font-black uppercase tracking-widest">Complete Initial Sampling</span>
                    <p class="text-[9px] font-bold mt-1 text-center">All quality parameters must be inspected.</p>
                  </div>
                  <div v-else class="flex flex-col sm:flex-row gap-3">
                    <button v-if="hasSamplingReject" type="button" @click="showRejectModal = true"
                      class="flex-1 py-4 rounded-xl text-sm font-black text-white flex items-center justify-center space-x-2 transition-all hover:shadow-lg active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#DC2626,#EF4444);box-shadow:0 4px 12px rgba(220,38,38,0.3)">
                      <span class="material-icons text-lg">block</span><span>REJECT SAMPLING</span>
                    </button>
                    <button v-if="!hasSamplingReject" type="button" @click="acceptSamplingAndFinish"
                      class="flex-1 py-4 rounded-xl text-sm font-black text-white flex items-center justify-center space-x-2 transition-all hover:shadow-lg active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);box-shadow:0 4px 12px rgba(74,139,223,0.3)">
                      <span class="material-icons text-lg">check_circle</span><span>ACCEPT & PROCEED TO UNLOAD</span>
                    </button>
                  </div>
                </div>
              </transition>
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
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import StepTimeline from '../components/StepTimeline.vue'
import WeightInput from '../components/WeightInput.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

const router = useRouter()
const truckStore = useTruckStore()
const toast = useToast()
const { confirm } = useConfirm()
const isSubmitting = ref(false)
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const showChecklistModal = ref(false)
const inspectionStep = ref(1)
const currentPage = ref(1)
const searchQuery = ref('')

const openInspection = () => {
  inspectionStep.value = 1
  showChecklistModal.value = true
}

const rollWeightInput = ref(null)
const suratJalanInput = ref('')
const poNumberInput = ref('')
const checklistStates = ref([])
const samplingStates = ref([null, null, null])
const samplingDecision = ref(null)
const showRejectModal = ref(false)
const rejectComment = ref('')
const rejectCommentError = ref(false)

const samplingParams = [
  { label: 'Moisture', desc: 'Check moisture content of sample', icon: 'water_drop' },
  { label: 'Visual', desc: 'Check physical appearance of goods', icon: 'visibility' },
  { label: 'Odor', desc: 'Check for abnormal odor/smell', icon: 'air' }
]

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

const isSamplingFilled = computed(() => samplingStates.value.every(s => s !== null))
const hasSamplingReject = computed(() => samplingStates.value.some(s => s === 'not_ok'))
const gbbTrucks = computed(() => truckStore.trucks.filter(t => t.step === 'gbb'))
const filteredGbbTrucks = computed(() => {
  if (!searchQuery.value) return gbbTrucks.value
  return gbbTrucks.value.filter(t => t.plateNumber.toLowerCase().includes(searchQuery.value.toLowerCase()))
})
const paginatedGbbTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredGbbTrucks.value.slice(start, end)
})
watch(searchQuery, () => { currentPage.value = 1 })

const selectTruck = (truck) => {
  selectedTruck.value = truck
  rollWeightInput.value = truck.weights.rollWeight || null
  suratJalanInput.value = truck.suratJalanNumber || ''
  poNumberInput.value = truck.poNumber || ''
  samplingStates.value = [null, null, null]
  samplingDecision.value = null
  checklistStates.value = vehicleChecklist.map(() => ({ status: null, photo: null }))
}

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const saveSecurityInfo = () => {
  if (!suratJalanInput.value || !poNumberInput.value) { toast.warning('Please complete the Delivery Note and PO Number fields'); return }
  truckStore.updateTruckDetails(selectedTruck.value.id, { suratJalanNumber: suratJalanInput.value.toUpperCase(), poNumber: poNumberInput.value.toUpperCase() })
  toast.success('Security data saved successfully!')
}

const handlePhotoUpload = (event, index) => { const file = event.target.files[0]; if (file) checklistStates.value[index].photo = file.name }

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

const submitReject = async () => {
  if (isSubmitting.value) return
  if (!rejectComment.value || rejectComment.value.trim().length < 10) {
    rejectCommentError.value = true
    return
  }
  rejectCommentError.value = false
  
  const ok = await confirm({ title: 'Confirm Rejection', message: `REJECT sampling for ${selectedTruck.value.plateNumber}? Truck will be redirected to outbound weighbridge without unloading.`, type: 'danger', confirmText: 'Yes, Reject' })
  if (ok) {
    isSubmitting.value = true
    showRejectModal.value = false
    showChecklistModal.value = false
    samplingDecision.value = 'rejected'
    await truckStore.updateTruckDetails(selectedTruck.value.id, { rejectReason: rejectComment.value.trim() })
    await truckStore.updateTruckStatus(selectedTruck.value.id, 'waiting', 'weighbridge_out')
    toast.error(`${selectedTruck.value.plateNumber} rejected — ${rejectComment.value.trim()}`)
    rejectComment.value = ''
    selectedTruck.value = null
    isSubmitting.value = false
  }
}
const acceptSamplingAndFinish = async () => {
  if (isSubmitting.value) return
  isSubmitting.value = true
  samplingDecision.value = 'accepted'
  showChecklistModal.value = false
  await truckStore.updateTruckStatus(selectedTruck.value.id, 'processing', 'gbb')
  toast.success('Inspection Complete — Starting unloading process.')
  isSubmitting.value = false
}

const handleWeightSave = async (weight) => {
  if (!selectedTruck.value || isSubmitting.value) return
  const ok = await confirm({ title: 'Unloading Complete?', message: `Save Roll Weight: ${weight}kg for ${selectedTruck.value.plateNumber}?`, type: 'success', confirmText: 'Yes, Save' })
  if (ok) {
    isSubmitting.value = true
    await truckStore.updateTruckWeight(selectedTruck.value.id, 'rollWeight', weight)
    await truckStore.updateTruckStatus(selectedTruck.value.id, 'waiting', 'qc')
    toast.success(`Roll Weight ${weight}kg saved — proceed to QC.`)
    selectedTruck.value = null
    rollWeightInput.value = null
    isSubmitting.value = false
  }
}
</script>
