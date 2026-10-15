import { Hono, type Context } from 'hono'
import type { Db } from '../db/client.ts'
import { readJson } from '../http.ts'
import { requireUser, type AuthEnv } from '../auth/middleware.ts'
import { limiter, type LimitSettings } from '../security/rateLimit.ts'
import { MINUTE_MS } from '../../shared/limits.ts'
import {
  MAX_RESETS,
  MAX_TIMERS,
  parseName,
  parseNote,
  parseResetAt,
  parseStartedAt,
  parseTarget,
} from './validation.ts'
import * as svc from './service.ts'

export interface TimerRouteOptions {
  db: Db
  limits: LimitSettings
  now: () => number
}

function parseId(value: string | undefined): number | null {
  return value !== undefined && /^\d{1,15}$/.test(value) ? Number(value) : null
}

export function timerRoutes({ db, limits, now }: TimerRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()
  const userId = (c: Context<AuthEnv>) => c.var.user!.id
  const invalid = (c: Context<AuthEnv>, error: string) => c.json({ error }, 422)
  const notFound = (c: Context<AuthEnv>) => c.json({ error: 'Not found' }, 404)

  routes.use('*', requireUser)
  // Per-user write limit (R5). Reads are not counted.
  const writeLimiter = limiter<AuthEnv>(
    MINUTE_MS,
    limits.writesPerMinute,
    (c) => `write:${userId(c)}`,
    'Too many changes. Try again in a minute.',
  )
  routes.use('*', async (c, next) => (c.req.method === 'GET' ? next() : writeLimiter(c, next)))

  /** The timer from `:id`, scoped to the user; other users' timers look missing. */
  const ownedTimer = (c: Context<AuthEnv>) => {
    const id = parseId(c.req.param('id'))
    return id === null ? undefined : svc.getOwnedTimer(db, userId(c), id)
  }

  routes.get('/', (c) => {
    const at = now()
    return c.json({ now: at, timers: svc.listTimers(db, userId(c), at) })
  })

  routes.post('/', async (c) => {
    const body = await readJson(c)
    const name = parseName(body.name)
    if (!name.ok) return invalid(c, name.error)
    const target =
      body.targetMs === undefined ? { ok: true as const, value: null } : parseTarget(body.targetMs)
    if (!target.ok) return invalid(c, target.error)
    const at = now()
    const startedAt = parseStartedAt(body.startedAt, at)
    if (!startedAt.ok) return invalid(c, startedAt.error)
    if (svc.timerCount(db, userId(c)) >= MAX_TIMERS) {
      return invalid(c, `You can have at most ${MAX_TIMERS} timers`)
    }
    const timer = svc.createTimer(db, userId(c), name.value, target.value, at, startedAt.value)
    return c.json(svc.toTimerView(timer, svc.entriesOf(db, timer.id), at), 201)
  })

  routes.patch('/:id', async (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    const body = await readJson(c)
    const changes: svc.TimerChanges = {}
    if ('name' in body) {
      const name = parseName(body.name)
      if (!name.ok) return invalid(c, name.error)
      changes.name = name.value
    }
    if ('targetMs' in body) {
      const target = parseTarget(body.targetMs)
      if (!target.ok) return invalid(c, target.error)
      changes.targetMs = target.value
    }
    if (Object.keys(changes).length === 0) return invalid(c, 'Nothing to change')
    const at = now()
    const entries = svc.entriesOf(db, timer.id)
    const updated = svc.updateTimer(db, timer, changes, at, entries)
    return c.json(svc.toTimerView(updated, entries, at))
  })

  routes.delete('/:id', (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    svc.deleteTimer(db, timer.id)
    return c.body(null, 204)
  })

  routes.get('/:id/resets', (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    return c.json({ resets: svc.logOf(db, timer.id).map(svc.toResetView) })
  })

  routes.post('/:id/resets', async (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    const body = await readJson(c)
    const at = parseResetAt(body.at, now())
    if (!at.ok) return invalid(c, at.error)
    const note = parseNote(body.note)
    if (!note.ok) return invalid(c, note.error)
    if (svc.resetCount(db, timer.id) >= MAX_RESETS) {
      return invalid(
        c,
        `A timer can have at most ${MAX_RESETS.toLocaleString('en-US')} log entries`,
      )
    }
    const row = svc.insertReset(db, timer.id, at.value, note.value, now())
    return c.json({ reset: svc.toResetView(row) }, 201)
  })

  routes.patch('/:id/resets/:resetId', async (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    const resetId = parseId(c.req.param('resetId'))
    const entry = resetId === null ? undefined : svc.getReset(db, timer.id, resetId)
    if (!entry) return notFound(c)
    const body = await readJson(c)
    if (!('note' in body)) return invalid(c, 'Nothing to change')
    const note = parseNote(body.note)
    if (!note.ok) return invalid(c, note.error)
    const row = svc.setNote(db, entry.id, note.value)
    return c.json({ reset: svc.toResetView(row) })
  })

  routes.delete('/:id/resets/:resetId', (c) => {
    const timer = ownedTimer(c)
    if (!timer) return notFound(c)
    const resetId = parseId(c.req.param('resetId'))
    const entry = resetId === null ? undefined : svc.getReset(db, timer.id, resetId)
    // A late Undo finds nothing to delete, which is fine.
    if (!entry) return c.body(null, 204)
    if (entry.isOrigin) return invalid(c, 'The creation entry cannot be deleted')
    svc.deleteReset(db, entry.id)
    return c.body(null, 204)
  })

  return routes
}
