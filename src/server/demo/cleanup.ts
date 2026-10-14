import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { users } from '../db/schema.ts'

export const DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000

/** Deletes demo users created more than 24 hours before `now`. Returns the count. */
export function cleanupDemoUsers(db: Db, now: number): number {
  return db
    .delete(users)
    .where(and(eq(users.isDemo, true), lt(users.createdAt, now - DEMO_LIFETIME_MS)))
    .run().changes
}
