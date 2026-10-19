<template>
  <transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="isVisible"
      id="login-pending-reminder-modal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style="box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.3);"
      >
        <!-- Modal Top Accent Banner -->
        <div class="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white relative">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <span class="material-icons text-2xl">pending_actions</span>
            </div>
            <div>
              <div class="text-[10px] font-black uppercase tracking-widest text-indigo-300">Pengingat Operasional</div>
              <h3 class="text-base font-black text-white mt-0.5">
                Pekerjaan Memerlukan Tindakan
              </h3>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-6 space-y-4">
          <div>
            <p class="text-sm text-slate-700 font-medium">
              Halo <strong class="text-slate-900">{{ authStore.user?.name || 'Petugas' }}</strong>,
            </p>
            <p class="text-sm text-slate-800 font-semibold mt-1">
              Anda mempunyai <span class="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-black">{{ reminderStore.needActionCount }} transaksi</span> yang masih membutuhkan tindakan operasional Anda.
            </p>
          </div>

          <!-- Quick Summary Stat Cards -->
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="p-2.5 rounded-2xl bg-rose-50 border border-rose-100">
              <div class="text-[10px] uppercase tracking-wider text-rose-600 font-black">Perlu Tindakan</div>
              <div class="text-lg font-black text-rose-900 mt-0.5">{{ reminderStore.summary.needAction }}</div>
            </div>
            <div class="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-100">
              <div class="text-[10px] uppercase tracking-wider text-indigo-600 font-black">Sedang Berjalan</div>
              <div class="text-lg font-black text-indigo-900 mt-0.5">{{ reminderStore.summary.inProgress }}</div>
            </div>
            <div class="p-2.5 rounded-2xl bg-amber-50 border border-amber-100">
              <div class="text-[10px] uppercase tracking-wider text-amber-600 font-black">SLA Lewat</div>
              <div class="text-lg font-black text-amber-900 mt-0.5">{{ reminderStore.summary.overdue }}</div>
            </div>
          </div>

          <!-- Top Pending Items Preview -->
          <div class="space-y-2">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Prioritas Teratas</div>
            <div
              v-for="item in topNeedActionItems"
              :key="item.id"
              class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 text-xs"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  v-if="item.dailySequence"
                  class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-black shrink-0"
                >
                  {{ formatSeq(item.dailySequence) }}
                </span>
                <div class="truncate">
                  <div class="font-bold text-slate-900 truncate">{{ item.licensePlate }} · {{ item.pendingTask }}</div>
                  <div class="text-[10px] text-slate-400 font-mono">{{ item.transactionNumber }}</div>
                </div>
              </div>
              <span class="text-[10px] font-semibold text-slate-500 shrink-0">
                {{ item.durationMinutes }}m lalu
              </span>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            id="login-reminder-dismiss-btn"
            @click="handleDismiss"
            class="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
          >
            Nanti Saja
          </button>
          <button
            id="login-reminder-view-all-btn"
            @click="handleViewAll"
            class="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 hover:shadow-lg transition-all flex items-center gap-2"
          >
            <span>Lihat Semua Transaksi</span>
            <span class="material-icons text-sm">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useReminderStore } from '../stores/reminderStore'
import { useToast } from '../composables/useToast'
import { navigateToReminder } from '../services/reminderNavigation'
import { formatArrivalSequence } from '../utils/arrivalSequence'

const router = useRouter()
const authStore = useAuthStore()
const reminderStore = useReminderStore()

const isVisible = computed(() => {
  return (
    authStore.isAuthenticated &&
    reminderStore.needActionCount > 0 &&
    !reminderStore.isLoginModalDismissed
  )
})

const topNeedActionItems = computed(() => {
  return reminderStore.reminders
    .filter(r => r.category === 'NEED_ACTION' || r.isMyAction)
    .slice(0, 3)
})

const formatSeq = (seq) => formatArrivalSequence(seq)

const handleDismiss = () => {
  reminderStore.dismissLoginModal()
}

const toast = useToast()
const handleViewAll = () => navigateToReminder({
  item: topNeedActionItems.value[0],
  router,
  user: authStore.user,
  markAsRead: reminderStore.markAsRead,
  onSuccess: reminderStore.dismissLoginModal,
  warn: toast.warning,
})
</script>
