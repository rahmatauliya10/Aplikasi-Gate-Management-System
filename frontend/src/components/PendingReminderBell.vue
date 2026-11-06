<template>
  <div class="relative" ref="bellContainer">
    <!-- Bell Trigger Button -->
    <button
      id="pending-reminder-bell-btn"
      @click="toggleDropdown"
      class="relative w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-500 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg transition-all duration-300 active:scale-90 group"
      :class="{ 'border-amber-200 bg-amber-50/30 text-amber-600': reminderStore.overdueCount > 0 }"
      title="Pengingat Tugas Tertunda"
    >
      <span class="material-icons text-2xl group-hover:rotate-12 transition-transform">
        {{ reminderStore.needActionCount > 0 ? 'notifications_active' : 'notifications_none' }}
      </span>

      <!-- Urgent / Overdue Ping indicator -->
      <span
        v-if="reminderStore.overdueCount > 0"
        class="absolute -top-1 -right-1 flex h-3 w-3"
      >
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
      </span>

      <!-- Need Action Badge -->
      <span
        v-if="reminderStore.needActionCount > 0"
        id="pending-reminder-badge"
        class="absolute top-2 right-2 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white border-2 border-white shadow-md animate-in fade-in"
      >
        {{ reminderStore.needActionCount > 99 ? '99+' : reminderStore.needActionCount }}
      </span>
    </button>

    <!-- Dropdown Panel -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform scale-95 opacity-0 translate-y-2"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 translate-y-2"
    >
      <div
        v-if="isOpen"
        id="pending-reminder-dropdown"
        class="absolute right-0 mt-3 w-96 sm:w-[440px] max-w-[calc(100vw-24px)] bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-50 flex flex-col max-h-[85vh]"
        style="box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.18);"
      >
        <!-- Panel Header -->
        <div class="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <span class="material-icons text-lg">alarm</span>
              </div>
              <div>
                <h4 class="text-xs font-black tracking-wider uppercase text-white">Tugas Tertunda</h4>
                <p class="text-[10px] text-slate-300 font-medium">Transaksi yang butuh tindakan operasional</p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                @click="refresh"
                :disabled="reminderStore.isLoading"
                class="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh Pengingat"
              >
                <span class="material-icons text-sm" :class="{ 'animate-spin': reminderStore.isLoading }">refresh</span>
              </button>
              <button
                v-if="reminderStore.needActionCount > 0"
                @click="reminderStore.markAllAsRead"
                class="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                Tandai Dibaca
              </button>
            </div>
          </div>

          <!-- Summary Pills -->
          <div class="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-white/10 text-center">
            <div class="p-1.5 rounded-xl bg-white/5 border border-white/5">
              <div class="text-[9px] uppercase tracking-wider text-rose-300 font-bold">Tindakan</div>
              <div class="text-sm font-black text-white mt-0.5">{{ reminderStore.summary.needAction }}</div>
            </div>
            <div class="p-1.5 rounded-xl bg-white/5 border border-white/5">
              <div class="text-[9px] uppercase tracking-wider text-amber-300 font-bold">Berjalan</div>
              <div class="text-sm font-black text-white mt-0.5">{{ reminderStore.summary.inProgress }}</div>
            </div>
            <div class="p-1.5 rounded-xl bg-white/5 border border-white/5">
              <div class="text-[9px] uppercase tracking-wider text-sky-300 font-bold">Menunggu</div>
              <div class="text-sm font-black text-white mt-0.5">{{ reminderStore.summary.waitingOther }}</div>
            </div>
            <div class="p-1.5 rounded-xl bg-white/5 border border-white/5">
              <div class="text-[9px] uppercase tracking-wider text-red-300 font-bold">SLA Lewat</div>
              <div class="text-sm font-black text-white mt-0.5">{{ reminderStore.summary.overdue }}</div>
            </div>
          </div>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center px-3 py-2 bg-slate-50/80 border-b border-slate-100 gap-1 overflow-x-auto text-[11px] font-bold shrink-0 hide-scrollbar">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            class="px-2.5 py-1 rounded-lg transition-all shrink-0 flex items-center gap-1.5"
            :class="activeTab === tab.key ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100' : 'text-slate-500 hover:text-slate-800'"
          >
            <span>{{ tab.label }}</span>
            <span
              v-if="tab.count > 0"
              class="px-1.5 py-0.2 rounded-full text-[9px] font-black"
              :class="activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- Reminder Cards List -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/40">
          <div v-if="filteredReminders.length === 0" class="py-10 text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-2.5">
              <span class="material-icons text-2xl">task_alt</span>
            </div>
            <p class="text-xs font-bold text-slate-700">Tidak ada tugas pada kategori ini</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Semua tahapan operasional berada dalam kendali.</p>
          </div>

          <div
            v-for="item in filteredReminders"
            :key="item.id"
            class="p-3 rounded-2xl border transition-all duration-200 bg-white shadow-xs hover:shadow-md relative overflow-hidden group"
            :class="[
              item.isOverdue
                ? 'border-red-200 hover:border-red-300'
                : item.category === 'NEED_ACTION'
                ? 'border-indigo-100 hover:border-indigo-300'
                : 'border-slate-100 hover:border-slate-200'
            ]"
          >
            <!-- Overdue indicator accent bar -->
            <div
              v-if="item.isOverdue"
              class="absolute top-0 left-0 bottom-0 w-1 bg-red-500"
            ></div>
            <div
              v-else-if="item.category === 'NEED_ACTION'"
              class="absolute top-0 left-0 bottom-0 w-1 bg-indigo-500"
            ></div>

            <div class="pl-2">
              <!-- Top Row: Arrival Seq Badge + Plate + Process Badge -->
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    v-if="item.dailySequence"
                    class="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[11px] font-black tracking-tight"
                    title="Nomor Urut Kedatangan"
                  >
                    {{ formatSeq(item.dailySequence) }}
                  </span>
                  <span class="text-xs font-black text-slate-900 tracking-tight">
                    {{ item.licensePlate }}
                  </span>
                  <span
                    class="px-1.5 py-0.2 text-[9px] font-black rounded uppercase tracking-wider"
                    :class="getProcessBadgeClass(item.processType)"
                  >
                    {{ item.processType }}
                  </span>
                </div>

                <!-- Overdue Pill -->
                <span
                  v-if="item.isOverdue"
                  class="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[9px] font-black tracking-wider uppercase flex items-center gap-1"
                >
                  <span class="material-icons text-[10px]">warning</span>
                  SLA Lewat ({{ item.durationMinutes }}m)
                </span>
                <span
                  v-else
                  class="text-[10px] font-semibold text-slate-400"
                >
                  {{ item.durationMinutes }}m
                  <span v-if="item.slaMinutes" class="text-slate-300">/ SLA: {{ item.slaMinutes }}m</span>
                </span>
              </div>

              <!-- Main Task Description -->
              <div class="mb-2">
                <h5 class="text-xs font-bold text-slate-800 leading-snug">
                  {{ item.pendingTask }}
                </h5>
                <p class="text-[10px] text-slate-400 font-mono mt-0.5">
                  {{ item.transactionNumber }} · Status: <span class="font-medium text-slate-600">{{ item.status }}</span>
                </p>
              </div>

              <!-- Bottom Row: PIC info + Action Button + Snooze -->
              <div class="flex items-center justify-between pt-2 border-t border-slate-50 gap-2">
                <div class="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <span>PIC: </span>
                  <span class="font-bold text-slate-600">{{ item.responsibleRole }}</span>
                  <span
                    v-if="reminderStore.isSnoozed(item.id)"
                    class="px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold"
                  >
                    Ditunda
                  </span>
                </div>

                <div class="flex items-center gap-1.5">
                  <button
                    v-if="reminderStore.isSnoozed(item.id)"
                    @click.stop="reminderStore.unsnoozeReminder(item.id)"
                    class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold transition-colors"
                  >
                    Batal Tunda
                  </button>
                  <button
                    v-else
                    @click.stop="reminderStore.snoozeReminder(item.id, 30)"
                    class="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-[10px] font-semibold transition-colors"
                    title="Tunda notifikasi ini selama 30 menit"
                  >
                    Tunda 30m
                  </button>

                  <button
                    @click="navigateToTransaction(item)"
                    class="px-3 py-1 rounded-xl text-[11px] font-bold text-white transition-all duration-200 flex items-center gap-1 shadow-xs active:scale-95"
                    :class="item.category === 'NEED_ACTION' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-700 hover:bg-slate-800'"
                  >
                    <span>Buka Transaksi</span>
                    <span class="material-icons text-xs">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Panel Footer -->
        <div class="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span class="font-medium">Total: {{ reminderStore.summary.total }} aktif</span>
          <button
            @click="isOpen = false"
            class="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-bold"
          >
            Tutup
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useReminderStore } from '../stores/reminderStore'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../composables/useToast'
import { navigateToReminder } from '../services/reminderNavigation'
import { formatArrivalSequence } from '../utils/arrivalSequence'

