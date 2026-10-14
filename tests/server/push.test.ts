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
    expect((await subscribe(ctx, cookie, 'https://fcm.googleapis.com/p/1')).status).toBe(201)
    await subscribe(ctx, cookie, 'https://fcm.googleapis.com/p/1')
    expect(rows(ctx)).toHaveLength(1)
  })

  it('rejects an invalid subscription', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (const body of [
      {},
      { endpoint: 'x' },
      { endpoint: 'http://p/1', keys: { p256dh: 'a', auth: 'b' } },
      { endpoint: 'https://fcm.googleapis.com/p/1', keys: {} },
    ]) {
      expect((await call(ctx.app, cookie, 'POST', '/api/push/subscribe', body)).status).toBe(422)
    }
  })

  it('moves an endpoint owned by user A to user B on subscribe', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://fcm.googleapis.com/p/1')
    const before = rows(ctx)[0]!.userId
    await subscribe(ctx, b, 'https://fcm.googleapis.com/p/1')
    expect(rows(ctx)).toHaveLength(1)
    expect(rows(ctx)[0]!.userId).not.toBe(before)
  })

  it('unsubscribe deletes only the current user row', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://fcm.googleapis.com/p/1')
    await call(ctx.app, b, 'POST', '/api/push/unsubscribe', {
      endpoint: 'https://fcm.googleapis.com/p/1',
    })
    expect(rows(ctx)).toHaveLength(1)
    await call(ctx.app, a, 'POST', '/api/push/unsubscribe', {
      endpoint: 'https://fcm.googleapis.com/p/1',
    })
    expect(rows(ctx)).toHaveLength(0)
  })

  it('resubscribe replaces the old endpoint, only when the user owns it', async () => {
    const ctx = setup()
    const a = await ctx.register('a@example.com')
    const b = await ctx.register('b@example.com')
    await subscribe(ctx, a, 'https://fcm.googleapis.com/p/old')
    const userOfOld = rows(ctx)[0]!.userId
    const body = {
      oldEndpoint: 'https://fcm.googleapis.com/p/old',
      subscription: sub('https://fcm.googleapis.com/p/new'),
    }

    await call(ctx.app, b, 'POST', '/api/push/resubscribe', body)
    expect(rows(ctx).find((r) => r.endpoint === 'https://fcm.googleapis.com/p/old')?.userId).toBe(
      userOfOld,
    )

    await call(ctx.app, a, 'POST', '/api/push/resubscribe', body)
    expect(rows(ctx).map((r) => r.endpoint)).toEqual(['https://fcm.googleapis.com/p/new'])
    expect(rows(ctx)[0]!.userId).toBe(userOfOld)
  })

  it('forbids subscribe and resubscribe for a demo user', async () => {
    const ctx = setup()
    const res = await post(ctx.app, '/api/demo')
    const cookie = res.headers.getSetCookie()[0]!.split(';')[0]!
    for (const [path, body] of [
      ['/api/push/subscribe', sub('https://fcm.googleapis.com/p/1')],
      [
        '/api/push/resubscribe',
        {
          oldEndpoint: 'https://fcm.googleapis.com/p/0',
          subscription: sub('https://fcm.googleapis.com/p/1'),
        },
      ],
    ] as const) {
      expect((await call(ctx.app, cookie, 'POST', path, body)).status, path).toBe(403)
    }
    expect(rows(ctx)).toHaveLength(0)
  })

  it('logout deletes the endpoint row for the current user', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    await subscribe(ctx, cookie, 'https://fcm.googleapis.com/p/1')
    await call(ctx.app, cookie, 'POST', '/api/auth/logout', {
      endpoint: 'https://fcm.googleapis.com/p/1',
    })
    expect(
      ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, 'https://fcm.googleapis.com/p/1'))
        .all(),
    ).toHaveLength(0)
  })

  it('accepts endpoints on the known push services', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://db5p.notify.windows.com/?token=abc',
      'https://web.push.apple.com/abc',
      'https://api.push.apple.com/3/device/abc',
    ]) {
      expect((await subscribe(ctx, cookie, endpoint)).status, endpoint).toBe(201)
    }
  })

  it('rejects endpoints on other hosts, IPs, localhost and look-alikes', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (const endpoint of [
      'https://example.com/push',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/push',
      'https://localhost/push',
      'https://localhost:3000/push',
      'https://fcm.googleapis.com.evil.example/push',
      'https://evilfcm.googleapis.com/push',
      'https://evil.example/?x=fcm.googleapis.com',
      'https://fcm.googleapis.com@evil.example/push',
      'https://push.services.mozilla.com/push',
      'http://fcm.googleapis.com/push',
      'not a url',
    ]) {
      expect((await subscribe(ctx, cookie, endpoint)).status, endpoint).toBe(422)
    }
    expect(rows(ctx)).toHaveLength(0)
  })

  it('caps subscriptions per user at 10 but still updates an existing endpoint', async () => {
    const ctx = setup()
    const cookie = await ctx.register()
    for (let i = 0; i < 10; i++) {
      expect((await subscribe(ctx, cookie, `https://fcm.googleapis.com/c/${i}`)).status).toBe(201)
    }
    expect((await subscribe(ctx, cookie, 'https://fcm.googleapis.com/c/10')).status).toBe(422)
    expect(rows(ctx)).toHaveLength(10)
    expect((await subscribe(ctx, cookie, 'https://fcm.googleapis.com/c/3')).status).toBe(201)
    const resubscribe = (oldEndpoint: string, endpoint: string) =>
      call(ctx.app, cookie, 'POST', '/api/push/resubscribe', {
        oldEndpoint,
        subscription: sub(endpoint),
      })
    expect(
      (await resubscribe('https://fcm.googleapis.com/c/3', 'https://fcm.googleapis.com/n')).status,
    ).toBe(201)
    expect(rows(ctx)).toHaveLength(10)
    expect(
      (await resubscribe('https://fcm.googleapis.com/missing', 'https://fcm.googleapis.com/x'))
        .status,
    ).toBe(422)
    expect(rows(ctx)).toHaveLength(10)
    const other = await ctx.register('b@example.com')
    expect((await subscribe(ctx, other, 'https://fcm.googleapis.com/o/1')).status).toBe(201)
  })

  it('rate limits subscribe and resubscribe per user', async () => {
    const ctx = setup({ limits: { writesPerMinute: 2 } })
    const cookie = await ctx.register()
    expect((await subscribe(ctx, cookie, 'https://fcm.googleapis.com/r/1')).status).toBe(201)
    expect(
      (
        await call(ctx.app, cookie, 'POST', '/api/push/resubscribe', {
          oldEndpoint: 'https://fcm.googleapis.com/r/1',
          subscription: sub('https://fcm.googleapis.com/r/2'),
        })
      ).status,
    ).toBe(201)
    expect((await subscribe(ctx, cookie, 'https://fcm.googleapis.com/r/3')).status).toBe(429)
    const other = await ctx.register('b@example.com')
    expect((await subscribe(ctx, other, 'https://fcm.googleapis.com/r/4')).status).toBe(201)
  })
})
