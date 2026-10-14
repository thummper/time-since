// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAY, installFetch, listRoute, timerView, T0 } from './helpers.ts'
import { DEMO_USER, meRoute, mountApp, REAL_USER } from './mountApp.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('session handling', () => {
  it('returns a logged-out user to the timer they opened after login', async () => {
    installFetch([
      meRoute(null),
      ['POST', /^\/api\/auth\/login$/, () => [200, REAL_USER]],
      listRoute(timerView({ id: 7 })),
      ['GET', /^\/api\/timers\/7\/resets$/, () => [200, { resets: [] }]],
    ])
    const { wrapper, router } = await mountApp('/timers/7')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('welcome'))
    await vi.waitFor(() => expect(router.currentRoute.value.query.redirect).toBe('/timers/7'))
    await wrapper
      .findAll('a')
      .find((a) => a.text() === 'Log in')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.find('input[name="email"]').exists()).toBe(true))
    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('correct horse')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/timers/7'))
  })

  it('ignores an off-site redirect target', async () => {
    installFetch([
      meRoute(null),
      ['POST', /^\/api\/auth\/login$/, () => [200, REAL_USER]],
      listRoute(),
    ])
    const { wrapper, router } = await mountApp('/login?redirect=//evil.example')
    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('correct horse')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'))
  })

  it('shows a plain message when login is rate limited', async () => {
    installFetch([
      meRoute(null),
      [
        'POST',
        /^\/api\/auth\/login$/,
        () => [429, { error: 'Too many requests. Try again later.' }],
      ],
    ])
    const { wrapper } = await mountApp('/login')
    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('x')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Too many requests')
  })

  it('starts a demo from the welcome page and shows the demo banner', async () => {
    installFetch([meRoute(null), ['POST', /^\/api\/demo$/, () => [201, DEMO_USER]], listRoute()])
    const { wrapper, router } = await mountApp('/welcome')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Try demo')!
      .trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('list'))
    const banner = wrapper.find('[role="note"]')
    expect(banner.text()).toContain('24 hours')
    expect(banner.find('a').attributes('href')).toBe('/register')
  })

  it('shows Demo expired when a demo session gets a 401', async () => {
    let expired = false
    installFetch([
      meRoute(DEMO_USER),
      [
        'GET',
        /^\/api\/timers$/,
        () =>
          expired
            ? [401, { error: 'Not logged in' }]
            : [
                200,
                { now: T0, timers: [timerView({ id: 1, lastReset: { id: 1, at: T0 - DAY } })] },
              ],
      ],
    ])
    const { wrapper, router } = await mountApp('/')
    expired = true
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('welcome'))
    expect(wrapper.text()).toContain('Demo expired')
  })

  it('goes to the welcome page without the demo notice for a real session', async () => {
    let expired = false
    installFetch([
      meRoute(REAL_USER),
      [
        'GET',
        /^\/api\/timers$/,
        () => (expired ? [401, { error: 'x' }] : [200, { now: T0, timers: [] }]),
      ],
    ])
    const { wrapper, router } = await mountApp('/')
    expired = true
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('welcome'))
    expect(wrapper.text()).not.toContain('Demo expired')
  })
})
