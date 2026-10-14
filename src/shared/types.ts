import type { Stats } from './stats.ts'

export type { Stats }

/** One timer in the list response (U4). All times are UTC epoch ms. */
export interface TimerView {
  id: number
  name: string
  targetMs: number | null
  createdAt: number
  lastReset: { id: number; at: number }
  overdue: boolean
  stats: Stats
}

/** `now` is the server clock; elapsed is `now - lastReset.at`. */
export interface TimerList {
  now: number
  timers: TimerView[]
}

export interface ResetView {
  id: number
  at: number
  note: string | null
  isOrigin: boolean
}
