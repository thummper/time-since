import { DAY_MS, HOUR_MS, MINUTE_MS } from './limits.ts'

/** R16: "Xd Yh" from one day up, "Xh Ym" below one day. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  if (total >= DAY_MS) {
    return `${Math.floor(total / DAY_MS)}d ${Math.floor((total % DAY_MS) / HOUR_MS)}h`
  }
  return `${Math.floor(total / HOUR_MS)}h ${Math.floor((total % HOUR_MS) / MINUTE_MS)}m`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The `datetime-local` value (local time, minute precision) for an instant. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
