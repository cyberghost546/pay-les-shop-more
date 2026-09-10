/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { prerender } from './scripts/prerender.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Writes a real HTML file per public route after the build. See
    // scripts/prerender.js for what that fixes and what it does not.
    prerender(),
  ],
  // JSX without importing React first. The React plugin does this for the
  // app's own files; saying it here as well covers the test files, which are
  // transformed by esbuild alone and would otherwise fail on `React is not
  // defined` at the first tag in a test.
  esbuild: {
    jsx: 'automatic',
  },
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
  // Vitest reads this file, so the tests get the same React plugin, aliases
  // and asset handling as the build. A separate vitest.config.js would be a
  // second copy of that to keep in step.
  test: {
    // The components under test touch document, localStorage and fetch.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Only our own tests. Without this the default pattern also walks
    // node_modules once anything in there ships a .test.js.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
    // Twenty seconds, not the default five. These tests render real
    // components, wait on debounced requests and drive them through
    // userEvent, which types one character at a time — and they run in
    // parallel workers. On a machine doing anything else, five seconds is
    // reached by a test that would have passed, and the failure says
    // "timed out" rather than what was actually missing. It has to stay
    // comfortably above asyncUtilTimeout in src/test/setup.js: when a query
    // gives up first, the error names the element it could not find.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The interesting numbers are for logic, not for the route table or
      // the entry point.
      exclude: ['src/main.jsx', 'src/test/**', 'src/data/**', '**/*.config.js'],
    },
  },
})
