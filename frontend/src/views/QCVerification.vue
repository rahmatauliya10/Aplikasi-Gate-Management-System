<template>
  <div class="space-y-6">
    <PageHeader title="Quality Control" subtitle="Quality Control Analysis" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-sky-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <div class="flex items-center gap-2">
                <ProcessTimerBadge 
                  v-if="selectedTruck.qcStartAt || selectedTruck.weighInAt" 
                  :start-time="selectedTruck.qcStartAt || selectedTruck.weighInAt" 
                  :end-time="selectedTruck.qcEndAt"
                  :sla-minutes="15"
                  label="QC Timer"
                />
                <StatusBadge :status="selectedTruck.status" :process-type="getProcessType(selectedTruck)" class="shadow-sm" />
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3 relative z-10">
              <div class="col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(14,165,233,0.15)] transition-all duration-300">
                <span class="text-[9px] font-black text-sky-400 uppercase tracking-[0.15em] mb-1.5">Plate Number</span>
                <span class="text-xl font-black truncate font-mono tracking-widest" style="color:#ffffff;text-shadow:0 0 12px rgba(255,255,255,0.4)">{{ getPlateNumber(selectedTruck) }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Driver</span>
                <span class="text-sm font-black text-slate-800 truncate">{{ selectedTruck.driverName }}</span>
              </div>
              
              <div class="bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5">Process</span>
                <span class="text-sm font-black" :style="getProcessType(selectedTruck)==='GBB'?'color:#A0006D':getProcessType(selectedTruck)==='GBJ'?'color: #4A8BDF':'color: #4A8BDF'">{{ getProcessType(selectedTruck) }}</span>
              </div>
              
              <div class="col-span-2 flex justify-between items-center bg-white/80 p-3.5 rounded-xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                <span class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Warehouse Out</span>
                <span class="text-sm font-black text-slate-800 font-mono">{{ formatTime(getWarehouseEnd(selectedTruck)) }}</span>
              </div>
              
              <div v-if="getQcVehicleStartAt(selectedTruck)" class="col-span-2 flex justify-between items-center bg-sky-50/80 p-3.5 rounded-xl border border-sky-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] backdrop-blur-sm mt-1">
                <span class="text-[9px] font-black text-sky-600 uppercase tracking-[0.15em]">QC Started At</span>
                <span class="text-sm font-black text-sky-800 font-mono">{{ formatTime(getQcVehicleStartAt(selectedTruck)) }}</span>
              </div>
            </div>
            <div class="mt-5"><button @click="showDetailsModal = true" class="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest" style="color: #4A8BDF;background:rgba(74,139,223,0.05);border:1px solid rgba(74,139,223,0.15)"><span class="material-icons text-[16px]">visibility</span><span>View Full Analysis</span></button></div>
            <div class="mt-6 pt-5" style="border-top:1px solid #F1F5F9"><StepTimeline :current-step="selectedTruck.status" :process-type="getProcessType(selectedTruck)" /></div>

            <div class="mt-6 space-y-5">
              <!-- Stage 1: QC Sampling Awal (Pre-Unloading) for all process types -->
              <div v-if="selectedTruck.status === 'QC_VEHICLE_PENDING' || selectedTruck.status === 'QC_VEHICLE_IN_PROGRESS'" class="space-y-4">
                <button @click="openSamplingAwalModal(selectedTruck)" class="w-full py-4 rounded-2xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
                  style="background:linear-gradient(135deg,#6366f1,#3730a3);">
                  <span v-if="isProcessing" class="material-icons text-xl animate-spin">autorenew</span>
                  <span v-else class="material-icons text-xl">biotech</span>
                  <span class="text-base tracking-wide">{{ isProcessing ? 'Starting Sampling...' : (getProcessType(selectedTruck) === 'GBJ' ? '📋 Input QC Vehicle Checklist (GBJ)' : '🧪 Enter Initial QC Sampling (Pre-Unloading)') }}</span>
                </button>
              </div>

              <!-- Stage 3: QC Analisis Mutu Lengkap (Post-Unloading) for GBB & GSP -->
              <div v-else-if="selectedTruck.status === 'INCOMING_CHECK_PENDING' || selectedTruck.status === 'INCOMING_CHECK_IN_PROGRESS'" class="space-y-4">
                <button @click="openGbbModal(selectedTruck)" class="w-full py-4 rounded-2xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
                  style="background:linear-gradient(135deg,#10B981,#064e3b);">
                  <span v-if="isProcessing" class="material-icons text-xl animate-spin">autorenew</span>
                  <span v-else class="material-icons text-xl">science</span><span class="text-base tracking-wide">{{ isProcessing ? 'Starting QC Lab...' : '🔬 Enter Complete QC Lab Analysis (Post-Unloading)' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(59,130,246,0.06),rgba(74,139,223,0.03));border:1px solid rgba(59,130,246,0.1)"><span class="material-icons text-slate-600 text-3xl">fact_check</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start verification</p>
          </div>
        </div>
      </transition>

      <!-- Queue -->
      <div class="lg:col-span-1">
        <div class="flex flex-col h-[600px] ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
          <!-- Glossy Overlay -->
          <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
          
          <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex flex-col gap-5 z-10 relative">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">fact_check</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">QC Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <!-- Search (Left) -->
              <div class="relative group flex-1">
                <input v-model="searchQuery" type="text" placeholder="Search Truck ID" class="w-full h-10 pl-10 pr-10 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all shadow-sm group-hover:border-slate-300">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] group-focus-within:text-[#4A8BDF] transition-colors">search</span>
                <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#EF4444] transition-colors">
                  <span class="material-icons text-[16px]">close</span>
                </button>
              </div>
              <div class="relative group shrink-0">
                <select v-model="selectedWarehouse" class="h-10 pl-4 pr-10 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 transition-all shadow-sm appearance-none cursor-pointer group-hover:border-slate-300">
                  <option value="ALL">All Warehouses</option>
                  <option value="GBB">Raw Material Warehouse (GBB)</option>
                  <option value="GBJ">Finished Goods Warehouse (GBJ)</option>
                  <option value="GSP">Sparepart Warehouse (GSP)</option>
                </select>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[16px] group-focus-within:text-[#4A8BDF] transition-colors">filter_list</span>
              </div>
              <!-- Pending Counter (Far Right) -->
              <div class="flex items-center space-x-2.5 h-10 px-4 rounded-xl bg-white/80 backdrop-blur-sm shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-slate-100 shrink-0 hover:shadow-md transition-all duration-300">
                <div class="relative">
                  <span class="block w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
                  <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
                </div>
                <span class="text-[11px] font-black text-slate-700 tracking-[0.1em] uppercase whitespace-nowrap">{{ filteredQcTrucks.length }} PENDING</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedQcTrucks" :key="truck.id"
                @click="selectTruck(truck)"
                class="group relative bg-white/70 backdrop-blur-md p-5 rounded-[2rem] cursor-pointer transition-all duration-500 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden"
                :class="selectedTruck?.id === truck.id ? 'border-[#4A8BDF] shadow-[0_15px_40px_rgba(74,139,223,0.15)] -translate-y-1.5 bg-white/90' : 'hover:border-indigo-400 hover:border-opacity-40 hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1.5'"
              >
                <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300 bg-sky-500"
                  :style="{ opacity: selectedTruck?.id === truck.id ? '1' : '0.5' }"></div>
                
                <div class="flex justify-between items-start pl-3">
                  <div>
                    <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Process Type</div>
                    <div class="text-base font-black text-slate-900 font-mono tracking-tight">{{ getPlateNumber(truck) }}</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 font-mono border border-slate-200"
                    :style="getProcessType(truck)==='GBB'?'color:#A0006D':getProcessType(truck)==='GBJ'?'color: #4A8BDF':'color: #4A8BDF'">
                    {{ getProcessType(truck) }}
                  </div>
                </div>
                
                <div class="mt-4 flex justify-between items-end pl-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                      :class="(truck.status === 'QC_VEHICLE_PENDING' || truck.status === 'INCOMING_CHECK_PENDING') ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ getStepLabel(truck) }}
                    </span>
                    <ProcessTimerBadge 
                      v-if="truck.qcStartAt || truck.weighInAt" 
                      :start-time="truck.qcStartAt || truck.weighInAt" 
                      :end-time="truck.qcEndAt"
                      :sla-minutes="15"
                      :compact="true"
                    />
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-sky-500 text-[#4A8BDF] shadow-[0_4px_12px_rgba(14,165,233,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-sky-50 group-hover:text-sky-600'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredQcTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredQcTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredQcTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
    
    <!-- GBB Verification Modal -->
    <teleport to="body">
    <div v-if="showVerificationModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);">
      <div class="absolute inset-0" @click="showVerificationModal = false"></div>
      
      <div class="bg-white rounded-3xl shadow-2xl w-[95vw] sm:max-w-2xl mx-auto relative z-10 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <!-- Header -->
        <div class="bg-gradient-to-r from-[#EFF6FF] to-[#EEF2FF] px-6 py-5 border-b border-[#BFDBFE] flex justify-between items-center shrink-0">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-[#BFDBFE]">
              <span class="material-icons text-[#4A8BDF]">science</span>
            </div>
            <div>
              <h3 class="text-lg font-black text-indigo-900 tracking-tight">Quality Analysis</h3>
              <p class="text-xs font-bold text-indigo-600 tracking-wider uppercase">{{ selectedTruck?.plateNumber }}</p>
            </div>
          </div>
          <button @click="showVerificationModal = false" class="w-8 h-8 rounded-full bg-white/50 hover:bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
            <span class="material-icons text-xl">close</span>
          </button>
        </div>
        
        <!-- Body -->
        <div class="p-6 overflow-y-auto hide-scrollbar flex-1 space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Odor *</label>
              <div class="relative">
                <select v-model="qcForm.bau" class="w-full h-12 pl-4 pr-10 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer border border-slate-200 focus:border-[#4A8BDF] transition-colors">
                  <option value="" disabled>Select Odor Status</option><option value="Normal">Normal</option><option value="Abnormal">Abnormal</option>
                </select>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Color *</label>
              <div class="relative">
                <select v-model="qcForm.warna" class="w-full h-12 pl-4 pr-10 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer border border-slate-200 focus:border-[#4A8BDF] transition-colors">
                  <option value="" disabled>Select Color Status</option><option value="Normal">Normal</option><option value="Abnormal">Abnormal</option>
                </select>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Moisture Content *</label>
              <div class="relative">
                <input v-model.number="qcForm.kadarAir" type="number" step="0.01" class="w-full h-12 pl-4 pr-8 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-slate-200 focus:border-[#4A8BDF] transition-colors" placeholder="11.65">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black select-none">%</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Total FM *</label>
              <div class="relative">
                <input v-model.number="qcForm.totalFM" type="number" step="0.01" class="w-full h-12 pl-4 pr-8 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-slate-200 focus:border-[#4A8BDF] transition-colors" placeholder="0.56">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black select-none">%</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Good Beans *</label>
              <div class="relative">
                <input v-model.number="qcForm.bijiOK" type="number" step="0.01" class="w-full h-12 pl-4 pr-8 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-slate-200 focus:border-[#4A8BDF] transition-colors" placeholder="89.37">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black select-none">%</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Status *</label>
              <div class="relative">
                <select v-model="qcForm.status" class="w-full h-12 pl-4 pr-10 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer border border-slate-200 focus:border-[#4A8BDF] transition-colors">
                  <option value="" disabled>Select Final Status</option><option value="ACCEPTED">ACCEPTED</option><option value="ACCEPTED (Note)">ACCEPTED (Note)</option><option value="REJECTED">REJECTED</option>
                </select>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-[#4A8BDF] pointer-events-none text-lg">expand_more</span>
              </div>
            </div>
            
            <!-- PIC Form -->
            <div class="space-y-1.5 md:col-span-2 mt-2 pt-4 border-t border-slate-100">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <span class="material-icons text-[14px]">verified_user</span>
                <span>PIC / Verifier</span>
              </label>
              <div class="relative">
                <input v-model="qcForm.pic" type="text" readonly class="w-full h-12 pl-10 pr-4 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none border border-slate-200 select-none cursor-not-allowed">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">badge</span>
              </div>
              <p class="text-[9px] font-bold text-slate-400 mt-1">* PIC is automatically filled with the currently logged-in QC account.</p>
            </div>
            
            <div class="space-y-1.5 md:col-span-2">
              <label class="text-[10px] font-black text-indigo-800 uppercase tracking-wider flex items-center justify-between">
                <span>Notes / Concession Reason</span>
                <span v-if="qcForm.status === 'ACCEPTED (Note)' || qcForm.status === 'REJECTED'" class="text-red-500 font-bold">* Required for Approve with Note & Reject</span>
              </label>
              <textarea v-model="qcForm.note" class="w-full p-4 bg-slate-50 hover:bg-white focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none resize-none h-24 border border-slate-200 focus:border-[#4A8BDF] transition-colors placeholder:font-normal placeholder:text-slate-400" placeholder="Enter notes or reason for deviation / rejection..."></textarea>
            </div>
          </div>
        </div>
        
        <!-- 3-Way Industrial Decision Bar -->
        <div class="p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <button @click="verifyIncomingDecision(selectedTruck, 'REJECT')" :disabled="isProcessing" 
            class="flex-1 w-full py-3.5 px-4 rounded-xl font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50">
            <span class="material-icons text-lg">cancel</span>
            <span class="text-xs sm:text-sm tracking-wide uppercase">REJECT</span>
          </button>
          
          <button @click="verifyIncomingDecision(selectedTruck, 'APPROVE_NOTE')" :disabled="isProcessing" 
            class="flex-1 w-full py-3.5 px-4 rounded-xl font-black text-white bg-amber-500 hover:bg-amber-600 active:scale-95 flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50">
            <span class="material-icons text-lg">warning</span>
            <span class="text-xs sm:text-sm tracking-wide uppercase">APPROVE WITH NOTE</span>
          </button>
          
          <button @click="verifyIncomingDecision(selectedTruck, 'APPROVE_CLEAN')" :disabled="isProcessing" 
            class="flex-1 w-full py-3.5 px-4 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50">
            <span class="material-icons text-lg">verified</span>
            <span class="text-xs sm:text-sm tracking-wide uppercase">APPROVE</span>
          </button>
        </div>
      </div>
    </div>
    </teleport>

    <!-- Sampling Awal QC Modal (Pre-Unloading GBB/GSP) -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="showSamplingModal" class="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6" style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);" @click.self="showSamplingModal = false">
          <div class="relative w-[95vw] sm:max-w-xl mx-auto flex flex-col rounded-3xl shadow-2xl overflow-hidden bg-white">
            <!-- Header -->
            <div class="px-6 py-5 flex justify-between items-center bg-indigo-900 text-white">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-800 border border-indigo-700">
                  <span class="material-icons text-indigo-200 text-xl">biotech</span>
                </div>
                <div>
                  <h3 class="text-base font-black tracking-tight">Form QC Sampling Awal (Pre-Unloading)</h3>
                  <p class="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-0.5">Sampling Fisik Sebelum Bongkar GBB/GSP</p>
                </div>
              </div>
              <button @click="showSamplingModal = false" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-indigo-800 text-indigo-200 transition-colors">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            <!-- Body -->
            <div class="p-6 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-[10px] font-black text-slate-600 uppercase tracking-wider">Visual Physical Sample *</label>
                  <select v-model="samplingForm.visual" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none">
                    <option value="Normal">Normal / Meets Specifications</option>
                    <option value="Abnormal">Abnormal / Non-Compliant</option>
                  </select>
                </div>
                <div class="space-y-1.5">
                  <label class="text-[10px] font-black text-slate-600 uppercase tracking-wider">Initial Sample Odor *</label>
                  <select v-model="samplingForm.odor" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none">
                    <option value="Normal">Normal / Characteristic</option>
                    <option value="Abnormal">Abnormal / Musty / Rancid</option>
                  </select>
                </div>
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Estimated Moisture Content (%) *</span>
                  <span v-if="samplingForm.moistureEst === null || samplingForm.moistureEst === ''" class="text-red-500 font-bold text-[9px]">* Required</span>
                </label>
                <div class="relative">
                  <input v-model.number="samplingForm.moistureEst" type="number" step="0.1" placeholder="Example: 12.5" class="w-full h-11 pl-4 pr-8 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-sm font-bold text-slate-800 outline-none transition-all" />
                  <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black select-none">%</span>
                </div>
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-black text-slate-700 uppercase tracking-wider">Initial Sampling Notes</label>
                <textarea v-model="samplingForm.note" rows="3" placeholder="Enter initial physical sampling notes prior to unloading..." class="w-full p-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none resize-none transition-all"></textarea>
              </div>
            </div>
            <!-- Footer -->
            <div class="p-5 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button @click="submitSamplingAwal(selectedTruck, false)" :disabled="isProcessing" 
                class="flex-1 py-3.5 px-4 rounded-xl font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50">
                <span class="material-icons text-lg">cancel</span>
                <span class="text-xs sm:text-sm tracking-wide uppercase">REJECT SAMPLING</span>
              </button>
              
              <button @click="submitSamplingAwal(selectedTruck, true)" :disabled="isProcessing || !isSamplingValid" 
                class="flex-1 py-3.5 px-4 rounded-xl font-black text-white flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow-md active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                :class="!isSamplingValid ? 'bg-slate-300 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-700'">
                <span class="material-icons text-lg">verified</span>
                <span class="text-xs sm:text-sm tracking-wide uppercase">APPROVE SAMPLING AWAL</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- GBJ Inspection Modal (Vehicle Checklist) -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="showChecklistModal" class="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6" style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" @click.self="showChecklistModal = false">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md pointer-events-none"></div>
          <div class="relative w-[95vw] sm:max-w-3xl mx-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden" style="background:white;">
            <!-- Header -->
            <div class="px-8 py-5 flex justify-between items-center bg-slate-50 border-b border-slate-100 sticky top-0 z-10 shrink-0">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100/50 border border-blue-200">
                  <span class="material-icons text-[#4A8BDF] text-xl">fact_check</span>
                </div>
                <div>
                  <h3 class="text-base font-black text-slate-800 tracking-tight">Vehicle Checklist</h3>
                  <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Pre-loading Inspection</p>
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
                <button @click="showChecklistModal = false" class="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-slate-200 text-slate-500">
                  <span class="material-icons text-lg">close</span>
                </button>
              </div>
            </div>
            
            <!-- Body -->
            <div class="p-6 overflow-y-auto flex-1 custom-scrollbar" style="background:#FAFBFF;">
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
            <div class="px-8 py-5 border-t border-slate-100 bg-white shrink-0">
              <div v-if="!isChecklistComplete" class="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400">
                <span class="material-icons text-xl mb-1 animate-pulse">lock</span>
                <span class="text-[11px] font-black uppercase tracking-widest">Complete {{ checklistRemaining }} Checklist Items</span>
                <p class="text-[9px] font-bold mt-1 text-center">All items must be answered OK or NOT OK + photo attachment to proceed.</p>
              </div>
              <button v-else @click="acceptChecklistAndStart" :disabled="isProcessing" class="w-full flex justify-center items-center py-4 rounded-xl space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;">
                <span v-if="isProcessing" class="material-icons text-lg animate-spin">autorenew</span>
                <span class="text-sm font-black uppercase tracking-widest text-white">{{ isProcessing ? 'PROCESSING...' : 'Accept & Pass Verification' }}</span>
                <span v-if="!isProcessing" class="material-icons text-lg animate-bounce-right">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTruckStore } from '../stores/truckStore'
import { useAuthStore } from '../stores/authStore'
import { useQcStore } from '../stores/qcStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import ProcessTimerBadge from '../components/ProcessTimerBadge.vue'
import PageHeader from '../components/PageHeader.vue'
import StepTimeline from '../components/StepTimeline.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import Pagination from '../components/Pagination.vue'

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

const getQcVehicleStartAt = (truck) => {
  if (!truck) return null
  return truck.timestamps?.qcVehicleStartAt || null
}

const truckStore = useTruckStore()
const authStore = useAuthStore()

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[QCVerification] Mount-time fetch failed:', err.message)
  }
})
const qcStore = useQcStore()
const toast = useToast()
const { confirm } = useConfirm()
const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const showVerificationModal = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const selectedWarehouse = ref('ALL')
const qcForm = ref({ bau: '', warna: '', kadarAir: null, totalFM: null, bijiOK: null, status: '', note: '', pic: authStore.user?.name || 'QC Admin' })
const isProcessing = ref(false)

