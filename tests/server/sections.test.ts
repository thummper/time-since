import { describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { sections, timers, users } from '../../src/server/db/schema.ts'
import type { SectionView, TimerList, TimerView } from '../../src/shared/types.ts'
import { call, DAY, useApp } from './timersHelpers.ts'

const setup = useApp()
type Ctx = ReturnType<typeof setup>

async function createSection(ctx: Ctx, cookie: string, name: string) {
  const res = await call(ctx.app, cookie, 'POST', '/api/sections', { name })
  return { res, section: (res.status === 201 ? await res.json() : null) as SectionView }
}

async function createTimer(ctx: Ctx, cookie: string, body: Record<string, unknown> = {}) {
  const res = await call(ctx.app, cookie, 'POST', '/api/timers', { name: 'Water plants', ...body })
  return { res, timer: (res.status === 201 ? await res.json() : null) as TimerView }
}

const list = async (ctx: Ctx, cookie: string) =>
  (await (await call(ctx.app, cookie, 'GET', '/api/timers')).json()) as TimerList

const patchTimer = (ctx: Ctx, cookie: string, id: number, body: unknown) =>
  call(ctx.app, cookie, 'PATCH', `/api/timers/${id}`, body)

describe('sections', () => {
  it('requires a logged-in user on every route', async () => {
    const ctx = setup()
    for (const [method, path] of [
      ['POST', '/api/sections'],
      ['PATCH', '/api/sections/1'],
      ['DELETE', '/api/sections/1'],
    ] as const) {
      expect((await call(ctx.app, '', method, path, {})).status, `${method} ${path}`).toBe(401)
    }
  })

  it('creates a section, and the list response then includes it', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { res, section } = await createSection(ctx, cookie, '  House ')
    expect(res.status).toBe(201)
    expect(section).toEqual({ id: expect.any(Number), name: 'House' })
    expect((await list(ctx, cookie)).sections).toEqual([section])
  })

  it('rejects a name that differs from an existing one only in case', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    await createSection(ctx, cookie, 'House')
    expect((await createSection(ctx, cookie, 'house')).res.status).toBe(422)
  })

  it('rejects an empty or too-long name', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    expect((await createSection(ctx, cookie, '   ')).res.status).toBe(422)
    expect((await createSection(ctx, cookie, 'x'.repeat(61))).res.status).toBe(422)
  })

  it('rejects the 21st section', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (let i = 1; i <= 20; i++) {
      expect((await createSection(ctx, cookie, `Section ${i}`)).res.status).toBe(201)
    }
    expect((await createSection(ctx, cookie, 'One more')).res.status).toBe(422)
  })

  it('renames a section, including a change of case only', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    const res = await call(ctx.app, cookie, 'PATCH', `/api/sections/${section.id}`, {
      name: 'HOUSE',
    })
    expect(res.status).toBe(200)
    expect((await list(ctx, cookie)).sections).toEqual([{ id: section.id, name: 'HOUSE' }])
  })

  it('answers 404 for another user’s section on rename and delete', async () => {
    const ctx = setup()
    const owner = await ctx.register('a@example.com')
    const other = await ctx.register('b@example.com')
    const { section } = await createSection(ctx, owner, 'House')
    const path = `/api/sections/${section.id}`
    expect((await call(ctx.app, other, 'PATCH', path, { name: 'Mine' })).status).toBe(404)
    expect((await call(ctx.app, other, 'DELETE', path)).status).toBe(404)
    expect((await list(ctx, owner)).sections).toHaveLength(1)
  })

  it('counts section writes toward a per-user write limit', async () => {
    const ctx = setup({ limits: { writesPerMinute: 2 } })
    const cookie = await ctx.register()
    expect((await createSection(ctx, cookie, 'A')).res.status).toBe(201)
    expect((await createSection(ctx, cookie, 'B')).res.status).toBe(201)
    expect((await createSection(ctx, cookie, 'C')).res.status).toBe(429)
  })

  it('removes a user’s sections when the user is deleted', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    await createTimer(ctx, cookie, { placement: { kind: 'custom', sectionId: section.id } })
    ctx.db.delete(users).run()
    expect(ctx.db.select({ n: count() }).from(sections).get()!.n).toBe(0)
    expect(ctx.db.select({ n: count() }).from(timers).get()!.n).toBe(0)
  })
})

