import type { Context, MiddlewareHandler } from 'hono'
import { MemoryStore, rateLimiter } from 'hono-rate-limiter'
import { getClientIp } from './clientIp.ts'

export interface LimitSettings {
  registerPerHour: number
  loginPerWindow: number
}

export const DEFAULT_LIMITS: LimitSettings = { registerPerHour: 5, loginPerWindow: 10 }

const HOUR_MS = 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000

/** Raises every limit by a factor, for the e2e run (RATE_LIMIT_RELAXED). */
export function relaxLimits(limits: LimitSettings, factor = 1000): LimitSettings {
  return { registerPerHour: limits.registerPerHour * factor, loginPerWindow: limits.loginPerWindow * factor }
}

async function readEmail(c: Context): Promise<string | null> {
  try {
    const raw = c.req.raw.clone()
    const type = raw.headers.get('content-type') ?? ''
    let email: unknown
    if (type.includes('application/json')) email = ((await raw.json()) as { email?: unknown } | null)?.email
    else if (type.includes('form')) email = (await raw.formData()).get('email')
    return typeof email === 'string' ? email.trim().toLowerCase() : null
  } catch {
    return null
  }
}

function limiter(
  windowMs: number,
  limit: number,
  keyGenerator: (c: Context) => string | Promise<string>,
): MiddlewareHandler {
  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    keyGenerator,
    store: new MemoryStore(),
    handler: (c) => c.json({ error: 'Too many requests. Try again later.' }, 429),
  })
}

export function registerLimiter(limits: LimitSettings): MiddlewareHandler {
  return limiter(HOUR_MS, limits.registerPerHour, (c) => `register:${getClientIp(c)}`)
}

/** Two limiters: one per IP, one per email, both counting every attempt. */
export function loginLimiters(limits: LimitSettings): MiddlewareHandler[] {
  return [
    limiter(LOGIN_WINDOW_MS, limits.loginPerWindow, (c) => `login-ip:${getClientIp(c)}`),
    limiter(LOGIN_WINDOW_MS, limits.loginPerWindow, async (c) => {
      const email = await readEmail(c)
      return email ? `login-email:${email}` : `login-noemail:${getClientIp(c)}`
    }),
  ]
}
