<template>
  <div>
    <!-- Page Header -->
    <PageHeader title="Gate Check-In (Security)" subtitle="Truck Registration Portal">
      <button @click="openModal" 
        class="group relative overflow-hidden flex items-center space-x-3 px-6 py-3 rounded-2xl transition-all duration-500 hover:shadow-[0_15px_30px_-10px_rgba(74,139,223,0.6)] hover:-translate-y-1 active:scale-95 active:translate-y-0"
        style="background: linear-gradient(135deg, #4A8BDF 0%, #3A6ABF 50%, #A0006D 100%);">
        
        <!-- Animated Background Glow -->
        <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
          style="background: radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%);"></div>
        
        <!-- Shimmer Effect -->
        <div class="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none"
          style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); skewX(-20deg);"></div>

        <!-- Content -->
        <div class="relative flex items-center space-x-2">
          <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 group-hover:rotate-90 transition-transform duration-500">
            <span class="material-icons text-lg text-white">add</span>
          </div>
          <span class="text-sm font-black text-white uppercase tracking-wider">Register New Truck</span>
        </div>

        <!-- Bottom Reflection -->
        <div class="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      </button>
    </PageHeader>

    <!-- Registration Modal -->
    <transition name="modal">
      <div v-if="isModalOpen"
        class="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8 backdrop-animate"
        @click.self="closeModal">
        <div class="modal-panel w-full max-w-2xl mx-4 rounded-[1.25rem] overflow-hidden relative"
          style="background:white;box-shadow:0 30px 80px rgba(0,0,0,0.4),0 0 0 1px rgba(74,139,223,0.1);">
          <!-- Modal Header -->
          <div class="px-7 py-5 flex items-center justify-between" style="background:linear-gradient(135deg,#FFFFFF,#E6F0FA);border-bottom:1px solid rgba(74,139,223,0.15)">
            <div class="flex items-center space-x-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(74,139,223,0.25),rgba(160,0,109,0.1));border:1px solid rgba(74,139,223,0.3)">
                <span class="material-icons text-[#4A8BDF] text-lg">how_to_reg</span>
              </div>
              <div>
                <h2 class="text-lg font-black text-[#4A8BDF]" style="letter-spacing:-0.02em">Register New Truck</h2>
                <p class="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Security Gate Entry</p>
              </div>
            </div>
            <button @click="closeModal"
              class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:text-red-400 hover:rotate-90 transition-all duration-300"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06)">
              <span class="material-icons text-lg">close</span>
            </button>
          </div>
          <div class="p-7">
            <TruckForm @submit="handleTruckSubmit" @cancel="closeModal" />
          </div>
        </div>
      </div>
    </transition>

    <TruckDetailsModal :is-open="showDetailsModal" :truck="selectedTruck" @close="showDetailsModal = false" />

    <!-- List -->
    <div class="ind-container overflow-hidden bg-slate-50 bg-opacity-40 backdrop-blur-xl border-slate-200 border-opacity-50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative">
      <!-- Glossy Overlay -->
      <div class="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 pointer-events-none"></div>
      
      <div class="px-8 py-6 bg-white/60 backdrop-blur-md border-b border-slate-100 flex justify-between items-center z-10 relative">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-inner group cursor-help">
            <span class="material-icons text-[#4A8BDF] group-hover:scale-125 transition-transform duration-500">pending_actions</span>
          </div>
          <div>
            <h2 class="text-xl font-black text-slate-800 tracking-tight">Registration Logs</h2>
            <div class="flex items-center mt-0.5 space-x-2">
              <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Activity Tracker</span>
              <span class="w-1 h-1 rounded-full bg-slate-300"></span>
              <span class="text-[10px] font-bold text-[#A0006D] uppercase">{{ new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) }}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <div class="flex items-center space-x-2 px-4 py-2 rounded-2xl bg-white shadow-sm border border-slate-100">
            <div class="relative">
              <span class="block w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
              <span class="absolute inset-0 rounded-full bg-[#4A8BDF] animate-ping opacity-40"></span>
            </div>
            <span class="text-xs font-black text-slate-700 tracking-wider">{{ registeredTrucks.length }} ACTIVE LOGS</span>
          </div>
        </div>
      </div>
      
      <div class="p-6 space-y-5 relative min-h-[500px]">
        <!-- Modern Grid Background -->
        <div class="absolute inset-0 pointer-events-none opacity-[0.08]" 
          style="background-image: linear-gradient(#4A8BDF 1.5px, transparent 1.5px), linear-gradient(90deg, #4A8BDF 1.5px, transparent 1.5px); background-size: 30px 30px;"></div>
        
        <transition-group name="list" tag="div" class="relative z-10 space-y-3">
          <div v-for="(truck, i) in registeredTrucks" :key="truck.id"
            class="group relative bg-white/70 backdrop-blur-md rounded-[1.75rem] border border-white hover:border-indigo-400 hover:border-opacity-40 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(74,139,223,0.12)] hover:-translate-y-1 transition-all duration-500 overflow-hidden"
            style="height: 80px;"
          >
            <!-- Animated Gradient Border Glow -->
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[#4A8BDF] to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-700"></div>
            
            <!-- Process Accent Line -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5 transition-all duration-500 opacity-80 group-hover:opacity-100 rounded-l-[1.75rem]"
                 :style="{ background: truck.processType === 'GBB' ? 'linear-gradient(to bottom, #A0006D, #800057)' : 'linear-gradient(to bottom, #4A8BDF, #3A6ABF)' }"></div>
            
            <!-- Card Body: strict flex row, vertically centered, fixed height -->
            <div class="h-full flex items-center gap-0 px-5 pl-7 relative z-10">

              <!-- COL 1: Plate Number — fixed 130px -->
              <div class="flex-shrink-0 w-[130px]">
                <div class="w-[110px] h-[42px] bg-slate-900 flex items-center justify-center rounded-xl shadow-lg border border-slate-700 group-hover:scale-105 transition-transform duration-500 overflow-hidden px-2">
                  <span class="font-mono font-black text-white text-center leading-none w-full"
                        :style="{ fontSize: truck.plateNumber.length > 8 ? '10px' : truck.plateNumber.length > 6 ? '12px' : '14px' }">
                    {{ truck.plateNumber }}
                  </span>
                </div>
              </div>

              <!-- COL 2: Driver & Vendor — fixed 180px -->
              <div class="flex-shrink-0 w-[180px] flex flex-col justify-center min-w-0">
                <span class="text-sm font-black text-slate-800 tracking-tight group-hover:text-[#4A8BDF] transition-colors truncate leading-tight">{{ truck.driverName }}</span>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="material-icons text-[12px] text-slate-400 flex-shrink-0">business</span>
                  <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{{ truck.vendor }}</span>
                </div>
              </div>

              <!-- COL 3: Process Type — fixed 90px, centered -->
              <div class="flex-shrink-0 w-[90px] flex flex-col items-center justify-center">
                <span class="w-full text-center px-2 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-sm border"
                      :style="{ 
                        backgroundColor: truck.processType === 'GBB' ? 'rgba(160,0,109,0.08)' : 'rgba(74,139,223,0.08)',
                        borderColor: truck.processType === 'GBB' ? 'rgba(160,0,109,0.2)' : 'rgba(74,139,223,0.2)',
                        color: truck.processType === 'GBB' ? '#A0006D' : '#3A6ABF'
                      }">
                  {{ truck.processType }}
                </span>
                <span class="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter whitespace-nowrap">PROCESS TYPE</span>
              </div>

              <!-- COL 4: Time — fixed 150px -->
              <div class="flex-shrink-0 w-[150px] flex items-center gap-2.5 bg-slate-50/80 px-3 py-2 rounded-2xl border border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all duration-500">
                <div class="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm border border-slate-100 flex-shrink-0">
                  <span class="material-icons text-[#4A8BDF] text-[16px]">schedule</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-sm font-black text-slate-700 font-mono tracking-wider whitespace-nowrap">{{ formatTime(truck.timestamps.entry) }}</span>
                  <span class="text-[8px] font-black text-slate-400 uppercase">Registered</span>
                </div>
              </div>

              <!-- COL 5: Stage — flexible -->
              <div class="flex flex-col flex-1 min-w-0 px-4">
                <div class="flex items-center gap-1.5">
                  <div class="flex gap-0.5">
                    <div class="w-1 h-1 rounded-full bg-[#4A8BDF]"></div>
                    <div class="w-1 h-1 rounded-full bg-slate-200"></div>
                    <div class="w-1 h-1 rounded-full bg-slate-200"></div>
                  </div>
                  <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white px-2.5 py-1 rounded-full border border-slate-100 shadow-sm whitespace-nowrap truncate">
                    {{ truck.step.replace('_', ' ') }}
                  </span>
                </div>
                <span class="text-[8px] font-bold text-slate-400 mt-1 ml-6 uppercase tracking-tighter">CURRENT STAGE</span>
              </div>

              <!-- COL 6: Action — fixed -->
              <div class="flex-shrink-0">
                <button @click="viewDetails(truck)" class="group/btn px-5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-[#4A8BDF] hover:shadow-[0_8px_20px_-5px_rgba(74,139,223,0.2)] transition-all duration-300 flex items-center gap-2 whitespace-nowrap">
                  <span class="text-[11px] font-black text-slate-600 group-hover/btn:text-[#4A8BDF] uppercase tracking-[0.15em] transition-colors">INSPECT DATA</span>
                  <span class="material-icons text-[16px] text-slate-400 group-hover/btn:text-[#4A8BDF] group-hover/btn:translate-x-1 transition-all duration-300">rocket_launch</span>
                </button>
              </div>

            </div>
          </div>
          
          <div v-if="registeredTrucks.length === 0" key="empty" class="flex flex-col items-center justify-center py-28 relative">
            <div class="relative mb-6">
              <div class="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center animate-gentle-float border border-slate-100">
                <span class="material-icons text-slate-300 text-5xl">cloud_queue</span>
              </div>
              <div class="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-[#E6F0FA] flex items-center justify-center animate-pulse">
                <span class="material-icons text-[#4A8BDF] text-xl">radar</span>
              </div>
            </div>
            <p class="text-base font-black text-slate-400 tracking-[0.3em] uppercase">No active registrations</p>
            <p class="text-xs font-bold text-slate-400 mt-2 italic">Scanning for incoming gate entries...</p>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTruckStore } from '../stores/truckStore'
import { useToast } from '../composables/useToast'
import TruckForm from '../components/TruckForm.vue'
import TruckDetailsModal from '../components/TruckDetailsModal.vue'
import PageHeader from '../components/PageHeader.vue'

const truckStore = useTruckStore()
const toast = useToast()
const isModalOpen = ref(false)
const showDetailsModal = ref(false)
const selectedTruck = ref(null)
const registeredTrucks = computed(() => [...truckStore.trucks].reverse().slice(0, 10))

const openModal = () => { isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false }
const handleTruckSubmit = (truckData) => { truckStore.addTruck(truckData); closeModal(); toast.success(`Truck ${truckData.plateNumber} berhasil diregistrasi!`) }
const formatTime = (isoString) => { if (!isoString) return '-'; return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
const viewDetails = (truck) => { selectedTruck.value = truck; showDetailsModal.value = true }
</script>
