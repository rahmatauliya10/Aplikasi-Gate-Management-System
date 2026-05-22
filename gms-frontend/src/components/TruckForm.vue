<template>
  <div class="flex flex-col relative w-full overflow-hidden">
    <!-- Progress Indicator (2026 Trend: Dynamic Glow Pills) -->
    <div class="px-4 sm:px-7 pt-5 sm:pt-7 pb-4">
      <div class="flex items-center justify-between relative bg-slate-100/80 rounded-full p-1.5 backdrop-blur-sm border border-white/50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.02)]">
        <!-- Progress Track Glow -->
        <div class="absolute left-1.5 top-1.5 bottom-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] -z-0" 
             :style="{ width: `calc(${progressWidth} - 12px)` }"></div>
        
        <div v-for="step in steps" :key="step.id" 
             class="relative z-10 flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer"
             :class="currentStep === step.id ? 'bg-white text-indigo-600 shadow-[0_4px_16px_rgba(74,139,223,0.3)] h-8 sm:h-10 px-3 sm:px-5' : (currentStep > step.id ? 'bg-transparent text-[#4A8BDF] w-8 h-8 sm:w-10 sm:h-10' : 'bg-transparent text-slate-600 w-8 h-8 sm:w-10 sm:h-10 hover:bg-slate-200/50')"
             @click="if(currentStep > step.id) { transitionName = 'wizard-prev'; currentStep = step.id }">
          
          <span class="material-icons transition-all duration-300" :class="currentStep === step.id ? 'text-[18px]' : 'text-[20px]'">
            {{ currentStep > step.id ? 'check_circle' : step.icon }}
          </span>
          <span v-if="currentStep === step.id" class="ml-2 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap overflow-hidden animate-fadeInRight">
            {{ step.label }}
          </span>
        </div>
      </div>
    </div>

    <!-- Wizard Form Area -->
    <div class="relative w-full min-h-[360px] grid">
      <transition :name="transitionName">
        
        <!-- STEP 1: DESTINATION -->
        <div v-if="currentStep === 1" class="col-start-1 row-start-1 w-full px-4 sm:px-7 pt-2 pb-5 sm:pb-7" key="step1">
          <h3 class="text-xs sm:text-sm font-black text-slate-800 mb-4 sm:mb-6 tracking-tight">Select Process Destination</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <label v-for="(opt, idx) in processOptions" :key="opt.value"
              class="relative flex flex-col p-6 min-h-[160px] rounded-[1.5rem] cursor-pointer transition-all duration-500 group overflow-hidden"
              :class="form.processType === opt.value ? 'bg-white border-2 border-[#4A8BDF] shadow-[0_20px_40px_rgba(74,139,223,0.15)] -translate-y-2' : 'bg-slate-50/50 border-2 border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-[0_10px_20px_rgba(0,0,0,0.05)] hover:-translate-y-1'"
              @click="form.processType = opt.value"
            >
              <input type="radio" v-model="form.processType" :value="opt.value" class="sr-only">
              
              <!-- Giant background watermark image -->
              <img :src="opt.img" class="absolute -right-8 -bottom-8 w-40 h-40 object-cover opacity-10 transition-all duration-500 pointer-events-none filter blur-sm"
                   :class="form.processType === opt.value ? 'opacity-30 scale-125 rotate-[-5deg]' : ''" />

              <div class="w-16 h-16 rounded-[1rem] flex items-center justify-center mb-auto transition-all duration-500 relative z-10 overflow-hidden"
                :style="form.processType === opt.value ? 'box-shadow:0 8px 20px rgba(74,139,223,0.4); border: 2px solid #4A8BDF;' : 'box-shadow:0 4px 10px rgba(0,0,0,0.05); border: 2px solid transparent;'">
                <img :src="opt.img" class="w-full h-full object-cover transition-all duration-500" :class="form.processType === opt.value ? 'scale-110' : 'grayscale-[50%] opacity-80 group-hover:grayscale-0 group-hover:opacity-100'" />
              </div>

              <div class="relative z-10 mt-6">
                <div class="text-[10px] font-black uppercase tracking-[0.2em] mb-1 transition-colors duration-300"
                     :class="form.processType === opt.value ? 'text-[#4A8BDF]' : 'text-slate-600'">{{ opt.sub }}</div>
                <div class="text-2xl font-black transition-colors duration-300"
                     :class="form.processType === opt.value ? 'text-slate-900' : 'text-slate-700'">{{ opt.value }}</div>
              </div>
              
              <div class="absolute top-5 right-5 w-6 h-6 rounded-full border-2 transition-all duration-500 flex items-center justify-center z-10"
                   :class="form.processType === opt.value ? 'border-[#4A8BDF] bg-[#4A8BDF] shadow-[0_0_12px_rgba(74,139,223,0.5)]' : 'border-slate-200 bg-transparent'">
                <span v-if="form.processType === opt.value" class="material-icons text-[#4A8BDF] text-[14px] animate-scaleSpringIn">check</span>
              </div>
            </label>
          </div>
        </div>

        <!-- STEP 2: VEHICLE & CARGO -->
        <div v-else-if="currentStep === 2" class="col-start-1 row-start-1 w-full px-4 sm:px-7 pt-2 pb-5 sm:pb-7" key="step2">
          <h3 class="text-xs sm:text-sm font-black text-slate-800 mb-4 tracking-tight">Vehicle Data</h3>
          
          <div class="space-y-5">
            <!-- Vehicle Type Grid Selection -->
            <div>
              <label class="text-[10px] font-black text-slate-700 uppercase tracking-widest block mb-3">Vehicle Type</label>
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div v-for="truck in truckTypes" :key="truck.name"
                  @click="form.vehicleType = truck.name"
                  class="p-3 rounded-xl cursor-pointer transition-all duration-300 border-2"
                  :class="form.vehicleType === truck.name ? 'border-[#4A8BDF] bg-[#E6F0FA]/50 shadow-[0_4px_12px_rgba(74,139,223,0.1)]' : 'border-slate-100 bg-white hover:border-slate-200'"
                >
                  <div class="text-2xl mb-2">{{ truck.img }}</div>
                  <div class="text-[11px] font-black text-slate-800 leading-tight">{{ truck.name }}</div>
                  <div class="text-[9px] font-bold text-[#4A8BDF] mt-1">{{ truck.capacity }}</div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Plate Number (NO SPACES, UPPERCASE) -->
              <div class="floating-group">
                <input v-model="formattedPlate" type="text" class="floating-input font-mono uppercase" placeholder="Plate Number" />
                <label class="floating-label">Plate Number</label>
              </div>

              <!-- Vendor (UPPERCASE) -->
              <div class="floating-group">
                <input :value="form.vendor" @input="form.vendor = $event.target.value.toUpperCase()" type="text" class="floating-input uppercase" placeholder="Vendor / Transporter" />
                <label class="floating-label">Vendor / Transporter</label>
              </div>

              <!-- Driver Name (Nama Supir) -->
              <div class="floating-group md:col-span-2">
                <input :value="form.driverName" @input="form.driverName = $event.target.value.toUpperCase()" type="text" class="floating-input uppercase" placeholder="Nama Supir" />
                <label class="floating-label">Nama Supir / Driver Name</label>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">person</span>
              </div>
            </div>

            <!-- Cargo -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-[10px] font-black text-slate-700 uppercase tracking-widest">Cargo List</label>
                <button type="button" @click.prevent="addCargoItem" class="text-[10px] font-bold text-[#4A8BDF] hover:text-indigo-700 bg-[#E6F0FA] hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center transition-colors">
                  <span class="material-icons text-[14px] mr-1">add_circle</span> Add
                </button>
              </div>
              <transition-group name="list" tag="div" class="space-y-2">
                <div v-for="(item, index) in form.cargoItems" :key="item.id" class="relative floating-group !pt-0">
                  <input :value="item.name" @input="item.name = $event.target.value.toUpperCase()" type="text" class="floating-input !pl-10 !pr-10 uppercase" placeholder="Item Name" />
                  <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-[18px]">inventory_2</span>
                  <button v-if="form.cargoItems.length > 1" type="button" @click="removeCargoItem(index)"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <span class="material-icons text-[18px]">close</span>
                  </button>
                </div>
              </transition-group>
            </div>
          </div>
        </div>

        <!-- STEP 3: SECURITY -->
        <div v-else-if="currentStep === 3" class="col-start-1 row-start-1 w-full px-4 sm:px-7 pt-2 pb-5 sm:pb-7" key="step3">
          <h3 class="text-xs sm:text-sm font-black text-slate-800 mb-4 tracking-tight">Security Verification</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- SJ -->
            <div class="floating-group" v-if="!['GBB', 'GBJ'].includes(form.processType)">
              <input :value="form.suratJalanNumber" @input="form.suratJalanNumber = $event.target.value.toUpperCase()" type="text" class="floating-input uppercase" placeholder="Delivery Note Number" />
              <label class="floating-label">Delivery Note (SJ)</label>
            </div>

            <!-- VMS -->
            <div class="floating-group">
              <input :value="form.permitCard" @input="form.permitCard = $event.target.value.toUpperCase()" type="text" class="floating-input uppercase" placeholder="VMS/Pass Number" />
              <label class="floating-label">Permit Card / VMS</label>
            </div>

            <!-- ID Type & Number -->
            <div class="flex space-x-2 md:col-span-2 mt-2">
              <div class="w-1/3 relative">
                <select v-model="form.idType" class="w-full h-12 px-4 rounded-xl text-sm font-bold text-slate-900 bg-slate-50 border-2 border-slate-200 outline-none appearance-none focus:border-[#4A8BDF] focus:bg-white transition-all">
                  <option>KTP</option><option>SIM</option><option>PASPOR</option>
                </select>
                <span class="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none">expand_more</span>
                <label class="absolute -top-2 left-3 px-1 text-[10px] font-black tracking-widest uppercase bg-white text-slate-700">ID Type</label>
              </div>
              <div class="flex-1 floating-group !pt-0 relative">
                <input :value="form.guestId" @input="form.guestId = $event.target.value.toUpperCase()" type="text" class="floating-input font-mono uppercase" placeholder="ID Number" />
                <label class="floating-label">ID Number</label>
              </div>
            </div>

            <!-- Guest Count -->
            <div class="floating-group">
              <input v-model.number="form.guestCount" type="number" min="1" class="floating-input" placeholder="Guest Count" />
              <label class="floating-label">Guest Count</label>
            </div>
            
            <!-- Security Info -->
            <div class="relative pt-4">
              <div class="w-full h-12 px-4 rounded-xl flex items-center bg-emerald-50 border-2 border-emerald-100">
                <span class="material-icons text-[#4A8BDF] mr-2">verified_user</span>
                <span class="text-sm font-bold text-emerald-700">{{ form.securityName }}</span>
              </div>
              <label class="absolute -top-0 left-3 px-1 text-[10px] font-black tracking-widest uppercase bg-white text-[#3A6ABF]">On Duty Officer</label>
            </div>
          </div>
        </div>

      </transition>
    </div>

    <!-- Action Bar -->
    <div class="px-4 sm:px-7 py-4 sm:py-5 bg-slate-50/80 border-t border-slate-200 flex justify-between items-center rounded-b-[1.5rem] gap-2">
      <button type="button" v-if="currentStep > 1" @click="prevStep" 
        class="btn-secondary px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs text-slate-700 hover:text-slate-800 transition-all active:scale-95">
        BACK
      </button>
      <button type="button" v-else @click="$emit('cancel')" 
        class="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl border-2 border-slate-200 bg-white font-black text-[10px] sm:text-xs text-slate-700 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95">
        CANCEL
      </button>

      <button type="button" v-if="currentStep < 3" @click="nextStep" :disabled="!canProceed"
        class="btn-primary px-5 sm:px-8 py-2 sm:py-2.5 text-[10px] sm:text-xs transition-all flex items-center" :class="!canProceed ? 'opacity-50 cursor-not-allowed !shadow-none' : ''">
        <span class="font-black">NEXT</span>
        <span class="material-icons text-[14px] sm:text-[16px] ml-1">arrow_forward</span>
      </button>
      <button type="button" v-if="currentStep === 3" @click="submitForm" :disabled="!canSubmit"
        class="px-4 sm:px-8 py-2 sm:py-2.5 rounded-xl text-white text-[10px] sm:text-xs font-black flex items-center transition-all shadow-[0_4px_14px_rgba(74,139,223,0.4)]" 
        :class="canSubmit ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:scale-[1.02] active:scale-95' : 'bg-slate-300 opacity-50 cursor-not-allowed shadow-none'">
        <span class="material-icons text-[14px] sm:text-[16px] mr-1 sm:mr-1.5">how_to_reg</span>
        <span class="hidden sm:inline">COMPLETE REGISTRATION</span>
        <span class="inline sm:hidden">SUBMIT</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const emit = defineEmits(['submit', 'cancel'])

