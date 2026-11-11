import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { xaiAnalyzePlugin } from './scripts/xaiAnalyzePlugin.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      xaiAnalyzePlugin(env.XAI_API_KEY, env.XAI_MODEL),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png', 'app-icon.svg', 'rider.svg'],
        manifest: {
          name: 'EventSync',
          short_name: 'EventSync',
          description: 'Live race timing and results',
          theme_color: '#111111',
          background_color: '#111111',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  }
})
