import { DAY_MS } from './limits.ts'
import { isPastTarget } from './overdue.ts'
import { CADENCES, type Cadence, type Placement, type SectionView } from './types.ts'

/** A list section: overdue, a cadence, or a custom section by id. */
export type SectionKey = 'overdue' | Cadence | `custom:${number}`

export { CADENCES }

export const isCadence = (value: unknown): value is Cadence => CADENCES.some((c) => c === value)

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly+',
  other: 'Other',
}

export const OVERDUE_LABEL = 'Overdue'

/** R2: up to 1 day is daily, up to 7 days weekly, longer monthly; no target is other. */
export function cadenceOf(targetMs: number | null): Cadence {
  if (targetMs === null) return 'other'
  if (targetMs <= DAY_MS) return 'daily'
  if (targetMs <= 7 * DAY_MS) return 'weekly'
  return 'monthly'
}

export interface GroupableTimer {
  id: number
  targetMs: number | null
  placement: Placement
  lastReset: { at: number }
}

export interface SectionGroup<T> {
  key: SectionKey
  name: string
  /** R8: every section but Overdue can collapse. */
  collapsible: boolean
  timers: T[]
}

const customKey = (id: number): SectionKey => `custom:${id}`

/** The home section, ignoring overdue. An unknown custom section falls back to the target. */
function homeKey(timer: GroupableTimer, sectionIds: ReadonlySet<number>): SectionKey {
  const { placement } = timer
  if (placement.kind === 'custom' && sectionIds.has(placement.sectionId)) {
    return customKey(placement.sectionId)
  }
  if (placement.kind === 'cadence') return placement.cadence
  return cadenceOf(timer.targetMs)
}

function idsOf(sections: readonly SectionView[]): Set<number> {
  return new Set(sections.map((s) => s.id))
}

function liveKey(timer: GroupableTimer, sectionIds: ReadonlySet<number>, now: number): SectionKey {
  if (isPastTarget(timer.targetMs, timer.lastReset.at, now)) return 'overdue'
  return homeKey(timer, sectionIds)
}

/** KTD1: the one rule for which section a timer shows in. */
export function sectionKeyOf(
  timer: GroupableTimer,
  sections: readonly SectionView[],
  now: number,
): SectionKey {
  return liveKey(timer, idsOf(sections), now)
}

/** Custom sections A to Z, ignoring case; the id breaks a tie. */
export function compareSections(a: SectionView, b: SectionView): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id
}

/**
 * Groups timers in R10 order and drops empty groups (R11). Timers keep their input order inside
 * a group. A frozen key (KTD8) wins over the live one unless it names a deleted section.
 */
export function groupTimers<T extends GroupableTimer>(
  timers: readonly T[],
  sections: readonly SectionView[],
  now: number,
  frozen?: ReadonlyMap<number, SectionKey>,
): SectionGroup<T>[] {
  const ids = idsOf(sections)
  const custom = [...sections].sort(compareSections)
  const groups: SectionGroup<T>[] = [
    { key: 'overdue', name: OVERDUE_LABEL, collapsible: false, timers: [] },
    ...(['daily', 'weekly', 'monthly'] as const).map((c) => group<T>(c, CADENCE_LABELS[c])),
    ...custom.map((s) => group<T>(customKey(s.id), s.name)),
    group<T>('other', CADENCE_LABELS.other),
  ]
  const byKey = new Map(groups.map((g) => [g.key, g]))
  for (const timer of timers) {
    const held = frozen?.get(timer.id)
    const key = held && byKey.has(held) ? held : liveKey(timer, ids, now)
    byKey.get(key)!.timers.push(timer)
  }
  return groups.filter((g) => g.timers.length > 0)
}

function group<T>(key: SectionKey, name: string): SectionGroup<T> {
  return { key, name, collapsible: true, timers: [] }
}
