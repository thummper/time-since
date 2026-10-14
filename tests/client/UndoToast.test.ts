// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UndoToast from '../../src/client/components/UndoToast.vue'
import { T0, installFetch } from './helpers.ts'

const toast = { id: 1, timerId: 5, resetId: 50, message: 'Aquarium reset' }

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

describe('UndoToast', () => {
  it('deletes that reset id when Undo is tapped', async () => {
    const { calls } = installFetch([['DELETE', /^\/api\/timers\/5\/resets\/50$/, () => [204]]])
    const wrapper = mount(UndoToast, { props: { toast } })
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('close')).toHaveLength(1))
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/timers/5/resets/50',
    ])
  })

  it('disappears after 8 seconds without calling the server', async () => {
    const { calls } = installFetch([])
    const wrapper = mount(UndoToast, { props: { toast } })
    vi.advanceTimersByTime(7999)
    expect(wrapper.emitted('close')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(calls).toHaveLength(0)
  })

  it('renders inside an aria-live region and its Undo button takes keyboard focus', () => {
    installFetch([])
    const wrapper = mount(UndoToast, { props: { toast }, attachTo: document.body })
    const live = wrapper.find('[aria-live]')
    expect(live.exists()).toBe(true)
    const button = live.find('button')
    expect(button.text()).toBe('Undo')
    ;(button.element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(button.element)
    wrapper.unmount()
  })

  it('stays open with an error when the undo fails', async () => {
    installFetch([['DELETE', /^\/api\/timers\/5\/resets\/50$/, () => [500, { error: 'boom' }]]])
    const wrapper = mount(UndoToast, { props: { toast } })
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not undo'))
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