const showSamplingModal = ref(false)
const samplingForm = ref({ visual: 'Normal', odor: 'Normal', moistureEst: null, note: '' })

const isSamplingValid = computed(() => {
  return samplingForm.value.visual && 
         samplingForm.value.odor && 
         samplingForm.value.moistureEst !== null && 
         samplingForm.value.moistureEst !== '' && 
         !isNaN(Number(samplingForm.value.moistureEst))
})

const showChecklistModal = ref(false)
const checklistStates = ref([])
const vehicleChecklist = [
  "Tidak ditemukan hama / No pest found",
  "Bebas dari barang haram dan najis / Free of haram and najis material",
  "Truk dalam kondisi bersih dan tidak berbau / Truck in clean condition and odour free",
  "Tidak ditemukan bahan kimia atau kontaminan lain / No chemical or other contaminent found",
  "Terdapat alas jika lantai truk kotor atau berlubang / There is a cover if the floor is holey or dirty"
]

const qcTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PENDING' || t.status === 'INCOMING_CHECK_PENDING' || t.status === 'INCOMING_CHECK_IN_PROGRESS' || t.status === 'QC_VEHICLE_IN_PROGRESS') && (selectedWarehouse.value === 'ALL' || getProcessType(t) === selectedWarehouse.value)))
const filteredQcTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  return qcTrucks.value.filter(t => {
    if (keyword && !getPlateNumber(t).toLowerCase().includes(keyword)) return false
    return true
  })
})
const totalPages = computed(() => Math.ceil(filteredQcTrucks.value.length / 10) || 1)
const paginatedQcTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredQcTrucks.value.slice(start, end)
})

