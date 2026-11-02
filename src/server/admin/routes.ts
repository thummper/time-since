import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import type { User } from '../db/schema.ts'
import { requireAdmin, type AuthEnv } from '../auth/middleware.ts'
import { adminStats, type Caps } from './service.ts'

export interface AdminRouteOptions extends Caps {
  db: Db
  now: () => number
  isAdmin: (user: User) => boolean
}

/** Read-only usage counts for the accounts in ADMIN_EMAILS. No user data leaves here. */
export function adminRoutes({ db, now, isAdmin, ...caps }: AdminRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()
  routes.use('*', requireAdmin(isAdmin))
  routes.get('/stats', (c) => c.json(adminStats(db, now(), caps)))
  return routes
}
