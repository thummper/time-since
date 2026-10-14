import type { Db } from '../db/client.ts'
import { runOverdueCheck } from '../push/overdueJob.ts'
import type { PushSender } from '../push/sender.ts'

export interface OverdueIntervalOptions {
  db: Db
  sender: PushSender
  intervalMs: number
  now?: () => number
  /** Replaces the check itself. Tests use it. */
  run?: () => Promise<unknown>
}

/** KTD10: runs the overdue check on an interval. A tick is skipped while a run is active. */
export function startOverdueInterval({
  db,
  sender,
  intervalMs,
  now = Date.now,
  run = () => runOverdueCheck({ db, sender, now: now() }),
}: OverdueIntervalOptions): () => void {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    run()
      .catch((error: unknown) => console.error('overdue check failed', error))
      .finally(() => {
        running = false
      })
  }, intervalMs)
  return () => clearInterval(timer)
}
