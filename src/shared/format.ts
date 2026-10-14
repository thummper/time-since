const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** R16: "Xd Yh" from one day up, "Xh Ym" below one day. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  if (total >= DAY) {
    return `${Math.floor(total / DAY)}d ${Math.floor((total % DAY) / HOUR)}h`
  }
  return `${Math.floor(total / HOUR)}h ${Math.floor((total % HOUR) / MINUTE)}m`
}
