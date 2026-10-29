import { Hono, type Context } from 'hono'
import type { Db } from '../db/client.ts'
import { readJson } from '../http.ts'
import { requireUser, type AuthEnv } from '../auth/middleware.ts'
import { limiter, type LimitSettings } from '../security/rateLimit.ts'
import { MINUTE_MS } from '../../shared/limits.ts'
import { parseName } from '../timers/validation.ts'
import * as svc from './service.ts'

export interface SectionRouteOptions {
  db: Db
  limits: LimitSettings
  now: () => number
}

function parseId(value: string | undefined): number | null {
  return value !== undefined && /^\d{1,15}$/.test(value) ? Number(value) : null
}

/** Create, rename, and delete custom sections. The timers list response carries them (KTD6). */
export function sectionRoutes({ db, limits, now }: SectionRouteOptions): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>()
  const userId = (c: Context<AuthEnv>) => c.var.user!.id
  const invalid = (c: Context<AuthEnv>, error: string) => c.json({ error }, 422)
  const notFound = (c: Context<AuthEnv>) => c.json({ error: 'Not found' }, 404)

  routes.use('*', requireUser)
  routes.use(
    '*',
    limiter<AuthEnv>(
      MINUTE_MS,
      limits.writesPerMinute,
      (c) => `section-write:${userId(c)}`,
      'Too many changes. Try again in a minute.',
    ),
  )

  const ownedSection = (c: Context<AuthEnv>) => {
    const id = parseId(c.req.param('id'))
    return id === null ? undefined : svc.getOwnedSection(db, userId(c), id)
  }

  routes.post('/', async (c) => {
    const body = await readJson(c)
    const name = parseName(body.name)
    if (!name.ok) return invalid(c, name.error)
    if (svc.sectionCount(db, userId(c)) >= svc.MAX_SECTIONS) {
      return invalid(c, `You can have at most ${svc.MAX_SECTIONS} sections`)
    }
    if (svc.nameTaken(db, userId(c), name.value)) {
      return invalid(c, 'A section with this name already exists')
    }
    return c.json(svc.toSectionView(svc.createSection(db, userId(c), name.value, now())), 201)
  })

  routes.patch('/:id', async (c) => {
    const section = ownedSection(c)
    if (!section) return notFound(c)
    const body = await readJson(c)
    const name = parseName(body.name)
    if (!name.ok) return invalid(c, name.error)
    if (svc.nameTaken(db, userId(c), name.value, section.id)) {
      return invalid(c, 'A section with this name already exists')
    }
    return c.json(svc.toSectionView(svc.renameSection(db, section.id, name.value)))
  })

  routes.delete('/:id', (c) => {
    const section = ownedSection(c)
    if (!section) return notFound(c)
    svc.deleteSection(db, section.id)
    return c.body(null, 204)
  })

  return routes
}
