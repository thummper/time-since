// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimerForm from '../../src/client/components/TimerForm.vue'
import { DAY, HOUR } from './helpers.ts'

const submitWith = async (name: string, amount: string, unit: string) => {
  const wrapper = mount(TimerForm)
  await wrapper.find('input[name="name"]').setValue(name)
  await wrapper.find('input[name="amount"]').setValue(amount)
  await wrapper.find('select[name="unit"]').setValue(unit)
  await wrapper.find('form').trigger('submit')
  return wrapper
}

describe('TimerForm', () => {
  it('converts 3 days to a target in milliseconds', async () => {
    const wrapper = await submitWith('Aquarium', '3', 'days')
    expect(wrapper.emitted('submit')![0]).toEqual([{ name: 'Aquarium', targetMs: 3 * DAY }])
  })

  it('converts hours', async () => {
    const wrapper = await submitWith('Filter', '6', 'hours')
    expect(wrapper.emitted('submit')![0]).toEqual([{ name: 'Filter', targetMs: 6 * HOUR }])
  })

  it('sends a null target when the amount is blank', async () => {
    const wrapper = await submitWith('Plants', '', 'days')
    expect(wrapper.emitted('submit')![0]).toEqual([{ name: 'Plants', targetMs: null }])
  })

  it('rejects an empty name and an out-of-range target', async () => {
    const empty = await submitWith('  ', '', 'days')
    expect(empty.emitted('submit')).toBeUndefined()
    expect(empty.find('[role="alert"]').text()).toContain('Name')
    const tooLong = await submitWith('Plants', '400', 'days')
    expect(tooLong.emitted('submit')).toBeUndefined()
    expect(tooLong.find('[role="alert"]').text()).toContain('1 hour and 365 days')
  })

  it('shows an existing target in whole days', () => {
    const wrapper = mount(TimerForm, { props: { initial: { name: 'X', targetMs: 14 * DAY } } })
    expect((wrapper.find('input[name="amount"]').element as HTMLInputElement).value).toBe('14')
    expect((wrapper.find('select[name="unit"]').element as HTMLSelectElement).value).toBe('days')
  })
})
