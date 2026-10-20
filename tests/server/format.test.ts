import { describe, expect, it } from 'vitest'
import { elapsedParts, formatElapsed } from '../../src/shared/format.ts'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatElapsed', () => {
  it('formats zero as 0h 0m', () => {
    expect(formatElapsed(0)).toBe('0h 0m')
  })
  it('formats just below one day as hours and minutes', () => {
    expect(formatElapsed(DAY - MIN)).toBe('23h 59m')
  })
  it('formats exactly one day as 1d 0h', () => {
    expect(formatElapsed(DAY)).toBe('1d 0h')
  })
  it('formats a long gap as days and hours', () => {
    expect(formatElapsed(45 * DAY + 3 * HOUR + 20 * MIN)).toBe('45d 3h')
  })
  it('clamps negative input to zero', () => {
    expect(formatElapsed(-5 * MIN)).toBe('0h 0m')
  })
})

const flat = (ms: number) =>
  elapsedParts(ms)
    .map((p) => p.value + p.unit)
    .join(' ')

describe('elapsedParts', () => {
  it('shows padded hours, minutes and seconds below one day', () => {
    expect(flat(3 * HOUR + 4 * MIN + 5000)).toBe('03h 04m 05s')
  })
  it('adds an unpadded day group from one day up', () => {
    expect(flat(142 * DAY + 9 * HOUR + 59_999)).toBe('142d 09h 00m 59s')
  })
  it('clamps negative input to zero', () => {
    expect(flat(-5 * MIN)).toBe('00h 00m 00s')
  })
})
