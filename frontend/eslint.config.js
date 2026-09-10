import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Everything that runs in Node rather than in a browser: the Vite config,
    // the build-time scripts, and the tests that read files off disk. Without
    // this, `process` and `console` here read as undefined globals.
    files: [
      '*.config.js',
      'scripts/**/*.js',
      'src/test/**/*.{js,jsx}',
      'src/**/*.test.{js,jsx}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Written by `npm run images`, and formatted by the generator rather than
    // by anything a linter should have an opinion about.
    ignores: ['src/images/optimized/photos.js'],
  },
])
