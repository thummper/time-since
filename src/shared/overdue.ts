export interface AlertTimer {
  targetMs: number | null
  alertedForResetId: number | null
}

/** The one overdue rule (R12): strictly past the target. A null target is never overdue. */
export function isPastTarget(targetMs: number | null, lastAt: number, now: number): boolean {
  return targetMs !== null && now - lastAt > targetMs
}

/** Milliseconds past the target; 0 without a target. Negative before the target. */
export function overdueByMs(targetMs: number | null, lastAt: number, now: number): number {
  return targetMs === null ? 0 : now - lastAt - targetMs
}

/** KTD5: overdue with a target, and not yet alerted for this last reset. */
export function isDueForAlert(
  timer: AlertTimer,
  lastReset: { id: number; at: number },
  now: number,
): boolean {
  if (!isPastTarget(timer.targetMs, lastReset.at, now)) return false
  return timer.alertedForResetId !== lastReset.id
}
