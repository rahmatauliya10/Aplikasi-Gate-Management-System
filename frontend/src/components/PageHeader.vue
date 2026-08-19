<template>
  <div class="flex flex-col md:flex-row justify-start md:justify-between items-start md:items-center p-5 sm:p-8 rounded-[2rem] relative overflow-hidden animate-fadeInUp mb-5 sm:mb-8 group gap-4 md:gap-0" 
    style="background:rgba(255,255,255,0.7); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.8); box-shadow:0 20px 50px rgba(15,23,42,0.08)">
    
    <!-- Dynamic Background Elements -->
    <div class="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#4A8BDF] opacity-5 blur-[80px] group-hover:opacity-10 transition-opacity duration-1000"></div>
    <div class="absolute -left-20 -bottom-20 w-64 h-64 rounded-full bg-[#A0006D] opacity-5 blur-[80px] group-hover:opacity-10 transition-opacity duration-1000"></div>
    
    <!-- Top Accent Line (Animated) -->
    <div class="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
      <div class="h-full w-full bg-gradient-to-r from-transparent via-[#4A8BDF] to-transparent opacity-60 animate-shimmer"></div>
    </div>

    <div class="relative z-10 w-full md:w-auto">
      <div class="flex items-center space-x-3 mb-1">
        <div class="w-1.5 h-5 sm:h-6 bg-gradient-to-b from-[#4A8BDF] to-[#A0006D] rounded-full"></div>
        <h1 class="text-2xl sm:text-4xl font-black text-slate-900 tracking-tighter" style="letter-spacing:-0.05em">{{ title }}</h1>
      </div>
      <p class="text-[10px] sm:text-xs font-black text-[#4A8BDF] uppercase tracking-[0.3em] ml-4 sm:ml-5">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.default" class="relative z-10 flex items-center space-x-2 sm:space-x-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, required: true }
})
</script>
