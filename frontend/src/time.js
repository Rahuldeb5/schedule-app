export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY = 24 * 60

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const toHHMM = (min) => {
  const m = ((min % DAY) + DAY) % DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function format12(hhmm, { short = false } = {}) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  if (short && m === 0) return `${h12} ${suffix}`
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Visible range in "axis minutes": an end at or before the start means the next day. */
export function axisRange({ day_start, day_end }) {
  const start = toMin(day_start)
  let end = toMin(day_end)
  if (end <= start) end += DAY
  return { start, end }
}

/**
 * Where a block sits on the axis. Times before the axis start (e.g. 00:30 when the
 * day starts at 7 AM) are treated as late night and drawn at the bottom of the column.
 */
export function blockSpan(block, axis) {
  let top = toMin(block.start)
  const duration = (toMin(block.end) - top + DAY) % DAY
  if (top < axis.start) top += DAY
  return { top, bottom: top + duration }
}

/** Current weekday (0 = Monday) and axis minute, mapping after-midnight times to the previous day. */
export function nowPosition(date, axis) {
  let day = (date.getDay() + 6) % 7
  let min = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  if (min < axis.start && min + DAY < axis.end) {
    day = (day + 6) % 7
    min += DAY
  }
  return { day, min }
}
