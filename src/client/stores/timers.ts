import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isPastTarget } from '../../shared/overdue.ts'
import { lastReset } from '../../shared/stats.ts'
import type { ResetView, TimerList, TimerView } from '../../shared/types.ts'
import { api, ApiError, errorMessage } from '../api/client.ts'
import { onAppFocus } from './focus.ts'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TimerChanges {
  name?: string
  targetMs?: number | null
}

export interface ResetInput {
  at?: number
  note?: string | null
}

/** Whether a timer is past its target at `now` (R12). The server flag goes stale as time passes. */
export function isOverdue(timer: TimerView, now: number): boolean {
  return isPastTarget(timer.targetMs, timer.lastReset.at, now)
}

/** A copy of `record` without `key`. */
function without<T>(record: Record<number, T>, key: number): Record<number, T> {
  const { [key]: _removed, ...rest } = record
  void _removed
  return rest
}

export const useTimersStore = defineStore('timers', () => {
  const timers = ref<TimerView[]>([])
  const status = ref<LoadStatus>('idle')
  const loadError = ref<string | null>(null)
  /** Inline error per timer id, for a failed reset. */
  const rowErrors = ref<Record<number, string>>({})
  /** Reset entries per timer id, newest first. Filled by the detail view. */
  const logs = ref<Record<number, ResetView[]>>({})

  /** Server clock minus client clock, from the last list response. */
  const offset = ref(0)
  /** The ticking clock in server time (epoch ms). */
  const now = ref(Date.now())

  /** Timers whose list position is held after a reset, with the number of open holds. */
  const holds = ref<Record<number, number>>({})
  const frozenOrder = ref<number[] | null>(null)

  let latestFetch = 0

  function tick(): void {
    now.value = Date.now() + offset.value
  }

  /** Starts the one-second ticker (R9). Returns a stop function. */
  function startTicker(): () => void {
    tick()
    const handle = setInterval(tick, 1000)
    return () => clearInterval(handle)
  }

  function compare(a: TimerView, b: TimerView): number {
    const overdueA = isOverdue(a, now.value)
    const overdueB = isOverdue(b, now.value)
    if (overdueA !== overdueB) return overdueA ? -1 : 1
    return a.lastReset.at - b.lastReset.at || a.id - b.id
  }

  /** Overdue timers first, then by elapsed time descending; held timers keep their place. */
  const sorted = computed(() => {
    const list = [...timers.value].sort(compare)
    const frozen = frozenOrder.value
    if (!frozen) return list
    const position = new Map(frozen.map((id, index) => [id, index]))
    return list.sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity))
  })

  function byId(id: number): TimerView | undefined {
    return timers.value.find((t) => t.id === id)
  }

  function isHeld(id: number): boolean {
    return (holds.value[id] ?? 0) > 0
  }

  function hold(id: number): void {
    if (!frozenOrder.value) frozenOrder.value = sorted.value.map((t) => t.id)
    holds.value = { ...holds.value, [id]: (holds.value[id] ?? 0) + 1 }
  }

  function releaseHold(id: number): void {
    const open = (holds.value[id] ?? 0) - 1
    const next = { ...holds.value }
    if (open > 0) next[id] = open
    else delete next[id]
    holds.value = next
    if (Object.keys(next).length === 0) frozenOrder.value = null
  }

  function releaseAllHolds(): void {
    holds.value = {}
    frozenOrder.value = null
  }

  function removeTimer(id: number): void {
    timers.value = timers.value.filter((t) => t.id !== id)
    logs.value = without(logs.value, id)
    rowErrors.value = without(rowErrors.value, id)
    if (frozenOrder.value) frozenOrder.value = frozenOrder.value.filter((x) => x !== id)
  }

  /** Runs `fn`; a 404 means the timer is gone (KTD13), so it leaves the store and `null` returns. */
  async function guard<T>(id: number, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        removeTimer(id)
        return null
      }
      throw error
    }
  }

  /** Forgets everything, for a change of user. */
  function clear(): void {
    latestFetch++
    timers.value = []
    status.value = 'idle'
    loadError.value = null
    rowErrors.value = {}
    logs.value = {}
    releaseAllHolds()
  }

  async function fetchTimers(options: { silent?: boolean } = {}): Promise<void> {
    const seq = ++latestFetch
    if (!options.silent && status.value !== 'ready') status.value = 'loading'
    try {
      const data = await api.get<TimerList>('/api/timers')
      // A newer request is in flight, so this answer may already be stale.
      if (seq !== latestFetch) return
      timers.value = data.timers
      offset.value = data.now - Date.now()
      tick()
      status.value = 'ready'
      loadError.value = null
    } catch (error) {
      if (seq !== latestFetch) return
      loadError.value = errorMessage(error)
      if (status.value !== 'ready') status.value = 'error'
    }
  }

  /** Refetches on focus and when the tab becomes visible (KTD13). Returns a stop function. */
  function watchFocus(): () => void {
    return onAppFocus(() => {
      releaseAllHolds()
      void fetchTimers({ silent: true })
    })
  }

  async function createTimer(name: string, targetMs: number | null): Promise<TimerView> {
    const timer = await api.post<TimerView>('/api/timers', { name, targetMs })
    timers.value = [...timers.value, timer]
    return timer
  }

  async function updateTimer(id: number, changes: TimerChanges): Promise<TimerView | null> {
    return guard(id, async () => {
      const timer = await api.patch<TimerView>(`/api/timers/${id}`, changes)
      timers.value = timers.value.map((t) => (t.id === id ? timer : t))
      return timer
    })
  }

  async function deleteTimer(id: number): Promise<void> {
    await guard(id, () => api.delete(`/api/timers/${id}`))
    removeTimer(id)
  }

  /** Mirrors the server's "last reset" rule (KTD4) until the next fetch. */
  function applyReset(id: number, reset: ResetView): void {
    timers.value = timers.value.map((t) => {
      if (t.id !== id) return t
      if (lastReset([t.lastReset, reset]) === t.lastReset) return t
      const next = { ...t, lastReset: { id: reset.id, at: reset.at } }
      return { ...next, overdue: isOverdue(next, now.value) }
    })
  }

  /** Logs a reset (now by default). Returns the entry, or null when it failed. */
  async function reset(id: number, input: ResetInput = {}): Promise<ResetView | null> {
    rowErrors.value = without(rowErrors.value, id)
    try {
      const done = await guard(id, () =>
        api.post<{ reset: ResetView }>(`/api/timers/${id}/resets`, input),
      )
      if (!done) return null
      hold(id)
      applyReset(id, done.reset)
      void fetchTimers({ silent: true })
      return done.reset
    } catch (error) {
      rowErrors.value = { ...rowErrors.value, [id]: errorMessage(error) }
      return null
    }
  }

  /** Removes a reset completely (R10). Returns false when it failed. */
  async function undoReset(timerId: number, resetId: number): Promise<boolean> {
    try {
      await guard(timerId, () => api.delete(`/api/timers/${timerId}/resets/${resetId}`))
    } catch {
      return false
    }
    await fetchTimers({ silent: true })
    return true
  }

  async function fetchLog(id: number): Promise<ResetView[] | null> {
    const data = await guard(id, () => api.get<{ resets: ResetView[] }>(`/api/timers/${id}/resets`))
    if (!data) return null
    logs.value = { ...logs.value, [id]: data.resets }
    return data.resets
  }

  async function editNote(timerId: number, resetId: number, note: string): Promise<boolean> {
    const done = await guard(timerId, () =>
      api.patch<{ reset: ResetView }>(`/api/timers/${timerId}/resets/${resetId}`, { note }),
    )
    if (!done) return false
    logs.value = {
      ...logs.value,
      [timerId]: (logs.value[timerId] ?? []).map((r) => (r.id === resetId ? done.reset : r)),
    }
    return true
  }

  async function deleteEntry(timerId: number, resetId: number): Promise<boolean> {
    const done = await guard(timerId, async () => {
      await api.delete(`/api/timers/${timerId}/resets/${resetId}`)
      return true
    })
    if (!done) return false
    await Promise.all([fetchLog(timerId), fetchTimers({ silent: true })])
    return true
  }

  return {
    timers,
    status,
    loadError,
    rowErrors,
    logs,
    now,
    sorted,
    byId,
    isHeld,
    releaseHold,
    startTicker,
    clear,
    fetchTimers,
    watchFocus,
    createTimer,
    updateTimer,
    deleteTimer,
    reset,
    undoReset,
    fetchLog,
    editNote,
    deleteEntry,
  }
})
