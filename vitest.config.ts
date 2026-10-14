import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'virtual:pwa-register/vue': fileURLToPath(
        new URL('./tests/client/pwaRegisterStub.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/server/**/*.test.ts', 'tests/client/**/*.test.ts'],
  },
})
