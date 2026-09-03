import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forwards /api to Django in development. Going through the proxy means
      // the browser sees one origin, so the session and CSRF cookies are
      // first-party — no CORS preflight, no SameSite surprises.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
