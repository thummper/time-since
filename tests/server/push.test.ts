import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { pushSubscriptions } from '../../src/server/db/schema.ts'
import { post } from './authHelpers.ts'
import { call, useApp } from './timersHelpers.ts'

const setup = useApp()

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
})
const rows = (ctx: ReturnType<typeof setup>) => ctx.db.select().from(pushSubscriptions).all()
const subscribe = (ctx: ReturnType<typeof setup>, cookie: string, endpoint: string) =>
  call(ctx.app, cookie, 'POST', '/api/push/subscribe', sub(endpoint))

describe('push routes', () => {
  it('requires a logged-in user on every route', async () => {
    const ctx = setup({ vapidPublicKey: 'pub' })
    for (const [method, path] of [
      ['GET', '/api/push/key'],
      ['POST', '/api/push/subscribe'],
      ['POST', '/api/push/unsubscribe'],
      ['POST', '/api/push/resubscribe'],
    ] as const) {
      expect((await call(ctx.app, '', method, path, {})).status, path).toBe(401)
    }
  })

  it('returns the VAPID public key', async () => {
    const ctx = setup({ vapidPublicKey: 'pub-key' })
    const cookie = await ctx.register()
    const res = await call(ctx.app, cookie, 'GET', '/api/push/key')
    expect(await res.json()).toEqual({ publicKey: 'pub-key' })
  })

  it('answers 503 for the key when VAPID is not configured', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    expect((await call(ctx.app, cookie, 'GET', '/api/push/key')).status).toBe(503)
  })

  it('subscribes, and a repeat subscribe of the same endpoint keeps one row', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    expect((await subscribe(ctx, cookie, 'https://p/1')).status).toBe(201)
    await subscribe(ctx, cookie, 'https://p/1')
    expect(rows(ctx)).toHaveLength(1)
  })

  it('rejects an invalid subscription', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (const body of [
      {},
      { endpoint: 'x' },
      { endpoint: 'http://p/1', keys: { p256dh: 'a', auth: 'b' } },
      { endpoint: 'https://p/1', keys: {} },
    ]) {
      expect((await call(ctx.app, cookie, 'POST', '/api/push/subscribe', body)).status).toBe(422)
    }
  })

  it('moves an endpoint owned by user A to user B on subscribe', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://p/1')
    const before = rows(ctx)[0]!.userId
    await subscribe(ctx, b, 'https://p/1')
    expect(rows(ctx)).toHaveLength(1)
    expect(rows(ctx)[0]!.userId).not.toBe(before)
  })

  it('unsubscribe deletes only the current user row', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://p/1')
    await call(ctx.app, b, 'POST', '/api/push/unsubscribe', { endpoint: 'https://p/1' })
    expect(rows(ctx)).toHaveLength(1)
    await call(ctx.app, a, 'POST', '/api/push/unsubscribe', { endpoint: 'https://p/1' })
    expect(rows(ctx)).toHaveLength(0)
  })

  it('resubscribe replaces the old endpoint, only when the user owns it', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://p/old')
    const userOfOld = rows(ctx)[0]!.userId
    const body = { oldEndpoint: 'https://p/old', subscription: sub('https://p/new') }

    await call(ctx.app, b, 'POST', '/api/push/resubscribe', body)
    expect(rows(ctx).find((r) => r.endpoint === 'https://p/old')?.userId).toBe(userOfOld)

    await call(ctx.app, a, 'POST', '/api/push/resubscribe', body)
    expect(rows(ctx).map((r) => r.endpoint)).toEqual(['https://p/new'])
    expect(rows(ctx)[0]!.userId).toBe(userOfOld)
  })

  it('forbids subscribe and resubscribe for a demo user', async () => {
    const ctx = setup()
    const res = await post(ctx.app, '/api/demo')
    const cookie = res.headers.getSetCookie()[0]!.split(';')[0]!
    for (const [path, body] of [
      ['/api/push/subscribe', sub('https://p/1')],
      ['/api/push/resubscribe', { oldEndpoint: 'https://p/0', subscription: sub('https://p/1') }],
    ] as const) {
      expect((await call(ctx.app, cookie, 'POST', path, body)).status, path).toBe(403)
    }
    expect(rows(ctx)).toHaveLength(0)
  })

  it('logout deletes the endpoint row for the current user', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    await subscribe(ctx, cookie, 'https://p/1')
    await call(ctx.app, cookie, 'POST', '/api/auth/logout', { endpoint: 'https://p/1' })
    expect(
      ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, 'https://p/1'))
        .all(),
    ).toHaveLength(0)
  })
})
