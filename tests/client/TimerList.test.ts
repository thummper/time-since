// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY, T0, installFetch, listRoute, resetView, timerView } from './helpers.ts'
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
    await wrapper.find('button[aria-label="Reset Aquarium"]').trigger('click')
    await flushPromises()
    const card = wrapper.find('article')
    expect(card.find('[role="alert"]').text()).toContain('Something went wrong')
    expect(card.text()).toContain('3d 0h')
    expect(card.text()).toContain('Retry')
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
    await wrapper.find('button[aria-label="Reset Old"]').trigger('click')
    await flushPromises()
    expect(cardNames(wrapper)).toEqual(['Old', 'Newer'])
    expect(wrapper.find('[data-testid="reset-state"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Old reset')
    vi.advanceTimersByTime(8000)
    await flushPromises()
    expect(cardNames(wrapper)).toEqual(['Newer', 'Old'])
    expect(wrapper.find('[data-testid="reset-state"]').exists()).toBe(false)
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
    await wrapper.find('button[aria-label="Reset A"]').trigger('click')
    await flushPromises()
    await wrapper.find('button[aria-label="Reset B"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[role="status"]')).toHaveLength(2)
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
})
