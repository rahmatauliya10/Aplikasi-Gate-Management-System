<template>
  <div class="relative" ref="dropdownRef">
    <!-- Header Profile Trigger -->
    <div 
      @click="toggleDropdown" 
      class="flex items-center space-x-3 pl-6 border-l border-slate-100 group cursor-pointer relative hover:bg-slate-50 rounded-xl p-2 -my-2 transition-colors"
      :class="{ 'bg-slate-50': isOpen }"
    >
      <div class="flex flex-col text-right hidden sm:block">
        <p class="text-xs font-black text-slate-900 leading-none group-hover:text-[#4A8BDF] transition-colors">{{ user.name || 'Loading...' }}</p>
        <p class="text-[9px] font-black text-[#A0006D] uppercase tracking-widest mt-1.5 opacity-80 flex items-center justify-end gap-1">
          {{ user.role || 'System' }} • {{ user.site || 'GMS' }}
        </p>
      </div>
      <div class="relative">
        <div class="w-9 h-9 md:w-11 md:h-11 rounded-2xl flex items-center justify-center text-white text-xs md:text-sm font-black transition-all duration-500 shadow-lg overflow-hidden"
             :class="{ 'rotate-[360deg]': isOpen, 'group-hover:rotate-[360deg]': !isOpen }"
             style="background: linear-gradient(135deg, #4A8BDF, #A0006D);">
          <img v-if="user.avatarUrl" :src="user.avatarUrl" class="w-full h-full object-cover" />
          <span v-else>{{ user.avatarInitial || (user.name ? user.name.substring(0,2).toUpperCase() : '?') }}</span>
        </div>
        <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title="Online"></div>
      </div>
    </div>

    <!-- Dropdown Menu -->
    <transition name="dropdown-fade">
      <div v-if="isOpen" class="absolute top-full right-0 mt-3 w-72 md:w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[100] dropdown-shadow">
        
        <!-- User Info Header -->
        <div class="p-5 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm">
          <div class="flex items-center space-x-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black shadow-md overflow-hidden"
                 style="background: linear-gradient(135deg, #4A8BDF, #A0006D);">
              <img v-if="user.avatarUrl" :src="user.avatarUrl" class="w-full h-full object-cover" />
              <span v-else>{{ user.avatarInitial || '?' }}</span>
            </div>
            <div>
              <h4 class="text-[14px] font-black text-slate-900 leading-tight">{{ user.name }}</h4>
              <p class="text-[11px] font-bold text-slate-500 mt-0.5">{{ user.email }}</p>
            </div>
          </div>
        </div>

        <div class="py-2">
          <!-- Normal User Menu -->
          <button @click="openModal('profile')" class="menu-item group">
            <span class="material-icons menu-icon group-hover:text-[#4A8BDF]">person</span>
            <span class="menu-text">My Profile</span>
          </button>
          
          <button @click="openModal('settings')" class="menu-item group">
            <span class="material-icons menu-icon group-hover:text-[#4A8BDF]">settings</span>
            <span class="menu-text">Account Settings</span>
          </button>
          
          <button @click="openModal('help')" class="menu-item group">
            <span class="material-icons menu-icon group-hover:text-[#4A8BDF]">help_outline</span>
            <span class="menu-text">Help & Support</span>
          </button>


          
          <!-- Logout -->
          <button @click="openModal('logout')" class="menu-item group hover:bg-rose-50/50">
            <span class="material-icons text-[18px] text-rose-500 group-hover:text-rose-600 transition-colors">logout</span>
            <span class="text-[13px] font-bold text-rose-600">Logout</span>
          </button>
        </div>
      </div>
    </transition>

    <!-- Modal Backdrop -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="activeModal" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="closeModal">
          
          <!-- My Profile Modal -->
          <div v-if="activeModal === 'profile'" class="relative w-full max-w-xl mx-4 rounded-2xl shadow-xl bg-white animate-modal max-h-[90vh] flex flex-col">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 rounded-t-2xl">
              <h3 class="font-black text-slate-800 text-[16px]">My Profile</h3>
              <button @click="closeModal" class="text-slate-400 hover:text-rose-500 transition-colors">
                <span class="material-icons">close</span>
              </button>
            </div>
            <div class="p-6 space-y-4 overflow-y-auto">
              <div class="flex justify-center mb-6">
                <div class="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg border-4 border-white overflow-hidden"
                     style="background: linear-gradient(135deg, #4A8BDF, #A0006D);">
                  <img v-if="user.avatarUrl" :src="user.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ user.avatarInitial || '?' }}</span>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div class="profile-field col-span-2">
                  <label>Full Name</label>
                  <div>{{ user.name }}</div>
                </div>
                <div class="profile-field col-span-2">
                  <label>Email / Username</label>
                  <div>{{ user.email }}</div>
                </div>
                <div class="profile-field">
                  <label>Role</label>
                  <div class="text-[#A0006D]">{{ user.role }}</div>
                </div>
                <div class="profile-field">
                  <label>Department</label>
                  <div>{{ user.department }}</div>
                </div>
                <div class="profile-field">
                  <label>Site / Plant</label>
                  <div>{{ user.site }}</div>
                </div>
                <div class="profile-field">
                  <label>Area</label>
                  <div>{{ user.area }}</div>
                </div>
                <div class="profile-field">
                  <label>Phone Number</label>
                  <div>{{ user.phone }}</div>
                </div>
                <div class="profile-field">
                  <label>Status</label>
                  <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {{ user.status }}
                  </div>
                </div>
                <div class="profile-field col-span-2">
                  <label>Last Login</label>
                  <div class="text-slate-500">{{ user.lastLogin }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Account Settings Modal -->
          <div v-if="activeModal === 'settings'" class="relative w-full max-w-xl mx-4 rounded-2xl shadow-xl bg-white animate-modal max-h-[90vh] flex flex-col">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 rounded-t-2xl">
              <h3 class="font-black text-slate-800 text-[16px]">Account Settings</h3>
              <button @click="closeModal" class="text-slate-400 hover:text-rose-500 transition-colors">
                <span class="material-icons">close</span>
              </button>
            </div>
            <div class="p-6 overflow-y-auto">
              <form @submit.prevent="saveSettings" class="space-y-5">
                
                <div class="space-y-4">
                  <div>
                    <h4 class="text-[13px] font-black text-slate-800 border-b pb-2">Change Password</h4>
                    <p class="text-[11px] text-slate-500 mt-1 font-bold">Leave password fields empty if you do not want to change your password.</p>
                  </div>
                  <div>
                    <label class="form-label">Current Password <span v-if="isChangingPassword" class="text-rose-500">*</span></label>
                    <input type="password" v-model="settingsForm.currentPassword" class="form-input" :required="isChangingPassword" autocomplete="new-password" />
                  </div>
                  <div>
                    <label class="form-label">New Password <span v-if="isChangingPassword" class="text-rose-500">*</span></label>
                    <input type="password" v-model="settingsForm.newPassword" minlength="8" class="form-input" :required="isChangingPassword" placeholder="Minimum 8 characters" autocomplete="new-password" />
                  </div>
                  <div>
                    <label class="form-label">Confirm New Password <span v-if="isChangingPassword" class="text-rose-500">*</span></label>
                    <input type="password" v-model="settingsForm.confirmPassword" minlength="8" class="form-input" :required="isChangingPassword" autocomplete="new-password" />
                    <p v-if="passwordMismatch" class="text-xs text-rose-500 mt-1 font-bold">Passwords do not match.</p>
                  </div>
                </div>

                <div class="space-y-4 pt-4 border-t border-slate-100">
                  <h4 class="text-[13px] font-black text-slate-800 border-b pb-2">Update Phone Number</h4>
                  <div>
                    <label class="form-label">Phone Number <span class="text-rose-500">*</span></label>
                    <input type="text" v-model="settingsForm.phone" pattern="[0-9]{10,13}" class="form-input" required placeholder="10 - 13 digits (numbers only)" @input="settingsForm.phone = settingsForm.phone.replace(/[^0-9]/g, '')" />
                  </div>
                </div>

                <div class="space-y-4 pt-4 border-t border-slate-100">
                  <h4 class="text-[13px] font-black text-slate-800 border-b pb-2">Avatar Upload</h4>
                  <div>
                    <label class="form-label">Profile Picture (Optional)</label>
                    <input type="file" @change="handleAvatarUpload" accept="image/*" class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-[#E6F0FA] file:text-[#4A8BDF] hover:file:bg-[#d6e8fa] transition-colors cursor-pointer" />
                  </div>
                </div>

                <div class="pt-4 flex justify-end gap-3 shrink-0">
                  <button type="button" @click="closeModal" class="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                  <button type="submit" class="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#4A8BDF] hover:bg-[#3A6ABF] transition-colors shadow-lg shadow-blue-500/30">Save Changes</button>
                </div>
              </form>
            </div>
          </div>

          <!-- Help & Support Modal -->
          <div v-if="activeModal === 'help'" class="relative w-full max-w-xl mx-4 rounded-2xl shadow-xl bg-white animate-modal max-h-[90vh] flex flex-col">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 rounded-t-2xl">
              <h3 class="font-black text-slate-800 text-[16px]">Help & Support</h3>
              <button @click="closeModal" class="text-slate-400 hover:text-rose-500 transition-colors">
                <span class="material-icons">close</span>
              </button>
            </div>
            <div class="p-6 overflow-y-auto">
              
              <div class="grid grid-cols-2 gap-3 mb-6">
                <button @click="openUserGuide" class="p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 hover:border-[#4A8BDF] hover:bg-[#E6F0FA] transition-all group">
                  <span class="material-icons text-slate-400 group-hover:text-[#4A8BDF]">menu_book</span>
                  <span class="text-xs font-bold text-slate-600 group-hover:text-[#4A8BDF]">User Guide</span>
                </button>
                <button class="p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 hover:border-[#4A8BDF] hover:bg-[#E6F0FA] transition-all group">
                  <span class="material-icons text-slate-400 group-hover:text-[#4A8BDF]">forum</span>
                  <span class="text-xs font-bold text-slate-600 group-hover:text-[#4A8BDF]">FAQ</span>
                </button>
                <button class="p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 hover:border-[#4A8BDF] hover:bg-[#E6F0FA] transition-all group col-span-2">
                  <span class="material-icons text-slate-400 group-hover:text-[#4A8BDF]">support_agent</span>
                  <span class="text-xs font-bold text-slate-600 group-hover:text-[#4A8BDF]">Contact Administrator</span>
                </button>
              </div>

              <h4 class="text-[13px] font-black text-slate-800 border-b pb-2 mb-4">Report Issue</h4>
              <form @submit.prevent="submitIssue" class="space-y-4">
                <div>
                  <label class="form-label">Issue Type <span class="text-rose-500">*</span></label>
                  <select v-model="issueForm.type" class="form-input" required>
                    <option value="" disabled>Select issue type</option>
                    <option>Login Issue</option>
                    <option>Vehicle Data Issue</option>
                    <option>Gate In Issue</option>
                    <option>Warehouse Process Issue</option>
                    <option>QC Release Issue</option>
                    <option>Gate Out Issue</option>
                    <option>Dashboard Issue</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Description <span class="text-rose-500">*</span></label>
                  <textarea v-model="issueForm.description" rows="4" class="form-input resize-none" required placeholder="Describe the issue in detail..."></textarea>
                </div>
                <div>
                  <label class="form-label">Screenshot Upload (Optional)</label>
                  <input type="file" accept="image/*" class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-[#E6F0FA] file:text-[#4A8BDF] hover:file:bg-[#d6e8fa] transition-colors cursor-pointer" />
                </div>

                <div class="pt-2">
                  <button type="submit" class="w-full py-3 rounded-xl text-[13px] font-bold text-white bg-[#A0006D] hover:bg-[#800057] transition-colors shadow-lg shadow-pink-500/30 flex items-center justify-center gap-2">
                    <span class="material-icons text-[18px]">send</span> Submit Report
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Logout Confirmation Modal -->
          <div v-if="activeModal === 'logout'" class="relative w-full max-w-xl mx-4 rounded-2xl shadow-xl bg-white animate-modal max-h-[90vh] flex flex-col">
            <div class="p-6 text-center overflow-y-auto">
              <div class="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4 shadow-sm border border-rose-100">
                <span class="material-icons text-3xl">logout</span>
              </div>
              <h3 class="font-black text-slate-800 text-[18px] mb-2">Logout Confirmation</h3>
              <p class="text-[13px] font-bold text-slate-500 mb-8">Are you sure you want to logout from GMS?</p>
              
              <div class="flex gap-3">
                <button @click="closeModal" class="flex-1 py-3 rounded-xl text-[13px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button @click="confirmLogout" class="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30">Logout</button>
              </div>
            </div>
          </div>

        </div>
      </transition>
    </Teleport>
    <UserGuideModal :is-open="showUserGuideModal" @close="showUserGuideModal = false" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import UserGuideModal from './UserGuideModal.vue'


const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const dropdownRef = ref(null)
const isOpen = ref(false)
const activeModal = ref(null)
const showUserGuideModal = ref(false)

const openUserGuide = () => {
  closeModal()
  showUserGuideModal.value = true
}

// Fallback dummy data as requested if authStore doesn't have the full info
const defaultDummyUser = reactive({
  name: "System Admin",
  email: "admin@sja.co.id",
  role: "ADMIN",
  department: "Operational Excellence",
  site: "SJA 3",
  area: "Gate Security",
  phone: "081234567890",
  status: "Active",
  lastLogin: "16 May 2026, 08:15",
  avatarInitial: "AD",
  avatarUrl: null
})

const user = computed(() => {
  return authStore.user || defaultDummyUser
})

// --- Dropdown Logic ---
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    closeDropdown()
  }
}

const handleEscKey = (event) => {
  if (event.key === 'Escape') {
    closeDropdown()
    closeModal()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleEscKey)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleEscKey)
})

