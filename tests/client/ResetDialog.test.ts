// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResetDialog from '../../src/client/components/ResetDialog.vue'
import { DAY, HOUR, T0 } from './helpers.ts'

const pad = (n: number) => String(n).padStart(2, '0')
/** The `datetime-local` value for an instant, in local time. */
const local = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('ResetDialog', () => {
  it('caps the date input at now', () => {
    const wrapper = mount(ResetDialog, { props: { timerName: 'Aquarium' } })
    expect(wrapper.find('input[type="datetime-local"]').attributes('max')).toBe(local(T0))
  })

  it('blocks a date and time later than now', async () => {
    const wrapper = mount(ResetDialog, { props: { timerName: 'Aquarium' } })
    await wrapper.find('input[type="datetime-local"]').setValue(local(T0 + 2 * HOUR))
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('future')
  })

  it('submits a past time and a note', async () => {
    const wrapper = mount(ResetDialog, { props: { timerName: 'Aquarium' } })
    const past = T0 - 2 * DAY
    await wrapper.find('input[type="datetime-local"]').setValue(local(past))
    await wrapper.find('textarea, input[name="note"]').setValue('Deep clean')
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted('submit')![0] as [{ at: number; note: string }]
    expect(payload.at).toBe(new Date(local(past)).getTime())
    expect(payload.note).toBe('Deep clean')
  })

  it('submits now by default', async () => {
    const wrapper = mount(ResetDialog, { props: { timerName: 'Aquarium' } })
    await wrapper.find('form').trigger('submit')
    const [payload] = wrapper.emitted('submit')![0] as [{ at: number; note: string | null }]
    expect(payload.at).toBeLessThanOrEqual(T0)
    expect(payload.at).toBeGreaterThan(T0 - 60_000)
    expect(payload.note).toBeNull()
  })
})
