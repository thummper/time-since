import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '../../src/server/db/schema.ts'
import type { AdminStats } from '../../src/shared/types.ts'
import { cookieFrom, post } from './authHelpers.ts'
import { call, DAY, HOUR, MINUTE, useApp } from './timersHelpers.ts'

const setup = useApp()
type Ctx = ReturnType<typeof setup>

/** An app whose clock starts at the real time, so `created_at` and the clock agree. */
const adminApp = () => {
  const ctx = setup({ adminEmails: [' Boss@Example.com '], maxRealAccounts: 50, maxDemoUsers: 5 })
  ctx.clock.now = Date.now()
  return ctx
}

const stats = async (ctx: Ctx, cookie: string) =>
  (await (await call(ctx.app, cookie, 'GET', '/api/admin/stats')).json()) as AdminStats

const me = async (ctx: Ctx, cookie: string) =>
  (
    (await (await call(ctx.app, cookie, 'GET', '/api/auth/me')).json()) as {
      user: { isAdmin: boolean }
    }
  ).user

const lastSeen = (ctx: Ctx, email: string) =>
  ctx.db.select({ at: users.lastSeenAt }).from(users).where(eq(users.email, email)).get()!.at

describe('admin', () => {
  it('serves the stats only to an account in ADMIN_EMAILS', async () => {
    const ctx = adminApp()
    const boss = await ctx.register('boss@example.com')
    const user = await ctx.register('user@example.com')
    const demo = cookieFrom(await post(ctx.app, '/api/demo'))

    expect((await call(ctx.app, '', 'GET', '/api/admin/stats')).status).toBe(401)
    expect((await call(ctx.app, user, 'GET', '/api/admin/stats')).status).toBe(403)
    expect((await call(ctx.app, demo, 'GET', '/api/admin/stats')).status).toBe(403)
    expect((await call(ctx.app, boss, 'GET', '/api/admin/stats')).status).toBe(200)
  })

  it('tells the client who is an admin', async () => {
    const ctx = adminApp()
    const loginReply = await post(ctx.app, '/api/auth/register', {
      email: 'boss@example.com',
      password: 'correct horse',
    })
    expect(((await loginReply.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true)
    expect((await me(ctx, cookieFrom(loginReply))).isAdmin).toBe(true)
    expect((await me(ctx, await ctx.register('user@example.com'))).isAdmin).toBe(false)
  })

  it('has no admins when ADMIN_EMAILS is empty', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    expect((await call(ctx.app, cookie, 'GET', '/api/admin/stats')).status).toBe(403)
  })

  it('counts real accounts, content, and activity, and leaves demo sandboxes out', async () => {
    const ctx = adminApp()
    const boss = await ctx.register('boss@example.com')
    const user = await ctx.register('user@example.com')
    await ctx.register('idle@example.com')
    const demo = cookieFrom(await post(ctx.app, '/api/demo'))
    await call(ctx.app, user, 'POST', '/api/timers', { name: 'Water plants' })
    await call(ctx.app, demo, 'POST', '/api/timers', { name: 'Demo timer' })

    ctx.clock.now += 2 * DAY
    await call(ctx.app, user, 'GET', '/api/timers')
    const s = await stats(ctx, boss)

    expect(s.accounts).toEqual({ real: 3, realCap: 50, demo: 1, demoCap: 5 })
    expect(s.signedIn).toBe(3)
    expect(s.signups).toEqual({ week: 3, month: 3 })
    // Today: user and boss. This week: idle never sent a request with its session.
    expect(s.active).toEqual({ day: 2, week: 2, month: 2 })
    // One timer, and its origin reset.
    expect(s.content).toEqual({ timers: 1, resets: 1, pushSubscriptions: 0 })

    ctx.clock.now += 10 * DAY
    expect((await stats(ctx, boss)).active).toEqual({ day: 1, week: 1, month: 2 })
  })

  it('writes last_seen_at at most once per hour', async () => {
    const ctx = adminApp()
    const cookie = await ctx.register('user@example.com')
    expect(lastSeen(ctx, 'user@example.com')).toBeNull()

    const start = ctx.clock.now
    await call(ctx.app, cookie, 'GET', '/api/timers')
    expect(lastSeen(ctx, 'user@example.com')).toBe(start)

    ctx.clock.now += 30 * MINUTE
    await call(ctx.app, cookie, 'GET', '/api/timers')
    expect(lastSeen(ctx, 'user@example.com')).toBe(start)

    ctx.clock.now = start + HOUR
    await call(ctx.app, cookie, 'GET', '/api/timers')
    expect(lastSeen(ctx, 'user@example.com')).toBe(start + HOUR)
  })
})
