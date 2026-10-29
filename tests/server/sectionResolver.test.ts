import { describe, expect, it } from 'vitest'
import { cadenceOf, groupTimers, sectionKeyOf, type SectionKey } from '../../src/shared/sections.ts'
import type { Placement, SectionView } from '../../src/shared/types.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = 1000 * DAY

const auto: Placement = { kind: 'auto' }

/** A timer last reset `ageDays` ago. */
function timer(id: number, targetMs: number | null, placement: Placement = auto, ageDays = 0.5) {
  return { id, targetMs, placement, lastReset: { id: id * 10, at: NOW - ageDays * DAY } }
}

const house: SectionView = { id: 7, name: 'House' }
const car: SectionView = { id: 8, name: 'car' }

describe('cadenceOf', () => {
  it('puts a target of exactly 1 day in daily and just over it in weekly', () => {
    expect(cadenceOf(DAY)).toBe('daily')
    expect(cadenceOf(DAY + HOUR)).toBe('weekly')
  })
  it('puts a target of exactly 7 days in weekly and 8 days in monthly', () => {
    expect(cadenceOf(7 * DAY)).toBe('weekly')
    expect(cadenceOf(8 * DAY)).toBe('monthly')
  })
  it('puts no target in other', () => {
    expect(cadenceOf(null)).toBe('other')
  })
})

describe('sectionKeyOf', () => {
  it('follows the target for an automatic timer (AE1)', () => {
    expect(sectionKeyOf(timer(1, 3 * DAY), [], NOW)).toBe('weekly')
    expect(sectionKeyOf(timer(1, DAY), [], NOW)).toBe('daily')
  })
  it('keeps a custom placement whatever the target (AE2)', () => {
    const t = timer(1, 3 * DAY, { kind: 'custom', sectionId: 7 })
    expect(sectionKeyOf(t, [house], NOW)).toBe('custom:7')
  })
  it('keeps a cadence override whatever the target', () => {
    const t = timer(1, 3 * DAY, { kind: 'cadence', cadence: 'monthly' })
    expect(sectionKeyOf(t, [], NOW)).toBe('monthly')
  })
  it('puts an overdue timer in overdue whatever its placement', () => {
    const t = timer(1, DAY, { kind: 'custom', sectionId: 7 }, 2)
    expect(sectionKeyOf(t, [house], NOW)).toBe('overdue')
  })
  it('falls back to the target when the custom section is unknown', () => {
    const t = timer(1, 3 * DAY, { kind: 'custom', sectionId: 99 })
    expect(sectionKeyOf(t, [house], NOW)).toBe('weekly')
  })
})

describe('groupTimers', () => {
  const keys = (groups: { key: SectionKey }[]) => groups.map((g) => g.key)

  it('orders groups Overdue, Daily, Weekly, Monthly+, custom A to Z, Other', () => {
    const groups = groupTimers(
      [
        timer(1, null),
        timer(2, 30 * DAY),
        timer(3, 3 * DAY),
        timer(4, DAY),
        timer(5, DAY, auto, 2),
        timer(6, null, { kind: 'custom', sectionId: 7 }),
        timer(7, null, { kind: 'custom', sectionId: 8 }),
      ],
      [house, car],
      NOW,
    )
    expect(keys(groups)).toEqual([
      'overdue',
      'daily',
      'weekly',
      'monthly',
      'custom:8',
      'custom:7',
      'other',
    ])
    expect(groups.map((g) => g.name)).toEqual([
      'Overdue',
      'Daily',
      'Weekly',
      'Monthly+',
      'car',
      'House',
      'Other',
    ])
  })
  it('leaves out empty groups (AE6)', () => {
    expect(keys(groupTimers([timer(1, DAY), timer(2, 3 * DAY)], [house], NOW))).toEqual([
      'daily',
      'weekly',
    ])
  })
  it('keeps the input order inside a group', () => {
    const groups = groupTimers([timer(3, DAY), timer(1, DAY), timer(2, DAY)], [], NOW)
    expect(groups[0]!.timers.map((t) => t.id)).toEqual([3, 1, 2])
  })
  it('marks only Overdue as not collapsible', () => {
    const groups = groupTimers([timer(1, DAY, auto, 2), timer(2, DAY)], [], NOW)
    expect(groups.map((g) => g.collapsible)).toEqual([false, true])
  })
  it('uses a frozen key over the live one', () => {
    const frozen = new Map<number, SectionKey>([[1, 'overdue']])
    expect(keys(groupTimers([timer(1, DAY)], [], NOW, frozen))).toEqual(['overdue'])
  })
  it('ignores a frozen key that names a deleted section', () => {
    const frozen = new Map<number, SectionKey>([[1, 'custom:99']])
    expect(keys(groupTimers([timer(1, DAY)], [], NOW, frozen))).toEqual(['daily'])
  })
})
