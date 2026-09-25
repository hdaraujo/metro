/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const DESCRIPTION =
  'Coimbra Metrobus on a map: where you are, your nearest stop and the nearest bus, estimated from the timetable until live positions are available.';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Metro — Coimbra Metrobus',
        short_name: 'Metro',
        description: DESCRIPTION,
        theme_color: '#ffffff',
        background_color: '#f1f0eb',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://planearviagem.metromondego.pt' &&
              url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'metrobus-timetable',
              expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    // MapLibre GL alone is about 1 MB minified; the app is one screen, so it is not split.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
