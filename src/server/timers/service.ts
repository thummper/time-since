import { and, asc, count, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { resets, timers, type Reset, type Timer } from '../db/schema.ts'
import { lastReset, stats } from '../../shared/stats.ts'
import type { ResetView, TimerView } from '../../shared/types.ts'

export function isOverdue(targetMs: number | null, last: { at: number }, now: number): boolean {
  return targetMs !== null && now > last.at + targetMs
}

export function toResetView(row: Reset): ResetView {
  return { id: row.id, at: row.at, note: row.note, isOrigin: row.isOrigin }
}

export function toTimerView(timer: Timer, entries: Reset[], now: number): TimerView {
  // A timer always has its origin entry, so the log is never empty.
  const last = lastReset(entries)!
  return {
    id: timer.id,
    name: timer.name,
    targetMs: timer.targetMs,
    createdAt: timer.createdAt,
    lastReset: { id: last.id, at: last.at },
    overdue: isOverdue(timer.targetMs, last, now),
    stats: stats(entries),
  }
}

export const getOwnedTimer = (db: Db, userId: number, id: number): Timer | undefined =>
  db
    .select()
    .from(timers)
    .where(and(eq(timers.id, id), eq(timers.userId, userId)))
    .get()

export const entriesOf = (db: Db, timerId: number): Reset[] =>
  db.select().from(resets).where(eq(resets.timerId, timerId)).all()

export function listTimers(db: Db, userId: number, now: number): TimerView[] {
  const rows = db
    .select()
    .from(timers)
    .where(eq(timers.userId, userId))
    .orderBy(asc(timers.id))
    .all()
  return rows.map((timer) => toTimerView(timer, entriesOf(db, timer.id), now))
}

export const timerCount = (db: Db, userId: number): number =>
  db.select({ n: count() }).from(timers).where(eq(timers.userId, userId)).get()!.n

export const resetCount = (db: Db, timerId: number): number =>
  db.select({ n: count() }).from(resets).where(eq(resets.timerId, timerId)).get()!.n

/** Creates the timer and its origin entry in one transaction. */
export function createTimer(
  db: Db,
  userId: number,
  name: string,
  targetMs: number | null,
  now: number,
): Timer {
  return db.transaction((tx) => {
    const timer = tx
      .insert(timers)
      .values({ userId, name, targetMs, createdAt: now })
      .returning()
      .get()
    tx.insert(resets).values({ timerId: timer.id, at: now, isOrigin: true, createdAt: now }).run()
    return timer
  })
}

export interface TimerChanges {
  name?: string
  targetMs?: number | null
}

/** KTD5: a target change that leaves the timer not overdue clears the alert column. */
export function updateTimer(db: Db, timer: Timer, changes: TimerChanges, now: number): Timer {
  const set: Partial<Timer> = { ...changes }
  if ('targetMs' in changes) {
    const last = lastReset(entriesOf(db, timer.id))!
    if (!isOverdue(changes.targetMs ?? null, last, now)) set.alertedForResetId = null
  }
  return db.update(timers).set(set).where(eq(timers.id, timer.id)).returning().get()
}

export const deleteTimer = (db: Db, timerId: number): void => {
  db.delete(timers).where(eq(timers.id, timerId)).run()
}

export const insertReset = (
  db: Db,
  timerId: number,
  at: number,
  note: string | null,
  now: number,
): Reset => db.insert(resets).values({ timerId, at, note, createdAt: now }).returning().get()

export const getReset = (db: Db, timerId: number, id: number): Reset | undefined =>
  db
    .select()
    .from(resets)
    .where(and(eq(resets.id, id), eq(resets.timerId, timerId)))
    .get()

export const logOf = (db: Db, timerId: number): Reset[] =>
  db
    .select()
    .from(resets)
    .where(eq(resets.timerId, timerId))
    .orderBy(desc(resets.at), desc(resets.id))
    .all()