// Wizard State
const currentStep = ref(1)
const transitionName = ref('wizard-next')

const steps = [
  { id: 1, label: 'Destination', icon: 'flag' },
  { id: 2, label: 'Vehicle', icon: 'local_shipping' },
  { id: 3, label: 'Security', icon: 'verified_user' }
]

const progressWidth = computed(() => {
  if (currentStep.value === 1) return '130px'
  if (currentStep.value === 2) return 'calc(50% + 75px)'
  return '100%'
})

const processOptions = [
  { value: 'GBB', img: '/assets/gbb.png', sub: 'Raw Material' },
  { value: 'GBJ', img: '/assets/gbj.png', sub: 'Finished Goods' },
  { value: 'GSP', img: '/assets/gsp.png', sub: 'Sparepart Warehouse' }
]

const truckTypes = [
  { name: 'TRONTON WINGBOX', capacity: '18.000 kg', img: '🚛' },
  { name: 'TRONTON BOX',     capacity: '18.000 kg', img: '🚛' },
  { name: 'TRONTON BAK',     capacity: '18.000 kg', img: '🚛' },
  { name: 'FUSO BAK',        capacity: '8.000 kg',  img: '🚚' },
  { name: 'FUSO BOX',        capacity: '8.000 kg',  img: '🚚' },
  { name: 'CDD LONG',        capacity: '5.200 kg',  img: '🚚' },
  { name: 'DOUBLE ENGKEL',   capacity: '4.300 kg',  img: '🚚' },
  { name: 'PICK UP',         capacity: '1.000 kg',  img: '🛻' }
]

