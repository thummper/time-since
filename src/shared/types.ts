import type { Stats } from './stats.ts'

export type { Stats }

/** List order of the cadence sections. */
export const CADENCES = ['daily', 'weekly', 'monthly', 'other'] as const

export type Cadence = (typeof CADENCES)[number]

/** Where a timer lives on the list: from its target, a chosen cadence, or a custom section. */
export type Placement =
  { kind: 'auto' } | { kind: 'cadence'; cadence: Cadence } | { kind: 'custom'; sectionId: number }

/** A section the user created. */
export interface SectionView {
  id: number
  name: string
}

/** One timer in the list response (U4). All times are UTC epoch ms. */
export interface TimerView {
  id: number
  name: string
  targetMs: number | null
  createdAt: number
  lastReset: { id: number; at: number }
  overdue: boolean
  placement: Placement
  stats: Stats
}

/** `now` is the server clock; elapsed is `now - lastReset.at`. */
export interface TimerList {
  now: number
  timers: TimerView[]
  sections: SectionView[]
}

export interface ResetView {
  id: number
  at: number
  note: string | null
  isOrigin: boolean
}