describe('timer placement', () => {
  it('gives a new timer automatic placement by default', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie)
    expect(timer.placement).toEqual({ kind: 'auto' })
  })

  it('stores a placement given at creation', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie, {
      placement: { kind: 'cadence', cadence: 'weekly' },
    })
    expect(timer.placement).toEqual({ kind: 'cadence', cadence: 'weekly' })
  })

  it('stores a custom placement and reports it in the list', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    const { timer } = await createTimer(ctx, cookie)
    const res = await patchTimer(ctx, cookie, timer.id, {
      placement: { kind: 'custom', sectionId: section.id },
    })
    expect(res.status).toBe(200)
    expect((await list(ctx, cookie)).timers[0]!.placement).toEqual({
      kind: 'custom',
      sectionId: section.id,
    })
  })

  it('rejects a custom placement in another user’s section', async () => {
    const ctx = setup()
    const owner = await ctx.register('a@example.com')
    const other = await ctx.register('b@example.com')
    const { section } = await createSection(ctx, owner, 'House')
    const { timer } = await createTimer(ctx, other)
    const custom = { kind: 'custom', sectionId: section.id }
    expect((await patchTimer(ctx, other, timer.id, { placement: custom })).status).toBe(422)
    expect((await createTimer(ctx, other, { placement: custom })).res.status).toBe(422)
  })

  it('rejects a placement with an unknown shape', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { timer } = await createTimer(ctx, cookie)
    for (const placement of [null, 'auto', { kind: 'cadence', cadence: 'yearly' }, { kind: 'x' }]) {
      expect((await patchTimer(ctx, cookie, timer.id, { placement })).status).toBe(422)
    }
  })

  it('a cadence placement clears a custom section, and auto clears both', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    const { timer } = await createTimer(ctx, cookie, {
      placement: { kind: 'custom', sectionId: section.id },
    })
    await patchTimer(ctx, cookie, timer.id, { placement: { kind: 'cadence', cadence: 'daily' } })
    let row = ctx.db.select().from(timers).where(eq(timers.id, timer.id)).get()!
    expect([row.cadence, row.sectionId]).toEqual(['daily', null])
    await patchTimer(ctx, cookie, timer.id, { placement: { kind: 'auto' } })
    row = ctx.db.select().from(timers).where(eq(timers.id, timer.id)).get()!
    expect([row.cadence, row.sectionId]).toEqual([null, null])
  })

  it('keeps a custom placement when only the target changes (AE2)', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    const { timer } = await createTimer(ctx, cookie, {
      targetMs: 3 * DAY,
      placement: { kind: 'custom', sectionId: section.id },
    })
    const res = await patchTimer(ctx, cookie, timer.id, { targetMs: DAY })
    expect(((await res.json()) as TimerView).placement).toEqual({
      kind: 'custom',
      sectionId: section.id,
    })
  })

  it('returns timers to automatic placement when their section is deleted (AE3)', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    const { section } = await createSection(ctx, cookie, 'House')
    const custom = { kind: 'custom', sectionId: section.id }
    await createTimer(ctx, cookie, { name: 'Vacuum', placement: custom })
    await createTimer(ctx, cookie, { name: 'Dust', placement: custom })
    const res = await call(ctx.app, cookie, 'DELETE', `/api/sections/${section.id}`)
    expect(res.status).toBe(204)
    const body = await list(ctx, cookie)
    expect(body.sections).toEqual([])
    expect(body.timers.map((t) => [t.name, t.placement])).toEqual([
      ['Vacuum', { kind: 'auto' }],
      ['Dust', { kind: 'auto' }],
    ])
  })
})
