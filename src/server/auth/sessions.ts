import { createHash, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { sessions, users, type User } from '../db/schema.ts'
import { DAY_MS } from '../../shared/limits.ts'

export const SESSION_LIFETIME_MS = 30 * DAY_MS
export const SESSION_RENEW_BELOW_MS = 15 * DAY_MS

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Creates a session and returns the raw token. Only its SHA-256 hash is stored. */
export function createSession(
  db: Db,
  userId: number,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = now + SESSION_LIFETIME_MS
  db.insert(sessions)
    .values({ idHash: hashToken(token), userId, expiresAt })
    .run()
  return { token, expiresAt }
}

export interface ResolvedSession {
  user: User
  /** Set when the expiry was extended, so the cookie can be refreshed. */
  renewedExpiresAt: number | null
}

export function resolveSession(db: Db, token: string, now = Date.now()): ResolvedSession | null {
  const idHash = hashToken(token)
  const row = db
    .select({ expiresAt: sessions.expiresAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash))
    .get()
  if (!row) return null
  if (row.expiresAt <= now) {
    db.delete(sessions).where(eq(sessions.idHash, idHash)).run()
    return null
  }
  if (row.expiresAt - now < SESSION_RENEW_BELOW_MS) {
    const renewedExpiresAt = now + SESSION_LIFETIME_MS
    db.update(sessions)
      .set({ expiresAt: renewedExpiresAt })
      .where(eq(sessions.idHash, idHash))
      .run()
    return { user: row.user, renewedExpiresAt }
  }
  return { user: row.user, renewedExpiresAt: null }
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.idHash, hashToken(token)))
    .run()
}

/** Deletes every session whose expiry is before `now`. Returns the count. */
export function deleteExpiredSessions(db: Db, now: number): number {
  return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes
}
