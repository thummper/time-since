export interface GapEntry {
  id: number
  at: number
  note: string | null
}

/** One finished gap. It belongs to the reset that ends it (KTD4). */
export interface Gap {
  startAt: number
  endAt: number
  ms: number
  endId: number
  note: string | null
}

export interface CurrentRun {
  startAt: number
  ms: number
}

export interface Goal {
  kind: 'target' | 'average'
  ms: number
}

export interface GoalProgress {
  /** 0-100. */
  percent: number
  past: boolean
  /** Time left to the goal; negative once past it. */
  remainingMs: number
}

/** Gaps between neighbors in time order, oldest first; ties order by id, as in `lastReset`. */
export function finishedGaps(entries: readonly GapEntry[]): Gap[] {
  const sorted = [...entries].sort((a, b) => a.at - b.at || a.id - b.id)
  return sorted.slice(1).map((end, i) => {
    const start = sorted[i]!
    return {
      startAt: start.at,
      endAt: end.at,
      ms: end.at - start.at,
      endId: end.id,
      note: end.note,
    }
  })
}

/**
 * The unfinished run since the latest entry. `gaps` is `finishedGaps(entries)`; with no gaps
 * the log holds at most the origin entry.
 */
export function currentRun(
  gaps: readonly Gap[],
  entries: readonly GapEntry[],
  now: number,
): CurrentRun {
  const startAt = gaps.at(-1)?.endAt ?? entries[0]?.at ?? now
  return { startAt, ms: Math.max(0, now - startAt) }
}

/** R2: the target when set, otherwise the average gap. R3: no goal without either. */
export function resolveGoal(targetMs: number | null, averageGapMs: number | null): Goal | null {
  if (targetMs !== null) return targetMs > 0 ? { kind: 'target', ms: targetMs } : null
  if (averageGapMs !== null && averageGapMs > 0) return { kind: 'average', ms: averageGapMs }
  return null
}

/** "Past" is strictly greater, like `isPastTarget`. */
export function goalProgress(elapsedMs: number, goal: Goal): GoalProgress {
  return {
    percent: Math.min(100, Math.max(0, (elapsedMs / goal.ms) * 100)),
    past: elapsedMs > goal.ms,
    remainingMs: goal.ms - elapsedMs,
  }
}
