// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFetch, listRoute } from './helpers.ts'
import { DEMO_USER, meRoute, mountApp, REAL_USER } from './mountApp.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Settings', () => {
  it('shows Leave demo and no email for a demo session', async () => {
    installFetch([meRoute(DEMO_USER), listRoute()])
    const { wrapper } = await mountApp('/settings')
    expect(wrapper.text()).toContain('Leave demo')
    expect(wrapper.text()).toContain('cannot reopen')
    expect(wrapper.text()).not.toContain('Log out')
    expect(wrapper.text()).not.toContain('demo-x@demo.invalid')
    expect(wrapper.find('[data-testid="notification-toggle"]').exists()).toBe(false)
  })

  it('opens from the list in one tap and shows the logout action', async () => {
    installFetch([meRoute(REAL_USER), listRoute()])
    const { wrapper, router } = await mountApp('/')
    await wrapper.find('a[aria-label="Settings"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings'))
    expect(wrapper.text()).toContain('Log out')
    expect(wrapper.text()).toContain('ada@example.com')
    expect(wrapper.find('[data-testid="notification-toggle"]').exists()).toBe(true)
  })

  it('logs out and returns to the welcome page', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(),
      ['POST', /^\/api\/auth\/logout$/, () => [200, { ok: true }]],
    ])
    const { wrapper, router } = await mountApp('/settings')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Log out')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.path === '/api/auth/logout')).toBe(true)
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('welcome'))
  })
})
