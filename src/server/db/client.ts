import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.ts'

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

// This file sits at <root>/src/server/db or <root>/dist/server/db, so the app
// root is three levels up in both layouts. The SQL files live under src only.
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const MIGRATIONS_FOLDER = resolve(APP_ROOT, 'src', 'server', 'db', 'migrations')

/** Opens a SQLite file (or ':memory:'), sets pragmas, and applies migrations. */
export function openDb(path: string): Db {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}
