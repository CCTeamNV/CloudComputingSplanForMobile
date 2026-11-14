import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The catalog files come without CORS headers (ADR 0013): locally, proxy them through the dev server.
  server: process.env.SPLAN_CATALOG_ORIGIN
    ? { proxy: { '/catalog': { target: process.env.SPLAN_CATALOG_ORIGIN, changeOrigin: true } } }
    : undefined,
})
