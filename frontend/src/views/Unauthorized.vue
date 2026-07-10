<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
    <div class="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mb-6 border-8 border-rose-100/50">
      <span class="material-icons text-4xl text-rose-500">gavel</span>
    </div>
    
    <h1 class="text-3xl font-black text-slate-800 mb-2 tracking-tight">403 - Access Denied</h1>
    <p class="text-slate-500 max-w-md mx-auto mb-8 font-medium">
      You do not have permission to access this page. Your current role access does not permit this operation.
    </p>

    <div v-if="authStore.user" class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-8 w-full max-w-xs mx-auto flex flex-col gap-1 text-left">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">Current Access</div>
      <div class="flex justify-between items-center">
        <span class="text-sm font-semibold text-slate-600">Role:</span>
        <span class="text-sm font-black text-slate-800">{{ authStore.user.role }}</span>
      </div>
      <div v-if="authStore.user.role === 'WAREHOUSE'" class="flex justify-between items-center mt-2">
        <span class="text-sm font-semibold text-slate-600">Area:</span>
        <div class="flex gap-1 flex-wrap justify-end">
          <span v-for="area in (authStore.user.warehouseAccess || [])" :key="area" class="text-[10px] font-bold bg-[#4A8BDF]/10 px-2 py-0.5 rounded text-[#4A8BDF]">
            {{ area }}
          </span>
          <span v-if="!(authStore.user.warehouseAccess || []).length" class="text-sm font-black text-slate-800">None</span>
        </div>
      </div>
    </div>
    
    <button @click="$router.push('/')" 
            class="px-6 py-3 bg-[#4A8BDF] text-white rounded-xl font-bold hover:bg-[#3A6ABF] transition-colors shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2">
      <span class="material-icons text-sm">arrow_back</span>
      Return to Dashboard
    </button>
  </div>
</template>

<script setup>
import { useAuthStore } from '../stores/authStore'
const authStore = useAuthStore()
</script>
