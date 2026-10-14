import { describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { resets, timers } from '../../src/server/db/schema.ts'
import type { TimerList, TimerView } from '../../src/shared/types.ts'
import { call, DAY, HOUR, MINUTE, T0, useApp } from './timersHelpers.ts'

const setup = useApp()
type Ctx = ReturnType<typeof setup>

async function createTimer(ctx: Ctx, cookie: string, body: unknown = { name: 'Water plants' }) {
  const res = await call(ctx.app, cookie, 'POST', '/api/timers', body)
  return { res, timer: (res.status === 201 ? await res.json() : null) as TimerView }
}

const list = async (ctx: Ctx, cookie: string) =>
  (await (await call(ctx.app, cookie, 'GET', '/api/timers')).json()) as TimerList

describe('timers', () => {
  it('requires a logged-in user on every route', async () => {
    const ctx = setup()
    for (const [method, path] of [
      ['GET', '/api/timers'],
      ['POST', '/api/timers'],
      ['PATCH', '/api/timers/1'],
      ['DELETE', '/api/timers/1'],
      ['GET', '/api/timers/1/resets'],
      ['POST', '/api/timers/1/resets'],
      ['PATCH', '/api/timers/1/resets/1'],
      ['DELETE', '/api/timers/1/resets/1'],
    ] as const) {
      expect((await call(ctx.app, '', method, path, {})).status, `${method} ${path}`).toBe(401)
    }
  })

  it('creates a timer: the list shows elapsed near 0 and the log has one origin entry', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { res, timer } = await createTimer(ctx, cookie, {
      name: '  Water plants ',
      targetMs: 7 * DAY,
    })
    expect(res.status).toBe(201)
    expect(timer.name).toBe('Water plants')
    ctx.clock.now = T0 + 5 * MINUTE
    const body = await list(ctx, cookie)
    expect(body.now).toBe(T0 + 5 * MINUTE)
    expect(body.timers).toHaveLength(1)
    const [t] = body.timers
    expect(t).toMatchObject({
      name: 'Water plants',
      targetMs: 7 * DAY,
      createdAt: T0,
      overdue: false,
    })
    expect(t!.lastReset.at).toBe(T0)
    expect(body.now - t!.lastReset.at).toBe(5 * MINUTE)
    expect(t!.stats).toEqual({ averageGapMs: null, longestGapMs: null, resetCount: 0 })
    const log = (await (
      await call(ctx.app, cookie, 'GET', `/api/timers/${t!.id}/resets`)
    ).json()) as {
      resets: { isOrigin: boolean; at: number }[]
    }
    expect(log.resets).toHaveLength(1)
    expect(log.resets[0]).toMatchObject({ isOrigin: true, at: T0 })
  })

  it('validates name and target', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (const body of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(61) },
      { name: 5 },
      { name: 'ok', targetMs: HOUR - 1 },
      { name: 'ok', targetMs: 365 * DAY + 1 },
      { name: 'ok', targetMs: 'soon' },
      { name: 'ok', targetMs: 1.5 * HOUR + 0.5 },
    ]) {
      expect((await createTimer(ctx, cookie, body)).res.status, JSON.stringify(body)).toBe(422)
    }
    expect(
      (await createTimer(ctx, cookie, { name: 'x'.repeat(60), targetMs: HOUR })).res.status,
    ).toBe(201)
    expect((await createTimer(ctx, cookie, { name: 'ok', targetMs: 365 * DAY })).res.status).toBe(
      201,
    )
    expect((await createTimer(ctx, cookie, { name: 'ok', targetMs: null })).res.status).toBe(201)
  })

  it('renames, sets and clears the target', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie)
    const patch = (body: unknown) => call(ctx.app, cookie, 'PATCH', `/api/timers/${timer.id}`, body)
    expect(((await (await patch({ name: 'Plants' })).json()) as TimerView).name).toBe('Plants')
    expect(((await (await patch({ targetMs: 2 * DAY })).json()) as TimerView).targetMs).toBe(
      2 * DAY,
    )
    const cleared = (await (await patch({ targetMs: null })).json()) as TimerView
    expect(cleared).toMatchObject({ name: 'Plants', targetMs: null })
    expect((await patch({ name: '' })).status).toBe(422)
    expect((await patch({ targetMs: 5 })).status).toBe(422)
    expect((await patch({})).status).toBe(422)
  })

  it('setting a target below the elapsed time marks the timer overdue in the list', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie)
    ctx.clock.now = T0 + 3 * DAY
    expect((await list(ctx, cookie)).timers[0]!.overdue).toBe(false)
    await call(ctx.app, cookie, 'PATCH', `/api/timers/${timer.id}`, { targetMs: 2 * DAY })
    expect((await list(ctx, cookie)).timers[0]!.overdue).toBe(true)
  })

  it('raising the target of an alerted timer so it is no longer overdue clears alerted_for_reset_id', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie, { name: 'x', targetMs: 2 * DAY })
    ctx.clock.now = T0 + 3 * DAY
    const originId = ctx.db.select().from(resets).get()!.id
    ctx.db.update(timers).set({ alertedForResetId: originId }).where(eq(timers.id, timer.id)).run()
    const patch = (body: unknown) => call(ctx.app, cookie, 'PATCH', `/api/timers/${timer.id}`, body)
    await patch({ name: 'renamed' })
    expect(ctx.db.select().from(timers).get()!.alertedForResetId).toBe(originId)
    await patch({ targetMs: 2 * DAY + HOUR }) // still overdue: stays alerted
    expect(ctx.db.select().from(timers).get()!.alertedForResetId).toBe(originId)
    await patch({ targetMs: 10 * DAY })
    expect(ctx.db.select().from(timers).get()!.alertedForResetId).toBeNull()
  })

  it('deleting a timer removes its log entries', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie)
    await call(ctx.app, cookie, 'POST', `/api/timers/${timer.id}/resets`, {})
    expect((await call(ctx.app, cookie, 'DELETE', `/api/timers/${timer.id}`)).status).toBe(204)
    expect(ctx.db.select({ n: count() }).from(resets).get()!.n).toBe(0)
    expect((await list(ctx, cookie)).timers).toHaveLength(0)
  })

  it("returns 404 on every route for another user's timer, and the list hides it", async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    const { timer } = await createTimer(ctx, a)
    const entry = ctx.db.select().from(resets).get()!
    const base = `/api/timers/${timer.id}`
    for (const [method, path, body] of [
      ['PATCH', base, { name: 'hacked' }],
      ['DELETE', base],
      ['GET', `${base}/resets`],
      ['POST', `${base}/resets`, {}],
      ['PATCH', `${base}/resets/${entry.id}`, { note: 'x' }],
      ['DELETE', `${base}/resets/${entry.id}`],
    ] as const) {
      expect((await call(ctx.app, b, method, path, body)).status, `${method} ${path}`).toBe(404)
    }
    expect((await list(ctx, b)).timers).toHaveLength(0)
    expect(ctx.db.select({ n: count() }).from(resets).get()!.n).toBe(1)
    expect(ctx.db.select().from(timers).get()!.name).toBe('Water plants')
  })

  it('returns 404 for a missing or malformed timer ID', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    expect((await call(ctx.app, cookie, 'DELETE', '/api/timers/999')).status).toBe(404)
    expect((await call(ctx.app, cookie, 'GET', '/api/timers/abc/resets')).status).toBe(404)
  })

  it('rejects the 51st timer with 422 and does not create it', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (let i = 0; i < 50; i++)
      expect((await createTimer(ctx, cookie, { name: `t${i}` })).res.status).toBe(201)
    const { res } = await createTimer(ctx, cookie, { name: 'one too many' })
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toMatch(/50/)
    expect(ctx.db.select({ n: count() }).from(timers).get()!.n).toBe(50)
  })

  it('counts the timer cap per user', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    for (let i = 0; i < 50; i++) await createTimer(ctx, a, { name: `t${i}` })
    expect((await createTimer(ctx, b, { name: 'mine' })).res.status).toBe(201)
  })

  it('rejects the 61st write within one minute from one user with 429', async () => {
    const ctx = setup({ limits: { writesPerMinute: 60 } })
    const cookie = await ctx.register()
    for (let i = 0; i < 50; i++)
      expect((await createTimer(ctx, cookie, { name: `t${i}` })).res.status).toBe(201)
    const { timer } = await createTimer(ctx, cookie, { name: 'last' }).then((r) => ({
      timer: r.res.status,
    }))
    expect(timer).toBe(422) // 51st: over the cap, but still counted as a write
    for (let i = 0; i < 9; i++)
      expect((await createTimer(ctx, cookie, { name: 'x' })).res.status).toBe(422)
    expect((await createTimer(ctx, cookie)).res.status).toBe(429)
    // Reads and other users are unaffected.
    expect((await call(ctx.app, cookie, 'GET', '/api/timers')).status).toBe(200)
    const other = await ctx.register('b@example.com')
    expect((await createTimer(ctx, other)).res.status).toBe(201)
  })
})
