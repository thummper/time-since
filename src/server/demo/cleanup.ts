import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { DAY_MS } from '../../shared/limits.ts'

export const DEMO_LIFETIME_MS = DAY_MS

/** Deletes demo users created more than 24 hours before `now`. Returns the count. */
export function cleanupDemoUsers(db: Db, now: number): number {
  return db
    .delete(users)
    .where(and(eq(users.isDemo, true), lt(users.createdAt, now - DEMO_LIFETIME_MS)))
    .run().changes
}
