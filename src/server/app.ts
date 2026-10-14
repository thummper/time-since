import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { Hono } from 'hono'

export interface AppOptions {
  /** Directory holding the built client. */
  clientDir?: string
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    if (!(await stat(path)).isFile()) return null
    return await readFile(path)
  } catch {
    return null
  }
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return ''
  }
}

export function createApp(options: AppOptions = {}): Hono {
  const clientDir = resolve(options.clientDir ?? join(process.cwd(), 'dist', 'client'))
  const app = new Hono()

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  app.get('*', async (c) => {
    const relative = normalize(safeDecode(c.req.path)).replace(/^[/\\]+/, '')
    const candidate = resolve(clientDir, relative)
    if (relative && (candidate === clientDir || candidate.startsWith(clientDir + sep))) {
      const file = await readFileIfExists(candidate)
      if (file) {
        const type = MIME[extname(candidate)] ?? 'application/octet-stream'
        return new Response(new Uint8Array(file), { headers: { 'content-type': type } })
      }
    }
    const shell = await readFileIfExists(join(clientDir, 'index.html'))
    if (!shell) return c.text('Client build not found', 404)
    return c.html(shell.toString('utf-8'))
  })

  return app
}
