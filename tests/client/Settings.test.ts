// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFetch, listRoute, sectionsListRoute } from './helpers.ts'
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

  describe('sections card', () => {
    const sections = [
      { id: 8, name: 'house' },
      { id: 7, name: 'Car' },
      { id: 9, name: 'Garden' },
    ]
    const card = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
      wrapper.find('[data-testid="sections-card"]')
    const names = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
      card(wrapper)
        .findAll('[data-testid="section-name"]')
        .map((n) => n.text())
    const button = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'], label: string) =>
      wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === label || b.text() === label)!

    it('lists every section A to Z by name, empty ones included', async () => {
      installFetch([meRoute(REAL_USER), sectionsListRoute(sections)])
      const { wrapper } = await mountApp('/settings')
      expect(names(wrapper)).toEqual(['Car', 'Garden', 'house'])
    })

    it('shows help text when there are no sections', async () => {
      installFetch([meRoute(REAL_USER), listRoute()])
      const { wrapper } = await mountApp('/settings')
      expect(card(wrapper).text()).toContain('New section')
    })

    it('renames a section', async () => {
      const { calls } = installFetch([
        meRoute(REAL_USER),
        sectionsListRoute(sections),
        ['PATCH', /^\/api\/sections\/7$/, () => [200, { id: 7, name: 'Cars' }]],
      ])
      const { wrapper } = await mountApp('/settings')
      await button(wrapper, 'Rename Car').trigger('click')
      await card(wrapper).find('input[name="sectionName"]').setValue('Cars')
      await card(wrapper).find('form').trigger('submit')
      await flushPromises()
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ name: 'Cars' })
      expect(names(wrapper)).toEqual(['Cars', 'Garden', 'house'])
    })

    it('shows a rename error inline and keeps the old name', async () => {
      installFetch([
        meRoute(REAL_USER),
        sectionsListRoute(sections),
        [
          'PATCH',
          /^\/api\/sections\/7$/,
          () => [422, { error: 'A section with this name already exists' }],
        ],
      ])
      const { wrapper } = await mountApp('/settings')
      await button(wrapper, 'Rename Car').trigger('click')
      await card(wrapper).find('input[name="sectionName"]').setValue('Garden')
      await card(wrapper).find('form').trigger('submit')
      await flushPromises()
      expect(card(wrapper).find('[role="alert"]').text()).toContain('already exists')
      await button(wrapper, 'Cancel').trigger('click')
      expect(names(wrapper)).toEqual(['Car', 'Garden', 'house'])
    })

    it('deletes a section after confirmation (AE3)', async () => {
      let current = sections
      const { count } = installFetch([
        meRoute(REAL_USER),
        ['GET', /^\/api\/timers$/, () => [200, { now: 0, timers: [], sections: current }]],
        [
          'DELETE',
          /^\/api\/sections\/7$/,
          () => {
            current = sections.filter((s) => s.id !== 7)
            return [204]
          },
        ],
      ])
      const { wrapper } = await mountApp('/settings')
      await button(wrapper, 'Delete Car').trigger('click')
      expect(wrapper.find('[role="dialog"]').text()).toContain('automatic')
      await button(wrapper, 'Delete section').trigger('click')
      await flushPromises()
      expect(count('DELETE', /^\/api\/sections\/7$/)).toBe(1)
      expect(names(wrapper)).toEqual(['Garden', 'house'])
    })

    it('changes nothing when delete is cancelled', async () => {
      const { count } = installFetch([meRoute(REAL_USER), sectionsListRoute(sections)])
      const { wrapper } = await mountApp('/settings')
      await button(wrapper, 'Delete Car').trigger('click')
      await wrapper
        .find('[role="dialog"]')
        .findAll('button')
        .find((b) => b.text() === 'Cancel')!
        .trigger('click')
      expect(count('DELETE', /sections/)).toBe(0)
      expect(names(wrapper)).toEqual(['Car', 'Garden', 'house'])
    })
  })
})
