<template>
  <teleport to="body">
    <transition name="confirm-overlay">
      <div v-if="confirmState.show" class="fixed inset-0 z-[10001] flex items-center justify-center p-4"
        style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"
        @click.self="handleCancel">
        <transition name="confirm-panel" appear>
          <div v-if="confirmState.show" class="w-full max-w-md rounded-2xl overflow-hidden"
            style="background:white;box-shadow:0 25px 80px rgba(0,0,0,0.3),0 0 0 1px rgba(74,139,223,0.1);">

            <!-- Header icon -->
            <div class="pt-8 pb-2 flex justify-center">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center animate-scaleSpringIn"
                :style="headerIconStyle">
                <span class="material-icons text-white text-3xl">{{ headerIcon }}</span>
              </div>
            </div>

            <!-- Content -->
            <div class="px-8 pb-2 text-center">
              <h3 class="text-xl font-black text-slate-900 tracking-tight mt-4" style="letter-spacing:-0.02em">{{ confirmState.title }}</h3>
              <p class="text-sm text-slate-700 mt-3 leading-relaxed font-medium">{{ confirmState.message }}</p>
            </div>

            <!-- Actions -->
            <div class="px-8 pb-8 pt-6 flex space-x-3">
              <button @click="handleCancel"
                class="flex-1 py-3 rounded-xl font-black text-sm transition-all active:scale-95 hover:-translate-y-0.5"
                style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;">
                {{ confirmState.cancelText }}
              </button>
              <button @click="handleConfirm"
                class="flex-1 py-3 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:-translate-y-0.5 hover:shadow-lg"
                :style="confirmBtnStyle">
                {{ confirmState.confirmText }}
              </button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useConfirm } from '../composables/useConfirm'

const { confirmState, handleConfirm, handleCancel } = useConfirm()

const typeConfig = {
  warning: { icon: 'warning_amber', bg: 'linear-gradient(135deg,#A0006D,#800057)', shadow: 'rgba(160,0,109,0.4)', btn: 'linear-gradient(135deg,#A0006D,#800057)', btnShadow: '0 4px 14px rgba(160,0,109,0.4)' },
  danger:  { icon: 'error', bg: 'linear-gradient(135deg,#DC2626,#EF4444)', shadow: 'rgba(239,68,68,0.4)', btn: 'linear-gradient(135deg,#DC2626,#EF4444)', btnShadow: '0 4px 14px rgba(239,68,68,0.4)' },
  info:    { icon: 'info', bg: 'linear-gradient(135deg,#3A6ABF,#4A8BDF)', shadow: 'rgba(74,139,223,0.4)', btn: 'linear-gradient(135deg,#3A6ABF,#4A8BDF)', btnShadow: '0 4px 14px rgba(74,139,223,0.4)' },
  success: { icon: 'check_circle', bg: 'linear-gradient(135deg,#4A8BDF,#3A6ABF)', shadow: 'rgba(74,139,223,0.4)', btn: 'linear-gradient(135deg,#4A8BDF,#3A6ABF)', btnShadow: '0 4px 14px rgba(74,139,223,0.4)' },
}

const cfg = computed(() => typeConfig[confirmState.value.type] || typeConfig.warning)
const headerIcon = computed(() => cfg.value.icon)
const headerIconStyle = computed(() => `background:${cfg.value.bg};box-shadow:0 8px 24px ${cfg.value.shadow};`)
const confirmBtnStyle = computed(() => `background:${cfg.value.btn};box-shadow:${cfg.value.btnShadow};`)
</script>

<style scoped>
.confirm-overlay-enter-active { transition: opacity 0.3s ease-out; }
.confirm-overlay-leave-active { transition: opacity 0.2s ease-in; }
.confirm-overlay-enter-from, .confirm-overlay-leave-to { opacity: 0; }

.confirm-panel-enter-active {
  animation: confirmSpringUp 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.confirm-panel-leave-active {
  animation: confirmSlideDown 0.2s ease-in forwards;
}

@keyframes confirmSpringUp {
  0%   { opacity: 0; transform: translateY(40px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes confirmSlideDown {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(20px) scale(0.96); }
}
</style>
