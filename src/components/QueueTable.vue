<template>
  <div class="glass-card rounded-[2rem] overflow-hidden mt-6 animate-fadeInUp stagger-2">
    <div class="px-8 py-6 border-b border-white/40 flex justify-between items-center bg-white/20 backdrop-blur-md">
      <h3 class="text-xl font-bold text-hajster-card tracking-tight">{{ title }}</h3>
      <span class="bg-hajster-card text-[#4A8BDF] text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">{{ trucks.length }} Trucks</span>
    </div>
    
    <div class="overflow-x-auto p-4 pt-0 relative">
      <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: linear-gradient(#4A8BDF 1px, transparent 1px), linear-gradient(90deg, #4A8BDF 1px, transparent 1px); background-size: 30px 30px;"></div>
      <table class="min-w-full relative z-10">
        <thead>
          <tr>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Plate No</th>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Driver</th>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Vendor</th>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Type</th>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Status</th>
            <th scope="col" class="px-6 py-4 text-left text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Time In</th>
            <th scope="col" class="px-6 py-4 text-right text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100/60">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50/50">
          <tr v-for="(truck, index) in trucks" :key="truck.id" class="hover:bg-white/40 transition-all duration-300 group hover:scale-[1.01] hover:shadow-md relative z-0 hover:z-10 cursor-pointer table-row-hover animate-fadeInUp" :style="{ animationDelay: `${(index % 10) * 60}ms` }">
            <td class="px-6 py-5 whitespace-nowrap text-sm font-black text-hajster-card">{{ truck.plateNumber }}</td>
            <td class="px-6 py-5 whitespace-nowrap text-sm font-medium text-slate-800">{{ truck.driverName }}</td>
            <td class="px-6 py-5 whitespace-nowrap text-sm font-medium text-slate-600">{{ truck.vendor }}</td>
            <td class="px-6 py-5 whitespace-nowrap text-sm">
              <span :class="getTypeClass(truck.processType)" class="font-bold">{{ truck.processType }}</span>
            </td>
            <td class="px-6 py-5 whitespace-nowrap">
              <StatusBadge :status="truck.status" />
            </td>
            <td class="px-6 py-5 whitespace-nowrap text-sm font-bold text-slate-700">{{ formatTime(truck.timestamps.entry) }}</td>
            <td class="px-6 py-5 whitespace-nowrap text-right">
              <button @click="$emit('process', truck)" class="bg-hajster-card hover:bg-black text-[#4A8BDF] px-6 py-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 text-[10px] uppercase tracking-wider shadow-xl shadow-hajster-card/20 opacity-80 group-hover:opacity-100 active:scale-95">Process</button>
            </td>
          </tr>
          <tr v-if="trucks.length === 0">
            <td colspan="7" class="px-6 py-16 text-center text-slate-600 font-bold uppercase tracking-widest text-xs">
              <div class="animate-gentle-float"><span class="material-icons text-4xl text-slate-200 mb-2 block">local_shipping</span></div>
              No trucks in queue
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import StatusBadge from './StatusBadge.vue'

defineProps({
  title: {
    type: String,
    default: 'Queue'
  },
  trucks: {
    type: Array,
    default: () => []
  }
})

defineEmits(['process'])

const getTypeClass = (type) => {
  if (type === 'GBB') return 'text-orange-600 font-medium'
  if (type === 'GBJ') return 'text-indigo-600 font-medium'
  if (type === 'GSP') return 'text-[#3A6ABF] font-medium'
  return 'text-blue-600 font-medium'
}

const formatTime = (isoString) => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>
