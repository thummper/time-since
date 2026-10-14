import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { Db } from '../db/client.ts'
import { pushSubscriptions } from '../db/schema.ts'
import { forbidDemo, requireUser, type AuthEnv } from '../auth/middleware.ts'

export interface PushRouteOptions {
  db: Db
  vapidPublicKey?: string
  now: () => number
}

const MAX_FIELD = 2048

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

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
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://')) return null
  return { endpoint, p256dh, auth }
}

export function pushRoutes({ db, vapidPublicKey, now }: PushRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()
  routes.use('*', requireUser)

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
  const removeOwned = (endpoint: string, userId: number): void => {
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
      .run()
  }

  routes.get('/key', (c) =>
    vapidPublicKey
      ? c.json({ publicKey: vapidPublicKey })
      : c.json({ error: 'Push is not configured' }, 503),
  )

  routes.post('/subscribe', forbidDemo, async (c) => {
    const sub = parseSubscription(await readJson(c))
    if (!sub) return c.json({ error: 'Invalid subscription' }, 422)
    upsert(sub, c.var.user!.id)
    return c.json({ ok: true }, 201)
  })

  routes.post('/unsubscribe', async (c) => {
    const endpoint = text((await readJson(c)).endpoint)
    if (!endpoint) return c.json({ error: 'Invalid endpoint' }, 422)
    removeOwned(endpoint, c.var.user!.id)
    return c.json({ ok: true })
  })

  routes.post('/resubscribe', forbidDemo, async (c) => {
    const body = await readJson(c)
    const sub = parseSubscription(body.subscription)
    const oldEndpoint = text(body.oldEndpoint)
    if (!sub || !oldEndpoint) return c.json({ error: 'Invalid subscription' }, 422)
    const userId = c.var.user!.id
    db.transaction(() => {
      removeOwned(oldEndpoint, userId)
      upsert(sub, userId)
    })
    return c.json({ ok: true }, 201)
  })

  return routes
}
