<template>
  <teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" @click="close"></div>
    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn border border-slate-100">
      
      <!-- Header -->
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 class="text-lg font-black text-slate-900" id="modal-title">Configure Running Text</h3>
          <p class="text-xs text-slate-500 font-medium mt-1">Manage announcement banner and running text settings.</p>
        </div>
        <button @click="close" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors">
          <span class="material-icons text-xl">close</span>
        </button>
      </div>

      <!-- Live Preview -->
      <div class="bg-slate-100 px-6 py-4 border-b border-slate-200">
        <p class="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Live Preview</p>
        <div class="w-full rounded-lg overflow-hidden flex items-center py-2 px-4 shadow-sm" :style="{ backgroundColor: form.backgroundColor, color: form.textColor }">
          <div class="flex-shrink-0 mr-3 flex items-center font-bold uppercase tracking-wider text-xs bg-black/20 px-3 py-1 rounded-lg">
            <span class="material-icons text-sm mr-1.5" v-if="form.type === 'FRAUD_ALERT'">warning</span>
            <span class="material-icons text-sm mr-1.5" v-else-if="form.type === 'WARNING'">report_problem</span>
            <span class="material-icons text-sm mr-1.5" v-else-if="form.type === 'CRITICAL'">error</span>
            <span class="material-icons text-sm mr-1.5" v-else>info</span>
            {{ form.title || 'Banner Title' }}
          </div>
          <div class="flex-1 overflow-hidden whitespace-nowrap">
            <span class="text-sm font-medium tracking-wide" v-if="form.message">{{ form.message }}</span>
            <span class="text-sm font-medium tracking-wide opacity-50" v-else>Enter message text to see preview...</span>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="save" id="announcementForm" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Title -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Announcement Title <span class="text-red-500">*</span></label>
              <input v-model="form.title" type="text" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white" placeholder="e.g. Anti-Fraud Warning">
            </div>

            <!-- Type -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Type <span class="text-red-500">*</span></label>
              <select v-model="form.type" required @change="updateColorsBasedOnType" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="FRAUD_ALERT">Fraud Alert</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            
            <!-- Message -->
            <div class="space-y-2 md:col-span-2">
              <label class="block text-xs font-bold text-slate-700">Message Text <span class="text-red-500">*</span></label>
              <textarea v-model="form.message" required rows="3" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white" placeholder="Enter the announcement message..."></textarea>
            </div>

            <!-- Status -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Status <span class="text-red-500">*</span></label>
              <div class="flex items-center space-x-3 mt-1">
                <button type="button" @click="form.status = 'ACTIVE'" :class="form.status === 'ACTIVE' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'" class="flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center">
                  <span class="material-icons text-sm mr-1.5" v-if="form.status === 'ACTIVE'">check_circle</span>
                  Active
                </button>
                <button type="button" @click="form.status = 'INACTIVE'" :class="form.status === 'INACTIVE' ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'" class="flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center">
                  <span class="material-icons text-sm mr-1.5" v-if="form.status === 'INACTIVE'">cancel</span>
                  Inactive
                </button>
              </div>
            </div>

            <!-- Display Location -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Display Location <span class="text-red-500">*</span></label>
              <select v-model="form.location" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
                <option value="ALL_PAGES">All Pages</option>
                <option value="DASHBOARD">Dashboard Only</option>
                <option value="GATE">Gate Process Only</option>
                <option value="WEIGHBRIDGE">Weighbridge Process Only</option>
                <option value="WAREHOUSE">Warehouse Process Only</option>
                <option value="QC">QC Process Only</option>
              </select>
            </div>

            <!-- Speed & Priority -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Running Speed</label>
              <select v-model="form.speed" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
                <option value="SLOW">Slow</option>
                <option value="NORMAL">Normal</option>
                <option value="FAST">Fast</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Priority</label>
              <select v-model="form.priority" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <!-- Colors -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Background Color</label>
              <div class="flex items-center space-x-2">
                <input type="color" v-model="form.backgroundColor" class="h-10 w-10 rounded cursor-pointer border border-slate-200">
                <input type="text" v-model="form.backgroundColor" class="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm uppercase focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
              </div>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Text Color</label>
              <div class="flex items-center space-x-2">
                <input type="color" v-model="form.textColor" class="h-10 w-10 rounded cursor-pointer border border-slate-200">
                <input type="text" v-model="form.textColor" class="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm uppercase focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
              </div>
            </div>

            <!-- Dates -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">Start Date (Optional)</label>
              <input v-model="form.startDate" type="datetime-local" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">End Date (Optional)</label>
              <input v-model="form.endDate" type="datetime-local" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#4A8BDF]/20 focus:border-[#4A8BDF] transition-all bg-slate-50 focus:bg-white">
            </div>
          </div>
        </form>

        <!-- Current Announcements List -->
        <div class="mt-8 border-t border-slate-100 pt-6">
          <h4 class="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            Existing Announcements
            <button @click="resetForm" class="text-xs font-bold text-[#4A8BDF] hover:text-[#3A7BCF] bg-blue-50 px-3 py-1.5 rounded-lg flex items-center">
              <span class="material-icons text-sm mr-1">add</span> New
            </button>
          </h4>

          <div v-if="loadingList" class="py-4 text-center text-sm text-slate-500">Loading...</div>
          
          <div v-else-if="announcements.length === 0" class="py-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
            No announcements found.
          </div>

          <div v-else class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            <div v-for="ann in announcements" :key="ann.id" 
                 class="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border hover:border-blue-200 transition-colors"
                 :class="editingId === ann.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white'">
              <div class="flex-1 min-w-0 pr-4">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="text-xs font-bold text-white px-2 py-0.5 rounded-md" :class="getTypeColorClass(ann.type)">{{ ann.type }}</span>
                  <span class="text-sm font-bold text-slate-800 truncate">{{ ann.title }}</span>
                  <span v-if="ann.status === 'ACTIVE'" class="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Active</span>
                  <span v-else class="flex items-center text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">Inactive</span>
                </div>
                <p class="text-xs text-slate-500 truncate">{{ ann.message }}</p>
              </div>
              <div class="flex items-center space-x-2 mt-2 sm:mt-0 sm:shrink-0">
                <button @click="editAnnouncement(ann)" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                  <span class="material-icons text-sm">edit</span>
                </button>
                <button @click="deleteAnnouncement(ann.id)" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                  <span class="material-icons text-sm">delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-100 flex items-center justify-end space-x-3 bg-slate-50/50">
        <button type="button" @click="close" class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button type="submit" form="announcementForm" :disabled="loading" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#4A8BDF] hover:bg-[#3A7BCF] transition-colors shadow-sm shadow-[#4A8BDF]/20 flex items-center disabled:opacity-70">
          <span v-if="loading" class="material-icons animate-spin text-sm mr-2">refresh</span>
          {{ editingId ? 'Update' : 'Save' }}
        </button>
      </div>

    </div>
  </div>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import announcementService from '../services/announcementService'
