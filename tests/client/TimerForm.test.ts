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
    expect(wrapper.emitted('submit')![0]).toEqual([
      { name: 'Aquarium', targetMs: 3 * DAY, placement: { kind: 'auto' } },
    ])
  })

  it('converts hours', async () => {
    const wrapper = await submitWith('Filter', '6', 'hours')
    expect(wrapper.emitted('submit')![0]).toEqual([
      { name: 'Filter', targetMs: 6 * HOUR, placement: { kind: 'auto' } },
    ])
  })

  it('sends a null target when the amount is blank', async () => {
    const wrapper = await submitWith('Plants', '', 'days')
    expect(wrapper.emitted('submit')![0]).toEqual([
      { name: 'Plants', targetMs: null, placement: { kind: 'auto' } },
    ])
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

  it('sends a past start time when the start field is shown', async () => {
    const wrapper = mount(TimerForm, { props: { withStart: true } })
    await wrapper.find('input[name="name"]').setValue('Aquarium')
    await wrapper.find('input[name="started"]').setValue('2020-01-02T03:04')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        name: 'Aquarium',
        targetMs: null,
        startedAt: new Date('2020-01-02T03:04').getTime(),
        placement: { kind: 'auto' },
      },
    ])
  })

  it('rejects a start time in the future', async () => {
    const wrapper = mount(TimerForm, { props: { withStart: true } })
    await wrapper.find('input[name="name"]').setValue('Aquarium')
    await wrapper.find('input[name="started"]').setValue('2999-01-01T00:00')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('future')
  })

  it('hides the start field by default', () => {
    expect(mount(TimerForm).find('input[name="started"]').exists()).toBe(false)
  })

  describe('section picker', () => {
    const sections = [
      { id: 8, name: 'Car' },
      { id: 7, name: 'house' },
    ]
    const submit = async (wrapper: ReturnType<typeof mount>) => {
      await wrapper.find('input[name="name"]').setValue('Plants')
      await wrapper.find('form').trigger('submit')
    }

    it('defaults to Automatic for a new timer', () => {
      const wrapper = mount(TimerForm, { props: { sections } })
      expect((wrapper.find('select[name="section"]').element as HTMLSelectElement).value).toBe(
        'auto',
      )
    })

    it('lists the custom sections A to Z after the cadences', () => {
      const wrapper = mount(TimerForm, { props: { sections } })
      expect(wrapper.findAll('select[name="section"] option').map((o) => o.text())).toEqual([
        'Automatic (from target)',
        'Daily',
        'Weekly',
        'Monthly+',
        'Other',
        'Car',
        'house',
        'New section…',
      ])
    })

    it('preselects the current placement when editing', () => {
      const wrapper = mount(TimerForm, {
        props: {
          sections,
          initial: { name: 'X', targetMs: null, placement: { kind: 'custom', sectionId: 7 } },
        },
      })
      expect((wrapper.find('select[name="section"]').element as HTMLSelectElement).value).toBe(
        'custom:7',
      )
    })

    it('sends a cadence placement', async () => {
      const wrapper = mount(TimerForm, { props: { sections } })
      await wrapper.find('select[name="section"]').setValue('cadence:weekly')
      await submit(wrapper)
      expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
        placement: { kind: 'cadence', cadence: 'weekly' },
      })
    })

    it('sends a custom placement by id', async () => {
      const wrapper = mount(TimerForm, { props: { sections } })
      await wrapper.find('select[name="section"]').setValue('custom:8')
      await submit(wrapper)
      expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
        placement: { kind: 'custom', sectionId: 8 },
      })
    })

    it('asks for a name for a new section and sends it', async () => {
      const wrapper = mount(TimerForm, { props: { sections } })
      expect(wrapper.find('input[name="newSection"]').exists()).toBe(false)
      await wrapper.find('select[name="section"]').setValue('new')
      await submit(wrapper)
      expect(wrapper.emitted('submit')).toBeUndefined()
      expect(wrapper.find('[role="alert"]').text()).toContain('Section name')
      await wrapper.find('input[name="newSection"]').setValue('  Garden ')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ newSection: 'Garden' })
    })
  })
})
