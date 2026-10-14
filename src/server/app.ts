import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { authMiddleware, type AuthEnv } from './auth/middleware.ts'
import { authRoutes } from './auth/routes.ts'
import { demoRoutes, MAX_DEMO_USERS } from './demo/routes.ts'
import { openDb, type Db } from './db/client.ts'
import { pushRoutes } from './push/routes.ts'
import { DEFAULT_LIMITS, type LimitSettings } from './security/rateLimit.ts'
import { timerRoutes } from './timers/routes.ts'

export interface AppOptions {
  /** Directory holding the built client. */
  clientDir?: string
  /** Database handle. Defaults to a fresh in-memory database. */
  db?: Db
  /**
   * The one origin the app is served from (PUBLIC_ORIGIN). CSRF checks compare
   * against it, never against the request URL. The session cookie is Secure
   * when it is https, and not Secure when it is plain http (local development).
   */
  publicOrigin?: string
  /** Overrides for the default rate limits. */
  limits?: Partial<LimitSettings>
  /** Server clock in epoch ms. Tests inject a fake one. */
  now?: () => number
  /** VAPID public key served to clients (KTD11). Push routes answer 503 without it. */
  vapidPublicKey?: string
  /** Cap on non-demo accounts (R5). */
  maxRealAccounts?: number
  /** Cap on live demo sandboxes (R7). */
  maxDemoUsers?: number
}

export const MAX_REAL_ACCOUNTS = 1000

const IMMUTABLE = 'public, max-age=31536000, immutable'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    if (!(await stat(path)).isFile()) return null
    return await readFile(path)
  } catch {
    return null
  }
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return ''
  }
}

export function createApp(options: AppOptions = {}): Hono<AuthEnv> {
  const clientDir = resolve(options.clientDir ?? join(process.cwd(), 'dist', 'client'))
  const db = options.db ?? openDb(':memory:')
  const publicOrigin = options.publicOrigin ?? 'http://localhost:5173'
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const cookie = { secure: publicOrigin.startsWith('https://') }
  const now = options.now ?? Date.now
  const app = new Hono<AuthEnv>()

  app.use('/api/*', csrf({ origin: publicOrigin }), secureHeaders())
  app.use('/api/*', authMiddleware(db, cookie))
  app.route(
    '/api/auth',
    authRoutes({
      db,
      cookie,
      limits,
      maxRealAccounts: options.maxRealAccounts ?? MAX_REAL_ACCOUNTS,
    }),
  )

  app.route(
    '/api/demo',
    demoRoutes({
      db,
      cookie,
      limits,
      now,
      maxDemoUsers: options.maxDemoUsers ?? MAX_DEMO_USERS,
    }),
  )

  app.route('/api/timers', timerRoutes({ db, limits, now }))

  app.route('/api/push', pushRoutes({ db, vapidPublicKey: options.vapidPublicKey, limits, now }))

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  app.get('*', async (c) => {
    const relative = normalize(safeDecode(c.req.path)).replace(/^[/\\]+/, '')
    const candidate = resolve(clientDir, relative)
    if (relative && (candidate === clientDir || candidate.startsWith(clientDir + sep))) {
      const file = await readFileIfExists(candidate)
      if (file) {
        const type = MIME[extname(candidate)] ?? 'application/octet-stream'
        // Hashed build output never changes; the worker, manifest, and shell must revalidate.
        const cache = /^assets[/\\]/.test(relative) ? IMMUTABLE : 'no-cache'
        return new Response(new Uint8Array(file), {
          headers: { 'content-type': type, 'cache-control': cache },
        })
      }
    }
    const shell = await readFileIfExists(join(clientDir, 'index.html'))
    if (!shell) return c.text('Client build not found', 404)
    c.header('cache-control', 'no-cache')
    return c.html(shell.toString('utf-8'))
  })

  return app
}
