import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { pushSubscriptions } from '../db/schema.ts'

/** Deletes the subscription for `endpoint` only when `userId` owns it. */
export function removeOwnedSubscription(db: Db, endpoint: string, userId: number): void {
  db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .run()
}
