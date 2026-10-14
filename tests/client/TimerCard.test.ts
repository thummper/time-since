// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimerCard from '../../src/client/components/TimerCard.vue'
import { DAY, HOUR, T0, timerView } from './helpers.ts'

const mountCard = (props: Record<string, unknown>) =>
  mount(TimerCard, { props: props as never, global: { stubs: { RouterLink: RouterLinkStub } } })

describe('TimerCard', () => {
  it('shows elapsed time as 3d 4h', () => {
    const timer = timerView({ id: 1, lastReset: { id: 10, at: T0 - (3 * DAY + 4 * HOUR) } })
    const wrapper = mountCard({ timer, now: T0 })
    expect(wrapper.text()).toContain('3d 4h')
    expect(wrapper.find('[data-overdue]').exists()).toBe(false)
  })

  it('shows Overdue by 2d 3h as text for a timer past its target', () => {
    const timer = timerView({
      id: 1,
      targetMs: 3 * DAY,
      lastReset: { id: 10, at: T0 - (5 * DAY + 3 * HOUR) },
    })
    const wrapper = mountCard({ timer, now: T0 })
    expect(wrapper.text()).toContain('Overdue by 2d 3h')
    expect(wrapper.find('[data-overdue="true"]').exists()).toBe(true)
  })

  it('shows the target when set', () => {
    const timer = timerView({ id: 1, targetMs: 14 * DAY })
    expect(mountCard({ timer, now: T0 }).text()).toContain('Target 14d 0h')
  })

  it('shows a Reset state while held', () => {
    const timer = timerView({ id: 1 })
    const wrapper = mountCard({ timer, now: T0, held: true })
    expect(wrapper.find('[data-testid="reset-state"]').text()).toBe('Reset')
  })

  it('has a labelled reset button and a visible menu button', () => {
    const wrapper = mountCard({ timer: timerView({ id: 1, name: 'Aquarium' }), now: T0 })
    expect(wrapper.find('button[aria-label="Reset Aquarium"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="More options for Aquarium"]').exists()).toBe(true)
  })

  it('disables the reset button and marks it busy while a reset is pending', async () => {
    const wrapper = mountCard({
      timer: timerView({ id: 1, name: 'Aquarium' }),
      now: T0,
      busy: true,
    })
    const button = wrapper.find('button[aria-label="Reset Aquarium"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    await button.trigger('click')
    expect(wrapper.emitted('reset')).toBeUndefined()
  })

  it('emits reset on click and menu on the menu button', async () => {
    const wrapper = mountCard({ timer: timerView({ id: 1, name: 'Aquarium' }), now: T0 })
    await wrapper.find('button[aria-label="Reset Aquarium"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
    await wrapper.find('button[aria-label="More options for Aquarium"]').trigger('click')
    expect(wrapper.emitted('menu')).toHaveLength(1)
  })
})
