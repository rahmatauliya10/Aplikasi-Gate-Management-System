<template>
  <div>
    <!-- Backdrop with focus trap -->
    <transition name="fade">
      <div v-if="isOpen" class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" @click="handleOutsideClick"></div>
    </transition>

    <!-- Drawer Panel -->
    <transition name="slide-right">
      <div v-if="isOpen" 
           class="fixed top-0 right-0 h-full w-[400px] md:w-[600px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-100"
           tabindex="0"
           ref="drawerRef"
           @keydown.esc="handleEsc">
        
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 class="text-[16px] font-black text-slate-800 tracking-tight">{{ isAdmin ? 'Activity Log' : 'My Activity Log' }}</h2>
            <p class="text-[11px] font-bold text-slate-500 mt-1">{{ isAdmin ? 'Audit trail and system operations' : 'Your recent actions in the system' }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button @click="refreshLogs" class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#4A8BDF] hover:border-[#4A8BDF] transition-all" title="Refresh">
              <span class="material-icons text-[18px]" :class="{'animate-spin': store.loading}">refresh</span>
            </button>
            <button @click="closeDrawer" class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#A0006D] hover:bg-rose-50 transition-all" title="Close">
              <span class="material-icons text-[18px]">close</span>
            </button>
          </div>
        </div>

        <!-- Filters Section -->
        <div v-if="isAdmin" class="p-4 border-b border-slate-100 bg-white space-y-3">
          <div class="flex gap-2">
            <div class="relative flex-1">
              <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input v-model="localFilters.search" @input="filtersChanged = true" type="text" placeholder="Search user, action, module..." class="w-full pl-10 pr-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 outline-none transition-all">
            </div>
          </div>
          <div class="flex gap-2">
            <select v-model="localFilters.status" @change="filtersChanged = true" class="flex-1 px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 outline-none bg-white">
              <option value="">All Status</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="WARNING">WARNING</option>
            </select>
            <select v-model="localFilters.module" @change="filtersChanged = true" class="flex-1 px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 outline-none bg-white">
              <option value="">All Modules</option>
              <option value="AUTH">AUTH</option>
              <option value="GATE">GATE</option>
              <option value="WEIGHBRIDGE">WEIGHBRIDGE</option>
              <option value="QC">QC</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              <option value="SYSTEM">SYSTEM</option>
            </select>
          </div>
          <div class="flex gap-2 justify-end">
             <button v-if="filtersChanged" @click="applyFilters" class="px-4 py-1.5 bg-[#4A8BDF] text-white text-[12px] font-bold rounded-lg hover:bg-blue-600 transition-colors">Apply Filters</button>
             <button v-if="hasActiveFilters" @click="clearFilters" class="px-4 py-1.5 bg-slate-100 text-slate-600 text-[12px] font-bold rounded-lg hover:bg-slate-200 transition-colors">Clear</button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto bg-slate-50 p-4">
          <div v-if="store.loading && !store.logs.length" class="flex flex-col items-center justify-center h-full text-slate-400">
            <span class="material-icons animate-spin text-4xl mb-4">refresh</span>
            <p class="text-[13px] font-bold">Loading activity logs...</p>
          </div>

          <div v-else-if="store.error" class="flex flex-col items-center justify-center h-full text-rose-500">
            <span class="material-icons text-5xl mb-4 text-rose-300">error_outline</span>
            <p class="text-[14px] font-black">{{ store.error }}</p>
            <button @click="refreshLogs" class="mt-4 px-4 py-2 bg-rose-50 text-rose-600 font-bold rounded-xl border border-rose-200 hover:bg-rose-100 transition-colors text-[12px]">Try Again</button>
          </div>

          <div v-else-if="!store.logs.length" class="flex flex-col items-center justify-center h-full text-slate-400">
            <span class="material-icons text-5xl mb-4 text-slate-300">history_toggle_off</span>
            <p class="text-[14px] font-black">No activity logs found.</p>
            <p class="text-[12px] font-medium mt-1">Try adjusting your filters.</p>
          </div>

          <div v-else class="space-y-3">
            <div v-for="log in store.logs" :key="log.id" class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <!-- Accent bar based on status -->
              <div class="absolute left-0 top-0 bottom-0 w-1" :class="getStatusColor(log.status, 'bg')"></div>
              
              <div class="flex justify-between items-start mb-2 pl-2">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">{{ log.module }}</span>
                  <span class="text-[10px] font-black px-2 py-0.5 rounded uppercase" :class="getStatusColor(log.status, 'text-bg')">{{ log.status }}</span>
                </div>
                <span class="text-[10px] font-bold text-slate-400">{{ formatDate(log.createdAt) }}</span>
              </div>
              
              <div class="pl-2">
                <p class="text-[13px] font-black text-slate-800 mb-1">{{ log.action }}</p>
                <p class="text-[12px] font-medium text-slate-600 mb-3">{{ log.description || 'No additional details.' }}</p>
                
                <div v-if="isAdmin" class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50">
                  <div class="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <span class="material-icons text-[12px]">person</span>
                  </div>
                  <span class="text-[11px] font-bold text-slate-700">{{ log.userName || 'System' }}</span>
                  <span v-if="log.role" class="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 rounded uppercase">{{ log.role }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination Footer -->
        <div v-if="store.pagination.totalPages > 1" class="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center">
          <span class="text-[11px] font-bold text-slate-500">Page {{ store.pagination.page }} of {{ store.pagination.totalPages }}</span>
          <div class="flex gap-1">
            <button @click="changePage(store.pagination.page - 1)" :disabled="store.pagination.page <= 1" class="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"><span class="material-icons text-[18px]">chevron_left</span></button>
            <button @click="changePage(store.pagination.page + 1)" :disabled="store.pagination.page >= store.pagination.totalPages" class="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"><span class="material-icons text-[18px]">chevron_right</span></button>
          </div>
        </div>

      </div>
    </transition>

    <!-- Unsaved Changes Confirmation Modal -->
    <transition name="fade-scale">
      <div v-if="showConfirm" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showConfirm = false"></div>
        <div class="bg-white rounded-3xl p-6 shadow-2xl relative z-10 max-w-sm w-full mx-4 border border-slate-100">
          <div class="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4 border border-amber-100 mx-auto">
            <span class="material-icons text-2xl">warning_amber</span>
          </div>
          <h3 class="text-[16px] font-black text-center text-slate-800 mb-2">Unsaved Filters</h3>
          <p class="text-[13px] font-medium text-center text-slate-500 mb-6">You have unsaved changes to your filters. Do you want to close the Activity Log anyway?</p>
          <div class="flex gap-3">
            <button @click="showConfirm = false" class="flex-1 py-3 bg-white text-slate-700 font-bold text-[13px] rounded-xl border border-slate-200 hover:bg-slate-50 transition-all">Cancel</button>
            <button @click="forceCloseDrawer" class="flex-1 py-3 bg-rose-500 text-white font-bold text-[13px] rounded-xl shadow-lg shadow-rose-500/30 hover:bg-rose-600 transition-all">Yes, Close</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useActivityLogStore } from '../stores/activityLogStore';
import { useAuthStore } from '../stores/authStore';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:isOpen']);

const store = useActivityLogStore();
const authStore = useAuthStore();
const drawerRef = ref(null);

const isAdmin = computed(() => authStore.user?.role === 'ADMIN');

const localFilters = ref({
  search: '',
  module: '',
  status: ''
});
const filtersChanged = ref(false);
const showConfirm = ref(false);

const hasActiveFilters = computed(() => {
  return store.filters.search || store.filters.module || store.filters.status;
});

// Focus drawer on open to capture ESC key
watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    store.fetchLogs(1);
    localFilters.value = { ...store.filters };
    filtersChanged.value = false;
    await nextTick();
    if (drawerRef.value) drawerRef.value.focus();
  }
});

