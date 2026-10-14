import { afterEach } from 'vitest'
import type { Db } from '../../src/server/db/client.ts'
import { cookieFrom, creds, makeApp, ORIGIN, post } from './authHelpers.ts'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const T0 = Date.UTC(2026, 0, 1)

type App = ReturnType<typeof makeApp>['app']

export interface Ctx {
  app: App
  db: Db
  /** The fake server clock. Set `clock.now` to move time. */
  clock: { now: number }
  register: (email?: string) => Promise<string>
}

/** Sets up an app with a fake clock; closes the database after each test. */
export function useApp() {
  let db: Db | undefined
  afterEach(() => db?.$client.close())
  return (options: Parameters<typeof makeApp>[0] = {}): Ctx => {
    const clock = { now: T0 }
    const made = makeApp({ now: () => clock.now, limits: { writesPerMinute: 100_000 }, ...options })
    db = made.db
    return {
      ...made,
      clock,
      register: async (email = 'a@example.com') =>
        cookieFrom(await post(made.app, '/api/auth/register', creds(email))),
    }
  }
}

export function call(app: App, cookie: string, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie,
      ...(method === 'GET' ? {} : { origin: ORIGIN }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  })
}
