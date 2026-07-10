<template>
  <transition name="curtain">
    <div v-if="isLoading" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style="background: linear-gradient(rgba(239,250,253,0.75), rgba(239,250,253,0.75)), url('/Latar_belakang.png') center/cover no-repeat, #EFFAFD;">

      <!-- Animated grid -->
      <div class="absolute inset-0 opacity-30" style="background-image: linear-gradient(rgba(74,139,223,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(74,139,223,0.15) 1px, transparent 1px); background-size: 50px 50px;"></div>

      <!-- Scan line effect -->
      <div class="scan-line"></div>

      <!-- Top progress bar -->
      <div class="absolute top-0 left-0 w-full h-[2px]" style="background: linear-gradient(90deg, transparent, #4A8BDF, #A0006D, transparent); opacity: 0.8;">
        <div class="h-full animate-loader-bar" style="background: linear-gradient(90deg, #4A8BDF, #A0006D);"></div>
      </div>

      <!-- Center content -->
      <div class="relative flex flex-col items-center animate-float z-10">
        <!-- Outer glow rings -->
        <div class="absolute w-48 h-48 rounded-full" style="background: radial-gradient(circle, rgba(74,139,223,0.12) 0%, transparent 70%); animation: glowPulse 2s ease-in-out infinite;"></div>
        <div class="absolute w-32 h-32 rounded-full" style="border: 1px solid rgba(74,139,223,0.2); animation: ringExpand 2s ease-out infinite;"></div>
        <div class="absolute w-56 h-56 rounded-full" style="border: 1px solid rgba(160,0,109,0.1); animation: ringExpand 2s ease-out infinite; animation-delay: 0.5s;"></div>

        <!-- Logo -->
        <div class="relative w-24 h-24 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, rgba(74,139,223,0.15), rgba(160,0,109,0.1)); border: 1px solid rgba(74,139,223,0.3); box-shadow: 0 0 40px rgba(74,139,223,0.3);">
          <img src="/favicon.png" alt="GMS" class="w-14 h-14 object-contain" style="filter: drop-shadow(0 0 8px rgba(74,139,223,0.6));" />
        </div>

        <!-- Brand text -->
        <div class="mt-6 text-center">
          <h2 class="text-3xl font-black text-[#4A8BDF] tracking-tighter" style="letter-spacing: -0.04em; text-shadow: 0 0 20px rgba(74,139,223,0.5);">GMS</h2>
          <p class="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-600 mt-2">Gate Management System</p>
        </div>

        <!-- Loading indicator -->
        <div class="mt-8 flex items-center space-x-2" style="animation-delay: 0.2s;">
          <div class="flex space-x-1">
            <span class="w-2 h-2 rounded-full animate-bounce-dot" style="background: #4A8BDF; animation-delay: 0ms;"></span>
            <span class="w-2 h-2 rounded-full animate-bounce-dot" style="background: #818CF8; animation-delay: 120ms;"></span>
            <span class="w-2 h-2 rounded-full animate-bounce-dot" style="background: #A0006D; animation-delay: 240ms;"></span>
          </div>
          <span class="text-[10px] font-bold text-slate-700 uppercase tracking-widest ml-2">Initializing</span>
        </div>
      </div>

      <!-- Bottom HUD bar -->
      <div class="absolute bottom-8 left-8 right-8 flex justify-between items-center">
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 rounded-full bg-[#66A2E1] animate-pulse"></div>
          <span class="text-[10px] font-mono text-slate-700">SYSTEM ONLINE</span>
        </div>
        <span class="text-[10px] font-mono text-slate-600">PT Santos Jaya Abadi</span>
        <div class="text-[10px] font-mono text-slate-700">v2.1.0</div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { isPageLoading } from '../router'
import { computed } from 'vue'
const isLoading = computed(() => isPageLoading.value)
</script>

<style scoped>
.curtain-enter-active { transition: transform 0.5s cubic-bezier(0.83, 0, 0.17, 1); }
.curtain-leave-active { transition: transform 0.65s cubic-bezier(0.76, 0, 0.24, 1); }
.curtain-enter-from  { transform: translateY(-100%); }
.curtain-enter-to    { transform: translateY(0%); }
.curtain-leave-from  { transform: translateY(0%); }
.curtain-leave-to    { transform: translateY(100%); }

.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(74,139,223,0.5), rgba(160,0,109,0.5), transparent);
  animation: scanMove 3s linear infinite;
  z-index: 1;
}

@keyframes scanMove {
  0%   { top: -2px; }
  100% { top: 100%; }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-8px); }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.15); }
}

@keyframes ringExpand {
  0%   { opacity: 0.8; transform: scale(0.8); }
  100% { opacity: 0;   transform: scale(1.4); }
}

.animate-loader-bar {
  animation: loadBar 1.5s ease-out infinite;
  width: 0%;
}

@keyframes loadBar {
  0%   { width: 0%; }
  60%  { width: 75%; }
  100% { width: 100%; }
}

.animate-bounce-dot {
  animation: bounceDot 1.2s infinite ease-in-out both;
}

@keyframes bounceDot {
  0%, 80%, 100% { transform: scale(0); opacity: 0; }
  40%           { transform: scale(1); opacity: 1; }
}
</style>
