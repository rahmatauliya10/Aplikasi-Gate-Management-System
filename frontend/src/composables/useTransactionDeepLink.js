import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from './useToast'

export function useTransactionDeepLink({ fetchTrucks, trucks, selectedTruck, selectTruck, revealTruck, detailsTrucks, selectDetails }) {
  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  let generation = 0
  let mounted = false
  let pendingFetch = Promise.resolve()

  const openTransaction = async (clearSelection = false) => {
    const request = ++generation
    const id = route.query.transactionId
    if (clearSelection && id == null) selectedTruck.value = null
    try {
      // Serialize this page's loads: an older store request must not overwrite
      // the newer navigation's queue after selection has already completed.
      pendingFetch = pendingFetch.catch(() => {}).then(() => {
        if (mounted && request === generation) return fetchTrucks()
      })
      await pendingFetch
    } catch {
      if (request === generation && mounted && id != null) {
        if (String(selectedTruck.value?.id) !== id) selectedTruck.value = null
        toast.warning('Daftar transaksi belum dapat dimuat. Silakan coba kembali.')
      }
      return
    }
    if (request !== generation || !mounted || id == null) return
    const truck = typeof id === 'string' && id.trim()
      ? trucks.value.find(item => String(item.id) === id)
      : null
    if (!truck) {
      const detail = typeof id === 'string' && detailsTrucks?.value.find(item => String(item.id) === id)
      if (detail) {
        if (String(selectedTruck.value?.id) !== id) selectDetails(detail)
        return
      }
      selectedTruck.value = null
      toast.warning('Transaksi tidak tersedia pada antrean ini atau akses Anda tidak tersedia.')
      const query = { ...route.query }
      delete query.transactionId
      await router.replace({ path: route.path, query, hash: route.hash })
      return
    }
    if (String(selectedTruck.value?.id) !== id) selectTruck(truck)
    revealTruck?.(truck)
  }

  onMounted(() => {
    mounted = true
    openTransaction()
  })
  watch(() => route.query.transactionId, () => {
    if (mounted) openTransaction(true)
  })
  onUnmounted(() => {
    mounted = false
    generation++
  })
}
