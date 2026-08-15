<template>
  <div class="user-management">
    <!-- Page Header -->
    <div class="relative bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 sm:p-8 mb-8 overflow-hidden">
      <!-- Decorative background blur -->
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-400/10 rounded-full blur-3xl pointer-events-none"></div>
      
      <div class="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 z-10">
        <!-- Title & Subtitle -->
        <div class="flex items-center gap-4">
          <div class="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-purple-600"></div>
          <div>
            <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">User Management</h1>
            <p class="text-xs font-black text-blue-500 uppercase tracking-[0.15em] mt-1.5">KELOLA PENGGUNA SISTEM GMS</p>
          </div>
        </div>

        <!-- Action Button -->
        <button @click="openCreateModal" 
          class="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-black text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-300 active:scale-95 bg-gradient-to-r from-blue-500 to-purple-600 w-full sm:w-auto">
          <span class="material-icons text-lg">person_add</span>
          Tambah User
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <span class="material-icons text-blue-500 text-xl">groups</span>
          </div>
          <div>
            <p class="text-xs font-black text-slate-400 uppercase tracking-wider">Total</p>
            <p class="text-xl font-black text-slate-900">{{ users.length }}</p>
          </div>
        </div>
      </div>
      <div class="stat-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <span class="material-icons text-emerald-500 text-xl">check_circle</span>
          </div>
          <div>
            <p class="text-xs font-black text-slate-400 uppercase tracking-wider">Aktif</p>
            <p class="text-xl font-black text-emerald-600">{{ users.filter(u => u.isActive).length }}</p>
          </div>
        </div>
      </div>
      <div class="stat-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
            <span class="material-icons text-rose-500 text-xl">block</span>
          </div>
          <div>
            <p class="text-xs font-black text-slate-400 uppercase tracking-wider">Nonaktif</p>
            <p class="text-xl font-black text-rose-600">{{ users.filter(u => !u.isActive).length }}</p>
          </div>
        </div>
      </div>
      <div class="stat-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <span class="material-icons text-purple-500 text-xl">admin_panel_settings</span>
          </div>
          <div>
            <p class="text-xs font-black text-slate-400 uppercase tracking-wider">Admin</p>
            <p class="text-xl font-black text-purple-600">{{ users.filter(u => u.role === 'ADMIN').length }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Search & Filter -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 p-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input v-model="searchQuery" type="text" placeholder="Cari nama, email, atau username..."
            class="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 border border-slate-100 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all" />
        </div>
        <select v-model="filterRole"
          class="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 border border-slate-100 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all cursor-pointer">
          <option value="">Semua Role</option>
          <option value="ADMIN">Admin</option>
          <option value="SECURITY">Security</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="QC">QC</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center items-center py-20">
      <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-500"></div>
    </div>

    <!-- Users Table -->
    <div v-else class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">User</th>
              <th class="text-left px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">Username</th>
              <th class="text-left px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">Role</th>
              <th class="text-left px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">Status</th>
              <th class="text-left px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">Login Terakhir</th>
              <th class="text-center px-5 py-3.5 font-black text-xs text-slate-500 uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-slate-50/50 transition-colors">
              <!-- User Info -->
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0"
                    :style="{ background: roleColor(user.role) }">
                    {{ user.name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-slate-800 truncate">{{ user.name }}</p>
                    <p class="text-xs text-slate-400 truncate">{{ user.email }}</p>
                    <p v-if="user.phone" class="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                      <span class="material-icons text-[11px]">phone</span>{{ user.phone }}
                    </p>
                  </div>
                </div>
              </td>
              <!-- Username -->
              <td class="px-5 py-4">
                <span class="font-mono text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">{{ user.username }}</span>
              </td>
              <!-- Role -->
              <td class="px-5 py-4">
                <div class="space-y-1">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black" :class="roleBadgeClass(user.role)">
                    <span class="material-icons text-[13px]">{{ roleIcon(user.role) }}</span>
                    {{ roleLabel(user.role) }}
                  </span>
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 space-y-0.5">
                    <div v-if="user.department">Dept: {{ user.department }}</div>
                    <div v-if="user.site || user.area">Loc: {{ [user.site, user.area].filter(Boolean).join(' - ') }}</div>
                  </div>
                </div>
              </td>
              <!-- Status -->
              <td class="px-5 py-4">
                <button @click="toggleStatus(user)" :disabled="user.username === 'admin'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all duration-200"
                  :class="user.isActive ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'"
                  :title="user.username === 'admin' ? 'Admin utama tidak bisa dinonaktifkan' : (user.isActive ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan')">
                  <span class="material-icons text-[13px]">{{ user.isActive ? 'check_circle' : 'cancel' }}</span>
                  {{ user.isActive ? 'Aktif' : 'Nonaktif' }}
                </button>
              </td>
              <!-- Last Login -->
              <td class="px-5 py-4">
                <span class="text-xs font-bold text-slate-500">{{ user.lastLoginAt ? formatDate(user.lastLoginAt) : '—' }}</span>
              </td>
              <!-- Actions -->
              <td class="px-5 py-4">
                <div class="flex items-center justify-center gap-1">
                  <button @click="openEditModal(user)" class="action-btn" title="Edit">
                    <span class="material-icons text-[16px]">edit</span>
                  </button>
                  <button @click="openResetPasswordModal(user)" class="action-btn"
                    :disabled="user.username === 'admin'" title="Reset Password">
                    <span class="material-icons text-[16px]">lock_reset</span>
                  </button>
                  <button @click="confirmDelete(user)" class="action-btn text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                    :disabled="user.username === 'admin'" title="Hapus">
                    <span class="material-icons text-[16px]">delete_outline</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredUsers.length === 0">
              <td colspan="6" class="px-5 py-16 text-center">
                <span class="material-icons text-4xl text-slate-200 mb-2 block">person_off</span>
                <p class="text-sm font-bold text-slate-400">Tidak ada user ditemukan</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══ Create/Edit Modal ═══ -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showFormModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" @click.self="closeFormModal">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-100 animate-modal">
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 class="text-lg font-black text-slate-900">{{ isEditing ? 'Edit User' : 'Tambah User Baru' }}</h2>
              <button @click="closeFormModal" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            <!-- Body -->
            <div class="p-5 space-y-4">
              <!-- Name -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Nama Lengkap</label>
                <input v-model="form.name" type="text" placeholder="Nama lengkap"
                  class="input-field" />
              </div>
              <!-- Username -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
                <input v-model="form.username" type="text" placeholder="username (lowercase, no spaces)"
                  class="input-field font-mono" :disabled="isEditing && editingUser?.username === 'admin'" />
              </div>
              <!-- Email -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                <input v-model="form.email" type="email" placeholder="email@domain.com"
                  class="input-field" />
              </div>
              <!-- Phone Number -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Nomor Telepon (Opsional)</label>
                <input v-model="form.phone" type="text" placeholder="Contoh: 081234567890"
                  class="input-field" />
              </div>
              <!-- Department -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Departemen (Opsional)</label>
                <input v-model="form.department" type="text" placeholder="Contoh: Operational Excellence"
                  class="input-field" />
              </div>
              <!-- Site -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Site / Plant (Opsional)</label>
                <input v-model="form.site" type="text" placeholder="Contoh: SJA 3"
                  class="input-field" />
              </div>
              <!-- Area -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Area Kerja (Opsional)</label>
                <input v-model="form.area" type="text" placeholder="Contoh: Gate Security"
                  class="input-field" />
              </div>
              <!-- Role -->
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                <select v-model="form.role" class="input-field cursor-pointer">
                  <option value="" disabled>Pilih role</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SECURITY">Security</option>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="QC">QC</option>
                </select>
              </div>
              <!-- Process/Warehouse Access (conditional) -->
              <div v-if="form.role === 'WAREHOUSE' || form.role === 'QC' || form.role === 'ADMIN'">
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Akses Scope Proses / Gudang</label>
                <div class="flex flex-wrap gap-3">
                  <label v-for="wh in warehouseOptions" :key="wh" class="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all"
                    :class="form.warehouseAccess.includes(wh) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-blue-200'">
                    <input type="checkbox" :value="wh" v-model="form.warehouseAccess" class="accent-blue-500" />
                    <span class="text-xs font-bold">{{ wh }}</span>
                  </label>
                </div>
              </div>
              <!-- Error -->
              <div v-if="formError" class="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
                <span class="material-icons text-rose-500 text-lg">error</span>
                <p class="text-xs font-bold text-rose-600">{{ formError }}</p>
              </div>
            </div>
            <!-- Footer -->
            <div class="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button @click="closeFormModal" class="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">
                Batal
              </button>
              <button @click="submitForm" :disabled="submitting" class="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-60">
                <span v-if="submitting" class="animate-spin material-icons text-sm mr-1">sync</span>
                {{ isEditing ? 'Simpan' : 'Buat User' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- ═══ Reset Password Modal ═══ -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showResetModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" @click.self="closeResetModal">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 animate-modal">
            <div class="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 class="text-lg font-black text-slate-900">Reset Password</h2>
              <button @click="closeResetModal" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <p class="text-sm text-slate-600">Reset password untuk <strong class="text-slate-800">{{ resetTarget?.name }}</strong> (<span class="font-mono text-xs">{{ resetTarget?.username }}</span>)?</p>
              <p class="text-xs text-slate-400 font-semibold leading-relaxed">
                Password baru sementara akan di-generate otomatis oleh sistem dan harus diserahkan secara aman ke pengguna tersebut.
              </p>
              <div v-if="resetError" class="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
                <span class="material-icons text-rose-500 text-lg">error</span>
                <p class="text-xs font-bold text-rose-600">{{ resetError }}</p>
              </div>
            </div>
            <div class="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button @click="closeResetModal" class="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">Batal</button>
              <button @click="submitResetPassword" :disabled="submitting" class="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-60">
                <span v-if="submitting" class="animate-spin material-icons text-sm mr-1">sync</span>
                Reset Password
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- ═══ Delete Confirmation Modal ═══ -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showDeleteModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" @click.self="closeDeleteModal">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 animate-modal">
            <div class="p-6 text-center">
              <div class="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                <span class="material-icons text-rose-500 text-3xl">warning</span>
              </div>
              <h2 class="text-lg font-black text-slate-900 mb-2">Hapus User?</h2>
              <p class="text-sm text-slate-500">User <strong class="text-slate-700">{{ deleteTarget?.name }}</strong> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div class="flex items-center justify-center gap-3 p-5 border-t border-slate-100">
              <button @click="closeDeleteModal" class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">Batal</button>
              <button @click="submitDelete" :disabled="submitting" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-md hover:shadow-lg transition-all disabled:opacity-60">
                <span v-if="submitting" class="animate-spin material-icons text-sm mr-1">sync</span>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- ═══ Toast Notification ═══ -->
    <transition name="slide-up">
      <div v-if="toast.show" class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-sm font-bold"
        :class="toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'">
        <span class="material-icons text-lg">{{ toast.type === 'success' ? 'check_circle' : 'error' }}</span>
        {{ toast.message }}
      </div>
    </transition>

    <!-- ═══ Success Password Modal ═══ -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showSuccessPasswordModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" @click.self="closeSuccessPasswordModal">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden animate-modal">
            <div class="flex items-center justify-between p-5 border-b border-slate-100 bg-emerald-50">
              <h2 class="text-lg font-black text-emerald-800 flex items-center gap-2">
                <span class="material-icons text-emerald-600">check_circle</span>
                {{ successModalTitle }}
              </h2>
              <button @click="closeSuccessPasswordModal" class="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-all">
                <span class="material-icons text-lg">close</span>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <p class="text-sm text-slate-600">Password sementara berhasil dibuat untuk user berikut:</p>
              <div class="bg-slate-50 p-4 rounded-xl space-y-2.5 border border-slate-100 text-xs">
                <div class="flex justify-between"><span class="text-slate-400 font-bold">Nama:</span><span class="font-bold text-slate-800">{{ successModalUser.name }}</span></div>
                <div class="flex justify-between"><span class="text-slate-400 font-bold">Username:</span><span class="font-mono text-slate-800">{{ successModalUser.username }}</span></div>
                <div class="flex justify-between items-center"><span class="text-slate-400 font-bold">Password Sementara:</span><span class="font-mono bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg font-bold border border-blue-100 select-all">{{ successModalUser.tempPass }}</span></div>
              </div>
              <div class="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-2.5">
                <span class="material-icons text-amber-600 text-lg">warning</span>
                <p class="text-xs text-amber-700 leading-relaxed font-semibold">
                  Gunakan password di atas untuk login pertama kali. Password sementara ini berlaku selama <strong>24 jam</strong> dan wajib diganti segera setelah masuk.
                </p>
              </div>
            </div>
            <div class="flex items-center justify-end gap-3 p-5 border-t border-slate-100 bg-slate-50">
              <button @click="copyTempPassword" class="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5">
                <span class="material-icons text-sm">content_copy</span>
                Salin Password
              </button>
              <button @click="closeSuccessPasswordModal" class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-100 hover:bg-slate-50 transition-all">
                Tutup
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import usersService from '../services/usersService'
import { getErrorMessage } from '../utils/errorMessage'

// ── State ──
const users = ref([])
const loading = ref(true)
const searchQuery = ref('')
const filterRole = ref('')

// Form modal
const showFormModal = ref(false)
const isEditing = ref(false)
const editingUser = ref(null)
const submitting = ref(false)
const formError = ref('')
const form = ref(getEmptyForm())

// Reset password modal
const showResetModal = ref(false)
const resetTarget = ref(null)
const resetPassword = ref('')
const resetError = ref('')

// Delete modal
const showDeleteModal = ref(false)
const deleteTarget = ref(null)

// Toast
const toast = ref({ show: false, message: '', type: 'success' })

const warehouseOptions = ['GBB', 'GBJ', 'GSP']

// Success password modal
const showSuccessPasswordModal = ref(false)
const successModalTitle = ref('')
const successModalUser = ref({ name: '', username: '', tempPass: '' })

function closeSuccessPasswordModal() {
  showSuccessPasswordModal.value = false
}

function copyTempPassword() {
  if (successModalUser.value.tempPass) {
    navigator.clipboard.writeText(successModalUser.value.tempPass)
    showToast('Password sementara disalin ke clipboard')
  }
}

// ── Computed ──
const filteredUsers = computed(() => {
  let list = users.value
  if (filterRole.value) {
    list = list.filter(u => u.role === filterRole.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    )
  }
  return list
})

// ── Helpers ──
function getEmptyForm() {
  return { name: '', username: '', email: '', role: '', warehouseAccess: [], phone: '', department: '', site: '', area: '' }
}

function roleColor(role) {
  const map = { ADMIN: '#6366f1', SECURITY: '#f59e0b', WAREHOUSE: '#3b82f6', QC: '#10b981' }
  return map[role] || '#94a3b8'
}

function roleBadgeClass(role) {
  const map = {
    ADMIN: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    SECURITY: 'bg-amber-50 text-amber-600 border border-amber-100',
    WAREHOUSE: 'bg-blue-50 text-blue-600 border border-blue-100',
    QC: 'bg-emerald-50 text-emerald-600 border border-emerald-100'
  }
  return map[role] || 'bg-slate-50 text-slate-600 border border-slate-100'
}

function roleIcon(role) {
  const map = { ADMIN: 'shield', SECURITY: 'security', WAREHOUSE: 'warehouse', QC: 'verified' }
  return map[role] || 'person'
}

function roleLabel(role) {
  const map = { ADMIN: 'Admin', SECURITY: 'Security', WAREHOUSE: 'Warehouse', QC: 'QC' }
  return map[role] || role
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function extractError(err) {
  return err.gmsMessage || getErrorMessage(err)
}

// ── Data Fetch ──
async function fetchUsers() {
  loading.value = true
  try {
    const res = await usersService.getAll()
    const data = res.data?.data || res.data || []
    users.value = Array.isArray(data) ? data : []
  } catch (err) {
    showToast('Gagal memuat data pengguna', 'error')
  } finally {
    loading.value = false
  }
}

// ── Create / Edit ──
function openCreateModal() {
  isEditing.value = false
  editingUser.value = null
  form.value = getEmptyForm()
  formError.value = ''
  showFormModal.value = true
}

function openEditModal(user) {
  isEditing.value = true
  editingUser.value = user
  form.value = {
    name: user.name || '',
    username: user.username || '',
    email: user.email || '',
    role: user.role || '',
    warehouseAccess: Array.isArray(user.warehouseAccess) ? [...user.warehouseAccess] : [],
    phone: user.phone || '',
    department: user.department || '',
    site: user.site || '',
    area: user.area || ''
  }
  formError.value = ''
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
}

async function submitForm() {
  formError.value = ''

  // Basic validation
  if (!form.value.name.trim()) { formError.value = 'Nama wajib diisi'; return }
  if (!form.value.username.trim()) { formError.value = 'Username wajib diisi'; return }
  if (!form.value.email.trim()) { formError.value = 'Email wajib diisi'; return }
  if (!form.value.role) { formError.value = 'Role wajib dipilih'; return }
  if ((form.value.role === 'WAREHOUSE' || form.value.role === 'QC') && form.value.warehouseAccess.length === 0) {
    formError.value = 'Role Warehouse dan QC membutuhkan minimal 1 akses proses/gudang'
    return
  }

  submitting.value = true
  try {
    if (isEditing.value) {
      // Build partial payload
      const payload = {}
      if (form.value.name !== editingUser.value.name) payload.name = form.value.name.trim()
      if (form.value.username !== editingUser.value.username) payload.username = form.value.username.trim()
      if (form.value.email !== editingUser.value.email) payload.email = form.value.email.trim()
      if (form.value.role !== editingUser.value.role) payload.role = form.value.role
      if (form.value.phone !== editingUser.value.phone) payload.phone = form.value.phone.trim()
      if (form.value.department !== editingUser.value.department) payload.department = form.value.department.trim()
      if (form.value.site !== editingUser.value.site) payload.site = form.value.site.trim()
      if (form.value.area !== editingUser.value.area) payload.area = form.value.area.trim()
      // Always send warehouseAccess if role requires it
      payload.warehouseAccess = form.value.warehouseAccess

      await usersService.update(editingUser.value.id, payload)
      closeFormModal()
      showToast('User berhasil diperbarui')
    } else {
      const payload = {
        name: form.value.name.trim(),
        username: form.value.username.trim().toLowerCase(),
        email: form.value.email.trim().toLowerCase(),
        role: form.value.role,
        warehouseAccess: form.value.warehouseAccess,
        phone: form.value.phone.trim(),
        department: form.value.department.trim(),
        site: form.value.site.trim(),
        area: form.value.area.trim()
      }
      const res = await usersService.create(payload)
      const resData = res.data?.data || res.data
      const tempPass = res.data?.temporaryPassword || resData?.temporaryPassword

      closeFormModal()
      showToast('User berhasil dibuat')

      successModalTitle.value = 'User Berhasil Dibuat'
      successModalUser.value = {
        name: resData.name || form.value.name,
        username: resData.username || form.value.username,
        tempPass: tempPass
      }
      showSuccessPasswordModal.value = true
    }
    await fetchUsers()
  } catch (err) {
    formError.value = extractError(err)
  } finally {
    submitting.value = false
  }
}

// ── Toggle Status ──
async function toggleStatus(user) {
  if (user.username === 'admin') return
  submitting.value = true
  try {
    await usersService.updateStatus(user.id, !user.isActive)
    showToast(`User ${user.name} ${user.isActive ? 'dinonaktifkan' : 'diaktifkan'}`)
    await fetchUsers()
  } catch (err) {
    showToast(extractError(err), 'error')
  } finally {
    submitting.value = false
  }
}

// ── Reset Password ──
function openResetPasswordModal(user) {
  if (user.username === 'admin') return
  resetTarget.value = user
  resetPassword.value = ''
  resetError.value = ''
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
}

async function submitResetPassword() {
  resetError.value = ''
  submitting.value = true
  try {
    const res = await usersService.resetPassword(resetTarget.value.id)
    const resData = res.data?.data || res.data
    const tempPass = resData?.temporaryPassword

    closeResetModal()
    showToast(`Password ${resetTarget.value.name} berhasil direset`)

    successModalTitle.value = 'Password Berhasil Direset'
    successModalUser.value = {
      name: resetTarget.value.name,
      username: resetTarget.value.username,
      tempPass: tempPass
    }
    showSuccessPasswordModal.value = true
  } catch (err) {
    resetError.value = extractError(err)
  } finally {
    submitting.value = false
  }
}

// ── Delete ──
function confirmDelete(user) {
  if (user.username === 'admin') return
  deleteTarget.value = user
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
}

async function submitDelete() {
  submitting.value = true
  try {
    await usersService.remove(deleteTarget.value.id)
    showToast(`User ${deleteTarget.value.name} berhasil dihapus`)
    closeDeleteModal()
    await fetchUsers()
  } catch (err) {
    showToast(extractError(err), 'error')
    closeDeleteModal()
  } finally {
    submitting.value = false
  }
}

// ── Lifecycle ──
onMounted(() => {
  fetchUsers()
})
</script>

<style scoped>
.btn-primary {
  background: linear-gradient(135deg, #4A8BDF 0%, #3A6ABF 100%);
  color: white;
}
.btn-primary:hover {
  background: linear-gradient(135deg, #3A6ABF 0%, #2D5AA0 100%);
}

.input-field {
  @apply w-full px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 border border-slate-100;
  @apply focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all;
}
.input-field:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.action-btn {
  @apply w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200;
}
.action-btn:disabled {
  @apply opacity-30 cursor-not-allowed hover:bg-transparent hover:text-slate-400;
}

.stat-card {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

/* ── Transitions ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-up-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.slide-up-leave-active { transition: all 0.2s ease; }
.slide-up-enter-from { opacity: 0; transform: translateY(16px); }
.slide-up-leave-to { opacity: 0; transform: translateY(8px); }
</style>
