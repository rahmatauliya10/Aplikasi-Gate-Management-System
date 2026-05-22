<template>
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <!-- Gentle background pan overlay to give movement to the static image -->
    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[#4A8BDF]/5 to-transparent opacity-50 animate-pulse-slow"></div>

    <!-- Container for vector vehicles -->
    <div class="absolute inset-0 opacity-[0.15] mix-blend-color-burn dark:mix-blend-screen">
      
      <!-- Ship moving right to left slowly -->
      <div class="absolute top-[20%] animate-ship-move">
        <svg width="240" height="80" viewBox="0 0 120 40" fill="currentColor" class="text-slate-900 drop-shadow-2xl">
          <path d="M10,30 L110,30 L115,20 L100,20 L95,10 L40,10 L35,20 L5,20 Z" />
          <rect x="50" y="5" width="10" height="15" />
          <rect x="65" y="5" width="15" height="15" />
          <rect x="85" y="5" width="5" height="15" />
          <path d="M50,5 L85,5" stroke="currentColor" stroke-width="1" />
        </svg>
      </div>

      <!-- Truck moving left to right -->
      <div class="absolute bottom-[15%] animate-truck-move">
        <svg width="160" height="80" viewBox="0 0 80 40" fill="currentColor" class="text-slate-900 drop-shadow-2xl">
          <path d="M5,15 L50,15 L50,30 L5,30 Z" />
          <path d="M52,20 L65,20 L70,25 L70,30 L52,30 Z" />
          <circle cx="15" cy="32" r="4" />
          <circle cx="35" cy="32" r="4" />
          <circle cx="60" cy="32" r="4" />
        </svg>
      </div>

      <!-- Forklift moving back and forth -->
      <div class="absolute bottom-[30%] animate-forklift-move">
        <svg width="120" height="80" viewBox="0 0 60 40" fill="currentColor" class="text-slate-900 drop-shadow-2xl">
          <path d="M10,18 L35,18 L35,30 L10,30 Z" />
          <path d="M15,8 L30,8 L30,18 L15,18 Z" />
          <rect x="37" y="12" width="3" height="18" />
          <path d="M40,26 L55,26 L55,29 L40,29 Z" />
          <circle cx="15" cy="32" r="3.5" />
          <circle cx="30" cy="32" r="3.5" />
          <path d="M20,12 L25,12 L25,18 L20,18 Z" fill="white" fill-opacity="0.5" />
        </svg>
      </div>

    </div>
  </div>
</template>

<style scoped>
@keyframes shipMove {
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-50vw); }
}

@keyframes truckMove {
  0% { transform: translateX(-50vw); }
  100% { transform: translateX(100vw); }
}

@keyframes forkliftMove {
  0% { transform: translateX(10vw); }
  45% { transform: translateX(40vw); }
  50% { transform: translateX(40vw) scaleX(-1); }
  95% { transform: translateX(10vw) scaleX(-1); }
  100% { transform: translateX(10vw) scaleX(1); }
}

@keyframes pulseSlow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.animate-ship-move {
  animation: shipMove 60s linear infinite;
}
.animate-truck-move {
  animation: truckMove 35s linear infinite;
}
.animate-forklift-move {
  animation: forkliftMove 25s ease-in-out infinite;
}
.animate-pulse-slow {
  animation: pulseSlow 8s ease-in-out infinite;
}
</style>
