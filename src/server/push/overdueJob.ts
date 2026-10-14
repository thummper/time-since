import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { pushSubscriptions, timers, users } from '../db/schema.ts'
import { formatElapsed } from '../../shared/format.ts'
import { isDueForAlert } from '../../shared/overdue.ts'
import { lastReset } from '../../shared/stats.ts'
import { entriesOf } from '../timers/service.ts'
import type { PushSender } from './sender.ts'

/** KTD5: retry temporary failures until this long after the timer became overdue. */
export const RETRY_WINDOW_MS = 6 * 60 * 60 * 1000

export interface OverdueCheckOptions {
  db: Db
  sender: PushSender
  now: number
}

type Outcome = 'accepted' | 'gone' | 'permanent' | 'temporary'

function classify(status: number | null): Outcome {
  if (status === null) return 'temporary'
  if (status >= 200 && status < 300) return 'accepted'
  if (status === 404 || status === 410) return 'gone'
  if (status === 429 || status >= 500) return 'temporary'
  return 'permanent'
}

/** Sends one alert per overdue period (KTD5, KTD11). Returns the number of timers handled. */
export async function runOverdueCheck({ db, sender, now }: OverdueCheckOptions): Promise<number> {
  const candidates = db
    .select({ timer: timers })
    .from(timers)
    .innerJoin(users, eq(users.id, timers.userId))
    .where(and(eq(users.isDemo, false), isNotNull(timers.targetMs)))
    .all()

  let handled = 0
  for (const { timer } of candidates) {
    const last = lastReset(entriesOf(db, timer.id))
    if (!last || !isDueForAlert(timer, last, now)) continue
    handled++

    const subs = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, timer.userId))
      .all()
    const payload = {
      title: timer.name,
      body: `Overdue: ${formatElapsed(now - last.at)} since the last reset`,
      url: `/timers/${timer.id}`,
    }
    const outcomes = await Promise.all(subs.map((sub) => sender.send(sub, payload)))

    let accepted = false
    let temporary = false
    outcomes.forEach((status, i) => {
      const outcome = classify(status)
      if (outcome === 'accepted') accepted = true
      else if (outcome === 'temporary') temporary = true
      else if (outcome === 'gone') {
        db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subs[i]!.id)).run()
      } else {
        console.warn(`push: permanent failure ${status} for subscription ${subs[i]!.id}`)
      }
    })

    const retryExpired = now >= last.at + timer.targetMs! + RETRY_WINDOW_MS
    if (accepted || !temporary || retryExpired) {
      db.update(timers).set({ alertedForResetId: last.id }).where(eq(timers.id, timer.id)).run()
    }
  }
  return handled
}