watch(filteredQcTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch([searchQuery, selectedWarehouse], () => { currentPage.value = 1 })

const selectTruck = (truck) => {
  selectedTruck.value = truck
  checklistStates.value = vehicleChecklist.map(() => ({ status: null, photo: null }))
  qcForm.value = { 
    bau: truck.qcDetails?.bau || '', 
    warna: truck.qcDetails?.warna || '', 
    kadarAir: truck.qcDetails?.kadarAir || null, 
    totalFM: truck.qcDetails?.totalFM || null, 
    bijiOK: truck.qcDetails?.bijiOK || null, 
    status: truck.qcDetails?.status || '', 
    note: truck.qcDetails?.note || '',
    pic: authStore.user?.name || 'QC Admin' 
  }
}

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

const acceptChecklistAndStart = () => {
  showChecklistModal.value = false
  // When explicit accept button is clicked, pass the verification (items and photos are stored for audit)
  verifyTruck(selectedTruck.value, true)
}

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const startQC = (truck) => { 
  // Normally we would just set state, but since it's already pending, we don't need to change status to processing.
  // We can just open the modal directly.
  showChecklistModal.value = true
}

const triggerStartQc = async (truck) => {
  if (truck.status === 'INCOMING_CHECK_PENDING' || truck.status === 'QC_VEHICLE_PENDING') {
    isProcessing.value = true;
    try {
      const response = await qcStore.startQcVehicle(truck.id, { inspector: authStore.user?.name || 'QC Admin' });
      const updatedTruck = response?.data || response;
      if (updatedTruck) {
        truckStore.upsertTruck(updatedTruck);
        selectedTruck.value = updatedTruck;
      }
    } catch(e) {
      toast.error('Gagal memulai QC');
      isProcessing.value = false;
      return false;
    }
    isProcessing.value = false;
  }
  return true;
}

const openSamplingAwalModal = async (truck) => {
  const success = await triggerStartQc(truck);
  if (success) {
    samplingForm.value = { visual: 'Normal', odor: 'Normal', moistureEst: null, note: '' };
    showSamplingModal.value = true;
  }
}

const submitSamplingAwal = async (truck, passed) => {
  if (isProcessing.value) return;

  if (passed && !isSamplingValid.value) {
    toast.error('Validasi gagal. Ketiga parameter wajib diisi (*): Fisik Visual, Bau Sampel, dan Estimasi Kadar Air!');
    return;
  }

  if (!passed && (!samplingForm.value.note || !samplingForm.value.note.trim())) {
    toast.error('Alasan penolakan wajib dicantumkan pada kolom catatan sampling!');
    return;
  }

  const actionText = passed ? 'Approve Sampling Awal' : 'Reject Sampling Awal';
  const ok = await confirm({
    title: `${actionText}?`,
    message: `Konfirmasi ${actionText.toLowerCase()} untuk armada ${getPlateNumber(truck)}?`,
    type: passed ? 'success' : 'danger',
    confirmText: passed ? 'Ya, Approve' : 'Ya, Reject'
  });

  if (ok) {
    isProcessing.value = true;
    try {
      const payload = {
        result: passed ? 'PASS' : 'REJECT',
        vehicleCleanliness: true,
        vehicleOdor: samplingForm.value.odor === 'Normal',
        pestEvidence: true,
        vehicleCondition: samplingForm.value.visual === 'Normal',
        documentCompleteness: true,
        sealCondition: true,
        checklistItems: {
          initialMoisture: Number(samplingForm.value.moistureEst),
          items: [
            { label: 'Sampling Visual', ok: samplingForm.value.visual === 'Normal' },
            { label: 'Sampling Bau', ok: samplingForm.value.odor === 'Normal' },
            { label: 'Estimasi Moisture', ok: true, value: Number(samplingForm.value.moistureEst) }
          ]
        },
        notes: samplingForm.value.note || (passed ? 'Lolos sampling awal QC' : 'Ditolak pada sampling awal QC')
      };

      const response = await qcStore.submitVehicleResult(truck.id, payload);
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);

      if (passed) {
        toast.success(`Sampling Awal ${getPlateNumber(truck)} disetujui. Siap dibongkar di Gudang GBB.`);
      } else {
        toast.error(`Sampling Awal ${getPlateNumber(truck)} DITOLAK.`);
      }

      selectedTruck.value = null;
      showSamplingModal.value = false;
    } catch (e) {
      toast.error('Gagal menyimpan hasil sampling awal');
    } finally {
      isProcessing.value = false;
    }
  }
};

