let sessionEpoch = 0
const invalidationListeners = new Set()

export function getPhotoSessionEpoch() {
  return sessionEpoch
}

export function onPhotoSessionInvalidated(listener) {
  if (typeof listener !== 'function') return () => {}

  invalidationListeners.add(listener)
  return () => invalidationListeners.delete(listener)
}

export function invalidatePhotoSession() {
  sessionEpoch += 1

  for (const listener of [...invalidationListeners]) {
    try {
      listener()
    } catch (error) {
      // Cache cleanup must not prevent the caller from clearing auth state.
    }
  }

  return sessionEpoch
}
