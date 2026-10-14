import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import {
  pushSubscriptions,
  resets,
  timers,
  users,
  type PushSubscription,
  type Reset,
} from '../db/schema.ts'
import { HOUR_MS } from '../../shared/limits.ts'
import { formatElapsed } from '../../shared/format.ts'
import { isDueForAlert } from '../../shared/overdue.ts'
import { lastReset } from '../../shared/stats.ts'
import type { PushSender } from './sender.ts'

/** KTD5: retry temporary failures until this long after the timer became overdue. */
export const RETRY_WINDOW_MS = 6 * HOUR_MS

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

  // One query for every candidate's log, reduced to the last reset per timer (KTD4).
  const lastByTimer = new Map<number, Reset>()
  const logs = db
    .select({ reset: resets })
    .from(resets)
    .innerJoin(timers, eq(timers.id, resets.timerId))
    .innerJoin(users, eq(users.id, timers.userId))
    .where(and(eq(users.isDemo, false), isNotNull(timers.targetMs)))
    .all()
  for (const { reset } of logs) {
    const prev = lastByTimer.get(reset.timerId)
    lastByTimer.set(reset.timerId, prev ? lastReset([prev, reset])! : reset)
  }

  // Subscriptions per user, loaded once per run. A deleted one leaves the cache too.
  const subsByUser = new Map<number, PushSubscription[]>()

  let handled = 0
  for (const { timer } of candidates) {
    const last = lastByTimer.get(timer.id) ?? null
    if (!last || !isDueForAlert(timer, last, now)) continue
    handled++

    let subs = subsByUser.get(timer.userId)
    if (!subs) {
      subs = db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, timer.userId))
        .all()
      subsByUser.set(timer.userId, subs)
    }
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
        const goneId = subs[i]!.id
        db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, goneId)).run()
        subsByUser.set(
          timer.userId,
          (subsByUser.get(timer.userId) ?? []).filter((s) => s.id !== goneId),
        )
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
