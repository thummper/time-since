import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

// A fixed port keeps the config simple; E2E_PORT overrides it when 4173 is busy.
const port = Number(process.env.E2E_PORT ?? 4173)
const origin = `http://localhost:${port}`
const dataDir = mkdtempSync(join(tmpdir(), 'time-since-e2e-'))

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: origin },
  webServer: {
    command: 'npm run build && npm start',
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: join(dataDir, 'time-since.db'),
      BACKUP_DIR: join(dataDir, 'backups'),
      RATE_LIMIT_RELAXED: '1',
    },
  },
})