const openGbbModal = async (truck) => {
  const success = await triggerStartQc(truck);
  if (success) showVerificationModal.value = true;
}

const openGbjModal = async (truck) => {
  const success = await triggerStartQc(truck);
  if (success) showChecklistModal.value = true;
}

const verifyIncomingDecision = async (truck, decisionType) => {
  if (isProcessing.value) return;

  if (decisionType === 'APPROVE_CLEAN' || decisionType === 'APPROVE_NOTE') {
    if (!qcForm.value.bau || !qcForm.value.warna || qcForm.value.kadarAir === null || qcForm.value.kadarAir === '' || qcForm.value.totalFM === null || qcForm.value.totalFM === '') {
      toast.error('Validasi gagal. Mohon lengkapi semua parameter hasil uji lab (*)!');
      return;
    }
  }

  if ((decisionType === 'APPROVE_NOTE' || decisionType === 'REJECT') && (!qcForm.value.note || !qcForm.value.note.trim())) {
    toast.error(decisionType === 'APPROVE_NOTE' ? 'Catatan / Alasan Konsesi Wajib Diisi untuk Approve with Note!' : 'Alasan penolakan wajib dicantumkan pada kolom catatan!');
    return;
  }

  const isPass = decisionType !== 'REJECT';
  const actionLabel = decisionType === 'APPROVE_NOTE' ? 'Approve with Note (Diterima Dengan Catatan)' : (isPass ? 'Approve' : 'Reject');
  const typeStyle = isPass ? 'success' : 'danger';
  const confirmBtnText = decisionType === 'APPROVE_NOTE' ? 'Ya, Diterima Dengan Catatan' : (isPass ? 'Approve' : 'Yes, Reject');

  const ok = await confirm({ title: `Konfirmasi ${actionLabel}?`, message: `Lanjutkan proses ${actionLabel} untuk truk bernomor polisi ${getPlateNumber(truck)}?`, type: typeStyle, confirmText: confirmBtnText });
  if (ok) {
    isProcessing.value = true;
    try {
      const finalNote = decisionType === 'APPROVE_NOTE' 
        ? `[DITERIMA DENGAN CATATAN] ${qcForm.value.note.trim()}` 
        : (qcForm.value.note || (isPass ? 'Lolos uji lab mutu GBB' : 'Ditolak hasil uji lab'));

      const payload = {
        result: isPass ? 'PASS' : 'REJECT',
        odor: qcForm.value.bau,
        color: qcForm.value.warna,
        moisture: Number(qcForm.value.kadarAir),
        foreignMatter: Number(qcForm.value.totalFM),
        sampleWeight: Number(qcForm.value.bijiOK || 0),
        beanCondition: Number(qcForm.value.bijiOK || 100) >= 80,
        notes: finalNote
      };

      const response = await qcStore.submitIncomingResult(truck.id, payload);
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);

      if (isPass) {
        toast.success(`Analisis Mutu ${getPlateNumber(truck)} disetujui (${decisionType === 'APPROVE_NOTE' ? 'Dengan Catatan' : 'Clean'}). Lanjutkan ke Weighbridge Out.`);
      } else {
        toast.error(`Analisis Mutu ${getPlateNumber(truck)} DITOLAK.`);
      }

      selectedTruck.value = null;
      showVerificationModal.value = false;
    } catch (e) {
      toast.error('Gagal menyimpan analisis mutu');
    } finally {
      isProcessing.value = false;
    }
  }
};

