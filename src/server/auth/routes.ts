import { and, count, eq } from 'drizzle-orm'
import { Hono, type MiddlewareHandler } from 'hono'
import type { Db } from '../db/client.ts'
import { pushSubscriptions, users } from '../db/schema.ts'
import { loginLimiters, registerLimiter, type LimitSettings } from '../security/rateLimit.ts'
import { getCookie } from 'hono/cookie'
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
  type AuthEnv,
  type CookieSettings,
} from './middleware.ts'
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from './passwords.ts'
import { createSession, deleteSession } from './sessions.ts'

export interface AuthRouteOptions {
  db: Db
  cookie: CookieSettings
  limits: LimitSettings
  maxRealAccounts: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENERIC_LOGIN_ERROR = 'Invalid email or password'

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function authRoutes({ db, cookie, limits, maxRealAccounts }: AuthRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()

  routes.post('/register', registerLimiter(limits), async (c) => {
    const body = await readJson(c)
    const email = normalizeEmail(body.email)
    const password = body.password
    if (!email) return c.json({ error: 'Enter a valid email address' }, 400)
    if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return c.json({ error: `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` }, 400)
    }
    const real = db.select({ n: count() }).from(users).where(eq(users.isDemo, false)).get()!.n
    if (real >= maxRealAccounts) return c.json({ error: 'Registration is full' }, 403)
    if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
      return c.json({ error: 'That email is already registered' }, 409)
    }
    const passwordHash = await hashPassword(password)
    let user
    try {
      user = db.insert(users).values({ email, passwordHash, createdAt: Date.now() }).returning().get()
    } catch {
      // A concurrent register with the same email won the unique index.
      return c.json({ error: 'That email is already registered' }, 409)
    }
    const session = createSession(db, user.id)
    setSessionCookie(c, cookie, session.token, session.expiresAt)
    return c.json({ user: { id: user.id, email: user.email } }, 201)
  })

  const [loginByIp, loginByEmail] = loginLimiters(limits) as [MiddlewareHandler, MiddlewareHandler]
  routes.post('/login', loginByIp, loginByEmail, async (c) => {
    const body = await readJson(c)
    const email = normalizeEmail(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    const user = email ? db.select().from(users).where(eq(users.email, email)).get() : undefined
    const ok = await verifyPassword(user?.passwordHash, password)
    if (!user || !ok) return c.json({ error: GENERIC_LOGIN_ERROR }, 401)
    const session = createSession(db, user.id)
    setSessionCookie(c, cookie, session.token, session.expiresAt)
    return c.json({ user: { id: user.id, email: user.email } })
  })

  routes.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    const user = c.var.user
    if (user) {
      const body = await readJson(c)
      if (typeof body.endpoint === 'string') {
        db.delete(pushSubscriptions)
          .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user.id)))
          .run()
      }
    }
    if (token) deleteSession(db, token)
    clearSessionCookie(c, cookie)
    return c.json({ ok: true })
  })

  routes.get('/me', (c) => {
    const user = c.var.user
    if (!user) return c.json({ error: 'Not logged in' }, 401)
    return c.json({ user: { id: user.id, email: user.email, isDemo: user.isDemo } })
  })

  return routes
}