const form = reactive({
  entryDate: '', entryTime: '',
  vehicleType: '', plateNumber: '', vendor: '', suratJalanNumber: '',
  cargoItems: [{ id: Date.now(), name: '' }],
  guestCount: 1,
  securityName: authStore.user?.name || 'SECURITY OFFICER',
  permitCard: '', idType: 'KTP', guestId: '',
  processType: null, driverName: ''
})

// Plate Number: UPPERCASE, NO SPACES — raw format without formatting
const formattedPlate = computed({
  get: () => form.plateNumber,
  set: (val) => {
    // Strip ALL spaces and non-alphanumeric, force UPPERCASE
    form.plateNumber = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  }
})

const addCargoItem = () => form.cargoItems.push({ id: Date.now(), name: '' })
const removeCargoItem = (index) => form.cargoItems.splice(index, 1)

// Validations
const canProceed = computed(() => {
  if (currentStep.value === 1) return !!form.processType
  if (currentStep.value === 2) return !!form.vehicleType && !!form.plateNumber && !!form.vendor && !!form.driverName
  return true
})

const canSubmit = computed(() => {
  return currentStep.value === 3 && !!form.permitCard && !!form.guestId
})

const nextStep = () => {
  if (canProceed.value && currentStep.value < 3) {
    transitionName.value = 'wizard-next'
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    transitionName.value = 'wizard-prev'
    currentStep.value--
  }
}

const updateDateTime = () => {
  const now = new Date()
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  form.entryDate = `${String(now.getDate()).padStart(2,'0')}-${m[now.getMonth()]}-${now.getFullYear()}`
  form.entryTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
}

const submitForm = () => {
  if (canSubmit.value) {
    updateDateTime()
    emit('submit', { ...form })
  }
}
</script>
