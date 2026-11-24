import { isNavigationFailure, NavigationFailureType } from 'vue-router'

const routeNames = new Set(['dashboard', 'weighbridge', 'gbb', 'gbj', 'gsp', 'qc', 'gate-out'])
const legacyPaths = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/weighbridge': 'weighbridge',
  '/gbb': 'gbb',
  '/gbb-process': 'gbb',
  '/gbj': 'gbj',
  '/gbj-process': 'gbj',
  '/gsp': 'gsp',
  '/gsp-process': 'gsp',
  '/qc': 'qc',
  '/qc-verification': 'qc',
  '/gate-out': 'gate-out',
}

export function resolveReminderLocation(item) {
  const id = item?.transactionId
  if (typeof id !== 'string' || !id.trim() || id !== id.trim()) return null
  const path = item.targetRoute || item.routePath
  const legacyName = Object.prototype.hasOwnProperty.call(legacyPaths, path) ? legacyPaths[path] : null
  const name = item.targetRouteName || legacyName
  if (!routeNames.has(name)) return null
  return { name, query: { transactionId: id } }
}

export function canAccessReminderRoute(user, meta) {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  if (meta.roles?.length && !meta.roles.includes(user.role)) return false
  if (!meta.warehouseCode) return true
  if (user.role === 'SECURITY') return true
  return ['WAREHOUSE', 'QC'].includes(user.role) &&
    Array.isArray(user.warehouseAccess) && user.warehouseAccess.includes(meta.warehouseCode)
}

export async function navigateToReminder({ item, router, user, markAsRead, onSuccess, warn }) {
  const location = resolveReminderLocation(item)
  if (!location) {
    warn('Tujuan notifikasi tidak valid. Silakan muat ulang daftar tugas.')
    return false
  }
  try {
    const resolved = router.resolve(location)
    if (resolved.name !== location.name || !canAccessReminderRoute(user, resolved.meta)) {
      warn('Tindak lanjut transaksi ini berada pada bagian lain atau akses Anda tidak tersedia.')
      return false
    }
    const failure = await router.push(location)
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return false
    const current = router.currentRoute.value
    if (current.name !== location.name || current.query.transactionId !== location.query.transactionId) {
      warn('Transaksi belum terbuka. Periksa akses atau sesi Anda.')
      return false
    }
    // Reading a notification is separate from the operational transaction workflow.
    await markAsRead(item.id)
    onSuccess()
    return true
  } catch {
    warn('Transaksi belum dapat dibuka. Silakan coba kembali.')
    return false
  }
}
