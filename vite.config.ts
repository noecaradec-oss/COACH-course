import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Chemins relatifs : l'appli peut être hébergée dans un sous-dossier.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icone-180.png'],
      manifest: {
        name: 'Coach Course',
        short_name: 'Coach Course',
        description: 'Coaching course à pied : profil, plan, séances et suivi, sans compte.',
        lang: 'fr',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        theme_color: '#0f5132',
        background_color: '#f6f5f0',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
