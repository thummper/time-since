export const NAME_MAX = 60
export const NOTE_MAX = 280
export const TARGET_MIN_MS = 60 * 60 * 1000
export const TARGET_MAX_MS = 365 * 24 * 60 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 60_000
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
export function parseResetAt(value: unknown, now: number): Parsed<number> {
  if (value === undefined || value === null) return ok(now)
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return fail('Reset time is not valid')
  if (value > now + FUTURE_TOLERANCE_MS) return fail('Reset time cannot be in the future')
  return ok(value)
}