const applyFilters = () => {
  store.applyFilters(localFilters.value);
  filtersChanged.value = false;
};

const clearFilters = () => {
  store.clearFilters();
  localFilters.value = { search: '', module: '', status: '' };
  filtersChanged.value = false;
};

const refreshLogs = () => {
  store.fetchLogs(store.pagination.page);
};

const changePage = (page) => {
  if (page >= 1 && page <= store.pagination.totalPages) {
    store.fetchLogs(page);
  }
};

const attemptClose = () => {
  if (store.loading) return; // Prevent accidental close while loading
  if (filtersChanged.value) {
    showConfirm.value = true;
  } else {
    forceCloseDrawer();
  }
};

const handleOutsideClick = (e) => {
  attemptClose();
};

const handleEsc = () => {
  attemptClose();
};

const closeDrawer = () => {
  attemptClose();
};

const forceCloseDrawer = () => {
  showConfirm.value = false;
  filtersChanged.value = false;
  emit('update:isOpen', false);
};

const getStatusColor = (status, type) => {
  const map = {
    SUCCESS: { bg: 'bg-emerald-500', 'text-bg': 'bg-emerald-50 text-emerald-600' },
    FAILED: { bg: 'bg-rose-500', 'text-bg': 'bg-rose-50 text-rose-600' },
    WARNING: { bg: 'bg-amber-500', 'text-bg': 'bg-amber-50 text-amber-600' }
  };
  return map[status] ? map[status][type] : map.SUCCESS[type];
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }

.fade-scale-enter-active, .fade-scale-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.95); }
</style>
