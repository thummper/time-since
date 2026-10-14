import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { openDb, type Db } from '../../src/server/db/client.ts'
import { pushSubscriptions, resets, timers, users } from '../../src/server/db/schema.ts'
import { runOverdueCheck } from '../../src/server/push/overdueJob.ts'
import type { PushPayload, PushSender } from '../../src/server/push/sender.ts'
import { createTimer, updateTimer } from '../../src/server/timers/service.ts'
import { DAY, HOUR, T0 } from './timersHelpers.ts'

let db: Db
afterEach(() => db?.$client.close())

/** A sender that records sends and answers with a status per endpoint (default 201). */
function fakeSender(statuses: Record<string, number | null> = {}) {
  const sent: { endpoint: string; payload: PushPayload }[] = []
  const sender: PushSender = {
    send: async (sub, payload) => {
      sent.push({ endpoint: sub.endpoint, payload })
      return sub.endpoint in statuses ? statuses[sub.endpoint]! : 201
    },
  }
  return { sender, sent, statuses }
}

function setup() {
  db = openDb(':memory:')
  const addUser = (email: string, isDemo = false) =>
    db.insert(users).values({ email, passwordHash: null, isDemo, createdAt: T0 }).returning().get()
  const addSub = (userId: number, endpoint: string) =>
    db
      .insert(pushSubscriptions)
      .values({ endpoint, userId, p256dh: 'p', auth: 'a', createdAt: T0 })
      .run()
  const addTimer = (userId: number, targetMs: number | null = 14 * DAY, name = 'Oil change') =>
    createTimer(db, userId, name, targetMs, T0)
  const lastResetId = (timerId: number) =>
    db.select().from(resets).where(eq(resets.timerId, timerId)).all().at(-1)!.id
  const alerted = (timerId: number) =>
    db.select().from(timers).where(eq(timers.id, timerId)).get()!.alertedForResetId
  const endpoints = () =>
    db
      .select()
      .from(pushSubscriptions)
      .all()
      .map((s) => s.endpoint)
  const reset = (timerId: number, at: number) =>
    db.insert(resets).values({ timerId, at, createdAt: at }).returning().get()
  return { addUser, addSub, addTimer, lastResetId, alerted, endpoints, reset }
}

const PAST_TARGET = T0 + 14 * DAY + 1

