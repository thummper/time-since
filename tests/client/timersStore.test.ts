// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimersStore } from '../../src/client/stores/timers.ts'
import { DAY, HOUR, T0, installFetch, listRoute, resetView, timerView } from './helpers.ts'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const LIST = /^\/api\/timers$/

describe('timers store', () => {
  it('refetches when the window regains focus', async () => {
    const { count } = installFetch([listRoute(timerView({ id: 1 }))])
    const store = useTimersStore()
    await store.fetchTimers()
    const stop = store.watchFocus()
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(count('GET', LIST)).toBe(2))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(count('GET', LIST)).toBe(3))
    stop()
    window.dispatchEvent(new Event('focus'))
    expect(count('GET', LIST)).toBe(3)
  })

  it('removes a timer when an update returns 404', async () => {
    installFetch([
      listRoute(timerView({ id: 1 }), timerView({ id: 2 })),
      ['PATCH', /^\/api\/timers\/1$/, () => [404, { error: 'Not found' }]],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    const result = await store.updateTimer(1, { name: 'New' })
    expect(result).toBeNull()
    expect(store.timers.map((t) => t.id)).toEqual([2])
  })

  it('ignores a second reset of the same timer while the first is pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { count } = installFetch([
      listRoute(timerView({ id: 1 }), timerView({ id: 2 })),
      [
        'POST',
        /^\/api\/timers\/\d\/resets$/,
        async () => {
          await gate
          return [201, { reset: resetView({ id: 50, at: T0 }) }]
        },
      ],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    const first = store.reset(1)
    expect(store.isResetting(1)).toBe(true)
    expect(await store.reset(1)).toBeNull()
    const other = store.reset(2)
    expect(count('POST', /\/resets$/)).toBe(2)
    release()
    expect((await first)?.id).toBe(50)
    await other
    expect(store.isResetting(1)).toBe(false)
    expect((await store.reset(1))?.id).toBe(50)
    expect(count('POST', /\/resets$/)).toBe(3)
  })

  it('removes a timer when a reset returns 404', async () => {
    installFetch([
      listRoute(timerView({ id: 1 })),
      ['POST', /^\/api\/timers\/1\/resets$/, () => [404, { error: 'Not found' }]],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    await store.reset(1)
    expect(store.timers).toEqual([])
  })

  it('sorts overdue first, then by elapsed time descending', async () => {
    installFetch([
      listRoute(
        timerView({ id: 1, lastReset: { id: 10, at: T0 - 5 * DAY } }),
        timerView({ id: 2, lastReset: { id: 20, at: T0 - 9 * DAY } }),
        timerView({ id: 3, targetMs: DAY, lastReset: { id: 30, at: T0 - 2 * DAY } }),
      ),
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    expect(store.sorted.map((t) => t.id)).toEqual([3, 2, 1])
  })

  it('keeps a reset timer in place until its hold is released', async () => {
    installFetch([
      listRoute(
        timerView({ id: 1, lastReset: { id: 10, at: T0 - 9 * DAY } }),
        timerView({ id: 2, lastReset: { id: 20, at: T0 - 5 * DAY } }),
      ),
      ['POST', /^\/api\/timers\/1\/resets$/, () => [201, { reset: resetView({ id: 11, at: T0 }) }]],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    expect(store.sorted.map((t) => t.id)).toEqual([1, 2])
    await store.reset(1)
    expect(store.timers.find((t) => t.id === 1)!.lastReset.at).toBe(T0)
    expect(store.sorted.map((t) => t.id)).toEqual([1, 2])
    expect(store.isHeld(1)).toBe(true)
    store.releaseHold(1)
    expect(store.sorted.map((t) => t.id)).toEqual([2, 1])
  })

  it('keeps the old value and records an inline error when a reset fails', async () => {
    installFetch([
      listRoute(timerView({ id: 1 })),
      ['POST', /^\/api\/timers\/1\/resets$/, () => [500, { error: 'boom' }]],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    const before = store.timers[0]!.lastReset.at
    expect(await store.reset(1)).toBeNull()
    expect(store.timers[0]!.lastReset.at).toBe(before)
    expect(store.rowErrors[1]).toBeTruthy()
    expect(store.isHeld(1)).toBe(false)
  })

  it('rejects create with the server status when rate limited', async () => {
    installFetch([
      listRoute(),
      ['POST', LIST, () => [429, { error: 'Too many changes. Try again in a minute.' }]],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    await expect(store.createTimer('Water plants', null)).rejects.toMatchObject({ status: 429 })
  })

  it('moves the last reset back after undoing a reset', async () => {
    let undone = false
    installFetch([
      [
        'GET',
        LIST,
        () => [
          200,
          {
            now: T0,
            timers: [
              timerView({
                id: 1,
                lastReset: undone ? { id: 10, at: T0 - DAY } : { id: 11, at: T0 },
              }),
            ],
          },
        ],
      ],
      [
        'DELETE',
        /^\/api\/timers\/1\/resets\/11$/,
        () => {
          undone = true
          return [204]
        },
      ],
    ])
    const store = useTimersStore()
    await store.fetchTimers()
    expect(await store.undoReset(1, 11)).toBe(true)
    expect(store.timers[0]!.lastReset).toEqual({ id: 10, at: T0 - DAY })
  })

  it('ticks the shared clock every second and uses the server offset', async () => {
    installFetch([['GET', LIST, () => [200, { now: T0 + HOUR, timers: [] }]]])
    const store = useTimersStore()
    await store.fetchTimers()
    expect(store.now).toBe(T0 + HOUR)
    const stop = store.startTicker()
    vi.advanceTimersByTime(3000)
    expect(store.now).toBe(T0 + HOUR + 3000)
    stop()
  })
})
