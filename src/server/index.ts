import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Cron } from 'croner'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { startOverdueInterval } from './jobs/scheduler.ts'
import { createWebPushSender } from './push/sender.ts'
import { cleanupDemoUsers } from './demo/cleanup.ts'
import { openDb } from './db/client.ts'
import { DEFAULT_LIMITS, relaxLimits } from './security/rateLimit.ts'

const port = Number(process.env.PORT ?? 3000)
const dbPath = process.env.DATABASE_PATH ?? 'data/time-since.db'
mkdirSync(dirname(dbPath), { recursive: true })

const db = openDb(dbPath)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT
const app = createApp({
  db,
  vapidPublicKey: vapidPublicKey || undefined,
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
  // RATE_LIMIT_RELAXED=1 raises the auth limits for the e2e run.
  limits: process.env.RATE_LIMIT_RELAXED === '1' ? relaxLimits(DEFAULT_LIMITS) : DEFAULT_LIMITS,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`time-since listening on http://localhost:${info.port}`)
})

// KTD10: demo sandboxes older than 24 hours go at start and then every hour.
const cleanup = (): void => void cleanupDemoUsers(db, Date.now())
cleanup()
new Cron('0 * * * *', cleanup)

// KTD10: the overdue check runs every 60 seconds, and only when VAPID is configured.
if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  startOverdueInterval({
    db,
    sender: createWebPushSender({
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
      subject: vapidSubject,
    }),
    intervalMs: 60_000,
  })
} else {
  console.warn(
    'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is not set: push alerts are off',
  )
}
