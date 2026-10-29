// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DAY,
  installFetch,
  listRoute,
  resetView,
  sectionsListRoute,
  timerView,
  type Route,
} from './helpers.ts'
import { COLLAPSED_KEY } from '../../src/client/collapsed.ts'
import { meRoute, mountApp, REAL_USER } from './mountApp.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  localStorage.clear()
})

const timer = timerView({
  id: 1,
  name: 'Aquarium',
  stats: { averageGapMs: 7 * DAY, longestGapMs: 9 * DAY, resetCount: 2 },
})
const entries = [
  resetView({ id: 12, at: 3_000_000, note: 'Latest' }),
  resetView({ id: 11, at: 2_000_000 }),
  resetView({ id: 10, at: 1_000_000, isOrigin: true }),
]
const resetsRoute: Route = ['GET', /^\/api\/timers\/1\/resets$/, () => [200, { resets: entries }]]

describe('TimerDetail', () => {
  it('shows stats and the log newest first', async () => {
    installFetch([meRoute(REAL_USER), listRoute(timer), resetsRoute])
    const { wrapper } = await mountApp('/timers/1')
    expect(wrapper.find('[data-testid="stat-average"]').text()).toBe('7d 0h')
    expect(wrapper.find('[data-testid="stat-count"]').text()).toBe('2')
    const rows = wrapper.findAll('[data-testid="log-entry"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Latest')
    expect(rows[2]!.text()).toContain('(created)')
  })

  it('shows the gap graph with one bar per finished gap plus the current run', async () => {
    installFetch([meRoute(REAL_USER), listRoute(timer), resetsRoute])
    const { wrapper } = await mountApp('/timers/1')
    const graph = wrapper.find('[data-testid="gap-graph"]')
    expect(graph.findAll('[data-testid="gap-bar"]')).toHaveLength(2)
    expect(graph.findAll('[data-testid="current-bar"]')).toHaveLength(1)
    expect(graph.find('[data-testid="goal-key"]').text()).toContain('average')
  })

  it('updates the gap graph after a log entry is deleted', async () => {
    let current = entries
    installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      ['GET', /^\/api\/timers\/1\/resets$/, () => [200, { resets: current }]],
      [
        'DELETE',
        /^\/api\/timers\/1\/resets\/11$/,
        () => {
          current = entries.filter((e) => e.id !== 11)
          return [204]
        },
      ],
    ])
    const { wrapper } = await mountApp('/timers/1')
    await wrapper
      .findAll('[data-testid="log-entry"]')[1]!
      .find('button[aria-label^="Delete entry"]')
      .trigger('click')
    await wrapper
      .find('[role="dialog"]')
      .findAll('button')
      .find((b) => b.text() === 'Delete entry')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="gap-bar"]')).toHaveLength(1)
  })

  it('hides the delete action for the origin entry', async () => {
    installFetch([meRoute(REAL_USER), listRoute(timer), resetsRoute])
    const { wrapper } = await mountApp('/timers/1')
    const rows = wrapper.findAll('[data-testid="log-entry"]')
    const deleteButtons = (i: number) =>
      rows[i]!.findAll('button').filter((b) => b.attributes('aria-label')?.startsWith('Delete'))
    expect(deleteButtons(0)).toHaveLength(1)
    expect(deleteButtons(1)).toHaveLength(1)
    expect(deleteButtons(2)).toHaveLength(0)
  })

  it('shows Timer no longer exists with a link to the list for a deleted timer', async () => {
    installFetch([meRoute(REAL_USER), listRoute()])
    const { wrapper } = await mountApp('/timers/1')
    expect(wrapper.text()).toContain('Timer no longer exists')
    const link = wrapper.findAll('a').find((a) => a.text() === 'Back to the list')!
    expect(link.attributes('href')).toBe('/')
  })

  it('shows Timer no longer exists when the log request returns 404', async () => {
    installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      ['GET', /^\/api\/timers\/1\/resets$/, () => [404, { error: 'Not found' }]],
    ])
    const { wrapper } = await mountApp('/timers/1')
    expect(wrapper.text()).toContain('Timer no longer exists')
  })

  it('shows an inline retry when the fetch fails', async () => {
    let fail = true
    installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      [
        'GET',
        /^\/api\/timers\/1\/resets$/,
        () => (fail ? [500, { error: 'x' }] : [200, { resets: entries }]),
      ],
    ])
    const { wrapper } = await mountApp('/timers/1')
    expect(wrapper.find('[role="alert"]').text()).toContain('Something went wrong')
    fail = false
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="log-entry"]')).toHaveLength(3)
  })

  it('saves a new note on an existing entry', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      resetsRoute,
      [
        'PATCH',
        /^\/api\/timers\/1\/resets\/11$/,
        (_m, body) => [
          200,
          { reset: resetView({ id: 11, at: 2_000_000, note: body.note as string }) },
        ],
      ],
    ])
    const { wrapper } = await mountApp('/timers/1')
    const row = wrapper.findAll('[data-testid="log-entry"]')[1]!
    await row.find('button[aria-label^="Edit note"]').trigger('click')
    await row.find('textarea').setValue('Changed the filter')
    await row.find('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ note: 'Changed the filter' })
    expect(wrapper.findAll('[data-testid="log-entry"]')[1]!.text()).toContain('Changed the filter')
  })

  it('asks for confirmation in a dialog before deleting a log entry', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      resetsRoute,
      ['DELETE', /^\/api\/timers\/1\/resets\/11$/, () => [204]],
    ])
    const { wrapper } = await mountApp('/timers/1')
    const row = wrapper.findAll('[data-testid="log-entry"]')[1]!
    await row.find('button[aria-label^="Delete entry"]').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.text()).toContain('Delete this entry?')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Delete entry')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('asks for confirmation showing the reset count before deleting the timer', async () => {
    const { calls } = installFetch([
      meRoute(REAL_USER),
      listRoute(timer),
      resetsRoute,
      ['DELETE', /^\/api\/timers\/1$/, () => [204]],
    ])
    const { wrapper, router } = await mountApp('/timers/1')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Delete timer')!
      .trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.text()).toContain('2 resets')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Delete timer')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'))
  })

  describe('section picker', () => {
    const openEdit = async (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) => {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Rename or change target')!
        .trigger('click')
    }

    it('keeps the custom section when only the target changes (AE2)', async () => {
      const inHouse = timerView({
        id: 1,
        name: 'Aquarium',
        targetMs: 3 * DAY,
        placement: { kind: 'custom', sectionId: 7 },
      })
      const { calls } = installFetch([
        meRoute(REAL_USER),
        sectionsListRoute([{ id: 7, name: 'House' }], inHouse),
        resetsRoute,
        ['PATCH', /^\/api\/timers\/1$/, () => [200, inHouse]],
      ])
      const { wrapper } = await mountApp('/timers/1')
      await openEdit(wrapper)
      expect((wrapper.find('select[name="section"]').element as HTMLSelectElement).value).toBe(
        'custom:7',
      )
      await wrapper.find('input[name="amount"]').setValue('1')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
        name: 'Aquarium',
        targetMs: DAY,
        placement: { kind: 'custom', sectionId: 7 },
      })
    })

    it('opens the destination section on the list after a move', async () => {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['monthly']))
      const moved = timerView({
        id: 1,
        name: 'Aquarium',
        placement: { kind: 'cadence', cadence: 'monthly' },
      })
      installFetch([
        meRoute(REAL_USER),
        listRoute(timer),
        resetsRoute,
        ['PATCH', /^\/api\/timers\/1$/, () => [200, moved]],
      ])
      const { wrapper } = await mountApp('/timers/1')
      await openEdit(wrapper)
      await wrapper.find('select[name="section"]').setValue('cadence:monthly')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(JSON.parse(localStorage.getItem(COLLAPSED_KEY)!)).toEqual([])
    })
  })
})
