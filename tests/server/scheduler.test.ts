import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOverdueInterval } from '../../src/server/jobs/scheduler.ts'
import { openDb } from '../../src/server/db/client.ts'

afterEach(() => vi.useRealTimers())

describe('overdue scheduler', () => {
  it('skips a tick while the previous run is still going', async () => {
    vi.useFakeTimers()
    const db = openDb(':memory:')
    let release: () => void = () => {}
    let runs = 0
    const stop = startOverdueInterval({
      db,
      sender: { send: async () => 201 },
      intervalMs: 1000,
      now: () => 0,
      run: () => {
        runs++
        return new Promise<void>((resolve) => (release = resolve))
      },
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(runs).toBe(1)
    release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(2)
    stop()
    db.$client.close()
  })
})
