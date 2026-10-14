import type { Db } from '../db/client.ts'
import { resets, timers } from '../db/schema.ts'
import { DAY_MS } from '../../shared/limits.ts'

interface SeedTimer {
  name: string
  targetDays: number | null
  /** Reset ages in days before now, oldest first. The first is the origin entry. */
  agesDays: number[]
  note?: string
}

const SEED: SeedTimer[] = [
  // Overdue: last reset 12 days ago against a 7 day target.
  {
    name: 'Aquarium cleaned',
    targetDays: 7,
    agesDays: [60, 47, 33, 19, 12],
    note: 'Filter rinsed',
  },
  { name: 'Bedsheets changed', targetDays: 14, agesDays: [45, 31, 17, 4] },
  { name: 'Car washed', targetDays: 30, agesDays: [75, 41, 9] },
  { name: 'Plants watered', targetDays: 3, agesDays: [10, 7, 4, 1.5] },
  { name: 'Dentist visit', targetDays: null, agesDays: [400, 210] },
  { name: 'Smoke alarm tested', targetDays: 90, agesDays: [120, 30] },
]

/** Seeds example timers with resets backdated relative to `now`. Call inside a transaction. */
export function seedDemoTimers(db: Pick<Db, 'insert'>, userId: number, now: number): void {
  for (const seed of SEED) {
    const times = seed.agesDays.map((d) => Math.round(now - d * DAY_MS))
    const timer = db
      .insert(timers)
      .values({
        userId,
        name: seed.name,
        targetMs: seed.targetDays === null ? null : seed.targetDays * DAY_MS,
        createdAt: times[0]!,
      })
      .returning()
      .get()
    times.forEach((at, i) => {
      db.insert(resets)
        .values({
          timerId: timer.id,
          at,
          isOrigin: i === 0,
          note: i === times.length - 1 && seed.note ? seed.note : null,
          createdAt: at,
        })
        .run()
    })
  }
}
