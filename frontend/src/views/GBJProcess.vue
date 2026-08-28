<template>
  <div class="space-y-6">
    <PageHeader title="Finished Goods Warehouse" subtitle="Loading Operations" />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <transition name="fade-slide" mode="out-in" appear>
        <div v-if="selectedTruck" :key="selectedTruck.id" class="space-y-5 w-full">
          <div class="ind-container p-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h2 class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-[0.2em]">Active Operation</h2>
                <h3 class="text-xl font-black text-slate-800 tracking-tight mt-0.5">Truck Details</h3>
              </div>
              <StatusBadge :status="selectedTruck.status" class="shadow-sm" />
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
                <span class="text-sm font-black text-indigo-600">Loading</span>
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
            <!-- Loading Phase: Weight + Delivery Note Input -->
            <div class="mt-6 space-y-4" v-if="selectedTruck.status === 'WAREHOUSE_IN_PROGRESS'">
              <transition name="fade-slide" mode="out-in">
                <WeightInput v-if="capturedWeight === null" label="Input Actual Weight GBJ (KG)" @save="handleWeightCapture" />
                
                <div v-else class="flex flex-col space-y-4">
                  <!-- Captured Weight Display -->
                  <div class="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl shadow-[inset_0_2px_10px_rgba(16,185,129,0.05)]">
                    <div class="flex items-center space-x-4">
                      <div class="w-10 h-10 rounded-lg bg-emerald-100/50 border border-emerald-200 flex items-center justify-center">
                        <span class="material-icons text-emerald-600 text-xl">verified</span>
                      </div>
                      <div>
                        <h4 class="text-[11px] font-black text-slate-800 uppercase tracking-widest">Weight Captured</h4>
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Total Kilograms (IC)</p>
                      </div>
                    </div>
                    <div class="flex items-center space-x-5">
                      <span class="text-2xl font-black text-emerald-600 font-mono tracking-tight">{{ capturedWeight }} <span class="text-sm">KG</span></span>
                      <button @click="capturedWeight = null" class="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-[#A0006D] hover:border-[#A0006D]/30 transition-all shadow-sm" title="Edit Weight">
                        <span class="material-icons text-[16px]">edit</span>
                      </button>
                    </div>
                  </div>

                  <!-- Delivery Checklist Trigger Button -->
                  <button @click="showDeliveryModal = true" class="w-full py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(160,0,109,0.3)] active:scale-[0.98] border border-transparent" style="background:linear-gradient(135deg,#A0006D,#800057);color:white;transform:translateZ(0)">
                    <span class="material-icons text-xl">assignment_turned_in</span>
                    <span class="font-black tracking-widest uppercase">Fill Delivery Checklist</span>
                  </button>
                </div>
              </transition>
            </div>
            <div class="mt-6" v-if="selectedTruck.status === 'QC_VEHICLE_PASSED'">
              <button @click="startLoadingProcess" :disabled="isProcessing" class="w-full py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-[0_8px_25px_rgba(74,139,223,0.3)] active:scale-[0.98]" style="background:linear-gradient(135deg,#4A8BDF,#3A6ABF);color:white;transform:translateZ(0)">
                <span v-if="isProcessing" class="material-icons animate-spin text-xl">autorenew</span>
                <span v-else class="material-icons text-xl">play_arrow</span>
                <span class="font-black tracking-widest uppercase">Start Loading Process</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else :key="'empty'" class="ind-container flex items-center justify-center p-12 min-h-[400px] w-full" style="border:1px dashed rgba(74,139,223,0.15)">
          <div class="text-center space-y-3">
            <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center animate-gentle-float" style="background:linear-gradient(135deg,rgba(74,139,223,0.06),rgba(160,0,109,0.03));border:1px solid rgba(74,139,223,0.1)"><span class="material-icons text-slate-600 text-3xl">warehouse</span></div>
            <p class="text-slate-700 font-bold text-sm">Select a truck from the queue to start loading</p>
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
                <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">warehouse</span>
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight">GBJ Queue</h2>
                <div class="flex items-center mt-0.5 space-x-2">
                  <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div class="relative">
                <input v-model="searchQuery" type="text" placeholder="Search Plate Number..." class="w-56 h-10 pl-10 pr-10 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm" />
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
                <span class="text-xs font-black text-slate-700 tracking-wider">{{ filteredGbjTrucks.length }} PENDING TRUCKS</span>
              </div>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar relative">
            <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
            
            <transition-group name="list" tag="div" class="relative z-10 space-y-3">
              <div v-for="(truck, i) in paginatedGbjTrucks" :key="truck.id"
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
                      :class="truck.status === 'WAREHOUSE_IN_PROGRESS' ? 'bg-[#E6F0FA] text-indigo-600 border border-indigo-200' : 'bg-slate-50 text-slate-700 border border-slate-200'">
                      {{ getStepLabel(truck) }}
                    </span>
                  </div>
                  <button class="relative overflow-hidden px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300"
                    :class="selectedTruck?.id === truck.id ? 'bg-[#4A8BDF] text-white shadow-[0_4px_12px_rgba(74,139,223,0.4)]' : 'bg-slate-100 text-slate-600 group-hover:bg-[#E6F0FA] group-hover:text-indigo-600'">
                    {{ selectedTruck?.id === truck.id ? 'Selected' : 'Select' }}
                  </button>
                </div>
              </div>
              
              <div v-if="filteredGbjTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative z-10">
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
          <div class="relative z-20 bg-white/50 backdrop-blur-md" v-if="filteredGbjTrucks.length > 0">
            <Pagination :current-page="currentPage" :total-items="filteredGbjTrucks.length" @update:current-page="currentPage = $event" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- Delivery Checklist Modal -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="showDeliveryModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" @click.self="showDeliveryModal = false">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md pointer-events-none"></div>
          <div class="relative w-[95vw] sm:max-w-3xl mx-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden" style="background:white;">
            
            <!-- Header -->
            <div class="px-8 py-5 flex justify-between items-center bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-pink-50 border border-[#A0006D]/20">
                  <span class="material-icons text-[#A0006D] text-xl">fact_check</span>
                </div>
                <div>
                  <h3 class="text-base font-black text-slate-800 tracking-tight">Delivery Checklist</h3>
                  <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Product & Document Inspection</p>
                </div>
              </div>
              <button @click="showDeliveryModal = false" class="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-slate-200 text-slate-500">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            
            <!-- Body -->
            <div class="p-8 overflow-y-auto" style="background:#FAFBFF;">
              <div class="space-y-8">
                <!-- Top Info Section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <!-- Date (Auto) -->
                  <div class="space-y-2">
                    <label class="text-[11px] font-black text-slate-600 uppercase tracking-wider">Date</label>
                    <input type="text" :value="currentDateStr" disabled class="w-full h-12 px-4 bg-slate-50 rounded-xl text-sm font-bold text-slate-500 outline-none border border-slate-200" />
                  </div>
                  
                  <!-- Product Type Dropdown -->
                  <div class="space-y-2">
                    <label class="text-[11px] font-black text-slate-600 uppercase tracking-wider">Product Type</label>
                    <div class="relative">
                      <select v-model="deliveryForm.productType" class="w-full h-12 px-4 appearance-none bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-slate-200 focus:border-[#A0006D]">
                        <option value="" disabled>Select Product Type</option>
                        <option v-for="pt in productTypes" :key="pt" :value="pt">{{ pt }}</option>
                      </select>
                      <span class="material-icons absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                    </div>
                  </div>

                  <!-- Customer -->
                  <div class="space-y-2">
                    <label class="text-[11px] font-black text-slate-600 uppercase tracking-wider">Customer Destination</label>
                    <input type="text" v-model="deliveryForm.customer" @input="deliveryForm.customer = deliveryForm.customer.toUpperCase()" class="w-full h-12 px-4 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-slate-200 focus:border-[#A0006D] uppercase" placeholder="ENTER CUSTOMER NAME" />
                  </div>

                  <!-- Delivery Note (Surat Jalan Number) -->
                  <div class="space-y-2">
                    <label class="text-[11px] font-black text-[#A0006D] uppercase tracking-wider">Delivery Note (SJ) No. *</label>
                    <input type="text" v-model="sjInput" @input="sjInput = sjInput.toUpperCase()" class="w-full h-12 px-4 bg-white rounded-xl text-sm font-bold text-slate-800 outline-none border border-[#A0006D]/30 focus:border-[#A0006D] uppercase placeholder:font-normal placeholder:text-slate-300" placeholder="SJ-XXXXX" />
                  </div>
                </div>

                <!-- Checklists Section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- Checklist 1: Product Condition -->
                  <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-full">
                    <h4 class="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center pb-3 border-b border-slate-100">
                      <span class="material-icons text-[18px] mr-2 text-indigo-500">inventory_2</span> Product Condition
                    </h4>
                    <div class="space-y-3">
                      <label v-for="(item, idx) in productConditionList" :key="'pc'+idx" class="flex items-start space-x-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all">
                        <div class="mt-0.5 relative flex items-center justify-center shrink-0">
                          <input type="checkbox" v-model="deliveryForm.productCondition[idx]" class="peer sr-only" />
                          <div class="w-6 h-6 rounded-md border-2 border-slate-300 peer-checked:border-[#A0006D] peer-checked:bg-[#A0006D] transition-all flex items-center justify-center">
                            <span class="material-icons text-white text-[16px] opacity-0 peer-checked:opacity-100 transition-opacity transform scale-50 peer-checked:scale-100">check</span>
                          </div>
                        </div>
                        <div class="flex items-center flex-wrap gap-1.5 pt-0.5">
                          <span class="text-[13px] font-bold text-slate-700 select-none leading-snug">{{ item.label }}</span>
                          <span v-if="item.optional" class="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider select-none">(Opsional)</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <!-- Checklist 2: Document Availability -->
                  <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-full">
                    <h4 class="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center pb-3 border-b border-slate-100">
                      <span class="material-icons text-[18px] mr-2 text-indigo-500">folder_open</span> Document Availability
                    </h4>
                    <div class="space-y-3">
                      <label v-for="(item, idx) in documentList" :key="'doc'+idx" class="flex items-start space-x-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all">
                        <div class="mt-0.5 relative flex items-center justify-center shrink-0">
                          <input type="checkbox" v-model="deliveryForm.documentAvailability[idx]" class="peer sr-only" />
                          <div class="w-6 h-6 rounded-md border-2 border-slate-300 peer-checked:border-[#A0006D] peer-checked:bg-[#A0006D] transition-all flex items-center justify-center">
                            <span class="material-icons text-white text-[16px] opacity-0 peer-checked:opacity-100 transition-opacity transform scale-50 peer-checked:scale-100">check</span>
                          </div>
                        </div>
                        <div class="flex items-center flex-wrap gap-1.5 pt-0.5">
                          <span class="text-[13px] font-bold text-slate-700 select-none leading-snug">{{ item.label }}</span>
                          <span v-if="item.optional" class="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider select-none">(Opsional)</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="px-8 py-5 border-t border-slate-100 bg-white sticky bottom-0 z-10">
              <button
                @click="handleFinalSave"
                :disabled="!canSaveGBJ || isProcessing"
                class="relative w-full py-4 rounded-xl overflow-hidden transition-all duration-300 group flex items-center justify-center space-x-2"
                :class="(!canSaveGBJ || isProcessing) ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-gradient-to-r from-[#A0006D] to-[#800057] text-white hover:shadow-[0_8px_25px_rgba(160,0,109,0.3)] active:scale-[0.98] border border-transparent'"
              >
                <div v-if="canSaveGBJ && !isProcessing" class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none"></div>
                <span v-if="isProcessing" class="material-icons font-bold text-lg relative z-10 transition-transform animate-spin">autorenew</span>
                <span v-else class="material-icons font-bold text-lg relative z-10 transition-transform group-hover:scale-110">verified</span>
                <span class="uppercase font-black tracking-widest text-xs relative z-10">{{ isProcessing ? 'PROCESSING...' : 'Complete Loading & Save' }}</span>
              </button>
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
import { ref, computed, watch, reactive, onMounted } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useWarehouseStore } from '../stores/warehouseStore'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import StatusBadge from '../components/StatusBadge.vue'
import StepTimeline from '../components/StepTimeline.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import WeightInput from '../components/WeightInput.vue'
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
  const step = truck.step || truck.status || '-'
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

