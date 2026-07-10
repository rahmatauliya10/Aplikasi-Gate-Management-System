<template>
  <teleport to="body">
  <transition name="modal">
    <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
         style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)"
         @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fadeInUp">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600">
            <span class="material-icons">dataset</span>
          </div>
          <div>
            <h2 class="text-lg font-black text-slate-800">Master Data Settings</h2>
            <p class="text-xs text-slate-500 font-medium">Manage vehicles, cargos, and vendors</p>
          </div>
        </div>
        <button @click="$emit('close')" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-500 transition-colors">
          <span class="material-icons text-xl">close</span>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-slate-100 px-6 space-x-6">
        <button v-for="(tab, index) in tabs" :key="index"
          @click="currentTab = tab.id"
          class="py-4 text-sm font-bold border-b-2 transition-colors duration-300 outline-none"
          :class="currentTab === tab.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
        >
          {{ tab.name }}
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <!-- Tab 1: Cargo & Sub Types -->
        <div v-if="currentTab === 'cargos'" class="flex h-[400px] gap-6">
          <!-- Left: Cargo Types -->
          <div class="w-1/3 flex flex-col bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-xs font-black text-slate-800 uppercase tracking-widest">Cargo Types</h3>
              <button @click="addCargoType" class="text-emerald-500 hover:text-emerald-600 transition-colors">
                <span class="material-icons text-[20px]">add_circle</span>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto space-y-2">
              <div v-for="cType in Object.keys(masterStore.cargoSubTypeMap)" :key="cType"
                @click="selectedCargoType = cType"
                class="group px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center border transition-all"
                :class="selectedCargoType === cType ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-sm' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-100'"
              >
                <span class="truncate text-sm">{{ cType }}</span>
                <button @click.stop="removeCargoType(cType)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" :class="selectedCargoType === cType ? 'opacity-100' : ''">
                  <span class="material-icons text-[16px]">close</span>
                </button>
              </div>
            </div>
            <div class="mt-4 pt-4 border-t border-slate-100 flex justify-end">
              <button @click="masterStore.saveCargoSubTypes()" :disabled="masterStore.saving" class="w-full flex items-center justify-center py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">
                <span v-if="masterStore.saving" class="material-icons animate-spin text-[16px] mr-2">autorenew</span>
                Save Config
              </button>
            </div>
          </div>
          
          <!-- Right: Sub Types -->
          <div class="w-2/3 flex flex-col bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div v-if="selectedCargoType" class="flex flex-col h-full">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-xs font-black text-slate-800 uppercase tracking-widest">Sub Types for: <span class="text-emerald-600 ml-1">{{ selectedCargoType }}</span></h3>
                <button @click="addSubType" class="flex items-center text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                  <span class="material-icons text-[14px] mr-1">add</span> Add New
                </button>
              </div>
              <div class="flex-1 overflow-y-auto space-y-2 pr-2 pb-4">
                <div v-for="(subType, idx) in masterStore.cargoSubTypeMap[selectedCargoType]" :key="idx" class="flex items-center space-x-2">
                  <input v-model="masterStore.cargoSubTypeMap[selectedCargoType][idx]" class="flex-1 h-10 px-3 border border-slate-200 focus:border-emerald-500 rounded-lg text-sm text-slate-800 outline-none transition-colors" placeholder="Sub type name" />
                  <button @click="removeSubType(idx)" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <span class="material-icons text-[18px]">delete</span>
                  </button>
                </div>
                <div v-if="masterStore.cargoSubTypeMap[selectedCargoType].length === 0" class="text-slate-400 text-xs italic text-center mt-8">
                  No sub types configured. Click 'Add New' to create one.
                </div>
              </div>
            </div>
            <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm">
              <span class="material-icons text-4xl mb-2 text-slate-300">category</span>
              Select a cargo type from the list to view and edit its sub types.
            </div>
          </div>
        </div>

        <!-- Tab 2: Vendors -->
        <div v-if="currentTab === 'vendors'" class="space-y-4">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm font-black text-slate-800">Transporter / Vendors Master List</h3>
          </div>
          
          <div class="flex space-x-3">
            <input v-model="newVendor" @keyup.enter="addVendor" placeholder="Type new vendor name..." class="flex-1 h-12 px-4 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none uppercase font-bold text-slate-800 text-sm transition-colors" />
            <button @click="addVendor" class="h-12 px-6 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-900 transition-colors shadow-md flex items-center">
              <span class="material-icons text-[18px] mr-1">add</span> Add
            </button>
          </div>

          <div class="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap gap-2 min-h-[200px] items-start content-start">
            <div v-for="(vendor, index) in masterStore.vendors" :key="index" class="flex items-center bg-emerald-50 border border-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
              {{ vendor }}
              <button @click="removeVendor(index)" class="ml-2 text-emerald-400 hover:text-red-500 transition-colors flex items-center">
                <span class="material-icons text-[16px]">cancel</span>
              </button>
            </div>
            <div v-if="masterStore.vendors.length === 0" class="text-slate-400 text-sm w-full text-center mt-10">
              No vendors added yet. Add one above.
            </div>
          </div>
          
          <div class="flex justify-end pt-4">
            <button @click="masterStore.saveVendors()" :disabled="masterStore.saving" class="flex items-center px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">
              <span v-if="masterStore.saving" class="material-icons animate-spin text-[18px] mr-2">autorenew</span>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  </transition>
  </teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMasterDataStore } from '../stores/masterDataStore'

const emit = defineEmits(['close'])
const masterStore = useMasterDataStore()

onMounted(async () => {
  await masterStore.fetchAll()
})

const tabs = [
  { id: 'cargos', name: 'Cargo & Sub Types' },
  { id: 'vendors', name: 'Vendors' }
]
const currentTab = ref('cargos')

// Tab 1 logic
const selectedCargoType = ref('')
const addCargoType = () => {
  const name = prompt('Enter new Cargo Type name:')
  if (name && !masterStore.cargoSubTypeMap[name]) {
    masterStore.cargoSubTypeMap[name] = []
    selectedCargoType.value = name
  }
}
const removeCargoType = (name) => {
  if (confirm(`Are you sure you want to remove Cargo Type "${name}" and all its sub types?`)) {
    delete masterStore.cargoSubTypeMap[name]
    if (selectedCargoType.value === name) selectedCargoType.value = ''
  }
}
const addSubType = () => {
  if (selectedCargoType.value) {
    masterStore.cargoSubTypeMap[selectedCargoType.value].push('')
  }
}
const removeSubType = (index) => {
  if (selectedCargoType.value) {
    masterStore.cargoSubTypeMap[selectedCargoType.value].splice(index, 1)
  }
}

// Tab 2 logic
const newVendor = ref('')
const addVendor = () => {
  const v = newVendor.value.trim().toUpperCase()
  if (v && !masterStore.vendors.includes(v)) {
    masterStore.vendors.push(v)
    newVendor.value = ''
  }
}
const removeVendor = (index) => {
  masterStore.vendors.splice(index, 1)
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
