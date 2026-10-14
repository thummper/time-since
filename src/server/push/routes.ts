import { and, count, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import { pushSubscriptions } from '../db/schema.ts'
import { forbidDemo, requireUser, type AuthEnv } from '../auth/middleware.ts'
import { readJson } from '../http.ts'
import { MINUTE_MS } from '../../shared/limits.ts'
import { limiter, type LimitSettings } from '../security/rateLimit.ts'
import { removeOwnedSubscription } from './subscriptions.ts'

export interface PushRouteOptions {
  db: Db
  vapidPublicKey?: string
  limits: LimitSettings
  now: () => number
}

/** Most push subscriptions one user may hold. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10

const PUSH_HOSTS = ['fcm.googleapis.com', 'web.push.apple.com']
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com']

/** True for the hosts of the known browser push services. */
function isPushHost(hostname: string): boolean {
  return PUSH_HOSTS.includes(hostname) || PUSH_HOST_SUFFIXES.some((s) => hostname.endsWith(s))
}

function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && isPushHost(url.hostname)
  } catch {
    return false
  }
}

const MAX_FIELD = 2048

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD ? value : null

interface ParsedSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/** Parses the browser PushSubscription JSON: `{ endpoint, keys: { p256dh, auth } }`. */
function parseSubscription(value: unknown): ParsedSubscription | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = text(raw.endpoint)
  const p256dh = text(raw.keys?.p256dh)
  const auth = text(raw.keys?.auth)
  if (!endpoint || !p256dh || !auth || !isPushEndpoint(endpoint)) return null
  return { endpoint, p256dh, auth }
}

export function pushRoutes({ db, vapidPublicKey, limits, now }: PushRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()
  routes.use('*', requireUser)
  const writeLimiter = limiter<AuthEnv>(
    MINUTE_MS,
    limits.writesPerMinute,
    (c) => `push-write:${c.var.user!.id}`,
    'Too many changes. Try again in a minute.',
  )

  /** True when `userId` is at the cap and `endpoint` would add a new row. */
  const overCap = (endpoint: string, userId: number): boolean => {
    const owned = db
      .select({ n: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .get()!.n
    if (owned < MAX_SUBSCRIPTIONS_PER_USER) return false
    const existing = db
      .select({ n: count() })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
      .get()!.n
    return existing === 0
  }
  const tooMany = (c: Context<AuthEnv>) =>
    c.json({ error: 'Too many push subscriptions. Remove one first.' }, 422)

  /** Upserts by endpoint and gives the row to `userId`. */
  const upsert = (sub: ParsedSubscription, userId: number): void => {
    db.insert(pushSubscriptions)
      .values({ ...sub, userId, createdAt: now() })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.p256dh, auth: sub.auth },
      })
      .run()
  }

  routes.get('/key', (c) =>
    vapidPublicKey
      ? c.json({ publicKey: vapidPublicKey })
      : c.json({ error: 'Push is not configured' }, 503),
  )

  routes.post('/subscribe', forbidDemo, writeLimiter, async (c) => {
    const sub = parseSubscription(await readJson(c))
    if (!sub) return c.json({ error: 'Invalid subscription' }, 422)
    const userId = c.var.user!.id
    if (overCap(sub.endpoint, userId)) return tooMany(c)
    upsert(sub, userId)
    return c.json({ ok: true }, 201)
  })

  routes.post('/unsubscribe', async (c) => {
    const endpoint = text((await readJson(c)).endpoint)
    if (!endpoint) return c.json({ error: 'Invalid endpoint' }, 422)
    removeOwnedSubscription(db, endpoint, c.var.user!.id)
    return c.json({ ok: true })
  })

  routes.post('/resubscribe', forbidDemo, writeLimiter, async (c) => {
    const body = await readJson(c)
    const sub = parseSubscription(body.subscription)
    const oldEndpoint = text(body.oldEndpoint)
    if (!sub || !oldEndpoint) return c.json({ error: 'Invalid subscription' }, 422)
    const userId = c.var.user!.id
    const stored = db.transaction(() => {
      removeOwnedSubscription(db, oldEndpoint, userId)
      if (overCap(sub.endpoint, userId)) return false
      upsert(sub, userId)
      return true
    })
    if (!stored) return tooMany(c)
    return c.json({ ok: true }, 201)
  })

  return routes
}
