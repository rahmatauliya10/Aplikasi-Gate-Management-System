<template>
  <div v-if="isLoading" :class="[wrapperClass, 'relative flex items-center justify-center bg-slate-100 rounded-lg overflow-hidden animate-pulse border border-slate-200']">
    <span class="material-icons text-slate-400 text-sm animate-spin">refresh</span>
  </div>

  <div v-else-if="isError" :class="[wrapperClass, 'relative flex flex-col items-center justify-center bg-slate-50 text-slate-400 rounded-lg p-1.5 text-center border border-slate-200 shadow-2xs']">
    <span class="material-icons text-rose-400 text-base">broken_image</span>
    <span class="text-[8px] font-bold text-slate-500 leading-tight mt-0.5">Foto Tidak Tersedia</span>
    <button type="button" @click.stop="reload" class="mt-1 text-[8px] text-blue-600 hover:underline font-bold flex items-center gap-0.5">
      <span class="material-icons text-[10px]">refresh</span>
      <span>Coba lagi</span>
    </button>
  </div>

  <img
    v-else-if="resolvedUrl"
    :src="resolvedUrl"
    :alt="alt"
    :class="imgClass"
    @click="$emit('click', resolvedUrl)"
  />
</template>

<script setup>
import { toRef } from 'vue'
import { useAuthenticatedPhoto } from '../composables/useAuthenticatedPhoto'

const props = defineProps({
  src: {
    type: String,
    default: null,
  },
  alt: {
    type: String,
    default: 'Foto Bukti',
  },
  imgClass: {
    type: String,
    default: '',
  },
  wrapperClass: {
    type: String,
    default: '',
  },
})

defineEmits(['click'])

const srcRef = toRef(props, 'src')
const { resolvedUrl, isLoading, isError, reload } = useAuthenticatedPhoto(srcRef)
</script>
