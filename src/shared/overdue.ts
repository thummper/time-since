export interface AlertTimer {
  targetMs: number | null
  alertedForResetId: number | null
}

/** KTD5: overdue with a target, and not yet alerted for this last reset. */
export function isDueForAlert(
  timer: AlertTimer,
  lastReset: { id: number; at: number },
  now: number,
): boolean {
  if (timer.targetMs === null) return false
  if (now <= lastReset.at + timer.targetMs) return false
  return timer.alertedForResetId !== lastReset.id
}
