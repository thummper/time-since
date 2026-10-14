import { describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { resets, timers } from '../../src/server/db/schema.ts'
import { isDueForAlert } from '../../src/shared/overdue.ts'
import type { ResetView, TimerList, TimerView } from '../../src/shared/types.ts'
import { call, DAY, MINUTE, T0, useApp } from './timersHelpers.ts'

const setup = useApp()
type Ctx = ReturnType<typeof setup>

async function withTimer(ctx: Ctx, createdAt = T0) {
  const cookie = await ctx.register()
  ctx.clock.now = createdAt
  const res = await call(ctx.app, cookie, 'POST', '/api/timers', { name: 'Chore' })
  const timer = (await res.json()) as TimerView
  const base = `/api/timers/${timer.id}`
  return {
    cookie,
    timer,
    base,
    reset: async (at?: number, note?: string) => {
      const r = await call(ctx.app, cookie, 'POST', `${base}/resets`, { at, note })
      return { status: r.status, body: (await r.json()) as { reset: ResetView; error?: string } }
    },
    view: async () =>
      (await (await call(ctx.app, cookie, 'GET', '/api/timers')).json()) as TimerList,
    del: (id: number) => call(ctx.app, cookie, 'DELETE', `${base}/resets/${id}`),
    log: async () =>
      (
        (await (await call(ctx.app, cookie, 'GET', `${base}/resets`)).json()) as {
          resets: ResetView[]
        }
      ).resets,
  }
}

describe('reset log', () => {
  it('Covers AE1. Resets on days 1, 8, 15, then a reset on day 20 and a delete of that ID give last reset day 15 and average 7 days', async () => {
    const ctx = setup()
    const t = await withTimer(ctx, T0 + 1 * DAY)
    ctx.clock.now = T0 + 8 * DAY
    await t.reset()
    ctx.clock.now = T0 + 15 * DAY
    await t.reset()
    ctx.clock.now = T0 + 20 * DAY
    const created = await t.reset()
    expect(created.status).toBe(201)
    expect(created.body.reset.at).toBe(T0 + 20 * DAY)
    expect((await t.view()).timers[0]!.lastReset.at).toBe(T0 + 20 * DAY)

    expect((await t.del(created.body.reset.id)).status).toBe(204)
    const { timers: view } = await t.view()
    expect(view[0]!.lastReset.at).toBe(T0 + 15 * DAY)
    expect(view[0]!.stats.averageGapMs).toBe(7 * DAY)
    expect(view[0]!.stats.resetCount).toBe(2)
  })

  it('Covers AE2. A backdated reset on day 12 leaves the last reset at day 15 and counts in the stats', async () => {
    const ctx = setup()
    const t = await withTimer(ctx, T0 + 1 * DAY)
    ctx.clock.now = T0 + 15 * DAY
    await t.reset(T0 + 15 * DAY)
    expect((await t.reset(T0 + 12 * DAY)).status).toBe(201)
    const { timers: view } = await t.view()
    expect(view[0]!.lastReset.at).toBe(T0 + 15 * DAY)
    expect(view[0]!.stats.resetCount).toBe(2)
    expect(view[0]!.stats.longestGapMs).toBe(11 * DAY)
  })

  it('Covers AE3. A backdated reset on day 18 when now is day 20 becomes the last reset', async () => {
    const ctx = setup()
    const t = await withTimer(ctx, T0 + 1 * DAY)
    ctx.clock.now = T0 + 15 * DAY
    await t.reset()
    ctx.clock.now = T0 + 20 * DAY
    await t.reset(T0 + 18 * DAY)
    const { timers: view } = await t.view()
    expect(view[0]!.lastReset.at).toBe(T0 + 18 * DAY)
  })

  it('defaults at to server now and stores the note', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    ctx.clock.now = T0 + 5 * MINUTE
    const { body } = await t.reset(undefined, 'did it')
    expect(body.reset).toMatchObject({ at: T0 + 5 * MINUTE, note: 'did it', isOrigin: false })
    expect((await t.log()).map((e) => e.note)).toEqual(['did it', null])
  })

  it('rejects a reset at two minutes in the future with 422, accepts within 60 seconds', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    expect((await t.reset(T0 + 2 * MINUTE)).status).toBe(422)
    expect((await t.reset(T0 + 60_000)).status).toBe(201)
    expect((await t.reset(T0 + 60_001)).status).toBe(422)
    expect((await t.reset('yesterday' as unknown as number)).status).toBe(422)
    expect(ctx.db.select({ n: count() }).from(resets).get()!.n).toBe(2)
  })

  it('rejects a note longer than 280 characters with 422', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    expect((await t.reset(undefined, 'x'.repeat(281))).status).toBe(422)
    expect((await t.reset(undefined, 'x'.repeat(280))).status).toBe(201)
  })

  it('refuses to delete the origin entry (422); deleting another entry updates stats', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    ctx.clock.now = T0 + 2 * DAY
    const a = await t.reset()
    ctx.clock.now = T0 + 6 * DAY
    await t.reset()
    const origin = (await t.log()).find((e) => e.isOrigin)!
    expect((await t.del(origin.id)).status).toBe(422)
    expect((await t.view()).timers[0]!.stats.resetCount).toBe(2)
    expect((await t.view()).timers[0]!.stats.averageGapMs).toBe(3 * DAY)
    expect((await t.del(a.body.reset.id)).status).toBe(204)
    const { stats } = (await t.view()).timers[0]!
    expect(stats).toMatchObject({ resetCount: 1, averageGapMs: 6 * DAY, longestGapMs: 6 * DAY })
  })

  it('returns 204 when deleting an already-deleted entry', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    const { body } = await t.reset()
    expect((await t.del(body.reset.id)).status).toBe(204)
    expect((await t.del(body.reset.id)).status).toBe(204)
    expect((await t.del(99_999)).status).toBe(204)
  })

  it('edits the note of an entry, including the origin entry; over 280 characters returns 422', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    const { body } = await t.reset(undefined, 'old')
    const origin = (await t.log()).find((e) => e.isOrigin)!
    const edit = (id: number, note: unknown) =>
      call(ctx.app, t.cookie, 'PATCH', `${t.base}/resets/${id}`, { note })
    const res = await edit(body.reset.id, 'new')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { reset: ResetView }).reset.note).toBe('new')
    expect((await edit(origin.id, 'first one')).status).toBe(200)
    expect((await t.log()).map((e) => e.note).sort()).toEqual(['first one', 'new'])
    expect((await edit(body.reset.id, null)).status).toBe(200)
    expect((await t.log()).find((e) => e.id === body.reset.id)!.note).toBeNull()
    expect((await edit(body.reset.id, 'x'.repeat(281))).status).toBe(422)
    expect((await edit(99_999, 'x')).status).toBe(404)
    expect(
      (await call(ctx.app, t.cookie, 'PATCH', `${t.base}/resets/${body.reset.id}`, {})).status,
    ).toBe(422)
  })

  it('Covers AE6. A reset plus delete of that reset leaves alerted_for_reset_id unchanged and the timer not due again', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    await call(ctx.app, t.cookie, 'PATCH', t.base, { targetMs: 2 * DAY })
    ctx.clock.now = T0 + 3 * DAY
    const originId = ctx.db.select().from(resets).get()!.id
    ctx.db
      .update(timers)
      .set({ alertedForResetId: originId })
      .where(eq(timers.id, t.timer.id))
      .run()

    const { body } = await t.reset()
    expect((await t.view()).timers[0]!.overdue).toBe(false)
    await t.del(body.reset.id)

    const view = (await t.view()).timers[0]!
    expect(view.overdue).toBe(true)
    expect(view.lastReset.id).toBe(originId)
    const row = ctx.db.select().from(timers).get()!
    expect(row.alertedForResetId).toBe(originId)
    expect(isDueForAlert(row, view.lastReset, ctx.clock.now)).toBe(false)
  })

  it('rejects the 1,001st log entry with 422', async () => {
    const ctx = setup()
    const t = await withTimer(ctx)
    ctx.db
      .insert(resets)
      .values(Array.from({ length: 999 }, () => ({ timerId: t.timer.id, at: T0, createdAt: T0 })))
      .run() // origin + 999 = 1,000 entries
    const res = await t.reset()
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/1,?000/)
    expect(ctx.db.select({ n: count() }).from(resets).get()!.n).toBe(1000)
  })
})
