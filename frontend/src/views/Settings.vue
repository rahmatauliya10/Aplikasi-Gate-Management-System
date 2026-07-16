<template>
  <div class="space-y-8 pb-10">
    <!-- Hero Header -->
    <PageHeader title="System Settings" subtitle="Configuration Parameters" :showBadge="false" />

    <div class="max-w-5xl">

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <!-- Role & Access -->
        <div class="p-5 rounded-2xl animate-fadeInUp stagger-3 group hover:-translate-y-1 transition-all duration-300" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors" style="background:rgba(74,139,223,0.1);color:#4A8BDF">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">shield</span>
          </div>
          <h3 class="text-sm font-black text-slate-900 mb-1">Role & Access</h3>
          <p class="text-xs text-slate-500 font-medium mb-5 line-clamp-2">Manage user roles, permissions, and security policies across the application.</p>
          <button @click="$router.push('/users')" class="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 hover:bg-[#4A8BDF] hover:text-white transition-colors border border-slate-100 hover:border-transparent">
            Configure Access
          </button>
        </div>


        <!-- Master Data Setting -->
        <div class="p-5 rounded-2xl animate-fadeInUp stagger-5 group hover:-translate-y-1 transition-all duration-300" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors" style="background:rgba(16,185,129,0.1);color:#10B981">
            <span class="material-icons text-xl group-hover:scale-110 transition-transform">dataset</span>
          </div>
          <h3 class="text-sm font-black text-slate-900 mb-1">Master Data Setting</h3>
          <p class="text-xs text-slate-500 font-medium mb-5 line-clamp-2">Manage core operational data such as vehicle types, vendors, and materials.</p>
          <button @click="showMasterDataModal = true" class="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 hover:bg-emerald-500 hover:text-white transition-colors border border-slate-100 hover:border-transparent">
            Edit Master Data
          </button>
        </div>

        <!-- Target & Threshold Setting -->
        <div class="p-5 rounded-2xl animate-fadeInUp stagger-6 group hover:-translate-y-1 transition-all duration-300 flex flex-col h-full" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors" style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.2)">
            <span class="material-icons text-xl text-rose-500 group-hover:scale-110 transition-transform">tune</span>
          </div>
          <h3 class="text-sm font-black text-slate-900 mb-1">Target & Threshold Setting</h3>
          <p class="text-xs text-slate-500 font-medium mb-5 line-clamp-2">Manage operational targets, lead time limits, weight tolerance, and alert thresholds.</p>
          <div class="mt-auto">
            <button @click="isTargetModalOpen = true" class="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 hover:bg-rose-500 hover:text-white transition-colors border border-slate-100 hover:border-transparent">
              Configure Target
            </button>
          </div>
        </div>
        <!-- Running Text & Announcement Setting -->
        <div class="p-5 rounded-2xl animate-fadeInUp stagger-7 group hover:-translate-y-1 transition-all duration-300 flex flex-col h-full" style="background:white;border:1px solid #E8EEF7;box-shadow:0 2px 12px rgba(15,23,42,0.05)">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors" style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.05));border:1px solid rgba(245,158,11,0.2)">
            <span class="material-icons text-xl text-amber-500 group-hover:scale-110 transition-transform">campaign</span>
          </div>
          <h3 class="text-sm font-black text-slate-900 mb-1">Running Text & Announcement Setting</h3>
          <p class="text-xs text-slate-500 font-medium mb-5 line-clamp-2">Manage fraud warning, operational announcement, and system information banner.</p>
          <div class="mt-auto">
            <button @click="showAnnouncementModal = true" class="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 hover:bg-amber-500 hover:text-white transition-colors border border-slate-100 hover:border-transparent">
              Configure Announcement
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <TargetThresholdModal :isOpen="isTargetModalOpen" @close="isTargetModalOpen = false" />
    <MasterDataModal v-if="showMasterDataModal" @close="showMasterDataModal = false" />
    <AnnouncementModal :isOpen="showAnnouncementModal" @close="showAnnouncementModal = false" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import PageHeader from '../components/PageHeader.vue'
import TargetThresholdModal from '../components/TargetThresholdModal.vue'
import MasterDataModal from '../components/MasterDataModal.vue'
import AnnouncementModal from '../components/AnnouncementModal.vue'

const settingsStore = useSettingsStore()
const isTargetModalOpen = ref(false)
const showMasterDataModal = ref(false)
const showAnnouncementModal = ref(false)
</script>
