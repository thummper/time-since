import { DAY_MS, HOUR_MS, MINUTE_MS } from './limits.ts'

/** R16: "Xd Yh" from one day up, "Xh Ym" below one day. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  if (total >= DAY_MS) {
    return `${Math.floor(total / DAY_MS)}d ${Math.floor((total % DAY_MS) / HOUR_MS)}h`
  }
  return `${Math.floor(total / HOUR_MS)}h ${Math.floor((total % HOUR_MS) / MINUTE_MS)}m`
}

const WHEN_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A log time as a medium date and short time in the viewer's locale. */
export function formatWhen(ms: number): string {
  return WHEN_FORMAT.format(ms)
}

const pad = (n: number) => String(n).padStart(2, '0')

export interface ElapsedPart {
  value: string
  unit: 'd' | 'h' | 'm' | 's'
}

/**
 * The live counter as digit groups: days (only from one day up), then
 * zero-padded hours, minutes and seconds.
 */
export function elapsedParts(ms: number): ElapsedPart[] {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const parts: ElapsedPart[] = [
    { value: pad(Math.floor((total % 86_400) / 3600)), unit: 'h' },
    { value: pad(Math.floor((total % 3600) / 60)), unit: 'm' },
    { value: pad(total % 60), unit: 's' },
  ]
  return days > 0 ? [{ value: String(days), unit: 'd' }, ...parts] : parts
}

/** The `datetime-local` value (local time, minute precision) for an instant. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
