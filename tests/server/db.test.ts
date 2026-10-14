import { afterEach, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { openDb, type Db } from '../../src/server/db/client.ts'
import { pushSubscriptions, resets, sessions, timers, users } from '../../src/server/db/schema.ts'

let db: Db
afterEach(() => db.$client.close())

function seedUser(email = 'a@example.com') {
  const [user] = db
    .insert(users)
    .values({ email, passwordHash: 'x', createdAt: 1 })
    .returning()
    .all()
  const [timer] = db
    .insert(timers)
    .values({ userId: user!.id, name: 'Filter', createdAt: 1 })
    .returning()
    .all()
  db.insert(resets).values({ timerId: timer!.id, at: 1, isOrigin: true, createdAt: 1 }).run()
  db.insert(sessions)
    .values({ idHash: `h-${email}`, userId: user!.id, expiresAt: 9 })
    .run()
  db.insert(pushSubscriptions)
    .values({ endpoint: `e-${email}`, userId: user!.id, p256dh: 'p', auth: 'a', createdAt: 1 })
    .run()
  return { user: user!, timer: timer! }
}

const total = (
  table: typeof users | typeof timers | typeof resets | typeof sessions | typeof pushSubscriptions,
) => db.select({ n: count() }).from(table).get()!.n

describe('database', () => {
  it('applies migrations to a fresh in-memory database and enables foreign keys', () => {
    db = openDb(':memory:')
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    seedUser()
    expect(total(timers)).toBe(1)
  })

  it('allows a user without a password hash (demo user)', () => {
    db = openDb(':memory:')
    db.insert(users).values({ email: 'demo-1@demo.invalid', isDemo: true, createdAt: 1 }).run()
    expect(total(users)).toBe(1)
  })

  it('cascades a timer delete to its resets', () => {
    db = openDb(':memory:')
    const { timer } = seedUser()
    db.delete(timers).where(eq(timers.id, timer.id)).run()
    expect(total(resets)).toBe(0)
  })

  it('removes sessions, subscriptions, timers and resets when a user is deleted', () => {
    db = openDb(':memory:')
    const { user } = seedUser()
    db.delete(users).where(eq(users.id, user.id)).run()
    expect([total(sessions), total(pushSubscriptions), total(timers), total(resets)]).toEqual([
      0, 0, 0, 0,
    ])
  })

  it('rejects a duplicate push endpoint', () => {
    db = openDb(':memory:')
    const { user } = seedUser()
    expect(() =>
      db
        .insert(pushSubscriptions)
        .values({
          endpoint: 'e-a@example.com',
          userId: user.id,
          p256dh: 'p',
          auth: 'a',
          createdAt: 1,
        })
        .run(),
    ).toThrow()
  })

  it('never reuses a deleted reset id', () => {
    db = openDb(':memory:')
    const { timer } = seedUser()
    const [r] = db
      .insert(resets)
      .values({ timerId: timer.id, at: 5, createdAt: 5 })
      .returning()
      .all()
    db.delete(resets).where(eq(resets.id, r!.id)).run()
    const [next] = db
      .insert(resets)
      .values({ timerId: timer.id, at: 6, createdAt: 6 })
      .returning()
      .all()
    expect(next!.id).toBeGreaterThan(r!.id)
  })
})
