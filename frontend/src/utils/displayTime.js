// Operational timestamps are stored as absolute instants (ISO/UTC) and shown in plant time.
export const PLANT_TIME_ZONE = 'Asia/Jakarta'

const parseTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatPlantTime = (value, withSeconds = false) => {
  const date = parseTime(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23'
  }).format(date)
}

export const formatPlantDate = (value) => {
  const date = parseTime(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(date)
}

export const plantDateKey = (value) => {
  const date = parseTime(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLANT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

export const formatPlantDateTime = (value) => {
  const date = parseTime(value)
  return date ? `${formatPlantDate(date)} ${formatPlantTime(date)} WIB` : '-'
}

export const plantClockParts = (value = new Date()) => {
  const date = parseTime(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: PLANT_TIME_ZONE,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(part => ['hour', 'minute', 'second'].includes(part.type)).map(part => [part.type, part.value]))
}
