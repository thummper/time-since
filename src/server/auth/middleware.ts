import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Db } from '../db/client.ts'
import type { User } from '../db/schema.ts'
import { resolveSession, SESSION_LIFETIME_MS } from './sessions.ts'

export const SESSION_COOKIE = 'session'

/** Context variables set by the auth middleware. */
export type AuthEnv = { Variables: { user: User | null } }

export interface CookieSettings {
  /**
   * The Secure flag. It is on whenever PUBLIC_ORIGIN is https. It is off only
   * for a plain-http PUBLIC_ORIGIN (local development), where browsers would
   * otherwise drop the cookie.
   */
  secure: boolean
}

export function setSessionCookie(c: Context, cookie: CookieSettings, token: string, expiresAt: number): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(c: Context, cookie: CookieSettings): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: cookie.secure })
}

/** Resolves the session cookie into `c.var.user` (null when absent or invalid). */
export function authMiddleware(db: Db, cookie: CookieSettings): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    const resolved = token ? resolveSession(db, token) : null
    c.set('user', resolved?.user ?? null)
    if (token && resolved?.renewedExpiresAt) setSessionCookie(c, cookie, token, resolved.renewedExpiresAt)
    await next()
  }
}

/** Rejects requests without a logged-in user. Use after `authMiddleware`. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ error: 'Not logged in' }, 401)
  await next()
}
