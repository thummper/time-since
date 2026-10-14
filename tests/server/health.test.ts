import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.ts'

const SHELL = '<!doctype html><html><body><div id="app"></div></body></html>'
let clientDir: string

beforeAll(() => {
  clientDir = mkdtempSync(join(tmpdir(), 'time-since-client-'))
  writeFileSync(join(clientDir, 'index.html'), SHELL)
})

afterAll(() => {
  rmSync(clientDir, { recursive: true, force: true })
})

describe('app shell and health', () => {
  it('GET /api/health returns 200 { ok: true }', async () => {
    const app = createApp({ clientDir })
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('GET of a timer detail path returns the app shell with 200', async () => {
    const app = createApp({ clientDir })
    const res = await app.request('/timers/1')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(SHELL)
  })

  it('GET of an unknown /api path returns 404 JSON, not the shell', async () => {
    const app = createApp({ clientDir })
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.text()).not.toContain('<div id="app">')
  })
})
