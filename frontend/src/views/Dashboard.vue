<template>
  <div class="space-y-8 pb-10">
    <!-- Header -->
    <PageHeader title="Dashboard Center" :subtitle="periodSubtitle">
      <DashboardFilterBar v-model="filterState" :loading="isFetching" @change="handleFilterChange" />
    </PageHeader>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5" :class="{ 'opacity-85 transition-opacity duration-300': isFetching }">
      <div class="ind-card p-4 sm:p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-1 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-slate-300 opacity-40 group-hover:bg-[#4A8BDF] transition-colors"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-slate-100 text-slate-500 group-hover:bg-slate-200">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">local_shipping</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Area</span>
        </div>
        <div>
          <p class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter font-mono animate-number-pop">{{ totalTrucks }}</p>
          <p class="text-[10px] sm:text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Trucks Processed</p>
        </div>
      </div>

      <div class="ind-card p-4 sm:p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-2 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#4A8BDF] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#4A8BDF]/10 text-[#4A8BDF]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">task_alt</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Completed</span>
        </div>
        <div>
          <p class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter font-mono animate-number-pop stagger-1">{{ completedTruckCount }}</p>
          <p class="text-[10px] sm:text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Successfully Exited</p>
        </div>
      </div>

      <div class="ind-card p-4 sm:p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-3 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#A0006D] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#A0006D]/10 text-[#A0006D]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">speed</span>
          </div>
          <div class="text-right">
             <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block">Target TAT</span>
             <span class="text-[10px] sm:text-xs font-bold text-[#A0006D] block font-mono">{{ targetTat }}m</span>
          </div>
        </div>
        <div>
           <p class="text-3xl sm:text-4xl font-black tracking-tighter font-mono" :class="avgTotalTAT > targetTat ? 'text-red-500' : 'text-slate-900'">{{ avgTotalTAT }}<span class="text-lg sm:text-xl font-bold ml-1 text-slate-500">m</span></p>
          <p class="text-[10px] sm:text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Turnaround Time</p>
        </div>
      </div>

      <div class="ind-card p-4 sm:p-6 transition-all duration-500 group hover:-translate-y-1.5 animate-fadeInUp stagger-4 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[#4A8BDF] opacity-40 group-hover:opacity-100 transition-opacity"></div>
        <div class="absolute -right-4 -bottom-4 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity"><span class="material-icons text-7xl sm:text-9xl text-[#4A8BDF]">radar</span></div>
        <div class="flex items-center justify-between mb-4 relative z-10">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-[#4A8BDF]/10 text-[#4A8BDF]">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">factory</span>
          </div>
          <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active Inside</span>
        </div>
        <div class="relative z-10">
           <p class="text-3xl sm:text-4xl font-black text-[#4A8BDF] tracking-tighter font-mono animate-number-pop stagger-3">{{ activeTruckCount }}</p>
          <p class="text-[10px] sm:text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Currently in Factory</p>
        </div>
      </div>
    </div>

    <!-- Analytics Dashboard Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6" :class="{ 'opacity-85 transition-opacity duration-300': isFetching }">
      
      <!-- Fraud Monitor -->
      <div class="xl:col-span-2 space-y-6">
       <div class="rounded-2xl shadow-card overflow-hidden relative" style="background:white;border:1px solid #E8EEF7">
           <!-- Subtle Background Pattern -->
           <div class="absolute inset-0 pointer-events-none opacity-[0.015]" style="background-image: radial-gradient(#4A8BDF 1px, transparent 1px); background-size: 20px 20px;"></div>

           <!-- Header -->
           <div class="relative z-10 px-5 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-0" style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
             <div>
               <div class="flex items-center space-x-2 mb-1">
                 <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.12)">
                   <span class="material-icons text-red-400 text-lg">gavel</span>
                 </div>
                 <h2 class="text-base sm:text-lg font-black text-slate-900 tracking-tight">Weighbridge Deviation Monitor</h2>
               </div>
               <p class="text-[10px] sm:text-xs font-bold text-slate-500 ml-0 sm:ml-11 mt-2 sm:mt-0">Real-time deviation check between Weighbridge and Area Scale.</p>
             </div>
             <div class="text-left sm:text-right shrink-0">
               <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Tolerance Limit</span>
               <div class="px-3 py-1.5 rounded-lg text-xs font-black inline-block" style="background:rgba(239,68,68,0.06);color:#EF4444;border:1px solid rgba(239,68,68,0.12)">
                 &gt; {{ targetDeviation }}% Deviation
               </div>
             </div>
           </div>

           <div class="relative z-10 p-5 sm:p-8">
             <!-- Deviation Stats -->
             <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div v-for="type in ['GBB', 'GBJ', 'GSP']" :key="type" class="p-4 sm:p-5 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md group"
                     :style="type === 'GBB' ? 'background:linear-gradient(135deg,#FFF7ED,#FFF1F2);border:1px solid #FDDCB5' : type === 'GBJ' ? 'background:linear-gradient(135deg,#EEF2FF,#F0F5FF);border:1px solid #C7D2FE' : 'background:linear-gradient(135deg,#ECFDF5,#F0FDF4);border:1px solid #A7F3D0'">
                  <span class="text-[10px] font-black uppercase tracking-widest block mb-2 sm:mb-3"
                        :class="type === 'GBB' ? 'text-amber-600' : type === 'GBJ' ? 'text-indigo-500' : 'text-emerald-600'">{{ type }} Deviation</span>
                  <div class="flex items-end justify-between">
                    <div>
                      <span class="text-2xl sm:text-3xl font-black font-mono tracking-tighter" :class="getDiscrepancyColor(getStatFor(type).avgDiscrepancy)">
                        {{ getStatFor(type).avgDiscrepancy.toFixed(2) }}%
                      </span>
                      <span class="text-[9px] sm:text-[10px] text-slate-400 uppercase font-black ml-1">AVERAGE</span>
                    </div>
                    <span class="material-icons text-2xl sm:text-3xl transition-transform duration-300 group-hover:scale-110"
                          :class="type === 'GBB' ? 'text-amber-200' : type === 'GBJ' ? 'text-indigo-200' : 'text-emerald-200'">{{ type === 'GBB' ? 'category' : type === 'GBJ' ? 'check_box' : 'science' }}</span>
                  </div>
                </div>
             </div>

             <!-- Alerts Table -->
             <div>
                <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest pl-3 mb-4 flex items-center" style="border-left:3px solid #EF4444">
                  Active Investigations ({{ alertList.length }})
                </h3>
                 <div v-if="alertList.length > 0" class="overflow-x-auto rounded-xl relative" style="background:white;border:1px solid #E8EEF7">
                  <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
                  <table class="w-full relative z-10 min-w-[500px]">
                    <thead>
                      <tr style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
                        <th v-for="h in ['Plate / ID','Warehouse','Net WB (kg)','Actual Area (kg)','Deviation']" :key="h"
                            class="px-4 sm:px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider"
                            :class="h==='Deviation'?'text-red-500 text-right':h.includes('(kg)')?'text-right text-slate-400':'text-slate-400'">{{ h }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="alert in paginatedAlertList" :key="alert.id" class="transition-colors hover:bg-slate-50/60" style="border-top:1px solid rgba(241,245,249,0.5)">
                        <td class="px-4 sm:px-5 py-3 whitespace-nowrap">
                          <span class="text-[11px] sm:text-xs font-black text-[#4A8BDF] bg-[#E6F0FA] px-2 py-1 rounded-lg">{{ alert.plate }}</span>
                        </td>
                        <td class="px-4 sm:px-5 py-3 whitespace-nowrap">
                          <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg"
                                :style="alert.type==='GBB'?'color:#A0006D;background:rgba(160,0,109,0.06)':alert.type==='GBJ'?'color:#4A8BDF;background:rgba(74,139,223,0.06)':'color:#059669;background:rgba(5,150,105,0.06)'">{{ alert.type }}</span>
                        </td>
                        <td class="px-4 sm:px-5 py-3 whitespace-nowrap text-[11px] sm:text-xs font-mono font-bold text-slate-600 text-right">{{ alert.net.toLocaleString() }}</td>
                        <td class="px-4 sm:px-5 py-3 whitespace-nowrap text-[11px] sm:text-xs font-mono font-bold text-slate-600 text-right">{{ alert.processed.toLocaleString() }}</td>
                        <td class="px-4 sm:px-5 py-3 whitespace-nowrap text-right">
                           <span class="px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-black font-mono" style="background:rgba(239,68,68,0.08);color:#EF4444;border:1px solid rgba(239,68,68,0.15)">
                             {{ alert.diffPercent }}%
                           </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <!-- Pagination Controls for Alerts -->
                  <div v-if="totalAlertPages > 1" class="flex justify-between items-center px-4 sm:px-5 py-3 border-t border-slate-100 bg-[#FAFBFF] relative z-20">
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Showing {{ (alertPage - 1) * alertPerPage + 1 }}-{{ Math.min(alertPage * alertPerPage, alertList.length) }} of {{ alertList.length }}
                    </span>
                    <div class="flex items-center space-x-2">
                      <button 
                        @click="alertPage > 1 ? alertPage-- : null"
                        :disabled="alertPage === 1"
                        class="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                      >
                        <span class="material-icons text-sm block">chevron_left</span>
                      </button>
                      <span class="text-[10px] font-black font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {{ alertPage }} / {{ totalAlertPages }}
                      </span>
                      <button 
                        @click="alertPage < totalAlertPages ? alertPage++ : null"
                        :disabled="alertPage === totalAlertPages"
                        class="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                      >
                        <span class="material-icons text-sm block">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="p-10 rounded-2xl text-center" style="background:#FAFBFF;border:1px dashed #D5DDE8">
                   <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style="background:rgba(74,139,223,0.06);border:1px solid rgba(74,139,223,0.1)">
                     <span class="material-icons text-[#4A8BDF] text-2xl">verified_user</span>
                   </div>
                   <p class="text-sm font-black text-slate-700">No Critical Deviations Detected</p>
                   <p class="text-xs font-bold text-slate-400 mt-1">All weighbridge data is within safe tolerance limits.</p>
                </div>
             </div>
           </div>
        </div>
      </div>

      <!-- Bottlenecks -->
      <div class="xl:col-span-1">
        <div class="p-8 rounded-2xl shadow-card h-full flex flex-col" style="background:white;border:1px solid #E8EEF7">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="text-lg font-black text-slate-900 tracking-tight flex items-center"><span class="material-icons text-[#4A8BDF] mr-2 text-xl">model_training</span> Bottlenecks</h3>
              <p class="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Global Process Times (AVG)</p>
            </div>
          </div>
          
          <div class="flex-1 flex flex-col justify-center space-y-6">
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">Gate → WB IN</span>
                <span class="text-lg font-black text-slate-800 font-mono">{{ avgStageTimes.waitingIn }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000 animate-fill" style="background:linear-gradient(90deg,#818CF8,#3A6ABF)" :style="{ width: Math.min(avgStageTimes.waitingIn * 5, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">Warehouse</span>
                <span class="text-lg font-black text-orange-600 font-mono">{{ avgStageTimes.warehouse }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000 animate-fill stagger-2" style="background:linear-gradient(90deg,#FBBF24,#A0006D)" :style="{ width: Math.min(avgStageTimes.warehouse * 2, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">QC Verify</span>
                <span class="text-lg font-black text-indigo-600 font-mono">{{ avgStageTimes.qc }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000" style="background:linear-gradient(90deg,#818CF8,#4338CA)" :style="{ width: Math.min(avgStageTimes.qc * 5, 100) + '%' }"></div>
              </div>
            </div>
            <div class="group">
              <div class="flex justify-between items-end mb-2">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">QC → Gate OUT</span>
                 <span class="text-lg font-black text-[#3A6ABF] font-mono">{{ avgStageTimes.waitingOut }} <span class="text-[10px] text-slate-600 font-bold">MIN</span></span>
              </div>
              <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                <div class="h-full rounded-full transition-all duration-1000" style="background:linear-gradient(90deg,#34D399,#4A8BDF)" :style="{ width: Math.min(avgStageTimes.waitingOut * 5, 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Operations In-Progress Table -->
    <div class="rounded-2xl shadow-card overflow-hidden" style="background:white;border:1px solid #E8EEF7">
      <div class="px-5 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0" style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
        <div>
          <h3 class="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center">
            <span class="material-icons text-[#4A8BDF] mr-2">precision_manufacturing</span> 
            Live Active Fleet
          </h3>
          <p class="text-[10px] sm:text-xs font-bold text-slate-500 mt-1">Current vehicle activity — not affected by dashboard date range.</p>
        </div>
        <div class="flex items-center space-x-2">
          <span class="w-2 h-2 rounded-full bg-[#4A8BDF] animate-pulse"></span>
          <span class="text-[10px] font-black text-[#4A8BDF] uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#4A8BDF]/10 border border-[#4A8BDF]/20">LIVE · {{ activeTruckCount }} Units</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[700px] border-collapse">
          <thead>
            <tr style="background:#FAFBFF;border-bottom:1px solid #E8EEF7">
              <th class="px-4 sm:px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Plate / Driver</th>
              <th class="px-3 sm:px-4 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Type / Vendor</th>
              <th class="px-3 sm:px-4 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Status / Location</th>
              <th class="px-3 sm:px-4 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Arrival</th>
              <th class="px-3 sm:px-4 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Stage SLA</th>
              <th class="px-3 sm:px-4 py-3.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="truck in activeTrucks" :key="truck.id" class="transition-colors hover:bg-slate-50/80">
              <td class="px-4 sm:px-6 py-3 border-y border-l border-slate-100 rounded-l-2xl">
                <div>
                  <span class="font-black text-slate-900 text-xs sm:text-sm font-mono tracking-tight block">{{ truck?.plateNumber || truck?.licensePlate || '-' }}</span>
                  <span class="text-[10px] text-slate-600 block">{{ truck?.driverName || 'No Driver' }}</span>
                </div>
              </td>
              <td class="px-2 sm:px-4 py-3 border-y border-slate-100">
                <span class="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-0.5" 
                  :style="(truck?.destination?.warehouseCode || truck?.warehouseCode || truck?.processType) === 'GBB' ? 'color:#A0006D;background:rgba(160,0,109,0.06)' : (truck?.destination?.warehouseCode || truck?.warehouseCode || truck?.processType) === 'GBJ' ? 'color:#4A8BDF;background:rgba(74,139,223,0.06)' : 'color:#059669;background:rgba(5,150,105,0.06)'">
                  {{ truck?.destination?.warehouseCode || truck?.warehouseCode || truck?.processType || '-' }}
                </span>
                <span class="text-[10px] text-slate-700 block truncate max-w-[120px] sm:max-w-[150px] font-medium" :title="truck?.vendor || truck?.vendorName || truck?.cargo?.supplierOrCustomer">
                  {{ truck?.vendor || truck?.vendorName || truck?.cargo?.supplierOrCustomer || '-' }}
                </span>
              </td>
              <td class="px-2 sm:px-4 py-3 border-y border-slate-100">
                <div class="flex items-center">
                  <div class="w-1.5 h-1.5 rounded-full mr-2" :class="getStatusDotClass(truck.status)"></div>
                  <span class="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider truncate max-w-[180px] sm:max-w-[220px]" :class="getStatusTextClass(truck.status)">{{ truck?.status ? truck.status.replace(/_/g, ' ') : '-' }}</span>
                </div>
              </td>
              <td class="px-2 sm:px-4 py-3 whitespace-nowrap text-[10px] sm:text-[11px] font-bold text-slate-500 font-mono border-y border-slate-100">{{ formatTime(truck?.gateInAt || truck?.createdAt) }}</td>
              <td class="px-2 sm:px-4 py-3 whitespace-nowrap border-y border-slate-100">
                <ProcessTimerBadge 
                  :start-time="truck.warehouseStartAt || truck.qcStartAt || truck.weighInAt || truck.gateInAt || truck.createdAt" 
                  :end-time="truck.completedAt || truck.cancelledAt"
                  :sla-minutes="60"
                  :compact="true"
                />
              </td>
              <td class="px-2 sm:px-4 py-3 whitespace-nowrap text-center border-y border-r border-slate-100 rounded-r-2xl">
                 <button @click="viewDetails(truck)" class="w-8 h-8 rounded-lg inline-flex items-center justify-center transition-all duration-300 text-slate-400 hover:text-[#4A8BDF] hover:bg-indigo-50/80 border border-transparent hover:border-[#4A8BDF]/20" title="View Details">
                   <span class="material-icons text-[18px]">visibility</span>
                 </button>
              </td>
            </tr>
            <tr v-if="activeTrucks.length === 0 && storeError">
              <td colspan="7" class="px-4 sm:px-8 py-12 sm:py-16 text-center border border-rose-100 rounded-2xl bg-rose-50/40 shadow-sm">
                 <div class="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-rose-100 flex items-center justify-center mb-3">
                   <span class="material-icons text-rose-600 text-2xl sm:text-3xl">cloud_off</span>
                 </div>
                 <p class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest">Active Fleet Sync Error</p>
                 <p class="text-[10px] sm:text-xs font-bold text-rose-600 mt-1 max-w-sm mx-auto">{{ storeError }}</p>
                 <button @click="retryFetch" class="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider rounded-xl shadow-sm transition-all inline-flex items-center space-x-1.5">
                   <span class="material-icons text-sm">refresh</span>
                   <span>Retry Sync</span>
                 </button>
              </td>
            </tr>
            <tr v-else-if="activeTrucks.length === 0">
              <td colspan="7" class="px-4 sm:px-8 py-16 sm:py-24 text-center border border-slate-100 rounded-2xl bg-white shadow-sm">
                 <div class="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                   <span class="material-icons text-slate-200 text-2xl sm:text-3xl">check_circle</span>
                 </div>
                 <p class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest">Facility Clear</p>
                 <p class="text-[9px] sm:text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">No active trucks are currently in process.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useSettingsStore } from '../stores/settingsStore'
import dashboardService from '../services/dashboardService'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import ProcessTimerBadge from '../components/ProcessTimerBadge.vue'
import PageHeader from '../components/PageHeader.vue'
import DashboardFilterBar from '../components/DashboardFilterBar.vue'

const truckStore = useTruckStore()
const settingsStore = useSettingsStore()
const showDetailsModal = ref(false)
const selectedTruck = ref(null)
const isFetching = ref(false)

const filterState = ref({
  preset: 'TODAY',
  startDate: '',
  endDate: ''
})

const stats = ref({
  period: {
    startDate: '',
    endDate: '',
    timezone: 'Asia/Jakarta',
    preset: 'TODAY',
    formattedLabel: ''
  },
  summary: { totalPeriod: 0, totalToday: 0, totalCompleted: 0, totalActive: 0 },
  avgTotalTAT: 0,
  avgStageTimes: { waitingIn: 0, warehouse: 0, qc: 0, waitingOut: 0 },
  fraudStats: {
    GBB: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 },
    GBJ: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 },
    GSP: { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 }
  },
  activeFraudAlerts: []
})

let pollingInterval = null
let currentRequestId = 0

const fetchDashboardStats = async (customParams = null) => {
  const requestId = ++currentRequestId
  isFetching.value = true
  try {
    const params = customParams || filterState.value
    const res = await dashboardService.getStats(params)
    if (requestId !== currentRequestId) {
      // Stale response discarded to prevent race condition overwrite
      return
    }
    if (res.data?.data) {
      stats.value = res.data.data
    } else if (res.data) {
      stats.value = res.data
    }
  } catch (err) {
    if (requestId === currentRequestId) {
      console.error('Failed to fetch dashboard stats', err)
    }
  } finally {
    if (requestId === currentRequestId) {
      isFetching.value = false
    }
  }
}

const handleFilterChange = (newFilter) => {
  fetchDashboardStats(newFilter)
}

onMounted(async () => {
  try {
    await truckStore.fetchTrucks()
  } catch (err) {
    console.warn('[Dashboard] Mount-time fetch failed, using store cache:', err.message)
  }
  await fetchDashboardStats(filterState.value)
  
  // Refresh stats every 30 seconds respecting active filter
  pollingInterval = setInterval(() => {
    fetchDashboardStats(filterState.value)
    truckStore.fetchTrucks()
  }, 30000)
})

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval)
})

const targetDeviation = computed(() => settingsStore.targetDeviation)
const targetTat = computed(() => settingsStore.targetTat)

const periodSubtitle = computed(() => {
  if (stats.value?.period?.formattedLabel) {
    return stats.value.period.formattedLabel
  }
  if (filterState.value.preset === 'ALL') {
    return 'Periode: Seluruh Data Operasional'
  }
  if (filterState.value.startDate && filterState.value.endDate) {
    if (filterState.value.startDate === filterState.value.endDate) {
      return `Periode: ${filterState.value.startDate}`
    }
    return `Periode: ${filterState.value.startDate} – ${filterState.value.endDate}`
  }
  return 'Periode: Hari Ini'
})

const activeTrucks = computed(() => truckStore.activeTrucks)
const storeError = computed(() => truckStore.error)
const retryFetch = () => {
  truckStore.fetchTrucks()
  fetchDashboardStats(filterState.value)
}

const totalTrucks = computed(() => stats.value?.summary?.totalProcessed ?? stats.value?.summary?.totalPeriod ?? stats.value?.summary?.totalToday ?? 0)
const activeTruckCount = computed(() => stats.value?.summary?.totalActive || 0)
const completedTruckCount = computed(() => stats.value?.summary?.totalCompleted || 0)

const avgTotalTAT = computed(() => stats.value?.avgTotalTAT || 0)
const avgStageTimes = computed(() => stats.value?.avgStageTimes || { waitingIn: 0, warehouse: 0, qc: 0, waitingOut: 0 })

const alertList = computed(() => {
  const list = stats.value?.activeFraudAlerts || []
  const seen = new Set()
  return list.filter(item => {
    const key = item.plate || item.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const alertPage = ref(1)
const alertPerPage = ref(4)
const paginatedAlertList = computed(() => {
  const start = (alertPage.value - 1) * alertPerPage.value
  const end = start + alertPerPage.value
  return alertList.value.slice(start, end)
})

const totalAlertPages = computed(() => {
  return Math.ceil(alertList.value.length / alertPerPage.value) || 1
})

watch(() => alertList.value.length, () => {
  alertPage.value = 1
})

const defaultStat = { totalProcessed: 0, totalNet: 0, avgDiscrepancy: 0 }
const getStatFor = (type) => stats.value?.fraudStats?.[type] || defaultStat
const getDiscrepancyColor = (val) => { if (!val || val === 0) return 'text-slate-400'; if (val <= 2) return 'text-emerald-600'; if (val <= 5) return 'text-amber-500'; return 'text-red-500' }

const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const getStatusDotClass = (s) => {
  if (!s) return 'bg-slate-400'
  if (s.includes('PASSED') || s.includes('COMPLETED') || s.includes('DONE')) return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
  if (s.includes('FAILED') || s.includes('REJECTED')) return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
  if (s.includes('PENDING')) return 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]'
  return 'bg-[#4A8BDF] shadow-[0_0_6px_rgba(74,139,223,0.4)]'
}

const getStatusTextClass = (s) => {
  if (!s) return 'text-slate-500'
  if (s.includes('PASSED') || s.includes('COMPLETED') || s.includes('DONE')) return 'text-emerald-700'
  if (s.includes('FAILED') || s.includes('REJECTED')) return 'text-red-600'
  if (s.includes('PENDING')) return 'text-orange-600'
  return 'text-[#4A8BDF]'
}

const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
</script>