const truckStore = useTruckStore()
const warehouseStore = useWarehouseStore()
const toast = useToast()
const { confirm } = useConfirm()

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[GBJProcess] Mount-time fetch failed, using store cache:', err.message)
  }
})

const selectedTruck = ref(null)
const showDetailsModal = ref(false)
const currentPage = ref(1)
const searchQuery = ref('')
const isProcessing = ref(false)
const gbjTrucks = computed(() => truckStore.trucks.filter(t => (t.status === 'QC_VEHICLE_PASSED' || t.status === 'WAREHOUSE_IN_PROGRESS') && getProcessType(t) === 'GBJ'))
const filteredGbjTrucks = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  if (!keyword) return gbjTrucks.value
  return gbjTrucks.value.filter(t => getPlateNumber(t).toLowerCase().includes(keyword))
})
const totalPages = computed(() => Math.ceil(filteredGbjTrucks.value.length / 10) || 1)
const paginatedGbjTrucks = computed(() => {
  const start = (currentPage.value - 1) * 10
  const end = start + 10
  return filteredGbjTrucks.value.slice(start, end)
})

watch(filteredGbjTrucks, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = 1
  }
})
watch(searchQuery, () => { currentPage.value = 1 })
const sjInput = ref('')
const capturedWeight = ref(null)

