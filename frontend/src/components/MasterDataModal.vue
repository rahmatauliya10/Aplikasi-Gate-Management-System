<template>
  <teleport to="body">
  <transition name="modal">
    <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
         style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)"
         @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeInUp">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600">
            <span class="material-icons">dataset</span>
          </div>
          <div>
            <h2 class="text-lg font-black text-slate-800">Master Data Settings</h2>
            <p class="text-xs text-slate-500 font-medium">Manage process-scoped materials, products, and vendors</p>
          </div>
        </div>
        <button @click="$emit('close')" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-500 transition-colors">
          <span class="material-icons text-xl">close</span>
        </button>
      </div>

      <!-- Main Navigation Tabs -->
      <div class="flex border-b border-slate-100 px-6 space-x-6">
        <button
          @click="currentMainTab = 'materials'"
          class="py-4 text-sm font-bold border-b-2 transition-colors duration-300 outline-none flex items-center"
          :class="currentMainTab === 'materials' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
        >
          <span class="material-icons text-base mr-1.5">inventory_2</span>
          Master Material
        </button>
        <button
          @click="currentMainTab = 'vendors'"
          class="py-4 text-sm font-bold border-b-2 transition-colors duration-300 outline-none flex items-center"
          :class="currentMainTab === 'vendors' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
        >
          <span class="material-icons text-base mr-1.5">local_shipping</span>
          Vendors / Transporters
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-50/50">

        <!-- TAB: MASTER MATERIAL (PROCESS-SCOPED) -->
        <div v-if="currentMainTab === 'materials'" class="space-y-4">
          <!-- Process Filter Bar: [ GBB ] [ GBJ ] [ GSP ] -->
          <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-black text-slate-500 uppercase tracking-widest mr-2">Process Scope:</span>
              <button
                v-for="proc in ['GBB', 'GBJ', 'GSP']"
                :key="proc"
                @click="selectedProcess = proc"
                class="px-4 py-1.5 rounded-lg text-xs font-black transition-all"
                :class="selectedProcess === proc ? 'bg-slate-800 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
              >
                {{ proc }}
              </button>
            </div>

            <!-- GSP Action: Add Product Button -->
            <button
              v-if="selectedProcess === 'GSP'"
              @click="showAddGspModal = true"
              class="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center"
            >
              <span class="material-icons text-sm mr-1">add</span> Tambah Produk GSP
            </button>
          </div>

          <!-- ════════════════════════════════════════════════════════════════ -->
          <!-- PROCESS: GSP (CANONICAL DATABASE PRODUCT CATALOG) -->
          <!-- ════════════════════════════════════════════════════════════════ -->
          <div v-if="selectedProcess === 'GSP'" class="space-y-4">
            <!-- Grouped by Canonical GSP Categories -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-for="catName in ['Coal', 'Fuel', 'Chemical UTL', 'Chemical PROD']"
                :key="catName"
                class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col"
              >
                <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <div class="flex items-center space-x-2">
                    <span class="material-icons text-sm text-emerald-600">category</span>
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">{{ catName }}</h3>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {{ getGspProductsByCategory(catName).length }} Produk
                  </span>
                </div>

                <!-- Product items under this category -->
                <div class="space-y-2.5 flex-1">
                  <div
                    v-for="prod in getGspProductsByCategory(catName)"
                    :key="prod.id"
                    class="p-2.5 rounded-lg border flex items-center justify-between transition-all"
                    :class="prod.isActive ? 'bg-slate-50/50 border-slate-200' : 'bg-amber-50/40 border-amber-200 opacity-80'"
                  >
                    <div>
                      <div class="flex items-center space-x-2">
                        <span class="font-mono text-[10px] font-bold text-slate-500">{{ prod.code }}</span>
                        <span class="text-xs font-black text-slate-800">{{ prod.name }}</span>
                      </div>
                      <div class="flex items-center space-x-2 mt-1">
                        <!-- Profile badge -->
                        <span
                          v-if="prod.gspAnalysisProfile"
                          class="text-[9px] font-black uppercase px-2 py-0.5 rounded font-mono"
                          :class="getProfileBadgeClass(prod.gspAnalysisProfile)"
                        >
                          {{ prod.gspAnalysisProfile }}
                        </span>
                        <span
                          v-else
                          class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-700"
                        >
                          NO PROFILE (INACTIVE)
                        </span>

                        <span class="text-[9px] text-slate-500 font-mono">
                          {{ prod.isPaRequired ? 'QC PA Wajib' : 'PA Exempt' }}
                        </span>
                      </div>
                    </div>

                    <!-- Actions: Toggle Active + Delete -->
                    <div class="flex items-center space-x-2">
                      <button
                        @click="handleToggleActive(prod)"
                        :disabled="!prod.gspAnalysisProfile && !prod.isActive"
                        class="text-[10px] font-black px-2.5 py-1 rounded transition-colors"
                        :class="[
                          prod.isActive
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300',
                          (!prod.gspAnalysisProfile && !prod.isActive) ? 'opacity-40 cursor-not-allowed' : ''
                        ]"
                        :title="!prod.gspAnalysisProfile ? 'Wajib assign Analysis Profile sebelum aktivasi' : 'Ubah status aktif'"
                      >
                        {{ prod.isActive ? 'Active' : 'Inactive' }}
                      </button>

                      <button
                        @click="handleDeleteGsp(prod)"
                        class="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Hapus / Nonaktifkan produk"
                      >
                        <span class="material-icons text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="getGspProductsByCategory(catName).length === 0"
                    class="py-4 text-center text-xs text-slate-400 italic"
                  >
                    Belum ada material terdaftar di kategori ini.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════ -->
          <!-- PROCESS: GBB / GBJ (LEGACY FLAT CONFIGURATION PRESERVED) -->
          <!-- ════════════════════════════════════════════════════════════════ -->
          <div v-else class="space-y-4">
            <div class="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-blue-900 text-xs">
              <div class="flex items-center space-x-2">
                <span class="material-icons text-blue-600 text-sm">info</span>
                <span>Mode Kompatibilitas Legacy untuk <strong>{{ selectedProcess }}</strong>. Konfigurasi kargo dipertahankan tanpa perubahan destruktif.</span>
              </div>
              <button @click="masterStore.saveCargoSubTypes()" :disabled="masterStore.saving" class="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
                {{ masterStore.saving ? 'Saving...' : 'Save Legacy Config' }}
              </button>
            </div>

            <!-- Legacy Flat Cargo Map -->
            <div class="flex h-[380px] gap-6">
              <!-- Left: Cargo Types -->
              <div class="w-1/3 flex flex-col bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                  <h3 class="text-xs font-black text-slate-800 uppercase tracking-widest">Cargo Types</h3>
                  <button @click="addCargoType" class="text-emerald-500 hover:text-emerald-600 transition-colors">
                    <span class="material-icons text-[20px]">add_circle</span>
                  </button>
                </div>
                <div class="flex-1 overflow-y-auto space-y-1.5">
                  <div v-for="cType in Object.keys(masterStore.cargoSubTypeMap)" :key="cType"
                    @click="selectedCargoType = cType"
                    class="group px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center border transition-all"
                    :class="selectedCargoType === cType ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-sm' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50'"
                  >
                    <span class="truncate text-xs">{{ cType }}</span>
                    <button @click.stop="removeCargoType(cType)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span class="material-icons text-[14px]">close</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Right: Sub Types -->
              <div class="w-2/3 flex flex-col bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div v-if="selectedCargoType" class="flex flex-col h-full">
                  <div class="flex justify-between items-center mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-widest">Sub Types: <span class="text-emerald-600 ml-1">{{ selectedCargoType }}</span></h3>
                    <button @click="addSubType" class="flex items-center text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors">
                      <span class="material-icons text-[14px] mr-1">add</span> Add New
                    </button>
                  </div>
                  <div class="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                    <div v-for="(subType, idx) in masterStore.cargoSubTypeMap[selectedCargoType]" :key="idx" class="flex items-center space-x-2">
                      <input v-model="masterStore.cargoSubTypeMap[selectedCargoType][idx]" class="flex-1 h-9 px-3 border border-slate-200 focus:border-emerald-500 rounded-lg text-xs text-slate-800 outline-none" placeholder="Sub type name" />
                      <button @click="removeSubType(idx)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <span class="material-icons text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <span class="material-icons text-3xl mb-1 text-slate-300">category</span>
                  Pilih cargo type di samping untuk melihat sub types.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: VENDORS -->
        <div v-if="currentMainTab === 'vendors'" class="space-y-4">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-black text-slate-800">Transporter / Vendors Master List</h3>
          </div>
          
          <div class="flex space-x-3">
            <input v-model="newVendor" @keyup.enter="addVendor" placeholder="Type new vendor name..." class="flex-1 h-11 px-4 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none uppercase font-bold text-slate-800 text-xs transition-colors" />
            <button @click="addVendor" class="h-11 px-6 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-colors shadow flex items-center">
              <span class="material-icons text-[18px] mr-1">add</span> Add
            </button>
          </div>

          <div class="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap gap-2 min-h-[220px] items-start content-start">
            <div v-for="(vendor, index) in masterStore.vendors" :key="index" class="flex items-center bg-emerald-50 border border-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
              {{ vendor }}
              <button @click="removeVendor(index)" class="ml-2 text-emerald-400 hover:text-red-500 transition-colors flex items-center">
                <span class="material-icons text-[16px]">cancel</span>
              </button>
            </div>
            <div v-if="masterStore.vendors.length === 0" class="text-slate-400 text-xs w-full text-center mt-10">
              Belum ada vendor terdaftar.
            </div>
          </div>
          
          <div class="flex justify-end pt-2">
            <button @click="masterStore.saveVendors()" :disabled="masterStore.saving" class="flex items-center px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow">
              <span v-if="masterStore.saving" class="material-icons animate-spin text-[16px] mr-2">autorenew</span>
              Save Vendors
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
  </transition>

  <!-- ════════════════════════════════════════════════════════════════ -->
  <!-- MODAL: ADD GSP PRODUCT -->
  <!-- ════════════════════════════════════════════════════════════════ -->
  <transition name="modal">
    <div
      v-if="showAddGspModal"
      class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div class="flex justify-between items-center border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span class="material-icons text-emerald-600">add_box</span>
            <h3 class="text-base font-black text-slate-800">Tambah Produk Master GSP</h3>
          </div>
          <button @click="showAddGspModal = false" class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <span class="material-icons text-lg">close</span>
          </button>
        </div>

        <div class="space-y-3.5 text-xs">
          <!-- Process Type (Read-only GSP) -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">Process Type</label>
            <input type="text" value="GSP" disabled class="w-full h-10 px-3 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-600" />
          </div>

          <!-- Cargo Type (Category) -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">Cargo Type (Kategori) *</label>
            <select v-model="newGspForm.category" class="w-full h-10 px-3 rounded-lg border border-slate-200 font-bold text-slate-800 focus:border-emerald-500 outline-none">
              <option value="Coal">Coal</option>
              <option value="Fuel">Fuel</option>
              <option value="Chemical UTL">Chemical UTL</option>
              <option value="Chemical PROD">Chemical PROD</option>
            </select>
          </div>

          <!-- Product Code -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">Product Code *</label>
            <input v-model="newGspForm.code" placeholder="e.g. PAC-004, COAL-002" class="w-full h-10 px-3 rounded-lg border border-slate-200 font-mono font-bold uppercase text-slate-800 focus:border-emerald-500 outline-none" />
          </div>

          <!-- Material / Product Name -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">Material / Product Name *</label>
            <input v-model="newGspForm.name" placeholder="e.g. NEW CHEMICAL XYZ" class="w-full h-10 px-3 rounded-lg border border-slate-200 font-bold text-slate-800 focus:border-emerald-500 outline-none" />
          </div>

          <!-- Analysis Profile -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">
              Analysis Profile <span class="text-amber-600">(Wajib Dipilih untuk Aktivasi)</span>
            </label>
            <select v-model="newGspForm.gspAnalysisProfile" class="w-full h-10 px-3 rounded-lg border border-slate-200 font-bold text-slate-800 focus:border-emerald-500 outline-none">
              <option :value="null">-- Belum Ditetapkan (Tetap Inactive) --</option>
              <option value="COAL_PA">COAL_PA (Uji Batubara Lab)</option>
              <option value="PA_EXEMPT">PA_EXEMPT (Bebas Analisis PA)</option>
              <option value="PAC_PA">PAC_PA (Uji PAC & Coagulant Lab)</option>
              <option value="RAPID_KLEN_PA">RAPID_KLEN_PA (Uji Rapid Klen & Sanitizer Lab)</option>
            </select>
          </div>

          <!-- Policy Version -->
          <div>
            <label class="block font-black text-slate-700 uppercase tracking-widest mb-1 text-[10px]">Policy Version</label>
            <input v-model="newGspForm.policyVersion" class="w-full h-10 px-3 rounded-lg border border-slate-200 font-mono text-slate-800 focus:border-emerald-500 outline-none" />
          </div>

          <!-- Active Switch -->
          <div class="pt-1 flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span class="block font-black text-slate-800">Status Aktif Produk</span>
              <span class="text-[10px] text-slate-500">
                {{ !newGspForm.gspAnalysisProfile ? 'Aktivasi dinonaktifkan sampai Analysis Profile dipilih.' : 'Produk siap digunakan untuk registrasi Security.' }}
              </span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                v-model="newGspForm.isActive"
                :disabled="!newGspForm.gspAnalysisProfile"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-disabled:opacity-40"></div>
            </label>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="flex justify-end space-x-2 pt-3 border-t border-slate-100">
          <button @click="showAddGspModal = false" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">
            Batal
          </button>
          <button
            @click="submitAddGspProduct"
            :disabled="!canSubmitGsp || masterStore.savingGsp"
            class="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow"
          >
            {{ masterStore.savingGsp ? 'Menyimpan...' : 'Simpan Produk' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
  </teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useMasterDataStore } from '../stores/masterDataStore'

const emit = defineEmits(['close'])
const masterStore = useMasterDataStore()

onMounted(async () => {
  await masterStore.fetchAll()
})

const currentMainTab = ref('materials') // 'materials' | 'vendors'
const selectedProcess = ref('GSP') // 'GBB' | 'GBJ' | 'GSP'

// GSP logic
const getGspProductsByCategory = (catName) => {
  return (masterStore.gspProducts || []).filter(p => p.category === catName)
}

const getProfileBadgeClass = (profile) => {
  switch (profile) {
    case 'COAL_PA':
      return 'bg-amber-100 text-amber-800'
    case 'PA_EXEMPT':
      return 'bg-emerald-100 text-emerald-800'
    case 'PAC_PA':
      return 'bg-indigo-100 text-indigo-800'
    case 'RAPID_KLEN_PA':
      return 'bg-cyan-100 text-cyan-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

const handleToggleActive = async (prod) => {
  await masterStore.toggleGspProductActive(prod)
}

const handleDeleteGsp = async (prod) => {
  if (confirm(`Yakin ingin memproses produk "${prod.name}" (${prod.code})? Jika sudah memiliki transaksi, produk akan dinonaktifkan secara aman.`)) {
    await masterStore.deleteGspProduct(prod.id)
  }
}

// Add GSP Product Modal logic
const showAddGspModal = ref(false)
const newGspForm = reactive({
  code: '',
  name: '',
  category: 'Chemical UTL',
  processType: 'GSP',
  gspAnalysisProfile: null,
  policyVersion: 'SOP-GSP-2026.1',
  isActive: false
})

const canSubmitGsp = computed(() => {
  if (!newGspForm.code.trim() || !newGspForm.name.trim() || !newGspForm.category) return false
  if (newGspForm.isActive && !newGspForm.gspAnalysisProfile) return false
  return true
})

const submitAddGspProduct = async () => {
  if (!canSubmitGsp.value) return
  const payload = {
    code: newGspForm.code.trim().toUpperCase(),
    name: newGspForm.name.trim(),
    category: newGspForm.category,
    subCategory: newGspForm.name.trim(),
    processType: 'GSP',
    gspAnalysisProfile: newGspForm.gspAnalysisProfile || null,
    isPaRequired: newGspForm.gspAnalysisProfile === 'PA_EXEMPT' ? false : true,
    policyVersion: newGspForm.policyVersion || 'SOP-GSP-2026.1',
    isActive: !!newGspForm.isActive
  }

  const res = await masterStore.createGspProduct(payload)
  if (res.success) {
    showAddGspModal.value = false
    // Reset form
    newGspForm.code = ''
    newGspForm.name = ''
    newGspForm.category = 'Chemical UTL'
    newGspForm.gspAnalysisProfile = null
    newGspForm.isActive = false
  }
}

// Legacy Tab 1 logic
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

// Tab 2 logic (Vendors)
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
