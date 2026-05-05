<template>
  <div class="flex items-center justify-between px-4 py-3 bg-white/50 backdrop-blur-sm border-t border-slate-100/50 mt-auto rounded-b-[2rem]">
    <div class="flex flex-1 justify-between sm:hidden">
      <button @click="previousPage" :disabled="currentPage === 1" class="relative inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
      <button @click="nextPage" :disabled="currentPage === totalPages || totalPages === 0" class="relative ml-3 inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
    </div>
    <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
      <div>
        <p class="text-xs text-slate-500 font-medium">
          Showing <span class="font-bold text-slate-700">{{ startIndex + 1 }}</span> to <span class="font-bold text-slate-700">{{ Math.min(endIndex, totalItems) }}</span> of <span class="font-bold text-slate-700">{{ totalItems }}</span> results
        </p>
      </div>
      <div>
        <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
          <button @click="previousPage" :disabled="currentPage === 1" class="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="sr-only">Previous</span>
            <span class="material-icons text-sm">chevron_left</span>
          </button>
          
          <button v-for="page in displayedPages" :key="page" @click="goToPage(page)"
            :class="[
              page === currentPage ? 'relative z-10 inline-flex items-center bg-[#4A8BDF] px-4 py-2 text-sm font-semibold text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A8BDF]' : 'relative inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus:z-20 focus:outline-offset-0',
              page === '...' ? 'disabled cursor-default hover:bg-white' : ''
            ]"
            :disabled="page === '...'"
          >
            {{ page }}
          </button>
          
          <button @click="nextPage" :disabled="currentPage === totalPages || totalPages === 0" class="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="sr-only">Next</span>
            <span class="material-icons text-sm">chevron_right</span>
          </button>
        </nav>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentPage: {
    type: Number,
    required: true
  },
  totalItems: {
    type: Number,
    required: true
  },
  itemsPerPage: {
    type: Number,
    default: 10
  }
})

const emit = defineEmits(['update:currentPage'])

const totalPages = computed(() => Math.ceil(props.totalItems / props.itemsPerPage))
const startIndex = computed(() => (props.currentPage - 1) * props.itemsPerPage)
const endIndex = computed(() => startIndex.value + props.itemsPerPage)

const displayedPages = computed(() => {
  const current = props.currentPage
  const total = totalPages.value
  
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  
  if (current <= 3) {
    return [1, 2, 3, 4, '...', total]
  }
  
  if (current >= total - 2) {
    return [1, '...', total - 3, total - 2, total - 1, total]
  }
  
  return [1, '...', current - 1, current, current + 1, '...', total]
})

const goToPage = (page) => {
  if (page !== '...') {
    emit('update:currentPage', page)
  }
}

const previousPage = () => {
  if (props.currentPage > 1) {
    emit('update:currentPage', props.currentPage - 1)
  }
}

const nextPage = () => {
  if (props.currentPage < totalPages.value) {
    emit('update:currentPage', props.currentPage + 1)
  }
}
</script>
