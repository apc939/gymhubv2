import { todayISO } from './format.js'

/**
 * Returns the most recent date string (YYYY-MM-DD) among workouts and cardio sessions.
 * Returns null if the user has no recorded workout or cardio.
 */
export function getLatestActivityDate(u) {
  if (!u) return null
  const dates = []
  if (u.lastWorkout) dates.push(String(u.lastWorkout).slice(0, 10))
  if (u.lastCardio) dates.push(String(u.lastCardio).slice(0, 10))
  if (u.lastCardioDate) dates.push(String(u.lastCardioDate).slice(0, 10))
  if (dates.length === 0) return null
  dates.sort((a, b) => b.localeCompare(a))
  return dates[0]
}

/**
 * Computes difference in calendar days between a date and today (or reference date).
 * Uses UTC date calculations to prevent daylight saving time (DST) shifts from distorting day counts.
 */
export function getDaysSince(dateStr, todayIso = todayISO()) {
  if (!dateStr) return null
  const dStr = String(dateStr).slice(0, 10)
  const tStr = String(todayIso).slice(0, 10)
  const [y1, m1, day1] = dStr.split('-').map(Number)
  const [y2, m2, day2] = tStr.split('-').map(Number)
  if (!y1 || !m1 || !day1 || !y2 || !m2 || !day2) return null
  const targetUtc = Date.UTC(y1, m1 - 1, day1)
  const todayUtc = Date.UTC(y2, m2 - 1, day2)
  const diffMs = todayUtc - targetUtc
  return Math.max(0, Math.round(diffMs / (86400 * 1000)))
}

/**
 * Adherence status calculation:
 * - >= 5 days without ANY workout or cardio: "Inactivo" (Red, cls: 'bad')
 * - >= 3 days without ANY workout or cardio: "En Riesgo" (Yellow, cls: 'warn')
 * - Otherwise (< 3 days): "Al día" (Green, cls: 'ok')
 *
 * If no workout or cardio has ever been logged, calculates days since account creation.
 * If account creation is also absent or invalid, falls back to "Inactivo".
 */
export function calculateAdherence(u, todayIso = todayISO()) {
  if (!u) {
    return { status: 'inactive', label: 'Inactivo', color: 'red', cls: 'bad', days: null }
  }

  const latestDate = getLatestActivityDate(u)
  let days = null

  if (latestDate) {
    days = getDaysSince(latestDate, todayIso)
  } else if (u.created) {
    days = getDaysSince(u.created, todayIso)
  } else {
    return { status: 'inactive', label: 'Inactivo', color: 'red', cls: 'bad', days: null }
  }

  if (days == null || days >= 5) {
    return { status: 'inactive', label: 'Inactivo', color: 'red', cls: 'bad', days }
  }
  if (days >= 3) {
    return { status: 'warning', label: 'En Riesgo', color: 'yellow', cls: 'warn', days }
  }
  return { status: 'active', label: 'Al día', color: 'green', cls: 'ok', days }
}
