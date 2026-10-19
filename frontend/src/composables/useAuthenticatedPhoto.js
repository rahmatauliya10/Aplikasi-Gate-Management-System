import { ref, watch, onUnmounted, isRef, getCurrentInstance } from 'vue'
import api from '../services/api'
import {
  getPhotoSessionEpoch,
  invalidatePhotoSession,
  onPhotoSessionInvalidated
} from '../services/photoSession'

// Global cache: cacheKey -> { blobUrl: string, refCount: number, fetchedAt: number }
const blobCache = new Map()
// Pending promises to deduplicate simultaneous requests for identical URLs
const inFlightRequests = new Map()

let removeSessionInvalidationListener = null

function getCurrentSessionEpoch() {
  return getPhotoSessionEpoch()
}

function ensureSessionInvalidationListener() {
  if (removeSessionInvalidationListener) return

  removeSessionInvalidationListener = onPhotoSessionInvalidated(() => {
    abortInFlightRequests()

    for (const [, entry] of blobCache.entries()) {
      try {
        window.URL.revokeObjectURL(entry.blobUrl)
      } catch (e) {}
    }

    blobCache.clear()
    inFlightRequests.clear()
  })
}

function createSessionChangedError() {
  return new Error('Sesi foto telah berubah; hasil permintaan lama dibatalkan.')
}

function abortInFlightRequests() {
  for (const entry of inFlightRequests.values()) {
    try {
      entry.controller?.abort()
    } catch (e) {}
  }
}

const MAX_UNREFERENCED_CACHE = 15
const MAX_TOTAL_CACHE = 30

/**
 * Normalizes input image URL and enforces strict same-origin security.
 * Prevents:
 * 1. Sending JWT Bearer tokens to external domains.
 * 2. Prefix collision between baseURL '/api' and pathname '/api/attachments/...'.
 */
export function normalizeAndValidatePhotoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return null
  }

  const trimmed = rawUrl.trim()

  // Native data URLs or blob URLs do not require network calls or auth
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return {
      fetchUrl: trimmed,
      cacheKey: trimmed,
      isDirect: true,
    }
  }

  // Parse origin and pathname
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'

  let target
  try {
    target = new URL(trimmed, currentOrigin)
  } catch (e) {
    throw new Error(`Format URL foto tidak valid: ${trimmed}`)
  }

  // STRICT SAME-ORIGIN SECURITY CHECK:
  // Never dispatch authenticated HTTP requests with Bearer tokens to external domains!
  if (target.origin !== currentOrigin) {
    console.warn(`[Security Guard] Blocked authenticated photo request to external origin: ${target.origin}`)
    throw new Error('Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.')
  }

  // Path normalization:
  // If Axios baseURL ends with '/api' (or is '/api'), and pathname starts with '/api/',
  // strip '/api' prefix so Axios does not request '/api/api/attachments/...'
  let normalizedPath = target.pathname + target.search
  if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.substring(4) // e.g. '/attachments/123/download'
  }

  return {
    fetchUrl: normalizedPath,
    cacheKey: target.pathname + target.search,
    isDirect: false,
  }
}

/**
 * Fetch image as authenticated blob and return an Object URL.
 * Deduplicates in-flight requests and caches Object URLs.
 */
export async function fetchAuthenticatedBlob(rawUrl) {
  ensureSessionInvalidationListener()

  const parsed = normalizeAndValidatePhotoUrl(rawUrl)
  if (!parsed) return null

  if (parsed.isDirect) {
    return parsed.fetchUrl
  }

  const cacheKey = parsed.cacheKey

  // Check cache
  if (blobCache.has(cacheKey)) {
    const entry = blobCache.get(cacheKey)
    entry.refCount++
    entry.fetchedAt = Date.now()
    return entry.blobUrl
  }

  const requestEpoch = getCurrentSessionEpoch()

  // In-flight deduplication: return existing promise if identical URL is currently downloading
  if (inFlightRequests.has(cacheKey)) {
    const pending = inFlightRequests.get(cacheKey)
    const blobUrl = await pending.promise
    if (requestEpoch !== getCurrentSessionEpoch()) throw createSessionChangedError()
    if (blobCache.has(cacheKey)) {
      blobCache.get(cacheKey).refCount++
    }
    return blobUrl
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const requestEntry = { controller, promise: null }
  const fetchPromise = (async () => {
    let objectUrl = null
    try {
      const response = await api.get(parsed.fetchUrl, {
        responseType: 'blob',
        timeout: 15000,
        ...(controller ? { signal: controller.signal } : {}),
      })

      if (requestEpoch !== getCurrentSessionEpoch()) throw createSessionChangedError()

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: response.headers?.['content-type'] || 'image/jpeg' })

      objectUrl = window.URL.createObjectURL(blob)
      if (requestEpoch !== getCurrentSessionEpoch()) {
        window.URL.revokeObjectURL(objectUrl)
        objectUrl = null
        throw createSessionChangedError()
      }

      blobCache.set(cacheKey, {
        blobUrl: objectUrl,
        refCount: 1,
        fetchedAt: Date.now(),
      })

      pruneCache()
      return objectUrl
    } finally {
      if (objectUrl && requestEpoch !== getCurrentSessionEpoch()) {
        try { window.URL.revokeObjectURL(objectUrl) } catch (e) {}
      }
      if (inFlightRequests.get(cacheKey) === requestEntry) {
        inFlightRequests.delete(cacheKey)
      }
    }
  })()
  requestEntry.promise = fetchPromise

  inFlightRequests.set(cacheKey, requestEntry)
  return fetchPromise
}

