import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const apiPort = process.env.PORT ?? '3000'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
})
