import { afterEach, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import type { Db } from '../../src/server/db/client.ts'
import { pushSubscriptions, sessions, users } from '../../src/server/db/schema.ts'
import { hashToken } from '../../src/server/auth/sessions.ts'
import { cookieFrom, creds, makeApp, ORIGIN, post } from './authHelpers.ts'

let db: Db | undefined
afterEach(() => db?.$client.close())

function setup(options: Parameters<typeof makeApp>[0] = {}) {
  const made = makeApp(options)
  db = made.db
  return made
}

const me = (app: ReturnType<typeof makeApp>['app'], cookie: string) =>
  app.request('/api/auth/me', { headers: { cookie } })

const sessionCount = (d: Db) => d.select({ n: count() }).from(sessions).get()!.n

describe('register and me', () => {
  it('creates the user, sets a session cookie, and /me returns the email', async () => {
    const { app } = setup()
    const res = await post(app, '/api/auth/register', creds('  New@Example.COM '))
    expect(res.status).toBe(201)
    const cookie = cookieFrom(res)
    expect(cookie).not.toBe('')
    const meRes = await me(app, cookie)
    expect(meRes.status).toBe(200)
    expect(((await meRes.json()) as { user: { email: string } }).user.email).toBe('new@example.com')
  })

  it('sets an HttpOnly, Secure, SameSite=Lax cookie for an https origin', async () => {
    const { app } = setup()
    const res = await post(app, '/api/auth/register', creds())
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('session='))!
    expect(raw).toContain('HttpOnly')
    expect(raw).toContain('Secure')
    expect(raw).toMatch(/SameSite=Lax/i)
  })

  it('omits Secure only when PUBLIC_ORIGIN is plain http (local dev)', async () => {
    const { app } = setup({ publicOrigin: 'http://localhost:5173' })
    const res = await post(app, '/api/auth/register', creds(), { origin: 'http://localhost:5173' })
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('session='))!
    expect(raw).not.toContain('Secure')
    expect(raw).toContain('HttpOnly')
  })

  it('returns 409 for an existing email in any letter case', async () => {
    const { app } = setup()
    await post(app, '/api/auth/register', creds('a@example.com'))
    const res = await post(app, '/api/auth/register', creds('A@EXAMPLE.com'))
    expect(res.status).toBe(409)
  })

  it('rejects a bad email and a password outside 8..256 characters', async () => {
    const { app } = setup()
    expect((await post(app, '/api/auth/register', creds('nope'))).status).toBe(400)
    expect((await post(app, '/api/auth/register', creds('b@example.com', 'short'))).status).toBe(400)
    expect((await post(app, '/api/auth/register', creds('c@example.com', 'x'.repeat(257)))).status).toBe(400)
    expect((await post(app, '/api/auth/register', creds('d@example.com', 'x'.repeat(256)))).status).toBe(201)
  })

  it('GET /me without a session returns 401', async () => {
    const { app } = setup()
    expect((await app.request('/api/auth/me')).status).toBe(401)
  })

  it('stores the SHA-256 hash of the session token, never the raw token', async () => {
    const { app, db: d } = setup()
    const res = await post(app, '/api/auth/register', creds())
    const token = cookieFrom(res).split('=')[1]!
    const rows = d.select().from(sessions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.idHash).toBe(hashToken(token))
    expect(rows[0]!.idHash).not.toBe(token)
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(20)
  })

  it('stores an argon2id password hash', async () => {
    const { app, db: d } = setup()
    await post(app, '/api/auth/register', creds())
    expect(d.select().from(users).get()!.passwordHash).toMatch(/^\$argon2id\$/)
  })
})

describe('login', () => {
  it('sets a new session, different from any earlier one', async () => {
    const { app } = setup()
    const first = cookieFrom(await post(app, '/api/auth/register', creds()))
    const loginRes = await post(app, '/api/auth/login', creds())
    expect(loginRes.status).toBe(200)
    const second = cookieFrom(loginRes)
    expect(second).not.toBe('')
    expect(second).not.toBe(first)
    expect((await me(app, second)).status).toBe(200)
  })

  it('returns the same 401 body for a wrong password and an unknown email', async () => {
    const { app } = setup()
    await post(app, '/api/auth/register', creds())
    const wrong = await post(app, '/api/auth/login', creds('a@example.com', 'wrong password'))
    const unknown = await post(app, '/api/auth/login', creds('nobody@example.com', 'whatever123'))
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.text()).toBe(await unknown.text())
  })

  it('fails like a wrong password for a user with a null password hash', async () => {
    const { app, db: d } = setup()
    d.insert(users).values({ email: 'demo-1@demo.invalid', isDemo: true, createdAt: 1 }).run()
    const demo = await post(app, '/api/auth/login', creds('demo-1@demo.invalid', 'anything123'))
    const unknown = await post(app, '/api/auth/login', creds('nobody@example.com', 'anything123'))
    expect(demo.status).toBe(401)
    expect(await demo.text()).toBe(await unknown.text())
  })
})

