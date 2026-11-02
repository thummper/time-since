// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminStats } from '../../src/shared/types.ts'
import { installFetch, listRoute, T0, type Route } from './helpers.ts'
import { meRoute, mountApp, REAL_USER } from './mountApp.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const ADMIN_USER = { user: { ...REAL_USER.user, isAdmin: true } }

const STATS: AdminStats = {
  now: T0,
  accounts: { real: 12, realCap: 1000, demo: 3, demoCap: 50 },
  active: { day: 4, week: 7, month: 9 },
  signedIn: 10,
  signups: { week: 2, month: 5 },
  content: { timers: 40, resets: 321, pushSubscriptions: 6 },
}

const statsRoute = (status = 200, body: unknown = STATS): Route => [
  'GET',
  /^\/api\/admin\/stats$/,
  () => [status, body],
]

describe('Admin', () => {
  it('shows the stats to an admin', async () => {
    installFetch([meRoute(ADMIN_USER), statsRoute()])
    const { wrapper } = await mountApp('/admin')
    const text = wrapper.text()
    expect(text).toContain('Real accounts')
    expect(text).toContain('/ 1000')
    expect(text).toContain('321')
    expect(text).toContain('Last 30 days')
  })

  it('shows the server error with a retry', async () => {
    installFetch([meRoute(ADMIN_USER), statsRoute(403, { error: 'Admins only' })])
    const { wrapper } = await mountApp('/admin')
    expect(wrapper.find('[role="alert"]').text()).toContain('Admins only')
  })

  it('sends a non-admin back to the list', async () => {
    installFetch([meRoute(REAL_USER), listRoute()])
    const { router } = await mountApp('/admin')
    expect(router.currentRoute.value.name).toBe('list')
  })

  it('links to the admin page from Settings only for an admin', async () => {
    installFetch([meRoute(ADMIN_USER), listRoute()])
    const admin = await mountApp('/settings')
    expect(admin.wrapper.find('[data-testid="admin-link"]').exists()).toBe(true)

    installFetch([meRoute(REAL_USER), listRoute()])
    const user = await mountApp('/settings')
    expect(user.wrapper.find('[data-testid="admin-link"]').exists()).toBe(false)
  })
})
