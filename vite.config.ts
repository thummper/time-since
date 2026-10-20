import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiPort = process.env.PORT ?? '3456'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/client',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Time Since',
        short_name: 'Time Since',
        description: 'See how long it has been since each recurring chore.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#f3f1fa',
        theme_color: '#f3f1fa',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
    }),
  ],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
})
