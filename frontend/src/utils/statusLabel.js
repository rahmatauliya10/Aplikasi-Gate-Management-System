// The shared database state records the preliminary QC checkpoint for every process.
// GBB/GSP perform initial sampling here; GBJ performs a vehicle inspection.
export const getStatusLabel = (status, processType) => {
  if (!status) return '-'

  // Explicit GSP/PA status labels — never show misleading "LULUS" for exempt products
  const EXPLICIT_LABELS = {
    PA_NOT_REQUIRED: 'TIDAK PERLU PA',
    QC_RETEST_REQUIRED: 'UJI ULANG DIPERLUKAN',
    WAITING_UTILITY_DISPOSITION: 'MENUNGGU DISPOSISI UTILITY',
  }
  if (EXPLICIT_LABELS[status]) return EXPLICIT_LABELS[status]

  const displayStatus =
    ['GBB', 'GSP'].includes(processType) && status.startsWith('QC_VEHICLE_')
      ? status.replace('QC_VEHICLE_', 'QC_SAMPLING_')
      : status
  return displayStatus.replace(/_/g, ' ')
}

export const getStatusBadgeClass = (status) => {
  if (!status) return 'bg-slate-100 text-slate-700 border-slate-300'
  if (status === 'PA_NOT_REQUIRED') {
    return 'bg-slate-100 text-slate-700 border border-slate-300 shadow-sm'
  }
  if (status === 'QC_RETEST_REQUIRED' || status === 'WAITING_UTILITY_DISPOSITION') {
    return 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
  }
  if (status.includes('PENDING')) {
    return 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm'
  } else if (status.includes('IN_PROGRESS') || status === 'REGISTERED') {
    return 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm'
  } else if (status.includes('PASSED') || status.includes('DONE') || status === 'COMPLETED') {
    return 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
  } else if (status.includes('REJECTED') || status === 'CANCELLED') {
    return 'bg-red-50 text-red-600 border border-red-200 shadow-sm'
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200 shadow-sm'
}
