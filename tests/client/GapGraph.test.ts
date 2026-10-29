// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GapGraph from '../../src/client/components/GapGraph.vue'
import type { Goal } from '../../src/shared/gaps.ts'
import type { ResetView } from '../../src/shared/types.ts'
import { DAY, T0 } from './helpers.ts'

/** An origin entry, then one reset per gap length (in days), ending `endDaysAgo` before T0. */
function log(gapDays: number[], endDaysAgo = 1): ResetView[] {
  const total = gapDays.reduce((sum, d) => sum + d, 0)
  let at = T0 - (endDaysAgo + total) * DAY
  const entries: ResetView[] = [{ id: 1, at, note: null, isOrigin: true }]
  gapDays.forEach((d, i) => {
    at += d * DAY
    entries.push({ id: i + 2, at, note: null, isOrigin: false })
  })
  return entries
}

const mountGraph = (entries: ResetView[], goal: Goal | null = null) =>
  mount(GapGraph, { props: { entries, now: T0, goal } })

const gapBars = (wrapper: ReturnType<typeof mountGraph>) =>
  wrapper.findAll('[data-testid="gap-bar"]')

describe('GapGraph', () => {
  it('renders one bar per finished gap plus the current run', () => {
    const wrapper = mountGraph(log([3, 5, 4]))
    expect(gapBars(wrapper)).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="current-bar"]')).toHaveLength(1)
  })

  it('Covers AE5. sizes slots so only 31 fit the box, leaving older gaps off screen', () => {
    const wrapper = mountGraph(log(Array.from({ length: 45 }, () => 2)))
    expect(gapBars(wrapper)).toHaveLength(45)
    const track = wrapper.find('[data-testid="gap-track"]')
    // 46 slots at one thirty-first of the box each: the track is 46/31 of the box,
    // and each slot is 1/46 of the track, so the slots fill it exactly with no overflow.
    expect(track.attributes('style')).toContain(`width: ${(46 / 31) * 100}%`)
    const slot = gapBars(wrapper)[0]!
    expect(slot.attributes('style')).toContain(`width: ${100 / 46}%`)
  })

  it('right-aligns a short series at one thirty-first of the box per slot', () => {
    const wrapper = mountGraph(log([3, 5, 4]))
    expect(wrapper.find('[data-testid="gap-track"]').attributes('style')).toContain('width: 100%')
    const slot = gapBars(wrapper)[0]!
    expect(slot.attributes('style')).toContain(`width: ${100 / 31}%`)
  })

  it('Covers AE6. shows dates, length, and note for a tapped gap', async () => {
    const entries = log([3, 5])
    entries[2]!.note = 'work trip'
    const wrapper = mountGraph(entries)
    await gapBars(wrapper)[1]!.trigger('click')
    const details = wrapper.find('[data-testid="gap-details"]')
    expect(details.text()).toContain('5d 0h')
    expect(details.text()).toContain('work trip')
    expect(details.findAll('time')).toHaveLength(2)
  })

  it('shows the start and length so far for the current run, with no end date', async () => {
    const wrapper = mountGraph(log([3], 2))
    await wrapper.find('[data-testid="current-bar"]').trigger('click')
    const details = wrapper.find('[data-testid="gap-details"]')
    expect(details.text()).toContain('2d 0h so far')
    expect(details.findAll('time')).toHaveLength(1)
  })

  it('closes the details on a second tap of the same bar', async () => {
    const wrapper = mountGraph(log([3, 5]))
    await gapBars(wrapper)[0]!.trigger('click')
    expect(gapBars(wrapper)[0]!.attributes('aria-pressed')).toBe('true')
    await gapBars(wrapper)[0]!.trigger('click')
    expect(wrapper.find('[data-testid="gap-details"]').exists()).toBe(false)
  })

  it('Covers AE4. shows only the current run and a fill-in message without gaps', () => {
    const wrapper = mountGraph(log([]))
    expect(gapBars(wrapper)).toHaveLength(0)
    expect(wrapper.find('[data-testid="current-bar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('fills in after the first reset')
  })

  it('labels the goal line with its kind and hides it without a goal', () => {
    const withGoal = mountGraph(log([3, 5]), { kind: 'average', ms: 4 * DAY })
    expect(withGoal.find('[data-testid="goal-line"]').text()).toContain('average')
    expect(
      mountGraph(log([3, 5]))
        .find('[data-testid="goal-line"]')
        .exists(),
    ).toBe(false)
  })

  it('gives each bar an accessible name with its length', () => {
    const wrapper = mountGraph(log([3]))
    expect(gapBars(wrapper)[0]!.attributes('aria-label')).toContain('3d 0h')
  })

  it('keeps a zero-length gap visible and tappable', async () => {
    const wrapper = mountGraph(log([3, 0]))
    const bar = gapBars(wrapper)[1]!
    expect(bar.find('[data-testid="bar-fill"]').attributes('style')).toContain('min-height: 2px')
    await bar.trigger('click')
    expect(wrapper.find('[data-testid="gap-details"]').text()).toContain('0h 0m')
  })

  it('uses native buttons, so Enter and Space open the details', () => {
    const wrapper = mountGraph(log([3]))
    expect(gapBars(wrapper)[0]!.element.tagName).toBe('BUTTON')
    expect(wrapper.find('[data-testid="current-bar"]').element.tagName).toBe('BUTTON')
  })

  it('closes the details when the selected gap leaves the log', async () => {
    const entries = log([3, 5])
    const wrapper = mountGraph(entries)
    await gapBars(wrapper)[1]!.trigger('click')
    await wrapper.setProps({ entries: entries.slice(0, 2) })
    expect(wrapper.find('[data-testid="gap-details"]').exists()).toBe(false)
  })
})
