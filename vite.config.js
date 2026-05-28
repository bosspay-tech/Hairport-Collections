import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Forward all /api/ requests from the Vite dev server to the bridge (port 3000).
      // In production the bridge serves the React build directly — no proxy needed.
      '/api': 'http://localhost:3000',
    },
  },
})
