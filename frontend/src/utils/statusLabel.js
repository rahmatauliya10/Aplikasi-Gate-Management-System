// The shared database state records the preliminary QC checkpoint for every process.
// GBB/GSP perform initial sampling here; GBJ performs a vehicle inspection.
export const getStatusLabel = (status, processType) => {
  if (!status) return '-'
  const displayStatus =
    ['GBB', 'GSP'].includes(processType) && status.startsWith('QC_VEHICLE_')
      ? status.replace('QC_VEHICLE_', 'QC_SAMPLING_')
      : status
  return displayStatus.replace(/_/g, ' ')
}
