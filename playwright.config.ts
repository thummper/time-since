import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
  },
})
