import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3000,
    host: true
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'tesseract/**/*'],
      manifest: {
        name: 'Card Scanner - Business Card AI & Offline Reader',
        short_name: 'Card Scanner',
        description: 'Scan business cards with Gemini AI or offline OCR and sync to Google Sheets',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // 25MB for tesseract assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz,traineddata}']
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
