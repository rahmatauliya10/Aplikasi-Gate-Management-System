import { onMounted, onUnmounted } from 'vue'
import * as vueRouter from 'vue-router'

/**
 * Composable to prevent accidental navigation when form has unsaved modifications.
 *
 * @param {import('vue').Ref<boolean>} isDirtyRef - Ref tracking whether form has unsaved changes.
 * @param {string} customMessage - Confirmation prompt message.
 */
export function useUnsavedWarning(
  isDirtyRef,
  customMessage = 'Perubahan formulir belum disimpan. Apakah Anda yakin ingin meninggalkan halaman ini?'
) {
  // Warn on in-app Vue Router navigation if router hook is available
  try {
    if (typeof vueRouter?.onBeforeRouteLeave === 'function') {
      vueRouter.onBeforeRouteLeave((to, from, next) => {
        if (isDirtyRef.value) {
          const confirmLeave = window.confirm(customMessage)
          if (confirmLeave) {
            next()
          } else {
            next(false)
          }
        } else {
          next()
        }
      })
    }
    if (typeof vueRouter?.onBeforeRouteUpdate === 'function') {
      vueRouter.onBeforeRouteUpdate((to, from) => {
        if (to.query.transactionId !== from.query.transactionId && isDirtyRef.value) {
          return window.confirm(customMessage)
        }
        return true
      })
    }
  } catch (e) {
    // Gracefully handle partial vue-router mocks in unit test environments
  }

  // Warn on browser tab close / refresh
  const handleBeforeUnload = (e) => {
    if (isDirtyRef.value) {
      e.preventDefault()
      e.returnValue = customMessage
      return customMessage
    }
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