const router = useRouter()
const reminderStore = useReminderStore()
const isOpen = ref(false)
const activeTab = ref('NEED_ACTION')
const bellContainer = ref(null)

let pollTimer = null

const tabs = computed(() => [
  { key: 'NEED_ACTION', label: 'Tindakan', count: reminderStore.summary.needAction },
  { key: 'IN_PROGRESS', label: 'Berjalan', count: reminderStore.summary.inProgress },
  { key: 'WAITING_OTHER_PROCESS', label: 'Menunggu', count: reminderStore.summary.waitingOther },
  { key: 'OVERDUE', label: 'SLA Lewat', count: reminderStore.summary.overdue },
  { key: 'ALL', label: 'Semua', count: reminderStore.summary.total }
])

const filteredReminders = computed(() => {
  if (activeTab.value === 'ALL') {
    return reminderStore.reminders
  }
  if (activeTab.value === 'OVERDUE') {
    return reminderStore.reminders.filter(r => r.isOverdue || r.category === 'OVERDUE')
  }
  if (activeTab.value === 'NEED_ACTION') {
    return reminderStore.reminders.filter(r => r.category === 'NEED_ACTION' || r.isMyAction)
  }
  return reminderStore.reminders.filter(r => r.category === activeTab.value)
})

const formatSeq = (seq) => formatArrivalSequence(seq)

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    reminderStore.fetchReminders()
  }
}

const refresh = () => {
  reminderStore.fetchReminders()
}

const authStore = useAuthStore()
const toast = useToast()
const navigateToTransaction = (item) => navigateToReminder({
  item,
  router,
  user: authStore.user,
  markAsRead: reminderStore.markAsRead,
  onSuccess: () => { isOpen.value = false },
  warn: toast.warning,
})

const getProcessBadgeClass = (proc) => {
  switch (proc) {
    case 'GBB': return 'bg-emerald-100 text-emerald-800'
    case 'GBJ': return 'bg-blue-100 text-blue-800'
    case 'GSP': return 'bg-amber-100 text-amber-800'
    default: return 'bg-slate-100 text-slate-800'
  }
}

// Click outside handling
const handleClickOutside = (e) => {
  if (bellContainer.value && !bellContainer.value.contains(e.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  reminderStore.fetchReminders()
  // Refresh reminders every 60 seconds
  pollTimer = setInterval(() => {
    reminderStore.fetchReminders()
  }, 60000)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('click', handleClickOutside)
})
</script>