const deliveryForm = reactive({
  productType: '',
  customer: '',
  productCondition: [false, false, false, false],
  documentAvailability: [false, false, false, false]
})

const productTypes = ['SIC 18 T', 'SIC 01 PC', 'SIC 25 BR', 'SIC 8590 SD', 'SIC 9010 M3', 'SIC 18 C1']

const productConditionList = [
  { label: "Menggunakan pallet / Using pallet", optional: true },
  { label: "Dalam kondisi baik / In good condition", optional: false },
  { label: "Jenis dan jumlah barang sudah tepat / Product type and quantity are correct", optional: false },
  { label: "Disusun dengan baik / Good stacking condition", optional: false }
]

const documentList = [
  { label: "Surat jalan / Delivery note", optional: false },
  { label: "Dokumen hasil analisa / Certificate of Analysis", optional: true },
  { label: "Dokumen Halal / Certificate of Halal", optional: true },
  { label: "Surat pesanan / Purchasing order", optional: true }
]

const currentDateStr = computed(() => {
  const d = new Date()
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
})

const canSaveGBJ = computed(() => {
  const isWeightValid = capturedWeight.value !== null && capturedWeight.value > 0
  const isSjValid = sjInput.value.trim().length > 0
  const isFormValid = deliveryForm.productType !== '' && deliveryForm.customer.trim().length > 0
  
  // Hanya item wajib yang harus bernilai true (item optional bebas true/false)
  const isProductConditionValid = productConditionList.every((item, idx) => item.optional || deliveryForm.productCondition[idx] === true)
  const isDocumentValid = documentList.every((item, idx) => item.optional || deliveryForm.documentAvailability[idx] === true)
  
  return isWeightValid && isSjValid && isFormValid && isProductConditionValid && isDocumentValid
})

