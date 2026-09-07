import { describe, it, expect } from 'vitest'
import { getLatestActivityDate, getDaysSince, calculateAdherence } from './adherence.js'

describe('adherence calculations', () => {
  const TODAY = '2026-09-07'

  describe('getLatestActivityDate', () => {
    it('returns null when no activities exist', () => {
      expect(getLatestActivityDate(null)).toBeNull()
      expect(getLatestActivityDate({})).toBeNull()
      expect(getLatestActivityDate({ lastWorkout: null, lastCardio: null })).toBeNull()
    })

    it('returns lastWorkout when only workout exists', () => {
      expect(getLatestActivityDate({ lastWorkout: '2026-09-05' })).toBe('2026-09-05')
    })

    it('returns lastCardio when only cardio exists', () => {
      expect(getLatestActivityDate({ lastCardio: '2026-09-06' })).toBe('2026-09-06')
      expect(getLatestActivityDate({ lastCardioDate: '2026-09-06' })).toBe('2026-09-06')
    })

    it('returns the most recent between workout and cardio', () => {
      expect(getLatestActivityDate({ lastWorkout: '2026-09-03', lastCardio: '2026-09-06' })).toBe('2026-09-06')
      expect(getLatestActivityDate({ lastWorkout: '2026-09-06', lastCardio: '2026-09-02' })).toBe('2026-09-06')
      expect(getLatestActivityDate({ lastWorkout: '2026-09-05', lastCardio: '2026-09-05' })).toBe('2026-09-05')
    })
  })

  describe('getDaysSince', () => {
    it('returns null for empty date', () => {
      expect(getDaysSince(null, TODAY)).toBeNull()
      expect(getDaysSince('', TODAY)).toBeNull()
    })

    it('calculates exact day differences', () => {
      expect(getDaysSince('2026-09-07', TODAY)).toBe(0)
      expect(getDaysSince('2026-09-06', TODAY)).toBe(1)
      expect(getDaysSince('2026-09-05', TODAY)).toBe(2)
      expect(getDaysSince('2026-09-04', TODAY)).toBe(3)
      expect(getDaysSince('2026-09-03', TODAY)).toBe(4)
      expect(getDaysSince('2026-09-02', TODAY)).toBe(5)
      expect(getDaysSince('2026-08-28', TODAY)).toBe(10)
    })

    it('does not return negative numbers for future dates', () => {
      expect(getDaysSince('2026-09-10', TODAY)).toBe(0)
    })
  })

  describe('calculateAdherence thresholds', () => {
    it('marks as "Al día" (Green) when activity is < 3 days ago', () => {
      // 0 days
      const r0 = calculateAdherence({ lastWorkout: '2026-09-07' }, TODAY)
      expect(r0.status).toBe('active')
      expect(r0.label).toBe('Al día')
      expect(r0.cls).toBe('ok')
      expect(r0.days).toBe(0)

      // 1 day (cardio)
      const r1 = calculateAdherence({ lastCardio: '2026-09-06' }, TODAY)
      expect(r1.status).toBe('active')
      expect(r1.label).toBe('Al día')
      expect(r1.cls).toBe('ok')
      expect(r1.days).toBe(1)

      // 2 days
      const r2 = calculateAdherence({ lastWorkout: '2026-09-05' }, TODAY)
      expect(r2.status).toBe('active')
      expect(r2.label).toBe('Al día')
      expect(r2.cls).toBe('ok')
      expect(r2.days).toBe(2)
    })

    it('marks as "En Riesgo" (Yellow) when activity is >= 3 and < 5 days ago', () => {
      // 3 days
      const r3 = calculateAdherence({ lastWorkout: '2026-09-04' }, TODAY)
      expect(r3.status).toBe('warning')
      expect(r3.label).toBe('En Riesgo')
      expect(r3.cls).toBe('warn')
      expect(r3.days).toBe(3)

      // 4 days (cardio)
      const r4 = calculateAdherence({ lastCardio: '2026-09-03' }, TODAY)
      expect(r4.status).toBe('warning')
      expect(r4.label).toBe('En Riesgo')
      expect(r4.cls).toBe('warn')
      expect(r4.days).toBe(4)
    })

    it('marks as "Inactivo" (Red) when activity is >= 5 days ago', () => {
      // 5 days
      const r5 = calculateAdherence({ lastWorkout: '2026-09-02' }, TODAY)
      expect(r5.status).toBe('inactive')
      expect(r5.label).toBe('Inactivo')
      expect(r5.cls).toBe('bad')
      expect(r5.days).toBe(5)

      // 10 days
      const r10 = calculateAdherence({ lastWorkout: '2026-08-28' }, TODAY)
      expect(r10.status).toBe('inactive')
      expect(r10.label).toBe('Inactivo')
      expect(r10.cls).toBe('bad')
      expect(r10.days).toBe(10)
    })

    it('considers ANY activity: old workout + recent cardio is "Al día"', () => {
      const u = { lastWorkout: '2026-08-20', lastCardio: '2026-09-06' }
      const res = calculateAdherence(u, TODAY)
      expect(res.label).toBe('Al día')
      expect(res.cls).toBe('ok')
      expect(res.days).toBe(1)
    })

    it('considers ANY activity: old cardio + recent workout is "Al día"', () => {
      const u = { lastWorkout: '2026-09-06', lastCardio: '2026-08-20' }
      const res = calculateAdherence(u, TODAY)
      expect(res.label).toBe('Al día')
      expect(res.cls).toBe('ok')
      expect(res.days).toBe(1)
    })

    it('evaluates newly registered users with no activity based on created date', () => {
      // Registered today: 0 days -> Al día
      expect(calculateAdherence({ created: '2026-09-07' }, TODAY).label).toBe('Al día')

      // Registered 3 days ago: 3 days -> En Riesgo
      expect(calculateAdherence({ created: '2026-09-04' }, TODAY).label).toBe('En Riesgo')

      // Registered 6 days ago: 6 days -> Inactivo
      expect(calculateAdherence({ created: '2026-09-01' }, TODAY).label).toBe('Inactivo')
    })

    it('handles empty / invalid user safely by returning Inactivo', () => {
      expect(calculateAdherence(null, TODAY).label).toBe('Inactivo')
      expect(calculateAdherence({}, TODAY).label).toBe('Inactivo')
      expect(calculateAdherence({ created: 'invalid-date' }, TODAY).label).toBe('Inactivo')
    })

    it('accurately computes calendar day differences across DST transition dates', () => {
      // European Spring Forward 2026: March 29
      expect(getDaysSince('2026-03-28', '2026-03-29')).toBe(1)
      expect(getDaysSince('2026-03-26', '2026-03-29')).toBe(3)
      expect(calculateAdherence({ lastWorkout: '2026-03-26' }, '2026-03-29').label).toBe('En Riesgo')
    })

    it('safely handles ISO datetime strings with time components', () => {
      expect(getDaysSince('2026-09-04T18:30:00.000Z', TODAY)).toBe(3)
      const res = calculateAdherence({ lastCardio: '2026-09-04T18:30:00.000Z' }, TODAY)
      expect(res.label).toBe('En Riesgo')
      expect(res.days).toBe(3)
    })
  })
})
