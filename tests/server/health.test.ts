import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
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

describe('static cache headers', () => {
  it('serves shell, worker, manifest with no-cache and hashed assets as immutable', async () => {
    mkdirSync(join(clientDir, 'assets'), { recursive: true })
    writeFileSync(join(clientDir, 'sw.js'), '//sw')
    writeFileSync(join(clientDir, 'manifest.webmanifest'), '{}')
    writeFileSync(join(clientDir, 'assets', 'index-abc123.js'), '//app')
    const app = createApp({ clientDir })
    for (const path of ['/', '/timers/1', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      const res = await app.request(path)
      expect(res.headers.get('cache-control'), path).toBe('no-cache')
    }
    const asset = await app.request('/assets/index-abc123.js')
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })
})

describe('static path traversal guard', () => {
  it('never serves a file outside clientDir', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'time-since-parent-'))
    try {
      const inner = join(parent, 'client')
      mkdirSync(inner)
      writeFileSync(join(inner, 'index.html'), SHELL)
      writeFileSync(join(parent, 'secret.txt'), 'TOP-SECRET')
      const app = createApp({ clientDir: inner })
      const paths = [
        '/../secret.txt',
        '/..%2fsecret.txt',
        '/%2e%2e/secret.txt',
        '/%2e%2e%2fsecret.txt',
        '/..%5csecret.txt',
        '/..\\secret.txt',
        '/assets/../../secret.txt',
        '/assets/..%2f..%2fsecret.txt',
        '/%2e%2e%5csecret.txt',
        '/%E0%A4%A',
      ]
      for (const path of paths) {
        const res = await app.request(path)
        const body = await res.text()
        expect(body, path).not.toContain('TOP-SECRET')
        expect(res.status, path).toBe(200)
        expect(body, path).toBe(SHELL)
      }
      writeFileSync(join(inner, 'ok.txt'), 'inside')
      expect(await (await app.request('/ok.txt')).text()).toBe('inside')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
})