const verifyTruck = async (truck, passed) => {
  if (isProcessing.value) return;
  const isStage3Incoming = truck.status === 'INCOMING_CHECK_IN_PROGRESS' || truck.status === 'INCOMING_CHECK_PENDING';

  if (isStage3Incoming && passed) {
    if (!qcForm.value.bau || !qcForm.value.warna || qcForm.value.kadarAir === null || qcForm.value.kadarAir === '' || qcForm.value.totalFM === null || qcForm.value.totalFM === '' || !qcForm.value.status) {
      toast.error('Validasi gagal. Mohon lengkapi semua field yang wajib diisi (*)!');
      return;
    }
  }

  const actionText = passed ? 'Approve' : 'Reject';
  const result = passed ? 'PASS' : 'REJECT';
  
  const ok = await confirm({ title: `${actionText} Verification?`, message: `${actionText} verification for ${getPlateNumber(truck)}?`, type: passed ? 'success' : 'danger', confirmText: passed ? 'Approve' : 'Yes, Reject' })
  if (ok) { 
    isProcessing.value = true;
    try {
      let response;
      if (isStage3Incoming) {
        response = await qcStore.submitIncomingResult(truck.id, { 
          result,
          odor: qcForm.value.bau,
          color: qcForm.value.warna,
          moisture: Number(qcForm.value.kadarAir),
          foreignMatter: Number(qcForm.value.totalFM),
          sampleWeight: Number(qcForm.value.bijiOK || 0),
          beanCondition: Number(qcForm.value.bijiOK || 100) >= 80,
          notes: qcForm.value.note
        })
      } else {
        const payload = { 
          result,
          pestEvidence: checklistStates.value[0]?.status === 'ok',
          documentCompleteness: checklistStates.value[1]?.status === 'ok',
          vehicleCleanliness: checklistStates.value[2]?.status === 'ok',
          vehicleOdor: checklistStates.value[3]?.status === 'ok',
          sealCondition: checklistStates.value[4]?.status === 'ok',
          vehicleCondition: true,
          checklistItems: checklistStates.value.map((s, idx) => ({
            label: vehicleChecklist[idx] || 'Checklist item',
            ok: s.status === 'ok',
            photo: s.photo || null
          })),
          notes: passed ? 'Lolos sampling awal QC' : 'Ditolak pada sampling awal QC'
        };
        response = await qcStore.submitVehicleResult(truck.id, payload)
      }
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);
      
      if (passed) {
        toast.success(`${getPlateNumber(truck)} verification passed! ${isStage3Incoming ? 'Proceed to Outbound Weighbridge.' : 'Proceed to Unloading / Warehouse.'}`);
      } else {
        toast.error(`${getPlateNumber(truck)} verification rejected.`); 
      }
      
      selectedTruck.value = null; 
      showVerificationModal.value = false;
      showChecklistModal.value = false;
    } catch(e) {} finally { isProcessing.value = false; }
  }
}
</script>

