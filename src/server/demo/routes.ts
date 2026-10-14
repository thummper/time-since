import { randomBytes } from 'node:crypto'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { setSessionCookie, type AuthEnv, type CookieSettings } from '../auth/middleware.ts'
import { createSession } from '../auth/sessions.ts'
import { demoLimiter, type LimitSettings } from '../security/rateLimit.ts'
import { seedDemoTimers } from './seed.ts'

export const MAX_DEMO_USERS = 500

export interface DemoRouteOptions {
  db: Db
  cookie: CookieSettings
  limits: LimitSettings
  now: () => number
  maxDemoUsers: number
}

export function demoRoutes({
  db,
  cookie,
  limits,
  now,
  maxDemoUsers,
}: DemoRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()

  routes.post('/', demoLimiter(limits), (c) => {
    const at = now()
    const user = db.transaction((tx) => {
      const live = tx.select({ n: count() }).from(users).where(eq(users.isDemo, true)).get()!.n
      const excess = live - maxDemoUsers + 1
      if (excess > 0) {
        const oldest = tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.isDemo, true))
          .orderBy(asc(users.createdAt), asc(users.id))
          .limit(excess)
          .all()
        tx.delete(users)
          .where(
            inArray(
              users.id,
              oldest.map((u) => u.id),
            ),
          )
          .run()
      }
      const created = tx
        .insert(users)
        .values({
          email: `demo-${randomBytes(12).toString('hex')}@demo.invalid`,
          passwordHash: null,
          isDemo: true,
          createdAt: at,
        })
        .returning()
        .get()
      seedDemoTimers(tx, created.id, at)
      return created
    })
    const session = createSession(db, user.id)
    setSessionCookie(c, cookie, session.token, session.expiresAt)
    return c.json({ user: { id: user.id, email: user.email, isDemo: true } }, 201)
  })

  return routes
}
