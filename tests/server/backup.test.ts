import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb } from '../../src/server/db/client.ts'
import { users } from '../../src/server/db/schema.ts'
import { runBackup } from '../../src/server/jobs/backup.ts'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ts-backup-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('backup job', () => {
  it('writes a readable SQLite file with the data in it', () => {
    const dir = tempDir()
    const db = openDb(join(dir, 'live.db'))
    db.insert(users).values({ email: 'a@example.com', passwordHash: 'x', createdAt: 1 }).run()
    const file = runBackup({
      db,
      dir: join(dir, 'backups'),
      now: () => Date.UTC(2026, 9, 14, 2, 30),
    })
    expect(file.endsWith('time-since-20261014-023000.db')).toBe(true)
    const copy = new Database(file, { readonly: true })
    expect(copy.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 1 })
    copy.close()
    db.$client.close()
  })

  it('deletes the oldest file when 15 exist', () => {
    const dir = tempDir()
    const backups = join(dir, 'backups')
    const db = openDb(':memory:')
    runBackup({ db, dir: backups, now: () => Date.UTC(2026, 0, 1) })
    for (let day = 2; day <= 14; day++) {
      writeFileSync(
        join(backups, `time-since-202601${String(day).padStart(2, '0')}-023000.db`),
        'x',
      )
    }
    expect(readdirSync(backups)).toHaveLength(14)
    runBackup({ db, dir: backups, now: () => Date.UTC(2026, 0, 15, 2, 30) })
    const left = readdirSync(backups).sort()
    expect(left).toHaveLength(14)
    expect(left[0]).toBe('time-since-20260102-023000.db')
    expect(left.at(-1)).toBe('time-since-20260115-023000.db')
  })
})
