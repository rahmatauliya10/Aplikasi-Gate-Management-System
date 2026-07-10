<template>
  <div v-if="activeAnnouncements.length > 0" class="w-full flex flex-col relative z-40 overflow-hidden shrink-0">
    <div 
      v-for="announcement in activeAnnouncements" 
      :key="announcement.id"
      class="w-full flex items-center py-2 px-4 shadow-sm"
      :style="{ backgroundColor: announcement.backgroundColor || '#EF4444', color: announcement.textColor || '#FFFFFF' }"
    >
      <div class="flex-shrink-0 mr-3 flex items-center font-bold uppercase tracking-wider text-xs md:text-sm bg-black/20 px-3 py-1 rounded-lg">
        <span class="material-icons text-sm mr-1.5" v-if="announcement.type === 'FRAUD_ALERT'">warning</span>
        <span class="material-icons text-sm mr-1.5" v-else-if="announcement.type === 'WARNING'">report_problem</span>
        <span class="material-icons text-sm mr-1.5" v-else-if="announcement.type === 'CRITICAL'">error</span>
        <span class="material-icons text-sm mr-1.5" v-else>info</span>
        {{ announcement.title }}
      </div>
      
      <div class="flex-1 overflow-hidden relative" style="height: 24px;">
        <div class="absolute whitespace-nowrap will-change-transform"
             :class="getAnimationClass(announcement.speed)"
        >
          <span class="text-sm font-medium tracking-wide">{{ announcement.message }}</span>
          <!-- Add a duplicate message with some spacing for seamless infinite scrolling feel -->
          <span class="text-sm font-medium tracking-wide ml-32" v-if="announcement.message.length < 150">{{ announcement.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import announcementService from '../services/announcementService'

const route = useRoute()
const allActiveAnnouncements = ref([])
let pollingInterval = null

const fetchAnnouncements = async () => {
  try {
    const res = await announcementService.getActiveAnnouncements()
    allActiveAnnouncements.value = res.data || []
  } catch (error) {
    console.error('Failed to fetch announcements:', error)
  }
}

const activeAnnouncements = computed(() => {
  // Filter based on location and date
  const now = new Date()
  
  return allActiveAnnouncements.value.filter(ann => {
    // Check dates
    if (ann.startDate && new Date(ann.startDate) > now) return false
    if (ann.endDate && new Date(ann.endDate) < now) return false
    
    // Check location
    if (ann.location === 'ALL_PAGES') return true
    
    // Check route based location
    const path = route.path.toLowerCase()
    
    switch(ann.location) {
      case 'DASHBOARD': return path.includes('/dashboard') || path === '/'
      case 'GATE': return path.includes('/gate')
      case 'WEIGHBRIDGE': return path.includes('/weighbridge') || path.includes('/timbang')
      case 'WAREHOUSE': return path.includes('/gudang') || path.includes('/gbb') || path.includes('/gbj') || path.includes('/gsp')
      case 'QC': return path.includes('/qc')
      default: return true
    }
  })
})

const getAnimationClass = (speed) => {
  switch(speed) {
    case 'SLOW': return 'animate-marquee-slow'
    case 'FAST': return 'animate-marquee-fast'
    case 'NORMAL':
    default: return 'animate-marquee'
  }
}

onMounted(() => {
  fetchAnnouncements()
  // Poll every 10 seconds to sync banner updates in real-time
  pollingInterval = setInterval(fetchAnnouncements, 10000)
})

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval)
})
</script>

<style>
@keyframes marquee {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}

@keyframes marquee-slow {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}

@keyframes marquee-fast {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}

.animate-marquee {
  animation: marquee 25s linear infinite;
}

.animate-marquee-slow {
  animation: marquee-slow 40s linear infinite;
}

.animate-marquee-fast {
  animation: marquee-fast 15s linear infinite;
}

/* Pause animation on hover */
.animate-marquee:hover, 
.animate-marquee-slow:hover, 
.animate-marquee-fast:hover {
  animation-play-state: paused;
}
</style>