import { useToast } from '../composables/useToast'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])
const toast = useToast()

const announcements = ref([])
const loadingList = ref(false)
const loading = ref(false)
const editingId = ref(null)

const defaultForm = {
  title: '',
  message: '',
  type: 'INFO',
  status: 'ACTIVE',
  location: 'ALL_PAGES',
  speed: 'NORMAL',
  priority: 'MEDIUM',
  backgroundColor: '#3B82F6',
  textColor: '#FFFFFF',
  startDate: '',
  endDate: ''
}

const form = ref({ ...defaultForm })

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    resetForm()
    fetchAnnouncements()
  }
})

const fetchAnnouncements = async () => {
  loadingList.value = true
  try {
    const res = await announcementService.getAllAnnouncements()
    announcements.value = res.data || []
  } catch (error) {
    toast.error('Failed to load announcements')
  } finally {
    loadingList.value = false
  }
}

const updateColorsBasedOnType = () => {
  switch (form.value.type) {
    case 'INFO':
      form.value.backgroundColor = '#3B82F6' // blue
      break
    case 'WARNING':
      form.value.backgroundColor = '#F59E0B' // amber
      break
    case 'FRAUD_ALERT':
    case 'CRITICAL':
      form.value.backgroundColor = '#EF4444' // red
      break
  }
}

const getTypeColorClass = (type) => {
  switch (type) {
    case 'INFO': return 'bg-blue-500'
    case 'WARNING': return 'bg-amber-500'
    case 'FRAUD_ALERT': return 'bg-red-600'
    case 'CRITICAL': return 'bg-rose-600'
    default: return 'bg-slate-500'
  }
}

const resetForm = () => {
  form.value = { ...defaultForm }
  editingId.value = null
}

const editAnnouncement = (ann) => {
  editingId.value = ann.id
  form.value = {
    ...ann,
    startDate: ann.startDate ? new Date(ann.startDate).toISOString().slice(0, 16) : '',
    endDate: ann.endDate ? new Date(ann.endDate).toISOString().slice(0, 16) : ''
  }
}

const save = async () => {
  if (!form.value.message || form.value.message.trim() === '') {
    toast.error('Message text cannot be empty')
    return
  }

  loading.value = true
  try {
    const payload = {
      title: form.value.title,
      message: form.value.message,
      type: form.value.type,
      status: form.value.status,
      location: form.value.location,
      speed: form.value.speed,
      priority: form.value.priority,
      backgroundColor: form.value.backgroundColor,
      textColor: form.value.textColor,
    }
    if (form.value.startDate) {
      payload.startDate = new Date(form.value.startDate).toISOString()
    }
    if (form.value.endDate) {
      payload.endDate = new Date(form.value.endDate).toISOString()
    }

    if (editingId.value) {
      await announcementService.updateAnnouncement(editingId.value, payload)
      toast.success('Announcement updated successfully')
    } else {
      await announcementService.createAnnouncement(payload)
      toast.success('Announcement created successfully')
    }
    await fetchAnnouncements()
    resetForm()
  } catch (error) {
    toast.error('Failed to save announcement')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const deleteAnnouncement = async (id) => {
  if (confirm('Are you sure you want to delete this announcement?')) {
    try {
      await announcementService.deleteAnnouncement(id)
      toast.success('Announcement deleted successfully')
      if (editingId.value === id) resetForm()
      await fetchAnnouncements()
    } catch (error) {
      toast.error('Failed to delete announcement')
    }
  }
}

const close = () => {
  emit('close')
}
</script>