describe('logout', () => {
  it('deletes the session row, and the old cookie then gets 401', async () => {
    const { app, db: d } = setup()
    const cookie = cookieFrom(await post(app, '/api/auth/register', creds()))
    expect(sessionCount(d)).toBe(1)
    const res = await post(app, '/api/auth/logout', undefined, { cookie })
    expect(res.status).toBe(200)
    expect(sessionCount(d)).toBe(0)
    expect((await me(app, cookie)).status).toBe(401)
  })

  it('deletes the push subscription for that endpoint and the current user only', async () => {
    const { app, db: d } = setup()
    const cookie = cookieFrom(await post(app, '/api/auth/register', creds()))
    const other = d.insert(users).values({ email: 'o@example.com', passwordHash: 'x', createdAt: 1 }).returning().get()
    const mine = d.select().from(users).where(eq(users.email, 'a@example.com')).get()!
    d.insert(pushSubscriptions)
      .values([
        { endpoint: 'e-mine', userId: mine.id, p256dh: 'p', auth: 'a', createdAt: 1 },
        { endpoint: 'e-other', userId: other.id, p256dh: 'p', auth: 'a', createdAt: 1 },
      ])
      .run()
    await post(app, '/api/auth/logout', { endpoint: 'e-other' }, { cookie })
    expect(d.select().from(pushSubscriptions).all().map((r) => r.endpoint)).toEqual(['e-mine', 'e-other'])
    const cookie2 = cookieFrom(await post(app, '/api/auth/login', creds()))
    await post(app, '/api/auth/logout', { endpoint: 'e-mine' }, { cookie: cookie2 })
    expect(d.select().from(pushSubscriptions).all().map((r) => r.endpoint)).toEqual(['e-other'])
  })
})

describe('session lifetime', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('treats an expired session as 401', async () => {
    const { app, db: d } = setup()
    const cookie = cookieFrom(await post(app, '/api/auth/register', creds()))
    d.update(sessions).set({ expiresAt: Date.now() - 1000 }).run()
    expect((await me(app, cookie)).status).toBe(401)
  })

  it('renews a session with 10 days left to 30 days and refreshes the cookie', async () => {
    const { app, db: d } = setup()
    const cookie = cookieFrom(await post(app, '/api/auth/register', creds()))
    d.update(sessions).set({ expiresAt: Date.now() + 10 * DAY }).run()
    const res = await me(app, cookie)
    expect(res.status).toBe(200)
    expect(d.select().from(sessions).get()!.expiresAt).toBeGreaterThan(Date.now() + 29.9 * DAY)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('session='))).toBe(true)
  })

  it('does not renew a session with 20 days left', async () => {
    const { app, db: d } = setup()
    const cookie = cookieFrom(await post(app, '/api/auth/register', creds()))
    const target = Date.now() + 20 * DAY
    d.update(sessions).set({ expiresAt: target }).run()
    await me(app, cookie)
    expect(d.select().from(sessions).get()!.expiresAt).toBe(target)
  })
})

describe('csrf and headers', () => {
  it('rejects a bodyless POST with a foreign Origin', async () => {
    const { app } = setup()
    const res = await post(app, '/api/auth/logout', undefined, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('rejects a form-encoded POST with a foreign Origin', async () => {
    const { app } = setup()
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40example.com&password=correct+horse',
    })
    expect(res.status).toBe(403)
  })

  it('accepts a POST whose Origin equals PUBLIC_ORIGIN on a plain-http request URL', async () => {
    const { app } = setup()
    const res = await app.request('http://localhost/api/auth/logout', { method: 'POST', headers: { origin: ORIGIN } })
    expect(res.status).toBe(200)
  })

  it('adds secure headers on /api responses', async () => {
    const { app } = setup()
    const res = await app.request('/api/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('account cap', () => {
  it('returns 403 "Registration is full" at the cap; demo users do not count', async () => {
    const { app, db: d } = setup({ maxRealAccounts: 3 })
    d.insert(users)
      .values([
        { email: 'r1@example.com', passwordHash: 'x', createdAt: 1 },
        { email: 'r2@example.com', passwordHash: 'x', createdAt: 1 },
        ...[1, 2, 3, 4, 5].map((n) => ({ email: `demo-${n}@demo.invalid`, isDemo: true, createdAt: 1 })),
      ])
      .run()
    expect((await post(app, '/api/auth/register', creds('r3@example.com'))).status).toBe(201)
    const full = await post(app, '/api/auth/register', creds('r4@example.com'))
    expect(full.status).toBe(403)
    expect(((await full.json()) as { error: string }).error).toBe('Registration is full')
  })

  it('defaults the cap to 1,000 real accounts', async () => {
    const { app, db: d } = setup()
    d.insert(users)
      .values(Array.from({ length: 1000 }, (_, n) => ({ email: `u${n}@example.com`, passwordHash: 'x', createdAt: 1 })))
      .run()
    expect((await post(app, '/api/auth/register', creds('late@example.com'))).status).toBe(403)
  })
})
