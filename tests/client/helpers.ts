import { vi } from 'vitest'
import type { ResetView, TimerView } from '../../src/shared/types.ts'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const T0 = Date.UTC(2026, 5, 1, 12, 0, 0)

export function timerView(overrides: Partial<TimerView> & { id: number }): TimerView {
  return {
    name: `Timer ${overrides.id}`,
    targetMs: null,
    createdAt: T0 - 30 * DAY,
    lastReset: { id: overrides.id * 10, at: T0 - DAY },
    overdue: false,
    stats: { averageGapMs: null, longestGapMs: null, resetCount: 0 },
    ...overrides,
  }
}

export function resetView(overrides: Partial<ResetView> & { id: number }): ResetView {
  return { at: T0 - DAY, note: null, isOrigin: false, ...overrides }
}

export type Reply = [status: number, body?: unknown]
type Handler = (match: RegExpMatchArray, body: Record<string, unknown>) => Reply | Promise<Reply>
export type Route = [method: string, path: RegExp, handler: Handler]

export interface Call {
  method: string
  path: string
  body: Record<string, unknown>
}

/** The route for `GET /api/timers`. */
export function listRoute(...timers: TimerView[]): Route {
  return ['GET', /^\/api\/timers$/, () => [200, { now: T0, timers }]]
}

/** Replaces `fetch` with a router over `routes`. Unmatched requests answer 500. */
export function installFetch(routes: Route[]) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    calls.push({ method, path, body })
    for (const [routeMethod, pattern, handler] of routes) {
      const match = routeMethod === method ? path.match(pattern) : null
      if (match) {
        const [status, payload] = await handler(match, body)
        return new Response(payload === undefined ? null : JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    return new Response(JSON.stringify({ error: `unrouted ${method} ${path}` }), { status: 500 })
  })
  vi.stubGlobal('fetch', fn)
  return {
    fn,
    calls,
    count: (method: string, pattern: RegExp) =>
      calls.filter((c) => c.method === method && pattern.test(c.path)).length,
  }
}
