import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/server/db/client.ts'
import { sessions, users } from '../../src/server/db/schema.ts'
import { createSession, deleteExpiredSessions } from '../../src/server/auth/sessions.ts'

describe('deleteExpiredSessions', () => {
  it('deletes only sessions that expired before now', () => {
    const db = openDb(':memory:')
    const user = db
      .insert(users)
      .values({ email: 'a@example.com', passwordHash: 'x', createdAt: 0 })
      .returning()
      .get()
    const old = createSession(db, user.id, 0)
    const edge = createSession(db, user.id, 1000)
    createSession(db, user.id, 5000)
    const now = edge.expiresAt
    expect(old.expiresAt).toBeLessThan(now)
    expect(deleteExpiredSessions(db, now)).toBe(1)
    expect(db.select().from(sessions).all()).toHaveLength(2)
  })
})
