export interface LogEntry {
  id: number
  at: number
  isOrigin: boolean
}

export interface Stats {
  averageGapMs: number | null
  longestGapMs: number | null
  /** Resets in the log, not counting the creation entry. */
  resetCount: number
}

/** The entry with the latest `at`; the higher id wins a tie (KTD4). */
export function lastReset<T extends { id: number; at: number }>(entries: readonly T[]): T | null {
  let latest: T | null = null
  for (const entry of entries) {
    if (!latest || entry.at > latest.at || (entry.at === latest.at && entry.id > latest.id)) {
      latest = entry
    }
  }
  return latest
}

export function stats(entries: readonly LogEntry[]): Stats {
  const resetCount = entries.filter((e) => !e.isOrigin).length
  if (entries.length < 2) return { averageGapMs: null, longestGapMs: null, resetCount }

  const times = entries.map((e) => e.at).sort((a, b) => a - b)
  const gaps = times.slice(1).map((at, i) => at - times[i]!)
  return {
    averageGapMs: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
    longestGapMs: Math.max(...gaps),
    resetCount,
  }
}