/**
 * Decrement refCount for an Object URL and prune if unreferenced.
 */
export function releaseAuthenticatedBlob(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return
  let cacheKey
  try {
    const parsed = normalizeAndValidatePhotoUrl(rawUrl)
    if (!parsed || parsed.isDirect) return
    cacheKey = parsed.cacheKey
  } catch {
    return
  }

  if (blobCache.has(cacheKey)) {
    const entry = blobCache.get(cacheKey)
    entry.refCount = Math.max(0, entry.refCount - 1)
    if (entry.refCount === 0) {
      pruneCache()
    }
  }
}

/**
 * Prune unreferenced Object URLs when cache limits are reached
 */
function pruneCache() {
  const unreferenced = []
  for (const [key, entry] of blobCache.entries()) {
    if (entry.refCount <= 0) {
      unreferenced.push({ key, entry })
    }
  }

  // If unreferenced exceeds threshold or total size exceeds MAX_TOTAL_CACHE, revoke oldest
  if (unreferenced.length > MAX_UNREFERENCED_CACHE || blobCache.size > MAX_TOTAL_CACHE) {
    unreferenced.sort((a, b) => a.entry.fetchedAt - b.entry.fetchedAt)
    const toRemoveCount = Math.max(
      unreferenced.length - MAX_UNREFERENCED_CACHE,
      blobCache.size - MAX_TOTAL_CACHE
    )
    for (let i = 0; i < toRemoveCount && i < unreferenced.length; i++) {
      const { key, entry } = unreferenced[i]
      try {
        window.URL.revokeObjectURL(entry.blobUrl)
      } catch (e) {}
      blobCache.delete(key)
    }
  }
}

/**
 * Revokes all cached Object URLs and clears memory.
 * Invoked on user logout and session expiration.
 */
export function clearAuthenticatedBlobCache() {
  invalidatePhotoSession()
  abortInFlightRequests()
  for (const [, entry] of blobCache.entries()) {
    try {
      window.URL.revokeObjectURL(entry.blobUrl)
    } catch (e) {}
  }
  blobCache.clear()
  inFlightRequests.clear()
}

/**
 * Vue 3 Composable to reactively load and clean up authenticated image URLs.
 * Immune to async race conditions during rapid photo switching.
 */
export function useAuthenticatedPhoto(src) {
  const resolvedUrl = ref(null)
  const isLoading = ref(false)
  const isError = ref(false)
  const errorMessage = ref(null)

  let activeRequestId = 0
  let currentLoadedSource = null

  const load = async (url) => {
    const thisRequestId = ++activeRequestId

    if (!url) {
      if (currentLoadedSource) {
        releaseAuthenticatedBlob(currentLoadedSource)
        currentLoadedSource = null
      }
      resolvedUrl.value = null
      isLoading.value = false
      isError.value = false
      errorMessage.value = null
      return
    }

    isLoading.value = true
    isError.value = false
    errorMessage.value = null

    try {
      const result = await fetchAuthenticatedBlob(url)

      // RACE CONDITION GUARD:
      // If a newer load() call was dispatched while fetching, discard this result
      if (thisRequestId !== activeRequestId) {
        releaseAuthenticatedBlob(url)
        return
      }

      if (currentLoadedSource && currentLoadedSource !== url) {
        releaseAuthenticatedBlob(currentLoadedSource)
      }
      currentLoadedSource = url
      resolvedUrl.value = result
    } catch (err) {
      if (thisRequestId !== activeRequestId) return
      isError.value = true
      errorMessage.value = err?.response?.data?.message || err?.message || 'Gagal memuat foto'
      resolvedUrl.value = null
    } finally {
      if (thisRequestId === activeRequestId) {
        isLoading.value = false
      }
    }
  }

  if (isRef(src)) {
    watch(src, (newVal) => {
      load(newVal)
    }, { immediate: true })
  } else {
    load(src)
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      activeRequestId++ // Invalidate any pending async callbacks
      if (currentLoadedSource) {
        releaseAuthenticatedBlob(currentLoadedSource)
        currentLoadedSource = null
      }
    })
  }

  return {
    resolvedUrl,
    isLoading,
    isError,
    errorMessage,
    reload: () => load(isRef(src) ? src.value : src),
  }
}
