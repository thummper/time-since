import { createApp, type AppOptions } from '../../src/server/app.ts'
import { openDb, type Db } from '../../src/server/db/client.ts'

export const ORIGIN = 'https://app.example.com'

export function makeApp(options: AppOptions = {}) {
  const db: Db = options.db ?? openDb(':memory:')
  const app = createApp({ publicOrigin: ORIGIN, ...options, db })
  return { app, db }
}

type App = ReturnType<typeof makeApp>['app']

export function post(
  app: App,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  env?: unknown,
) {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
  return app.request(path, init, env)
}

/** Returns the "session=value" pair from a response, ready for a Cookie header. */
export function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('session='))
  return raw ? raw.split(';')[0]! : ''
}

export const creds = (email = 'a@example.com', password = 'correct horse') => ({ email, password })
