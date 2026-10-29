import { MINUTE_MS, NAME_MAX, NOTE_MAX, TARGET_MAX_MS, TARGET_MIN_MS } from '../../shared/limits.ts'
import { isCadence } from '../../shared/sections.ts'
import type { Placement } from '../../shared/types.ts'

export const FUTURE_TOLERANCE_MS = MINUTE_MS
export const MAX_TIMERS = 50
export const MAX_RESETS = 1000

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
const fail = (error: string): Parsed<never> => ({ ok: false, error })

export function parseName(value: unknown): Parsed<string> {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 1 || name.length > NAME_MAX)
    return fail(`Name must be 1 to ${NAME_MAX} characters`)
  return ok(name)
}

/** `null` clears the target. */
export function parseTarget(value: unknown): Parsed<number | null> {
  if (value === null) return ok(null)
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < TARGET_MIN_MS ||
    value > TARGET_MAX_MS
  ) {
    return fail('Target must be between 1 hour and 365 days')
  }
  return ok(value)
}

/** `undefined`, `null`, and an empty string all mean "no note". */
export function parseNote(value: unknown): Parsed<string | null> {
  if (value === undefined || value === null) return ok(null)
  if (typeof value !== 'string') return fail('Note must be text')
  if (value.length > NOTE_MAX) return fail(`Note must be at most ${NOTE_MAX} characters`)
  return ok(value === '' ? null : value)
}

/** `undefined` means "now". A time after now plus 60 seconds is rejected. */
function parsePastTime(value: unknown, now: number, label: string): Parsed<number> {
  if (value === undefined || value === null) return ok(now)
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return fail(`${label} is not valid`)
  if (value > now + FUTURE_TOLERANCE_MS) return fail(`${label} cannot be in the future`)
  return ok(value)
}

export const parseResetAt = (value: unknown, now: number) => parsePastTime(value, now, 'Reset time')

/** When a new timer's origin entry happened. */
export const parseStartedAt = (value: unknown, now: number) =>
  parsePastTime(value, now, 'Start time')

/** Checks the placement shape only. The route checks that a custom section belongs to the user. */
export function parsePlacement(value: unknown): Parsed<Placement> {
  const invalid = fail('Section is not valid')
  if (typeof value !== 'object' || value === null) return invalid
  const raw = value as Record<string, unknown>
  if (raw.kind === 'auto') return ok({ kind: 'auto' })
  if (raw.kind === 'cadence') {
    return isCadence(raw.cadence) ? ok({ kind: 'cadence', cadence: raw.cadence }) : invalid
  }
  if (raw.kind === 'custom') {
    const id = raw.sectionId
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
      ? ok({ kind: 'custom', sectionId: id })
      : invalid
  }
  return invalid
}