const showDeliveryModal = ref(false)
const startLoadingProcess = async () => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const response = await warehouseStore.startProcess(selectedTruck.value.id, { remarks: 'Loading process started' });
    const updatedTruck = response?.data || response;
    if (updatedTruck) truckStore.upsertTruck(updatedTruck);
    toast.success('Loading process started.')
  } catch(e) {} finally { isProcessing.value = false; }
}


const selectTruck = (truck) => { 
  selectedTruck.value = truck; 
  sjInput.value = ''; 
  capturedWeight.value = null; 
  deliveryForm.productType = '';
  deliveryForm.customer = '';
  deliveryForm.productCondition = [false, false, false, false];
  deliveryForm.documentAvailability = [false, false, false, false];
}
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const handleWeightCapture = (weight) => {
  capturedWeight.value = weight
  toast.success(`Weight ${weight}kg captured. Please input Delivery Note.`)
}

const handleFinalSave = async () => {
  if (!selectedTruck.value) return
  if (!canSaveGBJ.value) {
    toast.warning('Please complete all required fields before saving.')
    return
  }
  if (isProcessing.value) return;
  const ok = await confirm({ 
    title: 'Loading Complete?', 
    message: `Save ${capturedWeight.value}kg (IC) and Delivery Checklist for ${selectedTruck.value.plateNumber}?`, 
    type: 'success', 
    confirmText: 'Yes, Save' 
  })
  if (ok) {
    isProcessing.value = true;
    try {
      const truckId = selectedTruck.value.id
      const payload = {
        actualWeight: capturedWeight.value,
        suratJalanNumber: sjInput.value,
        deliveryChecklist: {
          date: currentDateStr.value,
          productType: deliveryForm.productType,
          customer: deliveryForm.customer,
          productCondition: [...deliveryForm.productCondition],
          documentAvailability: [...deliveryForm.documentAvailability]
        }
      }
      const response = await warehouseStore.completeProcess(truckId, payload)
      const updatedTruck = response?.data || response;
      if (updatedTruck) truckStore.upsertTruck(updatedTruck);
      toast.success(`Saved! ${selectedTruck.value.plateNumber} → Weighbridge Out Queue.`)
      // Reset all state
      showDeliveryModal.value = false
      selectedTruck.value = null
      sjInput.value = ''
      capturedWeight.value = null
      deliveryForm.productType = ''
      deliveryForm.customer = ''
      deliveryForm.productCondition = [false, false, false, false]
      deliveryForm.documentAvailability = [false, false, false, false]
    } catch(e) {} finally { isProcessing.value = false; }
  }
}
</script>

