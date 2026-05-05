import { ref } from 'vue'

const toasts = ref([])
let toastId = 0

const addToast = (message, type = 'info', duration = 3500) => {
  const id = ++toastId
  toasts.value.push({ id, message, type, duration })
  setTimeout(() => removeToast(id), duration)
  return id
}

const removeToast = (id) => {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx > -1) toasts.value.splice(idx, 1)
}

export const useToast = () => ({
  toasts,
  removeToast,
  success: (msg, dur) => addToast(msg, 'success', dur),
  error: (msg, dur) => addToast(msg, 'error', dur),
  warning: (msg, dur) => addToast(msg, 'warning', dur),
  info: (msg, dur) => addToast(msg, 'info', dur),
})
