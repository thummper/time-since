// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY,
  HOUR,
  T0,
  installFetch,
  listRoute,
  resetView,
  sectionsListRoute,
  tapReset,
  timerView,
} from './helpers.ts'
import { COLLAPSED_KEY } from '../../src/client/collapsed.ts'
import { meRoute, mountApp, REAL_USER } from './mountApp.ts'

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  localStorage.clear()
})

const cardNames = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
  wrapper.findAll('article a').map((a) => a.text())

describe('TimerList', () => {
  it('shows the empty message and the Add timer action with zero timers', async () => {
    installFetch([meRoute(REAL_USER), listRoute()])
    const { wrapper } = await mountApp('/')
    expect(wrapper.text()).toContain('No timers yet')
    const add = wrapper.findAll('button').filter((b) => b.text().includes('Add timer'))
    expect(add.length).toBeGreaterThanOrEqual(1)
  })

  it('shows a loading state during the first fetch', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    installFetch([
      meRoute(REAL_USER),
      [
        'GET',
        /^\/api\/timers$/,
        async () => {
          await gate
          return [200, { now: T0, timers: [] }]
        },
      ],
    ])
    const { wrapper } = await mountApp('/')
    expect(wrapper.text()).toContain('Loading timers')
    release()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Loading timers')
  })

  it('shows an inline error with retry when the first fetch fails', async () => {
    let fail = true
    installFetch([
      meRoute(REAL_USER),
      [
        'GET',
        /^\/api\/timers$/,
        () => (fail ? [500, { error: 'x' }] : [200, { now: T0, timers: [] }]),
      ],
    ])
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('[role="alert"]').text()).toContain('Something went wrong')
    fail = false
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No timers yet')
  })

  it('shows an inline error with retry on a failed reset, keeping the old elapsed value', async () => {
    installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'Aquarium', lastReset: { id: 10, at: T0 - 3 * DAY } })),
      ['POST', /^\/api\/timers\/1\/resets$/, () => [500, { error: 'boom' }]],
    ])
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('article').text()).toContain('3d 0h')
    await tapReset(wrapper, 'Aquarium')
    await flushPromises()
    const card = wrapper.find('article')
    expect(card.find('[role="alert"]').text()).toContain('Something went wrong')
    expect(card.text()).toContain('3d 0h')
    expect(card.text()).toContain('Retry')
    await card
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('keeps a card in place after a reset until its undo toast closes, then re-sorts', async () => {
    let oldReset = { id: 10, at: T0 - 9 * DAY }
    installFetch([
      meRoute(REAL_USER),
      [
        'GET',
        /^\/api\/timers$/,
        () => [
          200,
          {
            now: T0,
            timers: [
              timerView({ id: 1, name: 'Old', lastReset: oldReset }),
              timerView({ id: 2, name: 'Newer', lastReset: { id: 20, at: T0 - 5 * DAY } }),
            ],
          },
        ],
      ],
      [
        'POST',
        /^\/api\/timers\/1\/resets$/,
        () => {
          oldReset = { id: 11, at: T0 }
          return [201, { reset: resetView({ id: 11, at: T0 }) }]
        },
      ],
    ])
    const { wrapper } = await mountApp('/')
    expect(cardNames(wrapper)).toEqual(['Old', 'Newer'])
    await tapReset(wrapper, 'Old')
    await flushPromises()
    expect(cardNames(wrapper)).toEqual(['Old', 'Newer'])
    expect(wrapper.find('[data-testid="reset-state"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Old reset')
    vi.advanceTimersByTime(8000)
    await flushPromises()
    expect(cardNames(wrapper)).toEqual(['Newer', 'Old'])
    expect(wrapper.find('[data-testid="reset-state"]').exists()).toBe(false)
  })

  it('logs one reset for two quick taps while the first request is pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { count } = installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'A' })),
      [
        'POST',
        /^\/api\/timers\/1\/resets$/,
        async () => {
          await gate
          return [201, { reset: resetView({ id: 99, at: T0 }) }]
        },
      ],
    ])
    const { wrapper } = await mountApp('/')
    const button = wrapper.find('button[aria-label="Reset A"]')
    await tapReset(wrapper, 'A')
    await button.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(button.attributes('aria-busy')).toBe('true')
    expect(count('POST', /\/resets$/)).toBe(1)
    release()
    await flushPromises()
    expect(count('POST', /\/resets$/)).toBe(1)
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    expect(wrapper.find('button[aria-label="Reset A"]').attributes('disabled')).toBeUndefined()
  })

  it('stacks one undo toast per reset', async () => {
    installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'A' }), timerView({ id: 2, name: 'B' })),
      [
        'POST',
        /^\/api\/timers\/\d\/resets$/,
        () => [201, { reset: resetView({ id: 99, at: T0 }) }],
      ],
    ])
    const { wrapper } = await mountApp('/')
    await tapReset(wrapper, 'A')
    await flushPromises()
    await tapReset(wrapper, 'B')
    await flushPromises()
    expect(wrapper.findAll('[role="status"]')).toHaveLength(2)
  })

  it('lifts the undo toasts above an open dialog, so Undo still works', async () => {
    const { count } = installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'A' }), timerView({ id: 2, name: 'B' })),
      ['POST', /^\/api\/timers\/1\/resets$/, () => [201, { reset: resetView({ id: 99, at: T0 }) }]],
      ['DELETE', /^\/api\/timers\/1\/resets\/99$/, () => [204, null]],
    ])
    const { wrapper } = await mountApp('/')
    await tapReset(wrapper, 'A')
    await flushPromises()
    await wrapper.find('button[aria-label="Reset B"]').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    const style = document.documentElement.style
    expect(style.getPropertyValue('--dialog-lift')).toMatch(/^\d+px$/)
    const undo = wrapper.findAll('[role="status"] button').find((b) => b.text() === 'Undo')!
    expect(dialog.element.contains(undo.element)).toBe(false)
    await undo.trigger('click')
    await flushPromises()
    expect(count('DELETE', /\/resets\/99$/)).toBe(1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(style.getPropertyValue('--toast-stack')).toMatch(/px$/)
    await wrapper
      .find('[role="dialog"]')
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(style.getPropertyValue('--dialog-lift')).toBe('')
  })

  it('asks for confirmation in a dialog before it logs a reset', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'Aquarium' })),
    ])
    const { wrapper } = await mountApp('/')
    await wrapper.find('button[aria-label="Reset Aquarium"]').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.text()).toContain('Reset Aquarium?')
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('opens the reset dialog from the menu button and logs a backdated reset with a note', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'Aquarium' })),
      [
        'POST',
        /^\/api\/timers\/1\/resets$/,
        () => [201, { reset: resetView({ id: 11, at: T0 - DAY }) }],
      ],
    ])
    const { wrapper } = await mountApp('/')
    await wrapper.find('button[aria-label="More options for Aquarium"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.find('textarea').setValue('Filter too')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body.note).toBe('Filter too')
    expect(post.body.at).toBeLessThanOrEqual(T0)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('opens the reset dialog on a long press instead of resetting', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timerView({ id: 1, name: 'Aquarium' })),
    ])
    const { wrapper } = await mountApp('/')
    const button = wrapper.find('button[aria-label="Reset Aquarium"]')
    await button.trigger('pointerdown')
    vi.advanceTimersByTime(500)
    await flushPromises()
    await button.trigger('pointerup')
    await button.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows a plain message when the timer cap is reached', async () => {
    installFetch([
      meRoute(REAL_USER),
      listRoute(),
      ['POST', /^\/api\/timers$/, () => [422, { error: 'You can have at most 50 timers' }]],
    ])
    const { wrapper } = await mountApp('/')
    await wrapper.find('button').trigger('click')
    await wrapper.find('input[name="name"]').setValue('Water plants')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="dialog"] [role="alert"]').text()).toBe(
      'You can have at most 50 timers',
    )
  })

  describe('sections', () => {
    const headers = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
      wrapper.findAll('section[data-section]').map((s) => ({
        key: s.attributes('data-section'),
        count: s.find('[data-testid="section-count"]').text(),
      }))
    const toggle = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'], key: string) =>
      wrapper.find(`section[data-section="${key}"] button[aria-expanded]`).trigger('click')

    it('shows a header with a count for each non-empty section (AE6)', async () => {
      installFetch([
        meRoute(REAL_USER),
        listRoute(
          timerView({ id: 1, name: 'Plants', targetMs: DAY }),
          timerView({ id: 2, name: 'Sheets', targetMs: 3 * DAY }),
          timerView({ id: 3, name: 'Towels', targetMs: 3 * DAY }),
        ),
      ])
      const { wrapper } = await mountApp('/')
      expect(headers(wrapper)).toEqual([
        { key: 'daily', count: '1' },
        { key: 'weekly', count: '2' },
      ])
      expect(wrapper.text()).not.toContain('Monthly+')
    })

    it('puts a custom section between Monthly+ and Other, by name', async () => {
      installFetch([
        meRoute(REAL_USER),
        sectionsListRoute(
          [{ id: 7, name: 'House' }],
          timerView({ id: 1, name: 'Car', targetMs: 30 * DAY }),
          timerView({ id: 2, name: 'Vacuum', placement: { kind: 'custom', sectionId: 7 } }),
          timerView({ id: 3, name: 'Dentist' }),
        ),
      ])
      const { wrapper } = await mountApp('/')
      expect(headers(wrapper).map((h) => h.key)).toEqual(['monthly', 'custom:7', 'other'])
      expect(wrapper.find('section[data-section="custom:7"] h2').text()).toContain('House')
    })

    it('shows an overdue Weekly timer under the open Overdue header while Weekly is collapsed (AE4)', async () => {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['weekly']))
      installFetch([
        meRoute(REAL_USER),
        listRoute(
          timerView({
            id: 1,
            name: 'Sheets',
            targetMs: 3 * DAY,
            lastReset: { id: 10, at: T0 - 4 * DAY },
          }),
          timerView({ id: 2, name: 'Towels', targetMs: 3 * DAY }),
        ),
      ])
      const { wrapper } = await mountApp('/')
      expect(headers(wrapper).map((h) => h.key)).toEqual(['overdue', 'weekly'])
      expect(cardNames(wrapper)).toEqual(['Sheets'])
      const overdue = wrapper.find('section[data-section="overdue"]')
      expect(overdue.find('button[aria-expanded]').exists()).toBe(false)
    })

    it('collapses a section, and the state survives a remount', async () => {
      installFetch([
        meRoute(REAL_USER),
        listRoute(timerView({ id: 1, name: 'Plants', targetMs: DAY })),
      ])
      const first = await mountApp('/')
      await toggle(first.wrapper, 'daily')
      expect(cardNames(first.wrapper)).toEqual([])
      expect(
        first.wrapper.find('section[data-section="daily"] button').attributes('aria-expanded'),
      ).toBe('false')
      first.wrapper.unmount()
      const second = await mountApp('/')
      expect(cardNames(second.wrapper)).toEqual([])
      await toggle(second.wrapper, 'daily')
      expect(cardNames(second.wrapper)).toEqual(['Plants'])
    })

    it('renders every section open when storage throws', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      installFetch([
        meRoute(REAL_USER),
        listRoute(timerView({ id: 1, name: 'Plants', targetMs: DAY })),
      ])
      const { wrapper } = await mountApp('/')
      expect(cardNames(wrapper)).toEqual(['Plants'])
      vi.restoreAllMocks()
    })

    it('lists the oldest last reset first inside a section', async () => {
      installFetch([
        meRoute(REAL_USER),
        listRoute(
          timerView({
            id: 1,
            name: 'Recent',
            targetMs: 7 * DAY,
            lastReset: { id: 10, at: T0 - HOUR },
          }),
          timerView({
            id: 2,
            name: 'Older',
            targetMs: 7 * DAY,
            lastReset: { id: 20, at: T0 - 3 * DAY },
          }),
        ),
      ])
      const { wrapper } = await mountApp('/')
      expect(cardNames(wrapper)).toEqual(['Older', 'Recent'])
    })
  })
})
