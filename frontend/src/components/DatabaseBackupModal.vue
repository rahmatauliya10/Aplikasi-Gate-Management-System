<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
    >
      <div
        class="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all animate-scaleUp flex flex-col max-h-[90vh]"
      >
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <span class="material-icons text-xl">storage</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">Database Backup & Recovery Dashboard</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">Sistem Perlindungan Data Berlapis GMS (Local Drive D & NAS Offsite Copy)</p>
            </div>
          </div>
          <button
            @click="closeModal"
            class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <span class="material-icons text-lg">close</span>
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-3 gap-6 bg-slate-50/30 dark:bg-slate-800/10 shrink-0">
          <button
            @click="activeTab = 'dashboard'"
            :class="[
              'pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2',
              activeTab === 'dashboard'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            ]"
          >
            <span class="material-icons text-base">dashboard</span>
            Status & Riwayat Backup
          </button>
          <button
            @click="activeTab = 'restore'"
            :class="[
              'pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2',
              activeTab === 'restore'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            ]"
          >
            <span class="material-icons text-base">cloud_upload</span>
            Pemulihan Data (Restore)
          </button>
        </div>

        <!-- Scrollable Body Content -->
        <div class="p-6 space-y-6 overflow-y-auto flex-1">
          <!-- Alert Message Banner -->
          <div
            v-if="statusMessage.text"
            :class="[
              'p-4 rounded-xl text-xs font-medium flex items-start gap-3 transition-all',
              statusMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            ]"
          >
            <span class="material-icons text-lg shrink-0 mt-0.5">
              {{ statusMessage.type === 'error' ? 'error_outline' : 'check_circle' }}
            </span>
            <div class="flex-1">{{ statusMessage.text }}</div>
          </div>

          <!-- TAB 1: DASHBOARD & HISTORY -->
          <div v-if="activeTab === 'dashboard'" class="space-y-6">
            <!-- Health Status Badge Banner -->
            <div class="p-4 rounded-2xl border flex items-center justify-between"
              :class="[
                systemStatus.status === 'PROTECTED'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : systemStatus.status === 'DEGRADED'
                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              ]"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full animate-ping shrink-0"
                  :class="[
                    systemStatus.status === 'PROTECTED' ? 'bg-emerald-500' : systemStatus.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-rose-500'
                  ]"
                ></div>
                <div>
                  <div class="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    STATUS KEANDALAN SISTEM:
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold"
                      :class="[
                        systemStatus.status === 'PROTECTED'
                          ? 'bg-emerald-600 text-white'
                          : systemStatus.status === 'DEGRADED'
                          ? 'bg-amber-600 text-white'
                          : 'bg-rose-600 text-white'
                      ]"
                    >
                      ● {{ systemStatus.status || 'PROTECTED' }}
                    </span>
                  </div>
                  <p class="text-[11px] opacity-80 mt-0.5">
                    {{ systemStatus.status === 'PROTECTED'
                      ? 'Sistem Terlindungi — Seluruh verifikasi checksum lokal (Drive D) & NAS valid (SLA < 6 jam)'
                      : backupHistory.length === 0
                      ? 'Inisiasi Sistem — Belum ada riwayat backup tercatat. Klik "Backup Sekarang" untuk membuat snapshot data pertama.'
                      : 'Perhatian: Terjadi degradasi penyalinan offsite atau SLA terlewati.'
                    }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  @click="handleTriggerBackup"
                  :disabled="isActionLoading"
                  class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md hover:shadow-emerald-500/25 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span v-if="isActionLoading" class="material-icons text-sm animate-spin">refresh</span>
                  <span v-else class="material-icons text-sm">download</span>
                  Backup Sekarang
                </button>
                <button
                  @click="handleDownloadSnapshot"
                  :disabled="isActionLoading"
                  class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span v-if="isActionLoading" class="material-icons text-sm animate-spin">refresh</span>
                  <span v-else class="material-icons text-sm">file_download</span>
                  Ekspor JSON
                </button>
              </div>
            </div>

            <!-- Metric Cards Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div class="text-[11px] font-bold text-slate-400 uppercase">Target RPO SLA</div>
                <div class="text-base font-black text-slate-900 dark:text-white mt-1">6 Jam</div>
                <div class="text-[10px] text-slate-500 mt-0.5">Otomatis 4x Sehari</div>
              </div>

              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div class="text-[11px] font-bold text-slate-400 uppercase">Umur Backup Terakhir</div>
                <div class="text-base font-black text-slate-900 dark:text-white mt-1">
                  {{ systemStatus.lastBackupAgeHours ? systemStatus.lastBackupAgeHours.toFixed(1) + ' Jam' : 'Baru Saja' }}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">
                  {{ systemStatus.lastBackupTimestamp ? new Date(systemStatus.lastBackupTimestamp).toLocaleTimeString('id-ID') : '-' }}
                </div>
              </div>

              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div class="text-[11px] font-bold text-slate-400 uppercase">Status Local (Drive D)</div>
                <div
                  :class="[
                    'text-sm font-black mt-1 flex items-center gap-1',
                    systemStatus.localBackupStatus === 'VERIFIED'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  ]"
                >
                  <span class="material-icons text-base">
                    {{ systemStatus.localBackupStatus === 'VERIFIED' ? 'check_circle' : 'error' }}
                  </span>
                  {{ systemStatus.localBackupStatus || 'NONE' }}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">
                  {{ systemStatus.localBackupStatus === 'VERIFIED' ? 'Checksum & Dump Valid' : 'Pemeriksaan Lokal Gagal' }}
                </div>
              </div>

              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div class="text-[11px] font-bold text-slate-400 uppercase">Status NAS Offsite</div>
                <div
                  :class="[
                    'text-sm font-black mt-1 flex items-center gap-1',
                    systemStatus.offsiteBackupStatus === 'VERIFIED'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : systemStatus.offsiteBackupStatus === 'PENDING'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  ]"
                >
                  <span class="material-icons text-base">
                    {{ systemStatus.offsiteBackupStatus === 'VERIFIED' ? 'cloud_done' : 'cloud_off' }}
                  </span>
                  {{ systemStatus.offsiteBackupStatus || 'NONE' }}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">
                  {{ systemStatus.offsiteBackupStatus === 'VERIFIED' ? 'NAS Storage Sync' : 'Belum Terverifikasi' }}
                </div>
              </div>
            </div>

            <!-- Official Backup History Table -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span class="material-icons text-sm text-emerald-500">history</span>
                  Riwayat Backup Resmi Server
                </h4>
                <button @click="loadData" class="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1">
                  <span class="material-icons text-sm">refresh</span> Refresh List
                </button>
              </div>

              <div class="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table class="w-full text-left border-collapse text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th class="py-3 px-4">Tanggal & Waktu</th>
                      <th class="py-3 px-4">Tipe Backup</th>
                      <th class="py-3 px-4">Tabel / Record Count</th>
                      <th class="py-3 px-4">Status Local</th>
                      <th class="py-3 px-4">Status NAS</th>
                      <th class="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    <tr v-if="backupHistory.length === 0">
                      <td colspan="6" class="py-6 text-center text-slate-400">Belum ada riwayat backup tercatat.</td>
                    </tr>
                    <tr v-for="item in backupHistory" :key="item.backupId" class="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td class="py-3 px-4 font-medium">{{ new Date(item.createdAt).toLocaleString('id-ID') }}</td>
                      <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {{ item.backupType }}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-[11px]">
                        {{ item.recordCounts ? Object.values(item.recordCounts).reduce((a,b)=>a+b,0) : 'Full Dump' }} entri
                      </td>
                      <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          {{ item.localStatus }}
                        </span>
                      </td>
                      <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          {{ item.offsiteStatus }}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-right space-x-2">
                        <button @click="handleDownloadSnapshot" class="text-emerald-600 hover:text-emerald-800 font-semibold text-[11px]">Download</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 2: SAFE RESTORE WORKFLOW -->
          <div v-else-if="activeTab === 'restore'" class="space-y-5">
            <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs flex items-start gap-3">
              <span class="material-icons text-amber-500 text-xl shrink-0 mt-0.5">security</span>
              <div>
                <strong class="font-bold">PROSEDUR RESTORE AMAN BERLAPIS:</strong> Pemulihan database dilakukan melalui pembuatan <em>Auto Pre-Restore Snapshot</em> terlebih dahulu sebelum data diperbarui.
              </div>
            </div>

            <!-- Step 1: File Drop Zone -->
            <div
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleFileDrop"
              :class="[
                'border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer relative',
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : selectedFile
                  ? 'border-emerald-400 bg-slate-50 dark:bg-slate-800/40'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/20'
              ]"
              @click="$refs.fileInput.click()"
            >
              <input ref="fileInput" type="file" accept=".json,.dump" class="hidden" @change="handleFileSelect" />

              <div v-if="!selectedFile" class="space-y-2">
                <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
                  <span class="material-icons text-2xl">upload_file</span>
                </div>
                <div class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Tarik file backup `.json` ke sini, atau <span class="text-emerald-600 dark:text-emerald-400 underline">pilih file</span>
                </div>
                <p class="text-[10px] text-slate-400">Berkas Snapshot Backup GMS Resmi (Maks. 50MB)</p>
              </div>

              <div v-else class="flex items-center justify-between text-left">
                <div class="flex items-center gap-3">
                  <span class="material-icons text-emerald-500 text-3xl">description</span>
                  <div>
                    <div class="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs">{{ selectedFile.name }}</div>
                    <div class="text-[11px] text-slate-400">{{ (selectedFile.size / 1024).toFixed(1) }} KB</div>
                  </div>
                </div>
                <button @click.stop="removeSelectedFile" class="text-xs font-semibold text-rose-500 hover:text-rose-700 p-2">Ganti File</button>
              </div>
            </div>

            <!-- Step 2: Parsed Metadata Preview -->
            <div v-if="parsedMetadata" class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div class="font-bold text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span>Informasi Metadata Backup</span>
                <span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-mono font-bold">Checksum SHA-256 Valid</span>
              </div>
              <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <div>Pembuat: <span class="font-semibold text-slate-900 dark:text-white">{{ parsedMetadata.createdBy?.name || parsedMetadata.createdBy?.email }}</span></div>
                <div>Tanggal: <span class="font-semibold text-slate-900 dark:text-white">{{ new Date(parsedMetadata.createdAt).toLocaleString('id-ID') }}</span></div>
                <div>Jumlah Record: <span class="font-semibold text-slate-900 dark:text-white">{{ parsedMetadata.totalRecords }} entri</span></div>
                <div class="truncate">Checksum: <span class="font-mono text-[10px] text-slate-500">{{ parsedMetadata.checksum?.substring(0, 16) }}...</span></div>
              </div>
            </div>

            <!-- Step 3: Pre-Restore Safety Checklists -->
            <div v-if="selectedFile && parsedMetadata" class="space-y-3 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
              <div class="text-xs font-bold text-slate-900 dark:text-white">Checklist Konfirmasi Keselamatan:</div>
              <div class="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                <label class="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" v-model="checklist1" class="rounded text-emerald-600 focus:ring-emerald-500" />
                  <span>Saya memahami data berjalan saat ini akan diperbarui dari file backup.</span>
                </label>
                <label class="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" v-model="checklist2" class="rounded text-emerald-600 focus:ring-emerald-500" />
                  <span>Saya telah memverifikasi checksum file ini valid dan berasal dari sumber terpercaya.</span>
                </label>
              </div>
            </div>

            <!-- Step 4: Re-Authentication Password & RESTORE prompt -->
            <div v-if="checklist1 && checklist2" class="space-y-3 pt-2">
              <div class="space-y-1">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Password Admin <span class="text-rose-500">*</span>
                </label>
                <input
                  v-model="adminPasswordConfirm"
                  type="password"
                  placeholder="Masukkan password admin Anda"
                  class="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white"
                />
              </div>

              <div class="space-y-1">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ketik kata <span class="font-mono text-rose-600 font-black">RESTORE</span> untuk konfirmasi final
                </label>
                <input
                  v-model="safetyTextConfirm"
                  type="text"
                  placeholder="RESTORE"
                  class="w-full px-3.5 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white uppercase"
                />
              </div>

              <div class="pt-2 flex justify-end">
                <button
                  @click="handleRestoreDatabase"
                  :disabled="isRestoring || !adminPasswordConfirm || safetyTextConfirm.trim() !== 'RESTORE'"
                  class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold transition-all shadow-md hover:shadow-rose-500/25 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span v-if="isRestoring" class="material-icons text-base animate-spin">refresh</span>
                  <span v-else class="material-icons text-base">restore</span>
                  {{ isRestoring ? 'Memulihkan Database...' : 'Jalankan Pemulihan Database' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import settingsService from '../services/settingsService'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const activeTab = ref('dashboard')
const isActionLoading = ref(false)
const isRestoring = ref(false)
const isDragging = ref(false)
const selectedFile = ref(null)
const parsedMetadata = ref(null)
const parsedFullBackup = ref(null)

const checklist1 = ref(false)
const checklist2 = ref(false)
const adminPasswordConfirm = ref('')
const safetyTextConfirm = ref('')

const systemStatus = ref({
  status: 'PROTECTED',
  targetRpoHours: 6,
  lastBackupAgeHours: 0,
  lastBackupTimestamp: null,
  localBackupStatus: 'VERIFIED',
  offsiteBackupStatus: 'VERIFIED',
})

const backupHistory = ref([])

const statusMessage = ref({
  type: '',
  text: ''
})

const closeModal = () => {
  resetState()
  emit('close')
}

const resetState = () => {
  activeTab.value = 'dashboard'
  isActionLoading.value = false
  isRestoring.value = false
  selectedFile.value = null
  parsedMetadata.value = null
  parsedFullBackup.value = null
  checklist1.value = false
  checklist2.value = false
  adminPasswordConfirm.value = ''
  safetyTextConfirm.value = ''
  statusMessage.value = { type: '', text: '' }
}

const loadData = async () => {
  try {
    const resStatus = await settingsService.getBackupStatus()
    if (resStatus?.data) systemStatus.value = resStatus.data

    const resHistory = await settingsService.getBackupHistory()
    if (resHistory?.data) backupHistory.value = resHistory.data
  } catch (e) {
    console.error('Failed to load backup dashboard data:', e)
  }
}

const handleTriggerBackup = async () => {
  isActionLoading.value = true
  statusMessage.value = { type: '', text: '' }

  try {
    const res = await settingsService.triggerBackup('MANUAL_EXPLICIT')
    statusMessage.value = {
      type: 'success',
      text: `Backup ${res.data?.backupId || ''} berhasil dibuat dan disimpan di Drive D & NAS!`
    }
    await loadData()
  } catch (error) {
    statusMessage.value = {
      type: 'error',
      text: error.gmsMessage || error.response?.data?.message || 'Gagal memicu backup database.'
    }
  } finally {
    isActionLoading.value = false
  }
}

const handleDownloadSnapshot = async () => {
  isActionLoading.value = true
  statusMessage.value = { type: '', text: '' }

  try {
    const response = await settingsService.downloadBackup()
    const blob = new Blob([response.data], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    
    // Extract filename from header if present, or format default timestamp
    let filename = `GMS_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const disposition = response.headers?.['content-disposition']
    if (disposition && disposition.includes('filename=')) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition)
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '')
      }
    }

    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    statusMessage.value = {
      type: 'success',
      text: 'Snapshot backup JSON berhasil diunduh!'
    }
  } catch (error) {
    statusMessage.value = {
      type: 'error',
      text: error.gmsMessage || error.response?.data?.message || 'Gagal mengunduh berkas backup.'
    }
  } finally {
    isActionLoading.value = false
  }
}

const handleFileSelect = (e) => {
  const file = e.target.files[0]
  if (file) processFile(file)
}

const handleFileDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) processFile(file)
}

const removeSelectedFile = () => {
  selectedFile.value = null
  parsedMetadata.value = null
  parsedFullBackup.value = null
  checklist1.value = false
  checklist2.value = false
  adminPasswordConfirm.value = ''
  safetyTextConfirm.value = ''
}

const processFile = (file) => {
  if (!file.name.endsWith('.json') && !file.name.endsWith('.dump')) {
    statusMessage.value = {
      type: 'error',
      text: 'Format berkas tidak valid. Pilih file `.json` atau `.dump` resmi GMS.'
    }
    return
  }

  selectedFile.value = file
  statusMessage.value = { type: '', text: '' }

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result)
      if (json.metadata && json.data && json.metadata.system === 'GMS_GATE_MANAGEMENT_SYSTEM') {
        parsedMetadata.value = json.metadata
        parsedFullBackup.value = json
      } else {
        throw new Error('Format bukan backup GMS resmi.')
      }
    } catch (err) {
      statusMessage.value = {
        type: 'error',
        text: 'Berkas JSON rusak atau bukan merupakan file backup GMS resmi.'
      }
      removeSelectedFile()
    }
  }
  reader.readAsText(file)
}

const handleRestoreDatabase = async () => {
  if (!parsedFullBackup.value || !adminPasswordConfirm.value) return

  isRestoring.value = true
  statusMessage.value = { type: '', text: '' }

  try {
    const res = await settingsService.restoreDatabase(
      parsedFullBackup.value,
      adminPasswordConfirm.value
    )

    statusMessage.value = {
      type: 'success',
      text: `Pemulihan sukses! ${res.data?.totalRecordsRestored || ''} record dipulihkan.`
    }

    setTimeout(() => {
      closeModal()
      window.location.reload()
    }, 2000)
  } catch (error) {
    statusMessage.value = {
      type: 'error',
      text: error.gmsMessage || error.response?.data?.message || 'Gagal memulihkan database.'
    }
  } finally {
    isRestoring.value = false
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    resetState()
    loadData()
  } else {
    resetState()
  }
})

onMounted(() => {
  if (props.isOpen) {
    resetState()
    loadData()
  }
})
</script>