describe('overdue job', () => {
  it('Covers AE4. Sends once when a timer passes its target, then nothing on the next run', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const { sender, sent } = fakeSender()

    await runOverdueCheck({ db, sender, now: T0 + 14 * DAY }) // exactly at target: not overdue
    expect(sent).toHaveLength(0)

    await runOverdueCheck({ db, sender, now: PAST_TARGET })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.payload).toMatchObject({
      title: 'Oil change',
      body: expect.stringContaining('14d 0h'),
      url: `/timers/${timer.id}`,
    })
    expect(s.alerted(timer.id)).toBe(s.lastResetId(timer.id))

    await runOverdueCheck({ db, sender, now: PAST_TARGET + DAY })
    expect(sent).toHaveLength(1)
  })

  it('Covers AE6. A reset then an undo leave the timer overdue and send nothing', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const { sender, sent } = fakeSender()
    await runOverdueCheck({ db, sender, now: PAST_TARGET })
    expect(sent).toHaveLength(1)

    const extra = s.reset(timer.id, PAST_TARGET + HOUR)
    db.delete(resets).where(eq(resets.id, extra.id)).run() // Undo

    await runOverdueCheck({ db, sender, now: PAST_TARGET + 2 * HOUR })
    expect(sent).toHaveLength(1)
  })

  it('Covers AE4. A reset after an alert, then overdue again, sends a new alert', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const { sender, sent } = fakeSender()
    await runOverdueCheck({ db, sender, now: PAST_TARGET })

    const at = PAST_TARGET + HOUR
    s.reset(timer.id, at)
    await runOverdueCheck({ db, sender, now: at + 14 * DAY }) // not yet overdue again
    expect(sent).toHaveLength(1)
    await runOverdueCheck({ db, sender, now: at + 14 * DAY + 1 })
    expect(sent).toHaveLength(2)
  })

  it('Covers AE4. Sends to every subscription of the owner', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    const other = s.addUser('b@example.com')
    s.addSub(user.id, 'e1')
    s.addSub(user.id, 'e2')
    s.addSub(other.id, 'e-other')
    s.addTimer(user.id)
    const { sender, sent } = fakeSender()
    await runOverdueCheck({ db, sender, now: PAST_TARGET })
    expect(sent.map((x) => x.endpoint).sort()).toEqual(['e1', 'e2'])
  })

  it('deletes the subscription on 410 and keeps it on 401', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'gone')
    s.addSub(user.id, 'unauthorized')
    const timer = s.addTimer(user.id)
    const { sender } = fakeSender({ gone: 410, unauthorized: 401 })
    await runOverdueCheck({ db, sender, now: PAST_TARGET })
    expect(s.endpoints()).toEqual(['unauthorized'])
    expect(s.alerted(timer.id)).toBe(s.lastResetId(timer.id)) // all permanent
  })

  it('deletes the subscription on 404', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'gone')
    s.addTimer(user.id)
    await runOverdueCheck({ db, sender: fakeSender({ gone: 404 }).sender, now: PAST_TARGET })
    expect(s.endpoints()).toEqual([])
  })

  it('Covers AE4. A 503 leaves the alert unsent and the next run retries', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const f = fakeSender({ e1: 503 })
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(s.alerted(timer.id)).toBeNull()
    expect(s.endpoints()).toEqual(['e1'])

    f.statuses.e1 = 201
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET + 60_000 })
    expect(f.sent).toHaveLength(2)
    expect(s.alerted(timer.id)).toBe(s.lastResetId(timer.id))
  })

  it('treats a network error and a 429 as temporary', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'net')
    s.addSub(user.id, 'slow')
    const timer = s.addTimer(user.id)
    const f = fakeSender({ net: null, slow: 429 })
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(s.alerted(timer.id)).toBeNull()
  })

  it('Covers AE4. With a 201 and a 503 it sends once, and the next run sends nothing', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'ok')
    s.addSub(user.id, 'flaky')
    s.addTimer(user.id)
    const f = fakeSender({ ok: 201, flaky: 503 })
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(f.sent).toHaveLength(2)
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET + 60_000 })
    expect(f.sent).toHaveLength(2)
  })

  it('Covers AE4. Raising the target clears the marker; passing the new target alerts once more', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const f = fakeSender()
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(f.sent).toHaveLength(1)

    const now = PAST_TARGET + HOUR
    const row = db.select().from(timers).where(eq(timers.id, timer.id)).get()!
    updateTimer(db, row, { targetMs: 30 * DAY }, now)
    expect(s.alerted(timer.id)).toBeNull()

    await runOverdueCheck({ db, sender: f.sender, now })
    expect(f.sent).toHaveLength(1)
    await runOverdueCheck({ db, sender: f.sender, now: T0 + 30 * DAY + 1 })
    expect(f.sent).toHaveLength(2)
  })

  it('marks a timer alerted after 6 hours of temporary failures and stops retrying', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    const timer = s.addTimer(user.id)
    const f = fakeSender({ e1: 503 })
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET + 5 * HOUR })
    expect(s.alerted(timer.id)).toBeNull()
    await runOverdueCheck({ db, sender: f.sender, now: T0 + 14 * DAY + 6 * HOUR + 1 })
    expect(s.alerted(timer.id)).toBe(s.lastResetId(timer.id))
    const before = f.sent.length
    await runOverdueCheck({ db, sender: f.sender, now: T0 + 14 * DAY + 7 * HOUR })
    expect(f.sent).toHaveLength(before)
  })

  it('Covers AE4. An owner with no subscription still gets the marker set, so no late flood', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    const timer = s.addTimer(user.id)
    const f = fakeSender()
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(s.alerted(timer.id)).toBe(s.lastResetId(timer.id))
    s.addSub(user.id, 'late')
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET + DAY })
    expect(f.sent).toHaveLength(0)
  })

  it('never sends for a timer with no target', async () => {
    const s = setup()
    const user = s.addUser('a@example.com')
    s.addSub(user.id, 'e1')
    s.addTimer(user.id, null)
    const f = fakeSender()
    await runOverdueCheck({ db, sender: f.sender, now: T0 + 1000 * DAY })
    expect(f.sent).toHaveLength(0)
  })

  it('never sends for a demo user', async () => {
    const s = setup()
    const demo = s.addUser('demo@demo.invalid', true)
    s.addSub(demo.id, 'e1')
    const timer = s.addTimer(demo.id)
    const f = fakeSender()
    await runOverdueCheck({ db, sender: f.sender, now: PAST_TARGET })
    expect(f.sent).toHaveLength(0)
    expect(s.alerted(timer.id)).toBeNull()
  })
})
