import { ref, watch, onUnmounted, isRef } from 'vue'
import api from '../services/api'

// Global cache: url -> { blobUrl: string, refCount: number, fetchedAt: number }
const blobCache = new Map()
const MAX_CACHE_SIZE = 40

/**
 * Fetch image as authenticated blob and return an Object URL.
 * Handles data: and blob: URLs natively without network requests.
 * Uses Pinia JWT Bearer token via Axios interceptors.
 */
export async function fetchAuthenticatedBlob(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null
  }

  const trimmed = url.trim()

  // Native data URLs (e.g. freshly selected files via FileReader) or existing blob URLs
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  // Check in-memory cache
  if (blobCache.has(trimmed)) {
    const entry = blobCache.get(trimmed)
    entry.refCount++
    entry.fetchedAt = Date.now()
    return entry.blobUrl
  }

  // Fetch via Axios (automatically attaches JWT Bearer token and handles refresh)
  const response = await api.get(trimmed, {
    responseType: 'blob',
    timeout: 15000,
  })

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: response.headers?.['content-type'] || 'image/jpeg' })

  const objectUrl = window.URL.createObjectURL(blob)

  blobCache.set(trimmed, {
    blobUrl: objectUrl,
    refCount: 1,
    fetchedAt: Date.now(),
  })

  // Evict excess unreferenced entries to prevent memory accumulation
  pruneCache()

  return objectUrl
}

/**
 * Decrement refCount for an Object URL and revoke if no longer referenced.
 */
export function releaseAuthenticatedBlob(url) {
  if (!url || typeof url !== 'string') return
  const trimmed = url.trim()

  if (blobCache.has(trimmed)) {
    const entry = blobCache.get(trimmed)
    entry.refCount = Math.max(0, entry.refCount - 1)
  }
}

/**
 * Prune oldest unreferenced blobs when cache size exceeds threshold
 */
function pruneCache() {
  if (blobCache.size <= MAX_CACHE_SIZE) return

  const sortedEntries = Array.from(blobCache.entries())
    .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)

  for (const [key, entry] of sortedEntries) {
    if (entry.refCount <= 0) {
      try {
        window.URL.revokeObjectURL(entry.blobUrl)
      } catch (e) {
        // Ignore revocation failures
      }
      blobCache.delete(key)
      if (blobCache.size <= MAX_CACHE_SIZE) break
    }
  }
}

/**
 * Vue 3 Composable to reactively load and clean up authenticated image URLs.
 */
export function useAuthenticatedPhoto(src) {
  const resolvedUrl = ref(null)
  const isLoading = ref(false)
  const isError = ref(false)
  const errorMessage = ref(null)

  let lastActiveSource = null

  const load = async (url) => {
    if (!url) {
      if (lastActiveSource) {
        releaseAuthenticatedBlob(lastActiveSource)
        lastActiveSource = null
      }
      resolvedUrl.value = null
      isLoading.value = false
      isError.value = false
      errorMessage.value = null
      return
    }

    if (lastActiveSource && lastActiveSource !== url) {
      releaseAuthenticatedBlob(lastActiveSource)
    }

    lastActiveSource = url
    isLoading.value = true
    isError.value = false
    errorMessage.value = null

    try {
      const result = await fetchAuthenticatedBlob(url)
      resolvedUrl.value = result
    } catch (err) {
      isError.value = true
      errorMessage.value = err?.response?.data?.message || err?.message || 'Gagal memuat foto'
      resolvedUrl.value = null
    } finally {
      isLoading.value = false
    }
  }

  if (isRef(src)) {
    watch(src, (newVal) => {
      load(newVal)
    }, { immediate: true })
  } else {
    load(src)
  }

  onUnmounted(() => {
    if (lastActiveSource) {
      releaseAuthenticatedBlob(lastActiveSource)
      lastActiveSource = null
    }
  })

  return {
    resolvedUrl,
    isLoading,
    isError,
    errorMessage,
    reload: () => load(isRef(src) ? src.value : src),
  }
}
