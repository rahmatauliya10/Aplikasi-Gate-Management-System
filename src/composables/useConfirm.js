import { ref } from 'vue'

const confirmState = ref({
  show: false,
  title: '',
  message: '',
  type: 'warning',
  confirmText: 'Konfirmasi',
  cancelText: 'Batal',
  resolve: null,
})

export const useConfirm = () => {
  const confirm = ({ title = 'Konfirmasi', message = '', type = 'warning', confirmText = 'Konfirmasi', cancelText = 'Batal' } = {}) => {
    return new Promise((resolve) => {
      confirmState.value = { show: true, title, message, type, confirmText, cancelText, resolve }
    })
  }

  const handleConfirm = () => {
    if (confirmState.value.resolve) confirmState.value.resolve(true)
    confirmState.value.show = false
  }

  const handleCancel = () => {
    if (confirmState.value.resolve) confirmState.value.resolve(false)
    confirmState.value.show = false
  }

  return { confirmState, confirm, handleConfirm, handleCancel }
}
