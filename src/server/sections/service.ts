import { and, asc, count, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { sections, type Section } from '../db/schema.ts'
import type { SectionView } from '../../shared/types.ts'

/** KTD3: like `MAX_TIMERS`, a cap on custom sections for each user. */
export const MAX_SECTIONS = 20

export const toSectionView = (row: Section): SectionView => ({ id: row.id, name: row.name })

export const listSections = (db: Db, userId: number): Section[] =>
  db
    .select()
    .from(sections)
    .where(eq(sections.userId, userId))
    .orderBy(asc(sections.id))
    .all()

export const sectionCount = (db: Db, userId: number): number =>
  db.select({ n: count() }).from(sections).where(eq(sections.userId, userId)).get()!.n

export const getOwnedSection = (db: Db, userId: number, id: number): Section | undefined =>
  db
    .select()
    .from(sections)
    .where(and(eq(sections.id, id), eq(sections.userId, userId)))
    .get()

/** KTD3: names are unique for each user, ignoring letter case. A section never clashes with itself. */
export function nameTaken(db: Db, userId: number, name: string, exceptId?: number): boolean {
  const wanted = name.toLocaleLowerCase()
  return listSections(db, userId).some(
    (s) => s.id !== exceptId && s.name.toLocaleLowerCase() === wanted,
  )
}

export const createSection = (db: Db, userId: number, name: string, now: number): Section =>
  db.insert(sections).values({ userId, name, createdAt: now }).returning().get()

export const renameSection = (db: Db, id: number, name: string): Section =>
  db.update(sections).set({ name }).where(eq(sections.id, id)).returning().get()

/** The foreign key sets the section's timers back to automatic placement (R6). */
export const deleteSection = (db: Db, id: number): void => {
  db.delete(sections).where(eq(sections.id, id)).run()
}
