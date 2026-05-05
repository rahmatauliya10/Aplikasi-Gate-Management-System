<template>
  <teleport to="body">
    <div class="fixed top-6 right-6 z-[10000] flex flex-col space-y-4 pointer-events-none" style="max-width:380px;width:100%">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id"
          class="pointer-events-auto rounded-2xl p-4 flex items-center space-x-4 relative overflow-hidden group transition-all duration-300"
          :style="toastStyle(t.type)"
        >
          <!-- Subtle Glow Background -->
          <div class="absolute inset-0 opacity-10 pointer-events-none" :style="bgGlow(t.type)"></div>

          <!-- Icon -->
          <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 relative z-10" :style="iconBg(t.type)">
            <span class="material-icons text-white text-[22px]">{{ toastIcon(t.type) }}</span>
          </div>
          
          <!-- Content -->
          <div class="flex-1 min-w-0 py-1 relative z-10">
            <h4 class="text-[9px] font-black uppercase tracking-[0.2em] mb-1" :style="titleColor(t.type)">{{ t.type }}</h4>
            <p class="text-[13px] font-bold leading-tight text-slate-800">{{ t.message }}</p>
          </div>
          
          <!-- Close -->
          <button @click="removeToast(t.id)" class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 relative z-10"
            :style="closeBtnStyle(t.type)">
            <span class="material-icons text-[18px]">close</span>
          </button>
          
          <!-- Progress bar -->
          <div class="absolute bottom-0 left-0 h-[4px] rounded-r-full toast-progress z-20" :style="progressStyle(t.type, t.duration)"></div>
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast'
const { toasts, removeToast } = useToast()

const palette = {
  success: { border: 'rgba(16,185,129,0.3)', title: '#059669', bgGlow: 'linear-gradient(90deg, rgba(16,185,129,1) 0%, transparent 100%)', iconBg: 'linear-gradient(135deg, #10B981, #047857); box-shadow: 0 4px 15px rgba(16,185,129,0.35)', progress: 'linear-gradient(90deg, #10B981, #34D399)', close: 'rgba(16,185,129,0.1)', closeText: '#059669' },
  error:   { border: 'rgba(239,68,68,0.3)', title: '#DC2626', bgGlow: 'linear-gradient(90deg, rgba(239,68,68,1) 0%, transparent 100%)', iconBg: 'linear-gradient(135deg, #EF4444, #B91C1C); box-shadow: 0 4px 15px rgba(239,68,68,0.35)', progress: 'linear-gradient(90deg, #EF4444, #F87171)', close: 'rgba(239,68,68,0.1)', closeText: '#DC2626' },
  warning: { border: 'rgba(245,158,11,0.3)', title: '#D97706', bgGlow: 'linear-gradient(90deg, rgba(245,158,11,1) 0%, transparent 100%)', iconBg: 'linear-gradient(135deg, #F59E0B, #B45309); box-shadow: 0 4px 15px rgba(245,158,11,0.35)', progress: 'linear-gradient(90deg, #F59E0B, #FBBF24)', close: 'rgba(245,158,11,0.1)', closeText: '#D97706' },
  info:    { border: 'rgba(74,139,223,0.3)', title: '#3A6ABF', bgGlow: 'linear-gradient(90deg, rgba(74,139,223,1) 0%, transparent 100%)', iconBg: 'linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 4px 15px rgba(74,139,223,0.35)', progress: 'linear-gradient(90deg, #4A8BDF, #60A5FA)', close: 'rgba(74,139,223,0.1)', closeText: '#3A6ABF' },
}

const p = (type) => palette[type] || palette.info
const toastStyle = (type) => `background:rgba(255,255,255,0.95);border:1px solid ${p(type).border};box-shadow:0 15px 35px -5px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.6) inset;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);`
const iconBg = (type) => `background:${p(type).iconBg};`
const bgGlow = (type) => `background:${p(type).bgGlow};`
const titleColor = (type) => `color:${p(type).title};`
const closeBtnStyle = (type) => `background:${p(type).close};color:${p(type).closeText};`
const progressStyle = (type, dur) => `background:${p(type).progress};animation:toastProgress ${dur}ms linear forwards;`
const toastIcon = (type) => ({ success: 'task_alt', error: 'error_outline', warning: 'warning_amber', info: 'info_outline' }[type] || 'info_outline')
</script>

<style scoped>
.toast-enter-active {
  animation: toastSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.toast-leave-active {
  animation: toastSlideOut 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards;
}
.toast-move {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes toastSlideIn {
  0%   { opacity: 0; transform: translateX(100px) scale(0.9); }
  60%  { opacity: 1; transform: translateX(-10px) scale(1.02); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes toastSlideOut {
  0%   { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 0; transform: translateX(120px) scale(0.8); }
}
@keyframes toastProgress {
  from { width: 100%; }
  to   { width: 0%; }
}
.toast-progress {
  width: 100%;
}
</style>
