import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/client.ts'

export const BACKUP_KEEP = 14
const FILE_PATTERN = /^time-since-\d{8}-\d{6}\.db$/

export interface BackupOptions {
  db: Db
  dir: string
  now?: () => number
  keep?: number
}

function stamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-')
}

/**
 * KTD14: writes a consistent copy of the database with VACUUM INTO, then keeps
 * only the newest `keep` backup files. Returns the new file path.
 */
export function runBackup({ db, dir, now = Date.now, keep = BACKUP_KEEP }: BackupOptions): string {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `time-since-${stamp(now())}.db`)
  db.$client.prepare('VACUUM INTO ?').run(target)
  const files = readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .sort()
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    unlinkSync(join(dir, name))
  }
  return target
}
