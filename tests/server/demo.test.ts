import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { forbidDemo, type AuthEnv } from '../../src/server/auth/middleware.ts'
import { resets, sessions, timers, users } from '../../src/server/db/schema.ts'
import { cleanupDemoUsers } from '../../src/server/demo/cleanup.ts'
import { cookieFrom, post } from './authHelpers.ts'
import { call, DAY, HOUR, useApp } from './timersHelpers.ts'

const make = useApp()
const startDemo = async (ctx: ReturnType<typeof make>, ip = '1.1.1.1') =>
  post(ctx.app, '/api/demo', undefined, { 'cf-connecting-ip': ip })

describe('POST /api/demo', () => {
  it('Covers AE5. deleting all timers in one demo leaves the other demo intact', async () => {
    const ctx = make()
    const one = cookieFrom(await startDemo(ctx))
    const two = cookieFrom(await startDemo(ctx))
    const list = (await (await call(ctx.app, one, 'GET', '/api/timers')).json()) as {
      timers: { id: number }[]
    }
    for (const t of list.timers) await call(ctx.app, one, 'DELETE', `/api/timers/${t.id}`)
    const afterOne = (await (await call(ctx.app, one, 'GET', '/api/timers')).json()) as {
      timers: unknown[]
    }
    const afterTwo = (await (await call(ctx.app, two, 'GET', '/api/timers')).json()) as {
      timers: unknown[]
    }
    expect(afterOne.timers).toHaveLength(0)
    expect(afterTwo.timers.length).toBeGreaterThanOrEqual(5)
  })

  it('creates a passwordless demo user with a session and realistic seeded data', async () => {
    const ctx = make()
    const res = await startDemo(ctx)
    expect(res.status).toBe(201)
    const cookie = cookieFrom(res)
    const me = (await (await call(ctx.app, cookie, 'GET', '/api/auth/me')).json()) as {
      user: { isDemo: boolean }
    }
    expect(me.user.isDemo).toBe(true)
    const user = ctx.db.select().from(users).get()!
    expect(user.passwordHash).toBeNull()
    expect(user.email).toMatch(/@/)
    const list = (await (await call(ctx.app, cookie, 'GET', '/api/timers')).json()) as {
      timers: { id: number; overdue: boolean; targetMs: number | null }[]
    }
    expect(list.timers.length).toBeGreaterThanOrEqual(5)
    expect(list.timers.length).toBeLessThanOrEqual(6)
    expect(list.timers.filter((t) => t.overdue && t.targetMs !== null)).toHaveLength(1)
    const counts = list.timers.map(
      (t) => ctx.db.select().from(resets).where(eq(resets.timerId, t.id)).all().length,
    )
    expect(counts.some((n) => n >= 3)).toBe(true)
    for (const r of ctx.db.select().from(resets).all())
      expect(r.at).toBeLessThanOrEqual(ctx.clock.now)
  })

  it('does not count demo users toward the real-account cap', async () => {
    const ctx = make({ maxRealAccounts: 1 })
    await startDemo(ctx)
    await startDemo(ctx)
    expect(
      (
        await post(ctx.app, '/api/auth/register', {
          email: 'a@example.com',
          password: 'correct horse',
        })
      ).status,
    ).toBe(201)
  })

  it('limits demo creation per IP per hour', async () => {
    const ctx = make({ limits: { demoPerHour: 2 } })
    expect((await startDemo(ctx, '2.2.2.2')).status).toBe(201)
    expect((await startDemo(ctx, '2.2.2.2')).status).toBe(201)
    expect((await startDemo(ctx, '2.2.2.2')).status).toBe(429)
    expect((await startDemo(ctx, '3.3.3.3')).status).toBe(201)
  })

  it('deletes the oldest demo user when the cap is reached', async () => {
    const ctx = make({ maxDemoUsers: 3, limits: { demoPerHour: 1000 } })
    for (let i = 0; i < 3; i++) {
      await startDemo(ctx)
      ctx.clock.now += 1000
    }
    const oldest = ctx.db.select().from(users).orderBy(users.createdAt).get()!
    await startDemo(ctx)
    const rows = ctx.db.select().from(users).all()
    expect(rows).toHaveLength(3)
    expect(rows.some((u) => u.id === oldest.id)).toBe(false)
  })

  it('returns 401 for a session whose demo user was deleted', async () => {
    const ctx = make()
    const cookie = cookieFrom(await startDemo(ctx))
    cleanupDemoUsers(ctx.db, ctx.clock.now + 25 * HOUR)
    expect((await call(ctx.app, cookie, 'GET', '/api/timers')).status).toBe(401)
  })
})

describe('forbidDemo', () => {
  it('returns 403 for a demo user and passes a real user', async () => {
    const ctx = make()
    const demo = cookieFrom(await startDemo(ctx))
    const real = await ctx.register()
    const { authMiddleware } = await import('../../src/server/auth/middleware.ts')
    const app = new Hono<AuthEnv>()
    app.use('*', authMiddleware(ctx.db, { secure: true }))
    app.post('/x', forbidDemo, (c) => c.json({ ok: true }))
    const hit = (cookie: string) => app.request('/x', { method: 'POST', headers: { cookie } })
    expect((await hit(demo)).status).toBe(403)
    expect((await hit(real)).status).toBe(200)
  })
})

describe('cleanupDemoUsers', () => {
  it('deletes demo users older than 24h with their data and keeps the rest', async () => {
    const ctx = make({ limits: { demoPerHour: 1000 } })
    await startDemo(ctx)
    const oldId = ctx.db.select().from(users).get()!.id
    ctx.clock.now += 24 * HOUR
    await startDemo(ctx)
    ctx.clock.now += DAY - 23 * HOUR + HOUR
    const realCookie = await ctx.register('real@example.com')
    expect(realCookie).not.toBe('')
    ctx.db
      .update(users)
      .set({ createdAt: ctx.clock.now - 100 * DAY })
      .where(eq(users.email, 'real@example.com'))
      .run()
    const removed = cleanupDemoUsers(ctx.db, ctx.clock.now)
    expect(removed).toBe(1)
    const left = ctx.db.select().from(users).all()
    expect(left).toHaveLength(2)
    expect(left.some((u) => u.id === oldId)).toBe(false)
    expect(left.some((u) => u.email === 'real@example.com')).toBe(true)
    expect(ctx.db.select().from(timers).where(eq(timers.userId, oldId)).all()).toHaveLength(0)
    expect(ctx.db.select().from(sessions).where(eq(sessions.userId, oldId)).all()).toHaveLength(0)
  })
})
