import type { Context, Env, MiddlewareHandler } from 'hono'
import { MemoryStore, rateLimiter } from 'hono-rate-limiter'
import { HOUR_MS, MINUTE_MS } from '../../shared/limits.ts'
import { getClientIp } from './clientIp.ts'

export interface LimitSettings {
  registerPerHour: number
  loginPerWindow: number
  /** Demo sandboxes created per IP per hour (R7). */
  demoPerHour: number
  /** Timer and reset writes per user per minute (R5). */
  writesPerMinute: number
}

export const DEFAULT_LIMITS: LimitSettings = {
  registerPerHour: 5,
  loginPerWindow: 10,
  demoPerHour: 10,
  writesPerMinute: 60,
}

const LOGIN_WINDOW_MS = 15 * MINUTE_MS

/** Raises every limit by a factor, for the e2e run (RATE_LIMIT_RELAXED). */
export function relaxLimits(limits: LimitSettings, factor = 1000): LimitSettings {
  return {
    registerPerHour: limits.registerPerHour * factor,
    loginPerWindow: limits.loginPerWindow * factor,
    demoPerHour: limits.demoPerHour * factor,
    writesPerMinute: limits.writesPerMinute * factor,
  }
}

async function readEmail(c: Context): Promise<string | null> {
  try {
    const raw = c.req.raw.clone()
    const type = raw.headers.get('content-type') ?? ''
    let email: unknown
    if (type.includes('application/json'))
      email = ((await raw.json()) as { email?: unknown } | null)?.email
    else if (type.includes('form')) email = (await raw.formData()).get('email')
    return typeof email === 'string' ? email.trim().toLowerCase() : null
  } catch {
    return null
  }
}

/** A fixed-window limiter that answers 429 with `{ error: message }`. */
export function limiter<E extends Env = Env>(
  windowMs: number,
  limit: number,
  keyGenerator: (c: Context<E>) => string | Promise<string>,
  message = 'Too many requests. Try again later.',
): MiddlewareHandler<E> {
  return rateLimiter<E>({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    keyGenerator,
    store: new MemoryStore(),
    handler: (c) => c.json({ error: message }, 429),
  })
}

export function registerLimiter(limits: LimitSettings): MiddlewareHandler {
  return limiter(HOUR_MS, limits.registerPerHour, (c) => `register:${getClientIp(c)}`)
}

export function demoLimiter(limits: LimitSettings): MiddlewareHandler {
  return limiter(HOUR_MS, limits.demoPerHour, (c) => `demo:${getClientIp(c)}`)
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
