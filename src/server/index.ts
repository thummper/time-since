import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { openDb } from './db/client.ts'
import { DEFAULT_LIMITS, relaxLimits } from './security/rateLimit.ts'

const port = Number(process.env.PORT ?? 3000)
const dbPath = process.env.DATABASE_PATH ?? 'data/time-since.db'
mkdirSync(dirname(dbPath), { recursive: true })

const app = createApp({
  db: openDb(dbPath),
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
  // RATE_LIMIT_RELAXED=1 raises the auth limits for the e2e run.
  limits: process.env.RATE_LIMIT_RELAXED === '1' ? relaxLimits(DEFAULT_LIMITS) : DEFAULT_LIMITS,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`time-since listening on http://localhost:${info.port}`)
})
