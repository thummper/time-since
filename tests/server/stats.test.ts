import { describe, expect, it } from 'vitest'
import { lastReset, stats } from '../../src/shared/stats.ts'

const DAY = 24 * 60 * 60 * 1000
const entry = (id: number, day: number, isOrigin = false) => ({ id, at: day * DAY, isOrigin })

describe('stats', () => {
  it('Covers AE1. entries at days 1, 8, 15 give average and longest gap of 7 days', () => {
    const result = stats([entry(1, 1, true), entry(2, 8), entry(3, 15)])
    expect(result.averageGapMs).toBe(7 * DAY)
    expect(result.longestGapMs).toBe(7 * DAY)
    expect(result.resetCount).toBe(2)
  })

  it('Covers AE2. a day-12 entry keeps last = day 15 and gives gaps 7, 4, 3', () => {
    const entries = [entry(1, 1, true), entry(2, 8), entry(3, 15), entry(4, 12)]
    expect(lastReset(entries)?.at).toBe(15 * DAY)
    const result = stats(entries)
    expect(result.longestGapMs).toBe(7 * DAY)
    expect(result.averageGapMs).toBeCloseTo((14 / 3) * DAY)
    expect(result.resetCount).toBe(3)
  })

  it('Covers AE7. only an origin entry gives null average, null longest, count 0', () => {
    expect(stats([entry(1, 1, true)])).toEqual({
      averageGapMs: null,
      longestGapMs: null,
      resetCount: 0,
    })
  })

  it('returns nulls for an empty log', () => {
    expect(stats([])).toEqual({ averageGapMs: null, longestGapMs: null, resetCount: 0 })
  })

  it('gives a gap of 0 for equal timestamps without error', () => {
    const result = stats([entry(1, 3, true), entry(2, 3)])
    expect(result.averageGapMs).toBe(0)
    expect(result.longestGapMs).toBe(0)
    expect(result.resetCount).toBe(1)
  })

  it('does not depend on input order', () => {
    const result = stats([entry(3, 15), entry(1, 1, true), entry(2, 8)])
    expect(result.averageGapMs).toBe(7 * DAY)
  })
})

describe('lastReset', () => {
  it('returns null for an empty log', () => {
    expect(lastReset([])).toBeNull()
  })

  it('breaks ties on equal at by the higher id', () => {
    expect(lastReset([entry(5, 4), entry(9, 4), entry(7, 4)])?.id).toBe(9)
  })
})
