import { describe, expect, it } from 'vitest'
import { formatElapsed } from '../../src/shared/format.ts'

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