// --- Modal Logic ---
const openModal = (modalName) => {
  closeDropdown()
  activeModal.value = modalName
  if (modalName === 'settings') {
    settingsForm.value = { currentPassword: '', newPassword: '', confirmPassword: '', phone: user.value.phone || '' }
  } else if (modalName === 'help') {
    issueForm.value = { type: '', description: '' }
  }
}

const closeModal = () => {
  activeModal.value = null
}

// --- Settings Logic ---
const settingsForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  phone: ''
})
const passwordMismatch = computed(() => {
  return settingsForm.value.newPassword && settingsForm.value.confirmPassword && settingsForm.value.newPassword !== settingsForm.value.confirmPassword
})

const isChangingPassword = computed(() => {
  const current = settingsForm.value.currentPassword || ''
  const newPass = settingsForm.value.newPassword || ''
  const confirm = settingsForm.value.confirmPassword || ''
  return current.trim().length > 0 || newPass.trim().length > 0 || confirm.trim().length > 0
})

const selectedAvatarUrl = ref(null)

const handleAvatarUpload = (event) => {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      selectedAvatarUrl.value = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

const saveSettings = () => {
  if (passwordMismatch.value) return
  
  const updateData = { phone: settingsForm.value.phone }
  if (selectedAvatarUrl.value) {
    updateData.avatarUrl = selectedAvatarUrl.value
  }

  if (authStore.user) {
    authStore.updateProfile(updateData)
  } else {
    Object.assign(defaultDummyUser, updateData)
  }

  notificationStore.addNotification('Settings Updated', 'Your account settings have been saved successfully.', 'success')
  closeModal()
}

// --- Help & Support Logic ---
const issueForm = ref({
  type: '',
  description: ''
})

const submitIssue = () => {
  notificationStore.addNotification('Report Submitted', 'Issue has been submitted successfully.', 'success')
  closeModal()
}

// --- Logout Logic ---
const confirmLogout = async () => {
  closeModal()
  await authStore.logout()
  router.replace('/login')
}

</script>

<style scoped>
.dropdown-shadow {
  box-shadow: 0 10px 40px -10px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.05);
}

.menu-item {
  @apply w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors text-left;
}

.menu-icon {
  @apply text-[18px] text-slate-400 transition-colors;
}

.menu-text {
  @apply text-[13px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors;
}

/* Animations */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-modal {
  animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  0% { opacity: 0; transform: scale(0.95) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* Form Styles */
.profile-field {
  @apply bg-slate-50 p-3 rounded-xl border border-slate-100;
}
.profile-field label {
  @apply text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1;
}
.profile-field div {
  @apply text-[13px] font-bold text-slate-800;
}

.form-label {
  @apply block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1.5;
}
.form-input {
  @apply w-full h-11 px-4 rounded-xl text-[13px] font-bold text-slate-800 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#4A8BDF] focus:ring-4 focus:ring-[#4A8BDF]/10 outline-none transition-all;
}
</style>
