import { describe, expect, it } from 'vitest'
import { isDueForAlert } from '../../src/shared/overdue.ts'

const DAY = 24 * 60 * 60 * 1000
const last = { id: 10, at: 100 * DAY }
const timer = (targetMs: number | null, alertedForResetId: number | null = null) => ({
  targetMs,
  alertedForResetId,
})

describe('isDueForAlert', () => {
  it('is false with no target', () => {
    expect(isDueForAlert(timer(null), last, last.at + 999 * DAY)).toBe(false)
  })
  it('is false before the target passes, including exactly at it', () => {
    expect(isDueForAlert(timer(14 * DAY), last, last.at + 13 * DAY)).toBe(false)
    expect(isDueForAlert(timer(14 * DAY), last, last.at + 14 * DAY)).toBe(false)
  })
  it('is true just after the target passes', () => {
    expect(isDueForAlert(timer(14 * DAY), last, last.at + 14 * DAY + 1)).toBe(true)
  })
  it('is false when alerted_for_reset_id equals the last reset id', () => {
    expect(isDueForAlert(timer(14 * DAY, 10), last, last.at + 20 * DAY)).toBe(false)
  })
  it('is true again when the last reset id changes and the timer is still overdue', () => {
    const newLast = { id: 11, at: 100 * DAY }
    expect(isDueForAlert(timer(14 * DAY, 10), newLast, newLast.at + 20 * DAY)).toBe(true)
  })
})
