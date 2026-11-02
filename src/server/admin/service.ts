import { and, count, countDistinct, eq, gt, gte, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { pushSubscriptions, resets, sessions, timers, users } from '../db/schema.ts'
import { DAY_MS } from '../../shared/limits.ts'
import type { AdminStats } from '../../shared/types.ts'

export interface Caps {
  maxRealAccounts: number
  maxDemoUsers: number
}

/** Counts real users (not demo) that match `where`. */
function realUsers(db: Db, where?: SQL): number {
  return db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.isDemo, false), where))
    .get()!.n
}

export function adminStats(db: Db, now: number, caps: Caps): AdminStats {
  const seenSince = (ms: number) => realUsers(db, gte(users.lastSeenAt, now - ms))
  const joinedSince = (ms: number) => realUsers(db, gte(users.createdAt, now - ms))
  return {
    now,
    accounts: {
      real: realUsers(db),
      realCap: caps.maxRealAccounts,
      demo: db.select({ n: count() }).from(users).where(eq(users.isDemo, true)).get()!.n,
      demoCap: caps.maxDemoUsers,
    },
    active: { day: seenSince(DAY_MS), week: seenSince(7 * DAY_MS), month: seenSince(30 * DAY_MS) },
    signedIn: db
      .select({ n: countDistinct(sessions.userId) })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(users.isDemo, false), gt(sessions.expiresAt, now)))
      .get()!.n,
    signups: { week: joinedSince(7 * DAY_MS), month: joinedSince(30 * DAY_MS) },
    content: {
      timers: db
        .select({ n: count() })
        .from(timers)
        .innerJoin(users, eq(users.id, timers.userId))
        .where(eq(users.isDemo, false))
        .get()!.n,
      resets: db
        .select({ n: count() })
        .from(resets)
        .innerJoin(timers, eq(timers.id, resets.timerId))
        .innerJoin(users, eq(users.id, timers.userId))
        .where(eq(users.isDemo, false))
        .get()!.n,
      pushSubscriptions: db
        .select({ n: count() })
        .from(pushSubscriptions)
        .innerJoin(users, eq(users.id, pushSubscriptions.userId))
        .where(eq(users.isDemo, false))
        .get()!.n,
    },
  }
}
