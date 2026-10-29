import { describe, expect, it } from 'vitest'
import { gapSeries, goalProgress, resolveGoal } from '../../src/shared/gaps.ts'
import { stats } from '../../src/shared/stats.ts'

const DAY = 24 * 60 * 60 * 1000
const entry = (id: number, day: number, note: string | null = null, isOrigin = false) => ({
  id,
  at: day * DAY,
  note,
  isOrigin,
})

describe('gapSeries', () => {
  it('entries at days 1, 4, 9, 13 give gaps of 3, 5, 4 days, oldest first', () => {
    const series = gapSeries(
      [entry(1, 1, null, true), entry(2, 4), entry(3, 9), entry(4, 13)],
      14 * DAY,
    )
    expect(series.gaps.map((g) => g.ms)).toEqual([3 * DAY, 5 * DAY, 4 * DAY])
    expect(series.gaps[0]).toMatchObject({ startAt: 1 * DAY, endAt: 4 * DAY, endId: 2 })
  })

  it('takes each gap note from the entry that ends it, never from the origin', () => {
    const series = gapSeries(
      [entry(1, 1, 'created', true), entry(2, 4, 'work trip'), entry(3, 9)],
      10 * DAY,
    )
    expect(series.gaps.map((g) => g.note)).toEqual(['work trip', null])
  })

  it('places a backdated entry in time order, splitting the gap it falls in', () => {
    const series = gapSeries([entry(1, 1, null, true), entry(2, 10), entry(3, 4)], 12 * DAY)
    expect(series.gaps.map((g) => g.ms)).toEqual([3 * DAY, 6 * DAY])
    expect(series.current.startAt).toBe(10 * DAY)
  })

  it('orders entries with the same time by id and gives a zero-length gap', () => {
    const series = gapSeries([entry(1, 1, null, true), entry(3, 5, 'b'), entry(2, 5, 'a')], 6 * DAY)
    expect(series.gaps.map((g) => [g.endId, g.ms])).toEqual([
      [2, 4 * DAY],
      [3, 0],
    ])
  })

  it('only an origin entry gives no gaps and a current run from the origin', () => {
    const series = gapSeries([entry(1, 1, null, true)], 3 * DAY)
    expect(series.gaps).toEqual([])
    expect(series.current).toEqual({ startAt: 1 * DAY, ms: 2 * DAY })
  })

  it('the current run starts at the latest entry and runs until now', () => {
    const series = gapSeries([entry(1, 1, null, true), entry(2, 4)], 6.5 * DAY)
    expect(series.current).toEqual({ startAt: 4 * DAY, ms: 2.5 * DAY })
  })

  it('agrees with stats() on gap count and longest gap', () => {
    const entries = [entry(1, 1, null, true), entry(2, 8), entry(3, 15), entry(4, 12)]
    const series = gapSeries(entries, 20 * DAY)
    const result = stats(entries)
    expect(series.gaps).toHaveLength(result.resetCount)
    expect(Math.max(...series.gaps.map((g) => g.ms))).toBe(result.longestGapMs)
  })
})

describe('resolveGoal', () => {
  it('uses the target when one is set', () => {
    expect(resolveGoal(14 * DAY, 4 * DAY)).toEqual({ kind: 'target', ms: 14 * DAY })
  })

  it('falls back to the average gap without a target', () => {
    expect(resolveGoal(null, 4 * DAY)).toEqual({ kind: 'average', ms: 4 * DAY })
  })

  it('Covers AE4. no target and no average give no goal', () => {
    expect(resolveGoal(null, null)).toBeNull()
  })

  it('an average of 0 gives no goal, so progress never divides by zero', () => {
    expect(resolveGoal(null, 0)).toBeNull()
  })
})

describe('goalProgress', () => {
  it('Covers AE1. a 2-day run toward a 4-day average is 50 percent with 2 days left', () => {
    expect(goalProgress(2 * DAY, { kind: 'average', ms: 4 * DAY })).toEqual({
      percent: 50,
      past: false,
      remainingMs: 2 * DAY,
    })
  })

  it('Covers AE2. a 17-day run against a 14-day target is full and 3 days past', () => {
    expect(goalProgress(17 * DAY, { kind: 'target', ms: 14 * DAY })).toEqual({
      percent: 100,
      past: true,
      remainingMs: -3 * DAY,
    })
  })

  it('a run that equals the goal exactly is not past it', () => {
    expect(goalProgress(4 * DAY, { kind: 'average', ms: 4 * DAY }).past).toBe(false)
  })
})
