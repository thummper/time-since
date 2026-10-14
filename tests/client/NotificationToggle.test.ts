// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFetch, listRoute, type Route } from './helpers.ts'
import { DEMO_USER, meRoute, mountApp, REAL_USER } from './mountApp.ts'
import { fakeSubscription, installPush, KEY_B64, removePush } from './pushHelpers.ts'

afterEach(() => {
  removePush()
  document.body.innerHTML = ''
})

const pushRoutes: Route[] = [
  ['GET', /^\/api\/push\/key$/, () => [200, { publicKey: KEY_B64 }]],
  ['POST', /^\/api\/push\/subscribe$/, () => [201, { ok: true }]],
  ['POST', /^\/api\/push\/unsubscribe$/, () => [200, { ok: true }]],
  ['POST', /^\/api\/auth\/logout$/, () => [200, { ok: true }]],
]

describe('NotificationToggle', () => {
  it('is not rendered for a demo user', async () => {
    installPush('default')
    installFetch([meRoute(DEMO_USER), listRoute(), ...pushRoutes])
    const { wrapper } = await mountApp('/settings')
    expect(wrapper.find('[data-testid="notification-toggle"]').exists()).toBe(false)
  })

  it('turns on from a tap and subscribes', async () => {
    installPush('granted')
    const { calls } = installFetch([meRoute(REAL_USER), listRoute(), ...pushRoutes])
    const { wrapper } = await mountApp('/settings')
    const toggle = wrapper.find('[data-testid="notification-switch"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.path === '/api/push/subscribe')).toBe(true)
    expect(wrapper.find('[data-testid="notification-switch"]').attributes('aria-checked')).toBe(
      'true',
    )
  })

  it('shows a hint when permission is denied', async () => {
    installPush('denied')
    installFetch([meRoute(REAL_USER), listRoute(), ...pushRoutes])
    const { wrapper } = await mountApp('/settings')
    expect(wrapper.text()).toContain('blocked')
    expect(wrapper.find('[data-testid="notification-switch"]').attributes('disabled')).toBeDefined()
  })

  it('shows a hint when push is unsupported', async () => {
    installFetch([meRoute(REAL_USER), listRoute(), ...pushRoutes])
    const { wrapper } = await mountApp('/settings')
    expect(wrapper.text()).toContain('not supported')
  })

  it('sends the endpoint on logout, then unsubscribes in the browser', async () => {
    const sub = fakeSubscription()
    installPush('granted', sub)
    const { calls } = installFetch([meRoute(REAL_USER), listRoute(), ...pushRoutes])
    const { wrapper } = await mountApp('/settings')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Log out')!
      .trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(sub.unsubscribe).toHaveBeenCalled())
    const logout = calls.find((c) => c.path === '/api/auth/logout')!
    expect(logout.body).toEqual({ endpoint: sub.endpoint })
  })
})
